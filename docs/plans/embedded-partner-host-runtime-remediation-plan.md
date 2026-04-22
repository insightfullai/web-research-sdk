# Embedded Partner-Host Runtime — Remediation Plan

| Metadata   | Details                                                                 |
| :--------- | :---------------------------------------------------------------------- |
| Source     | Tri-reviewer audit (Staff Engineer, Senior Engineer, Security Engineer) |
| Date       | 2026-04-11                                                              |
| Status     | Proposed                                                                |
| Scope      | Address all Critical, High, and Medium findings across both repos       |
| Precedence | This plan supersedes remaining open items in execution-status.md        |

---

## Severity Classification

- **P0 — Ship blocker**: Must fix before any partner-facing deployment
- **P1 — Hardening**: Must fix before GA / general rollout
- **P2 — Quality**: Should fix in next iteration
- **P3 — Cleanup**: Nice to have, backlog-worthy

---

## Remediation Waves

Work is organized into 3 waves. Each wave has a gate. Waves may overlap where dependencies allow.

---

## Wave R1 — Security & Correctness (P0)

**Gate R1**: No Critical or High security findings remain. End-to-end message flow works.

### R1.1 — Replace client-supplied origin with HTTP Origin header

**Severity**: P0 (Security — CRITICAL O1)
**Files**:

- `insightfull/libs/prototype-testing/src/lib/routers/exchange-embedded-launch-token.trpc.ts`
- `insightfull/libs/prototype-testing/src/lib/routers/submit-prototype-event-batch.trpc.ts`
- `insightfull/libs/prototype-testing/src/lib/routers/get-embedded-session-bootstrap.trpc.ts`

**Problem**: All three public endpoints accept `origin` from the tRPC input body. An attacker with a captured token can call these endpoints via curl/Postman and supply any origin string, completely bypassing origin enforcement.

**Fix**:

1. Extract the actual HTTP `Origin` header from the tRPC context (`ctx.req.headers.origin`).
2. If `Origin` is absent, fall back to `Referer` header. If neither is present, reject with `400 BAD_REQUEST`.
3. Normalize the extracted origin via `new URL(origin).origin`.
4. Pass the server-extracted origin to `embeddedSessionTokenService` — never trust `input.embedded.origin` or `input.origin`.
5. Remove `origin` from all three input schemas, or keep it as an optional field for diagnostic logging only (never for validation).

```typescript
// exchange-embedded-launch-token.trpc.ts — revised
.mutation(async ({ input, ctx }) => {
  const httpOrigin = ctx.req.headers.origin ?? ctx.req.headers.referer;
  if (!httpOrigin) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Missing Origin header" });
  }
  const resolvedOrigin = new URL(httpOrigin).origin;

  const exchanged = embeddedSessionTokenService.exchangeLaunchToken({
    launchToken: input.launchToken,
    origin: resolvedOrigin,  // server-extracted, not client-supplied
  });
  // ...
});
```

**Test requirements**:

- Unit test: calling exchange with mismatched `Origin` header vs `allowedOrigins` → rejected
- Unit test: calling exchange without `Origin` header → rejected with `BAD_REQUEST`
- Unit test: calling exchange with `Origin` matching `allowedOrigins` but different body `origin` → accepted (body origin ignored)
- E2e test: curl-based exchange with spoofed body origin but correct header → accepted or rejected based on header only

---

### R1.2 — Always validate origin in `getEmbeddedSessionBootstrap`

**Severity**: P0 (Security — HIGH O2)
**Files**:

- `insightfull/libs/prototype-testing/src/lib/routers/get-embedded-session-bootstrap.trpc.ts`
- `insightfull/libs/prototype-testing/src/lib/services/embedded-session-token.service.ts`

**Problem**: `getSessionBootstrap` is called without passing `origin`, and the service makes origin validation optional (`if (input.origin)`). This means the origin allowlist bound at launch-token issuance is never checked at bootstrap time.

**Fix**:

1. In the router, extract the HTTP `Origin` header (same pattern as R1.1).
2. Pass it to `getSessionBootstrap({ sessionToken, origin: resolvedOrigin })`.
3. In the service, make `origin` a required parameter in `GetSessionBootstrapInput` — remove the `?` optional marker.
4. Remove the `if (input.origin)` guard — always check origin against the allowlist.

```typescript
// domain.types.ts — revised
export interface GetSessionBootstrapInput {
  now?: Date;
  origin: string; // was optional, now required
  sessionToken: string;
}
```

```typescript
// embedded-session-token.service.ts — revised
// Remove the `if (input.origin)` wrapper — always validate:
const requestOrigin = this.normalizeOrigin(input.origin);
if (!launchRecord.allowedOrigins.includes(requestOrigin)) {
  throw new EmbeddedSessionTokenError("invalid_origin", "...");
}
```

