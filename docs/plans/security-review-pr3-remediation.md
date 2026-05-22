# Security Review Remediation Plan — PR #3

**Date:** 2026-05-21
**Reviewer:** Staff Security Engineer
**Reference:** OWASP WSTG v4.2
**Status:** In Progress

---

## Findings Summary

| ID | Severity | Area | File(s) | Agent |
|----|----------|------|---------|-------|
| C-01 | Critical | Sandbox | embedded-host-runtime.ts | Agent A |
| H-01 | High | Capabilities | bridge.ts | Agent A |
| H-02 | High | Endpoint validation | client.ts | Agent A |
| H-03 | High | Token expiry | bridge.ts, embedded-host-runtime.ts | Agent A |
| H-04 | High | Deprecated apiKey | types.ts | Agent A |
| M-01 | Medium | Session fixation | client.ts | Agent A |
| M-02 | Medium | Event name validation | client.ts, protocol.ts | Agent A |
| M-03 | Medium | Session idle timeout | transport.ts | Agent B |
| M-04 | Medium | Arbitrary args/details | validation.ts (shared) | Agent B |
| M-05 | Medium | Fire-and-forget teardown | client.ts | Agent A |
| L-01 | Low | CSS injection docs | protocol.ts | Agent B |
| L-02 | Low | console.warn leak | embedded-host-runtime.ts | Agent A |
| L-03 | Low | Prototype pollution | schema.ts (contracts) | Agent C |
| L-04 | Low | Duplicated protocol | protocol.ts (core + shared) | Agent C |

---

## Agent Assignments

### Agent A — Core Runtime Security (client.ts, bridge.ts, embedded-host-runtime.ts, types.ts)

Files owned exclusively:
- `packages/core/src/client.ts`
- `packages/core/src/bridge.ts`
- `packages/core/src/embedded-host-runtime.ts`
- `packages/core/src/types.ts`

Findings:
- **C-01**: Remove `allow-same-origin` from sandbox attribute (or document accepted risk with compensating CSP)
- **H-01**: Default `authorizedCapabilities` to `[]` instead of `BRIDGE_CAPABILITIES`
- **H-02**: Add endpoint URL validation (HTTPS required, reject private IPs in prod)
- **H-03**: Add client-side token expiry check — emit diagnostic if expired
- **H-04**: Remove deprecated `apiKey` field from `WebResearchClientOptions`
- **M-01**: Validate externally-provided `sessionId` is UUID v4 format
- **M-02**: Validate `SdkEvent.name` against `WEB_RESEARCH_EVENT_NAMES` allowlist in `track()`
- **M-05**: Change `destroy()` to await teardown; add `navigator.sendBeacon` guidance
- **L-02**: Replace `console.warn` with diagnostics buffer; add optional logger

### Agent B — Transport & Validation Hardening (transport.ts, validation.ts in shared)

Files owned exclusively:
- `packages/core/src/transport.ts`
- `packages/shared/src/validation.ts`
- `packages/core/src/protocol.ts` (jsdoc comments only for L-01)

Findings:
- **M-03**: Add configurable session idle timeout to `WebResearchEventQueue`
- **M-04**: Add value-type constraints to `validateStringRecord` for `args` and `details` fields
- **L-01**: Add JSDoc `@security` annotations on `OverlayTailwindThemeOverrides` warning consumers to sanitize CSS values

### Agent C — Contracts & Dedup (schema.ts in contracts, protocol.ts dedup)

Files owned exclusively:
- `packages/contracts/src/schema.ts`
- `packages/shared/src/protocol.ts` (may need to coordinate exports)

Findings:
- **L-03**: Add prototype pollution key filtering (`__proto__`, `constructor`, `prototype`) to `isRecord` and `validatePayloadDepth`
- **L-04**: Deduplicate `protocol.ts` — make `packages/core/src/protocol.ts` re-export from `packages/shared/src/protocol.ts`

---

## Detailed Finding Specifications

### C-01: Sandbox `allow-same-origin` Discrepancy

**Severity:** Critical
**OWASP:** WSTG-CONF-02, WSTG-CLNT-01
**File:** `packages/core/src/embedded-host-runtime.ts:127-130`

PR description states `allow-same-origin` was removed, but the code still contains it. When combined with `allow-scripts`, the iframe can remove its own sandbox attribute, enabling full sandbox escape via XSS.

**Fix:** Remove `allow-same-origin` from the sandbox token list. If the overlay requires cookies/localStorage, document this as an accepted risk and ensure strict CSP and `frame-ancestors` on the overlay origin.

### H-01: Capability Negotiation Defaults to ALL

**Severity:** High
**OWASP:** WSTG-ATHZ-03
**File:** `packages/core/src/bridge.ts:495-496`

```typescript
const authorizedCapabilities =
  this.handshakeOptions.authorizedCapabilities ?? BRIDGE_CAPABILITIES;
```

Change to default to `[]` — require explicit opt-in for each capability.

### H-02: No Endpoint URL Validation

