import path from 'path';
import { existsSync } from 'fs';
import type { NextConfig } from 'next';

const appRoot = path.resolve(__dirname);
const buildRoot = existsSync(path.join(appRoot, 'node_modules', 'next', 'package.json'))
  ? appRoot
  : path.resolve(appRoot, '..');

function posterRemotePatterns() {
  const patterns: NonNullable<NextConfig['images']>['remotePatterns'] = [];
  const publicBaseUrl = process.env.MOVIE_POSTER_PUBLIC_BASE_URL?.trim();
  if (publicBaseUrl) {
    try {
      const url = new URL(publicBaseUrl);
      if (url.protocol === 'https:') patterns.push({ protocol: 'https', hostname: url.hostname });
    } catch {
      // Ignore invalid build-time poster host values.
    }
  }
  const bucket = process.env.MOVIE_POSTER_S3_BUCKET?.trim();
  const region = process.env.MOVIE_POSTER_S3_REGION?.trim() || process.env.AWS_REGION?.trim();
  if (bucket && region) patterns.push({ protocol: 'https', hostname: `${bucket}.s3.${region}.amazonaws.com` });
  const endpoint = process.env.MOVIE_POSTER_S3_ENDPOINT?.trim();
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      if (url.protocol === 'https:') patterns.push({ protocol: 'https', hostname: url.hostname });
    } catch {
      // Ignore invalid optional endpoint values.
    }
  }
  return patterns;
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: buildRoot,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'images.filmibeat.com' },
      ...posterRemotePatterns()
    ]
  },
  turbopack: {
    root: buildRoot
  }
};

export default nextConfig;
