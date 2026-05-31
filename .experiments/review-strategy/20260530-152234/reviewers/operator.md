# Review: operator

## Summary

- Verdict: approve_with_changes
- Top risk: questions() confirmed=true response masks pending=[] without specifying behavior of counters/filled, creating an ambiguous CLI contract that can mislead implementers.
- Confidence: high

## Findings

### OP-01: questions() response shape undefined for confirmed=true intermediate state

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `questions()`)
- Lines: 232, 585
- Claim: When `confirmed === true` and state is `questions_pending`, `questions()` returns `pending: []` but does not specify what values `requiredPendingCount`, `optionalPendingCount`, `filledCount`, `filled`, `requiredFieldsComplete`, and `allQuestionsAnswered` should hold.
- Evidence: Target lines 231-232 define the confirmed=true case only as `readOnly: true, confirmed: true, pending: []`. The JSON example (lines 129-224) shows all these fields populated for the normal case. Line 585 notes that `pending` is masked "independently of actual field state" but no other field is mentioned. The test at line 487 only asserts `pending.length === 0 AND confirmed === true AND readOnly === true` — counters are untested for this state.
- Impact: An implementer must decide whether to also mask the counters (making the response lie about completeness) or leave them accurate (creating an internally contradictory response where `pending=[]` but `requiredPendingCount > 0`). Either choice affects consumers. The template at line 360 checks `confirmed` before `pending`, but any consumer that only checks `pending.length` or `requiredFieldsComplete` would be misled.
- Recommendation: Explicitly define the full response shape for the confirmed=true intermediate state. If all fields are masked (consistent with "confirmed, awaiting transition"), state that `requiredPendingCount: 0, optionalPendingCount: 0, requiredFieldsComplete: true, allQuestionsAnswered: true, filled: <all fields>, filledCount: <totalFields>`. If counters reflect truth, state that `pending` is the only masked field and consumers must always check `confirmed` before interpreting any counter.
- Suggested test: `questions()` with fixture where `confirmed=true`, state=`questions_pending`, and only 5/6 required fields filled — assert exact values of `requiredPendingCount`, `optionalPendingCount`, `requiredFieldsComplete`, `allQuestionsAnswered`, `filled.length`, and `filledCount`.
- Dedup key: questions-confirmed-response-shape-ambiguous

### OP-02: confirm→resolve two-step gap lacks explicit recovery path in template

- Severity: P2
- Category: state
- Status: valid
- File: templates/commands/canva-mockup.md (proposed section 2)
- Lines: 406-409
- Claim: The template shows `confirm-decisions` followed by `resolve-questions` as sequential steps after "confirmo", but does not document what the agent should do if `confirm-decisions` succeeds and `resolve-questions` fails.
- Evidence: Target lines 406-409 show only the happy path. The error table (lines 386-397) covers individual error codes but no combined scenario. After confirm succeeds, the plan is in `confirmed=true, state=questions_pending` — the intermediate state where `answer()` is blocked (exit 23) and `questions()` returns readOnly. Recovery options are: retry resolve, or reset-confirmation. Neither is explicitly recommended for this specific failure sequence.
- Impact: An agent implementing the template would fall through to the generic "Cualquier otro código → Detener flujo" row, potentially abandoning a plan that is in a fully recoverable intermediate state. The user said "confirmo" but nothing happened, and the agent doesn't know to retry or reset.
- Recommendation: Add an explicit error-handling row or note after the confirm→resolve sequence: "If `confirm-decisions` succeeds but `resolve-questions` fails, retry `resolve-questions` once. If still fails, run `reset-confirmation` and inform the user that confirmation was reset and they should try again."
- Suggested test: Integration test: confirm succeeds → resolve throws transient error → agent retries resolve → success. Also: confirm succeeds → resolve throws persistent error → agent calls reset-confirmation → state is `questions_pending`, `confirmed=false`.
- Dedup key: confirm-resolve-gap-recovery-missing

### OP-03: No lock timeout or stale lock cleanup mechanism documented

