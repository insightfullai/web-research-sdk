# Release PR Permission Remediation Plan

| Metadata | Details |
| :-- | :-- |
| **Owner** | Engineering Manager Orchestration |
| **Status** | In Progress |
| **Created** | 2026-03-30 |
| **References** | Release run `23749941989`, repository Actions workflow permissions API |

---

## 1. Context

The `Release` workflow now passes install, test, build, pack, and Changesets versioning, but still fails when `changesets/action@v1` tries to create the release PR.

Evidence from GitHub Actions:

```text
GitHub Actions is not permitted to create or approve pull requests.
```

Evidence from the repository settings API:

```json
{
  "default_workflow_permissions": "read",
  "can_approve_pull_request_reviews": false
}
```

The workflow already requests explicit `contents: write` and `pull-requests: write`, so the remaining blocker appears to be the repository-level Actions setting that controls whether GitHub Actions may create or approve pull requests.

---

## 2. Root cause

This failure is now a **repository settings** problem, not a code/package/workflow-logic problem.

- Workflow logic is reaching PR creation successfully.
- Git push to `changeset-release/main` succeeds.
- GitHub rejects PR creation because repository Actions permissions do not allow it.

---

## 3. Delegation plan

### Engineer A — Staff Fullstack Engineer

**Scope**

- Verify the repository-level Actions permissions diagnosis.
- Determine the smallest correct remediation:
  1. enable the repository setting that allows GitHub Actions to create/approve pull requests, or
  2. if that is not possible, propose the smallest safe workflow fallback.
- If repository settings can be updated with available credentials, do so and validate.
- Keep code changes minimal or zero if repo settings alone solve the issue.

**Required validation**

- Confirm current workflow permissions API state.
- Apply repository setting remediation if permitted.
- Trigger or observe a follow-up release workflow run to confirm the release PR step can proceed.

**Completion criteria**

- Root cause is confirmed.
- Repository is configured so the release workflow can create its PR, or a clearly justified fallback is prepared.

### Quality gate — Quality Reviewer

Review focus:

- correctness of diagnosis
- minimality of remediation
- ensuring no unnecessary workflow or package changes are introduced

---

## 4. Execution order

1. Engineer A verifies repo-level Actions permission diagnosis.
2. Engineer A applies the repository setting fix if possible.
3. Quality reviewer validates no extra code changes are needed.
4. Report back with confirmation and any remaining manual follow-up.
