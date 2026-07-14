# Real App Testing Recorder Plan

## Goal

When the SDK is embedded in a real customer app, the active Insightfull study iframe should receive enough context to run an actual-app usability test. The iframe-side agent needs to understand what the participant sees, what changed after each action, and how the session unfolded over time.

The model should be closer to prototype testing session replay than analytics auto-instrumentation. Prototype testing works today because the system has a frame image plus interaction coordinates. For actual app testing, the SDK must capture the app screen state itself. We should use rrweb as the battle-tested recording substrate and ship it in a separate opt-in package so the core SDK stays small.

## Validated Current State

### This SDK Repository

- `packages/core/src/auto-tracker/auto-tracker.ts` only tracks pageviews through initial load, `history.pushState`, `history.replaceState`, and `popstate`.
- `packages/core/src/insightfull-sdk.ts` queues events for telemetry and evaluates study triggers, but does not forward events to rendered iframes.
- `packages/core/src/iframe-renderer/iframe-renderer.ts` passes initial SDK context through the iframe URL `ctx` query parameter and does not keep a runtime iframe bridge reference.
- There is no `postMessage`, `contentWindow`, `MessageEvent`, or host-to-iframe command code in `packages/core/src`.
- There is no rrweb dependency or equivalent DOM/session recording implementation in this repository.
- `packages/test-app-react/e2e/runtime.spec.ts` expects `dom.click`, `dom.input`, `dom.change`, `dom.submit`, and `navigation`, but `packages/test-app-react/src/main.tsx` does not currently populate the captured output. That test looks ahead of the implementation.

### `../insightfull` Validation

- `../insightfull/libs/web-research-sdk/src/lib/auto-tracker/auto-tracker.ts` has the same pageview-only behavior.
- `../insightfull/libs/web-research-sdk/src/lib/iframe-renderer/iframe-renderer.ts` also only passes initial context through the iframe URL.
- `../insightfull/libs/web-research-sdk/src/lib/insightfull-sdk.ts` has an older custom trigger hook named `onStudyTrigger`, but it still only passes `study`, `iframeUrl`, and `context`. It does not define or send runtime iframe commands.
- `../insightfull/libs/sdk-management/src/lib/routers/ingest-sdk-telemetry.trpc.ts` defines the closest existing backend schema: SDK telemetry events have `eventType`, optional `eventName`, optional arbitrary `payload`, optional `url`, optional `userId`, and required `visitorId`. This is an ingestion schema, not a recording or iframe command schema.
- `../insightfull/db/schema.ts` includes `studies.prototype_test_enabled` with the comment `SDK V2: Enable auto-tracking for embedded prototype tests`. The current SDK config path does not expose this field to the SDK.
- `../insightfull/libs/studies/src/lib/types.ts` has SDK response attribution metadata (`source`, `sdkEnvironmentId`, `sdkVisitorId`, `sdkUserId`, `sdkVersion`, `customId`, `triggerEvent`, `customAttributes`). This is response attribution, not recording.
- `../insightfull/libs/prototype-testing-react` records replayable sessions by storing events over known prototype frame images. It does not record arbitrary live app DOM or pixels.
- `../insightfull/package.json` does not include rrweb, html2canvas, or a browser session recording dependency today.

Conclusion: we have reusable concepts and backend storage for arbitrary telemetry payloads, plus a prototype replay model to mirror. We do not have actual-app recording yet. Click forwarding alone is insufficient because the agent would not see the underlying screen.

## Product Model

Actual app testing should produce a replayable session timeline:

- DOM/screen state captured by rrweb.
- Interaction events such as click, input, scroll, navigation, and viewport resize.
- SDK attribution context: environment, visitor, user, custom IDs, trigger event, and study/response IDs.
- A live bridge so the iframe-side agent can react while the session is in progress.
- A persisted recording upload so researchers can replay the full app test later.

This becomes the actual-app equivalent of prototype testing:

- Prototype testing: known frame images plus interaction coordinates.
- Actual app testing: rrweb DOM snapshots/mutations plus interaction events.

## V1 Non-Goals

- No pre-trigger recording.
- No researcher-facing replay UI in the first SDK PR.
- No custom renderer support unless the bridge registration API is trivial and safe.
- No resumable multi-session upload protocol in the first SDK PR.
- No iframe agent summarization over raw rrweb events in the first SDK PR.
- No attempt to capture cross-origin iframe contents, canvas, WebGL, or video faithfully in v1.

