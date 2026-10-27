import type { NextConfig } from "next";

/* PAGES_BASE_PATH (e.g. "/tawd-ecosystem-mvp") switches to a static export for GitHub Pages. All state lives in
   the browser, so the static build is the full product; only the optional server AI route is left out. */
const pagesBase = process.env.PAGES_BASE_PATH;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  ...(pagesBase
    ? {
        output: "export" as const,
        basePath: pagesBase,
        trailingSlash: true,
        images: { unoptimized: true },
        distDir: ".next-pages",
        env: { NEXT_PUBLIC_BASE_PATH: pagesBase },
      }
    : {}),
};

export default nextConfig;
