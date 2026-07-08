export interface SdkContext {
  customAttributes: Record<string, unknown>;
  customId: Record<string, string>;
  sdkEnvironmentId: string;
  sdkVersion: string;
  source: "web_sdk";
  triggerEvent: string;
  userId: string | null;
  visitorId: string;
}
