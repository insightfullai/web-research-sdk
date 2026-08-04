import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const MAX_GZIP_BYTES = 15 * 1024;
const bundlePath = new URL("../packages/core/dist/index.mjs", import.meta.url);
const gzipBytes = gzipSync(readFileSync(bundlePath)).byteLength;

if (gzipBytes > MAX_GZIP_BYTES) {
  throw new Error(
    `Core SDK bundle is ${(gzipBytes / 1024).toFixed(2)} KB gzip; the limit is 15 KB`,
  );
}

console.info(`Core SDK bundle is ${(gzipBytes / 1024).toFixed(2)} KB gzip (limit: 15 KB)`);
