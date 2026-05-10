/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    webpackBuildWorker: false,
  },
  images: {
    remotePatterns: [
      // Google OAuth 头像 CDN
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
}

export default nextConfig