- Severity: P3
- Category: state
- Status: valid
- File: lib/lock-manager.js, lib/plan-manager.js
- Lines: 238, 256, 294
- Claim: The proposal requires lock acquisition for `questions()`, `answer()`, and `resetConfirmation()` but does not specify lock timeout, staleness detection, or cleanup behavior if the locking process crashes.
- Evidence: Target lines 238 ("Lock: questions() adquiere lock antes de leer, libera en finally"), 256 ("acquire lock... release lock en finally"), 294 ("Acquire lock... Release lock en finally"). No mention of lock TTL or crash recovery. Repo context (line 7) confirms `lock-manager.js` exists but no details on stale lock handling are provided.
- Impact: If a process crashes (SIGKILL, OOM) while holding the lock file, all subsequent operations on that plan are blocked indefinitely. The recovery documented at line 301 ("Re-ejecutar procede desde paso 5") assumes the lock can be re-acquired, which is false if a stale lock file remains.
- Recommendation: Document the lock manager's staleness policy (e.g., lock files older than N seconds are considered stale and forcibly removed). If lock-manager.js already implements this, reference it in the proposal. If not, add it as a pre-condition or concurrent work item.
- Suggested test: Acquire lock, simulate crash (no finally), then call `answer()` — should succeed within reasonable time, not hang.
- Dedup key: lock-stale-cleanup-undocumented

### OP-04: resetConfirmation recovery after step 4 crash depends on stale lock cleanup

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `resetConfirmation()`)
- Lines: 293-301
- Claim: The documented recovery path for `resetConfirmation()` after a crash between steps 4 and 5 ("Re-ejecutar procede desde paso 5") assumes the lock is not held, but does not account for a crash that leaves a stale lock file.
- Evidence: Target line 301: "Si falla después de paso 4... Re-ejecutar procede desde paso 5." Step 7 is "Release lock en finally". A crash between steps 4 and 5 means `finally` never runs → lock file remains. Re-execution at step 1 (acquire lock) would block or fail.
- Impact: This is a compound failure: the plan is in an inconsistent state (decisions.json says confirmed=false but plan.json says ready_for_html) AND the lock is held. Without stale lock cleanup, the plan is unrecoverable without manual intervention (deleting the lock file).
- Recommendation: This finding is downstream of OP-03. If the lock manager implements stale lock cleanup with a reasonable TTL, this recovery path works as documented. If not, the recovery is incomplete. At minimum, document that manual lock file deletion may be required as a fallback.
- Suggested test: Simulate crash during resetConfirmation between steps 4 and 5 (lock file left behind) → verify that a subsequent call to resetConfirmation either auto-recovers (stale lock cleanup) or provides a clear error indicating manual lock cleanup is needed.
- Dedup key: reset-confirmation-crash-lock-orphan

### OP-05: answer() does not guard against field being set for already-pending optional via direct answer after optional was cleared

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `answer()`)
- Lines: 258, 123
- Claim: After `resetConfirmation()` clears `optionalAnswered` to `{}`, an optional field's value is reset to `""` but `optionalAnswered` is also cleared. If the user then calls `answer(assets, "Logo PNG")`, `optionalAnswered.assets` is set to `true` and the value is updated. However, if the user calls `answer(assets, "")` again (declining assets), `optionalAnswered.assets` is also set to `true`, hiding it from pending. This is correct behavior, but the semantic of `optionalAnswered` conflates "user explicitly answered" with "field should not show as pending" — there is no way to distinguish "never asked" from "asked and declined" in the data model.
- Evidence: Target line 123: "optionalAnswered[field] = true para toda respuesta a campo opcional (vacío o no)." Line 258: "optionalAnswered[field] = true solo cuando OPTIONAL_FIELDS.includes(field)." After reset, optionalAnswered is `{}`. An answer of `""` sets the flag to `true`. The field disappears from pending, and the template (line 373) won't re-ask because `optionalPendingCount` is 0.
- Impact: Low. The behavior is logically consistent — the user was asked and declined. But there's no audit trail distinguishing "never asked" from "asked and declined." If a future feature needs to re-ask declined optionals, the current data model doesn't support it without resetting all optionals.
- Recommendation: No change required for this proposal. Document the semantic: `optionalAnswered[field]=true` means "the user was presented this question and provided an answer (including empty)", not "the field has a meaningful value."
- Suggested test: After reset, call `answer(assets, "")` → verify `optionalAnswered.assets === true` and `optionalPendingCount === 0`. Then call `questions()` → verify assets is not in pending.
- Dedup key: optional-answered-semantic-conflation

### OP-06: resetConfirmation step 5 history dedup only checks last entry

