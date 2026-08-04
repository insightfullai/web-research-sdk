<p align="center">
  <a href="https://insightfull.ai">
    <img src=".github/assets/logo.png" width="220" alt="Insightfull" />
  </a>
</p>

<h3 align="center">Drop-in SDK for running targeted in-product research studies on your web app.</h3>

<p align="center">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-%E2%89%A518-61DAFB?logo=react&logoColor=black" alt="React ≥18" /></a>
</p>

<p align="center">
  <img src=".github/assets/hero.png" alt="Insightfull in-product study" />
</p>

---

## Introduction

The Insightfull Web Research SDK embeds in any web app through npm and connects to [Insightfull Cloud](https://insightfull.ai) through a versioned bridge protocol. Trigger targeted in-product interviews from your own events with `track()` and `identify()` calls.

The host-side surface — iframe runtime, presentation controls, bridge transport, protocol validation, and React helpers — is open-source under MIT. Research and interview logic runs inside Insightfull Cloud, keeping the core dependency-free and below its **15 KB gzipped release budget**.

## Features

- **Tiny by design** — under 15 KB gzipped with zero runtime dependencies.
- **Framework-agnostic core** — use the `@insightfull/web-research-sdk` runtime directly in any web app.
- **First-class React** — `<InsightfullProvider>` + `useInsightfull()` hook, SSR-safe (Next.js friendly).
- **TypeScript-first** — strict types ship in the box.
- **Versioned bridge protocol** — stable contract between host SDK and Insightfull Cloud.
- **Trigger-based studies** — fire `track("checkout_completed", { total: 99.99 })` and matching studies appear.
- **Presentation controls** — configure placement, size, brand color, radius, offset, and minimized copy.
- **Full host control** — own the iframe container and lifecycle with a cleanup-safe custom renderer.
- **Operational status** — await `ready()`, inspect typed initialization errors, and reset identity safely on logout.
- **Explainable delivery** — dry-run targeting and observe privacy-safe reason codes without displaying an interview.

## Quick start

### 1. Install

```bash
npm install @insightfull/web-research-sdk
# or
yarn add @insightfull/web-research-sdk
```

### 2. Get your clientId

In your [Insightfull dashboard](https://insightfull.ai) → **Settings → SDK**, create an environment and copy the **Client ID** (looks like `env_abc123...`).

### 3. Initialize and track

```ts
import { InsightfullSDK } from "@insightfull/web-research-sdk";

const sdk = InsightfullSDK.init({
  clientId: "env_abc123",
  autoTrack: true, // automatically tracks pageviews
  appearance: {
    placement: "bottom-right",
    accentColor: "#0f766e",
    minimizedLabel: "Continue interview",
  },
});

await sdk.ready();

sdk.identify("user_123", { plan: "pro", company: "Acme" });

// Triggers fire on matching events
sdk.track("checkout_completed", { total: 99.99 });

// Prove targeting without rendering, setting cooldown, or sending telemetry
const eligibility = sdk.explainDelivery("checkout_completed");
console.log(eligibility.outcome, eligibility.reasonCode);

// On logout or account switching
await sdk.reset();
```

### 4. React (optional)

```tsx
import { InsightfullProvider, useInsightfull } from "@insightfull/web-research-sdk-react";

function App() {
  return (
    <InsightfullProvider clientId="env_abc123">
      <CheckoutButton />
    </InsightfullProvider>
  );
}

function CheckoutButton() {
  const { sdk, isReady } = useInsightfull();
  return (
    <button onClick={() => isReady && sdk.track("checkout_completed", { total: 99.99 })}>
      Complete Purchase
    </button>
  );
}
```

For the complete launch path, start with [Ship your first in-product interview](docs/quickstart/first-interview.md). More stack-specific setup is in the [installation guide](docs/quickstart/installation.md), [React integration guide](docs/quickstart/react-integration.md), and [Next.js guide](docs/quickstart/nextjs.md).

## Packages

| Package                                                         | Description                                                     | Published  |
| --------------------------------------------------------------- | --------------------------------------------------------------- | ---------- |
| [`@insightfull/web-research-sdk`](./packages/core)              | Core runtime: bridge transport, iframe host, SDK client.        | ✅ npm     |
| [`@insightfull/web-research-sdk-react`](./packages/react)       | React provider + `useInsightfull()` hook.                       | ✅ npm     |
| [`@insightfull/web-research-sdk-recorder`](./packages/recorder) | Experimental rrweb recorder with upload and finalization hooks. | ✅ npm     |
| [`@insightfull/web-research-sdk-shared`](./packages/shared)     | Workspace-only contract types between core and React.           | ❌ private |

## Documentation

- **[Documentation map](docs/README.md)** — choose a stack-specific integration path.
- In-repo quickstart:
  - [`installation.md`](docs/quickstart/installation.md) — install, configuration, custom attributes.
  - [`first-interview.md`](docs/quickstart/first-interview.md) — connect, prove targeting, test, and promote an interview.
  - [`react-integration.md`](docs/quickstart/react-integration.md) — provider, hook, SSR.
  - [`nextjs.md`](docs/quickstart/nextjs.md) — App Router provider, identity, preview deployments.
  - [`customize-interview-experience.md`](docs/guides/customize-interview-experience.md) — configured and fully custom renderers.
  - [`sdk-api.md`](docs/reference/sdk-api.md) — readiness, identity, events, lifecycle, and cleanup.
  - [`delivery-diagnostics.md`](docs/guides/delivery-diagnostics.md) — typed reason codes, privacy contract, and delivery tests.
  - [`local-integration-runbook.md`](docs/quickstart/local-integration-runbook.md) — linking, packed validation, smoke tests.

## Recipes

- [`next-app-survey`](packages/next-app-survey) — private Next.js checkout recipe that triggers `checkout_completed` and renders a real Insightfull survey iframe in a shadcn/ui Dialog.
- [`test-app-react`](packages/test-app-react) — release-artifact integration lab covering the full participant journey, configured appearance, headless rendering, reset, recording finalization, and unavailable configuration.

## Development

This is a yarn workspaces monorepo built on [vite-plus](https://www.npmjs.com/package/vite-plus).

### Prerequisites

- Node.js **≥ 24**
- Yarn 4 (`corepack enable`)
- (For local integration tests) A host app to link against

### Commands

```bash
vp install
vp check
vp run -r test
vp run -r build
vp run -r pack
node ./scripts/verify-package-exports.mjs
corepack yarn pack:dry-run
```

For linked validation against a host app, see the [local integration runbook](docs/quickstart/local-integration-runbook.md).

## Resources

- **[insightfull.ai](https://insightfull.ai)** — product overview, dashboard, sign up, get your clientId.
- **[npm: @insightfull/web-research-sdk](https://www.npmjs.com/package/@insightfull/web-research-sdk)** — core package.
- **[npm: @insightfull/web-research-sdk-react](https://www.npmjs.com/package/@insightfull/web-research-sdk-react)** — React package.
- **[npm: @insightfull/web-research-sdk-recorder](https://www.npmjs.com/package/@insightfull/web-research-sdk-recorder)** — experimental rrweb recorder package.
- **[GitHub Issues](https://github.com/insightfullai/web-research-sdk/issues)** — bug reports, feature requests, support.

## Contributing

Contributions are welcome. The fastest path is to [open an issue](https://github.com/insightfullai/web-research-sdk/issues) first to discuss what you'd like to change — especially anything that touches the bridge protocol or the published package surface.

## License

[MIT](./LICENSE) © Insightfull, Inc.
