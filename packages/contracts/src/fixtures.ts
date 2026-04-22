import {
  WEB_RESEARCH_BATCH_MESSAGE_TYPE,
  WEB_RESEARCH_COMPLETE_MESSAGE_TYPE,
  WEB_RESEARCH_HANDSHAKE_INIT_MESSAGE_TYPE,
  WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE,
  WEB_RESEARCH_PROTOCOL_VERSION,
  WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE,
  WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE,
} from "./constants";
import type {
  WebResearchBatchMessage,
  WebResearchCompleteMessage,
  WebResearchHandshakeInitMessage,
  WebResearchHandshakeReadyMessage,
  WebResearchTaskAbandonSignalMessage,
  WebResearchTaskCompleteSignalMessage,
} from "./types";

const BASE_TIMESTAMP = "2026-04-10T12:00:00.000Z";

export function buildValidWebResearchHandshakeInitFixture(): WebResearchHandshakeInitMessage {
  return {
    type: WEB_RESEARCH_HANDSHAKE_INIT_MESSAGE_TYPE,
    version: WEB_RESEARCH_PROTOCOL_VERSION,
    session: {
      sessionId: "session-1",
      startedAt: BASE_TIMESTAMP,
      environment: "staging",
    },
    sentAt: "2026-04-10T12:00:01.000Z",
  };
}

export function buildValidWebResearchHandshakeReadyFixture(): WebResearchHandshakeReadyMessage {
  return {
    type: WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE,
    version: WEB_RESEARCH_PROTOCOL_VERSION,
    session: {
      sessionId: "session-1",
      startedAt: BASE_TIMESTAMP,
      environment: "staging",
    },
    sentAt: "2026-04-10T12:00:02.000Z",
  };
}

export function buildValidWebResearchBatchFixture(): WebResearchBatchMessage {
  return {
    type: WEB_RESEARCH_BATCH_MESSAGE_TYPE,
    version: WEB_RESEARCH_PROTOCOL_VERSION,
    session: {
      sessionId: "session-1",
      startedAt: BASE_TIMESTAMP,
      environment: "staging",
    },
    sentAt: "2026-04-10T12:00:05.000Z",
    reason: "interval",
    events: [
      {
        id: "event-1",
        name: "navigation",
        capturedAt: "2026-04-10T12:00:01.000Z",
        sessionId: "session-1",
        source: "browser",
        payload: {
          path: "/pricing",
          routeType: "history",
        },
      },
      {
        id: "event-2",
        name: "dom.click",
        capturedAt: "2026-04-10T12:00:02.000Z",
        sessionId: "session-1",
        source: "manual",
        payload: {
          tagName: "button",
        },
      },
    ],
  };
}

export function buildValidWebResearchCompleteFixture(): WebResearchCompleteMessage {
  return {
    type: WEB_RESEARCH_COMPLETE_MESSAGE_TYPE,
    version: WEB_RESEARCH_PROTOCOL_VERSION,
    session: {
      sessionId: "session-1",
      startedAt: BASE_TIMESTAMP,
      environment: "staging",
    },
    sentAt: "2026-04-10T12:05:00.000Z",
    reason: "complete",
  };
}

export function buildValidWebResearchTaskCompleteSignalFixture(): WebResearchTaskCompleteSignalMessage {
  return {
    type: WEB_RESEARCH_TASK_COMPLETE_MESSAGE_TYPE,
    version: WEB_RESEARCH_PROTOCOL_VERSION,
    session: {
      sessionId: "session-1",
      startedAt: BASE_TIMESTAMP,
      environment: "staging",
    },
    sentAt: "2026-04-10T12:05:10.000Z",
    signal: "task_complete",
    status: "completed",
    taskId: "task-1",
    evidence: {
      note: "Checkout flow reached confirmation page",
      metadata: {
        url: "https://partner.example/checkout/confirmation",
      },
    },
  };
}

export function buildValidWebResearchTaskAbandonSignalFixture(): WebResearchTaskAbandonSignalMessage {
  return {
    type: WEB_RESEARCH_TASK_ABANDON_MESSAGE_TYPE,
    version: WEB_RESEARCH_PROTOCOL_VERSION,
    session: {
      sessionId: "session-1",
      startedAt: BASE_TIMESTAMP,
      environment: "staging",
    },
    sentAt: "2026-04-10T12:05:20.000Z",
    signal: "task_abandon",
    status: "abandoned",
    taskId: "task-1",
    reason: "user_ended_session",
    evidence: {
      note: "Participant exited flow",
      metadata: {
        step: "payment",
      },
    },
  };
}
