/** @type {import('next').NextConfig} */
const nextConfig = {
  // 生产部署用 standalone：next build 会把运行时最小依赖打包到 .next/standalone，
  // Dockerfile 只需拷贝 .next/standalone + .next/static + public，无需 node_modules。
  output: 'standalone',
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
