# Web Research SDK Milestones 1-3 Execution Plan

| Metadata       | Details                                                                                              |
| :------------- | :--------------------------------------------------------------------------------------------------- |
| **Owner**      | Engineering Manager Orchestration                                                                    |
| **Status**     | In Progress                                                                                          |
| **Created**    | 2026-03-30                                                                                           |
| **References** | `docs/plans/web-research-sdk-monorepo-execution-plan.md`, `docs/plans/overlay-bridge-protocol-v1.md` |

---

## 1. Context

Milestone 0 scaffolding is already present in the repository. The current workspace has baseline `core`, `react`, and `shared` packages, but implementation is still skeletal:

- `packages/core` currently exposes a minimal in-memory client.
- `packages/react` currently re-exports core behavior and a small helper.
- `packages/shared` currently contains only basic session and event types.

This execution plan covers actual delivery work for:

1. **Milestone 1 — Core SDK Contract + Public Facade**
2. **Milestone 2 — React Overlay Integration Package**
3. **Milestone 3 — Release Pipeline + Adoption Docs**

Hard constraints for all delegated work:

- Do **not** add proprietary interview logic to this OSS repository.
- Keep `react -> core` dependency direction; never invert it.
- Keep `shared` private and publishable packages public.
- Validate bridge behavior against `overlay-bridge-protocol-v1.md`.
- Prefer small, test-backed commits.

---

## 2. Milestone sequencing and dependencies

### Phase A — Milestone 1 foundation

Milestone 1 is the blocker for all downstream work.

- Shared protocol/contracts work must land first.
- Core public facade and bridge runtime can then build on those contracts.
- Milestone 1 quality gate must pass before Milestone 2 starts.

### Phase B — Milestone 2 React integration

- Depends on stable Milestone 1 exports.
- Can proceed once core contracts/runtime are settled and quality-reviewed.

### Phase C — Milestone 3 release/docs

- Can begin once public package exports and packaging shape are stable.
- Adoption docs should reference the actual shipped APIs from Milestones 1-2.

---

## 3. Delegation plan by engineer

## Milestone 1 — Core SDK Contract + Public Facade

### Engineer A — Staff Fullstack Engineer

**Scope**

- Expand `packages/shared` into the canonical public/private bridge contract layer.
- Model protocol envelope, version, capability, lifecycle, diagnostics, ack/retry-related types, and message payload types derived from the protocol doc.
- Add runtime-safe validation helpers or schema definitions appropriate for the workspace so core can validate bridge messages.
- Keep shared package private.

**Required outputs**

- Shared contract types for:
  - bridge namespace/version
  - SDK and overlay lifecycle states
  - capability negotiation
  - all v1 message payloads needed by Milestone 1 and Milestone 2
  - diagnostics/error/result primitives
- Contract tests that assert protocol-spec alignment.
- Clear export surface from `packages/shared/src/index.ts`.

**Required tests/checks**

- `vp test run` in `packages/shared`
- Root `vp check`
- Root `vp run -r test`

**Completion criteria**

- Shared contracts are reusable by both `core` and `react`.
- Unknown/invalid message handling path is representable in types/validation.
- No publish/public package metadata is added to `shared`.

### Engineer B — Staff Backend Engineer

**Scope**

- Build Milestone 1 in `packages/core` on top of shared contracts.
- Replace the placeholder in-memory-only client surface with a stable public SDK facade.
- Implement bridge-safe message creation/parsing, lifecycle/session/event contracts, and basic handshake/state management primitives aligned to protocol v1.
- Add backward-compatible exported API with careful naming and types.

**Required outputs**

- Stable `@insightfull/web-research-sdk` public API.
- Core types/interfaces for client creation, configuration, lifecycle hooks, event tracking, overlay session context, diagnostics, and teardown.
- Protocol-aware bridge helpers for:
  - message envelope creation
  - version validation
  - origin validation inputs
  - handshake progression (`UNMOUNTED` -> `IFRAME_LOADING` -> `HANDSHAKE_PENDING` -> `READY`/`DEGRADED`/`TERMINATED`)
- Contract/unit tests and type-level compatibility checks.

**Required tests/checks**

- `vp test run` in `packages/core`
- Root `vp check`
- Root `vp run -r test`
- Root `vp run -r build`

**Completion criteria**

- Public exports are intentionally shaped and documented in code.
- Protocol schema tests cover happy path and unknown/invalid message rejection.
- No React dependency introduced into `core`.

