# Review: operator

## Summary

- Verdict: approve
- Top risk: Unhandled file system errors during stale mockup renaming in `resetConfirmation` could crash the reset operation if exceptions are not caught properly.
- Confidence: high

## Findings

### P2-001: Graceful error handling for stale mockup renaming in resetConfirmation

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 295-308
- Claim: The proposal states that if `mockup.html` renaming fails, the system should report `staleRenameFailed: true` rather than failing.
- Evidence: "Si existe `mockup.html`, renombrar a `mockup.html.stale.<timestamp>` o reportar `staleRenameFailed: true` si no se pudo."
- Impact: If the `fs.renameSync` or similar filesystem call throws an unhandled error (due to permissions, open file handles, or anti-virus locks), the entire `resetConfirmation` transaction will abort, leaving the plan in a locked state where confirmation cannot be reset.
- Recommendation: The filesystem rename operation inside `resetConfirmation` must be wrapped in a `try-catch` block. If it fails, log the warning, set `staleRenameFailed = true` in the returned payload, and proceed with the state transition and decisions reset.
- Suggested test: Force a file permission restriction or simulate a rename failure, trigger `reset-confirmation`, and verify that the confirmation is successfully cleared and `staleRenameFailed: true` is returned.
- Dedup key: reset-confirmation-rename-try-catch

### P3-001: Lock release coverage in read-only questions() API

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 208-261
- Claim: The `questions()` API does not write files but must release locks in all error cases.
- Evidence: "questions() no debe lanzar GSDC_INVALID_STATE; devuelve diagnostico read-only... Libera lock en errores."
- Impact: If `questions()` acquires a lock but an error occurs (such as JSON corruption in decisions), failing to release the lock will freeze all subsequent write operations in the workspace.
- Recommendation: Ensure that `questions()` uses the exact same `try-finally` lock release pattern as all other plan manager APIs, even if it only performs read operations.
- Suggested test: Cause a JSON parsing error inside `decisions.json` and call `plan questions`. Verify that the lock is still properly released.
- Dedup key: questions-lock-release-finally

## Non-Issues Checked

- Re-confirmation guard correctly handles changes and returns `GSDC_DECISIONS_LOCKED` (exit 23) if values change post-confirmation, preventing race conditions.
- Idempotency in `resetConfirmation` and crash recovery patterns are solid.

## Residual Risks

- None.
