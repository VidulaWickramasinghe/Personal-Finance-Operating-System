import type { NextConfig } from "next";
import path from "node:path";

const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
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
