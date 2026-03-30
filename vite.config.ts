import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  staged: {
    "*.{js,jsx,ts,tsx,cjs,mjs,cts,mts,json,md,yml,yaml}": "vp check --fix",
  },
});
