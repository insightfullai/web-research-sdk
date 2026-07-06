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

The Insightfull Web Research SDK embeds in any web app — via npm or a single script tag — and connects to [Insightfull Cloud](https://insightfull.ai) through a versioned bridge protocol. Trigger targeted in-product research studies from your own events with `track()` and `identify()` calls.

The host-side surface — iframe host runtime, bridge transport, protocol validation, and React integration helpers — is fully open-source under MIT. The research and interview logic runs inside Insightfull Cloud, so the SDK stays tiny (**5.6 KB gzipped, zero runtime dependencies**) and your bundle never carries proprietary code.

## Features

- **Tiny by design** — 5.6 KB gzipped, zero runtime dependencies.
- **Framework-agnostic core** — use the `@insightfull/web-research-sdk` runtime directly in any web app.
- **First-class React** — `<InsightfullProvider>` + `useInsightfull()` hook, SSR-safe (Next.js friendly).
- **TypeScript-first** — strict types ship in the box.
- **Versioned bridge protocol** — stable contract between host SDK and Insightfull Cloud.
- **Trigger-based studies** — fire `track("checkout_completed", { total: 99.99 })` and matching studies appear.

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
});

sdk.identify("user_123", { plan: "pro", company: "Acme" });

// Triggers fire on matching events
sdk.track("checkout_completed", { total: 99.99 });
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

More in the [installation guide](docs/quickstart/installation.md) and [React integration guide](docs/quickstart/react-integration.md).

## Packages

| Package                                                     | Description                                              | Published  |
| ----------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| [`@insightfull/web-research-sdk`](./packages/core)          | Core runtime: bridge transport, iframe host, SDK client. | ✅ npm     |
| [`@insightfull/web-research-sdk-react`](./packages/react)   | React provider + `useInsightfull()` hook.                | ✅ npm     |
| [`@insightfull/web-research-sdk-shared`](./packages/shared) | Workspace-only contract types between core and React.    | ❌ private |

## Documentation

- **[docs.insightfull.ai](https://docs.insightfull.ai)** — full hosted documentation.
- In-repo quickstart:
  - [`installation.md`](docs/quickstart/installation.md) — install, configuration, custom attributes.
  - [`react-integration.md`](docs/quickstart/react-integration.md) — provider, hook, SSR.
  - [`local-integration-runbook.md`](docs/quickstart/local-integration-runbook.md) — linking, packed validation, smoke tests.

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

- **[insightfull.ai](https://insightfull.ai)** — product overview.
- **[insightfull.ai](https://insightfull.ai)** — dashboard, sign up, get your clientId.
- **[npm: @insightfull/web-research-sdk](https://www.npmjs.com/package/@insightfull/web-research-sdk)** — core package.
- **[npm: @insightfull/web-research-sdk-react](https://www.npmjs.com/package/@insightfull/web-research-sdk-react)** — React package.
- **[GitHub Issues](https://github.com/insightfullai/web-research-sdk/issues)** — bug reports, feature requests, support.

## Contributing

Contributions are welcome. The fastest path is to [open an issue](https://github.com/insightfullai/web-research-sdk/issues) first to discuss what you'd like to change — especially anything that touches the bridge protocol or the published package surface.

## License

[MIT](./LICENSE) © Insightfull, Inc.
