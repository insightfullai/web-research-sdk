import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const packages = ["packages/core", "packages/react", "packages/recorder"];
const require = createRequire(import.meta.url);
const expectedRuntimeExports = {
  "packages/core": ["InsightfullSDK", "validateHostContext"],
  "packages/react": ["InsightfullProvider", "useInsightfull"],
  "packages/recorder": ["attachInsightfullRecorder"],
};
const expectedTypeExports = {
  "packages/core": [
    "HostContextV1",
    "InsightfullRecordingActivityEvidenceMessage",
    "InsightfullResponseCompletedMessage",
    "InsightfullTrackOptions",
  ],
  "packages/recorder": ["InsightfullRecordingFinalization"],
};

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

  const importPath = path.join(rootDir, packageDir, packageJson.exports["."].import);
  const requirePath = path.join(rootDir, packageDir, packageJson.exports["."].require);
  const imported = await import(pathToFileURL(importPath).href);
  const required = require(requirePath);
  for (const exportName of expectedRuntimeExports[packageDir] ?? []) {
    if (!(exportName in imported && exportName in required)) {
      throw new Error(`Missing runtime export ${exportName} from ${packageDir}`);
    }
  }

  const typeTarget = path.join(rootDir, packageDir, packageJson.exports["."].types);
  const declarations = await readFile(typeTarget, "utf8");
  for (const exportName of expectedTypeExports[packageDir] ?? []) {
    if (!declarations.includes(exportName)) {
      throw new Error(`Missing type export ${exportName} from ${packageDir}`);
    }
  }
}

console.log("Verified package export targets for core, react, and recorder.");
