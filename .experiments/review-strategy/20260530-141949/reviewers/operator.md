# Review: operator

## Summary

- Verdict: approve_with_changes
- Top risk: `answer()` crashes on pre-existing v1.1 plans that lack `optionalAnswered` — no migration path specified
- Confidence: high

## Findings

### OP-01: `answer()` crashes on migrated plans missing `optionalAnswered`

- Severity: P1
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: N/A (new function `answer()`, target.md line 236–270)
- Claim: `answer()` unconditionally sets `decisions.optionalAnswered[field] = true` for optional fields with empty value, but pre-existing v1.1 plans have no `optionalAnswered` key in `decisions.json`.
- Evidence: Target section 3 (line 251) states: "Si `field` es un campo opcional y `value` es `""`, marca `optionalAnswered[field] = true`". Repo context (line 79) confirms v1.1 `decisions.json` has no `optionalAnswered` field. The proposal's `create()` (section 7, line 402) initializes it for new plans but provides no migration for existing plans. JavaScript `undefined[field] = true` throws `TypeError`.
- Impact: Any v1.1 plan still in `questions_pending` (created before upgrade, not yet confirmed) will crash on the first optional-field answer. The agent would see an unhandled exception instead of a structured error. This blocks the main flow for migrated plans.
- Recommendation: Add explicit instruction: `answer()` must guard with `decisions.optionalAnswered = decisions.optionalAnswered || {}` before any write. Alternatively, add a migration step in `readJsonOrThrow` or a dedicated `ensureV2Fields()` helper called on first read.
- Suggested test: Create a v1.1 fixture plan (no `optionalAnswered`, `hashAlgorithm: "sha256-decisions-v1"`, state `questions_pending`, all 6 required fields filled). Call `answer("id", "assets", "")` → expect success, `optionalAnswered.assets === true`, `optionalPendingCount === 0`.
- Dedup key: answer-optionalAnswered-migration-crash

### OP-02: No test for `optionalAnswered` migration on v1.1 fixture

- Severity: P2
- Category: testing
- Status: valid
- File: tests/plan.test.js
- Lines: target.md line 451–486
- Claim: The test list includes a hash migration v1 test (line 480) but no test exercises `answer()` or `questions()` against a v1.1 fixture lacking `optionalAnswered`.
- Evidence: Target line 480: "Test hash migración v1: fixture con `hashAlgorithm: "sha256-decisions-v1"` y 6-field hash → `resolve-questions` pasa, `submit-mockup` pasa." No corresponding test for `optionalAnswered` field migration.
- Impact: The crash described in OP-01 would not be caught by the specified test suite. An implementer following the test plan would believe all migration cases are covered.
- Recommendation: Add test: "Test optionalAnswered migration v1.1: v1.1 fixture without `optionalAnswered` → `plan answer --field assets --value ""` succeeds and sets `optionalAnswered.assets === true`; `plan questions` returns `optionalPendingCount === 0`."
- Suggested test: See recommendation — concrete fixture and assertions provided.
- Dedup key: test-optionalAnswered-v1-migration

### OP-03: `resetConfirmation()` non-atomic writes leave recoverable but confusing intermediate state

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md line 288–296
- Claim: Step 4 writes `plan.json` (state → `questions_pending`) before step 5 writes `decisions.json` (clears confirmation). A crash between these steps leaves `state === questions_pending` but `confirmed === true`, causing `answer()` to fail with `GSDC_DECISIONS_LOCKED` even though the state looks editable.
- Evidence: Target line 288–295 specifies write order: plan.json first (step 4), then decisions.json (step 5). Target line 270 confirms `answer()` rejects when `confirmed === true` with `GSDC_DECISIONS_LOCKED`. Target line 296 acknowledges the partial-failure scenario and says re-running `resetConfirmation()` recovers. But the error table (line 369) routes `GSDC_DECISIONS_LOCKED` to "ask user if they want to run reset-confirmation" — the agent does not auto-recover.
- Impact: After a crash, the agent sees `state: questions_pending` and tries `answer()` → gets `DECISIONS_LOCKED`. The agent must interpret this as "partial reset, re-run reset-confirmation" rather than "decisions were explicitly confirmed." The state is misleading and forces an indirect recovery path. No data loss, but a confused agent may report contradictory information to the user.
- Recommendation: Consider writing `decisions.json` before `plan.json` (step 5 before step 4). If step 4 fails after step 5 succeeds, the state is `ready_for_html` but `confirmed === false` — `answer()` fails with `GSDC_INVALID_STATE` which is less misleading (wrong state is clearly diagnosable). Alternatively, add a transient flag or document the recovery more prominently in the error table: "If state is `questions_pending` and `GSDC_DECISIONS_LOCKED` occurs, automatically re-run `reset-confirmation`."
- Suggested test: Test exists at target line 473: "Test reset-confirmation partial recovery." Verify that this test also asserts the intermediate state is recoverable by an `answer()` attempt followed by `reset-confirmation()`, not just by direct `resetConfirmation()` re-execution.
- Dedup key: reset-confirmation-non-atomic-plan-before-decisions

