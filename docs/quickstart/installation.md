# Installation and Setup

## Install

```bash
npm install @insightfull/web-research-sdk
# or
yarn add @insightfull/web-research-sdk
```

## Get your clientId

1. Go to your Insightfull dashboard → **Settings → SDK**
2. Create an environment (e.g., "Production")
3. Copy the **Client ID** (looks like `env_abc123...`)

## Basic usage

```ts
import { InsightfullSDK } from "@insightfull/web-research-sdk";

const sdk = InsightfullSDK.init({
  clientId: "env_abc123",
  autoTrack: true, // automatically tracks pageviews
});

// Identify a user
sdk.identify("user_123", { plan: "pro", company: "Acme" });

// Track events — matching triggers will show studies
sdk.track("checkout_completed", { total: 99.99 });
sdk.track("signup");
```

## Configuration

| Option      | Type    | Default                | Description                          |
| ----------- | ------- | ---------------------- | ------------------------------------ |
| `clientId`  | string  | required               | Environment client ID from dashboard |
| `autoTrack` | boolean | true                   | Automatically track pageviews        |
| `apiBase`   | string  | https://insightfull.ai | API server URL                       |

## Targeting with custom attributes

Custom IDs and attributes are used to match trigger filters in your study configuration:

```ts
// Custom IDs (e.g., for trigger filters matching "customId.plan")
sdk.setCustomId("plan", "premium");

// Custom attributes (e.g., for trigger filters matching "company")
sdk.setAttribute("company", "Acme Inc");
```

## Cleanup

```ts
sdk.destroy(); // stops tracking, flushes events, removes listeners
```

## Bundle size

5.6 KB gzipped. Zero runtime dependencies.
