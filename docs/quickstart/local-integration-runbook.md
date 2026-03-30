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
