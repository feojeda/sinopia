# Review: operator

## Summary

- Verdict: approve_with_changes
- Top risk: Crash between resetConfirmation() steps 4 and 5 leaves a `ready_for_html + confirmed=false` state that the agent template has no explicit recovery path for, relying on the error-table catch-all instead.
- Confidence: high

## Findings

### OP-01: Crash between resetConfirmation() steps 4–5 creates template-unhandled state

- Severity: P2
- Category: state
- Status: valid
- File: `lib/plan-manager.js` (proposal section 4)
- Lines: 291–299
- Claim: The multi-file write in `resetConfirmation()` is not atomic. A process crash between step 4 (write `decisions.json`) and step 5 (write `plan.json`) leaves the plan in `ready_for_html` / `pending_approval` with `confirmed=false` in `decisions.json`.
- Evidence: The operation ordering (lines 291–298) writes two files sequentially under one lock. A crash is not a concurrency problem (the lock is gone with the process) but a durability problem. The recovery description (line 299) acknowledges this state and says "re-ejecutar procede desde paso 5". However, the agent template (section 6, line 358) only suggests `reset-confirmation` when `confirmed: true` and state is `ready_for_html`/`pending_approval`. With `confirmed: false`, the template has no matching branch — the agent would show a read-only summary and stall.
- Impact: An agent following the template literally would not know how to recover from this state. The user must manually run `reset-confirmation` or trigger an `answer()` (which fails with `GSDC_INVALID_STATE` → catch-all suggests `plan status` → indirect path to reset). The recovery exists but is unnecessarily indirect.
- Recommendation: Add a template branch for `readOnly: true && confirmed: false && status ∈ {ready_for_html, pending_approval}` that explicitly suggests `reset-confirmation` to recover from an interrupted reset. Alternatively, reorder steps so `plan.json` is written before `decisions.json`, making the post-crash state `questions_pending + confirmed=true` — which the template already handles (questions_pending + confirmed=true → readOnly, "confirmado, esperando transición" → agent suggests reset).
- Suggested test: Create fixture with `plan.json: {status: "ready_for_html"}` and `decisions.json: {confirmation: {confirmed: false}}`. Call `questions()` and verify the output allows the agent to suggest `reset-confirmation`. Then call `resetConfirmation()` and verify it completes the interrupted transition.
- Dedup key: reset-confirmation-crash-partial-state-no-template-guidance

### OP-02: resetConfirmation() step 6 failure leaves stale mockup.html after successful state transition

- Severity: P2
- Category: state
- Status: valid
- File: `lib/plan-manager.js` (proposal section 4)
- Lines: 296–299
- Claim: If the `mockup.html` rename (step 6) fails after steps 4 and 5 have succeeded, the plan transitions to `questions_pending` with `confirmed=false`, but `mockup.html` remains with its original name. The proposal's recovery text only covers crashes between steps 4–5 and 5–6, not a rename I/O failure after step 5.
- Evidence: Steps 4 and 5 write `decisions.json` and `plan.json` atomically. Step 6 renames `mockup.html` to `.stale.<timestamp>`. If the rename fails (permissions, disk full, cross-device rename), steps 4–5 are already committed. The state is `questions_pending` but `mockup.html` still exists. The idempotency check (line 287: `!mockupExists`) would NOT no-op on re-execution because the file still exists — so re-executing `resetConfirmation()` would retry the rename. However, if the rename fails for a persistent reason, the function throws and the plan is stuck: state is correct (`questions_pending`) but the stale artifact persists.
- Impact: A stale `mockup.html` could mislead the agent or user into thinking a mockup is ready. `submitMockup()` hash verification prevents submitting stale content (hash mismatch), so data integrity is preserved. But the agent might waste cycles trying to use or verify the old mockup before realizing it's stale.
- Recommendation: Make step 6 failure non-fatal: catch the rename error, log a warning, and include a `staleRenameFailed: true` flag in the return value. The function should still succeed since the critical state transition is complete. Document that the stale file should be cleaned up manually or on the next `resetConfirmation()` call.
- Suggested test: Mock `fs.renameSync` to throw `EACCES` after steps 4–5 succeed. Verify `resetConfirmation()` returns the new state with a `staleRenameFailed: true` indicator. Verify re-execution retries the rename.
- Dedup key: reset-confirmation-mockup-rename-failure-stale-artifact

### OP-03: Recovery description says "procede desde paso 5" but re-execution processes all steps

