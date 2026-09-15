/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // models, lighting, stills and covers are not content-hashed, so a day fresh and a
    // week stale-while-revalidate: repeat visits skip the downloads, a rebuild still lands
    const assetCache = { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' };
    return [
      ...['/models/:path*', '/env/:path*', '/stills/:path*', '/games/:path*'].map((source) => ({
        source,
        headers: [assetCache],
      })),
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
