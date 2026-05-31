# Review: operator

## Summary

- Verdict: approve_with_changes
- Top risk: answer() emits `warning` only for empty required choice fields, not required text fields — an agent relying solely on the `warning` field would silently accept empty text values and attempt confirmation.
- Confidence: high

## Findings

### OP-01: Empty required text fields accepted without warning (asymmetric with choice fields)

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `answer()`)
- Lines: 278-283
- Claim: `answer()` returns `warning: "empty_value_for_required_choice"` when a required choice field receives an empty value, but returns no warning when a required text field (audiencia, paleta, copy) receives an empty value.
- Evidence: Lines 278-283 define the warning exclusively for choice-type fields with `value === "" && required === true`. Lines 276-277 define general field validation with no text-specific empty check. Line 447 instructs the agent to "Verificar siempre el campo `warning` en la respuesta antes de proceder." If the agent treats absence of `warning` as "field accepted as valid," it would proceed past empty text fields. The counters (`requiredPendingCount`) do catch this, but the asymmetric signalling creates an implementation trap.
- Impact: An agent author who models the flow as "check warning, then proceed" would allow empty required text fields to pass through, leading to a confusing `GSDC_QUESTIONS_UNRESOLVED` (exit 19) at confirm time instead of immediate re-prompt. The round-trip through confirm→reject→re-ask is wasteful and degrades UX.
- Recommendation: Emit a `warning: "empty_value_for_required_field"` for ALL required fields when the value is empty, regardless of type. Or add an explicit note in the template that `warning` absence does NOT mean the field is valid — `requiredFieldsComplete` is the authoritative signal.
- Suggested test: `answer(planId, 'audiencia', '')` → response contains `warning: "empty_value_for_required_field"`. Verify `requiredPendingCount` still counts audiencia as pending.
- Dedup key: answer-empty-required-text-no-warning

### OP-02: Lock and state-validation contracts not re-specified for modified existing functions

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 110, 528-530
- Claim: `confirmDecisions()`, `resolveQuestions()`, and `submitMockup()` are modified (ensureV2Fields insertion, hash v2 migration, REQUIRED_FIELDS replacement) but their lock acquisition, state validation, and full operation ordering are not restated.
- Evidence: Lines 265, 284, and 339-346 specify complete operation sequences (lock → read → validate → write → unlock) for the three NEW functions. Lines 110 and 528-530 only specify where ensureV2Fields is inserted ("después de state validation, antes de cualquier operación") and what changes to make. The existing lock/state contracts are implicit. An implementer refactoring these functions to insert ensureV2Fields could accidentally reorder operations or drop state checks if they treat the proposal as the complete specification rather than a diff.
- Impact: If an implementer places ensureV2Fields() before state validation, it could normalize a decisions.json from a plan in an invalid state, masking the state error. If placed after the lock release, the in-memory migration would be lost. Both would cause subtle bugs in v1→v2 migration paths.
- Recommendation: Add explicit operation-ordering blocks for `confirmDecisions()`, `resolveQuestions()`, and `submitMockup()` matching the detail level of lines 284 and 339-346, showing exactly where ensureV2Fields, REQUIRED_FIELDS, and hash dispatch fit relative to lock, state validation, and writes.
- Suggested test: For each modified function, a test that verifies ensureV2Fields is called after state validation by calling the function on a plan in an invalid state — should still exit 13, not succeed after normalizing.
- Dedup key: modified-functions-missing-operation-ordering

### OP-03: Custom choice value that matches a placeholder string creates contradictory state

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 126-134, 281
- Claim: `answer()` accepts any value for a choice field with `allowCustom: true` that doesn't match an existing option. `getEmptyFields()` rejects exact matches against `['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR']`. A user who legitimately provides a custom value matching a placeholder (e.g., `"TODO"`) would have it accepted by `answer()` but flagged as empty by `getEmptyFields()`.
- Evidence: Line 281: "Si value no coincide [with options] y el campo tiene allowCustom: true → aceptar (valor custom)". Lines 130-131: `placeholders.some(p => upper === p)` rejects "TODO". So `answer(planId, 'vertical', 'TODO')` succeeds and stores `vertical: "TODO"`, but `requiredPendingCount` still shows vertical as pending, and `confirmDecisions()` rejects with exit 19. The agent would re-ask indefinitely for a value the system already accepted.
- Impact: Agent enters a loop: answer accepts "TODO" → counters show pending → agent asks again → user confirms "TODO" → loop. The only escape is the user providing a different value, which they may not understand is needed since `answer()` succeeded.
- Recommendation: Either (a) reject placeholder strings in `answer()` for ALL field types (not just through counter indirection), returning exit 26 with reason `"placeholder_value"`, or (b) explicitly document in the template that custom values matching placeholder strings are prohibited and the agent should re-prompt.
- Suggested test: `answer(planId, 'vertical', 'TODO')` → exit 26 with `reason: "placeholder_value"` (if option a), or `answer` succeeds but `questions()` response documents the conflict. Current spec: answer succeeds, requiredPendingCount stays > 0.
- Dedup key: custom-choice-value-matches-placeholder

