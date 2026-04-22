import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@insightfull/web-research-sdk": fileURLToPath(
        new URL("../core/src/index.ts", import.meta.url),
      ),
      "@insightfull/web-research-sdk-contracts": fileURLToPath(
        new URL("../contracts/src/index.ts", import.meta.url),
      ),
    },
  },
});