- Severity: P3
- Category: state
- Status: uncertain
- File: lib/plan-manager.js (proposed `resetConfirmation()`)
- Lines: 298
- Claim: The history dedup logic ("Si último entry ya tiene action: 'reset-confirmation' con mismo from → no duplicar") only checks the last history entry. If a different action occurs between two reset-confirmation calls from the same state, the second reset would create a duplicate reset-confirmation entry.
- Evidence: Target line 298: "Si último entry ya tiene action: 'reset-confirmation' con mismo from → no duplicar." This is a last-entry check only. If history is `[..., {action:'reset-confirmation', from:'ready_for_html'}, {action:'submit-mockup', from:'pending_approval'}, {action:'reset-confirmation', from:'ready_for_html'}]`, the second reset from ready_for_html is NOT deduped because the last entry is submit-mockup.
- Impact: Minor. History accumulates a duplicate reset-confirmation entry. This is cosmetic — it doesn't affect state or correctness. But it could confuse diagnostic tools that analyze history patterns.
- Recommendation: Either document that dedup is best-effort (last-entry only) and duplicates are possible, or check the last reset-confirmation entry specifically (scan backwards for matching action+from) rather than only the last entry.
- Suggested test: Call reset from ready_for_html → submit (fails, no state change since questions_pending) → reset from questions_pending → verify history has two reset-confirmation entries (not deduped). This confirms the behavior is understood.
- Dedup key: reset-history-dedup-last-entry-only

## Non-Issues Checked

- **State machine completeness**: The state transitions (questions_pending ↔ ready_for_html → pending_approval → approved) with resetConfirmation reverting to questions_pending are well-defined. Approved is correctly terminal for reset.
- **confirmDecisions intermediate state**: After confirm but before resolve, confirmed=true + state=questions_pending. This is handled: answer() blocks (exit 23), questions() returns readOnly, resetConfirmation can undo. Sound.
- **Hash migration v1→v2**: NORMALIZE_V1 and NORMALIZE_V2 are identical (NFC, case-sensitive). The only difference is field count (6 vs 7). For v1 plans where assets is undefined, normalize(undefined) === normalize("") === "", so confirmDecisions computing v2 hash on migrated data is consistent.
- **ensureV2Fields() persistence**: Correctly not persisted in read-only functions (questions, status), persisted in first mutation. This avoids unnecessary writes while ensuring migration on next edit.
- **answer() choice validation order**: Rejects numeric indices (exit 26), rejects "Otro (personalizado)" literal (exit 26), accepts matching options, accepts custom with allowCustom, rejects without allowCustom. Comprehensive and ordered correctly.
- **answer() empty value for required choice**: Accepted with warning, not error. requiredFieldsComplete stays false. Agent re-asks. Correct soft-failure design.
- **optionalAnswered flag scoping**: Only set for OPTIONAL_FIELDS, never for required fields. Prevents accidental hiding of empty required fields. Correct.
- **writeAtomicJson atomicity**: answer() uses atomic writes, so no partial-write risk for individual calls.
- **resetConfirmation preserves required fields**: Only optional values are cleared. Required fields keep their values. This is intentional and correct — the user only needs to re-answer optionals and re-confirm.
- **Idempotency of resetConfirmation**: No-op when state is questions_pending + confirmed=false + no mockup. History dedup for consecutive calls. Re-executable for partial failures. Well-designed.
- **Lock release in finally blocks**: questions(), answer(), resetConfirmation() all release locks in finally. Prevents lock leaks on exceptions.
- **Placeholder detection strictness**: `===` exact match for named placeholders and substring for bracket-wrapped. "TODO: definir colores" no longer matches. This is documented as a breaking change (line 42) and intentional.
- **"confirmo" parsing**: Word-boundary regex with negation check for "no confirmo". Rejects "confirmar". Accepts "sí, confirmo" and "confirmo gracias". Sound UX contract.

## Residual Risks

- **Lock manager behavior unverified**: The proposal depends on lock-manager.js for correctness under concurrent access. Without reviewing its implementation, staleness handling and deadlock prevention cannot be fully verified. OP-03 tracks this.
- **confirm→resolve under concurrent CLI calls**: If two agents call confirm-decisions on the same plan concurrently, both could succeed (depending on lock granularity), but only one resolve would be valid. The lock per-plan should prevent this, but cross-plan or cross-process scenarios are untested.
- **resetConfirmation staleRenameFailed=true deferred to manual cleanup**: If mockup rename fails, the old mockup.html remains. While the plan state is reset to questions_pending (blocking submit), a future mockup creation would overwrite it. But if the stale file is large or the filesystem is low on space, this could cause issues. Low probability.
- **ensureV2Fields() called in 7 functions**: The proposal mandates calling it in every function that reads decisions.json. If a future function is added and the developer misses this convention, v1 plans could behave incorrectly. This is a maintenance risk, not a current bug.