### OP-04: `questions()` returns `GSDC_INVALID_STATE` for `mockup:approved` instead of read-only snapshot

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md line 226–233
- Claim: `questions()` explicitly returns read-only snapshots only for `ready_for_html` and `pending_approval`. For `mockup:approved`, it falls through to "Estado no reconocido → `GSDC_INVALID_STATE` (exit 13)."
- Evidence: Target line 231: "Plan en `mockup:ready_for_html` o `mockup:pending_approval` → retorna snapshot read-only". Target line 232: "Estado no reconocido → `GSDC_INVALID_STATE` (exit 13)." Repo context line 19 confirms `mockup:approved` is a valid state. The function's accepted-state list does not include it.
- Impact: An agent inspecting an approved plan's decisions via `plan questions` gets an error suggesting the state is invalid, when it is a legitimate state where inspection (but not editing) should be allowed. This breaks the read-only inspection contract for a real state. Agents may misreport this as corruption or an inconsistent state.
- Recommendation: Add `mockup:approved` (and any later mockup-phase states) to the read-only return path. Alternatively, change the fallback from `GSDC_INVALID_STATE` to read-only for any state that is not `questions_pending` (since all non-pending states are inherently frozen).
- Suggested test: Create plan, advance to `mockup:approved`, call `plan questions --id <ID> --json` → expect `readOnly: true`, `filled` with all fields, `pending: []`, exit 0.
- Dedup key: questions-approved-state-invalid-error

### OP-05: Declining optional field preserves stale value — misleading filled display

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md line 251
- Claim: When a user declines an optional field via `answer()` with empty value, the proposal sets `optionalAnswered[field] = true` but explicitly does NOT clear the existing value ("sin cambiar el valor"). After `resetConfirmation()` + re-decline, the old value persists while `optionalAnswered` marks it as "answered."
- Evidence: Target line 251: "marca `optionalAnswered[field] = true` sin cambiar el valor." Target line 287: `resetConfirmation()` clears `optionalAnswered = {}` but preserves field values. Target line 96–108: `getEmptyFields` skips fields with `optionalAnswered[field] === true` — so the field appears in `filled` with the stale value.
- Impact: After reset, if the user previously had `assets: "Logo en PNG"` and now declines, the `questions()` response shows assets in `filled` with value "Logo en PNG." An agent presenting this to the user implies the logo is still selected. The semantic intent ("declined") is lost in the data. Not a state machine integrity issue, but a misleading representation.
- Recommendation: When declining an optional field (`value === ""`), also clear the field value: `decisions[field] = ""`. This makes the intent explicit in both `optionalAnswered` and the actual value. If preservation is desired, add a comment explaining why, and ensure `questions()` output for declined optional fields omits or flags the stale value.
- Suggested test: Create plan, fill assets with "Logo", confirm, reset, decline assets with `--value ""`. Call `questions()` → verify assets in `filled` has empty/null value or a "declined" marker, not "Logo."
- Dedup key: optional-decline-preserves-stale-value

## Non-Issues Checked

- **Lock scope for `questions()`**: Read-only operation acquires global lock before reading both `plan.json` and `decisions.json`. Lock released in `finally`. Consistent snapshot guaranteed. OK.
- **`answer()` operation ordering**: Lock → read → validate state → validate confirmation → atomic write → unlock. All mutations inside lock. OK.
- **`resetConfirmation()` idempotency condition**: The three-way check (`state === questions_pending && confirmed !== true && no mockup`) correctly identifies the only safe no-op case. All other combinations proceed with cleanup, including partial-failure recovery. OK.
- **`confirmDecisions()` → `resolve-questions` gap**: Two separate lock acquisitions mean a concurrent process could modify decisions between them. However, the hash comparison in `resolve-questions` detects this, and the error table routes to `reset-confirmation`. Acceptable tradeoff.
- **`computeDecisionsHash` determinism**: `Object.fromEntries` preserves field array order. `JSON.stringify` preserves insertion order. v1 and v2 field lists are explicitly ordered. Hashes are deterministic. OK.
- **`getEmptyFields` default parameter**: Function signature `optionalAnswered = {}` means passing `undefined` from `decisions.optionalAnswered` triggers the default. No crash for v1.1 plans in `questions()`. OK — but does NOT protect `answer()` which writes directly to the property (OP-01).
- **Placeholder exact-match fix**: Proposal correctly identifies `includes()` bug (repo context line 57–58) and fixes it with `===` (target line 105). `"Nodo"` no longer matches `"TODO"`. Test specified at target line 486. OK.
- **`writeAtomicJson` crash safety**: Atomic writes via temp-file + rename means no partial JSON on disk after crash. OK.
- **Error code collision check**: New codes 22–25 do not collide with existing 13, 15, 19–21. Names `GSDC_PLAN_ARTIFACT_MISSING` (25) vs `GSDC_ARTIFACT_MISSING` (20) are distinct. OK.

## Residual Risks

- **Lock staleness after crash**: If the process crashes while holding the file-based lock, the lock file remains on disk. The proposal does not discuss lock timeout or stale-lock cleanup. This is a pre-existing risk with `lock-manager.js`, not introduced by this proposal, but becomes more relevant given the multi-step `resetConfirmation()` operation. The lock manager's existing behavior (unknown from the proposal) determines recovery difficulty.
- **No concurrency testing**: Target line 559 notes "Tests de lock: verificar release, no concurrencia real." This is acceptable given the lock manager guarantees serialization, but real-world file-system locking on network mounts (NFS, etc.) may not provide the same guarantees.
- **`answer()` for non-empty optional values does not set `optionalAnswered`**: The proposal only specifies setting `optionalAnswered` for the empty-value decline case. Answering `assets` with actual content sets the value but not the flag. Currently harmless because `getEmptyFields` checks value emptiness as a fallback, but if `optionalAnswered` semantics are extended later (e.g., "was this field explicitly answered vs. pre-populated"), the absence of the flag for non-empty answers will be a gap.
