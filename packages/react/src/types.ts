import type {
  InsightfullInitializationError,
  InsightfullInitOptions,
  InsightfullSDK,
  InsightfullSdkStatus,
} from "@insightfull/web-research-sdk";

export interface InsightfullProviderProps {
  /** Client ID from your Insightfull dashboard environment. */
  clientId: string;
  /** SDK initialization options forwarded to InsightfullSDK.init(). */
  options?: Omit<InsightfullInitOptions, "clientId">;
  /** React children. */
  children?: React.ReactNode;
}

export interface InsightfullContextValue {
  /** The SDK instance, or null before initialization (SSR, loading). */
  sdk: InsightfullSDK | null;
  /** Whether remote environment configuration loaded successfully. */
  isReady: boolean;
  /** Initialization state. `idle` is used during SSR and before the client effect runs. */
  status: InsightfullSdkStatus | "idle";
  /** Typed configuration error when status is unavailable or destroyed. */
  error: InsightfullInitializationError | null;
}
