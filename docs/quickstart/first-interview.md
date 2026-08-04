# Ship your first in-product interview

This path takes one stable product event from a development environment to a verified participant interview. It also proves why the interview is eligible before you launch it.

## 1. Create a development environment

In Insightfull, open **Settings → SDK**, create a **Development** environment, and allow the hostname where you will test. Copy its public Client ID, which starts with `env_`.

Keep development and production environment IDs separate. A Client ID is safe to ship in browser code; it is not an API secret.

## 2. Install and initialize

```bash
npm install @insightfull/web-research-sdk
```

Initialize the SDK once in your browser entry point:

```ts
import { InsightfullSDK } from "@insightfull/web-research-sdk";

export const insightfull = InsightfullSDK.init({
  clientId: import.meta.env.VITE_INSIGHTFULL_CLIENT_ID,
  autoTrack: true,
});

await insightfull.ready();
```

`init()` does not block the host application. `ready()` is the explicit integration checkpoint for tests and diagnostics.

## 3. Provide audience context

Identify the participant after your application knows who they are:

```ts
insightfull.identify("user_123", {
  plan: "pro",
  accountRole: "admin",
});
```

Use stable, non-sensitive attributes that you intend to target. Never send credentials, tokens, payment details, health data, or sensitive free-form text.

Reset identity before another person uses the same browser session:

```ts
await insightfull.reset();
```

## 4. Track one meaningful product signal

Choose a product-language event that will survive a UI refactor:

```ts
function completeCheckout(total: number) {
  insightfull.track("checkout_completed", { total });
}
```

Prefer `checkout_completed` over implementation names such as `green_button_clicked`.

## 5. Configure the study trigger

Create or open an in-app study in Insightfull and add an event trigger:

- event: `checkout_completed`;
- optional audience conditions: for example, `plan equals pro`;
- development SDK environment;
- active only after the interview content is ready to test.

## 6. Prove eligibility without displaying anything

Call `explainDelivery()` from your development tools or an automated test. It evaluates the same local targeting rules as `track()` but does not render an interview, set cooldown, or enqueue telemetry.

```ts
const evaluation = insightfull.explainDelivery("checkout_completed");

console.table({
  outcome: evaluation.outcome,
  reason: evaluation.reasonCode,
  selectedStudyId: evaluation.selectedStudyId,
});
```

A successful dry run reports `outcome: "matched"` and the selected study ID. If it does not match, inspect each study and trigger in `evaluation.studies`. Filter traces contain property names, operators, and boolean results—never participant or configured comparison values.

For live development instrumentation, subscribe once:

```ts
const stopDiagnostics = insightfull.onDeliveryEvaluation((evaluation) => {
  window.dispatchEvent(new CustomEvent("insightfull:delivery", { detail: evaluation }));
});

// During application teardown
stopDiagnostics();
```

## 7. Complete the real participant journey

Trigger the event from the real application and verify:

1. the invitation appears without covering the task the participant needs to perform;
2. consent and microphone states are understandable;
3. the interview can be minimized while the participant uses the host product;
4. resume preserves the same interview and host-application state;
5. dismissal restores control to the host;
6. completion is recorded exactly once;
7. the experience remains usable on desktop, mobile, keyboard navigation, and 200% zoom.

In Insightfull, open the study's **Delivery health** panel. It separates evaluated, eligible, and presented attempts and ranks the most common exclusion reason, so connection success is not confused with targeting success.

## 8. Promote intentionally

Create a production environment with the production hostname and provide its Client ID through your production configuration. Re-run the same integration proof and participant journey before activating the production trigger.

For React, use the [React integration](react-integration.md). For a host-owned panel, dialog, or drawer, use [Customize the interview experience](../guides/customize-interview-experience.md). If a study does not appear, use [Delivery diagnostics](../guides/delivery-diagnostics.md).
