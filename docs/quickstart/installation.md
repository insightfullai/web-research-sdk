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
  apiKey: "public-sdk-key",
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

## Notes

- Use Node 24+ when building, testing, or packing the workspace.
- `bridge.iframeOrigin` must be an explicit `https` origin.
- Full `overlay:init` handshake requires `bridge.handshake` config.
- Do not put overlay/session tokens into iframe URL query params.
