import type {
  HostContextV1,
  InsightfullIframeDisplayState,
  InsightfullRecordingActivityEvidenceMessage,
  InsightfullResponseCompletedMessage,
  InsightfullStudyRenderPayload,
} from "@insightfull/web-research-sdk";
import { InsightfullSDK } from "@insightfull/web-research-sdk";
import type { InsightfullRecorderController } from "@insightfull/web-research-sdk-recorder";
import { attachInsightfullRecorder } from "@insightfull/web-research-sdk-recorder";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const HOST_CONTEXT = {
  scenario: { id: "northstar_checkout_v1", label: "Northstar checkout" },
  state: { checkoutStep: "review", promoEntryAvailable: true },
  surface: {
    id: "checkout_review",
    label: "Checkout review",
    routeTemplate: "/checkout",
  },
  task: { id: "apply_promo_code", label: "Apply a promotional code" },
  version: 1,
} satisfies HostContextV1;

const RESPONSE_ID = 91_002;
const SECTION_RESPONSE_ID = 91_020;
const STUDY_ID = 42;

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
      id: STUDY_ID,
      sections: [],
      shareUrl: "test-study",
      title: "Checkout interview",
      triggers: [{ eventName: "test_launch", filters: [], isActive: true, priority: 0 }],
      type: "interview",
    },
  ],
};

type DemoMode = "customized" | "default" | "headless" | "unavailable";

function getDemoMode(): DemoMode {
  const requested = new URLSearchParams(window.location.search).get("mode");
  if (requested === "customized" || requested === "headless" || requested === "unavailable") {
    return requested;
  }
  return "default";
}

globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/trpc/sdk.getConfig")) {
    if (getDemoMode() === "unavailable") {
      return new Response("Service unavailable", { status: 503 });
    }
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

interface EmbeddedContext {
  iframeBridge?: { nonce?: string };
}

function getEmbeddedContext(): EmbeddedContext {
  const encoded = new URLSearchParams(window.location.search).get("ctx");
  if (!encoded) {
    return {};
  }
  try {
    return JSON.parse(atob(encoded)) as EmbeddedContext;
  } catch {
    return {};
  }
}

type InterviewStage = "complete" | "consent" | "follow-up" | "invitation" | "task-1" | "task-2";