### OP-04: questions() catch-all suggestedAction masks state machine bugs

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 259
- Claim: For any unrecognized state, `questions()` returns `suggestedAction: "suggest_new_plan"`. This treats corrupt or unexpected states the same as completed lifecycle states, potentially masking bugs.
- Evidence: Line 259: "Cualquier otro estado no reconocido → readOnly: true, suggestedAction: 'suggest_new_plan'." If a bug introduces an invalid state string (e.g., `"question_pending"` typo), `questions()` would suggest creating a new plan rather than flagging the anomaly. The plan data would be orphaned.
- Impact: Debugging difficulty. A corrupted state would be silently routed to "create new plan" instead of surfacing as an error. Existing plan data and history could be lost if the user follows the suggestion.
- Recommendation: Return a distinct `suggestedAction` for unrecognized states (e.g., `"diagnose_state"`) and include the raw state value in the response for diagnostic purposes. The template can map this to "run plan status for diagnosis."
- Suggested test: Create plan, manually set plan.json status to `"unknown_state"`. `questions()` returns `suggestedAction: "diagnose_state"` (or similar), not `"suggest_new_plan"`.
- Dedup key: questions-catch-all-masks-invalid-state

### OP-05: resetConfirmation() does not clear confirmation.source

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 344
- Claim: `resetConfirmation()` clears `confirmed`, `confirmedAt`, `confirmedBy`, `decisionsHash`, and `hashAlgorithm` in the confirmation object, but does not clear `source`. After reset, `source` retains its pre-reset value while every other confirmation field is reset.
- Evidence: Line 344 explicitly lists the five fields cleared. `source` is absent from the list. `ensureV2Fields()` (line 106) uses `??` which won't overwrite an existing `source` value. After a confirm-by-user-A → reset → confirm-by-user-B cycle, `source` would still reflect user A's context if it was set to something other than the `"chat"` default.
- Impact: Minor diagnostic confusion. `source` is informational metadata and does not affect control flow. But inconsistent reset semantics could mislead debugging or audit trails.
- Recommendation: Add `source: null` (or `source: "chat"`) to the resetConfirmation() clear list for consistency. Since `ensureV2Fields()` would restore `"chat"` on next read via `??`, clearing to `null` is cleanest.
- Suggested test: `confirmDecisions('001', { by: 'user_A', source: 'api' })` → `resetConfirmation()` → `decisions.confirmation.source === null`.
- Dedup key: reset-confirmation-source-not-cleared

## Non-Issues Checked

- **Non-atomic multi-file writes in resetConfirmation()**: Plan.json written first (step 4), decisions.json second (step 5). Crash between steps leaves `questions_pending` in plan.json with stale `confirmed: true` in decisions.json. Re-running resetConfirmation() is idempotent and recovers correctly. History may accumulate one extra entry — documented as acceptable. Recovery path is well-specified at line 349.
- **Lock serialization**: All new functions (questions, answer, resetConfirmation) acquire per-plan locks and release in `finally` blocks. Concurrent calls to the same plan are serialized. No nested lock or deadlock risk since all functions operate on a single plan.
- **ensureV2Fields() ?? semantics with empty string**: After resetConfirmation clears `hashAlgorithm` to `""`, ensureV2Fields' `??` won't overwrite it (since `""` is not nullish). This is correct — `""` means "no hash computed," and confirmDecisions will set the proper value on next confirm.
- **answer() state validation ordering**: Field check (exit 22) before state check (exit 13) is intentional and tested (line 568). The roundabout error recovery path (exit 22 → re-run questions → see readOnly) eventually reaches correct diagnosis. Not ideal but not broken.
- **Idempotency of resetConfirmation()**: No-op correctly identified when state is `questions_pending`, confirmed is false, and no mockup exists (line 335). Stale mockup cleanup is handled as a non-no-op side effect, which is appropriate.
- **Hash migration v1→v2**: confirmDecisions always computes v2 (7 fields). resolveQuestions/submitMockup dispatch on stored hashAlgorithm with safe fallback to v2 for unknown values. Migration is atomic — hash and label always agree after confirm.
- **Lock for read-only questions()**: Acquiring a lock for reads protects against reading a partially-written decisions.json during concurrent answer() or resetConfirmation() calls. Acceptable tradeoff of contention for consistency.
- **Choice value case-insensitive normalization**: Stored as canonical form from FIELD_REGISTRY. Hash computed on stored value. Consistent end-to-end.
- **resetConfirmation() from pending_approval**: Deep rollback is intentional. Required fields preserved, optional cleared, mockup staled. Template explicitly informs user of what changes (line 481). Lock prevents concurrent approve during reset.

## Residual Risks

- **Manual edits to decisions.json or plan.json** bypass all state machine invariants, locks, and validation. The system has no tamper detection for structural edits (only hash covers field values post-confirm). A manually edited state could put the system into an unrecoverable state not covered by any suggestedAction.
- **writeAtomicJson atomicity** is assumed but implementation-dependent. If the atomic write primitive fails non-atomically (partial write), the protocol's recovery guarantees break. This is an existing dependency, not introduced by this proposal.
- **Stale mockup rename failure** (step 6 of resetConfirmation) is handled gracefully but relies on the agent template informing the user of manual cleanup. If the template is not followed, a stale mockup.html could be reused, though mtime and hash checks in submitMockup() serve as safety nets.
- **answer() for choice fields with allowCustom could accept values that are placeholders** (see OP-03). If this is not addressed, the interaction between custom-value acceptance and placeholder detection creates a loop that is technically recoverable (counters prevent confirmation) but confusing for users.
