# @insightfull/web-research-sdk-recorder

Experimental rrweb recorder package for `@insightfull/web-research-sdk`.

- install: `yarn add @insightfull/web-research-sdk @insightfull/web-research-sdk-recorder`
- import: `attachInsightfullRecorder(sdk, options)`

This package intentionally keeps `rrweb` outside the core SDK package. It records only after the SDK iframe bridge is active and ready, uses conservative privacy defaults (`maskAllInputs` and `maskAllText`), and exposes stub uploader hooks for future backend integration.

Verified activity evidence can be forwarded with `uploadActivityEvidence`. A verified server-confirmed response completion stops capture, flushes pending chunks, and invokes `finalizeSession` once with `stopReason: "participant_completed"`.

```ts
attachInsightfullRecorder(sdk, {
  uploadChunk,
  uploadActivityEvidence,
  finalizeSession: ({ recordingSessionId, stopReason }) =>
    finalizeRecording({ recordingSessionId, stopReason }),
});
```

All three callbacks are optional. Existing recorder integrations retain their manual, detach, page-lifecycle, and study-close behavior when they are absent.
