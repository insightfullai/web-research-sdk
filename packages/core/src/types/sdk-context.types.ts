/**
 * SDK context passed to the iframe via base64-encoded query parameter.
 */

/** Context payload embedded in the iframe URL. */
export interface SdkContext {
  customAttributes: Record<string, unknown>;
  customId: Record<string, string>;
  sdkEnvironmentId: string;
  source: "web_sdk";
  triggerEvent: string;
  userId: string | null;
  visitorId: string;
}
