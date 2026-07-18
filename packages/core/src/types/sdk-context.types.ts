export interface SdkContext {
  customAttributes: Record<string, unknown>;
  customId: Record<string, string>;
  iframeBridge?: {
    nonce: string;
    version: 1;
  };
  sdkEnvironmentId: string;
  sdkVersion: string;
  source: "web_sdk";
  triggerEvent: string;
  userId: string | null;
  visitorId: string;
}
