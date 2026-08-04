import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@insightfull/web-research-sdk": fileURLToPath(
        new URL("../core/dist/index.mjs", import.meta.url),
      ),
      "@insightfull/web-research-sdk-recorder": fileURLToPath(
        new URL("../recorder/dist/index.mjs", import.meta.url),
      ),
    },
  },
});
