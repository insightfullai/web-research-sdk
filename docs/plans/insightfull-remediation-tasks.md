# Insightfull Monorepo — Remediation Tasks

> **Purpose**: This document contains all tasks that must be implemented in the `insightfull` monorepo.
> Tasks in the `web-research-sdk` repo are already complete (R1.6, R1.7).
> Run 3 agents in parallel using the task groupings below.

---

## Context: What's Already Done in `web-research-sdk`

The SDK repo already has:

- **`@insightfull/web-research-sdk-contracts`** package (`packages/contracts/`) with:
  - Message type constants: `WEB_RESEARCH_BATCH_MESSAGE_TYPE`, `WEB_RESEARCH_COMPLETE_MESSAGE_TYPE`, `WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE`, `WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE`, `WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE`
  - Protocol version: `WEB_RESEARCH_PROTOCOL_VERSION = "1.0"`
  - Validators: `validateWebResearchBatchMessage`, `validateWebResearchCompleteMessage`, `validateWebResearchTaskCompleteSignalMessage`, `validateWebResearchTaskAbandonSignalMessage`
  - Aliases in `parse.ts`: `parseWebResearchBatchMessage`, `parseWebResearchCompleteMessage`, etc.
  - Types: `WebResearchBatchMessage`, `WebResearchCompleteMessage`, `WebResearchTaskCompleteSignalMessage`, `WebResearchTaskAbandonSignalMessage`, `WebResearchSession`, `WebResearchEvent`
- **R1.6 done**: `finalizeWithTaskSignal` now checks `state === "READY"` before posting; `mount()` rejects during teardown
- **R1.7 done**: `complete()` has `MAX_COMPLETE_FLUSH_RETRIES = 5` with consecutive failure tracking
- The contracts package is published as `@insightfull/web-research-sdk-contracts` — insightfull should already depend on it

---

## Agent 1: Server-Side Origin Validation (R1.1 + R1.2)

### R1.1 — Replace client-supplied origin with HTTP Origin header

**Severity**: P0 (Security — CRITICAL O1)

**Files to modify**:
- `libs/prototype-testing/src/lib/routers/exchange-embedded-launch-token.trpc.ts`
- `libs/prototype-testing/src/lib/routers/submit-prototype-event-batch.trpc.ts`
- `libs/prototype-testing/src/lib/routers/get-embedded-session-bootstrap.trpc.ts`

**Problem**: All three public endpoints accept `origin` from the tRPC input body. An attacker with a captured token can supply any origin string, bypassing origin enforcement.

**Fix** (apply to all three files):

1. Extract the actual HTTP `Origin` header from the tRPC context.
2. If `Origin` is absent, fall back to `Referer` header. If neither is present, reject with `400 BAD_REQUEST`.
3. Normalize the extracted origin via `new URL(origin).origin`.
4. Pass the server-extracted origin to `embeddedSessionTokenService` — never trust `input.embedded.origin` or `input.origin`.
5. Remove `origin` from all three input schemas, or keep it as an optional field for diagnostic logging only (never for validation).

```typescript
// Pattern to use in all three routers:
const httpOrigin = ctx.req.headers.origin ?? ctx.req.headers.referer;
if (!httpOrigin) {
  throw new TRPCError({ code: "BAD_REQUEST", message: "Missing Origin header" });
}
const resolvedOrigin = new URL(httpOrigin).origin;
// Use resolvedOrigin instead of any input.origin or input.embedded.origin
```

**Test requirements**:
- Unit test: calling exchange with mismatched `Origin` header vs `allowedOrigins` → rejected
- Unit test: calling exchange without `Origin` header → rejected with `BAD_REQUEST`
- Unit test: calling exchange with `Origin` matching `allowedOrigins` but different body `origin` → accepted (body origin ignored)

### R1.2 — Always validate origin in `getEmbeddedSessionBootstrap`

**Severity**: P0 (Security — HIGH O2)

**Files to modify**:
- `libs/prototype-testing/src/lib/routers/get-embedded-session-bootstrap.trpc.ts`
- `libs/prototype-testing/src/lib/services/embedded-session-token.service.ts`
- `libs/prototype-testing/src/lib/types/domain.types.ts` (where `GetSessionBootstrapInput` is likely defined)

**Problem**: `getSessionBootstrap` is called without passing `origin`, and the service makes origin validation optional (`if (input.origin)`). The origin allowlist is never checked at bootstrap time.

