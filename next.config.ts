import type { NextConfig } from "next";
import path from "node:path";

const isVercelBuild = process.env.VERCEL === "1";
const financeBackendUrl = process.env.FINANCE_BACKEND_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return financeBackendUrl
      ? [{
          source: "/api/finance/:path*",
          destination: `${financeBackendUrl}/api/finance/:path*`,
        }]
      : [];
  },
  turbopack: isVercelBuild
    ? { resolveAlias: { "cloudflare:workers": "./app/cloudflare-workers-vercel-shim.ts" } }
    : undefined,
  ...(isVercelBuild
    ? { webpack(config) {
      config.resolve.alias["cloudflare:workers"] = path.resolve(
        process.cwd(),
        "app/cloudflare-workers-vercel-shim.ts",
      );
      return config;
    } }
    : {}),
};

export default nextConfig;
