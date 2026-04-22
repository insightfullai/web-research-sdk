# Internal SDK Iframe Contract: Single Source of Truth Plan

## Metadata

- Owner: Staff Engineering
- Status: Proposed
- Scope: Internal contract between `@insightfull/web-research-sdk` iframe `postMessage` output and Insightfull web prototype ingestion
- Repos affected:
  - `web-research-sdk` (new contracts package + SDK adoption)
  - `insightfull` (consumer adoption in `PrototypeTestSection`)

---

## 1) Problem Statement

Today, the SDK emits iframe messages and Insightfull parses those messages with duplicated local types/parsers.

This creates drift risk:

- SDK message shape evolves in one repo.
- Insightfull parser/types in another repo can lag.
- Runtime behavior becomes "best effort" instead of contract-driven.

We need one canonical contract package for the internal SDK-to-Insightfull protocol so both sides are type-safe and schema-safe.

---

## 2) Goals

1. Create a single source of truth for the iframe `postMessage` protocol.
2. Make both producer (SDK) and consumer (Insightfull) compile-time + runtime-safe.
3. Enforce versioned protocol evolution and prevent silent drift.
4. Keep runtime overhead minimal and implementation incremental.

### Non-goals

- Replacing native ingest (`submitPrototypeEventBatch`) schema.
- Re-architecting replay/analysis pipelines.
- Adding new behavioral event families in this phase.

---

## 3) Current Baseline (Key Touchpoints)

### Producer (SDK)

- Transport output is formed in `packages/core/src/transport.ts`.
- Browser capture event names are produced in `packages/core/src/browser.ts`.

### Consumer (Insightfull)

- Local message types/parsing currently live in `insightfull/libs/multi-section-flow/src/lib/components/sections/PrototypeTestSection.tsx`.
- Native event ingest schema is enforced in `insightfull/libs/prototype-testing/src/lib/routers/submit-prototype-event-batch.trpc.ts`.

---

## 4) Target Architecture

Create a new package in `web-research-sdk`:

- `packages/contracts`
- Published as `@insightfull/web-research-sdk-contracts`

This package owns:

1. Protocol constants (`messageType`, `completeType`, `protocolVersion`)
2. Zod schemas for all iframe messages
3. TS types derived from schemas (`z.infer`)
4. Parse helpers used by consumers

Both `@insightfull/web-research-sdk` and `insightfull` import this package.

---

## 5) Canonical Contract Surface (v1)

### Envelope

- `type`:
  - `insightfull:web-research-batch`
  - `insightfull:web-research-batch:complete`
- `version`: required (`"1.0"`)

### Session metadata

- `sessionId: string`
- `startedAt: string` (ISO)
- `environment: "dev" | "staging" | "prod"`

### Batch event shape

- `id: string`
- `name: "navigation" | "dom.click" | "dom.input" | "dom.change" | "dom.submit"`
- `capturedAt: string` (ISO)
- `sessionId: string`
- `source: "browser" | "manual"`
- `payload: Record<string, unknown>` (event-specific runtime validation remains in consumer normalizer)

### Complete shape

- `reason: string`
- `sentAt: string` (ISO)
- `session` (same session metadata)

---

## 6) Type Safety and Drift Prevention

1. **Single type origin**
   - No hand-written duplicate interfaces in Insightfull for these messages.
   - Always import contract types/parsers from `@insightfull/web-research-sdk-contracts`.

2. **Exhaustive mapping in consumer**
   - `normalizeWebSdkEvent` switches exhaustively on `event.name`.
   - Add `assertNever` guard to fail compile when contract event union changes.

3. **Version gate**
   - Consumer validates `version`.
   - Reject unsupported versions with explicit diagnostic path.

4. **Schema-first parsing**
   - Consumer uses shared parser result, not ad hoc object checks.

5. **CI contract checks**
   - SDK: emitted message fixtures validate against contract schemas.
   - Insightfull: parser acceptance/rejection tests use shared fixtures.

---

## 7) Implementation Plan

## Phase A - Contracts package bootstrap (web-research-sdk)

### Deliverables

- `packages/contracts/src/constants.ts`
- `packages/contracts/src/schema.ts`
- `packages/contracts/src/types.ts`
- `packages/contracts/src/parse.ts`
- `packages/contracts/src/index.ts`
- package tests for valid/invalid messages

### Acceptance criteria

- Contracts package builds/tests independently.
- Strict environment enum enforced.
- Version required and validated.

---

## Phase B - SDK producer adoption (web-research-sdk)

### Deliverables

- `packages/core/src/transport.ts` uses contracts constants for message types and includes `version`.
- SDK session metadata aligns with contract session schema.
- Browser-emitted event names conform to contract union.
- Update SDK tests to validate outgoing payloads with contract parser.

### Acceptance criteria

- Existing SDK tests pass.
- New protocol tests prove output shape conforms to contracts.

---

## Phase C - Insightfull consumer adoption (insightfull)

### Deliverables

- Remove local duplicate message interfaces/parsers in `PrototypeTestSection`.
- Use shared parse helpers from contracts package.
- Keep existing source/origin/session/replay protections.
- Keep existing event normalization, but make event-name mapping exhaustive.

### Acceptance criteria

- All existing `PrototypeTestSection` web tests pass.
- New tests verify unsupported version and invalid schema rejection.
- No behavioral regression in task/session handling.

---

## Phase D - CI and release safety

### Deliverables

- Add contract drift tests in both repos.
- Add release note template for protocol changes.
- Enforce semver policy:
  - major for breaking protocol changes,
  - minor for additive event types,
  - patch for parser bug fixes.

### Acceptance criteria

- CI fails if contract changes are not reflected in producer/consumer tests.

---

## 8) Rollout Strategy

1. Publish `@insightfull/web-research-sdk-contracts@1.0.0`.
2. Update SDK to emit `version: "1.0"`.
3. Update Insightfull to consume parser/types from contracts package.
4. Optional short compatibility window:
   - accept version-less messages for internal builds only (feature-flagged), then remove.
5. Enforce strict version in production.

---

## 9) Test Strategy

### Contracts package

- Valid fixture tests for batch/complete.
- Invalid fixture tests (missing session, invalid env, invalid type/version).

### SDK

- Unit tests assert postMessage payloads validate via contracts parser.
- Browser capture tests ensure emitted event names are in union.

### Insightfull

- Parser integration tests with shared fixtures.
- Exhaustive mapping test for every contract event name.
- Rejection tests for malformed/unsupported-version messages.

---

## 10) Risks and Mitigations

- Risk: package-version skew between repos.
  - Mitigation: pin version in Insightfull and add CI check printing contract version at runtime.

- Risk: additive event name breaks consumer normalization.
  - Mitigation: exhaustive switch + `assertNever` + CI drift tests.

- Risk: runtime schema strictness blocks old clients.
  - Mitigation: staged rollout with temporary compatibility gate.

---

## 11) Ownership and Review

- SDK contracts + producer adoption: Web SDK team.
- Insightfull consumer adoption: Prototype testing squad.
- QA: cross-repo integration owner validates end-to-end web prototype flow.
- Security review: confirm schema validation + version enforcement + no trust boundary regressions.

---

## 12) Definition of Done

Done when all are true:

1. SDK and Insightfull both import the same contracts package for iframe protocol.
2. Local duplicate protocol interfaces/parsers are removed from Insightfull web path.
3. Protocol version is required and enforced in production parsing.
4. CI contains drift guards that fail on unhandled contract changes.
5. End-to-end web prototype flow passes with current event set and environment metadata.
