import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2';
import { readFile } from 'fs/promises';
import path from 'path';
import { getCentralDbPool } from '../../../../../../lib/db';
import { preferredMoviePosterUrl } from '../../../../../../lib/movie-posters';

export const dynamic = 'force-dynamic';

const ALLOWED_POSTER_HOSTS = new Set([
  'upload.wikimedia.org',
  'images.filmibeat.com',
  'image.tmdb.org',
  'm.media-amazon.com'
]);

const LOCAL_POSTER_ROOTS = [
  path.resolve(process.cwd(), 'public', 'posters'),
  path.resolve(process.cwd(), 'public', 'seed', 'movie-posters'),
  path.resolve(process.cwd(), 'public', 'uploads', 'movie-posters')
];

function contentTypeForPoster(filePath: string) {
  if (filePath.endsWith('.webp')) return 'image/webp';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

export async function GET(_request: Request, { params }: { params: Promise<{ movieId: string }> }) {
  const { movieId } = await params;
  const [[movie]] = await getCentralDbPool().query<RowDataPacket[]>(
    'SELECT poster_url AS posterUrl FROM movies WHERE id = ? AND status = ? LIMIT 1',
    [movieId, 'ACTIVE']
  );
  const posterUrl = preferredMoviePosterUrl(movieId, movie?.posterUrl ? String(movie.posterUrl) : null);
  if (!posterUrl) return NextResponse.json({ error: 'Poster not found.' }, { status: 404 });
  if (posterUrl.startsWith('/posters/') || posterUrl.startsWith('/seed/movie-posters/') || posterUrl.startsWith('/uploads/movie-posters/')) {
    const posterPath = path.resolve(process.cwd(), 'public', posterUrl.slice(1));
    if (!LOCAL_POSTER_ROOTS.some((root) => posterPath.startsWith(root + path.sep))) {
      return NextResponse.json({ error: 'Poster path is not allowed.' }, { status: 403 });
    }
    const bytes = await readFile(posterPath).catch(() => null);
    if (!bytes) return NextResponse.json({ error: 'Poster not found.' }, { status: 404 });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': contentTypeForPoster(posterPath),
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800'
      }
    });
  }

  let url: URL;
  try {
    url = new URL(posterUrl);
  } catch {
    return NextResponse.json({ error: 'Poster URL is invalid.' }, { status: 422 });
  }
  if (url.protocol !== 'https:' || !ALLOWED_POSTER_HOSTS.has(url.hostname.toLowerCase())) {
    return NextResponse.json({ error: 'Poster host is not allowed.' }, { status: 403 });
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 604800 } }).catch(() => null);
  const contentType = response?.headers.get('content-type') ?? '';
  if (!response?.ok || !contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Poster is temporarily unavailable.' }, { status: 502 });
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 8 * 1024 * 1024) return NextResponse.json({ error: 'Poster is too large.' }, { status: 413 });

  return new NextResponse(bytes, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800'
    }
  });
}
