# Review: operator

## Summary

- Verdict: approve_with_changes
- Top risk: Exit code name collision (`GSDC_ARTIFACT_MISSING` maps to both exit 20 and exit 25), creating ambiguity for error handlers and the error recovery table in canva-mockup.md.
- Confidence: high

## Findings

### OP-01: GSDC_ARTIFACT_MISSING exit code collision (20 vs 25)

- Severity: P2
- Category: state
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 40, 426
- Claim: The proposal introduces exit code 25 with error name `GSDC_ARTIFACT_MISSING` for missing artifacts within a plan, but the existing `submitMockup()` already uses the same error name with exit code 20.
- Evidence: Current code at `lib/plan-manager.js:389-392` throws `GSDC_ARTIFACT_MISSING` with `exitCode: 20` for missing mockup.html. Proposal section "readJsonOrThrow" (line 40) defines `GSDC_ARTIFACT_MISSING` with exit 25. The error table (line 426) only lists exit 25. The proposal does not address whether submitMockup's exit 20 should be changed, renamed, or unified.
- Impact: An agent or error handler checking `err.code === 'GSDC_ARTIFACT_MISSING'` cannot distinguish between "mockup.html missing during submit" (exit 20) and "decisions.json missing during questions/answer" (exit 25) by code name alone. The canva-mockup.md error table (lines 296-302) references exit 25, but agents calling submit-mockup would see the same name with exit 20, causing confusion about which recovery path to follow.
- Recommendation: Either (a) rename the new error to `GSDC_PLAN_ARTIFACT_MISSING` for exit 25 to disambiguate, or (b) unify submitMockup's mockup.html check to also use exit 25, or (c) explicitly document the distinction and update both the error table and the canva-mockup.md recovery table to cover both exit codes with the same name.
- Suggested test: Verify that `submitMockup()` with missing mockup.html and `questions()` with missing decisions.json produce distinguishable error codes (either different names or same exit code).
- Dedup key: artifact-missing-exit-code-collision

### OP-02: resetConfirmation partial-failure recovery ambiguous for implementer

- Severity: P2
- Category: state
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 217-229
- Claim: The idempotency rule ("questions_pending without prior confirmation → no-op") and the partial failure recovery rule ("re-execute completes cleanup") are potentially contradictory when state is already `questions_pending` but `confirmation.confirmed === true`.
- Evidence: Line 229 states re-executing `resetConfirmation` after a crash at step 4 "completa la limpieza sin efecto adverso." But line 217 states "Si el estado es `questions_pending` y no hay confirmación previa → no-op." If the crash occurs after writing plan.json (step 4) but before clearing decisions.json (step 5), the state IS `questions_pending` and there IS a prior confirmation (`confirmed === true`). The implementer must interpret "no hay confirmación previa" as a compound condition on BOTH state AND confirmed status — not just state. The spec does not make this compound condition explicit.
- Impact: An implementer may write the idempotency check as `if (state === 'questions_pending') return noOp()` without checking `confirmed`, causing the cleanup of decisions.json (step 5) to be skipped on re-execution. The plan would remain in an inconsistent state: state says editable, but answer() would reject writes because confirmed is still true.
- Recommendation: Make the idempotency condition explicit with pseudocode: `if (state === 'questions_pending' && confirmed !== true) → no-op; else if (state === 'questions_pending' && confirmed === true) → proceed with steps 5-6 only`. Add a note that the "no-op" guard is `state + !confirmed`, not `state` alone.
- Suggested test: Create a plan, confirm it, manually set state to `questions_pending` while leaving `confirmed === true` in decisions.json, then run `resetConfirmation` → verify it clears confirmation (not a no-op).
- Dedup key: reset-confirmation-partial-failure-idempotency-ambiguity

### OP-03: resetConfirmation does not clear optionalAnswered

