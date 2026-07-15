# Local Integration Runbook

Use this runbook when validating the SDK repo together with a separate host application.

## Linked validation (fast iteration)

In this repo:

```bash
yarn install
yarn build
```

In your host app, link the packages:

```bash
# Using yarn link
cd packages/core && yarn link
cd packages/react && yarn link
cd packages/recorder && yarn link

# In your host app
yarn link @insightfull/web-research-sdk
yarn link @insightfull/web-research-sdk-react
yarn link @insightfull/web-research-sdk-recorder
```

## Packed validation (publish parity)

```bash
yarn build
cd packages/core && yarn pack --dry-run
cd packages/react && yarn pack --dry-run
cd packages/recorder && yarn pack --dry-run
```

Install the generated tarballs into your host app.

## Smoke test checklist

### SDK initialization

- [ ] `InsightfullSDK.init({ clientId })` returns an SDK instance
- [ ] `sdk.identify("user_1", { key: "value" })` sets user traits
- [ ] `sdk.track("event_name")` enqueues an event
- [ ] `sdk.destroy()` stops all tracking and listeners

### React integration

- [ ] `InsightfullProvider` renders children during SSR
- [ ] `useInsightfull()` returns `{ sdk: null, isReady: false }` before init
- [ ] `useInsightfull().sdk.track(...)` works after mount
- [ ] Provider cleanup destroys SDK on unmount

### Trigger evaluation (requires backend)

- [ ] Configure a trigger in the Insightfull dashboard
- [ ] Fire the matching event → study appears
- [ ] URL pattern triggers fire on matching pageviews

## Release-readiness commands

```bash
yarn workspace @insightfull/web-research-sdk build
yarn workspace @insightfull/web-research-sdk test
yarn workspace @insightfull/web-research-sdk-react build
yarn workspace @insightfull/web-research-sdk-react test
yarn workspace @insightfull/web-research-sdk-recorder build
yarn workspace @insightfull/web-research-sdk-recorder test
```

For Insightfull's provenance preparation script, point `WEB_RESEARCH_SDK_REPO` at a clean checkout of the exact full commit pinned by that script:

```bash
WEB_RESEARCH_SDK_REPO=/absolute/path/to/web-research-sdk \
  DOGFOOD_SDK_FORCE_PREPARE=1 \
  yarn prepare:web-research-sdk-dogfood
```

The script intentionally rejects a dirty checkout or a different HEAD. Update the downstream full-commit pin only after the SDK change is reviewed and committed.

The `@insightfull/web-research-sdk-shared` package is an internal workspace package and is **not** part of the public adoption surface.