## Package Strategy

Keep `@insightfull/web-research-sdk` small and dependency-light. Add a separate opt-in package for recording:

- Workspace package: `packages/recorder`
- Public package: `@insightfull/web-research-sdk-recorder`
- Depends on rrweb and replay-specific helpers.
- Exposes a small integration surface that attaches to an existing `InsightfullSDK` instance.

Example host usage:

```ts
import { InsightfullSDK } from "@insightfull/web-research-sdk";
import { attachInsightfullRecorder } from "@insightfull/web-research-sdk-recorder";

const sdk = InsightfullSDK.init({ clientId: "env_abc123" });

attachInsightfullRecorder(sdk, {
  enabled: true,
  maskAllInputs: true,
  maskAllText: true,
});
```

Core SDK responsibilities:

- Render/describe studies.
- Register active iframes and provide safe iframe bridge primitives.
- Provide minimal session/context metadata to the recorder package.
- Continue lightweight telemetry ingestion.
- Never import rrweb.

Recorder package responsibilities:

- Start and stop rrweb recording.
- Batch and upload recording chunks.
- Forward live recording events to the active iframe bridge.
- Own privacy controls, event caps, payload sizing, and final flush behavior for recorded DOM events.

## Session Lifecycle

Define an explicit recorder state machine before implementation:

```ts
type RecorderState =
  | "idle"
  | "awaiting_iframe_ready"
  | "recording"
  | "flushing"
  | "completed"
  | "failed"
  | "aborted";
```

Initial v1 transitions:

- `idle -> awaiting_iframe_ready`: a matching actual-app-testing study renders an iframe.
- `awaiting_iframe_ready -> recording`: iframe handshake succeeds and upload session is available.
- `recording -> flushing`: study closes, SDK destroys, page hides/unloads, max duration is reached, or response completes.
- `flushing -> completed`: all required chunks are acknowledged.
- `flushing -> failed`: final upload cannot be acknowledged after retry budget.
- Any active state -> `aborted`: recorder is manually stopped or feature gate changes.

Stop reasons should be recorded: `study_closed`, `sdk_destroyed`, `pagehide`, `beforeunload`, `response_completed`, `max_duration`, `manual_stop`, `error`.

## Bridge Protocol V1

The core SDK should expose a bridge without knowing about rrweb. The bridge should support iframe readiness and exact-origin messaging.

Messages from host to iframe:

```ts
type InsightfullIframeMessage =
  | InsightfullRecordingSessionMessage
  | InsightfullRecordingLiveEventMessage;

interface InsightfullRecordingSessionMessage {
  type: "insightfull.recording_session";
  version: 1;
  recordingSessionId: string;
  state: "started" | "stopped";
  context: InsightfullRecordingContext;
}

interface InsightfullRecordingLiveEventMessage {
  type: "insightfull.recording_event";
  version: 1;
  recordingSessionId: string;
  format: "rrweb";
  formatVersion: string;
  event: unknown;
}

interface InsightfullRecordingContext {
  sdkEnvironmentId: string;
  visitorId: string;
  userId: string | null;
  customId: Record<string, string>;
  url: string;
  path: string;
  studyId: number;
  responseId?: number;
  sectionResponseId?: number;
}
```

Messages from iframe to host:

```ts
interface InsightfullIframeReadyMessage {
  type: "insightfull.iframe_ready";
  version: 1;
  studyId: number;
  nonce: string;
}
```

Bridge rules:

- Host computes `targetOrigin` from the generated iframe URL; never use `*`.
- Iframe validates `event.origin` and `event.source === window.parent`.
- Include a per-session nonce or capability token in the initial iframe context and iframe-ready message.
- Queue live events until iframe readiness is confirmed, with a bounded queue.
- If a custom renderer is supported, expose bridge registration helpers in `InsightfullStudyRenderPayload` rather than asking the host app to reconstruct origins.

## Recording Envelope And Upload Contract

rrweb emits a stream of recording events. Wrap those events in an Insightfull envelope so we can validate, associate, and version the stream without altering rrweb internals.

Session creation metadata should be sent once:

```ts
interface InsightfullRecordingSessionStart {
  recordingSessionId: string;
  sdkEnvironmentId: string;
  studyId: number;
  responseId?: number;
  sectionResponseId?: number;
  visitorId: string;
  userId?: string;
  sdkVersion: string;
  recorderVersion: string;
  recordingFormat: "rrweb";
  recordingFormatVersion: string;
  privacyOptions: InsightfullRecorderPrivacyOptions;
  startedAt: number;
}
```

