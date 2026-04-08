import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  createCallbackTransport,
  createWebResearchClient,
  type WebResearchClient,
  type WebResearchEventBatch,
  type WebResearchTransportCompletePayload,
} from "@insightfull/web-research-sdk";

function getCurrentRoute() {
  return `${window.location.pathname}${window.location.hash}`;
}

function App() {
  const [batches, setBatches] = useState<WebResearchEventBatch[]>([]);
  const [completions, setCompletions] = useState<WebResearchTransportCompletePayload[]>([]);
  const [route, setRoute] = useState(() => getCurrentRoute());
  const clientRef = useRef<WebResearchClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = createWebResearchClient({
      environment: "dev",
      sessionId: "local-session",
      transport: createCallbackTransport({
        onBatch: (batch) => {
          setBatches((current) => [...current, batch]);
        },
        onComplete: (payload) => {
          setCompletions((current) => [...current, payload]);
        },
      }),
      batching: {
        batchSize: 100,
        flushIntervalMs: 0,
      },
    });
  }

  useEffect(() => {
    const handleRoute = () => setRoute(getCurrentRoute());
    window.addEventListener("popstate", handleRoute);
    window.addEventListener("hashchange", handleRoute);

    const client = clientRef.current as WebResearchClient;
    const session = client.startBrowserSession();

    return () => {
      window.removeEventListener("popstate", handleRoute);
      window.removeEventListener("hashchange", handleRoute);
      void session.destroy("app_unmount");
      client.destroy("app_unmount");
    };
  }, []);

  const client = clientRef.current as WebResearchClient;
  const capturedEvents = batches.flatMap((batch) => batch.events);

  return (
    <main style={{ fontFamily: "Inter, sans-serif", margin: "0 auto", maxWidth: 900, padding: 24 }}>
      <h1>Web Research SDK Test App</h1>
      <p data-testid="route">{route}</p>
      <div
        style={{
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
              void client.flush("manual_flush");
            }}
          >
            Flush captured events
          </button>
          <button
            data-testid="complete-button"
            type="button"
            onClick={() => {
              void client.complete("manual_complete");
            }}
          >
            Complete session
          </button>
        </section>
      </div>
      <section>
        <h2>Captured Output</h2>
        <p data-testid="batch-count">{String(batches.length)}</p>
        <p data-testid="completion-count">{String(completions.length)}</p>
        <p data-testid="captured-event-names">
          {capturedEvents.map((event) => event.name).join(",")}
        </p>
        <pre data-testid="latest-batch">{JSON.stringify(batches.at(-1) ?? null, null, 2)}</pre>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
