import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  createEmbeddedHostRuntime,
  createWebResearchClient,
  type WebResearchClient,
} from "@insightfull/web-research-sdk";
import {
  WEB_RESEARCH_BATCH_MESSAGE_TYPE,
  WEB_RESEARCH_COMPLETE_MESSAGE_TYPE,
  WEB_RESEARCH_HANDSHAKE_INIT_MESSAGE_TYPE,
  WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE,
  WEB_RESEARCH_PROTOCOL_VERSION,
  parseWebResearchBatchMessage,
  parseWebResearchCompleteMessage,
  parseWebResearchHandshakeInitMessage,
} from "@insightfull/web-research-sdk-contracts";

type HarnessScenario =
  | "happy_path"
  | "reject_origin"
  | "reject_environment"
  | "stale_session"
  | "reconnect";

interface HarnessStatusMessage {
  type: "harness:status";
  completionCount: number;
  interviewState: "booting" | "active" | "safe_rejecting" | "ended";
  online: boolean;
  persistedEventCount: number;
  queuedBatchCount: number;
  rejectedReasons: string[];
}

interface EmbeddedRuntimeHarnessState {
  completionCount: number;
  interviewState: "booting" | "active" | "safe_rejecting" | "ended";
  online: boolean;
  persistedEventCount: number;
  queuedBatchCount: number;
  rejectedReasons: string[];
}

const DEFAULT_HARNESS_STATE: EmbeddedRuntimeHarnessState = {
  completionCount: 0,
  interviewState: "booting",
  online: true,
  persistedEventCount: 0,
  queuedBatchCount: 0,
  rejectedReasons: [],
};

function getCurrentRoute() {
  return `${window.location.pathname}${window.location.hash}`;
}

