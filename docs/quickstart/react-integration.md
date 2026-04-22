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
- `OverlayCustomization`
- `OverlayPersonaVariant`
- `OverlayTypographyConfig`
- `OverlayTailwindThemeOverrides`

## Provider + iframe example

```tsx
import { createElement } from "react";
import {
  OverlayBridgeFrame,
  type OverlayCustomization,
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
        customization: {
          persona: "opal",
          typography: {
            fontFamily: "'Sora', sans-serif",
            headingFontFamily: "'Space Grotesk', sans-serif",
          },
          tailwindTheme: {
            primary: "#1d4ed8",
            primaryForeground: "#eff6ff",
          },
        },
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

const customization: OverlayCustomization = {
  persona: "glint",
  tailwindTheme: {
    primary: "#15803d",
    primaryForeground: "#f0fdf4",
  },
};

export function App() {
  return createElement(
    WebResearchProvider,
    { client },
    createElement(OverlayStatus),
    createElement(OverlayBridgeFrame, {
      src: "https://overlay.example.com/embed",
      title: "Insightfull overlay",
      customization,
    }),
  );
}
```

## Runtime customization updates via rerender

`OverlayBridgeFrame` sends `overlay:customization_update` when the `customization` prop changes and the bridge is `READY`.

```tsx
import { createElement, useMemo, useState } from "react";
import { OverlayBridgeFrame, type OverlayCustomization } from "@insightfull/web-research-sdk-react";

export function OverlayThemeSwitcher() {
  const [persona, setPersona] = useState<OverlayCustomization["persona"]>("mana");

  const customization = useMemo<OverlayCustomization>(
    () => ({
      persona,
      tailwindTheme: {
        primary: persona === "command" ? "#334155" : "#7c3aed",
        accent: persona === "command" ? null : "#a855f7",
      },
    }),
    [persona],
  );

  return createElement(
    "section",
    null,
    createElement(
      "button",
      {
        type: "button",
        onClick: () => setPersona((value) => (value === "command" ? "mana" : "command")),
      },
      "Toggle persona",
    ),
    createElement(OverlayBridgeFrame, {
      src: "https://overlay.example.com/embed",
      customization,
    }),
  );
}
```

Persona options: `obsidian | mana | opal | halo | glint | command`

Tailwind theme keys: `primary`, `primaryForeground`, `secondary`, `secondaryForeground`, `accent`, `accentForeground`, `background`, `foreground`, `muted`, `mutedForeground`, `border`, `ring`, `radius`, `fontFamily`, `headingFontFamily`

Customization updates are partial overrides. Use `null` to clear an existing override key.

Voice is not part of customization and should be configured through media/capability negotiation.

## Host behavior

- Importing the React package has no browser-global side effects.
- `OverlayBridgeFrame` uses secure iframe defaults from the protocol doc:
  - `allow="microphone; camera; autoplay"`
  - `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`
  - `referrerPolicy="strict-origin-when-cross-origin"`
- `useOverlayBridgeHost` is available when you need to render your own iframe element.