**Test requirements**:

- Unit test: `getSessionBootstrap` with valid token + wrong origin → `invalid_origin` error
- Unit test: `getSessionBootstrap` with valid token + correct origin → claims returned
- Security regression test: bootstrap endpoint called from wrong origin → `UNAUTHORIZED`

---

### R1.3 — Validate `embedBootstrap` context server-side

**Severity**: P0 (Security — HIGH S1)
**Files**:

- `insightfull/libs/multi-section-flow/src/lib/components/orchestrator/EmbeddedStudyRuntimeRoute.tsx`

**Problem**: `embedBootstrap` query parameter is parsed as JSON containing `responseId` and `shareUrl` with no server-side validation, no token check, no authorization. An attacker can craft `/embedded/live-study?embedBootstrap={"responseId":1,"shareUrl":"fake"}` to access any session.

**Fix (two-part)**:

**Part A — Token-bound launch context (primary path)**:

1. Replace `embedBootstrap` with a `launchToken` query parameter.
2. On mount, the embedded route calls `getEmbeddedSessionBootstrap` with the launch token (after exchange) to retrieve server-authoritative claims.
3. `responseId` and `shareUrl` come from server claims, never from client-controlled query params.
4. The router already has `getEmbeddedSessionBootstrap` — wire it into the route component.

**Part B — Remove/harden the global variable path**:

1. Remove `window.__INSIGHTFULL_EMBED_LAUNCH_CONTEXT__` or HMAC-sign its contents.
2. If kept, the server must set it in a server-rendered script tag with a signature the route component verifies.

```typescript
// EmbeddedStudyRuntimeRoute.tsx — revised skeleton
export function EmbeddedStudyRuntimeRoute() {
  const [searchParams] = useSearchParams();
  const launchToken = searchParams.get("launchToken");

  const { data, error } = useQuery(
    getEmbeddedSessionBootstrap.queryOptions({ sessionToken: launchToken ?? "" })
  );

  if (!launchToken || error) {
    return <EmbeddedRouteErrorState />;
  }

  return (
    <StudyFlowProvider>
      <UnifiedStudyFlow
        embeddedMode
        responseId={data.claims.sectionResponseId}
        shareUrl={constructShareUrl(data.claims)}
      />
    </StudyFlowProvider>
  );
}
```

**Test requirements**:

- Unit test: route renders error state when no `launchToken` param
- Unit test: route renders error state when token is invalid/expired
- Unit test: route renders `UnifiedStudyFlow` when token is valid
- E2e test: direct URL with fabricated `responseId` → error state, no data access
- Security regression test: crafted query param with another org's responseId → rejected

---

### R1.4 — Add authentication to non-embedded `submitPrototypeEventBatch`

**Severity**: P0 (Security — CRITICAL A1)
**Files**:

- `insightfull/libs/prototype-testing/src/lib/routers/submit-prototype-event-batch.trpc.ts`

**Problem**: When `input.embedded` is not provided, the non-embedded path only checks if the session exists and is active — no authentication. Sequential integer IDs are guessable.

**Fix**:

This is a pre-existing issue predating this feature. Options:

1. **Option A (minimal)**: Add a participant session token requirement to the non-embedded path. The frontend already has a participant session — include it.
2. **Option B (full)**: Convert the endpoint to `authedProcedure` and adjust the frontend accordingly.
3. **Option C (scoped)**: For the embedded feature scope, add a comment documenting the known gap and file a separate P1 issue for the non-embedded path.

Recommended: **Option C** for this wave (document the gap, file issue), then address in a follow-up PR. The embedded path is the one being actively shipped, and it has token-based auth.

**Test requirements**:

- Document the gap in the codebase with a `// TODO(security): ...` marker
- File a tracked issue for the non-embedded auth gap

---

### R1.5 — Wire the embedded route to consume SDK messages (fill B2 gap)

**Severity**: P0 (Architecture — CRITICAL)
**Files**:

- `insightfull/libs/multi-section-flow/src/lib/components/orchestrator/EmbeddedStudyRuntimeRoute.tsx`
- `insightfull/libs/multi-section-flow/src/lib/components/sections/PrototypeTestSection.tsx`

**Problem**: `EmbeddedStudyRuntimeRoute.tsx` renders `UnifiedStudyFlow` but has no `window.addEventListener("message", ...)` handler. The iframe route ignores everything the SDK sends. The B2 deliverable from the execution plan is absent.

**Fix**:

