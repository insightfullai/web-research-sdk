# Next.js App Router integration

## 1. Install

```bash
npm install @insightfull/web-research-sdk @insightfull/web-research-sdk-react
```

## 2. Configure the public environment ID

```text
NEXT_PUBLIC_INSIGHTFULL_CLIENT_ID=env_abc123
```

Create separate values for development, preview, and production deployments. Add each deployment hostname to its corresponding Insightfull environment.

## 3. Add a client provider

```tsx
// app/providers.tsx
"use client";

import { InsightfullProvider } from "@insightfull/web-research-sdk-react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_INSIGHTFULL_CLIENT_ID;

  if (!clientId) {
    return children;
  }

  return (
    <InsightfullProvider
      clientId={clientId}
      options={{
        appearance: {
          placement: "bottom-right",
          minimizedLabel: "Continue interview",
        },
      }}
    >
      {children}
    </InsightfullProvider>
  );
}
```

Mount it once in the root layout:

```tsx
// app/layout.tsx
import { Providers } from "./providers";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

## 4. Identify after authentication

Use the authenticated user ID from your client session. Call `reset()` when the session ends or the account changes.

```tsx
"use client";

import { useInsightfull } from "@insightfull/web-research-sdk-react";
import { useEffect } from "react";

export function ResearchIdentity({ userId }: { userId: string | null }) {
  const { sdk, isReady } = useInsightfull();

  useEffect(() => {
    if (!(sdk && isReady)) return;
    if (userId) {
      sdk.identify(userId);
      return;
    }
    void sdk.reset();
  }, [isReady, sdk, userId]);

  return null;
}
```

## 5. Track from client interactions

```tsx
"use client";

import { useInsightfull } from "@insightfull/web-research-sdk-react";

export function CheckoutCompleteButton() {
  const { sdk, isReady } = useInsightfull();

  return (
    <button disabled={!isReady} onClick={() => sdk?.track("checkout_completed")} type="button">
      Complete checkout
    </button>
  );
}
```

Do not initialize the browser SDK in Server Components, Route Handlers, or Server Actions.

## 6. Verify preview deployments

For each Vercel or hosted preview domain:

1. add the hostname to a non-production Insightfull environment;
2. verify the public Client ID used by that deployment;
3. confirm `status === "ready"` in a client diagnostics surface;
4. launch a preview study in the deployed application;
5. verify minimize, resume, and logout reset before promoting to production.
