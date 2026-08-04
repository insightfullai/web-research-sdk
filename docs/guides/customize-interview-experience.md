# Customize the interview experience

Insightfull supports two presentation levels without reaching into private iframe markup:

1. **Configured renderer** — keep the dependency-free default host and set placement, size, color, and minimized copy.
2. **Custom renderer** — own the container, iframe, responsive layout, invitation, and minimized state while the SDK keeps targeting and the verified bridge intact.

Use the configured renderer first. Choose a custom renderer when the interview must use your design system or live inside an existing product surface.

## Configured renderer

### Branded corner panel

```ts
import { InsightfullSDK } from "@insightfull/web-research-sdk";

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

### Left-side panel

```ts
const sdk = InsightfullSDK.init({
  clientId: "env_abc123",
  appearance: {
    placement: "bottom-left",
    minimizedPlacement: "bottom-left",
    width: 420,
    height: 640,
  },
});
```

### Centered interview

```ts
const sdk = InsightfullSDK.init({
  clientId: "env_abc123",
  appearance: {
    placement: "center",
    width: 560,
    height: 720,
    minimizedPlacement: "bottom-right",
  },
});
```

Numeric values are clamped to safe ranges. The host also uses viewport `max-width` and `max-height` constraints so an oversized configuration cannot push the interview outside the visible page.

## Fully custom renderer

`renderStudy` receives the exact iframe URL and a bridge registration function. It may return a cleanup function. The SDK calls that cleanup before another study renders, when `dismissStudy()` runs, and during `destroy()`.

```ts
import { InsightfullSDK } from "@insightfull/web-research-sdk";

const sdk = InsightfullSDK.init({
  clientId: "env_abc123",
  renderStudy({ dismiss, expand, iframeUrl, onDisplayStateChange, registerIframeBridge, study }) {
    const host = document.createElement("section");
    host.className = "research-panel";
    host.dataset.state = "expanded";
    host.setAttribute("aria-label", study.title ?? "Research interview");

    const iframe = document.createElement("iframe");
    iframe.src = iframeUrl;
    iframe.title = study.title ?? "Research interview";
    iframe.allow = "clipboard-write";
    host.appendChild(iframe);

    const resumeButton = document.createElement("button");
    resumeButton.type = "button";
    resumeButton.dataset.researchResume = "";
    resumeButton.textContent = "Continue interview";
    resumeButton.hidden = true;
    resumeButton.addEventListener("click", expand);

    document.body.appendChild(host);
    document.body.appendChild(resumeButton);

    const unregisterBridge = registerIframeBridge(iframe);
    const unsubscribeDisplayState = onDisplayStateChange((state) => {
      host.dataset.state = state;
      host.hidden = state === "minimized";
      resumeButton.hidden = state !== "minimized";
    });

    return () => {
      unsubscribeDisplayState();
      unregisterBridge();
      host.remove();
      resumeButton.remove();
    };
  },
});
```

The first display-state callback is `"expanded"`. Later updates can come from either side:

- the interview iframe requests minimize or expand;
- your application calls `sdk.minimizeStudy()` or `sdk.expandStudy()`.

Both use the same state controller. A throwing host callback is isolated and cannot break the participant session.

The renderer payload also includes `minimize()`, `expand()`, and `dismiss()` so a host-owned shell never needs to close over the SDK singleton. `dismiss()` is terminal and runs the cleanup returned by `renderStudy`.

### React host shell

Keep the launch payload in React state, but keep the iframe mounted while the shell is minimized. That preserves interview state, transcript, and bridge registration.

```tsx
import { InsightfullSDK, type InsightfullStudyRenderPayload } from "@insightfull/web-research-sdk";
import { useEffect, useRef, useState } from "react";

function ResearchShell({ launch }: { launch: InsightfullStudyRenderPayload }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [displayState, setDisplayState] = useState<"expanded" | "minimized">("expanded");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    return launch.registerIframeBridge(iframe);
  }, [launch]);

  useEffect(() => launch.onDisplayStateChange(setDisplayState), [launch]);

  return (
    <>
      <aside
        aria-label={launch.study.title ?? "Research interview"}
        hidden={displayState === "minimized"}
      >
        <header>
          <strong>{launch.study.title ?? "Research interview"}</strong>
          <button onClick={launch.minimize} type="button">
            Minimize
          </button>
          <button onClick={launch.dismiss} type="button">
            Leave
          </button>
        </header>
        <iframe
          allow="clipboard-write"
          ref={iframeRef}
          src={launch.iframeUrl}
          title={launch.study.title ?? "Research interview"}
        />
      </aside>
      {displayState === "minimized" ? (
        <button onClick={launch.expand} type="button">
          Continue interview
        </button>
      ) : null}
    </>
  );
}

export function App() {
  const [launch, setLaunch] = useState<InsightfullStudyRenderPayload | null>(null);

  useEffect(() => {
    const sdk = InsightfullSDK.init({
      clientId: "env_abc123",
      renderStudy(payload) {
        setLaunch(payload);
        return () => setLaunch(null);
      },
    });
    return () => void sdk.destroy();
  }, []);

  return <>{launch ? <ResearchShell launch={launch} /> : null}</>;
}
```

## Host controls

```ts
sdk.currentStudyId; // number | null
sdk.currentStudyDisplayState; // "expanded" | "minimized" | null

sdk.minimizeStudy();
sdk.expandStudy();
sdk.dismissStudy();
```

Minimizing never removes the iframe, so interview state, transcript, task progress, and bridge registration remain alive. Dismissing is different: it runs renderer cleanup and removes the active bridge.

## Responsive and accessible hosts

For custom renderers:

- give the iframe a meaningful `title`;
- preserve a visible, keyboard-operable resume control while minimized;
- keep host-product controls reachable at 320 CSS pixels and 200% zoom;
- respect `env(safe-area-inset-*)` on mobile browsers;
- restore focus to the element that opened the interview after dismissal;
- do not put critical host actions beneath the interview container;
- use `prefers-reduced-motion` for custom transitions.

## Security boundary

Custom rendering controls the host container, not the private DOM inside the iframe. Do not use CSS selectors or scripts to reach into iframe content. The bridge accepts messages only from the registered iframe, exact origin, study ID, and per-launch nonce.

See [SDK API reference](../reference/sdk-api.md) for lifecycle details and [Installation](../quickstart/installation.md) for CSP and verification.