1. Add a `useEffect` in `EmbeddedStudyRuntimeRoute` that registers a `message` event listener on `window`.
2. Use `parseWebResearchBatchMessage` from the contracts package to validate incoming messages.
3. Origin-check against the expected SDK origin (from the session claims or a configured allowlist).
4. Normalize validated events into the prototype event schema (`eventType`, `x`, `y`, `timestampMs`, etc.).
5. Forward normalized events to `submitPrototypeEventBatch` via tRPC mutation.
6. Handle `task_complete` and `task_abandon` signal messages by updating the study flow state.

```typescript
// EmbeddedStudyRuntimeRoute.tsx — message listener skeleton
useEffect(() => {
  if (!launchContext) return;

  const handler = (event: MessageEvent) => {
    if (event.origin !== expectedOrigin) return;

    const parsed = parseWebResearchBatchMessage(event.data);
    if (!parsed.success) {
      logger.warn("Invalid batch message", { issues: parsed.issues });
      return;
    }

    const normalized = normalizeEvents(parsed.data.events);
    submitBatchMutation.mutate({
      sectionResponseId: launchContext.responseId,
      baseResponseId: launchContext.baseResponseId,
      events: normalized,
      embedded: {
        origin: event.origin,
        sessionId: parsed.data.session.sessionId,
        sessionToken: currentSessionToken,
        source: "partner_host",
        version: parsed.data.version,
      },
    });
  };

  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}, [launchContext]);
```

**Test requirements**:

- Unit test: valid batch message → normalized events submitted
- Unit test: invalid batch message → no submission, warning logged
- Unit test: wrong origin → message ignored
- Unit test: session mismatch → rejected
- E2e test: full flow from SDK host → iframe → events persisted in DB

---

### R1.6 — Add state guards to task signal methods

**Severity**: P0 (Correctness — CRITICAL)
**Files**:

- `web-research-sdk/packages/core/src/embedded-host-runtime.ts`

**Problem**: `signalTaskComplete` and `signalTaskAbandon` (`finalizeWithTaskSignal` at line 242) post to `iframe.contentWindow` with no state guard. If called before handshake completes, the signal is silently lost.

**Fix**:

1. In `finalizeWithTaskSignal`, check state is `READY` before posting. If `DEGRADED` or earlier, throw a descriptive error.
2. In `mount()`, guard against concurrent teardown — reject or queue if `teardownPromise` is in flight.

```typescript
// embedded-host-runtime.ts — revised finalizeWithTaskSignal
private async finalizeWithTaskSignal(message): Promise<void> {
  if (this.completionPromise) {
    await this.completionPromise;
    return;
  }

  if (this.state !== "READY" && this.state !== "HANDSHAKE_PENDING") {
    throw new Error(
      `Cannot emit task signal in state ${this.state}. ` +
      `Current state must be READY. Destroy and recreate the runtime.`
    );
  }

  // ... rest unchanged
}
```

```typescript
// embedded-host-runtime.ts — revised mount() guard
public mount(): void {
  if (this.teardownPromise) {
    throw new Error("Cannot mount while teardown is in progress. Await destroy() first.");
  }
  if (this.iframe || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  // ... rest unchanged
}
```

**Test requirements**:

- Unit test: `signalTaskComplete` called in `HANDSHAKE_PENDING` state → throws
- Unit test: `signalTaskComplete` called in `DEGRADED` state → throws
- Unit test: `mount()` called while teardown is settling → throws
- Unit test: `mount()` called after teardown completes → succeeds

---

### R1.7 — Add max retry to `complete()` loop

**Severity**: P0 (Correctness — HIGH)
**Files**:

- `web-research-sdk/packages/core/src/transport.ts`

**Problem**: `WebResearchEventQueue.complete()` at line 144 has a `while (true)` loop that retries failed flushes forever with no backoff. If the iframe is permanently dead, this spins indefinitely.

**Fix**:

1. Add a `MAX_COMPLETE_FLUSH_RETRIES` constant (default: 5).
2. Track consecutive failures in the loop.
3. After max retries, throw a `CompleteError` with the remaining buffered event count.

```typescript
private static readonly MAX_COMPLETE_FLUSH_RETRIES = 5;

public async complete(reason = "complete"): Promise<void> {
  if (this.completed) return;

  if (!this.completingPromise) {
    this.completingPromise = (async () => {
      this.clearFlushTimer();
      let consecutiveFailures = 0;

      while (this.events.length > 0) {
        try {
          await this.flush(reason);
          consecutiveFailures = 0;
        } catch {
          consecutiveFailures++;
          if (consecutiveFailures >= WebResearchEventQueue.MAX_COMPLETE_FLUSH_RETRIES) {
            throw new Error(
              `Failed to flush ${this.events.length} events after ` +
              `${consecutiveFailures} attempts. Transport may be dead.`
            );
          }
          // Optional: await a small backoff here
        }
      }

      // ... rest unchanged
    })();
  }
  // ... rest unchanged
}
```

