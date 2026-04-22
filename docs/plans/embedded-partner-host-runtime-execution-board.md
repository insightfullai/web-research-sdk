# Embedded Partner-Host Runtime Execution Board (3 Staff Subagents)

| Metadata       | Details                                                  |
| :------------- | :------------------------------------------------------- |
| Program        | Embedded partner-host runtime reset                      |
| Capacity model | 3 staff engineering subagents in parallel                |
| Status         | Ready for execution                                      |
| Date           | 2026-04-10                                               |
| Primary plan   | `docs/plans/embedded-partner-host-runtime-reset-plan.md` |

---

## 1) Subagent Roles and Boundaries

## Staff Subagent A - SDK Runtime and Contracts Producer

- Primary repo: `web-research-sdk`
- Owns:
  - shared postMessage contracts package
  - SDK overlay mount + host capture + batching/transport
  - partner trigger client API
- Must not own Insightfull embedded route internals.

## Staff Subagent B - Insightfull Embedded Runtime Consumer

- Primary repo: `insightfull`
- Owns:
  - embedded route and boot flow (skip welcome)
  - shared contract parser adoption
  - event normalization + existing prototype pipeline integration
  - task outcome consumption from partner triggers
- Must not change SDK API surface directly.

## Staff Subagent C - Session Authority, Security, and Cross-Repo E2E

- Primary repo: `insightfull` (backend) and integration harness support in both repos
- Owns:
  - launch/session token authority and binding
  - origin/environment/session enforcement
  - cross-origin partner-host + embedded-Insightfull e2e harness
  - rollout diagnostics and failure visibility

---

## 2) Dependency Graph and Parallelization Waves

## Wave 0 (Reset)

- Blocking alignment step before new implementation merges.

## Wave 1 (Parallel)

- A1 contracts package bootstrap
- B1 embedded route skeleton + welcome bypass
- C1 launch/session token authority scaffold

## Wave 2 (Parallel with light dependencies)

- A2 SDK host overlay + handshake + event capture posting
- B2 embedded consumer parser + normalization + ingest wiring
- C2 security enforcement and diagnostics

## Wave 3 (Parallel integration hardening)

- A3 trigger APIs + lifecycle guarantees
- B3 task outcome semantics + analysis/replay compatibility checks
- C3 cross-repo e2e and negative matrix

## Wave 4 (Convergence)

- A/B/C integration fixes, rollout gates, docs, and final certification

---

## 3) Detailed Work Board

Each task below includes required product-behavior tests and command-level verification.

## A1 - Contracts package bootstrap

- Owner: Subagent A
- Repo: `web-research-sdk`
- Dependencies: none
- Scope:
  - create `packages/contracts` publishable package
  - define message constants, version, session schema, batch/complete schemas
  - define closed event-name union for SDK-to-iframe messages
  - export parse helpers and fixture builders
- Deliverables:
  - `packages/contracts/src/*`
  - package tests and exports
- Required tests:
  - schema accepts valid batch/complete fixtures
  - schema rejects invalid origin-independent malformed payloads
  - schema rejects missing/invalid `environment`
  - schema rejects unsupported `version`
- Required commands:
  - `yarn check`
  - `yarn test`
  - `yarn build`
  - `yarn pack:verify-exports`
- Product behavior assertions:
  - contract parser returns typed payload for valid runtime messages
  - invalid payloads fail closed without partial parse.

## B1 - Embedded route skeleton and welcome bypass

- Owner: Subagent B
- Repo: `insightfull`
- Dependencies: none
- Scope:
  - add dedicated embedded route for live study runtime
  - route enters interview state directly, bypassing welcome screens
  - bootstrap from embed launch context (no partner app iframe)
- Deliverables:
  - embedded route/component and route wiring
  - route tests for startup behavior
- Required tests:
  - embed route renders interview runtime directly
  - welcome/start screens are not shown in embed mode
  - missing bootstrap payload yields safe error state
- Required commands:
  - `yarn nx run multi-section-flow:test --runInBand --testFile=<new-embed-route-test-file>`
  - `yarn nx run multi-section-flow:typecheck`
- Product behavior assertions:
  - participant sees interviewer overlay state immediately after embed launch.

## C1 - Launch/session token authority scaffold

- Owner: Subagent C
- Repo: `insightfull`
- Dependencies: none
- Scope:
  - issue one-time launch token bound to section response and allowed origins
  - exchange launch token for short-lived session token
  - bind environment and session relation claims
