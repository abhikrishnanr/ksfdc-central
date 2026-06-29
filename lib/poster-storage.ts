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
  if (!posterPath || !posterPath.startsWith(publicPrefix() + '/')) return;
  const root = uploadRoot();
  const fileName = path.basename(posterPath);
  const fullPath = path.resolve(root, fileName);
  if (!fullPath.startsWith(root + path.sep)) return;
  await unlink(fullPath).catch(() => undefined);
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
