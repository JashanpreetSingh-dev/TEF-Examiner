/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
      {
        source: '/section_a_images/:path*',
        destination: 'http://localhost:8000/section_a_images/:path*',
      },
      {
        source: '/section_b_images/:path*',
        destination: 'http://localhost:8000/section_b_images/:path*',
      },
    ];
  },
};

module.exports = nextConfig;

