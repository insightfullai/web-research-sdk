# Installation and SDK setup

## Public packages

- `@insightfull/web-research-sdk`
- `@insightfull/web-research-sdk-react`

`@insightfull/web-research-sdk-shared` is an internal workspace package and is **not** part of the public adoption surface.

## Install

Core SDK only:

```bash
yarn add @insightfull/web-research-sdk
```

Core SDK + React helpers:

```bash
yarn add @insightfull/web-research-sdk @insightfull/web-research-sdk-react react react-dom
```

## Basic SDK setup

The public core entrypoint exports:

- `createWebResearchClient`
- `createCallbackTransport`
- `createPostMessageTransport`
- `BrowserWebResearchSession`
- `createBridgeMessageEnvelope`
- `OverlayBridgeRuntime`
- `SUPPORTED_BRIDGE_VERSIONS`
- `validateBridgeOrigin`
- `validateSupportedBridgeVersion`
- the public bridge/client types exported from the package root

Example:

```ts
import { createWebResearchClient } from "@insightfull/web-research-sdk";

const client = createWebResearchClient({
  environment: "prod",
  sessionId: "session-123",
  bridge: {
    iframeOrigin: "https://overlay.example.com",
    parentOrigin: window.location.origin,
    handshake: {
      overlayToken: "overlay-runtime-token",
      overlayTokenExpiresAt: "2026-04-01T00:00:00.000Z",
      authorizedCapabilities: ["task_prompts", "agent_audio"],
      context: {
        organizationId: 1,
        studyId: 10,
        sectionId: 20,
        sessionId: "session-123",
        participantId: "participant-1",
        tabId: "tab-1",
      },
      uiConfig: {
        defaultPosition: "bottom-right",
        showAiPersona: true,
        theme: "system",
        customization: {
          persona: "obsidian",
          typography: {
            fontFamily: "'Sora', sans-serif",
            headingFontFamily: "'Space Grotesk', sans-serif",
          },
          tailwindTheme: {
            primary: "#14532d",
            primaryForeground: "#f0fdf4",
            background: "#ffffff",
            foreground: "#052e16",
          },
        },
      },
      consent: {
        mode: "required",
        captureAllowed: true,
      },
    },
  },
});

client.bridge.mount();
```

## Overlay customization

- Persona options: `obsidian | mana | opal | halo | glint | command`
- `tailwindTheme` supports partial overrides for: `primary`, `primaryForeground`, `secondary`, `secondaryForeground`, `accent`, `accentForeground`, `background`, `foreground`, `muted`, `mutedForeground`, `border`, `ring`, `radius`, `fontFamily`, `headingFontFamily`
- Runtime updates are partial merges; pass `null` on a key to clear that override
- Voice settings are not part of `OverlayCustomization` (voice remains negotiated via media/capability flow)

Runtime update example:

```ts
client.bridge.updateCustomization(
  {
    persona: "glint",
    tailwindTheme: {
      primary: "#0f766e",
      primaryForeground: "#f0fdfa",
      accent: null,
    },
  },
  {
    dispatch: (message) => {
      iframe.contentWindow?.postMessage(message, "https://overlay.example.com");
    },
  },
);
```

## Browser Capture Runtime

The core client can now start a minimal live browser capture session with a pluggable transport:

```ts
import { createCallbackTransport, createWebResearchClient } from "@insightfull/web-research-sdk";

const client = createWebResearchClient({ environment: "prod" });

client.startBrowserSession({
  transport: createCallbackTransport({
    onBatch(batch) {
      console.log(batch.events);
    },
  }),
  batching: {
    batchSize: 20,
    flushIntervalMs: 1000,
  },
});
```

The runtime captures click, input, change, submit, and navigation events with privacy-safe defaults (for example, no raw element text capture, minimized element descriptors, and navigation URLs redacted to origin + pathname while preserving `hasQuery`/`hasHash` flags), and supports `client.flush()`, `client.complete()`, and `client.destroy()`.

Set `environment` to `"dev" | "staging" | "prod"` so every session payload is attributed to the correct runtime tier during ingestion.

## Notes

- Use Node 24+ when building, testing, or packing the workspace.
- `bridge.iframeOrigin` must be an explicit `https` origin.
- Full `overlay:init` handshake requires `bridge.handshake` config.
- Do not put overlay/session tokens into iframe URL query params.
