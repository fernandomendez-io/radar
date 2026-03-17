/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' https://basemaps.cartocdn.com https://opensky-network.org;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