- Severity: P2
- Category: state
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 220, 227
- Claim: `resetConfirmation()` clears `confirmed`, `confirmedAt`, `decisionsHash`, and `hashAlgorithm`, but does not clear `optionalAnswered`. After reset, previously declined optional fields (assets) remain marked as answered.
- Evidence: Line 220 specifies: "Pone confirmation.confirmed = false, confirmation.confirmedAt = null, confirmation.decisionsHash = """. Line 227 lists steps 4-7 — no step clears optionalAnswered. The `getEmptyFields()` helper (line 50) excludes fields where `optionalAnswered[field] === true` from pending lists. So after reset, `questions()` would report `optionalPendingCount: 0` for assets if it was previously declined, hiding it from the interactive flow.
- Impact: A user who resets to "edit everything" will not be re-prompted about assets in the interactive flow. The assets question effectively disappears. The user can still manually call `plan answer`, but the guided flow silently skips it — contradicting the reset's purpose of enabling full re-editing.
- Recommendation: Add step 5.5 or modify step 5 to also reset `optionalAnswered` to `{}`. This ensures all optional fields reappear as pending after a reset, giving the user a clean slate. If intentional preservation of optionalAnswered is desired, document it explicitly as a design decision.
- Suggested test: Fill all fields, decline assets (`optionalAnswered.assets = true`), confirm, reset, call `questions()` → verify `optionalPendingCount === 1` (assets reappears as pending).
- Dedup key: reset-confirmation-optional-answer-not-cleared

### OP-04: questions() rejects valid read in ready_for_html state

- Severity: P3
- Category: ux
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 166-168
- Claim: `questions()` throws `GSDC_INVALID_STATE` if the plan is not in `mockup:questions_pending`. This prevents an agent from reading question status after `resolve-questions` succeeds (state: `ready_for_html`), even as a read-only query.
- Evidence: Line 168: "Plan no está en mockup:questions_pending → ERROR GSDC_INVALID_STATE (exit 13). Un agente no debe interpretar 'sin preguntas' como permiso para avanzar." The proposal's error recovery table (line 298) for GSDC_INVALID_STATE says "ejecutar plan status y explicar al usuario el estado actual" — but `plan status` doesn't show question-level detail.
- Impact: Minor UX issue. An agent trying to display current decisions with their question context after confirmation gets an opaque error instead of useful data. The stated rationale (prevent misinterpretation) applies to writes, not reads. The agent must fall back to reading decisions.json directly, bypassing the structured API.
- Recommendation: Consider allowing `questions()` in `ready_for_html` and `pending_approval` states as read-only (returning current field values without pending questions), or document that agents should use `plan status --json` + direct decisions.json reading for post-confirmation queries.
- Suggested test: N/A — design suggestion.
- Dedup key: questions-state-gate-read-only

### OP-05: create() initializes hashAlgorithm as v1 in v1.2 code

- Severity: P3
- Category: docs
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 329-342
- Claim: Section 7 specifies new fields (`assets`, `optionalAnswered`) for `create()` but does not mention updating `hashAlgorithm` from `sha256-decisions-v1` to `sha256-decisions-v2`.
- Evidence: Current `lib/plan-manager.js:112` sets `hashAlgorithm: "sha256-decisions-v1"`. The proposal section 7 (line 330-342) shows the decisions.json structure without `confirmation` block — it only shows the data fields. Section 8 (line 363) says "confirmDecisions() siempre escribe hashAlgorithm: sha256-decisions-v2". But `create()` is not updated to use v2.
- Impact: Low risk — new plans get v1 on creation but v2 on first confirmation. Since the hash is empty initially and v1 is never used for validation of empty hashes, this is functionally harmless. However, it's inconsistent: a v1.2 installation creates plans with a stale algorithm marker. An implementer might wonder if create() should also use v2.
- Recommendation: Either explicitly update `create()` to write `hashAlgorithm: "sha256-decisions-v2"`, or add a note in section 7 stating that create() intentionally keeps v1 because it's overwritten on first confirm and the initial hash is empty.
- Suggested test: N/A — clarity/documentation issue.
- Dedup key: create-hash-algorithm-v1-stale

### OP-06: No concurrency test specified for questions() lock consistency

- Severity: P3
- Category: testing
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 405
- Claim: The proposal mentions a "Test questions lock consistente" (line 405) but does not specify how to test it given the global lock serializes all operations.
- Evidence: Line 405: "Test questions lock consistente: verificar que questions() retorna snapshot consistente bajo escritura concurrente (no contadores mezclados)." But the global lock (`lock-manager.js`) uses a single `.gsd-canva/.lock` file with polling-based contention (100ms intervals). Since all operations acquire the same lock, true concurrent execution within a single process isn't possible — the lock ensures serialization. Testing lock consistency requires two separate processes or a way to interleave operations within the lock acquisition window.
- Impact: The test as described is vague and hard to implement deterministically. An implementer might skip it or write a flaky test that passes by accident due to lock serialization.
- Recommendation: Either (a) specify that the test should spawn a child process that holds the lock while questions() is called (verifying lock timeout behavior), or (b) acknowledge that the global lock guarantees consistency by construction and downgrade this to a verification that questions() acquires the lock before reading (unit test with mocked lock).
- Suggested test: Mock `lockManager.acquire` to verify questions() calls it before reading files; separately, test that concurrent answer() + questions() from two processes returns consistent data (integration test with child_process).
- Dedup key: questions-lock-consistency-test-vague

