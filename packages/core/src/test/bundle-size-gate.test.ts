/**
 * Bundle size gate — verifies the SDK source stays small.
 *
 * NOTE: This test checks raw source file sizes as a proxy for bundle size.
 * For the actual gzipped bundle size, run `vite build` manually and check
 * the output. The SDK should stay under 15KB gzipped for fast CDN delivery.
 *
 * To build and check:
 *   1. Configure a vite build target in project.json (build target)
 *   2. Run `npx vite build libs/web-research-sdk`
 *   3. Check the output size with `gzip -c dist/web-research-sdk.js | wc -c`
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Bundle size gate", () => {
  it("total raw source size stays under 77KB", () => {
    const srcDir = resolve(import.meta.dirname, "../");

    function collectTsFiles(dir: string): string[] {
      const entries = readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectTsFiles(fullPath));
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const files = collectTsFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    let totalBytes = 0;
    for (const file of files) {
      const stat = statSync(file);
      totalBytes += stat.size;
    }

    const totalKB = totalBytes / 1024;

    // The dependency-free host-context, participant bridge, and secure direct-launch
    // code preserve privacy boundaries while keeping the core free of schema libraries.
    // The release build remains the authoritative compressed-size check.
    expect(totalKB).toBeLessThan(77);
  });

  it("index.ts re-exports all public API members", () => {
    const indexPath = resolve(import.meta.dirname, "../index.ts");
    const content = readFileSync(indexPath, "utf-8");

    // Verify key exports exist
    expect(content).toContain("InsightfullSDK");
    expect(content).toContain("SdkEvent");
    expect(content).toContain("SdkConfig");
    expect(content).toContain("StudyContent");
    expect(content).toContain("InsightfullInitOptions");
    expect(content).toContain("validateHostContext");
    expect(content).toContain("InsightfullResponseCompletedMessage");
  });
});
