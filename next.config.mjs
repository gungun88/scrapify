/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    webpackBuildWorker: false,
  },
}

export default nextConfig