**Test requirements**:

- Unit test: `complete()` throws after max retries
- Unit test: `complete()` succeeds when flush recovers on retry 3

---

## Gate R1

All P0 items resolved:

- [ ] R1.1: Origin validation uses HTTP headers
- [ ] R1.2: Bootstrap endpoint validates origin
- [ ] R1.3: Embedded route uses server-validated claims
- [ ] R1.4: Non-embedded auth gap documented and tracked
- [ ] R1.5: Embedded route consumes SDK messages end-to-end
- [ ] R1.6: State guards on task signal and mount
- [ ] R1.7: Complete loop has max retry

---

## Wave R2 — Token Persistence & Operational Hardening (P1)

**Gate R2**: Token store survives restart and scales horizontally. SDK is observable.

### R2.1 — Replace in-memory token store with database persistence

**Severity**: P1 (Architecture — CRITICAL)
**Files**:

- `insightfull/libs/prototype-testing/src/lib/services/embedded-session-token.service.ts`
- `insightfull/db/schema.ts` (new tables)

**Problem**: Both `launchTokenStore` and `sessionTokenStore` are in-memory `Map` objects. Tokens are lost on process restart, cannot be shared across multiple server instances, and grow without bound.

**Fix**:

1. Create two new database tables: `embedded_launch_tokens` and `embedded_session_tokens`.
2. Schema should include all fields currently in `LaunchTokenRecord` and `SessionTokenRecord`.
3. Token hashes are the primary lookup key (existing `hashToken` pattern is good — store the hash, not the raw token).
4. Add TTL-based cleanup: a periodic job (or graphile-worker cron) that deletes expired tokens older than 24 hours.
5. Replace `Map` operations with `db.select`/`db.insert`/`db.update` calls using the existing Drizzle ORM.
6. Use `UPDATE ... WHERE consumed_at IS NULL` for atomic one-time consumption (prevents TOCTOU race in multi-instance deployments).

