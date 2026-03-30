export interface SessionMetadata {
  sessionId: string;
  startedAt: string;
}

export interface SdkEvent {
  name: string;
  payload: Record<string, unknown>;
}