**Severity:** High
**OWASP:** WSTG-ATHN-01, WSTG-INPV-19
**File:** `packages/core/src/client.ts:40`

```typescript
this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
```

Add validation:
- Must be `https://` protocol (allow `http://` only for `localhost`/`127.0.0.1`)
- Reject RFC 1918 / link-local addresses when environment is `prod`
- Throw `Error` on invalid endpoints

### H-03: Token Expiry Not Enforced Client-Side

**Severity:** High
**OWASP:** WSTG-ATHN-04, WSTG-ATHN-09
**File:** `packages/core/src/bridge.ts`, `packages/core/src/embedded-host-runtime.ts`

The `overlayToken` and `overlayTokenExpiresAt` are validated as non-empty strings only. Add:
- Parse `overlayTokenExpiresAt` as a date
- Compare to `Date.now()`
- If expired, emit diagnostic `BRG_OVERLAY_TOKEN_EXPIRED` and refuse to send `overlay:init`
- In `embedded-host-runtime.ts`, validate token before dispatching handshake

### H-04: Deprecated `apiKey` Still Accepted

**Severity:** High
**OWASP:** WSTG-ATHN-02
**File:** `packages/core/src/types.ts:127-128`

Remove the `apiKey` field from `WebResearchClientOptions`. This is dead credential surface.

### M-01: Session Fixation via External Session ID

**Severity:** Medium
**OWASP:** WSTG-SESS-03
**File:** `packages/core/src/client.ts:44`

```typescript
sessionId: options.sessionId ?? crypto.randomUUID()
```

If `options.sessionId` is provided, validate it matches UUID v4 format:
```
/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
```

### M-02: SdkEvent Names Unvalidated

**Severity:** Medium
**OWASP:** WSTG-INPV
**File:** `packages/core/src/client.ts:59-67`, `packages/core/src/protocol.ts:148-151`

The `track()` method accepts any `name: string`. For events sent through the contracts transport, the schema validator enforces the allowlist. But the bridge transport path bypasses it.

Add validation in `track()`:
- Import `WEB_RESEARCH_EVENT_NAMES` from contracts
- For custom events, require a `custom:` prefix or a separate allowlist
- Throw on unrecognized event names

### M-03: No Session Idle Timeout

**Severity:** Medium
**OWASP:** WSTG-SESS-07
**File:** `packages/core/src/transport.ts`

Add a configurable `idleTimeoutMs` option to `WebResearchEventQueue`:
- Default: 30 minutes (1,800,000 ms)
- Reset timer on each `enqueue()` call
- On timeout, auto-complete the session with reason `"idle_timeout"`
- Allow `0` to disable

### M-04: Arbitrary Values in `args` and `details`

**Severity:** Medium
**OWASP:** WSTG-INPV
**File:** `packages/shared/src/validation.ts`

Add a `validateSafeStringRecord` function that constrains values to primitives:
- Allowed types: `string`, `number`, `boolean`, `null`
- Reject: objects, arrays, functions, symbols
- Apply to `OverlayUiCommandPayload.args` and `BridgeDiagnosticPayload.details`

### M-05: Fire-and-Forget Teardown

**Severity:** Medium
**OWASP:** WSTG-SESS-06
**File:** `packages/core/src/client.ts:157-159`

Change `destroy()` to return `Promise<void>` and await teardown. Add guidance for page-unload scenarios using `navigator.sendBeacon()`.

### L-01: CSS Injection via Theme Overrides

**Severity:** Low
**OWASP:** WSTG-CLNT-01
**File:** `packages/core/src/protocol.ts`

Add JSDoc `@security` annotation to `OverlayTailwindThemeOverrides`:
```typescript
/**
 * @security Consumers MUST sanitize these values before injecting into CSS.
 * Arbitrary CSS values could enable style injection attacks.
 */
```

### L-02: console.warn Leaks Diagnostic Info

**Severity:** Low
**OWASP:** WSTG-ERRH-01
**File:** `packages/core/src/embedded-host-runtime.ts:331-333`

Replace `console.warn` with the diagnostics buffer. Add an optional `logger` option to `EmbeddedHostRuntimeOptions` that defaults to a no-op. Only use `console.warn` if no logger is provided AND `environment` is not `prod`.

### L-03: Prototype Pollution Key Filtering

**Severity:** Low
**OWASP:** WSTG-INPV
**File:** `packages/contracts/src/schema.ts`

Add a `SAFE_KEY` check in `validatePayloadDepth` and the `isRecord` guard:
```typescript
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
```
Skip or reject keys in `UNSAFE_KEYS` during iteration.

### L-04: Duplicated Protocol Definitions

**Severity:** Low
**OWASP:** WSTG-CONF-02
**Files:** `packages/core/src/protocol.ts`, `packages/shared/src/protocol.ts`

Make `packages/core/src/protocol.ts` re-export from `packages/shared/src/protocol.ts` instead of duplicating 372 lines. Ensure no consumers break.
