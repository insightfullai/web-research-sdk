import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const packages = ["packages/core", "packages/react"];

async function assertExists(filePath) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Missing export target: ${path.relative(rootDir, filePath)}`);
  }
}

for (const packageDir of packages) {
  const packageJsonPath = path.join(rootDir, packageDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const targets = new Set([
    packageJson.main,
    packageJson.module,
    packageJson.types,
    packageJson.exports?.["."]?.types,
    packageJson.exports?.["."]?.import,
    packageJson.exports?.["."]?.require,
  ]);

  for (const target of targets) {
    if (typeof target !== "string") {
      continue;
    }

    await assertExists(path.join(rootDir, packageDir, target));
  }
}

console.log("Verified package export targets for core and react.");