```typescript
// db/schema.ts — new tables
export const embeddedLaunchTokens = pgTable("embedded_launch_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  studyId: integer("study_id").notNull(),
  sectionResponseId: integer("section_response_id").notNull(),
  baseResponseId: integer("base_response_id").notNull(),
  environment: text("environment").notNull(),
  allowedOrigins: jsonb("allowed_origins").notNull().$type<string[]>(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const embeddedSessionTokens = pgTable("embedded_session_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  launchTokenHash: text("launch_token_hash").notNull(),
  claims: jsonb("claims").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

7. Generate migration: `yarn db:generate`.
8. Add index on `embedded_launch_tokens.expires_at` for cleanup queries.
9. Add a graphile-worker cron task: `embedded_token_cleanup` — `DELETE FROM embedded_launch_tokens WHERE expires_at < now() - interval '24 hours'`.

**Test requirements**:

- Integration test: issue token → restart service → exchange token → succeeds (persists across restart)
- Integration test: issue token on instance A → exchange on instance B → succeeds
- Integration test: concurrent exchange of same token → only one succeeds (atomic `consumed_at` update)
- Test cleanup job removes expired tokens

---

### R2.2 — Add SDK lifecycle observability

**Severity**: P1 (Operability — HIGH)
**Files**:

- `web-research-sdk/packages/core/src/embedded-host-runtime.ts`
- `web-research-sdk/packages/core/src/types.ts`

**Problem**: The SDK emits zero diagnostics. When the overlay fails to appear or events stop flowing, the partner has no information. No logging, no callbacks, no state change events.

**Fix**:

1. Add an `onStateChange` callback to `EmbeddedHostRuntimeOptions`:

```typescript
export interface EmbeddedHostRuntimeOptions {
  // ... existing
  onStateChange?: (
    state: SdkLifecycleState,
    previousState: SdkLifecycleState,
    context?: {
      reason?: string;
      diagnostic?: string;
    },
  ) => void;
}
```

2. Call `onStateChange` in `setState` with context:
   - `IFRAME_LOADING` → `{ reason: "iframe_appended" }`
   - `HANDSHAKE_PENDING` → `{ reason: "iframe_loaded" }`
   - `READY` → `{ reason: "handshake_complete" }`
   - `DEGRADED` → `{ reason: "handshake_timeout", diagnostic: "No HANDSHAKE_READY received within ${timeout}ms" }`
   - `TERMINATED` → `{ reason: reason }`

3. Add `console.warn` in `DEGRADED` transition for development visibility.

4. Add a `getSnapshot()` diagnostic method to the controller:

```typescript
export interface EmbeddedHostRuntimeController {
  // ... existing
  getSnapshot(): {
    state: SdkLifecycleState;
    handshakeElapsedMs: number | null;
    lastFlushAt: string | null;
    bufferedEvents: number;
  };
}
```

**Test requirements**:

- Unit test: `onStateChange` fires for each state transition
- Unit test: `onStateChange` receives diagnostic context on DEGRADED
- Unit test: `getSnapshot()` returns expected values

---

### R2.3 — Add rate limiting on public endpoints

**Severity**: P1 (Security — MEDIUM D1)
**Files**:

- `insightfull/libs/prototype-testing/src/lib/routers/exchange-embedded-launch-token.trpc.ts`
- `insightfull/libs/prototype-testing/src/lib/routers/submit-prototype-event-batch.trpc.ts`
- `insightfull/libs/prototype-testing/src/lib/routers/get-embedded-session-bootstrap.trpc.ts`

**Problem**: All three public endpoints have no rate limiting. An attacker can brute-force tokens, flood batch submissions, or exhaust the token store.

**Fix**:

1. Apply the existing `burstRateLimiter` or `rateLimiter` middleware from `libs/server-kit` to each public endpoint.
2. Suggested limits:
   - `exchangeEmbeddedLaunchToken`: 10 requests/minute per IP
   - `getEmbeddedSessionBootstrap`: 30 requests/minute per IP
   - `submitPrototypeEventBatch`: 60 requests/minute per IP (legitimate batches arrive every few seconds)
3. The existing `DOCKER_COMPOSE` env check in the rate limiter will bypass limits in dev.

**Test requirements**:

- Unit test: exceeding rate limit returns `429`
- Unit test: within rate limit succeeds
- Dev environment bypass confirmed

---

### R2.4 — Validate `allowedOrigins` against server-side allowlist

**Severity**: P1 (Security — HIGH A2)
**Files**:

- `insightfull/libs/prototype-testing/src/lib/routers/issue-embedded-launch-token.trpc.ts`

**Problem**: The caller specifies `allowedOrigins` with no server-side validation. A compromised org member could set `allowedOrigins: ["https://attacker.com"]`.

**Fix**:

1. Add an `allowedPartnerDomains` field to the `organizations` table (or a new `organization_partner_domains` table).
2. In `issueEmbeddedLaunchToken`, validate that every `input.allowedOrigins` domain is in the org's registered allowlist.
3. If any domain is not registered, reject with `FORBIDDEN`.

```typescript
// issue-embedded-launch-token.trpc.ts — revised
.mutation(async ({ input }) => {
  const session = await sessionService.validateParticipantSession(/*...*/);
  // ...

  const registeredDomains = await getOrganizationPartnerDomains(session.organizationId);
  const requestedOrigins = input.allowedOrigins.map(o => new URL(o).hostname);
  const unregistered = requestedOrigins.filter(o => !registeredDomains.includes(o));

  if (unregistered.length > 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Origins not registered for this organization: ${unregistered.join(", ")}`,
    });
  }

  return embeddedSessionTokenService.issueLaunchToken({ /*...*/ });
});
```

**Test requirements**:

- Unit test: registered domain → accepted
- Unit test: unregistered domain → `FORBIDDEN`
- Unit test: mix of registered and unregistered → `FORBIDDEN`

---

### R2.5 — Add `event.source` validation in SDK message handler

**Severity**: P1 (Security — MEDIUM O3)
**Files**:

- `web-research-sdk/packages/core/src/embedded-host-runtime.ts`

**Problem**: `receiveMessage` at line 196 checks `origin !== this.targetOrigin` but does NOT check `event.source === iframeWindow?.contentWindow`. A malicious iframe on the same origin could forge handshake-ready messages.

**Fix**:

```typescript
// embedded-host-runtime.ts — revised receiveMessage
public receiveMessage(message: unknown, origin: string, source?: MessageEventSource | null): void {
  const iframeWindow = this.iframe?.contentWindow;
  if (!iframeWindow || origin !== this.targetOrigin) {
    return;
  }

  if (source && source !== iframeWindow) {
    return;
  }
  // ... rest unchanged
}
```

Update the `onMessage` wrapper:

```typescript
private readonly onMessage = (event: MessageEvent<unknown>) => {
  this.receiveMessage(event.data, event.origin, event.source);
};
```

**Test requirements**:

- Unit test: message from non-iframe source → ignored
- Unit test: message from correct iframe source → processed

---

### R2.6 — Add session token refresh mechanism

**Severity**: P1 (Architecture — HIGH)
**Files**:

- `insightfull/libs/prototype-testing/src/lib/services/embedded-session-token.service.ts`
- `insightfull/libs/prototype-testing/src/lib/routers/get-embedded-session-bootstrap.trpc.ts`

**Problem**: Session tokens have a fixed 15-minute TTL with no refresh endpoint. Studies lasting longer than 15 minutes will have their session tokens expire mid-session.

**Fix**:

1. Add a `refreshSessionToken` method to `EmbeddedSessionTokenService`:
   - Accepts: current session token
   - Validates: token is valid and not expired (or within a grace period)
   - Returns: new session token with fresh TTL, old token is invalidated
2. Add a `refreshEmbeddedSessionToken` tRPC endpoint (publicProcedure):
   - Input: `{ sessionToken: string }`
   - Output: `{ sessionToken: string, expiresAt: string }`
3. The SDK should call this when the token is approaching expiry (e.g., at 80% of TTL).

**Test requirements**:

- Unit test: refresh valid token → new token, old token invalidated
- Unit test: refresh expired token → rejected
- Unit test: refresh already-refreshed token → rejected

---

### R2.7 — Make iframe dimensions and z-index configurable

**Severity**: P1 (DX — HIGH)
**Files**:

- `web-research-sdk/packages/core/src/embedded-host-runtime.ts`

**Problem**: Hardcoded `width: 420px`, `height: 640px`, `zIndex: 2147483600`. Partners cannot customize the overlay appearance.

**Fix**:

1. Add to `EmbeddedHostRuntimeOptions`:

```typescript
export interface EmbeddedHostRuntimeOptions {
  // ... existing
  overlay?: {
    width?: string; // default "420px"
    height?: string; // default "640px"
    position?: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center";
    zIndex?: string; // default "2147483600"
    offset?: string; // default "16px"
  };
}
```

2. Apply these in `mount()` instead of hardcoded values.

**Test requirements**:

- Unit test: default dimensions applied when no overlay config
- Unit test: custom dimensions applied from config
- Unit test: each position variant renders correctly

---

## Gate R2

All P1 items resolved:

- [ ] R2.1: Token store is database-backed
- [ ] R2.2: SDK emits state change callbacks and diagnostics
- [ ] R2.3: Rate limiting on all public endpoints
- [ ] R2.4: allowedOrigins validated against org allowlist
- [ ] R2.5: event.source checked in SDK handler
- [ ] R2.6: Session token refresh endpoint exists
- [ ] R2.7: Overlay dimensions/position configurable

---

## Wave R3 — Code Quality & Missing Plan Requirements (P2)

**Gate R3**: Code quality findings resolved. Remaining plan requirements delivered.

### R3.1 — Deduplicate utility functions across contracts and host runtime

**Severity**: P2 (Quality)
**Files**:

- `web-research-sdk/packages/core/src/embedded-host-runtime.ts:299-305`
- `web-research-sdk/packages/contracts/src/schema.ts:39-45`

**Problem**: `isRecord` and `isNonEmptyString` are defined in both files with divergent semantics. The contracts version does NOT check `!Array.isArray` in `isRecord` and does NOT trim in `isNonEmptyString`.

**Fix**:

1. Export `isRecord` and `isNonEmptyString` from the contracts package.
2. Import and use them in `embedded-host-runtime.ts`.
3. Make the semantics consistent: always reject arrays in `isRecord`, always trim in `isNonEmptyString`.

---

### R3.2 — Extract shared envelope validator in contracts

**Severity**: P2 (Quality)
**Files**:

- `web-research-sdk/packages/contracts/src/schema.ts`

**Problem**: Six nearly identical validator functions (~400 lines) each repeat envelope validation (check `isRecord`, validate version, check type, validate session, validate `sentAt`). Adding a new message type requires copy-pasting an entire function.

**Fix**:

1. Create a `validateEnvelope` helper:

```typescript
function validateEnvelope<T extends string>(
  input: unknown,
  expectedType: T,
  issues: WebResearchValidationIssue[],
): { version: string; session: WebResearchSession; sentAt: string } | null {
  // shared version + session + sentAt validation
}
```

2. Each specific validator calls `validateEnvelope` then validates its unique fields.
3. New message types need only ~15 lines instead of ~50.

---

### R3.3 — Add `sectionId` to session claims

**Severity**: P2 (Completeness)
**Files**:

- `insightfull/libs/prototype-testing/src/lib/types/domain.types.ts`
- `insightfull/libs/prototype-testing/src/lib/services/embedded-session-token.service.ts`

**Problem**: Plan §4.1 requires `sectionId` in relation keys. `EmbeddedSessionClaims` omits it.

**Fix**:

1. Add `sectionId: number` to `EmbeddedSessionClaims`.
2. Thread `sectionId` through issue → exchange → bootstrap flow.
3. Validate `sectionId` in session mismatch check in `submitPrototypeEventBatch`.

---

### R3.4 — Add diagnostics message group to contracts

**Severity**: P2 (Completeness)
**Files**:

- `web-research-sdk/packages/contracts/src/constants.ts`
- `web-research-sdk/packages/contracts/src/types.ts`
- `web-research-sdk/packages/contracts/src/schema.ts`

**Problem**: Plan §5 requires a "Diagnostics" message group for schema errors, origin mismatch, unsupported version. Not implemented.

**Fix**:

1. Add `WEB_RESEARCH_DIAGNOSTIC_MESSAGE_TYPE` constant.
2. Add `WebResearchDiagnosticMessage` type with `code` (closed union of diagnostic codes) and optional `detail`.
3. Add `validateWebResearchDiagnosticMessage` validator.
4. The embedded runtime should emit diagnostics when it rejects a message (wrong version, bad format, etc.).

---

### R3.5 — Add `error` lifecycle message to contracts

**Severity**: P2 (Completeness)
**Files**:

- `web-research-sdk/packages/contracts/src/constants.ts`
- `web-research-sdk/packages/contracts/src/types.ts`

**Problem**: Plan §5 requires a session lifecycle `error` message. Not implemented.

**Fix**:

1. Add `WEB_RESEARCH_SESSION_ERROR_MESSAGE_TYPE`.
2. Add `WebResearchSessionErrorMessage` with `code`, `message`, `recoverable` flag.
3. The embedded runtime emits this when it encounters an unrecoverable error (e.g., session expired, auth failed).

---

### R3.6 — Remove `parse.ts` indirection

**Severity**: P2 (Cleanup)
**Files**:

- `web-research-sdk/packages/contracts/src/parse.ts`
- `web-research-sdk/packages/contracts/src/index.ts`

**Problem**: `parse.ts` re-exports every `validate*` function as `parse*` with zero transformation.

**Fix**:

1. Move the aliases to `index.ts` barrel export or export directly from `schema.ts`.
2. Delete `parse.ts`.
3. Update all consumers.

---

### R3.7 — Fix divergent `isRecord` semantics

**Severity**: P2 (Correctness)
**Files**:

- `web-research-sdk/packages/core/src/embedded-host-runtime.ts:299-301`

**Problem**: `isRecord` at line 299 does NOT reject arrays. If an attacker sends `[{type: "..."}]` as a message, the host runtime would treat it as a record, while the contracts parser would reject it. This creates asymmetric validation.

**Fix**: Resolved by R3.1 (use shared function from contracts that rejects arrays).

---

### R3.8 — Make `receiveMessage` internal

**Severity**: P2 (API Safety)
**Files**:

- `web-research-sdk/packages/core/src/embedded-host-runtime.ts`
- `web-research-sdk/packages/core/src/types.ts`

**Problem**: `receiveMessage` is on the public `EmbeddedHostRuntimeController` interface. Partners could call it directly to inject fake handshake-ready messages, bypassing origin validation.

**Fix**:

1. Remove `receiveMessage` from the `EmbeddedHostRuntimeController` interface.
2. Keep it as a private method on the class.
3. If needed for testing, expose it via a separate `TestEmbeddedHostRuntimeController` interface or a `__test_receiveMessage` method that's explicitly for testing only.

---

### R3.9 — Add metadata depth/size limits in event validation

**Severity**: P2 (Security — MEDIUM I1)
**Files**:

- `web-research-sdk/packages/contracts/src/schema.ts`
- `insightfull/libs/prototype-testing/src/lib/routers/submit-prototype-event-batch.trpc.ts`

**Problem**: Event `payload` is `Record<string, unknown>` and `metadata` is `z.record(z.string(), z.unknown()).optional()`. No depth or size limits.

**Fix**:

1. In contracts, add a `MAX_EVENT_PAYLOAD_DEPTH = 5` and `MAX_EVENT_PAYLOAD_SIZE_BYTES = 10240`.
2. Validate payload depth recursively in the schema parser.
3. In the batch router, reject events where `JSON.stringify(metadata).length > MAX_EVENT_METADATA_SIZE`.

---

### R3.10 — Add batch size cap in SDK transport

**Severity**: P2 (Security — MEDIUM I2)
**Files**:

- `web-research-sdk/packages/core/src/transport.ts`

**Problem**: `sanitizeBatchingOptions` has no upper bound on `batchSize`. A misconfigured SDK could attempt massive payloads.

**Fix**:

```typescript
const MAX_BATCH_SIZE = 200;

// In sanitizeBatchingOptions:
return {
  batchSize: Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(batchSize))),
  flushIntervalMs: Math.max(0, Math.floor(flushIntervalMs)),
};
```

---

### R3.11 — Add feature flags for embedded routes

**Severity**: P2 (Operability)
**Files**:

- `insightfull/client/src/App.tsx`
- `insightfull/libs/prototype-testing/src/lib/routers/index.router.ts`

**Problem**: Plan Phase 6 requires feature flags and kill switch. Neither exists.

**Fix**:

1. Add a Statsig feature gate: `embedded_partner_host_runtime`.
2. Gate the `/embedded/live-study` route on this flag.
3. Gate the embedded tRPC procedures on this flag (return `FORBIDDEN` if disabled).
4. This allows instant rollback without deployment.

---

### R3.12 — Unify shadow types

**Severity**: P2 (Quality)
**Files**:

- `web-research-sdk/packages/core/src/types.ts` (session, environment)
- `web-research-sdk/packages/contracts/src/types.ts`
- `insightfull/libs/prototype-testing/src/lib/types/domain.types.ts`

**Problem**: Three copies of `["dev", "staging", "prod"]` environment values exist across packages. `SessionMetadata` vs `WebResearchSession` have the same shape but different names.

**Fix**:

1. Contracts is the source of truth. Export `WebResearchEnvironment` and `WebResearchSession` from contracts.
2. SDK core re-exports or aliases these types.
3. Insightfull imports from the contracts package.
4. Delete the duplicated type definitions.

---

## Gate R3

All P2 items resolved:

- [ ] R3.1: Shared utility functions
- [ ] R3.2: Envelope validator deduplication
- [ ] R3.3: sectionId in claims
- [ ] R3.4: Diagnostics message group
- [ ] R3.5: Error lifecycle message
- [ ] R3.6: parse.ts removed
- [ ] R3.7: isRecord semantics aligned
- [ ] R3.8: receiveMessage internalized
- [ ] R3.9: Metadata depth/size limits
- [ ] R3.10: Batch size cap
- [ ] R3.11: Feature flags
- [ ] R3.12: Shadow types unified

---

## Summary Table

| ID    | Wave | Severity | Category     | Title                                | Est. Effort     |
| ----- | ---- | -------- | ------------ | ------------------------------------ | --------------- |
| R1.1  | R1   | P0       | Security     | HTTP Origin header validation        | S               |
| R1.2  | R1   | P0       | Security     | Bootstrap origin check               | XS              |
| R1.3  | R1   | P0       | Security     | Server-validated embed context       | M               |
| R1.4  | R1   | P0       | Security     | Non-embedded auth gap                | XS              |
| R1.5  | R1   | P0       | Architecture | Wire embedded route message consumer | L               |
| R1.6  | R1   | P0       | Correctness  | State guards on task signals         | S               |
| R1.7  | R1   | P0       | Correctness  | Max retry on complete loop           | S               |
| R2.1  | R2   | P1       | Architecture | Database-backed token store          | L               |
| R2.2  | R2   | P1       | Operability  | SDK lifecycle observability          | M               |
| R2.3  | R2   | P1       | Security     | Rate limiting on public endpoints    | S               |
| R2.4  | R2   | P1       | Security     | Server-side origin allowlist         | M               |
| R2.5  | R2   | P1       | Security     | event.source validation              | XS              |
| R2.6  | R2   | P1       | Architecture | Session token refresh                | M               |
| R2.7  | R2   | P1       | DX           | Configurable overlay dimensions      | S               |
| R3.1  | R3   | P2       | Quality      | Deduplicate utility functions        | XS              |
| R3.2  | R3   | P2       | Quality      | Shared envelope validator            | S               |
| R3.3  | R3   | P2       | Completeness | sectionId in claims                  | XS              |
| R3.4  | R3   | P2       | Completeness | Diagnostics message group            | S               |
| R3.5  | R3   | P2       | Completeness | Error lifecycle message              | S               |
| R3.6  | R3   | P2       | Cleanup      | Remove parse.ts                      | XS              |
| R3.7  | R3   | P2       | Correctness  | isRecord semantics                   | covered by R3.1 |
| R3.8  | R3   | P2       | API Safety   | Internalize receiveMessage           | XS              |
| R3.9  | R3   | P2       | Security     | Metadata depth/size limits           | S               |
| R3.10 | R3   | P2       | Security     | Batch size cap                       | XS              |
| R3.11 | R3   | P2       | Operability  | Feature flags                        | M               |
| R3.12 | R3   | P2       | Quality      | Unify shadow types                   | S               |

**Effort legend**: XS (< 1 hour), S (1-3 hours), M (half day), L (1-2 days)

---

## Recommended Execution Order

```
Week 1: R1.1 → R1.2 → R1.6 → R1.7 (security + correctness, no external deps)
Week 1-2: R1.3 → R1.5 (embedded route rewrite + message consumer — largest items)
Week 2: R2.1 (database token store — unblocks horizontal scaling)
Week 2-3: R2.2 → R2.3 → R2.5 → R2.6 → R2.7 (operational hardening)
Week 3: R2.4 (org domain allowlist — requires DB schema + admin UI)
Week 3-4: R3.* (quality wave, parallelizable across team)
```
