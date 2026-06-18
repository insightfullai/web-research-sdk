import type {
  InsightfullSDK,
  InsightfullInitOptions,
  StudyTriggerParams,
} from "@insightfull/web-research-sdk";

export interface InsightfullProviderProps {
  /** Client ID from your Insightfull dashboard environment. */
  clientId: string;
  /** Called when a study trigger matches. Override to customize display. */
  onStudyTrigger?: (params: StudyTriggerParams) => void;
  /** SDK initialization options forwarded to InsightfullSDK.init(). */
  options?: Omit<InsightfullInitOptions, "clientId">;
  /** React children. */
  children?: React.ReactNode;
}

export interface InsightfullContextValue {
  /** The SDK instance, or null before initialization (SSR, loading). */
  sdk: InsightfullSDK | null;
  /** Whether the SDK has been initialized on the client. */
  isReady: boolean;
}
