/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'local-network=()', // Explicitly deny local network access
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
