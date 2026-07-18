# Real App Testing Recorder Execution Plan

Source TDD / product plan: `docs/plans/real-app-testing-recorder.md`.

## Execution goals

- Ship actual-app recording behind an opt-in package boundary, keeping `@insightfull/web-research-sdk` free of `rrweb`.
- Use stacked PRs so each phase is reviewable and test-backed.
- Validate against local apps as soon as the bridge + recorder MVP can run:
  - local `../insightfull` app / API for real config and study iframe behavior.
  - `packages/next-app-survey` per `packages/next-app-survey/README.md` for host-app end-to-end behavior.
- Keep quality reviews targeted: one quality gate per substantial PR/milestone unless a high-risk security/privacy issue appears.

## Proposed stacked PR sequence

1. **PR 1 — Core iframe bridge only**
   - Branch: `feat/recorder-core-bridge`
   - Base: repository default branch.
   - Scope: SDK core bridge primitives, default renderer iframe registration, exact-origin messaging, readiness handshake, bounded pre-ready queue, recorder-safe SDK context getters.
   - Must not add `rrweb` or recorder dependencies to core.

2. **PR 2 — Experimental recorder package MVP**
   - Branch: `feat/recorder-package-mvp`
   - Base: PR 1 branch.
   - Scope: `packages/recorder`, public package `@insightfull/web-research-sdk-recorder`, `attachInsightfullRecorder`, conservative privacy defaults, manual/default-renderer start-stop, live event forwarding, local chunk buffer with hard caps and stub upload interface.

3. **PR 3 — SDK local integration / smoke coverage**
   - Branch: `feat/recorder-local-smoke`
   - Base: PR 2 branch.
   - Scope: update local test recipes/apps to exercise bridge + recorder import, add browser smoke coverage, document and verify `packages/next-app-survey` against local `../insightfull`.

4. **PR 4+ — backend upload and iframe consumption**
   - Repository: likely `../insightfull` for API persistence and iframe agent consumption; may need separate stacked PRs there.
   - Scope: upload session/chunk endpoints, token/origin validation, idempotency, iframe-side validators, rolling live buffer, eventual replay access.

## Milestone 1 / PR 1 task breakdown

### Staff fullstack engineer: core bridge implementation

Responsibilities:

- Inspect current core SDK, iframe renderer, config/study types, and tests.
- Add a small bridge API owned by core without importing or referencing `rrweb`.
- Register the active iframe when the default renderer creates it, compute the exact `targetOrigin` from the `iframeUrl`, and unregister on teardown/close.
- Add a nonce/capability token to iframe context and accept `insightfull.iframe_ready` only when `origin`, `source`, `studyId`, and nonce match.
- Queue outbound bridge messages until readiness with a bounded queue and deterministic drop behavior.
- Expose recorder-safe context getters from the SDK instance so the recorder package can read environment, visitor/user/custom IDs, URL/path, active study ID, and active response IDs when available.
- Ensure no active iframe is a safe no-op.
- Keep public exports minimal and documented in source-level types.

Required tests:

- Unit tests for exact-origin postMessage target and never using `*`.
- Unit tests for iframe-ready handshake validation and nonce mismatch rejection.
- Unit tests for bounded pre-ready queue behavior and no-active-iframe no-op.
- Unit tests for recorder-safe context getter shape.
- Dependency/package test proving `packages/core` has no `rrweb` dependency/import.
- Package-level verification: `yarn workspace @insightfull/web-research-sdk test` and a relevant `yarn check` or focused typecheck path.

Completion criteria:

- Small commits with passing focused tests.
- No recorder package added in PR 1.
- No broad behavioral regression to survey rendering or telemetry queuing.

### Staff fullstack engineer: local app validation preparation

Responsibilities:

- Inspect `packages/next-app-survey/README.md` and `../insightfull` local startup docs.
- Prepare a concise local validation runbook for the stack once PR 1/PR 2 code is available.
- Verify whether required env files exist; do not invent secrets or client IDs.
- If a real local SDK environment/client ID exists, run local `../insightfull` and `next-app-survey`; otherwise document the exact missing value/blocker and how to proceed.

Required checks:

- `yarn workspace next-app-survey build` when env/setup allows.
- If local Insightfull is booted, exercise checkout `Buy now` flow and confirm SDK status reaches ready and iframe/dialog behavior still works.

Completion criteria:

- Report commands run, URLs used, env requirements, and any blockers.
- Do not modify app behavior unless specifically needed for PR 3.

## Milestone 2 / PR 2 task breakdown

### Staff fullstack engineer: recorder package

Responsibilities:

- Add `packages/recorder` workspace package with package exports, build/test/pack scripts consistent with core/react packages.
- Add `rrweb` only to recorder package dependencies.
- Export `attachInsightfullRecorder(sdk, options)` and return a detachable controller.
- Implement state machine: `idle`, `awaiting_iframe_ready`, `recording`, `flushing`, `completed`, `failed`, `aborted`.
- Start recording only when enabled and an eligible active iframe/study bridge is available.
- Use default privacy options: `maskAllInputs: true`, `maskAllText: true`.
- Forward live rrweb events through the core bridge and batch local chunks under event/byte/time caps.
- Add best-effort flush hooks for SDK destroy/study close/page lifecycle/max duration.

Required tests:

- Recorder attach/detach and state transition tests.
- rrweb privacy option propagation test.
- Batching cap tests for max events/bytes.
- Final flush and manual stop tests.
- Live bridge forwarding test using a fake SDK bridge.
- `yarn workspace @insightfull/web-research-sdk-recorder test`, build, and updated release/export checks as applicable.

## Milestone 3 / PR 3 task breakdown

### Staff frontend/fullstack engineer: local smoke and recipe integration

Responsibilities:

- Add minimal test-app or next-app-survey integration that imports the recorder package and validates event capture + bridge messages without mocking Insightfull config unnecessarily.
- Preserve existing `next-app-survey` real setup semantics.
- Add documentation for running local `../insightfull` plus `next-app-survey` end to end.

Required tests/checks:

- Existing `yarn test:e2e` or focused Playwright smoke updated for recorder behavior.
- Manual/local run evidence for local Insightfull + Next app where credentials/config are available.

## Quality gates

- Run one `quality-reviewer` pass after PR 1 implementation and focused tests are complete.
- Run one `quality-reviewer` pass after PR 2 recorder MVP because it introduces privacy/security-sensitive recording behavior.
- Avoid extra reviews for tiny documentation-only or local-runbook-only changes unless the implementation engineer flags risk.

## Coordination notes

- Engineers must not include secrets or real client IDs in commits.
- Any local env files should remain untracked.
- PR descriptions must clearly call out privacy posture, bridge origin validation, test commands, and local validation status.
- If creating GitHub PRs from this environment is blocked by auth/remote permissions, prepare branches/commits and report exact push/PR commands.