function PartnerHostHarnessApp() {
  const [route, setRoute] = useState(getCurrentRoute);
  const [scenario, setScenario] = useState<HarnessScenario>("happy_path");
  const [runtimeState, setRuntimeState] = useState("UNMOUNTED");
  const [overlayMounted, setOverlayMounted] = useState(false);
  const [harnessState, setHarnessState] =
    useState<EmbeddedRuntimeHarnessState>(DEFAULT_HARNESS_STATE);
  const clientRef = useRef<WebResearchClient | null>(null);
  const runtimeRef = useRef<ReturnType<typeof createEmbeddedHostRuntime> | null>(null);
  const statusTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({ scenario });
    return `/embedded-runtime-harness?${params.toString()}`;
  }, [scenario]);

  const clearStatusTick = useCallback(() => {
    if (!statusTickRef.current) {
      return;
    }

    window.clearInterval(statusTickRef.current);
    statusTickRef.current = null;
  }, []);

  const stopRuntime = useCallback(
    async (reason: string) => {
      clearStatusTick();
      if (runtimeRef.current) {
        await runtimeRef.current.destroy(reason);
        runtimeRef.current = null;
      }
      if (clientRef.current) {
        clientRef.current.destroy(reason);
        clientRef.current = null;
      }

      setOverlayMounted(false);
      setRuntimeState("TERMINATED");
    },
    [clearStatusTick],
  );

  const startRuntime = () => {
    if (runtimeRef.current) {
      void stopRuntime("restart");
    }

    setHarnessState(DEFAULT_HARNESS_STATE);
    const client = createWebResearchClient({
      environment: "dev",
      sessionId: `sdk-session-${Date.now().toString(36)}`,
      batching: {
        batchSize: 100,
        flushIntervalMs: 0,
      },
    });

    const runtime = createEmbeddedHostRuntime({
      client,
      iframeSrc,
      targetOrigin: window.location.origin,
      handshakeTimeoutMs: 5_000,
    });

    clientRef.current = client;
    runtimeRef.current = runtime;
    runtime.mount();
    const mountedIframe = runtime.getIframe();
    if (mountedIframe) {
      mountedIframe.style.pointerEvents = "none";
    }
    window.setTimeout(() => {
      const iframe = runtime.getIframe();
      if (!iframe) {
        return;
      }

      iframe.dispatchEvent(new Event("load"));
    }, 50);
    setOverlayMounted(Boolean(runtime.getIframe()));
    setRuntimeState(runtime.getState());

    clearStatusTick();
    statusTickRef.current = window.setInterval(() => {
      const currentRuntime = runtimeRef.current;
      if (!currentRuntime) {
        return;
      }

      setRuntimeState(currentRuntime.getState());
      setOverlayMounted(Boolean(currentRuntime.getIframe()));
    }, 25) as unknown as ReturnType<typeof setInterval>;
  };

  const sendHarnessControl = (online: boolean) => {
    const iframeWindow = runtimeRef.current?.getIframe()?.contentWindow;
    if (!iframeWindow) {
      return;
    }

    iframeWindow.postMessage({ type: "harness:set-online", online }, window.location.origin);
  };

  const sendPostCompleteBatch = () => {
    const iframeWindow = runtimeRef.current?.getIframe()?.contentWindow;
    const session = clientRef.current?.getSession();
    if (!(iframeWindow && session)) {
      return;
    }

    iframeWindow.postMessage(
      {
        type: WEB_RESEARCH_BATCH_MESSAGE_TYPE,
        version: WEB_RESEARCH_PROTOCOL_VERSION,
        session,
        sentAt: new Date().toISOString(),
        reason: "manual_post_complete_batch",
        events: [
          {
            id: `manual-${Date.now().toString(36)}`,
            name: "dom.click",
            capturedAt: new Date().toISOString(),
            sessionId: session.sessionId,
            source: "manual",
            payload: {
              element: { tagName: "button", dataTestId: "manual-post-complete" },
            },
          },
        ],
      },
      window.location.origin,
    );
  };

  useEffect(() => {
    const handleStatus = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data;
      if (
        typeof payload !== "object" ||
        payload === null ||
        (payload as { type?: unknown }).type !== "harness:status"
      ) {
        return;
      }

      const statusPayload = payload as HarnessStatusMessage;
      setHarnessState({
        completionCount: statusPayload.completionCount,
        interviewState: statusPayload.interviewState,
        online: statusPayload.online,
        persistedEventCount: statusPayload.persistedEventCount,
        queuedBatchCount: statusPayload.queuedBatchCount,
        rejectedReasons: statusPayload.rejectedReasons,
      });
    };

    const handleRoute = () => setRoute(getCurrentRoute());
    window.addEventListener("popstate", handleRoute);
    window.addEventListener("hashchange", handleRoute);
    window.addEventListener("message", handleStatus);

    return () => {
      clearStatusTick();
      window.removeEventListener("popstate", handleRoute);
      window.removeEventListener("hashchange", handleRoute);
      window.removeEventListener("message", handleStatus);
      void stopRuntime("app_unmount");
    };
  }, [clearStatusTick, stopRuntime]);

  const client = clientRef.current;

  return (
    <main style={{ fontFamily: "Inter, sans-serif", margin: "0 auto", maxWidth: 900, padding: 24 }}>
      <h1>Partner Host + Embedded Runtime Harness</h1>
      <p data-testid="route">{route}</p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Scenario
          <select
            data-testid="scenario-select"
            onChange={(event) => {
              setScenario(event.currentTarget.value as HarnessScenario);
            }}
            value={scenario}
          >
            <option value="happy_path">happy_path</option>
            <option value="reject_origin">reject_origin</option>
            <option value="reject_environment">reject_environment</option>
            <option value="stale_session">stale_session</option>
            <option value="reconnect">reconnect</option>
          </select>
        </label>
        <button data-testid="start-embedded-button" onClick={startRuntime} type="button">
          Start embedded runtime
        </button>
        <button
          data-testid="stop-embedded-button"
          onClick={() => {
            void stopRuntime("manual_stop");
          }}
          type="button"
        >
          Stop embedded runtime
        </button>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        <section>
          <h2>Interaction Controls</h2>
          <button data-testid="cta-button" type="button">
            Primary CTA
          </button>
          <form
            data-testid="profile-form"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <label>
              Email
              <input data-testid="email-input" name="email" />
            </label>
            <label>
              Plan
              <select data-testid="plan-select" name="plan" defaultValue="starter">
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
              </select>
            </label>
            <button data-testid="submit-button" type="submit">
              Submit form
            </button>
          </form>
        </section>
        <section>
          <h2>Navigation and Runtime</h2>
          <button
            data-testid="history-button"
            type="button"
            onClick={() => {
              window.history.pushState({}, "", "/checkout");
              setRoute(getCurrentRoute());
            }}
          >
            Push history route
          </button>
          <button
            data-testid="hash-button"
            type="button"
            onClick={() => {
              window.location.hash = "confirmation";
              setRoute(getCurrentRoute());
            }}
          >
            Update hash route
          </button>
          <button
            data-testid="flush-button"
            type="button"
            onClick={() => {
              void client?.flush("manual_flush");
            }}
          >
            Flush captured events
          </button>
          <button
            data-testid="complete-button"
            type="button"
            onClick={() => {
              void client?.complete("manual_complete");
            }}
          >
            Complete session
          </button>
          <button
            data-testid="network-offline-button"
            onClick={() => sendHarnessControl(false)}
            type="button"
          >
            Simulate network offline
          </button>
          <button
            data-testid="network-online-button"
            onClick={() => sendHarnessControl(true)}
            type="button"
          >
            Restore network
          </button>
          <button
            data-testid="post-complete-batch-button"
            onClick={sendPostCompleteBatch}
            type="button"
          >
            Send post-complete batch
          </button>
        </section>
      </div>
      <section>
        <h2>Captured Output</h2>
        <p data-testid="overlay-mounted">{overlayMounted ? "true" : "false"}</p>
        <p data-testid="runtime-state">{runtimeState}</p>
        <p data-testid="interview-state">{harnessState.interviewState}</p>
        <p data-testid="embedded-online">{harnessState.online ? "true" : "false"}</p>
        <p data-testid="persisted-event-count">{String(harnessState.persistedEventCount)}</p>
        <p data-testid="completion-count">{String(harnessState.completionCount)}</p>
        <p data-testid="queued-batch-count">{String(harnessState.queuedBatchCount)}</p>
        <p data-testid="rejection-reasons">{harnessState.rejectedReasons.join(",")}</p>
        <p data-testid="rejected-count">{String(harnessState.rejectedReasons.length)}</p>
      </section>
    </main>
  );
}

