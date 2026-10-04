import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Shown in the NavBar; baked in at build time from package.json.
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ['better-sqlite3'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