- Severity: P3
- Category: docs
- Status: valid
- File: `lib/plan-manager.js` (proposal section 4)
- Lines: 299
- Claim: The recovery text states "Re-ejecutar procede desde paso 5" suggesting steps 1–4 are skipped. In reality, re-execution starts from step 1 (acquire lock) and processes all steps. Steps 2–4 are idempotent so the outcome is correct, but the description could mislead an implementer into building skip logic that doesn't exist.
- Evidence: Line 299: "Si falla después de paso 4, estado es ready_for_html/pending_approval + confirmed=false → answer() falla con GSDC_INVALID_STATE (diagnósable). Re-ejecutar procede desde paso 5." The function signature is `resetConfirmation(planId)` — it has no memory of a previous partial execution. It always starts from lock acquisition.
- Impact: An implementer might add state-tracking logic (e.g., a recovery flag) trying to match the described behavior, introducing unnecessary complexity and potential bugs.
- Recommendation: Rephrase to "Re-ejecutar procesa todos los pasos; los pasos 2–4 son idempotentes y no producen cambios adicionales."
- Suggested test: Not applicable (documentation clarity).
- Dedup key: reset-confirmation-recovery-description-implies-skip

### OP-04: History dedup only matches last entry, creating near-duplicates on re-execution

- Severity: P3
- Category: state
- Status: valid
- File: `lib/plan-manager.js` (proposal section 4)
- Lines: 296
- Claim: The history dedup check (line 296) compares only the last entry's `from` state. After a crash between steps 5 and 6, re-execution starts from `questions_pending` (already written by step 5), so the new `from` is `questions_pending` while the original entry has `from: 'ready_for_html'`. The dedup check fails (different `from`) and a second `reset-confirmation` entry is added.
- Evidence: Line 296: "Si último entry ya tiene action: 'reset-confirmation' con mismo from → no duplicar." After crash-recovery: original entry `{action: 'reset-confirmation', from: 'ready_for_html', to: 'questions_pending'}`. Re-execution sees current state `questions_pending`, so new entry would be `{action: 'reset-confirmation', from: 'questions_pending', to: 'questions_pending'}`. Different `from` → no dedup.
- Impact: History accumulates a confusing `from: questions_pending, to: questions_pending` entry that looks like a no-op state transition. Functionally harmless but misleading for auditing.
- Recommendation: Extend dedup to also suppress entries where `from === to` and `action === 'reset-confirmation'` (self-transition is always idempotent). Alternatively, check if any recent entry (not just last) has `action: 'reset-confirmation'` regardless of `from`.
- Suggested test: Create fixture: `plan.json` with status `questions_pending` and history ending in `{action: 'reset-confirmation', from: 'ready_for_html', to: 'questions_pending'}`. Call `resetConfirmation()`. Verify no new history entry is added.
- Dedup key: reset-confirmation-history-dedup-near-duplicate-reexecution

### OP-05: Asymmetric empty-value handling between required choice and text fields in answer()

- Severity: P3
- Category: state
- Status: valid
- File: `lib/plan-manager.js` (proposal section 3)
- Lines: 249
- Claim: `answer()` returns `warning: "empty_value_for_required_choice"` when a required choice field receives an empty value, but silently accepts empty values for required text fields with no warning. Both cases result in the field remaining pending (`requiredFieldsComplete` stays false), but the feedback asymmetry could cause an agent implementer to assume empty text values are "accepted" while empty choice values are "problematic".
- Evidence: Line 249: "Si value es '' y campo es required: true → aceptar pero incluir warning: 'empty_value_for_required_choice' en la respuesta (no fallar)". This validation is inside the choice-field branch (line 248: "Si el campo es type: 'choice' en FIELD_REGISTRY"). Text fields have no equivalent branch.
- Impact: An agent that checks for warnings to decide whether to re-prompt would re-prompt for choice fields but not for text fields after an empty submission. In practice, a well-implemented agent checks `requiredFieldsComplete` after each `answer()`, so this is low risk. However, the inconsistency could lead to different UX behavior depending on field type.
- Recommendation: Either add a matching warning for empty required text fields (`"empty_value_for_required_text"`) or document that the choice warning exists specifically because agents might map numeric indices to empty values (a choice-specific failure mode).
- Suggested test: Call `answer(planId, 'audiencia', '')` where audiencia is a required text field. Verify the response includes no warning and `requiredPendingCount` is unchanged. Document this as expected behavior.
- Dedup key: answer-asymmetric-empty-warning-choice-vs-text

### OP-06: Lock timeout / orphaned lock after process crash not addressed