### OP-07: answer() does not update plan.json timestamps or history

- Severity: P3
- Category: state
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 173-204
- Claim: `answer()` writes to `decisions.json` but the proposal does not specify updating `plan.json` timestamps or history, unlike all other mutating operations in the codebase.
- Evidence: Current mutating operations (`confirmDecisions` line 225, `resolveQuestions` line 325, `submitMockup` line 405, `transitionState` line 520) all update `plan.json` timestamps and push to history. The proposal's answer() specification (lines 183-198) only mentions writing `decisions.json`. Since answer() holds the lock and reads `plan.json` for state validation, it could also update timestamps.
- Impact: Low operational risk. After answering questions, `plan.json` timestamps won't reflect the latest change, and history won't record individual answers. This makes auditing harder — you can't tell from `plan.json` when the last answer was given, only when the plan was created/confirmed/resolved.
- Recommendation: Either (a) update `plan.json.updated` timestamp on each answer (without pushing history entries, to avoid bloating), or (b) explicitly document that answer() intentionally does not update plan.json for performance/simplicity, and that the audit trail is in decisions.json field values.
- Suggested test: N/A — design choice.
- Dedup key: answer-no-plan-json-timestamp-update

## Non-Issues Checked

- **Lock ordering in answer()**: Proposal correctly specifies acquire → read → validate state → validate confirmed → write → release in finally. Consistent with existing patterns in confirmDecisions, resolveQuestions.
- **Idempotency of questions()**: Read-only under lock, naturally idempotent. No issue.
- **Hash migration v1→v2 backwards compatibility**: The conditional hash computation based on `hashAlgorithm` field correctly handles existing v1 plans. `resetConfirmation()` clears `hashAlgorithm` so re-confirmation uses v2. Migration path is sound.
- **Atomic writes via writeAtomicJson**: All writes use the existing `.tmp` + rename pattern. Proposal doesn't change this. Consistent.
- **getEmptyFields() shared helper**: Deduplicates placeholder logic across confirmDecisions, resolveQuestions, and questions. The fieldList parameter correctly scopes required vs optional fields. optionalAnswered parameter correctly excludes declined optionals. Design is sound.
- **confirmDecisions still validates only 6 required fields**: The proposal correctly preserves that confirm-decisions only requires the 6 mandatory fields, not assets. requiredFieldsComplete aligns with this.
- **submitMockup hash validation after reset**: After reset + re-confirm + re-resolve, the hash is recalculated fresh with v2 including assets. submitMockup's hash check would use the new v2 hash. Consistent.
- **answer() rejecting after confirmDecisions**: The `confirmation.confirmed !== true` check inside the lock prevents post-confirmation writes. Correct order of operations.
- **Stale mockup.html blocking submit**: The `.stale.<timestamp>` renaming ensures submitMockup can't find `mockup.html` after reset. The check at `lib/plan-manager.js:388` looks for the exact filename. Correct.
- **readJsonOrThrow not applied to list()**: Proposal explicitly states list() is tolerant to corrupt plans and omits them silently. Correct exception.
- **State transitions for resetConfirmation**: Only accepts questions_pending, ready_for_html, pending_approval. Correctly rejects approved, delivered, and other states. Safe.
- **Global lock prevents concurrent answer + confirm-decisions race**: Since all operations share one lock, an answer() and confirm-decisions() can't execute simultaneously. The lock check in answer() (confirmed !== true) is still correct as a secondary guard within the lock.

## Residual Risks

- The global single-lock design means all plan operations across all plans are serialized. Under heavy concurrent use (unlikely for CLI but possible with multiple agents), this could cause lock timeout errors. The proposal doesn't address per-plan locking, which would be a future improvement.
- The `getEmptyFields()` placeholder list (`['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR']`) is hardcoded in the helper. If new placeholder patterns emerge, they must be updated in one place — which is good — but there's no mechanism for users or agents to define custom placeholders.
- The `resetConfirmation()` recovery from `pending_approval` state does not address what happens if `approve-mockup` was already partially processed by another agent/process (e.g., state changed between read and write). The lock should prevent this, but the proposal doesn't explicitly call out this cross-command race scenario.
- The proposal does not specify whether `questions()` returns the static question catalog from a configurable source or hardcoded values. If the catalog is hardcoded in the function, adding new fields requires code changes rather than configuration.
