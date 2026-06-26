import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, rename, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const POSTER_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

function maxPosterBytes() {
  const configured = Number(process.env.MOVIE_POSTER_MAX_BYTES ?? 5 * 1024 * 1024);
  return Number.isFinite(configured) && configured > 0 ? configured : 5 * 1024 * 1024;
}

function uploadRoot() {
  return path.join(process.cwd(), 'public', 'uploads', 'movie-posters');
}

function publicPrefix() {
  return `/${(process.env.MOVIE_POSTER_PUBLIC_PREFIX ?? 'uploads/movie-posters').replace(/^\/+|\/+$/g, '')}`;
}

export type StoredPoster = {
  path: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

export class PosterStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PosterStorageError';
  }
}

function storageProvider() {
  const configured = process.env.MOVIE_POSTER_STORAGE?.trim().toLowerCase();
  if (configured === 's3' || configured === 'local') return configured;
  if (process.env.MOVIE_POSTER_S3_BUCKET?.trim()) return 's3';
  return 'local';
}

function s3Config() {
  const bucket = process.env.MOVIE_POSTER_S3_BUCKET?.trim();
  const region = process.env.MOVIE_POSTER_S3_REGION?.trim() || process.env.AWS_REGION?.trim() || 'ap-south-1';
  const endpoint = process.env.MOVIE_POSTER_S3_ENDPOINT?.trim();
  const forcePathStyle = String(process.env.MOVIE_POSTER_S3_FORCE_PATH_STYLE ?? '').toLowerCase() === 'true';
  const publicBaseUrl = process.env.MOVIE_POSTER_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, '');
  const prefix = (process.env.MOVIE_POSTER_S3_PREFIX?.trim() || 'movie-posters').replace(/^\/+|\/+$/g, '');
  if (!bucket) throw new PosterStorageError('Movie poster object storage is not configured. Set MOVIE_POSTER_S3_BUCKET in Vercel.');
  return { bucket, region, endpoint, forcePathStyle, publicBaseUrl, prefix };
}

function s3Client(config: ReturnType<typeof s3Config>) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle
  });
}

function s3PublicUrl(config: ReturnType<typeof s3Config>, key: string) {
  if (config.publicBaseUrl) return `${config.publicBaseUrl}/${key}`;
  if (config.endpoint) return `${config.endpoint.replace(/\/$/, '')}/${config.bucket}/${key}`;
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

export async function storeMoviePoster(file: File | null | undefined): Promise<StoredPoster | null> {
  if (!file || file.size === 0) return null;

  const extension = POSTER_MIME_EXTENSIONS[file.type];
  if (!extension) {
    throw new Error('Poster must be a JPEG, PNG, or WebP image.');
  }

  const originalExtension = path.extname(file.name || '').toLowerCase();
  if (originalExtension && !Object.values(POSTER_MIME_EXTENSIONS).includes(originalExtension) && originalExtension !== '.jpeg') {
    throw new Error('Poster file extension is not supported.');
  }

  const sizeBytes = file.size;
  if (sizeBytes > maxPosterBytes()) {
    throw new Error(`Poster is too large. Maximum size is ${Math.round(maxPosterBytes() / 1024 / 1024)} MB.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileName = `${randomUUID()}${extension}`;

  if (storageProvider() === 's3') {
    const config = s3Config();
    const key = `${config.prefix}/${fileName}`;
    await s3Client(config).send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: bytes,
      ContentType: file.type,
      CacheControl: 'public, max-age=31536000, immutable'
    }));
    return {
      path: s3PublicUrl(config, key),
      fileName: key,
      contentType: file.type,
      sizeBytes
    };
  }

  if (process.env.VERCEL) {
    throw new PosterStorageError('Movie poster uploads on Vercel need object storage. Set MOVIE_POSTER_STORAGE=s3 and MOVIE_POSTER_S3_BUCKET.');
  }

  const root = uploadRoot();
  const finalPath = path.resolve(root, fileName);
  if (!finalPath.startsWith(root + path.sep)) throw new Error('Unsafe poster storage path.');

  await mkdir(root, { recursive: true });
  await writeFile(finalPath, bytes, { flag: 'wx' });

  return {
    path: `${publicPrefix()}/${fileName}`,
    fileName,
    contentType: file.type,
    sizeBytes
  };
}

export async function removeStoredPoster(posterPath: string | null | undefined) {
  if (posterPath && storageProvider() === 's3') {
    await removeS3Poster(posterPath);
    return;
  }
  if (!posterPath || !posterPath.startsWith(publicPrefix() + '/')) return;
  const root = uploadRoot();
  const fileName = path.basename(posterPath);
  const fullPath = path.resolve(root, fileName);
  if (!fullPath.startsWith(root + path.sep)) return;
  await unlink(fullPath).catch(() => undefined);
}

function keyFromS3PosterUrl(posterPath: string) {
  const config = s3Config();
  if (config.publicBaseUrl && posterPath.startsWith(`${config.publicBaseUrl}/`)) {
    return posterPath.slice(config.publicBaseUrl.length + 1);
  }
  try {
    const url = new URL(posterPath);
    return decodeURIComponent(url.pathname.replace(/^\/+/, '').replace(`${config.bucket}/`, ''));
  } catch {
    return null;
  }
}

export async function removeS3Poster(posterPath: string | null | undefined) {
  if (!posterPath || storageProvider() !== 's3') return;
  const config = s3Config();
  const key = keyFromS3PosterUrl(posterPath);
  if (!key || !key.startsWith(config.prefix + '/')) return;
  await s3Client(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })).catch(() => undefined);
}

export async function archiveStoredPoster(posterPath: string | null | undefined) {
  if (!posterPath || !posterPath.startsWith(publicPrefix() + '/')) return;
  const root = uploadRoot();
  const archiveRoot = path.join(root, '_archive');
  const fileName = path.basename(posterPath);
  const fullPath = path.resolve(root, fileName);
  const archivePath = path.resolve(archiveRoot, fileName);
  if (!fullPath.startsWith(root + path.sep) || !archivePath.startsWith(archiveRoot + path.sep)) return;
  await mkdir(archiveRoot, { recursive: true });
  await rename(fullPath, archivePath).catch(() => undefined);
}
