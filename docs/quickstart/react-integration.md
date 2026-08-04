# React Integration

## Install

```bash
npm install @insightfull/web-research-sdk @insightfull/web-research-sdk-react
```

## Provider setup

Wrap your app with `InsightfullProvider`. The SDK initializes on the client — safe for Next.js and server-side rendering.

```tsx
import { InsightfullProvider } from "@insightfull/web-research-sdk-react";

function App() {
  return (
    <InsightfullProvider
      clientId="env_abc123"
      options={{
        appearance: {
          placement: "bottom-right",
          minimizedLabel: "Continue interview",
        },
      }}
    >
      <YourApp />
    </InsightfullProvider>
  );
}
```

## Using the SDK in components

```tsx
import { useInsightfull } from "@insightfull/web-research-sdk-react";

function CheckoutButton() {
  const { sdk, isReady } = useInsightfull();

  const handleClick = () => {
    sdk?.track("checkout_completed", { total: 99.99 });
  };

  return (
    <button disabled={!isReady} onClick={handleClick}>
      Complete Purchase
    </button>
  );
}
```

`isReady` means remote environment configuration loaded successfully. The hook also returns `status` and a typed `error` for integration diagnostics.

## Disabling auto-tracking

```tsx
<InsightfullProvider clientId="env_abc123" options={{ autoTrack: false }}>
  <YourApp />
</InsightfullProvider>
```

Equivalent inline option values do not recreate the SDK. A meaningful configuration change—such as a new Client ID, renderer, callback, or appearance value—destroys the previous instance and initializes the next one.

## Identify and reset

```tsx
import { useEffect } from "react";

function IdentityBridge({ user }: { user: { id: string; plan: string } | null }) {
  const { sdk, isReady } = useInsightfull();

  useEffect(() => {
    if (!(sdk && isReady)) return;

    if (user) {
      sdk.identify(user.id, { plan: user.plan });
      return;
    }

    void sdk.reset();
  }, [isReady, sdk, user]);

  return null;
}
```

In an authentication callback where ordering matters, await `sdk.reset()` before identifying the next account.

## Custom renderer

Pass `renderStudy` through provider options. Keep the function stable with `useCallback` when it captures React state or design-system services.

```tsx
import type { InsightfullStudyRenderer } from "@insightfull/web-research-sdk";
import { useCallback } from "react";

const renderStudy = useCallback<InsightfullStudyRenderer>((payload) => {
  return mountResearchPanel(payload);
}, []);

<InsightfullProvider clientId="env_abc123" options={{ renderStudy }}>
  <App />
</InsightfullProvider>;
```

The renderer must return cleanup when it mounts host UI. See [Customize the interview experience](../guides/customize-interview-experience.md).

## SSR / Next.js

The provider is safe for server rendering. `useInsightfull()` returns `{ sdk: null, isReady: false }` during SSR. The SDK initializes inside `useEffect` on the client only. Cleanup is automatic on unmount and when configuration changes.
