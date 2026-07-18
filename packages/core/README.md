# @insightfull/web-research-sdk

Core Insightfull Web Research SDK package.

- install: `yarn add @insightfull/web-research-sdk`
- docs: `https://github.com/insightfullai/web-research-sdk/blob/main/docs/quickstart/installation.md`
- React helpers live in `@insightfull/web-research-sdk-react`

This package exposes the host-side client facade and bridge runtime only. Proprietary overlay logic is intentionally excluded from this OSS package.

## Explicit host context

Host context is optional, versioned, and accepted only as the third argument to `track`. It is strictly validated before being added to the iframe launch context. The SDK never derives it from identify traits, event payloads, URLs, titles, or DOM content.

```ts
sdk.track("checkout_promo_help_requested", undefined, {
  hostContext: {
    version: 1,
    scenario: { id: "northstar_checkout_v1", label: "Northstar checkout" },
    surface: {
      id: "checkout_review",
      label: "Checkout review",
      routeTemplate: "/checkout",
    },
    task: { id: "apply_promo_code", label: "Apply a promotional code" },
    state: { checkoutStep: "review", promoEntryAvailable: true },
  },
});
```

Invalid context is omitted without blocking study launch. `validateHostContext(value)` is exported for host-side preflight validation.

Use `sdk.onActivityEvidence(callback)` and `sdk.onResponseCompleted(callback)` to observe strict messages from the active iframe. Messages are accepted only when source, exact origin, nonce, study, response, and applicable recording identity match. Completion is delivered once per response in a page lifecycle.
