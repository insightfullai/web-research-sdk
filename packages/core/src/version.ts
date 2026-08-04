import packageJson from "../package.json" with { type: "json" };

/** Package version sourced directly from the published package manifest. */
export const SDK_VERSION = packageJson.version;
