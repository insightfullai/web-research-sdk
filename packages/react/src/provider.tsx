"use client";

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  InsightfullInitializationError,
  InsightfullSDK,
  type InsightfullSdkStatus,
} from "@insightfull/web-research-sdk";
import type { InsightfullContextValue, InsightfullProviderProps } from "./types.js";

const InsightfullContext = createContext<InsightfullContextValue>({
  sdk: null,
  isReady: false,
  status: "idle",
  error: null,
});

/**
 * Provider that initializes the Insightfull SDK on the client.
 * Safe for server-side rendering — SDK is initialized inside useEffect.
 *
 * @example
 * ```tsx
 * <InsightfullProvider clientId="env_abc123">
 *   <App />
 * </InsightfullProvider>
 * ```
 */
export function InsightfullProvider({
  children,
  clientId,
  options,
}: InsightfullProviderProps): ReactNode {
  const [sdk, setSdk] = useState<InsightfullSDK | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<InsightfullSdkStatus | "idle">("idle");
  const [error, setError] = useState<InsightfullInitializationError | null>(null);
  const appearance = options?.appearance;

  useEffect(() => {
    let active = true;
    const instance = InsightfullSDK.init({
      clientId,
      ...options,
    });
    setSdk(instance);
    setIsReady(false);
    setStatus("initializing");
    setError(null);
    void instance.ready().then(
      () => {
        if (!active) return;
        setStatus("ready");
        setIsReady(true);
      },
      (reason: unknown) => {
        if (!active) return;
        setStatus(instance.status);
        setError(
          reason instanceof InsightfullInitializationError ? reason : instance.initializationError,
        );
      },
    );

    return () => {
      active = false;
      void instance.destroy();
    };
  }, [
    clientId,
    options?.apiBase,
    options?.autoTrack,
    options?.onActivityEvidence,
    options?.onResponseCompleted,
    options?.renderStudy,
    appearance?.accentColor,
    appearance?.borderRadius,
    appearance?.height,
    appearance?.minimizedLabel,
    appearance?.minimizedPlacement,
    appearance?.offset,
    appearance?.placement,
    appearance?.textColor,
    appearance?.width,
    appearance?.zIndex,
  ]);

  return createElement(
    InsightfullContext.Provider,
    { value: { sdk, isReady, status, error } },
    children,
  );
}

/**
 * Hook to access the Insightfull SDK instance.
 * Returns null during SSR and before client-side initialization.
 *
 * @example
 * ```tsx
 * const { sdk, isReady } = useInsightfull();
 * if (isReady) sdk.track("checkout_completed");
 * ```
 */
export function useInsightfull(): InsightfullContextValue {
  return useContext(InsightfullContext);
}
