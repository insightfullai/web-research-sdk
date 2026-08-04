"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, PanelRightOpen, X } from "lucide-react";
import type { InsightfullStudyRenderPayload } from "@insightfull/web-research-sdk";
import { InsightfullProvider, useInsightfull } from "@insightfull/web-research-sdk-react";
import { attachInsightfullRecorder } from "@insightfull/web-research-sdk-recorder";
import type { InsightfullRecorderController } from "@insightfull/web-research-sdk-recorder";
import { CheckoutExperience } from "@/components/checkout-experience";
import { RecordingAdapter, type RecordingAdapterStatus } from "@/lib/recording-adapter";
import { Button } from "@/components/ui/button";

interface ActiveStudy {
  dismiss: () => void;
  displayState: "expanded" | "minimized";
  expand: () => void;
  iframeUrl: string;
  minimize: () => void;
  registerIframeBridge: (iframe: HTMLIFrameElement) => () => void;
  studyId: number;
  title: string;
  organizationName: string;
}

const clientId = process.env.NEXT_PUBLIC_INSIGHTFULL_CLIENT_ID?.trim();
const apiBase = process.env.NEXT_PUBLIC_INSIGHTFULL_API_BASE?.trim();
const triggerEvent =
  process.env.NEXT_PUBLIC_INSIGHTFULL_TRIGGER_EVENT?.trim() || "checkout_started";

function RecordingStatus() {
  const [status, setStatus] = useState<RecordingAdapterStatus>("awaiting-response-context");
  const [error, setError] = useState<string | null>(null);
  const { sdk, isReady } = useInsightfull();
  const adapterRef = useRef<RecordingAdapter | null>(null);
  const recorderRef = useRef<InsightfullRecorderController | null>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!sdk || !isReady || !apiBase || adapterRef.current) {
      return;
    }

    const adapter = new RecordingAdapter(sdk, {
      apiBase,
      onStatusChange: (next) => {
        setStatus(next);
        setError(adapter.getErrorCode());
      },
    });
    adapterRef.current = adapter;

    const recorder = attachInsightfullRecorder(adapter.recorderSdk, {
      createSession: (session) => adapter.createSession(session),
      enabled: true,
      maskAllInputs: true,
      maskAllText: true,
      uploadChunk: (chunk) => adapter.uploadChunk(chunk),
    });
    recorderRef.current = recorder;

    return () => {
      recorderRef.current = null;
      adapterRef.current = null;
      if (!adapter.getRecordingSessionId()) {
        adapter.destroy();
        recorder.detach().catch(() => undefined);
        return;
      }
      recorder
        .detach()
        .then(() => adapter.finalize("component_unmount"))
        .catch(() => undefined)
        .finally(() => adapter.destroy());
    };
  }, [sdk, isReady]);

  useEffect(() => {
    if (!sdk || !isReady || triggeredRef.current) {
      return;
    }
    triggeredRef.current = true;
    sdk.track(triggerEvent, {
      source: "next-app-survey",
      url: window.location.pathname,
    });
  }, [sdk, isReady, triggerEvent]);

  return (
    <div
      className="fixed bottom-4 left-4 z-50 rounded-lg border bg-background p-3 text-xs shadow-lg"
      data-testid="recording-status-panel"
    >
      <div className="font-medium">SDK: {isReady ? "ready" : "initializing"}</div>
      <div data-testid="recording-status">recording: {status}</div>
      {error ? (
        <div className="text-destructive" data-testid="recording-error">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function StudyPanel({ activeStudy }: { activeStudy: ActiveStudy | null }) {
  const unregisterRef = useRef<(() => void) | null>(null);

  const setIframeRef = useCallback(
    (iframe: HTMLIFrameElement | null) => {
      if (unregisterRef.current) {
        unregisterRef.current();
        unregisterRef.current = null;
      }
      if (iframe && activeStudy) {
        unregisterRef.current = activeStudy.registerIframeBridge(iframe);
      }
    },
    [activeStudy],
  );

  useEffect(() => {
    return () => {
      if (unregisterRef.current) {
        unregisterRef.current();
        unregisterRef.current = null;
      }
    };
  }, []);

  if (!activeStudy) {
    return null;
  }

  return (
    <>
      <div
        aria-hidden={activeStudy.displayState === "minimized"}
        className={`fixed right-0 top-0 z-40 flex h-screen w-[min(420px,100vw)] flex-col border-l bg-background shadow-xl ${activeStudy.displayState === "minimized" ? "invisible pointer-events-none" : "visible"}`}
        data-testid="study-panel"
      >
        <div className="flex items-center justify-between border-b p-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{activeStudy.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {activeStudy.organizationName} in-app test
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              onClick={activeStudy.minimize}
              size="sm"
              variant="ghost"
              data-testid="minimize-study"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              aria-label="Leave interview"
              onClick={activeStudy.dismiss}
              size="sm"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative flex-1" id={`insightfull-study-${activeStudy.studyId}`}>
          <iframe
            allow="clipboard-write; microphone; camera"
            className="absolute inset-0 h-full w-full border-0"
            ref={setIframeRef}
            src={activeStudy.iframeUrl}
            title={activeStudy.title}
          />
        </div>
      </div>
      {activeStudy.displayState === "minimized" ? (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border bg-background p-2 shadow-lg">
          <span className="text-xs text-muted-foreground">{activeStudy.title}</span>
          <Button
            onClick={activeStudy.expand}
            size="sm"
            variant="ghost"
            data-testid="restore-study"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function InsightfullShell() {
  const [activeStudy, setActiveStudy] = useState<ActiveStudy | null>(null);

  const renderStudy = useCallback((payload: InsightfullStudyRenderPayload) => {
    setActiveStudy({
      dismiss: payload.dismiss,
      displayState: "expanded",
      expand: payload.expand,
      iframeUrl: payload.iframeUrl,
      minimize: payload.minimize,
      registerIframeBridge: payload.registerIframeBridge,
      studyId: payload.study.id,
      title: payload.study.title ?? "Insightfull study",
      organizationName: payload.study.branding.organizationName,
    });
    const unsubscribe = payload.onDisplayStateChange((displayState) => {
      setActiveStudy((current) => (current ? { ...current, displayState } : current));
    });
    return () => {
      unsubscribe();
      setActiveStudy(null);
    };
  }, []);

  const providerOptions = useMemo(
    () => ({
      ...(apiBase ? { apiBase } : {}),
      renderStudy,
    }),
    [renderStudy],
  );

  const checkout = <CheckoutExperience isConfigured={Boolean(clientId)} />;

  return (
    <>
      {clientId ? (
        <InsightfullProvider clientId={clientId} options={providerOptions}>
          <div className={activeStudy?.displayState === "expanded" ? "lg:pr-[420px]" : ""}>
            {checkout}
          </div>
          <RecordingStatus />
        </InsightfullProvider>
      ) : (
        checkout
      )}

      <StudyPanel activeStudy={activeStudy} />
    </>
  );
}
