# Embedded Partner-Host Runtime Reset Plan

| Metadata     | Details                                                                             |
| :----------- | :---------------------------------------------------------------------------------- |
| Owner        | Engineering Manager + SDK + Prototype Testing                                       |
| Status       | Proposed (Reset Architecture)                                                       |
| Date         | 2026-04-10                                                                          |
| Scope        | Replace inverted iframe flow with partner-hosted SDK + embedded Insightfull runtime |
| Related docs | `docs/plans/implementation_tdd.md`, `docs/plans/overlay-bridge-protocol-v1.md`      |

---

## 1) Why We Are Resetting

The recently implemented direction incorrectly embedded the partner website inside Insightfull's `PrototypeTestSection`.

That is not the product model we need.

The required model is:

1. Partner installs SDK into their app.
2. Partner app triggers study start.
3. SDK mounts Insightfull embedded runtime (iframe overlay) in the partner app.
4. SDK captures partner-app interactions and posts them to embedded Insightfull.
5. Embedded Insightfull runs interview + task logic and persists events via existing prototype pipeline.

If we do not reset now, we will keep shipping tests that pass against the wrong topology.

---

## 2) Canonical Product Behavior (MVP)

### 2.1 End-user behavior

1. Participant is already in partner app.
2. Partner trigger calls SDK `startStudy(...)`.
3. Insightfull overlay iframe appears over partner app.
4. Intro/welcome pages are skipped in embedded mode.
5. AI interviewer starts immediately with participant context supplied by partner.
6. Participant interacts with partner app normally.
7. SDK captures host events and forwards them to embedded Insightfull.
8. Partner sends explicit success/abandon signals for task outcomes.
9. Embedded Insightfull persists events and task outcomes as regular prototype session data.
10. Session completes and overlay tears down cleanly.

### 2.2 Integrator behavior

1. Integrator configures SDK with environment (`dev|staging|prod`) and launch context.
2. Integrator can pass participant identity (external ID required; email optional).
3. Integrator can call trigger APIs for completion/abandon.
4. Integrator can read diagnostics for setup/auth/origin failures.

### 2.3 Explicit non-behavior

- Insightfull must NOT iframe the partner app inside participant flow.
- Browser API key must NOT be primary auth mechanism.
- Raw client-provided org/study/session identifiers must NOT be trusted without token validation.

---

## 3) Target Architecture

## 3.1 Components

### Partner app + SDK host runtime

- Overlay mount shell (iframe container, drag/minimize, z-index safety)
- DOM capture engine (click, input, change, submit, navigation)
- Event queue + batching + retry
- Trigger API (`taskComplete`, `taskAbandon`, `custom signals`)
- Secure postMessage bridge to embedded Insightfull runtime

### Embedded Insightfull runtime (iframe)

- Dedicated embedded route (`/embed/live-study` or equivalent)
- Interview runtime bootstrap (skip welcome path)
- Message parser/validator for SDK batches/signals
- Event normalization into existing prototype event model
- Persistence via existing APIs (`submitPrototypeEventBatch` and related flow)

### Backend authority

- Launch token issuance/exchange
- Session token lifecycle
- Origin and environment binding
- Study/session/section relation authority
- Security and idempotency validation

---

## 4) Data Relation and Security Model

## 4.1 Relation keys (authoritative)

All persisted web-study events must be linked by server-authoritative claims:

- `organizationId`
- `studyId`
- `sectionId`
- `sectionResponseId`
- `baseResponseId`
- `environment`

## 4.2 Token model

1. Partner obtains one-time launch token from backend.
2. Launch token is bound to origin(s), section response, environment, and TTL.
3. SDK exchanges launch token for short-lived session token.
4. Session token gates all writes.

## 4.3 Security invariants

- No wildcard `targetOrigin` in production.
- Ignore all messages from non-iframe source windows.
- Reject unsupported protocol versions.
- Reject missing/invalid environment.
- Reject session mismatch within batch.
- Reject stale/replayed sessions where applicable.
- Redact sensitive capture fields by default.

---

## 5) Protocol Contract Requirements

The SDK-to-embedded-Insightfull postMessage contract must be a shared package single source of truth.

Required envelope fields (all messages):

- `type`
- `version`
- `session` (`sessionId`, `startedAt`, `environment`)
- `sentAt` / `capturedAt`

Required message groups:

1. Session lifecycle: init/ready/complete/error
2. Event batches: host behavior events
3. Trigger signals: task complete/abandon with evidence
4. Diagnostics: schema errors, origin mismatch, unsupported version

---

## 6) Phase Plan (Detailed)

## Phase 0 - Reset and Guardrails

### Objective

Freeze wrong-topology work and prevent accidental merge.

### Required outputs

