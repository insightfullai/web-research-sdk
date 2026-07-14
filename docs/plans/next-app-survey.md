# Next App Survey Recipe Plan

## Context

We are adding the first integration recipe app for the Insightfull Web Research SDK: a minimal Next.js checkout experience that triggers a real Insightfull survey when the shopper clicks **Buy now**. The recipe should act as customer-facing documentation for using the React SDK in a Next app and customizing the host UI around the survey iframe.

User requirements:

- Package/app name: `next-app-survey`.
- Use `NEXT_PUBLIC_INSIGHTFULL_CLIENT_ID` so customers can run the recipe against a real Insightfull environment.
- Trigger a real survey rather than mocking SDK config or ingestion.
- Use the SDK iframe survey experience, but let the host app present it inside a custom modal built with shadcn/ui Dialog.
- Use Vite Plus project scaffolding (`vp create`) where practical.

Relevant repo constraints:

- Yarn 4.9.2 workspaces, Node `>=24`, workspace packages under `packages/*` today.
- Published SDK packages are `packages/core` and `packages/react`.
- React provider is SSR-safe and currently initializes the SDK in `useEffect`.
- Current core SDK always renders a fixed-position iframe internally via `renderStudy(...)`; custom modal support needs a small public SDK API addition.
- Main verification is `yarn ready`; release parity is `yarn release:check`.

## Architecture Decision

Add a backwards-compatible custom renderer hook to core SDK initialization options. Default behavior remains unchanged. When provided, the custom renderer receives enough data to render the Insightfull survey iframe itself, allowing a host app to wrap the iframe in its own shadcn Dialog.

Target public API shape, exact naming may be refined by the implementing engineer:

```ts
InsightfullSDK.init({
  clientId,
  renderStudy: ({ iframeUrl, study, context, removeDefaultStudy }) => {
    // Host app opens custom UI and renders <iframe src={iframeUrl} />.
  },
});
```

The API must preserve:

- Existing `InsightfullSDK.init({ clientId })` behavior.
- Existing default fixed iframe rendering when no custom renderer is supplied.
- Existing iframe context payload semantics.
- Type safety for React consumers via `InsightfullProvider` options.

## Milestone 1 — SDK Custom Renderer Contract

### Engineer: staff-fullstack-engineer

Scope:

- Add a typed custom study renderer option to `packages/core`.
- Refactor iframe URL construction so both default and custom renderers share the same URL/context behavior.
- Ensure default renderer behavior and tests remain compatible.
- Ensure `@insightfull/web-research-sdk-react` can pass the new option through its existing `options` prop without additional React API changes unless needed.

Expected files likely touched:

- `packages/core/src/types/sdk-init.types.ts`
- `packages/core/src/types/index.ts` if needed
- `packages/core/src/iframe-renderer/iframe-renderer.ts`
- `packages/core/src/insightfull-sdk.ts`
- core tests under `packages/core/src/test/`
- React tests only if type/API changes require it

Required tests:

- Unit test proving default render path still appends an iframe with the expected URL and context.
- Unit test proving custom renderer is called with `iframeUrl`, `study`, and `context` when a trigger matches.
- Unit test proving custom renderer path does not create the default fixed iframe unless explicitly requested by the API design.
- Existing core and React test suites must pass.

Completion criteria:

- Backwards-compatible public API.
- Strict TypeScript without `any`.
- No production secrets, client IDs, or real customer data committed.
- Run and report:
  - `yarn workspace @insightfull/web-research-sdk test`
  - `yarn workspace @insightfull/web-research-sdk-react test`
  - focused build/typecheck command if needed.

## Milestone 2 — Next Recipe App with shadcn Dialog

### Engineer: staff-frontend-engineer

Scope:

- Scaffold a private Next app named `next-app-survey` using `vp create next-app` where practical.
- Place it in the repo as a workspace package. Preferred path: `packages/next-app-survey` unless scaffolding or repo conventions strongly suggest another path.
- Add shadcn/ui setup and Dialog-based modal UI.
- Build a polished but minimal checkout screen.
- Use the React SDK provider and hook with `NEXT_PUBLIC_INSIGHTFULL_CLIENT_ID`.
- Use the new custom renderer hook from Milestone 1 to render the real Insightfull iframe inside the Dialog.

Expected user flow:

