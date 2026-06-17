"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { InsightfullSDK } from "@insightfull/web-research-sdk";
import type {
  InsightfullContextValue,
  InsightfullProviderProps,
} from "./types.js";

const InsightfullContext = createContext<InsightfullContextValue>({
  sdk: null,
  isReady: false,
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
  const initRef = useRef(false);

  const initSdk = useCallback(() => {
    if (initRef.current) {
      return;
    }
    initRef.current = true;

    const instance = InsightfullSDK.init({
      clientId,
      ...options,
    });
    setSdk(instance);
    setIsReady(true);
  }, [clientId, options]);

  useEffect(() => {
    initSdk();
  }, [initSdk]);

  return createElement(
    InsightfullContext.Provider,
    { value: { sdk, isReady } },
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