- Deliverables:
  - token issuance/exchange services and router endpoints
  - storage and validation tests
- Required tests:
  - launch token one-time consumption enforced
  - expired token rejected
  - wrong origin rejected at exchange
  - environment claim persisted and returned in session bootstrap
- Required commands:
  - `yarn nx run prototype-testing:test --runInBand --testFile=<token-service-test-file>`
  - `yarn check`
- Product behavior assertions:
  - no session can start without valid launch context.

---

## A2 - SDK host overlay shell + handshake + event posting

- Owner: Subagent A
- Repo: `web-research-sdk`
- Dependencies: A1
- Scope:
  - mount Insightfull iframe overlay in host app
  - implement handshake state machine using contracts package
  - forward captured host events to iframe via typed batch messages
- Deliverables:
  - overlay mount APIs and lifecycle state reporting
  - postMessage transport updated to include `version`
  - host capture integration wired to transport
- Required tests:
  - happy path handshake to ready
  - handshake timeout transitions to degraded state
  - wrong target origin never used
  - event batches include session/environment/version
  - teardown removes listeners and stops capture
- Required commands:
  - `yarn check`
  - `yarn test`
  - `yarn test:e2e`
- Product behavior assertions:
  - starting study from partner app mounts Insightfull iframe overlay and begins message flow.

## B2 - Embedded message consumer + event normalization + ingest wiring

- Owner: Subagent B
- Repo: `insightfull`
- Dependencies: B1, A1
- Scope:
  - adopt shared contracts parser in embed runtime
  - remove local duplicate message interfaces/parsers
  - normalize contract events to prototype pipeline event inputs
  - forward to existing `submitPrototypeEventBatch` flow
- Deliverables:
  - parser integration in embedded runtime
  - normalization module with exhaustive event-name handling
  - ingestion integration tests
- Required tests:
  - accepts valid batch messages and persists expected event rows
  - rejects malformed/unsupported-version/missing-environment messages
  - rejects wrong source window and wrong origin messages
  - mixed-session events in batch are filtered/rejected per policy
  - unknown event name handling is deterministic (drop + diagnostic or explicit mapping)
- Required commands:
  - `yarn nx run multi-section-flow:test --runInBand --testFile=<embed-consumer-test-file>`
  - `yarn nx run prototype-testing-react:typecheck`
  - `yarn nx run multi-section-flow:typecheck`
- Product behavior assertions:
  - host clicks in partner app become persisted prototype click events with metadata linkage.

## C2 - Security enforcement and diagnostics

- Owner: Subagent C
- Repo: `insightfull`
- Dependencies: C1, A1
- Scope:
  - enforce origin/source/session checks in server and client boundary points
  - add diagnostics codes for reject reasons
  - add observability metrics for acceptance/rejection counts
- Deliverables:
  - enforcement hooks and diagnostics events
  - security regression tests
- Required tests:
  - replay token attack simulation blocked
  - cross-session write attempts blocked
  - unsupported version rejected with diagnostic
  - origin mismatch increments expected metric
- Required commands:
  - `yarn nx run server:test --runInBand --testFile=<security-regression-test-file>`
  - `yarn check`
- Product behavior assertions:
  - malformed or spoofed messages never reach persistence.

---

## A3 - Trigger APIs + lifecycle guarantees

- Owner: Subagent A
- Repo: `web-research-sdk`
- Dependencies: A2
- Scope:
  - implement explicit partner trigger APIs:
    - `signalTaskComplete`
    - `signalTaskAbandon`
    - optional `trackCustomEvent`
  - guarantee `complete` semantics (single logical completion)
  - guarantee queue recovery and deterministic teardown
- Deliverables:
  - trigger API surface and docs
  - lifecycle and queue reliability tests
- Required tests:
  - trigger messages include task id/status/evidence shape
  - duplicate complete calls do not double-complete
  - transient send error recovers and flush resumes
  - destroy/complete cleanly stop capture
- Required commands:
  - `yarn test`
  - `yarn check`
  - `yarn tsc -p tsconfig.json --noEmit`
- Product behavior assertions:
  - partner-defined success trigger is emitted reliably even during high event volume.

## B3 - Task outcome semantics and replay/analysis compatibility

