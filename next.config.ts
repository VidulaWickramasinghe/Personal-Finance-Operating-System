import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "cloudflare:workers": "./app/cloudflare-workers-vercel-shim.ts",
    },
  },
  webpack(config) {
    config.resolve.alias["cloudflare:workers"] = path.resolve(
      process.cwd(),
      "app/cloudflare-workers-vercel-shim.ts",
    );
    return config;
  },
};

export default nextConfig;
