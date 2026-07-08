"use client";

import { useCallback, useMemo, useState } from "react";
import type { InsightfullStudyRenderer } from "@insightfull/web-research-sdk";
import { InsightfullProvider } from "@insightfull/web-research-sdk-react";
import { CheckoutExperience } from "@/components/checkout-experience";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ActiveSurveyFrame {
  iframeUrl: string;
  title: string;
  organizationName: string;
}

const clientId = process.env.NEXT_PUBLIC_INSIGHTFULL_CLIENT_ID?.trim();
const apiBase = process.env.NEXT_PUBLIC_INSIGHTFULL_API_BASE?.trim();

export function InsightfullShell() {
  const [activeSurvey, setActiveSurvey] = useState<ActiveSurveyFrame | null>(null);

  const renderStudy = useCallback<InsightfullStudyRenderer>(
    ({ iframeUrl, study, removeDefaultStudy }) => {
      removeDefaultStudy();
      setActiveSurvey({
        iframeUrl,
        title: study.title ?? "Insightfull survey",
        organizationName: study.branding.organizationName,
      });
    },
    [],
  );

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
          {checkout}
        </InsightfullProvider>
      ) : (
        checkout
      )}

      <Dialog open={activeSurvey !== null} onOpenChange={(open) => !open && setActiveSurvey(null)}>
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>{activeSurvey?.title ?? "Insightfull survey"}</DialogTitle>
            <DialogDescription>
              {activeSurvey
                ? `${activeSurvey.organizationName} is collecting quick feedback about this checkout experience.`
                : "Insightfull survey frame."}
            </DialogDescription>
          </DialogHeader>
          <div className="h-[72vh] min-h-[520px] border-t bg-background">
            {activeSurvey ? (
              <iframe
                allow="clipboard-write"
                className="h-full w-full border-0"
                src={activeSurvey.iframeUrl}
                title={activeSurvey.title}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
