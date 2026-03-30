# Web Research SDK Monorepo Execution Plan

| Metadata       | Details                                     |
| :------------- | :------------------------------------------ |
| **Owner**      | Engineering                                 |
| **Status**     | Draft                                       |
| **Created**    | 2026-03-30                                  |
| **Repository** | `github.com/insightfullai/web-research-sdk` |

---

## 1) Context & North Star

We are building a **public open-source monorepo** for the SDK ecosystem using **`vp`** (Vite+ CLI) and **Yarn workspaces**.

Primary goal: publish a clean and stable SDK surface that is easy to adopt and maintain.

Primary publishable packages:

- `@insightfull/web-research-sdk` (core package, public)
- `@insightfull/web-research-sdk-react` (React integration package, public)

Internal package:

- `@insightfull/web-research-sdk-shared` (private workspace package)

Hard constraint: this monorepo is **library-only** for now. We are intentionally creating **no applications** in `apps/`.

---

## 2) Locked Decisions

1. **Toolchain**: `vp` commands for create/install/check/test/run/pack workflows.
2. **Package manager**: Yarn (`packageManager` pinned in root `package.json`).
3. **Monorepo style**: workspace packages under `packages/*` only.
4. **Primary package naming**: `@insightfull/web-research-sdk`.
5. **Optional integration package**: `@insightfull/web-research-sdk-react`.
6. **Publishing strategy**: Changesets + GitHub Actions + npm token-based publish.
7. **Versioning mode**: lockstep versions for core + react packages.

---

## 3) Monorepo Architecture (Target)

```text
web-research-sdk/
  packages/
    core/                       # @insightfull/web-research-sdk (public)
    react/                      # @insightfull/web-research-sdk-react (public)
    shared/                     # internal shared types/utilities (private)
  docs/
    plans/
    architecture/
    quickstart/
  .changeset/
  .github/workflows/
```

### Packaging principles

- `packages/core` is the canonical SDK entry point.
- `packages/react` depends on `packages/core`; never the reverse.
- `packages/shared` is private and never published.
- Publishable packages ship typed `esm` + `cjs` artifacts from `vp pack`.

---

## 4) Execution Plan by Milestone

## Milestone 0 — Workspace Scaffold (`vp` + Yarn + CI)

### Scope

- Set up root workspace with Yarn and `vp` conventions
- Add initial packages (`core`, `react`, `shared`)
- Add baseline CI and release workflows
- Add IDE + commit-hook integration defaults

### Scaffold command expectations

- `vp install`
- `vp check`
- `vp run -r test`
- `vp run -r build`
- `vp run -r pack`

### Required checks

- CI runs `vp check`, `vp run -r test`, `vp run -r build`
- `vp install --frozen-lockfile` succeeds in CI

### Quality gate

- Monorepo builds from clean clone with a single command sequence.

---

## Milestone 1 — Core SDK Contract + Public Facade

### Scope

- Stabilize exported API in `@insightfull/web-research-sdk`
- Define lifecycle/session/event contracts
- Add contract tests and backward-compatibility checks

### Required checks

- Unit tests for API contracts
- Type-level tests for exported API compatibility

---

## Milestone 2 — React Overlay Integration Package

### Scope

- Build React integration layer in `@insightfull/web-research-sdk-react`
- Keep React package additive and optional
- Ensure no browser-global side effects from import

### Required checks

- Unit tests for React package utilities
- Dependency boundary checks (`react` -> `core`, not inverse)

---

## Milestone 3 — Release Pipeline + Adoption Docs

### Scope

- Configure Changesets release workflow
- Publish with npm provenance-ready GitHub Actions permissions
- Add install and migration docs for external adopters

### Required checks

- Release workflow creates/updates release PR correctly
- Publish dry-run validates package contents and exports

---

## 5) CI and Developer Workflow Standards

## Local development defaults

- Static checks: `vp check`
- Test runner: `vp run -r test`
- Package builds: `vp run -r build`
- Library packaging: `vp run -r pack`

## GitHub Actions baseline

- Use `voidzero-dev/setup-vp@v1`
- Use `cache: true` for dependency caching
- Run:
  - `vp install --frozen-lockfile`
  - `vp check`
  - `vp run -r test`
  - `vp run -r build`

## Commit hooks and staged checks

- Configure hooks with `vp config`
- Run staged checks via `vp staged`
- Keep staged check config in root `vite.config.ts`

---

## 6) Publishing and Versioning

- Use Changesets for changelog + version orchestration.
- Keep `core` + `react` in a fixed version group.
- Exclude private shared package from publish.
- Require `publishConfig.access: public` in publishable package manifests.
- Store npm credentials in `NPM_TOKEN` GitHub secret.

---

## 7) Risks & Mitigations

1. **Unclear package boundaries early**
   - Mitigation: enforce dependency direction and keep shared package private.

2. **Release drift between packages**
   - Mitigation: lockstep versions for public SDK packages.

3. **Tooling churn while `vp` evolves**
   - Mitigation: pin versions, regularly run upgrade windows, keep CI explicit.

4. **CI flakiness due to environment mismatch**
   - Mitigation: use `setup-vp`, frozen lockfile installs, and pinned Node major version.

---

## 8) Immediate Next Actions (Week 1)

1. Complete scaffold PR with root config + package skeletons.
2. Validate CI green on clean clone.
3. Add first real core lifecycle interfaces.
4. Draft React overlay integration surface and examples in docs.
5. Add first Changesets entry and release dry-run.

---

## 9) Completion Criteria for “Execution Plan Accepted”

- [ ] Team agrees on package boundaries (`core`, `react`, `shared`)
- [ ] Library-only scope (no apps) is accepted
- [ ] `vp` command workflow is agreed and documented
- [ ] CI baseline and release workflow are approved
- [ ] Work breakdown is implementation-ready for delegated engineers
