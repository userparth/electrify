import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // SharedArrayBuffer (Python on the Raspberry Pi board) only exists on cross-origin isolated pages.
  async redirects() {
    return [{ source: '/solar', destination: '/solar/index.html', permanent: false }];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ],
    }];
  },
};

export default nextConfig;
