# CI Main Frozen-Lockfile Fix Plan

| Metadata       | Details                                                         |
| :------------- | :-------------------------------------------------------------- |
| **Owner**      | Engineering Manager Orchestration                               |
| **Status**     | In Progress                                                     |
| **Created**    | 2026-03-30                                                      |
| **References** | GitHub Actions runs `23748285780` (CI), `23748285772` (Release) |

---

## 1. Context

`main` is red after commit `a3433f9`.

Both the `CI` and `Release` workflows fail during `vp install --frozen-lockfile` in the `Setup vp` / install phase.

Evidence from GitHub Actions logs shows Yarn wants to rewrite the lockfile because package manifests and `yarn.lock` are out of sync.

Key diffs reported by Yarn:

- `packages/react` dependency on `@insightfull/web-research-sdk` resolves differently than the checked-in lockfile expects.
- `@insightfull/web-research-sdk-shared` workspace resolution entry changed shape.
- `@insightfull/web-research-sdk` workspace entry no longer has the dependency shape reflected in the current lockfile.

This is a release-blocking CI regression and must be fixed without changing the intended Milestone 1-3 public API surface.

---

## 2. Root-cause hypothesis

Recent package metadata changes altered workspace dependency declarations, but the committed `yarn.lock` did not get regenerated to match the final manifests.

Likely fix scope:

1. Confirm final intended package dependency graph for local workspaces vs published packages.
2. Regenerate `yarn.lock` from the checked-in manifests.
3. Verify frozen-lockfile install succeeds locally.
4. Re-run full validation so CI and Release workflows should pass on push.

---

## 3. Delegation plan

### Engineer A — Staff Fullstack Engineer

**Scope**

- Investigate the exact lockfile/package-manifest mismatch causing `vp install --frozen-lockfile` to fail.
- Fix the workspace/package metadata in the smallest correct way.
- Regenerate and commit the correct `yarn.lock` shape.
- Keep changes scoped to CI/install correctness only unless a minimal follow-on correction is required.

**Required checks**

- `vp install --frozen-lockfile`
- `vp check`
- `vp run -r test`
- `vp run -r build`
- `vp run -r pack`

**Completion criteria**

- Local frozen-lockfile install succeeds from the updated working tree.
- No unexpected API changes are introduced.
- Workspace dependencies and publish-time package metadata remain intentional.

### Quality gate — Quality Reviewer

Review focus:

- lockfile/package-manifest consistency
- release safety / publish-readiness
- no accidental regression to public/private package boundaries
- validation coverage appropriate to the fix scope

---

## 4. Execution order

1. Engineer A fixes dependency metadata / lockfile drift.
2. Quality reviewer validates the fix and applies any minimal follow-up.
3. Commit and push the CI fix.
