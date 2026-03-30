# Web Research SDK Workspace

Public Insightfull SDK monorepo for host-side web research integrations.

## Packages

- `@insightfull/web-research-sdk` in `packages/core`
- `@insightfull/web-research-sdk-react` in `packages/react`
- `@insightfull/web-research-sdk-shared` in `packages/shared` (**private workspace-only contract package**)

## OSS/private boundary

This repository ships the public SDK surface only:

- iframe host/runtime management
- bridge transport and protocol validation
- React integration helpers

This repository does **not** ship proprietary overlay/interview logic. That remains in private Insightfull systems behind the versioned bridge protocol in `docs/plans/overlay-bridge-protocol-v1.md`.

## Adoption docs

- `docs/quickstart/installation.md`
- `docs/quickstart/react-integration.md`
- `docs/quickstart/local-integration-runbook.md`

## Commands

```bash
vp install
vp check
vp run -r test
vp run -r build
vp run -r pack
node ./scripts/verify-package-exports.mjs
corepack yarn pack:dry-run
```
