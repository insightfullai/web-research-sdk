import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import { InsightfullSDK } from "@insightfull/web-research-sdk";

function getCurrentRoute() {
  return `${window.location.pathname}${window.location.hash}`;
}

function App() {
  const sdkRef = useRef(InsightfullSDK.init({ clientId: "env_dev" }));

  useEffect(() => {
    const sdk = sdkRef.current;
    sdk.identify("user_123", { plan: "starter" });
    sdk.track("page_viewed", { route: getCurrentRoute() });

    const handleRoute = () => {
      sdk.track("route_changed", { route: getCurrentRoute() });
    };
    window.addEventListener("popstate", handleRoute);
    window.addEventListener("hashchange", handleRoute);

    return () => {
      window.removeEventListener("popstate", handleRoute);
      window.removeEventListener("hashchange", handleRoute);
    };
  }, []);

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
      <p data-testid="route">{getCurrentRoute()}</p>
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
            }}
          >
            Push history route
          </button>
          <button
            data-testid="hash-button"
            type="button"
            onClick={() => {
              window.location.hash = "confirmation";
            }}
          >
            Update hash route
          </button>
        </section>
      </div>
      <section>
        <h2>Captured Output</h2>
        <p data-testid="batch-count">0</p>
        <p data-testid="completion-count">0</p>
        <p data-testid="captured-event-names" />
        <pre data-testid="latest-batch">null</pre>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