- Architecture reset note in planning docs.
- PR/branch policy: no more partner-site-in-Insightfull iframe work.
- Explicit checklist in review template: "Does this keep partner app as host runtime?"

### Acceptance criteria

- Team alignment documented.
- Active branches point to reset execution board.

---

## Phase 1 - Contract and Threat Model

### Objective

Define exact host<->iframe protocol and security rules before implementation.

### Required outputs

- Message catalog v1 with closed unions for event names.
- Version policy (`MAJOR.MINOR`) and compatibility policy.
- Threat model table with mitigations for replay, spoofed origin, wrong window source, stale session, malformed payload.

### Acceptance criteria

- Contract approved by SDK + Insightfull owners.
- Security reviewer signs off invariants.

---

## Phase 2 - Backend Session Authority

### Objective

Implement launch/session authority so relation and security are server-bound.

### Required outputs

- Launch token issuance endpoint/service.
- Session exchange endpoint.
- Origin/environment/session binding checks.
- Rejection codes with diagnostics.

### Acceptance criteria

- Token replay blocked.
- Wrong-origin start blocked.
- Wrong environment blocked.
- Session writes without valid session token blocked.

---

## Phase 3 - Embedded Insightfull Runtime Route

### Objective

Create embedded route that starts interview immediately and consumes SDK messages.

### Required outputs

- New embedded route with "skip welcome" behavior.
- Parent message listener with shared contract parser.
- Event normalization and forwarding into existing prototype event pipeline.
- Trigger signal handling for task complete/abandon.

### Acceptance criteria

- Embedded route starts without welcome flow.
- Receives SDK batch and persists events to prototype pipeline.
- Task outcomes from partner trigger are reflected in stored events/results.

---

## Phase 4 - SDK Host Runtime Overlay + Capture

### Objective

SDK mounts Insightfull iframe in partner app and streams host behavior.

### Required outputs

- Overlay shell mount/teardown API.
- Handshake and lifecycle state machine.
- DOM capture and queue with batching/retry.
- Trigger APIs for success/abandon.

### Acceptance criteria

- Overlay appears and is interactive in partner app.
- Host click/input/change/submit/navigation events are posted to iframe.
- Complete/teardown behaves deterministically.

---

## Phase 5 - End-to-End Integration and Hardening

### Objective

Prove integrated behavior in realistic browser conditions.

### Required outputs

- Partner-host + embedded-Insightfull e2e harness.
- Origin/session/version negative tests.
- Long-session bounded-memory and dedupe tests.

### Acceptance criteria

- Full happy path pass.
- Security/negative matrix pass.
- No regression in existing prototype analysis surfaces.

---

## Phase 6 - Rollout Readiness

### Objective

Prepare for safe rollout with observability and rollback controls.

### Required outputs

- Feature flags and kill switch behavior.
- Dashboard cards for handshake, ingestion, rejection reasons, completion quality by environment.
- Runbook entries for top incident classes.

### Acceptance criteria

- Ops sign-off complete.
- Rollback drill verified.

---

## 7) Product-Behavior Test Matrix (Required)

## 7.1 Launch and embed behavior

1. Partner trigger starts study from active app page.
2. Insightfull iframe mounts and handshake reaches ready state.
3. Embedded route skips welcome and starts interview immediately.

## 7.2 Event capture behavior

1. Host click event becomes persisted prototype click event.
2. Host navigation event updates frame/path context correctly.
3. Host form interactions are captured with expected normalization semantics.
4. Event metadata includes sdk session id and environment.

## 7.3 Task trigger behavior

1. Partner trigger `task_complete` marks task complete regardless of navigation heuristic.
2. Partner trigger `task_abandon` marks abandonment with reason metadata.
3. No same-batch spillover across task boundaries.

## 7.4 Security behavior

1. Wrong source window message ignored.
2. Wrong origin message rejected.
3. Missing/invalid environment rejected.
4. Unsupported protocol version rejected.
5. Mixed-session events in one batch are filtered/rejected per policy.

## 7.5 Reliability behavior

1. Transient send failure recovers and flush resumes.
2. Session complete is emitted once per logical transport path.
3. Teardown removes listeners and stops capture.
4. Memory-bounded sets do not grow unbounded in long sessions.

## 7.6 Analytics behavior

1. Persisted events appear in session replay timeline.
2. Heatmap/nav queries include web-session events as intended.
3. Retry/replay does not inflate counts.

---

## 8) Definition of Done for Reset Program

Done means all of the following are true:

1. Partner app is host runtime (no inverted iframe topology).
2. Embedded Insightfull route starts interview directly and consumes SDK messages.
3. Session authority and relation are token-bound and server-enforced.
4. Shared contracts package is used by both producer and consumer.
5. Product-behavior integration tests pass in cross-origin e2e harness.
6. PRs show clear security and regression evidence.
