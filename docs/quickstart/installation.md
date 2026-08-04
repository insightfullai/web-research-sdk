# Installation and setup

This path takes an integration from package install to a verified in-product preview. Start with a development environment and promote the same code to production only after the preview works on your allowed domain.

## 1. Install

```bash
npm install @insightfull/web-research-sdk
# or
yarn add @insightfull/web-research-sdk
```

## 2. Create a development environment

1. Open Insightfull → **Settings → SDK**.
2. Create an environment named **Development**.
3. Add the hostname where you will test, such as `localhost` or `app.example.test`.
4. Copy the public Client ID, which starts with `env_`.

Use separate environment IDs for development and production. The Client ID is safe to ship in browser code; it is not an API secret.

## 3. Initialize once

```ts
import { InsightfullSDK } from "@insightfull/web-research-sdk";

const sdk = InsightfullSDK.init({
  clientId: "env_abc123",
  autoTrack: true,
});

await sdk.ready();
```

Initialize in a browser-only application entry point. `init()` starts non-blocking configuration loading; `ready()` provides an explicit verification point for tests and diagnostics.

## 4. Identify users and targeting attributes

```ts
sdk.identify("user_123", { plan: "pro", company: "Acme" });
sdk.setAttributes({ seats: 20, betaCustomer: true });

// Call during logout or account switching.
await sdk.reset();
```

Never send passwords, authentication tokens, payment details, health data, or free-form sensitive text as attributes.

## 5. Track a meaningful product event

```ts
sdk.track("checkout_completed", { total: 99.99 });
sdk.track("pricing_opened");
```

Use stable product-language names rather than UI implementation names. `checkout_completed` survives a button rename; `green_button_clicked` does not.

## 6. Choose the presentation

The default renderer is production-ready and configurable:

```ts
const sdk = InsightfullSDK.init({
  clientId: "env_abc123",
  appearance: {
    placement: "bottom-right",
    width: 440,
    height: 680,
    offset: 24,
    borderRadius: 20,
    accentColor: "#0f766e",
    textColor: "#ffffff",
    minimizedLabel: "Continue interview",
  },
});
```

For a native container owned by your design system, use the [custom renderer guide](../guides/customize-interview-experience.md).

## 7. Verify in the real application

Before launch, confirm all of the following:

1. `await sdk.ready()` resolves and `sdk.status` is `"ready"`.
2. The expected user ID and non-sensitive targeting attributes are set.
3. The test event appears in the Insightfull environment.
4. A preview study triggered from the real application displays.
5. Minimize and resume preserve the participant’s task and host-application state.
6. Dismissal returns control to the host and removes the active bridge.
7. Logout calls `await sdk.reset()` before the next user is identified.

The current lifecycle can be inspected without querying the DOM:

```ts
sdk.status;
sdk.initializationError;
sdk.currentStudyId;
sdk.currentStudyDisplayState;
```

## Configuration

| Option                | Type                           | Default                  | Description                                      |
| --------------------- | ------------------------------ | ------------------------ | ------------------------------------------------ |
| `clientId`            | `string`                       | required                 | Public environment ID from Insightfull.          |
| `autoTrack`           | `boolean`                      | `true`                   | Track page views and URL changes.                |
| `apiBase`             | `string`                       | `https://insightfull.ai` | Insightfull API origin.                          |
| `appearance`          | `InsightfullAppearanceOptions` | corner panel             | Configure the default renderer.                  |
| `renderStudy`         | `InsightfullStudyRenderer`     | undefined                | Own rendering and return deterministic cleanup.  |
| `onActivityEvidence`  | callback                       | undefined                | Observe verified privacy-safe activity evidence. |
| `onResponseCompleted` | callback                       | undefined                | Observe server-confirmed response completion.    |

## Content Security Policy

Allow Insightfull API connections and the study iframe:

```text
connect-src 'self' https://insightfull.ai;
frame-src 'self' https://insightfull.ai;
```

If you configure another `apiBase`, allow that exact HTTPS origin instead. The npm package does not require a third-party script origin.

## Failure behavior

- Network and configuration failure never blocks the host application.
- `ready()` rejects with `InsightfullInitializationError` after configuration retries are exhausted.
- Event delivery retries and retains failed batches in memory while the page remains open.
- Renderer callbacks and cleanup failures are isolated from the participant session.

## Cleanup

For non-React integrations:

```ts
await sdk.destroy();
```

The React provider performs teardown automatically. See [React integration](react-integration.md).

## Bundle budget

The core has zero runtime dependencies and a release gate below 15 KB gzipped. Use the package build output—not raw source size or README claims—as the authoritative measurement.
