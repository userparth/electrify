import type { NextConfig } from "next";

// EB_STATIC=1 builds plain files for shared hosting (served from EB_BASE_PATH, compile via PHP).
const isStatic = process.env.EB_STATIC === "1";
const basePath = isStatic ? process.env.EB_BASE_PATH ?? "" : "";

const nextConfig: NextConfig = {
  // Partial prerendering can't be combined with a static export.
  cacheComponents: !isStatic,
  partialPrefetching: !isStatic,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_REPORT_URL: isStatic ? `${basePath}/api/log.php` : "",
    NEXT_PUBLIC_COMPILE_URL: isStatic ? `${basePath}/api/compile.php` : "/api/compile",
  },
  ...(isStatic
    ? { output: "export", trailingSlash: true, basePath }
    : {
        async redirects() {
          return [{ source: "/solar", destination: "/solar/index.html", permanent: false }];
        },
        // SharedArrayBuffer (Python on the Raspberry Pi board) only exists on cross-origin isolated pages.
        async headers() {
          return [{
            source: "/:path*",
            headers: [
              { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
              { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
            ],
          }];
        },
      }),
};

export default nextConfig;