function EmbeddedInterview() {
  const context = getEmbeddedContext();
  const nonce = context.iframeBridge?.nonce ?? "";
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
  const [stage, setStage] = useState<InterviewStage>("invitation");

  const postToHost = (message: unknown): void => {
    window.parent.postMessage(message, window.location.origin);
  };

  useEffect(() => {
    postToHost({ nonce, studyId: STUDY_ID, type: "insightfull.iframe_ready", version: 1 });
    postToHost({
      nonce,
      responseId: RESPONSE_ID,
      sectionResponseId: SECTION_RESPONSE_ID,
      studyId: STUDY_ID,
      type: "insightfull.recording_context",
      version: 1,
    });

    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin || event.source !== window.parent) {
        return;
      }
      const message = event.data as { recordingSessionId?: unknown; type?: unknown };
      if (
        message.type === "insightfull.recording_session" &&
        typeof message.recordingSessionId === "string"
      ) {
        setRecordingSessionId(message.recordingSessionId);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [nonce]);

  const requestDisplayState = (state: InsightfullIframeDisplayState): void => {
    postToHost({
      nonce,
      state,
      studyId: STUDY_ID,
      type: "insightfull.iframe_display_state",
      version: 1,
    });
  };

  const sendActivityEvidence = (): void => {
    if (!recordingSessionId) {
      return;
    }
    const message: InsightfullRecordingActivityEvidenceMessage = {
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
      studyId: STUDY_ID,
      type: "insightfull.recording_activity_evidence",
      version: 1,
    };
    postToHost(message);
  };

  const finishInterview = (): void => {
    const message: InsightfullResponseCompletedMessage = {
      nonce,
      responseId: RESPONSE_ID,
      studyId: STUDY_ID,
      type: "insightfull.response_completed",
      version: 1,
    };
    postToHost(message);
    postToHost(message);
    setStage("complete");
  };

  return (
    <main className="interview-shell">
      <header className="interview-header">
        <div className="moderator-avatar" aria-hidden="true">
          ✦
        </div>
        <div>
          <strong>Emily</strong>
          <span data-testid="recording-session-status">
            {recordingSessionId ? "Privacy recording active" : "AI research moderator"}
          </span>
        </div>
        {stage !== "invitation" && stage !== "complete" ? (
          <button
            aria-label="Minimize interview"
            className="icon-button"
            onClick={() => requestDisplayState("minimized")}
            type="button"
          >
            —
          </button>
        ) : null}
      </header>

      <section className="interview-content">
        {stage === "invitation" ? (
          <>
            <p className="eyebrow">8 minute research session</p>
            <h1>Help us improve checkout</h1>
            <p>
              Share feedback while you complete two short tasks. Your product stays fully
              interactive throughout the interview.
            </p>
            <div className="disclosure-row">
              <span>🎙 AI-moderated</span>
              <span>🔒 Inputs masked</span>
            </div>
            <button className="primary-button" onClick={() => setStage("consent")} type="button">
              Start interview
            </button>
          </>
        ) : null}

        {stage === "consent" ? (
          <>
            <p className="eyebrow">Before you begin</p>
            <h1>You stay in control</h1>
            <ul className="consent-list">
              <li>Audio and a transcript are saved for this research study.</li>
              <li>Product interactions may be recorded with form values masked.</li>
              <li>You can minimize or leave at any time.</li>
            </ul>
            <button className="primary-button" onClick={() => setStage("task-1")} type="button">
              Allow microphone and join
            </button>
          </>
        ) : null}

        {stage === "task-1" || stage === "task-2" ? (
          <>
            <p className="eyebrow">Task {stage === "task-1" ? "1" : "2"} of 2</p>
            <h1>
              {stage === "task-1"
                ? "Add the annual Pro plan to your order."
                : "Apply promo code WELCOME20 and confirm the new total."}
            </h1>
            <p>Minimize this interview to use the checkout. Your progress will stay here.</p>
            <button
              className="primary-button"
              onClick={() => requestDisplayState("minimized")}
              type="button"
            >
              Minimize and try it
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                if (stage === "task-1") {
                  setStage("task-2");
                } else {
                  sendActivityEvidence();
                  setStage("follow-up");
                }
              }}
              type="button"
            >
              I completed this task
            </button>
          </>
        ) : null}

        {stage === "follow-up" ? (
          <>
            <p className="eyebrow">Follow-up · 1 of 1</p>
            <h1>What made finding the discount easier or harder than you expected?</h1>
            <div className="listening-state">
              <span aria-hidden="true" /> Listening — answer out loud
            </div>
            <button className="primary-button" onClick={finishInterview} type="button">
              Finish interview
            </button>
          </>
        ) : null}

        {stage === "complete" ? (
          <div className="completion-state">
            <div aria-hidden="true">✓</div>
            <p className="eyebrow">Response saved</p>
            <h1>Thanks — you’re all set</h1>
            <p>You can continue in the product right where you left off.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

interface HeadlessInterviewProps {
  displayState: InsightfullIframeDisplayState;
  onDismiss: () => void;
  onExpand: () => void;
  onMinimize: () => void;
  payload: InsightfullStudyRenderPayload;
}

function HeadlessInterview({
  displayState,
  onDismiss,
  onExpand,
  onMinimize,
  payload,
}: HeadlessInterviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }
    return payload.registerIframeBridge(iframe);
  }, [payload]);

  return (
    <>
      <div
        className="headless-pill"
        data-testid="headless-pill"
        hidden={displayState !== "minimized"}
      >
        <span aria-hidden="true" />
        <button onClick={onExpand} type="button">
          Return to checkout interview
        </button>
      </div>
      <aside
        className="headless-container"
        data-testid="headless-container"
        hidden={displayState === "minimized"}
      >
        <div className="headless-toolbar">
          <div>
            <strong>Acme Research</strong>
            <span>Powered by Insightfull</span>
          </div>
          <div>
            <button onClick={onMinimize} type="button">
              Minimize
            </button>
            <button onClick={onDismiss} type="button">
              Leave
            </button>
          </div>
        </div>
        <iframe
          ref={iframeRef}
          src={payload.iframeUrl}
          title={payload.study.title ?? "Insightfull interview"}
        />
      </aside>
    </>
  );
}

