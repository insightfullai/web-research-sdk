import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: [
    "@insightfull/web-research-sdk",
    "@insightfull/web-research-sdk-react",
    "@insightfull/web-research-sdk-recorder",
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    config.resolve.alias["@insightfull/web-research-sdk"] = path.resolve(
      dirname,
      "../core/src/index.ts",
    );
    config.resolve.alias["@insightfull/web-research-sdk-react"] = path.resolve(
      dirname,
      "../react/src/index.ts",
    );
    config.resolve.alias["@insightfull/web-research-sdk-recorder"] = path.resolve(
      dirname,
      "../recorder/src/index.ts",
    );
    return config;
  },
};

export default nextConfig;
