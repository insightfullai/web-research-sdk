# Web Research SDK Workspace

Public Insightfull SDK monorepo for host-side web research integrations.

## Packages

- `@insightfull/web-research-sdk` in `packages/core`
- `@insightfull/web-research-sdk-react` in `packages/react`

## Documentation

- Run the docs locally: `yarn docs:dev`
- Build: `yarn docs:build`

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
