# Agent Notes

## Repo Shape

- Yarn 4.9.2 workspaces repo (`packages/*`) with Node `>=24`; `.yarnrc.yml` uses `nodeLinker: node-modules`, not PnP.
- Public packages are `packages/core` (`@insightfull/web-research-sdk`) and `packages/react` (`@insightfull/web-research-sdk-react`); `packages/shared` is private/internal and `packages/test-app-react` is a private Playwright smoke app.
- Core public API starts at `packages/core/src/index.ts`; it also registers `window.InsightfullSDK` for script-tag usage.
- React and test-app Vite configs alias `@insightfull/web-research-sdk` to `packages/core/src/index.ts`, so local tests exercise core source rather than built `dist`.
- This OSS repo is only the host-side SDK/client/bridge runtime; proprietary study/interview overlay logic is intentionally excluded.

## Commands

- Install with `corepack enable && yarn install`; the `prepare` script configures vite-plus hooks under `.vite-hooks`.
- Main verification: `yarn ready` runs `vp check && vp run -r test && vp run -r build`.
- Release parity: `yarn release:check` adds recursive `pack`, `scripts/verify-package-exports.mjs`, and `npm pack --dry-run --json` for the two public packages.
- Lint/typecheck/format check: `yarn check`; auto-fix uses the vite-plus binary: `yarn vp check --fix`.
- Run one package test suite: `yarn workspace @insightfull/web-research-sdk test` or `yarn workspace @insightfull/web-research-sdk-react test`.
- Run a focused Vitest file by appending it to the package script, e.g. `yarn workspace @insightfull/web-research-sdk test src/test/event-queue.test.ts`.
- E2E smoke test: `yarn test:e2e`; Playwright starts/reuses Vite at `http://127.0.0.1:4173` from `packages/test-app-react`.

## Build And Test Gotchas

- Package `build`/`pack` scripts both run `vp pack`; package exports point at generated `dist/index.mjs`, `dist/index.cjs`, and `dist/index.d.mts`.
- `yarn pack:verify-exports` only makes sense after `yarn build` or `yarn pack`, because it checks generated `dist` files for core and react.
- Vitest is provided through the `vitest` alias to `@voidzero-dev/vite-plus-test`; package configs include tests from `src/**/*.test.ts` and React also includes `src/**/*.test.tsx`.
- Core and React tests run in `jsdom`; use `autoTrack: false` in SDK tests unless navigation/timer behavior is the thing under test.
- `packages/core/src/test/bundle-size-gate.test.ts` enforces raw non-test TypeScript source under 30 KB, so adding source can fail tests even when typecheck/build pass.
- TypeScript uses `moduleResolution: "Bundler"`; keep relative source imports with `.js` specifiers as the existing files do.

## SDK Contracts

- Default `apiBase` is `https://insightfull.ai`.
- Config fetch is `GET /trpc/sdk.getConfig` with an `input` query containing `{ clientId }`; telemetry ingestion is `POST /trpc/sdk.ingestSdkTelemetry`.
- Public package export changes should be reflected in `packages/core/src/index.ts`, `packages/react/src/index.ts`, package `exports`, tests, and then verified with `yarn release:check`.
- For host-app linking or tarball validation, use `docs/quickstart/local-integration-runbook.md` rather than inventing a local integration flow.