- Owner: Subagent B
- Repo: `insightfull`
- Dependencies: B2, A3
- Scope:
  - consume partner trigger signals as primary task truth
  - map signals to task lifecycle events and stored metadata
  - verify replay and analysis surfaces remain coherent
- Deliverables:
  - task-signal handling in embedded runtime
  - compatibility tests for replay timeline and task summaries
- Required tests:
  - task complete signal persists `task_complete` with expected metadata
  - task abandon signal persists `task_abandon` with reason metadata
  - no cross-task event spillover after completion
  - replay timeline includes expected lifecycle transitions
- Required commands:
  - `yarn nx run multi-section-flow:test --runInBand --testFile=<task-signal-test-file>`
  - `yarn nx run prototype-testing-react:test --runInBand --testFile=<replay-compat-test-file>`
  - `yarn nx run prototype-testing-react:typecheck`
- Product behavior assertions:
  - partner trigger outcomes are reflected exactly in participant results and analysis summaries.

## C3 - Cross-repo integration harness + negative e2e matrix

- Owner: Subagent C
- Repos: both
- Dependencies: A2, B2, C2
- Scope:
  - build e2e harness with partner-host fixture + embedded Insightfull route
  - run cross-origin and same-origin variants
  - automate negative matrix
- Deliverables:
  - e2e tests in SDK harness and/or Insightfull e2e suite
  - runbook for local integrated execution
- Required tests (must be automated):
  - happy path: trigger -> overlay appears -> interview active -> host events persisted -> complete
  - invalid origin: events rejected, interview remains safe
  - invalid/missing environment: batch rejected
  - stale/ended session: subsequent batches rejected
  - reconnect path: temporary network loss, then resumed ingestion
- Required commands:
  - SDK repo: `yarn test:e2e`
  - Insightfull repo: `yarn test:e2e -- --grep "embedded web study"`
  - plus targeted suite commands from A/B tasks
- Product behavior assertions:
  - full topology works exactly as product intends, not just unit-level contract correctness.

---

## 4) Wave Gates and Review Criteria

## Gate 1 (after Wave 1)

- Contract package available and reviewed.
- Embedded route starts without welcome.
- Token authority skeleton in place.

## Gate 2 (after Wave 2)

- SDK overlay mount and event posting functional.
- Insightfull consumes shared contract parser and persists events.
- Security checks block obvious spoofing/replay paths.

## Gate 3 (after Wave 3)

- Trigger APIs and task outcomes stable.
- Cross-repo e2e happy path and negative path pass.
- Replay/analysis compatibility validated.

## Gate 4 (final)

- All required tests green in CI.
- Observability and rollback plan ready.
- Product walkthrough confirms expected participant behavior.

---

## 5) Required Product-Behavior Integration Tests (Canonical List)

These are mandatory to consider implementation complete.

1. **Start trigger path**
   - partner calls SDK start
   - Insightfull embed appears
   - interview begins without welcome

2. **Host interaction telemetry path**
   - participant clicks partner UI control
   - event arrives in iframe consumer
   - event persists as prototype session event with expected metadata and environment

3. **Task completion by trigger**
   - partner emits completion trigger
   - Insightfull marks current task complete
   - task result + analytics reflect completion

4. **Task abandonment by trigger**
   - partner emits abandon trigger with reason
   - Insightfull records abandonment correctly

5. **Security reject path**
   - wrong origin and wrong source-window messages are rejected
   - no persistence side effects

6. **Version reject path**
   - unsupported protocol version rejected with diagnostic

7. **Session mismatch path**
   - mixed-session event batch does not pollute active session

8. **Resilience path**
   - transient transport failure recovers
   - no duplicate completion writes

---

## 6) Deliverable Tracking Template (per task)

Each subagent handoff must include:

1. Files changed
2. Tests added/updated
3. Commands run and exact pass/fail outputs
4. Residual risks and follow-up items
5. Explicit statement of product behavior verified

---

## 7) Final Certification Checklist

- [ ] No inverted iframe topology remains.
- [ ] Shared contracts package is single source of truth in both repos.
- [ ] Embedded Insightfull route skips welcome and starts interview.
- [ ] Partner trigger APIs drive task outcomes.
- [ ] Host event capture persists into existing prototype pipeline.
- [ ] Security negative matrix passes.
- [ ] Replay/analysis surfaces show expected outcomes.
- [ ] Rollout diagnostics and kill switch are verified.
