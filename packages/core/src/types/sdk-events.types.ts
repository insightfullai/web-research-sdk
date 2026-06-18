/**
 * SDK event types — mirrors what the SDK sends to POST /trpc/sdk.ingestTelemetry
 */

/** The type of SDK event. */
export type SdkEventType = "identify" | "attribute" | "event" | "pageview";

/** Base SDK event shape. */
export interface SdkEvent {
  payload?: Record<string, unknown>;
  timestamp: number;
  type: SdkEventType;
  url?: string;
}

/** A tracked custom event. */
export interface TrackEvent extends SdkEvent {
  name: string;
  payload?: Record<string, unknown>;
  type: "event";
}

/** An identify event — associates a user ID with the visitor. */
export interface IdentifyEvent extends SdkEvent {
  type: "identify";
}

/** An attribute event — sets a key/value attribute. */
export interface AttributeEvent extends SdkEvent {
  key: string;
  type: "attribute";
  value: unknown;
}

/** A pageview event — tracked automatically or manually. */
export interface PageviewEvent extends SdkEvent {
  name: string;
  type: "pageview";
  url: string;
}