**Fix**:

1. In the router, extract the HTTP `Origin` header (same pattern as R1.1).
2. Pass it to `getSessionBootstrap({ sessionToken, origin: resolvedOrigin })`.
3. In `domain.types.ts`, make `origin` required in `GetSessionBootstrapInput`:
   ```typescript
   export interface GetSessionBootstrapInput {
     now?: Date;
     origin: string;  // was optional, now required
     sessionToken: string;
   }
   ```
4. In `embedded-session-token.service.ts`, remove the `if (input.origin)` guard — always validate:
   ```typescript
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

## Agent 2: Embedded Route Rewrite (R1.3 + R1.5)

These two tasks both modify `EmbeddedStudyRuntimeRoute.tsx` — combine into a single coherent rewrite.

### R1.3 — Validate `embedBootstrap` context server-side

**Severity**: P0 (Security — HIGH S1)

**Files to modify**:
- `libs/multi-section-flow/src/lib/components/orchestrator/EmbeddedStudyRuntimeRoute.tsx`

**Problem**: `embedBootstrap` query parameter is parsed as JSON containing `responseId` and `shareUrl` with no server-side validation. An attacker can craft `/embedded/live-study?embedBootstrap={"responseId":1,"shareUrl":"fake"}` to access any session.

**Fix (Part A — Token-bound launch context)**:
1. Replace `embedBootstrap` with a `launchToken` query parameter.
2. On mount, call `getEmbeddedSessionBootstrap` with the launch token (after exchange) to retrieve server-authoritative claims.
3. `responseId` and `shareUrl` come from server claims, never from client-controlled query params.

**Fix (Part B — Remove global variable)**:
1. Remove `window.__INSIGHTFULL_EMBED_LAUNCH_CONTEXT__` entirely.
2. All context comes from the server via the token exchange flow.

### R1.5 — Wire the embedded route to consume SDK messages

**Severity**: P0 (Architecture — CRITICAL)

**Files to modify**:
- `libs/multi-section-flow/src/lib/components/orchestrator/EmbeddedStudyRuntimeRoute.tsx`
- `libs/multi-section-flow/src/lib/components/sections/PrototypeTestSection.tsx` (if needed for event forwarding)

**Problem**: `EmbeddedStudyRuntimeRoute.tsx` has no `window.addEventListener("message", ...)` handler. The iframe route ignores everything the SDK sends.

**Fix**:

1. Add a `useEffect` that registers a `message` event listener on `window`.
2. Import validators from `@insightfull/web-research-sdk-contracts`:
   - `parseWebResearchBatchMessage` (aliased from `validateWebResearchBatchMessage`)
   - `parseWebResearchCompleteMessage`
   - `parseWebResearchTaskCompleteSignalMessage`
   - `parseWebResearchTaskAbandonSignalMessage`
   - `WEB_RESEARCH_BATCH_MESSAGE_TYPE`
3. Origin-check against the expected SDK origin (from session claims).
4. Normalize validated batch events into prototype event schema (`eventType`, `x`, `y`, `timestampMs`, etc.) and forward to `submitPrototypeEventBatch` via tRPC mutation.
5. Handle `task_complete` and `task_abandon` signal messages — update study flow state.

**Combined skeleton for R1.3 + R1.5**:

```typescript
import {
  parseWebResearchBatchMessage,
  parseWebResearchTaskCompleteSignalMessage,
  parseWebResearchTaskAbandonSignalMessage,
} from "@insightfull/web-research-sdk-contracts";