### Milestone 1 dependency order

1. Engineer A lands shared contracts.
2. Engineer B builds/updates core against shared contracts.
3. Milestone 1 quality review runs across `packages/shared` and `packages/core`.

---

## Milestone 2 — React Overlay Integration Package

### Engineer C — Staff Frontend Engineer

**Scope**

- Implement the real React integration layer in `packages/react` once Milestone 1 exports are stable.
- Keep the package additive and optional.
- Ensure import-time behavior has no browser-global side effects.
- Provide React-friendly host shell/iframe bridge hooks and provider utilities using Milestone 1 core APIs only.

**Required outputs**

- React provider/context and/or hooks for client access and overlay lifecycle management.
- Host shell helpers/components that are public-safe and contain no proprietary UI logic.
- Mockable iframe bridge handshake tests.
- Boundary-safe imports using package exports instead of source-relative cross-package imports.

**Required tests/checks**

- `vp test run` in `packages/react`
- Root `vp check`
- Root `vp run -r test`
- Root `vp run -r build`

**Completion criteria**

- `packages/react` depends on `@insightfull/web-research-sdk`, never the reverse.
- Importing the package performs no DOM mutation or side effect.
- React package tests cover provider/hook behavior and handshake integration with mocks.

### Milestone 2 dependency order

1. Milestone 1 quality gate passes.
2. Engineer C implements React package.
3. Milestone 2 quality review runs across `packages/react` with attention to dependency boundaries and test quality.

---

## Milestone 3 — Release Pipeline + Adoption Docs

### Engineer D — Staff Fullstack Engineer

**Scope**

- Finish release and adoption work after package APIs are stable.
- Configure or finalize Changesets workflows and provenance-ready publishing permissions.
- Add package adoption docs and a two-project local integration runbook.
- Validate package contents/exports via dry-run friendly packaging checks.

**Required outputs**

- `.changeset` configuration aligned with lockstep releases for public packages.
- GitHub Actions workflow updates for release PR creation and publish readiness.
- Docs covering:
  - installation
  - basic SDK setup
  - React integration usage
  - packed vs linked local validation
  - iframe handshake smoke-test runbook
- Publish dry-run validation instructions/output.

**Required tests/checks**

- Root `vp check`
- Root `vp run -r test`
- Root `vp run -r build`
- Root `vp run -r pack`
- Release workflow validation or dry-run command evidence

**Completion criteria**

- Public packages are release-ready.
- Docs match actual exported APIs.
- Runbook covers origin validation, unknown message rejection, ack/retry, iframe unavailable fallback.

### Milestone 3 dependency order

1. Milestones 1-2 merged in working tree.
2. Engineer D completes release workflow/docs.
3. Final quality review runs across workflows, package metadata, docs accuracy, and release safety.

---

## 4. Quality gates

### Gate 1 — Milestone 1

Quality reviewer focus:

- Protocol correctness against `overlay-bridge-protocol-v1.md`
- Unknown message rejection and schema validation paths
- Public API clarity and type safety
- Security-sensitive decisions: origin validation, token handling boundaries, no token-in-URL regressions

### Gate 2 — Milestone 2

Quality reviewer focus:

- `react -> core` boundary enforcement
- No import-time side effects
- Test realism for iframe handshake mocks
- React API ergonomics and type quality

### Gate 3 — Milestone 3 / Final

Quality reviewer focus:

- Release workflow safety
- Public package metadata/exports/package contents
- Documentation accuracy and completeness
- OSS/private boundary remains intact

---

## 5. Engineer instructions for every delegation

Every delegated engineer must:

1. Keep changes scoped to the assigned milestone/task.
2. Write or update tests with the implementation.
3. Run the required checks before reporting completion.
4. Run a self-review using the `quality-reviewer` agent before handing work back.
5. Report back with:
   - files changed
   - tests/checks run and results
   - any unresolved risks or follow-ups

---

## 6. Execution start order

1. Delegate **Engineer A** for shared protocol/contracts.
2. After A reports done, delegate **Engineer B** for core SDK facade/runtime.
3. Run **Gate 1 quality review**.
4. Delegate **Engineer C** for React integration.
5. Run **Gate 2 quality review**.
6. Delegate **Engineer D** for release/docs.
7. Run **Gate 3 final quality review**.

This plan is implementation-ready and assumes Milestone 0 scaffolding already exists in the current workspace.
