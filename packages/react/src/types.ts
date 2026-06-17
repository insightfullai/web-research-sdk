import type {
  InsightfullSDK,
  InsightfullInitOptions,
} from "@insightfull/web-research-sdk";

export interface InsightfullProviderProps {
  /** SDK initialization options. */
  children: React.ReactNode;
  /** Client ID from your Insightfull dashboard environment. */
  clientId: string;
  /** SDK initialization options forwarded to InsightfullSDK.init(). */
  options?: Omit<InsightfullInitOptions, "clientId">;
}

export interface InsightfullContextValue {
  /** The SDK instance, or null before initialization (SSR, loading). */
  sdk: InsightfullSDK | null;
  /** Whether the SDK has been initialized on the client. */
  isReady: boolean;
}
