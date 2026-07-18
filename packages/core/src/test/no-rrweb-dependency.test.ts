import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const forbidden = "rr" + "web";

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("core recorder package boundary", () => {
  it("does not depend on or import the DOM recording package", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../../package.json"), "utf-8"),
    ) as Record<string, unknown>;
    const dependencyBlocks = [
      packageJson.dependencies,
      packageJson.devDependencies,
      packageJson.peerDependencies,
      packageJson.optionalDependencies,
    ];

    for (const dependencyBlock of dependencyBlocks) {
      if (!dependencyBlock || typeof dependencyBlock !== "object") {
        continue;
      }
      expect(
        Object.keys(dependencyBlock).filter((dependencyName) => dependencyName.includes(forbidden)),
      ).toEqual([]);
    }

    const sourceFiles = collectSourceFiles(resolve(import.meta.dirname, "../"));
    const filesWithForbiddenImport = sourceFiles.filter((file) =>
      readFileSync(file, "utf-8").includes(forbidden),
    );

    expect(filesWithForbiddenImport).toEqual([]);
  });
});