- Severity: P3
- Category: state
- Status: valid
- File: `lib/lock-manager.js` (implicit)
- Lines: 292, 254, 236
- Claim: All new functions acquire locks and release in `finally` blocks, but if the process crashes (SIGKILL, OOM) the lock file remains on disk. Subsequent operations would deadlock. The proposal doesn't address lock staleness detection.
- Evidence: Line 292: "Acquire lock" as step 1 of resetConfirmation(). Lines 254 and 236 specify the same for answer() and questions(). The repo context shows `lock-manager.js` exists but the proposal doesn't specify its staleness handling. This is a pre-existing concern, not introduced by this proposal.
- Impact: After a hard crash, all plan operations on that planId would hang indefinitely. This is a pre-existing risk amplified by adding three more lock-acquiring functions.
- Recommendation: Ensure `lock-manager.js` implements staleness detection (e.g., lock age > N seconds → force release) or uses PID-based lock validation. If already implemented, document it in the proposal for completeness.
- Suggested test: Kill process while lock is held. Verify next operation either acquires lock after timeout or force-releases the stale lock.
- Dedup key: lock-orphan-crash-deadlock-no-staleness-detection

## Non-Issues Checked

- **Hash migration v1→v2 atomicity**: `confirmDecisions()` always computes v2 hash over 7 fields and writes `hashAlgorithm: 'sha256-decisions-v2'` in the same atomic write. Hash and label always match. No risk of v1 hash with v2 label.
- **normalize function identity**: NORMALIZE_V1 and NORMALIZE_V2 are identical (NFC, case-sensitive). Legacy hash verification produces identical results. No breaking change to existing hashes.
- **ensureV2Fields() idempotency**: `optionalAnswered || {}` and `assets !== undefined ? assets : ""` are no-ops on v2 plans. Safe to call repeatedly.
- **ensureV2Fields() placement after state validation**: Correct ordering — state is checked before any in-memory mutation. No risk of modifying data for an invalid state.
- **Lock serialization**: All mutating operations (answer, resetConfirmation, confirmDecisions, resolveQuestions, submitMockup) acquire locks. Read operation (questions) also acquires lock. Concurrent access is serialized correctly.
- **Lock release in finally**: All three new functions specify `finally` for lock release. Exceptions cannot orphan the lock within a single process.
- **questions() never throws GSDC_INVALID_STATE**: Returns `readOnly: true` for all non-questions_pending states instead of throwing. This prevents the agent from entering an error recovery loop for legitimate states.
- **Idempotent no-op in resetConfirmation()**: Three-condition check (`questions_pending && confirmed !== true && !mockupExists`) correctly identifies the no-op case. `undefined` and `null` for confirmed both satisfy `!== true`, matching expected behavior for uninitialized v1 plans.
- **confirm→resolve window**: State `questions_pending + confirmed=true` is handled — questions() returns `readOnly: true, confirmed: true`, answer() returns `GSDC_DECISIONS_LOCKED`. Agent is guided to wait or reset.
- **Choice value validation completeness**: Numeric strings, literal "Otro (personalizado)", and invalid options are all rejected. Custom values accepted only when `allowCustom: true`. Comprehensive coverage.
- **resetConfirmation() does not clear required fields**: Only optional fields and confirmation metadata are cleared. Required field values persist, allowing targeted re-editing without re-entering all data. Correct by design.
- **Placeholder detection breaking change**: `includes()` → `===` is documented as a breaking change. The test suite (line 506) covers edge cases ("TODO: definir colores" → not placeholder, "TODO" → yes). Adequate.
- **optionalAnswered semantics**: Flag is set for all responses to optional fields (empty or not). `getEmptyFields()` correctly excludes flagged fields. After reset, flags are cleared, requiring re-answer. Consistent.
- **writeAtomicJson usage**: All decisions.json and plan.json writes use the existing atomic write mechanism. Individual file writes are atomic; the multi-file consistency issue is the only concern (covered in OP-01).

## Residual Risks

- **Lock manager behavior under crash**: The proposal doesn't document `lock-manager.js` staleness/timeout behavior. If the lock manager doesn't handle orphaned locks, adding three more lock-acquiring functions increases the surface area for deadlocks after hard crashes.
- **Stale `.stale.*` file accumulation**: Each `resetConfirmation()` with a mockup creates a new `.stale.<timestamp>` file. The proposal doesn't describe cleanup. Over many reset cycles, these could accumulate. Low severity but worth noting for operational hygiene.
- **Cross-device rename in step 6**: If the plan directory is on a filesystem where atomic rename isn't guaranteed (e.g., NFS, cross-mount), the mockup rename in step 6 could behave unexpectedly. This is a general Node.js filesystem concern, not specific to the proposal.
- **`answer()` state validation uses plan.json status exclusively**: If `plan.json` is somehow corrupted or contains an unexpected status string not in the known states, `answer()` would throw `GSDC_INVALID_STATE` with no guidance. The error table catch-all handles this, but the specific error message might not help diagnose the root cause.
