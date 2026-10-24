import type { NextConfig } from "next";

/**
 * Deployment mode, decided at build time and inlined into every bundle
 * (server, proxy, client) as process.env.BUILD_DEPLOYMENT_MODE.
 * Hosted builds (Netlify, Vercel, Cloudflare Pages) are always portfolio;
 * any DEPLOYMENT_MODE other than "local" fails closed to portfolio.
 * The runtime check in src/config/deployment.ts can only tighten this.
 */
const hosted = ["NETLIFY", "VERCEL", "CF_PAGES"].some((k) => process.env[k]);
const requested = process.env.DEPLOYMENT_MODE?.trim().toLowerCase();
const BUILD_DEPLOYMENT_MODE = hosted || (requested && requested !== "local") ? "portfolio" : "local";

const LOCAL_ONLY_FILES = ["./data/**/*", "./.env*", "./.next-portfolio/**/*", "./docs/**/*", "./tests/**/*"];

const nextConfig: NextConfig = {
  // Lets `npm run build:portfolio` preview the public build without overwriting the local one in .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  devIndicators: false,
  poweredByHeader: false,
  partialPrefetching: true,
  env: { BUILD_DEPLOYMENT_MODE },
  // Never ship local state with a server bundle: the SQLite history (real local runs) and env files stay on this machine.
  // "**" matches every route trace and the shared next-server trace.
  outputFileTracingExcludes: { "**": LOCAL_ONLY_FILES },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
