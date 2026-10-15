/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a production build run next to the dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    // Starts the MQTT broker / subscriber / alert engine once per server process (instrumentation.ts).
    instrumentationHook: true,
    serverComponentsExternalPackages: ['aedes', 'mqtt', 'nodemailer', '@prisma/client', 'bcryptjs'],
  },
};

export default nextConfig;
