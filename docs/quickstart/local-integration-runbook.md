# Two-project local integration runbook

Use this runbook when validating the SDK repo together with a separate host application repo.

## Repos

1. `web-research-sdk` (this OSS repo)
2. your host app repo that embeds the private overlay iframe

## Mode A: linked validation

Use linked mode for fast iteration.

In this repo:

```bash
vp install
vp run -r build
```

In the host app repo, link the two public packages from your local workspace using your package manager's workspace/link flow, then restart the host app.

Use linked mode when validating API shape, React integration behavior, and fast bridge fixes before publish parity checks.

## Mode B: packed validation

Use packed mode for publish-parity validation.

In this repo:

```bash
vp run -r pack
node ./scripts/verify-package-exports.mjs
corepack yarn pack:dry-run
```

Then install the generated tarballs from `packages/core` and `packages/react` into the host app repo.

## Smoke test checklist

### Installation/package checks

- host app installs only public packages
- no dependency on `@insightfull/web-research-sdk-shared`
- packed tarballs contain only expected publish artifacts and package metadata

### Iframe handshake checks

1. load host page and mount iframe
2. confirm iframe `load` moves SDK state to `HANDSHAKE_PENDING`
3. send `overlay:hello` from the iframe origin
4. confirm SDK responds with `bridge:ack` and `overlay:init`
5. send `overlay:ready`
6. confirm SDK responds with `bridge:ack` and reaches `READY`

### Failure-path checks

- **origin validation:** send a valid message from the wrong origin and confirm rejection/termination
- **unknown message rejection:** send an unknown or schema-invalid message and confirm it is rejected with diagnostics
- **ack/retry:** drop `overlay:ready` after `overlay:init` and confirm retry attempts before `DEGRADED`
- **iframe unavailable fallback:** never send `overlay:hello` and confirm hello timeout moves the SDK to `DEGRADED`

## Release-readiness commands

Run these in the SDK repo before cutting or approving a release:

```bash
vp check
vp run -r test
vp run -r build
vp run -r pack
node ./scripts/verify-package-exports.mjs
corepack yarn pack:dry-run
```

## OSS/private boundary reminder

This repo owns host runtime behavior only. Proprietary overlay logic, interview orchestration, and private backend token issuance stay outside this repository.

## Embedded partner-host + Insightfull runtime matrix (Wave 3 C3)

Use this flow when validating the integrated topology (`partner host page` -> `embedded Insightfull iframe`).

### Local prerequisites

1. Start Insightfull app + API from `insightfull` so `/embedded/live-study` and tRPC routes are reachable.
2. Start SDK test harness from `web-research-sdk/packages/test-app-react` via Playwright web server.
3. Use separate browser contexts for partner host and embedded iframe debugging when investigating origin/session failures.

### Contracts sync prerequisite (cross-repo)

`insightfull` currently consumes `@insightfull/web-research-sdk-contracts` via a local file dependency. Refresh it before running the Wave 3 matrix so contract edits in this repo are visible there.

From `web-research-sdk`:

```bash
yarn workspace @insightfull/web-research-sdk-contracts build
```

From `insightfull`:

```bash
yarn install
```

### Required verification commands

Run from `web-research-sdk`:

```bash
yarn test:e2e
```

Run from `insightfull`:

```bash
yarn test:e2e -- --grep "embedded web study"
```

### Targeted A/B hardening suites to run alongside C3

Run from `insightfull`:

```bash
yarn nx run multi-section-flow:test --runInBand --testFile=libs/multi-section-flow/src/lib/components/sections/__tests__/PrototypeTestSection.test.tsx
yarn nx run prototype-testing:test --runInBand --testFile=libs/prototype-testing/src/lib/routers/embedded-security-regression.test.ts
yarn nx run prototype-testing-react:test --runInBand --testFile=libs/prototype-testing-react/src/lib/components/__tests__/ReplayTimeline.test.tsx
```

### Matrix checklist

- happy path: trigger -> overlay visible -> embedded runtime active -> host events persisted -> completion observed
- invalid origin: embedded boundary rejects writes and runtime remains safe
- invalid/missing environment: launch or batch is rejected fail-closed
- stale or ended session: follow-on batches are rejected
- reconnect: temporary failure/offline window followed by resumed event ingestion
