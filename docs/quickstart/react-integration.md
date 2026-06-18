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
    <InsightfullProvider clientId="env_abc123">
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
    if (isReady) {
      sdk.track("checkout_completed", { total: 99.99 });
    }
  };

  return <button onClick={handleClick}>Complete Purchase</button>;
}
```

## Disabling auto-tracking

```tsx
<InsightfullProvider clientId="env_abc123" options={{ autoTrack: false }}>
  <YourApp />
</InsightfullProvider>
```

## SSR / Next.js

The provider is safe for server rendering. `useInsightfull()` returns `{ sdk: null, isReady: false }` during SSR. The SDK initializes inside `useEffect` on the client only. Cleanup is automatic on unmount.