Chunks should be small and idempotent:

```ts
interface InsightfullRecordingChunkUpload {
  recordingSessionId: string;
  sequence: number;
  checksum: string;
  startedAt: number;
  endedAt: number;
  eventCount: number;
  events: unknown[];
}
```

Upload rules:

- Server accepts duplicate `(recordingSessionId, sequence)` uploads when checksum matches.
- Server rejects duplicate sequence numbers with different checksums.
- Client enforces max chunk events, max chunk bytes, max session duration, and max total bytes.
- Client uses retry with backoff for normal chunks.
- Client uses `sendBeacon` for small final critical chunks and `fetch(..., { keepalive: true })` as a fallback where appropriate.
- Client records dropped chunks and upload failures as SDK diagnostic telemetry.

## Backend Persistence Model

Do not reuse lightweight SDK telemetry ingestion for recordings. Recordings need separate storage and retention controls.

Recommended model in `../insightfull`:

```ts
recording_sessions -
  id -
  organization_id -
  sdk_environment_id -
  study_id -
  response_id -
  section_response_id -
  visitor_id -
  user_id_hash -
  status -
  started_at -
  ended_at -
  sdk_version -
  recorder_version -
  recording_format -
  recording_format_version -
  privacy_options -
  total_chunks -
  total_bytes -
  event_count;

recording_chunks -
  recording_session_id -
  sequence -
  started_at -
  ended_at -
  event_count -
  byte_size -
  checksum -
  storage_key -
  created_at;
```

Persistence rules:

- Store large chunks in object storage, not Postgres JSONB.
- Store metadata and object storage pointers in Postgres.
- Add a unique index on `(recording_session_id, sequence)`.
- Authorize replay access through study/organization membership.
- Add retention and deletion paths.
- Add dedicated recording rate limits separate from SDK telemetry.
- Validate CORS/origin against SDK environment allowlisted domains.
- Prefer a new `realAppTestingEnabled` field over reusing `prototypeTestEnabled`.
- Use a backend-minted upload token scoped to environment, study, response, origin, and expiry. Do not authorize recording uploads with public `clientId` alone.

## Privacy And Redaction

Recording a live app creates a much larger privacy surface than click telemetry. Defaults must be conservative.

Default v1 posture:

- `maskAllInputs: true`
- `maskAllText: true`
- Strip query params from URLs unless explicitly allowlisted.
- Block common sensitive routes such as auth, billing, checkout payment, account settings, and admin pages unless explicitly allowlisted.
- Block known payment/auth selectors.
- Do not include raw `customAttributes` in every chunk or live event.
- Store a privacy options snapshot for every recording session.

Initial recorder options:

```ts
interface InsightfullRecorderOptions {
  enabled?: boolean;
  maskAllInputs?: boolean;
  maskAllText?: boolean;
  blockClass?: string | RegExp;
  ignoreClass?: string | RegExp;
  routeAllowlist?: Array<string | RegExp>;
  routeDenylist?: Array<string | RegExp>;
  uploadIntervalMs?: number;
  maxChunkEvents?: number;
  maxChunkBytes?: number;
  maxSessionDurationMs?: number;
}
```

Privacy notes:

- DOM text, aria labels, placeholders, class names, selectors, URLs, user IDs, custom IDs, and custom attributes can all leak sensitive data.
- Prefer metadata allowlists over broad metadata forwarding.
- Product and docs should require customer notice/consent before enabling actual-app recording.
- Replay access should be audited server-side.
- Consider encryption at rest for recording chunks.

## rrweb Replay Limitations

Document these limitations before any customer beta:

- Cross-origin iframe contents are not captured.
- Canvas, WebGL, video, and closed shadow DOM may not replay accurately.
- External resources can disappear or render differently later.
- Large mutation-heavy pages can produce high event volume.
- Responsive layouts may replay differently if viewport/device context is not preserved.
- CSP, ad blockers, or network policy can block uploads or iframe communication.

## Observability

Add diagnostic events or metrics for:

- Recorder package attached.
- Recording session started/stopped.
- Iframe handshake success/failure.
- Live bridge message dropped due to iframe not ready.
- Chunk upload success/failure/retry.
- Final flush success/failure.
- Max duration/bytes reached.
- rrweb recorder errors.

