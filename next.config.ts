import path from 'path';
import { existsSync } from 'fs';
import type { NextConfig } from 'next';

const appRoot = path.resolve(__dirname);
const buildRoot = existsSync(path.join(appRoot, 'node_modules', 'next', 'package.json'))
  ? appRoot
  : path.resolve(appRoot, '..');

const nextConfig: NextConfig = {
  outputFileTracingRoot: buildRoot,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'images.filmibeat.com' }
    ]
  },
  turbopack: {
    root: buildRoot
  }
};

export default nextConfig;
