# Release PR Lockfile Sync Fix Plan

| Metadata       | Details                                                                          |
| :------------- | :------------------------------------------------------------------------------- |
| **Owner**      | Engineering Manager Orchestration                                                |
| **Status**     | In Progress                                                                      |
| **Created**    | 2026-03-30                                                                       |
| **References** | CI run `23752753954`, Release run `23752753928`, `.github/workflows/release.yml` |

---

## 1. Context

After the Changesets release PR was created, approved, and merged, both `CI` and `Release` on `main` failed again during `vp install --frozen-lockfile`.

GitHub Actions evidence shows the merged release PR updated package versions from `0.1.0` to `0.1.1`, including the React package dependency on `@insightfull/web-research-sdk`, but did **not** update `yarn.lock`.

Representative lockfile drift from CI logs:

- `@insightfull/web-research-sdk-react` wants `@insightfull/web-research-sdk: npm:^0.1.1`
- checked-in `yarn.lock` still reflects `npm:^0.1.0`

This means the release PR flow currently versions package manifests/changelogs but leaves the lockfile stale, causing the merged result on `main` to be red.

---

## 2. Root cause

`changesets/action@v1` runs:

- `corepack yarn version-packages`

but does **not** currently refresh the lockfile afterward.

Because this repository uses published semver dependencies between workspaces for public packages (for example `react -> core` as `^x.y.z`), a version bump changes package manifests in a way that requires a lockfile update.

---

## 3. Delegation plan

### Engineer A — Staff Fullstack Engineer

**Scope**

- Fix the release PR generation flow so version bumps also produce a synchronized `yarn.lock`.
- Prefer the smallest correct fix in workflow/config rather than changing package architecture.
- Validate locally by reproducing the release-versioning path and confirming the lockfile is updated.
- Clean up local versioning artifacts before handing work back.

**Likely implementation direction**

- Update the `changesets/action` `version` command so it runs `corepack yarn version-packages` and then a non-frozen install (`vp install` or equivalent) before the action commits the release PR changes.

**Required checks**

- `vp install --frozen-lockfile`
- `vp check`
- `vp run -r test`
- `vp run -r build`
- `vp run -r pack`
- local reproduction of the release versioning path showing `yarn.lock` changes are included

**Completion criteria**

- Release PR generation includes the lockfile update.
- A merged release PR would leave `main` green under frozen-lockfile installs.
- No unnecessary API/package-boundary changes are introduced.

### Quality gate — Quality Reviewer

Review focus:

- correctness/minimality of the release workflow fix
- lockfile/versioning behavior
- no regressions to release PR generation or publish readiness

---

## 4. Execution order

1. Engineer A fixes release PR lockfile synchronization.
2. Quality reviewer validates the fix and applies any minimal follow-up.
3. Commit and push the release workflow fix.