1. User opens the recipe app.
2. Checkout screen shows mock cart/customer/payment details.
3. App identifies a demo user after SDK readiness.
4. User clicks **Buy now**.
5. App calls `sdk.track("checkout_completed", { total, currency, itemCount, checkoutType: "demo" })`.
6. If the real Insightfull environment has a matching survey trigger, the SDK calls the custom renderer.
7. The host app opens a shadcn Dialog and renders the survey iframe inside it.

Expected files likely added/touched:

- `packages/next-app-survey/package.json`
- `packages/next-app-survey/next.config.*`
- `packages/next-app-survey/tsconfig.json`
- `packages/next-app-survey/app/**`
- `packages/next-app-survey/components/**`
- `packages/next-app-survey/lib/**`
- `packages/next-app-survey/components.json`
- `packages/next-app-survey/.env.local.example`
- `packages/next-app-survey/README.md`
- root `package.json` workspace/scripts only if needed
- root `yarn.lock` after dependency install

Required app behavior:

- If `NEXT_PUBLIC_INSIGHTFULL_CLIENT_ID` is missing, render a clear setup callout and disable the real trigger button or make the disabled state explicit.
- No mocked Insightfull API routes or config responses.
- Use the default `apiBase` unless an optional documented `NEXT_PUBLIC_INSIGHTFULL_API_BASE` is useful for staging/local testing.
- All iframe URLs must come from the SDK renderer payload, not be reconstructed in the app.
- Dialog must have accessible title/description.
- Provide clear setup instructions for creating a real survey with trigger `checkout_completed`.

Required tests/verification:

- Build passes for the recipe app.
- Add a lightweight test if generated stack supports it easily; otherwise document manual verification steps in README.
- Run and report:
  - `yarn workspace next-app-survey build`
  - `yarn check` or scoped equivalent if full check is too broad/blocked.

## Milestone 3 — Documentation and Recipe Discoverability

### Engineer: staff-frontend-engineer or staff-fullstack-engineer

Scope:

- Add recipe docs without duplicating the entire SDK quickstart.
- Link the new recipe from the root README or docs quickstart index if appropriate.
- Ensure docs explain the real Insightfull setup steps:
  - Create or select environment.
  - Copy client ID to `.env.local`.
  - Create survey mode study.
  - Add active trigger for `checkout_completed`.
  - Add local app domain to allowed domains if required.
  - Run `yarn workspace next-app-survey dev`.

Required docs:

- `packages/next-app-survey/README.md` must be complete enough for a customer to follow.
- Root README gets a concise Recipes section if it does not become too noisy.

## Milestone 4 — Quality Gate

### Reviewer: quality-reviewer

Review scope:

- SDK public API compatibility and type safety.
- SSR/client-only boundaries in Next.
- shadcn/Dialog accessibility.
- Security/privacy:
  - no secrets committed;
  - client ID is treated as public but loaded from env;
  - no PII beyond obvious mock demo traits;
  - iframe URL is SDK-generated and encoded.
- Test coverage for the SDK renderer hook.
- Build/check reliability in this Yarn workspace.
- Documentation clarity for a real customer integration.

Reviewer should run or request evidence for:

- `yarn workspace @insightfull/web-research-sdk test`
- `yarn workspace @insightfull/web-research-sdk-react test`
- `yarn workspace next-app-survey build`
- `yarn check` or clearly documented scoped substitute if full check is blocked.

## Dependency Ordering

1. SDK renderer contract must land before the recipe app can render the iframe inside a Dialog.
2. Next app scaffolding can start in parallel, but Dialog iframe integration depends on Milestone 1 types/API.
3. Documentation depends on final app commands and SDK API names.
4. Quality gate runs after Milestones 1–3 are complete.

## Risks and Mitigations

- **Risk:** `vp create next-app` adds dependencies or files that conflict with repo formatting.
  - **Mitigation:** Keep scaffold minimal, run `vp check --fix` if needed, and avoid unrelated generated noise.
- **Risk:** Next app build requires package transpilation for workspace source imports.
  - **Mitigation:** Configure Next `transpilePackages` if needed for workspace SDK packages.
- **Risk:** shadcn base Dialog docs differ from installed CLI output.
  - **Mitigation:** Use shadcn CLI-generated components and keep the recipe self-contained.
- **Risk:** Real survey cannot be verified without a client ID and configured backend survey.
  - **Mitigation:** App build/test verifies integration mechanics; README includes manual real-survey checklist.
