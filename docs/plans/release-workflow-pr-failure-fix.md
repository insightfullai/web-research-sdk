# Release Workflow PR Failure Fix Plan

| Metadata       | Details                                                                                     |
| :------------- | :------------------------------------------------------------------------------------------ |
| **Owner**      | Engineering Manager Orchestration                                                           |
| **Status**     | Reviewed                                                                                    |
| **Created**    | 2026-03-30                                                                                  |
| **References** | GitHub Actions run `23749253130`, `.github/workflows/release.yml`, `.changeset/config.json` |

---

## 1. Context

The `Release` workflow now passes install/build/pack validation, but still fails in the final step:

- Workflow run: `23749253130`
- Failing step: `Create release PR or publish`

Observed error from `changesets/action@v1`:

```text
Error: ENOENT: no such file or directory, open '/home/runner/work/web-research-sdk/web-research-sdk/packages/core/CHANGELOG.md'
```

This occurs after `corepack yarn version-packages` succeeds, so the issue is specifically in the Changesets action's release-PR / GitHub-release handling, not in install/build/test/pack.

---

## 2. Verified root cause

`changesets/action@v1` creates GitHub releases by reading each published package's generated `CHANGELOG.md`. The workflow leaves `createGithubReleases` at its default `true`, but `.changeset/config.json` had `"changelog": false`, so `changeset version` updated package versions without creating the package changelog files that the action later reads.

This is why the workflow failed in `Create release PR or publish` with:

```text
ENOENT: no such file or directory, open '.../packages/core/CHANGELOG.md'
```

## 3. Chosen fix

Enable package changelog generation in `.changeset/config.json`:

```json
"changelog": "@changesets/changelog-git"
```

Why this is the minimal correct fix:

1. It preserves the current workflow behavior, including GitHub release creation.
2. It fixes the missing-file condition at the source by making `changeset version` produce the changelog files the action expects.
3. It avoids changing publish semantics by disabling `createGithubReleases`.

Local validation should run `corepack yarn version-packages` from a clean tree, confirm that package `CHANGELOG.md` files are generated, and then revert those generated release artifacts before finishing review.

---

## 4. Delegation plan

### Engineer A — Staff Fullstack Engineer

**Scope**

- Investigate the `changesets/action` failure path and determine the minimal correct fix.
- Implement the fix in workflow/config/docs as needed.
- Validate locally beyond basic CI by reproducing the versioning path and, if feasible, the release-PR prerequisites.
- Clean up any local reproduction artifacts before reporting back.

**Required checks**

- `vp check`
- `vp run -r test`
- `vp run -r build`
- `vp run -r pack`
- `corepack yarn version-packages` (with cleanup/revert after validation if needed)
- any additional local command that directly validates the chosen release fix

**Completion criteria**

- The `Create release PR or publish` failure cause is addressed.
- The chosen fix is minimal and explained.
- No unintended package/API changes are introduced.

### Quality gate — Quality Reviewer

Review focus:

- Changesets/release workflow correctness
- minimality of the fix
- docs/config accuracy
- no accidental regression to publish readiness

---

## 5. Execution order

1. Engineer A investigates and fixes the release step failure.
2. Quality reviewer validates the release fix and applies any minimal follow-up.
3. Commit and push the release-workflow fix.
