import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This folder is the project root (D:\yard has its own lockfile one level up).
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // Lets a production build run next to the dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // instrumentation.ts (built in since Next 15) starts the MQTT broker / subscriber / alert engine once per server process.
  serverExternalPackages: ['aedes', 'mqtt', 'nodemailer', '@prisma/client', 'bcryptjs'],
};

export default nextConfig;
