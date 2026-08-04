# Explain and debug interview delivery

The SDK evaluates targeting locally and exposes the result through a typed, privacy-safe decision trace. This lets developers answer “why did this interview appear?” and “why did it not appear?” without inspecting private iframe DOM or guessing from network traffic.

## Dry-run a delivery decision

```ts
const evaluation = sdk.explainDelivery("checkout_completed");
```

The dry run uses the current SDK configuration, identity, attributes, cooldowns, and pathname. It does **not** render an interview, mutate cooldown state, call delivery callbacks, or enqueue telemetry.

Override the pathname when testing a future route or a routing fixture:

```ts
const evaluation = sdk.explainDelivery("pricing_opened", {
  pathname: "/pricing/enterprise",
});
```

## Observe real delivery attempts

Register the callback during initialization:

```ts
const sdk = InsightfullSDK.init({
  clientId: "env_abc123",
  onDeliveryEvaluation(evaluation) {
    if (evaluation.outcome === "not_matched") {
      console.info("Interview not delivered", evaluation.reasonCode);
    }
  },
});
```

Or subscribe and clean up later:

```ts
const unsubscribe = sdk.onDeliveryEvaluation((evaluation) => {
  updateDeveloperPanel(evaluation);
});

unsubscribe();
```

The most recent real evaluation is available as `sdk.lastDeliveryEvaluation`. Events tracked while configuration is loading first emit `configuration_pending`, then a final result when loading finishes.

## Read the trace

```ts
interface InsightfullDeliveryEvaluation {
  eventName: string;
  outcome: "deferred" | "matched" | "not_matched" | "presented" | "suppressed";
  pathname: string;
  reasonCode: InsightfullDeliveryReasonCode;
  selectedStudyId: number | null;
  studies: readonly InsightfullDeliveryStudyEvaluation[];
  timestamp: number;
}
```

The top-level outcome describes the delivery result. Each study contains its own result, and each trigger shows whether event or URL matching, activation, filters, priority, and cooldown allowed it to match.

## Reason codes

| Reason code                 | Meaning                                                                             | Typical action                                                          |
| --------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `matched`                   | A study passed targeting.                                                           | No targeting action needed.                                             |
| `direct_launch_active`      | A preview or direct launch is already active, so automatic delivery was suppressed. | Complete or dismiss the active preview first.                           |
| `configuration_pending`     | Configuration is still loading.                                                     | Await `ready()` or wait for the final callback.                         |
| `configuration_unavailable` | Configuration could not load.                                                       | Check Client ID, allowed hostname, CSP, network, and environment state. |
| `sdk_destroyed`             | The SDK was destroyed before evaluation.                                            | Initialize once in a live browser lifecycle.                            |
| `no_studies`                | The environment has no configured studies.                                          | Add or assign a study to the environment.                               |
| `no_matching_study`         | Studies exist, but none passed all targeting rules.                                 | Inspect the per-study and per-trigger trace.                            |
| `study_has_no_triggers`     | A study has no automatic-delivery trigger.                                          | Add an event or URL trigger.                                            |
| `trigger_inactive`          | The configured trigger is disabled.                                                 | Activate the intended trigger.                                          |
| `event_mismatch`            | The tracked event differs from the configured event.                                | Align stable event names exactly.                                       |
| `url_mismatch`              | The current pathname does not match the configured URL rule.                        | Check the pathname pattern or pass the expected route in a dry run.     |
| `filter_mismatch`           | One or more audience conditions failed.                                             | Verify identity timing, attribute names, types, and condition logic.    |
| `cooldown_active`           | The participant is still in the study cooldown window.                              | Use preview for QA or wait for the configured cooldown.                 |
| `another_study_selected`    | Another eligible study won by priority.                                             | Review study priorities and overlapping triggers.                       |
| `active_study_present`      | A participant session is already active.                                            | Complete, dismiss, or resume the active interview first.                |
| `renderer_failed`           | Targeting matched, but the host renderer threw or could not mount.                  | Fix `renderStudy`, bridge registration, or container lifecycle.         |

Reason-code strings are a stable public contract suitable for tests and developer tooling. Human-facing applications should map them to their own localized copy.

## Privacy contract

Decision traces intentionally include:

- study IDs;
- trigger event names and URL rules;
- configured property names and operators;
- boolean match results;
- delivery timestamps and reason codes.

They never include participant attribute values or configured comparison values. Avoid logging the separate `sdk.currentAttributes` snapshot unless your own privacy policy explicitly permits it.

Delivery telemetry sent to Insightfull is compact and bounded. The study **Delivery health** panel summarizes a recent sample of delivery evaluations and reports when results are sampled; it is an operational diagnostic, not a participant analytics export.

## Test delivery as a contract

```ts
await sdk.ready();
sdk.identify("test_participant", { plan: "pro" });

const result = sdk.explainDelivery("checkout_completed", {
  pathname: "/checkout/complete",
});

expect(result.outcome).toBe("matched");
expect(result.selectedStudyId).toBe(expectedStudyId);
```

This is deterministic and side-effect free, so it belongs in integration tests. Keep one browser E2E test as well to prove the packed SDK can mount, minimize, resume, and dismiss the actual iframe host.

## Renderer failures

If the trace reports `renderer_failed`:

1. make `renderStudy` mount synchronously or return a cleanup function;
2. register the exact supplied iframe with `registerIframeBridge(iframe)`;
3. keep that iframe mounted while minimized;
4. ensure cleanup can run during dismissal, identity reset, replacement, or destroy;
5. let the SDK control minimize, expand, and dismiss through the supplied actions.

See [Customize the interview experience](customize-interview-experience.md) for complete configured and host-owned examples.