function EmbeddedRuntimeHarnessApp() {
  const [status, setStatus] = useState<EmbeddedRuntimeHarnessState>(DEFAULT_HARNESS_STATE);
  const statusRef = useRef(status);
  const activeSessionIdRef = useRef<string | null>(null);
  const activeOriginRef = useRef<string | null>(null);
  const retiredSessionIdsRef = useRef<Set<string>>(new Set());
  const pendingBatchesRef = useRef<Array<ReturnType<typeof parseWebResearchBatchMessage>>>([]);
  const searchParams = new URLSearchParams(window.location.search);
  const scenario = (searchParams.get("scenario") as HarnessScenario | null) ?? "happy_path";

  if (!pendingBatchesRef.current) {
    pendingBatchesRef.current = [];
  }

  const publishStatus = useCallback((next: Partial<EmbeddedRuntimeHarnessState>) => {
    const resolved: EmbeddedRuntimeHarnessState = {
      ...statusRef.current,
      ...next,
    };
    statusRef.current = resolved;
    setStatus(resolved);
    if (window.parent !== window) {
      window.parent.postMessage({ type: "harness:status", ...resolved }, "*");
    }
  }, []);

  useEffect(() => {
    publishStatus({
      online: scenario !== "reconnect",
    });

    const rejectBatch = (reason: string) => {
      const rejectionSet = new Set(statusRef.current.rejectedReasons);
      rejectionSet.add(reason);
      publishStatus({
        interviewState: "safe_rejecting",
        rejectedReasons: [...rejectionSet],
      });
    };

    const acceptBatch = (eventCount: number) => {
      publishStatus({
        interviewState: "active",
        persistedEventCount: statusRef.current.persistedEventCount + eventCount,
      });
    };

    const processBatchPayload = (
      parsedBatch: ReturnType<typeof parseWebResearchBatchMessage>,
      origin: string,
    ) => {
      if (!parsedBatch.success) {
        rejectBatch("invalid_batch");
        return;
      }

      const parsedMessage = parsedBatch.value;
      const activeOrigin = activeOriginRef.current;
      const activeSessionId = activeSessionIdRef.current;

      if (scenario === "reject_origin") {
        rejectBatch("invalid_origin");
        return;
      }

      if (activeOrigin && origin !== activeOrigin) {
        rejectBatch("invalid_origin");
        return;
      }

      if (scenario === "reject_environment" && parsedMessage.session.environment !== "prod") {
        rejectBatch("invalid_environment");
        return;
      }

      if (retiredSessionIdsRef.current.has(parsedMessage.session.sessionId)) {
        rejectBatch("stale_session");
        return;
      }

      if (activeSessionId && parsedMessage.session.sessionId !== activeSessionId) {
        rejectBatch("session_mismatch");
        return;
      }

      if (scenario === "reconnect" && !statusRef.current.online) {
        pendingBatchesRef.current?.push(parsedBatch);
        publishStatus({ queuedBatchCount: (pendingBatchesRef.current ?? []).length });
        return;
      }

      acceptBatch(parsedMessage.events.length);
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        typeof event.data === "object" &&
        event.data !== null &&
        (event.data as { type?: string }).type === "harness:set-online"
      ) {
        const online = Boolean((event.data as { online?: boolean }).online);
        publishStatus({ online });

        if (online && scenario === "reconnect") {
          for (const queuedBatch of pendingBatchesRef.current ?? []) {
            processBatchPayload(queuedBatch, event.origin || window.location.origin);
          }
          if (pendingBatchesRef.current) {
            pendingBatchesRef.current.length = 0;
          }
          publishStatus({ queuedBatchCount: 0 });
        }

        return;
      }

      const handshakeInit = parseWebResearchHandshakeInitMessage(event.data);
      if (handshakeInit.success) {
        activeOriginRef.current = event.origin;
        activeSessionIdRef.current = handshakeInit.value.session.sessionId;
        const readyMessage = {
          type: WEB_RESEARCH_HANDSHAKE_READY_MESSAGE_TYPE,
          version: WEB_RESEARCH_PROTOCOL_VERSION,
          session: handshakeInit.value.session,
          sentAt: new Date().toISOString(),
        };
        const targetOrigin = event.origin || window.location.origin;
        (event.source as Window | null)?.postMessage(readyMessage, targetOrigin);
        publishStatus({ interviewState: "active" });
        return;
      }

      const parsedBatch = parseWebResearchBatchMessage(event.data);
      if (
        parsedBatch.success ||
        (event.data as { type?: string }).type === WEB_RESEARCH_BATCH_MESSAGE_TYPE
      ) {
        processBatchPayload(parsedBatch, event.origin);
        return;
      }

      const parsedComplete = parseWebResearchCompleteMessage(event.data);
      if (!parsedComplete.success) {
        return;
      }

      const completeMessage = parsedComplete.value;
      retiredSessionIdsRef.current.add(completeMessage.session.sessionId);
      if (activeSessionIdRef.current === completeMessage.session.sessionId) {
        activeSessionIdRef.current = null;
      }
      publishStatus({
        completionCount: statusRef.current.completionCount + 1,
        interviewState: "ended",
      });
    };

    window.addEventListener("message", handleMessage);
    publishStatus({ interviewState: "booting" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [publishStatus, scenario]);

  return (
    <main style={{ fontFamily: "Inter, sans-serif", margin: "0 auto", maxWidth: 720, padding: 24 }}>
      <h1 data-testid="embedded-runtime-title">Embedded Runtime Harness</h1>
      <p data-testid="embedded-runtime-state">{status.interviewState}</p>
      <p data-testid="embedded-runtime-persisted">{String(status.persistedEventCount)}</p>
      <p data-testid="embedded-runtime-rejections">{status.rejectedReasons.join(",")}</p>
    </main>
  );
}

const currentPath = window.location.pathname;

createRoot(document.getElementById("root") as HTMLElement).render(
  currentPath.startsWith("/embedded-runtime-harness") ? (
    <EmbeddedRuntimeHarnessApp />
  ) : (
    <PartnerHostHarnessApp />
  ),
);
