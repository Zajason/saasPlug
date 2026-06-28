import path from 'node:path';

const backendProxyTarget = (process.env.BACKEND_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...(process.env.NEXT_ALLOWED_DEV_ORIGIN ? [process.env.NEXT_ALLOWED_DEV_ORIGIN] : []),
  ],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendProxyTarget}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