These diagnostics should be lightweight telemetry, not recording chunks.

## Implementation Milestones

### Milestone 1: API Shape And Core Bridge

- Rename this initiative internally from auto-instrumented commands to actual-app recording.
- Decide final package name, likely `@insightfull/web-research-sdk-recorder`.
- Add core iframe bridge primitives without rrweb.
- Add iframe readiness handshake and exact-origin `postMessage` support.
- Expose recorder-safe SDK context getters.
- Add unit tests for message shape, target origin, readiness, no active iframe no-op, and bounded queue behavior.

### Milestone 2: Recorder Package Local MVP

- Add `packages/recorder` with rrweb as a dependency.
- Export `attachInsightfullRecorder(sdk, options)`.
- Start rrweb only when an actual-app-testing study iframe is active and ready.
- Forward live rrweb events to the iframe bridge.
- Batch chunks locally with hard caps.
- Stop and flush when the SDK is destroyed, the study is closed, max duration is reached, or page lifecycle requires it.
- Add a browser smoke test for rrweb behavior.

### Milestone 3: Upload API And Persistence

- Add recording session creation and chunk upload endpoints in `../insightfull`.
- Persist session metadata in Postgres and chunks in object storage.
- Implement idempotent chunk upload with checksum validation.
- Add rate limits, origin validation, upload token validation, and retention policy.
- Add API tests for chunk upload validation, duplicate chunk behavior, and access control.

### Milestone 4: Iframe Agent Consumption

- Add iframe-side validators for recording bridge messages in `../insightfull`.
- Build a rolling live event buffer for the agent.
- Convert rrweb events into an agent-friendly summary when possible: current URL, recent clicks, navigation changes, form interactions, and visible text only if allowed.
- Avoid forcing the agent to reason over raw rrweb events directly as the long-term API.

### Milestone 5: Researcher Replay UI

- Decide whether to use rrweb-player or a custom player around rrweb replay APIs.
- Link recording sessions from study responses.
- Add replay access for researchers.
- Preserve prototype-test replay separately unless we intentionally unify the UI later.

### Milestone 6: Integration Tests

- Add SDK unit tests for bridge behavior without rrweb.
- Add recorder package tests for start, stop, batching, redaction options, and final flush.
- Add a test-app integration that confirms importing the recorder package captures chunks and sends live iframe messages.
- Add `../insightfull` API tests for session creation, chunk upload, and replay retrieval.
- Add one end-to-end actual-app-testing path once iframe agent consumption exists.

## Blocking V1 Decisions

- What field gates this behavior: new `realAppTestingEnabled` vs existing `prototypeTestEnabled`?
- Should recording start only after the study iframe opens, or does v1 need pre-trigger context? Recommendation: no pre-trigger in v1.
- What exact privacy defaults ship in beta? Recommendation: `maskAllInputs: true`, `maskAllText: true`.
- Does v1 support custom renderers? Recommendation: defer unless bridge registration stays very small.
- What max duration, max bytes, and max chunk size should be enforced client-side and server-side?
- Does the iframe agent consume raw rrweb live events in v1, or a small derived summary? Recommendation: raw events plus minimal summary for v1.

## Recommended First PR Sequence

### PR 1: Core Bridge Only

- Add active iframe registration in the default renderer.
- Add exact-origin bridge messaging and iframe readiness handshake.
- Add bounded pre-ready message queue.
- Expose minimal recorder-safe SDK context getters.
- Add tests proving no rrweb dependency is introduced into core.

### PR 2: Experimental Recorder Package

- Add `packages/recorder` with rrweb.
- Export `attachInsightfullRecorder`.
- Start/stop recording manually or when a default-rendered study iframe is active.
- Use conservative rrweb privacy defaults.
- Forward live rrweb events to the bridge.
- Keep upload behind a stub interface if backend is not ready.

### PR 3: Minimal Upload Path

- Add real session creation and chunk upload endpoints.
- Add client chunk upload with count/byte/time caps.
- Add retry/backoff and best-effort final flush.
- Add backend idempotency by sequence/checksum.

### PR 4: Iframe Consumption

- Add iframe-side listener and validators.
- Keep a rolling in-memory recording event buffer.
- Feed current URL and recent interaction context to the agent.
- Add one end-to-end happy path.

This sequence keeps core clean while proving the recording substrate, opt-in package boundary, bridge lifecycle, privacy defaults, and upload contract before investing in researcher replay UI.
