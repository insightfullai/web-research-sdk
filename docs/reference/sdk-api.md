# SDK API reference

## Initialize

```ts
const sdk = InsightfullSDK.init(options);
await sdk.ready();
```

`init()` never blocks application rendering. `ready()` resolves after the environment configuration loads and rejects with `InsightfullInitializationError` when configuration is unavailable.

### Status

```ts
sdk.status;
// "initializing" | "ready" | "unavailable" | "destroyed"

sdk.initializationError;
// InsightfullInitializationError | null

sdk.version;
// SDK package version reported to Insightfull connection diagnostics
```

Error codes:

| Code                        | Meaning                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `configuration_unavailable` | The environment is missing, inactive, invalid, or temporarily unreachable after retries. |
| `sdk_destroyed`             | The instance was destroyed before it became ready.                                       |

## Identity

```ts
sdk.identify("user_123", { plan: "pro" });
sdk.setCustomId("account", "acct_123");
sdk.setAttribute("company", "Acme");
sdk.setAttributes({ plan: "pro", seats: 20 });
sdk.removeAttributes(["plan", "seats"]);
```

Call `reset()` during logout or account switching. It flushes queued events under the previous identity, dismisses the active study, clears identifiers and attributes, and creates a new anonymous visitor ID.

```ts
await sdk.reset();
```

Read-only snapshots are available as `userId`, `currentVisitorId`, `currentCustomIds`, and `currentAttributes`.

## Events and host context

```ts
sdk.track("checkout_completed", { total: 99.99 });
```

Optional host context is accepted only as the third argument and is validated before delivery:

```ts
sdk.track("checkout_promo_help_requested", undefined, {
  hostContext: {
    version: 1,
    scenario: { id: "checkout_v1", label: "Checkout" },
    surface: {
      id: "checkout_review",
      label: "Checkout review",
      routeTemplate: "/checkout",
    },
    task: { id: "apply_promo", label: "Apply a promotional code" },
    state: { promoEntryAvailable: true },
  },
});
```

The SDK never infers host context from the page DOM, URL, document title, event payload, or identity traits.

## Active interview lifecycle

```ts
sdk.currentStudyId;
sdk.currentStudyDisplayState;

sdk.minimizeStudy();
sdk.expandStudy();
sdk.dismissStudy();
```

`dismissStudy()` runs custom-renderer cleanup, unregisters the bridge, and removes the default renderer. It is safe when no study is active.

## Verified bridge callbacks

```ts
const stopActivity = sdk.onActivityEvidence((message) => {
  // Correlated, privacy-safe activity evidence from the verified active iframe.
});

const stopCompletion = sdk.onResponseCompleted((message) => {
  // Server-confirmed completion, delivered once per response per page lifecycle.
});

stopActivity();
stopCompletion();
```

## Cleanup

```ts
await sdk.destroy();
```

`destroy()` is idempotent. It dismisses the active study, stops page tracking and flush timers, clears callbacks, destroys the bridge, and attempts one final telemetry flush.
