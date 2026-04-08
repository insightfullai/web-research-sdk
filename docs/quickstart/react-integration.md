# React integration

The React package is optional and depends on `@insightfull/web-research-sdk`.

## Public React exports

- `createReactWebResearchClient`
- `getOverlayBridgeStatus`
- `useMaybeWebResearchClient`
- `useOverlayBridgeSnapshot`
- `useOverlayBridgeStatus`
- `useWebResearchClient`
- `WebResearchProvider`
- `mergeOverlayIframeRef`
- `OverlayBridgeFrame`
- `useOverlayBridgeHost`

## Provider + iframe example

```tsx
import { createElement } from "react";
import {
  OverlayBridgeFrame,
  WebResearchProvider,
  createReactWebResearchClient,
  useOverlayBridgeStatus,
} from "@insightfull/web-research-sdk-react";

const client = createReactWebResearchClient({
  environment: "prod",
  bridge: {
    iframeOrigin: "https://overlay.example.com",
    parentOrigin: window.location.origin,
    handshake: {
      overlayToken: "overlay-runtime-token",
      overlayTokenExpiresAt: "2026-04-01T00:00:00.000Z",
      context: {
        organizationId: 1,
        studyId: 10,
        sectionId: 20,
        sessionId: "session-123",
        tabId: "tab-1",
      },
      uiConfig: {
        defaultPosition: "bottom-right",
        showAiPersona: false,
      },
      consent: {
        mode: "best_effort",
        captureAllowed: true,
      },
    },
  },
});

function OverlayStatus() {
  const status = useOverlayBridgeStatus();
  return createElement("div", null, status.lifecycleState);
}

export function App() {
  return createElement(
    WebResearchProvider,
    { client },
    createElement(OverlayStatus),
    createElement(OverlayBridgeFrame, {
      src: "https://overlay.example.com/embed",
      title: "Insightfull overlay",
    }),
  );
}
```

## Host behavior

- Importing the React package has no browser-global side effects.
- `OverlayBridgeFrame` uses secure iframe defaults from the protocol doc:
  - `allow="microphone; camera; autoplay"`
  - `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`
  - `referrerPolicy="strict-origin-when-cross-origin"`
- `useOverlayBridgeHost` is available when you need to render your own iframe element.
