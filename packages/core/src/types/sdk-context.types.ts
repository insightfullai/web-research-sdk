import type { HostContextV1 } from "./host-context.types.js";

export interface SdkContext {
  /** Single-use test transport token. Serialized only into the iframe URL fragment. */
  agentLaunchToken?: string;
  customAttributes: Record<string, unknown>;
  customId: Record<string, string>;
  iframeBridge?: {
    nonce: string;
    version: 1;
  };
  hostContext?: HostContextV1;
  sdkEnvironmentId: string;
  sdkVersion: string;
  source: "in_app" | "web_sdk";
  triggerEvent: string;
  userId: string | null;
  visitorId: string;
}