export function EmbeddedStudyRuntimeRoute() {
  const [searchParams] = useSearchParams();
  const launchToken = searchParams.get("launchToken");

  // R1.3: server-validated claims
  const { data, error } = useQuery(
    getEmbeddedSessionBootstrap.queryOptions({ sessionToken: launchToken ?? "" })
  );

  // R1.5: message listener
  useEffect(() => {
    if (!data?.claims) return;

    const handler = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;

      const parsed = parseWebResearchBatchMessage(event.data);
      if (!parsed.success) {
        console.warn("Invalid batch message", parsed.issues);
        return;
      }

      const normalized = normalizeEvents(parsed.value.events);
      submitBatchMutation.mutate({
        sectionResponseId: data.claims.sectionResponseId,
        baseResponseId: data.claims.baseResponseId,
        events: normalized,
        embedded: {
          origin: event.origin,
          sessionId: parsed.value.session.sessionId,
          sessionToken: launchToken ?? "",
          source: "partner_host",
          version: parsed.value.version,
        },
      });
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [data?.claims]);

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
- Unit test: valid batch message → normalized events submitted
- Unit test: invalid batch message → no submission, warning logged
- Unit test: wrong origin → message ignored
- E2e test: direct URL with fabricated `responseId` → error state, no data access

---

## Agent 3: Auth Gap + Rate Limiting + Origin Allowlist (R1.4 + R2.3 + R2.4)

### R1.4 — Document non-embedded auth gap

**Severity**: P0 (Security — CRITICAL A1)

**Files to modify**:
- `libs/prototype-testing/src/lib/routers/submit-prototype-event-batch.trpc.ts`

**Fix (Option C — document only)**:
Add a `// TODO(security):` comment in the non-embedded code path:

```typescript
// TODO(security): The non-embedded path lacks participant-level authentication.
// Session IDs are sequential integers and guessable. A tracked issue should be filed
// for adding participant session token verification in the non-embedded path.
// See remediation plan R1.4.
```

### R2.3 — Add rate limiting on public endpoints

**Severity**: P1 (Security — MEDIUM D1)

**Files to modify**:
- `libs/prototype-testing/src/lib/routers/exchange-embedded-launch-token.trpc.ts`
- `libs/prototype-testing/src/lib/routers/submit-prototype-event-batch.trpc.ts`
- `libs/prototype-testing/src/lib/routers/get-embedded-session-bootstrap.trpc.ts`

**Problem**: All three public endpoints have no rate limiting. An attacker can brute-force tokens, flood batch submissions, or exhaust the token store.

**Fix**:

1. Apply the existing `burstRateLimiter` or `rateLimiter` middleware from `libs/server-kit` to each public endpoint.
2. Suggested limits:
   - `exchangeEmbeddedLaunchToken`: 10 requests/minute per IP
   - `getEmbeddedSessionBootstrap`: 30 requests/minute per IP
   - `submitPrototypeEventBatch`: 60 requests/minute per IP
3. The existing `DOCKER_COMPOSE` env check in the rate limiter should bypass limits in dev.

**Test requirements**:
- Unit test: exceeding rate limit returns `429`
- Unit test: within rate limit succeeds
- Dev environment bypass confirmed

### R2.4 — Validate `allowedOrigins` against server-side allowlist

**Severity**: P1 (Security — HIGH A2)

**Files to modify**:
- `libs/prototype-testing/src/lib/routers/issue-embedded-launch-token.trpc.ts`

**Problem**: The caller specifies `allowedOrigins` with no server-side validation. A compromised org member could set `allowedOrigins: ["https://attacker.com"]`.

**Fix**:

1. Add an `allowedPartnerDomains` field to the `organizations` table (or a new `organization_partner_domains` table).
2. In `issueEmbeddedLaunchToken`, validate that every `input.allowedOrigins` domain is in the org's registered allowlist.
3. If any domain is not registered, reject with `FORBIDDEN`.

```typescript
const registeredDomains = await getOrganizationPartnerDomains(session.organizationId);
const requestedOrigins = input.allowedOrigins.map(o => new URL(o).hostname);
const unregistered = requestedOrigins.filter(o => !registeredDomains.includes(o));

if (unregistered.length > 0) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `Origins not registered for this organization: ${unregistered.join(", ")}`,
  });
}
```

**Test requirements**:
- Unit test: registered domain → accepted
- Unit test: unregistered domain → `FORBIDDEN`
- Unit test: mix of registered and unregistered → `FORBIDDEN`

---

## Agent Assignment Summary

| Agent | Tasks | Scope | Est. Effort |
|-------|-------|-------|-------------|
| **Agent 1** | R1.1 + R1.2 | Server-side origin validation across 3 tRPC routers + token service + domain types | S + XS |
| **Agent 2** | R1.3 + R1.5 | Embedded route rewrite (remove `embedBootstrap`, add `launchToken`, add message listener) | M + L |
| **Agent 3** | R1.4 + R2.3 + R2.4 | Auth gap TODO comment + rate limiting on 3 endpoints + `allowedOrigins` validation against org allowlist | XS + S + M |

All three agents can work in parallel — no cross-dependencies between groups.