interface HeadlessState {
  displayState: InsightfullIframeDisplayState;
  payload: InsightfullStudyRenderPayload;
}

function HostProduct() {
  const mode = getDemoMode();
  const sdkRef = useRef<InsightfullSDK | null>(null);
  const recorderRef = useRef<InsightfullRecorderController | null>(null);
  const [activityEvidenceCount, setActivityEvidenceCount] = useState(0);
  const [annualPlanAdded, setAnnualPlanAdded] = useState(false);
  const [cleanupCount, setCleanupCount] = useState(0);
  const [finalizationCount, setFinalizationCount] = useState(0);
  const [headlessState, setHeadlessState] = useState<HeadlessState | null>(null);
  const [launchContext, setLaunchContext] = useState("null");
  const [promoApplied, setPromoApplied] = useState(false);
  const [responseCount, setResponseCount] = useState(0);
  const [resetStatus, setResetStatus] = useState("not-reset");
  const [sdkStatus, setSdkStatus] = useState("initializing");
  const [visitorId, setVisitorId] = useState("");

  useEffect(() => {
    let mounted = true;
    const appearance =
      mode === "customized"
        ? {
            accentColor: "#0f766e",
            borderRadius: 20,
            height: 680,
            minimizedLabel: "Continue checkout interview",
            placement: "bottom-left" as const,
            width: 430,
          }
        : null;
    const renderStudy =
      mode === "headless"
        ? (payload: InsightfullStudyRenderPayload) => {
            const unsubscribe = payload.onDisplayStateChange((displayState) => {
              if (mounted) {
                setHeadlessState({ displayState, payload });
              }
            });
            setLaunchContext(JSON.stringify(payload.context));
            return () => {
              unsubscribe();
              if (mounted) {
                setHeadlessState(null);
                setCleanupCount((count) => count + 1);
              }
            };
          }
        : null;
    const sdk = InsightfullSDK.init({
      apiBase: window.location.origin,
      ...(appearance ? { appearance } : {}),
      autoTrack: false,
      clientId: "env_dev",
      onActivityEvidence: () => setActivityEvidenceCount((count) => count + 1),
      onResponseCompleted: () => setResponseCount((count) => count + 1),
      ...(renderStudy ? { renderStudy } : {}),
    });
    sdkRef.current = sdk;
    setVisitorId(sdk.currentVisitorId);
    const recorder = attachInsightfullRecorder(sdk, {
      enabled: true,
      finalizeSession: () => setFinalizationCount((count) => count + 1),
      uploadActivityEvidence: () => undefined,
      uploadChunk: () => undefined,
    });
    recorderRef.current = recorder;

    void sdk.ready().then(
      () => {
        if (mounted) {
          setSdkStatus(sdk.status);
        }
      },
      () => {
        if (mounted) {
          setSdkStatus(sdk.status);
        }
      },
    );

    return () => {
      mounted = false;
      recorderRef.current = null;
      sdkRef.current = null;
      void recorder.detach();
      void sdk.destroy();
    };
  }, [mode]);

  const launch = (): void => {
    setLaunchContext(JSON.stringify(HOST_CONTEXT));
    sdkRef.current?.identify("participant_123", { plan: "starter" });
    sdkRef.current?.setAttributes({ cohort: "checkout-research", role: "admin" });
    sdkRef.current?.track("test_launch", undefined, { hostContext: HOST_CONTEXT });
  };

  const beginRecording = (): void => {
    recorderRef.current?.start();
  };

  const resetParticipant = async (): Promise<void> => {
    const previousVisitorId = sdkRef.current?.currentVisitorId;
    await sdkRef.current?.reset();
    const nextVisitorId = sdkRef.current?.currentVisitorId ?? "";
    setVisitorId(nextVisitorId);
    if (previousVisitorId === nextVisitorId) {
      throw new Error("Reset did not rotate the visitor ID");
    }
    setResetStatus("reset-complete");
  };

  const subtotal = annualPlanAdded ? 144 : 24;
  const total = subtotal - (promoApplied ? 20 : 0);

  return (
    <main className="host-product">
      <header className="product-header">
        <div className="brand-lockup">
          <div>W</div>
          <span>
            <strong>Waypoint</strong>
            <small>Team workspace</small>
          </span>
        </div>
        <div className="sdk-health">
          <span className={`status-dot status-${sdkStatus}`} />
          SDK <strong data-testid="sdk-status">{sdkStatus}</strong>
        </div>
      </header>

      <section className="product-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Billing</p>
            <h1>Choose your plan</h1>
            <p>Upgrade your workspace. Change or cancel your plan at any time.</p>
          </div>
          <div className="demo-badge">{mode} renderer</div>
        </div>

        <div className="checkout-grid">
          <article className="plan-card">
            <div className="card-heading">
              <div>
                <h2>Waypoint Pro</h2>
                <p>For growing product teams</p>
              </div>
              <span>Most popular</span>
            </div>
            <p className="price">
              $12 <small>/ user / month</small>
            </p>
            <ul>
              <li>Unlimited projects</li>
              <li>AI workflow assistant</li>
              <li>Advanced permissions</li>
              <li>Priority support</li>
            </ul>
            <button
              className="product-button"
              data-testid="add-plan"
              disabled={annualPlanAdded}
              onClick={() => setAnnualPlanAdded(true)}
              type="button"
            >
              {annualPlanAdded ? "Annual plan added" : "Add annual plan"}
            </button>
          </article>

          <aside className="summary-card">
            <h2>Order summary</h2>
            <p>Secure monthly billing</p>
            <div className="summary-line">
              <span>{annualPlanAdded ? "Pro · annual" : "Starter · monthly"}</span>
              <span>${subtotal}.00</span>
            </div>
            <button
              className="promo-button"
              data-testid="apply-promo"
              disabled={promoApplied}
              onClick={() => setPromoApplied(true)}
              type="button"
            >
              {promoApplied ? "WELCOME20 applied" : "Apply WELCOME20"}
            </button>
            <div className="summary-total">
              <span>Total today</span>
              <strong data-testid="order-total">${total}.00</strong>
            </div>
          </aside>
        </div>

        <section className="test-controls" aria-label="SDK test controls">
          <button data-testid="launch-button" onClick={launch} type="button">
            Launch contextual interview
          </button>
          <button data-testid="record-button" onClick={beginRecording} type="button">
            Begin privacy-safe recording
          </button>
          <button
            data-testid="host-minimize"
            onClick={() => sdkRef.current?.minimizeStudy()}
            type="button"
          >
            Host minimize
          </button>
          <button
            data-testid="host-expand"
            onClick={() => sdkRef.current?.expandStudy()}
            type="button"
          >
            Host expand
          </button>
          <button
            data-testid="host-dismiss"
            onClick={() => sdkRef.current?.dismissStudy()}
            type="button"
          >
            Host dismiss
          </button>
          <button data-testid="reset-button" onClick={resetParticipant} type="button">
            Reset participant
          </button>
        </section>

        <section className="contract-output" aria-label="Contract output">
          <output data-testid="launch-context">{launchContext}</output>
          <dl>
            <div>
              <dt>Visitor</dt>
              <dd data-testid="visitor-id">{visitorId}</dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd data-testid="activity-evidence-count">{activityEvidenceCount}</dd>
            </div>
            <div>
              <dt>Responses</dt>
              <dd data-testid="response-count">{responseCount}</dd>
            </div>
            <div>
              <dt>Finalizations</dt>
              <dd data-testid="finalization-count">{finalizationCount}</dd>
            </div>
            <div>
              <dt>Renderer cleanups</dt>
              <dd data-testid="cleanup-count">{cleanupCount}</dd>
            </div>
            <div>
              <dt>Reset</dt>
              <dd data-testid="reset-status">{resetStatus}</dd>
            </div>
          </dl>
        </section>
      </section>

      {headlessState ? (
        <HeadlessInterview
          displayState={headlessState.displayState}
          onDismiss={headlessState.payload.dismiss}
          onExpand={headlessState.payload.expand}
          onMinimize={headlessState.payload.minimize}
          payload={headlessState.payload}
        />
      ) : null}
    </main>
  );
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  window.location.pathname.startsWith("/study/") ? <EmbeddedInterview /> : <HostProduct />,
);
