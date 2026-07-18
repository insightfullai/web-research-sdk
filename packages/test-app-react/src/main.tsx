import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  InsightfullRecordingActivityEvidenceMessage,
  InsightfullResponseCompletedMessage,
  InsightfullStudyRenderPayload,
} from "@insightfull/web-research-sdk";
import { InsightfullSDK } from "@insightfull/web-research-sdk";
import type { InsightfullRecorderController } from "@insightfull/web-research-sdk-recorder";
import { attachInsightfullRecorder } from "@insightfull/web-research-sdk-recorder";

const HOST_CONTEXT = {
  scenario: { id: "northstar_checkout_v1", label: "Northstar checkout" },
  state: { checkoutStep: "review", promoEntryAvailable: true },
  surface: {
    id: "checkout_review",
    label: "Checkout review",
    routeTemplate: "/checkout",
  },
  task: { id: "apply_promo_code", label: "Apply a promotional code" },
  version: 1 as const,
};
const RESPONSE_ID = 91_002;
const SECTION_RESPONSE_ID = 91_020;

const config = {
  environment: {
    allowedDomains: null,
    clientId: "env_dev",
    isActive: true,
    name: "SDK test app",
  },
  globalSettings: { cooldownDays: 0, sessionTimeoutMs: 1_800_000 },
  studies: [
    {
      branding: { logoUrl: null, organizationName: "Insightfull", theme: null },
      experienceMode: "interview",
      id: 42,
      sections: [],
      shareUrl: "test-study",
      title: "SDK contract test",
      triggers: [{ eventName: "test_launch", filters: [], isActive: true, priority: 0 }],
      type: "interview",
    },
  ],
};

globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/trpc/sdk.getConfig")) {
    return new Response(JSON.stringify({ result: { data: { json: config } } }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }
  return new Response(JSON.stringify({ result: { data: { json: { ingested: 1 } } } }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
};

function App() {
  const sdkRef = useRef<InsightfullSDK | null>(null);
  const recorderRef = useRef<InsightfullRecorderController | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const renderPayloadRef = useRef<InsightfullStudyRenderPayload | null>(null);
  const [launchContext, setLaunchContext] = useState("null");
  const [activityEvidenceCount, setActivityEvidenceCount] = useState(0);
  const [finalizationCount, setFinalizationCount] = useState(0);
  const [recorderState, setRecorderState] = useState("idle");

  useEffect(() => {
    const sdk = InsightfullSDK.init({
      apiBase: window.location.origin,
      autoTrack: false,
      clientId: "env_dev",
      onActivityEvidence: () => setActivityEvidenceCount((count) => count + 1),
      renderStudy: (payload) => {
        renderPayloadRef.current = payload;
        setLaunchContext(JSON.stringify(payload.context));
        const iframe = document.createElement("iframe");
        iframe.hidden = true;
        iframe.src = "about:blank";
        document.body.appendChild(iframe);
        iframeRef.current = iframe;
        payload.registerIframeBridge(iframe);
      },
    });
    sdkRef.current = sdk;
    const recorder = attachInsightfullRecorder(sdk, {
      enabled: true,
      finalizeSession: () => {
        setFinalizationCount((count) => count + 1);
      },
      uploadActivityEvidence: () => undefined,
      uploadChunk: () => undefined,
    });
    recorderRef.current = recorder;

    return () => {
      recorderRef.current = null;
      sdkRef.current = null;
      void recorder.detach();
      void sdk.destroy();
      iframeRef.current?.remove();
    };
  }, []);

  const dispatchFromIframe = (data: unknown): void => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      throw new Error("Study iframe is not registered");
    }
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: window.location.origin,
        source: iframe.contentWindow,
      }),
    );
  };

  const completeResponse = (): void => {
    const payload = renderPayloadRef.current;
    const nonce = payload?.context.iframeBridge?.nonce;
    if (!nonce) {
      throw new Error("Study bridge nonce is unavailable");
    }
    dispatchFromIframe({
      nonce,
      studyId: 42,
      type: "insightfull.iframe_ready",
      version: 1,
    });
    recorderRef.current?.start();
    setRecorderState(recorderRef.current?.state ?? "idle");
    dispatchFromIframe({
      nonce,
      responseId: RESPONSE_ID,
      sectionResponseId: SECTION_RESPONSE_ID,
      studyId: 42,
      type: "insightfull.recording_context",
      version: 1,
    });

    const recordingSessionId = recorderRef.current?.getState().recordingSessionId;
    if (!recordingSessionId) {
      throw new Error("Recorder did not start");
    }
    const activityMessage: InsightfullRecordingActivityEvidenceMessage = {
      evidence: {
        captureOffsetMs: 1200,
        delivery: "silent",
        evidenceId: "5b38db9d-e06f-47dc-8b36-bf66b7687023",
        facts: { actionId: "apply_promo_code", kind: "click" },
        kind: "click",
        occurredAt: "2026-01-01T12:00:01.200Z",
        recordingSessionId,
        sequence: 1,
        version: 1,
      },
      nonce,
      responseId: RESPONSE_ID,
      sectionResponseId: SECTION_RESPONSE_ID,
      studyId: 42,
      type: "insightfull.recording_activity_evidence",
      version: 1,
    };
    const completionMessage: InsightfullResponseCompletedMessage = {
      nonce,
      responseId: RESPONSE_ID,
      studyId: 42,
      type: "insightfull.response_completed",
      version: 1,
    };
    dispatchFromIframe(activityMessage);
    dispatchFromIframe(completionMessage);
    dispatchFromIframe(completionMessage);
    window.setTimeout(() => {
      setRecorderState(recorderRef.current?.state ?? "idle");
    }, 0);
  };

  return (
    <main
      style={{
        fontFamily: "Inter, sans-serif",
        margin: "0 auto",
        maxWidth: 900,
        padding: 24,
      }}
    >
      <h1>Web Research SDK Test App</h1>
      <button
        data-testid="launch-button"
        onClick={() =>
          sdkRef.current?.track("test_launch", undefined, {
            hostContext: HOST_CONTEXT,
          })
        }
        type="button"
      >
        Launch study
      </button>
      <button data-testid="complete-button" onClick={completeResponse} type="button">
        Complete response
      </button>
      <section>
        <h2>Contract output</h2>
        <pre data-testid="launch-context">{launchContext}</pre>
        <p data-testid="activity-evidence-count">{activityEvidenceCount}</p>
        <p data-testid="finalization-count">{finalizationCount}</p>
        <p data-testid="recorder-state">{recorderState}</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
