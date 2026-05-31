# Review: agent-ux

## Summary

- Verdict: reject_until_fixed
- Top risk: `staleMockupExists` flag creates an unrecoverable state — resetConfirmation never clears it, submitMockup blocks if present, and manual editing is prohibited
- Confidence: high

## Findings

### UX-001: staleMockupExists flag creates unrecoverable deadlock

- Severity: P1
- Category: state
- Status: valid
- File: target.md (Section 4 — resetConfirmation, and Guard contra stale mockup reuso)
- Lines: 346-349
- Claim: When `resetConfirmation()` fails to rename `mockup.html` to `.stale`, it persists `staleMockupExists: true` in `decisions.json`. This flag is never cleared by any documented operation, and `submitMockup()` rejects if the flag is present.
- Evidence: resetConfirmation step 5 explicitly lists what gets cleaned: `confirmed`, `confirmedAt`, `confirmedBy`, `decisionsHash`, `hashAlgorithm`, `optionalAnswered`, and optional field values. `staleMockupExists` is absent from this list. `confirmDecisions()` and `answer()` do not mention it either. The spec says `submitMockup()` rejects if the flag is present, unconditionally. The no-op path in resetConfirmation (`questions_pending + confirmed !== true + no mockup`) doesn't rewrite decisions.json, so re-running after manual file cleanup doesn't clear it either.
- Impact: User enters a permanent deadlock: (1) reset fails to rename → flag set, (2) generate new mockup, (3) submit → blocked by flag, (4) reset again → flag not cleared, (5) loop forever. The only escape is manually editing `decisions.json`, which the template explicitly prohibits ("PROHIBIDO editar decisions.json directamente"). The message "los datos se reiniciaron" is also misleading since the flag persists.
- Recommendation: Add `staleMockupExists` (or the entire field) to resetConfirmation's cleanup step. Either: (a) always clear `staleMockupExists: false` in step 5, or (b) on re-execution, if rename succeeds or file no longer exists, clear the flag. Option (a) is simpler and safer — resetConfirmation always resets to a clean slate.
- Suggested test: Create plan → fill all fields → confirm → resolve → submit → resetConfirmation with mocked `fs.renameSync` throwing EACCES → verify `staleMockupExists: true` in decisions.json → re-run resetConfirmation → verify `staleMockupExists` is cleared → fill + confirm → submit succeeds.
- Dedup key: staleMockupExists-deadlock

### UX-002: P1-002 defense is valid — confirmDecisions should warn, not block, on unaddressed optionals

- Severity: P2
- Category: ux
- Status: valid
- File: counter-arguments.md (P1-002), target.md (Section 5, confirmDecisions)
- Lines: counter-arguments.md:9-23, target.md:564-566
- Claim: The author's defense of P1-002 is sound. Optional field gating is a UX policy, not a data invariant. The template enforces it, and `confirmDecisions()` already validates required fields. However, the author's own counter-proposal (add `warning: "optional_fields_not_addressed"` to `confirmDecisions()`) should be adopted — it strengthens the safety net without coupling the API to a specific UI policy.
- Evidence: The template explicitly gates optionals before confirmation (line 476: "if `requiredFieldsComplete === true` AND `optionalPendingCount > 0` → preguntar assets"). An automated script that skips optionals is a legitimate use case. `answer()` already uses the warning pattern for empty required fields. Adding a parallel warning for unaddressed optionals in `confirmDecisions()` is consistent and provides a secondary safety net for agents that bypass the template.
- Impact: Without the warning, an agent that calls `confirmDecisions()` directly (bypassing template flow) gets no signal that optional fields were never addressed. With the warning, the agent can decide whether to proceed or ask the user. The `allQuestionsAddressed` field in the response would no longer be purely advisory — it gains a corresponding API-level signal.
- Recommendation: Adopt the author's counter-proposal. Add `"warning": "optional_fields_not_addressed"` to `confirmDecisions()` response when `allQuestionsAddressed === false`. Document in the template that agents should check this warning before proceeding.
- Suggested test: Fill 6 required fields, skip assets → `confirmDecisions()` → success with `warning: "optional_fields_not_addressed"`. Fill all 7 → `confirmDecisions()` → success, no warning.
- Dedup key: confirmDecisions-optional-warning

### UX-003: P1-005 defense is valid — "claro que no, confirmo" is an affirmation in Spanish

- Severity: P3
- Category: ux
- Status: valid
- File: counter-arguments.md (P1-005), target.md (Section 6, confirm parsing)
- Lines: counter-arguments.md:29-46, target.md:498-501
- Claim: The previous reviewer incorrectly assessed "claro que no, confirmo" as a negation. In Spanish, this is an affirmation — the "no" negates an implicit question ("¿no vas a confirmar?"), not the confirmation itself. The author's defense is linguistically correct.
- Evidence: The negation regex `/\bno\s+(lo\s+)?(confirmo|confirmado)\b/i` correctly rejects "no confirmo" and "no lo confirmo" (direct negation of the verb). "Claro que no, confirmo" has a comma between "no" and "confirmo", so `\s+` doesn't match across punctuation — the negation regex doesn't trigger, and the positive regex matches "confirmo". This is the correct behavior. The test matrix at line 653 confirms: "claro que no, confirmo" → accepted, "no confirmo" → rejected.
- Impact: Minor edge cases remain: "jamás confirmo" and "nunca confirmo" would be accepted as false positives. These are extremely unlikely in a confirmation flow — users who want to reject say "no" or "no confirmo", not "jamás confirmo". The escape hatch (reset-confirmation) mitigates any false positive. The author's note about detecting the word, not sentiment, is a reasonable trade-off.
- Recommendation: Accept the author's defense. Add the explicit note from the counter-proposal: "Parsing detects presence of 'confirmo/confirmado' word, not context semantics. To undo a confirmation, use reset-confirmation." Consider adding "jamás" and "nunca" to the negation regex if zero false-positive tolerance is desired, but this is optional.
- Suggested test: Existing test matrix at line 653 covers the key cases. Optionally add: "jamás confirmo" → accepted (documented false positive), "nunca lo confirmo" → test whether negation regex catches "nunca" (it doesn't currently — decide if this matters).
- Dedup key: confirmo-negation-spanish-semantics

### UX-004: Error 13 recovery is ambiguous — same code, different required actions

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md (Section 6 — Manejo de errores)
- Lines: 479-491
- Claim: `GSDC_INVALID_STATE` (exit 13) covers multiple distinct scenarios that require different recovery actions, but the error table gives one-size-fits-all advice.
- Evidence: Exit 13 occurs in: (1) `answer()` when state is not `mockup:questions_pending` — agent should check what state it's in, (2) `resetConfirmation()` when state is `approved` or non-mockup — agent should suggest new plan, (3) `resetConfirmation()` when state is something unexpected — agent should suggest `plan status`. The error table says: "Ejecutar `plan status`. Sugerir `reset-confirmation` si aplica." But for case (2), suggesting reset-confirmation is wrong — it would fail again with exit 13. The agent would need to parse the error message text to determine the correct recovery, but the spec doesn't define a structured `reason` field for exit 13 like it does for exit 26.
- Impact: An agent that gets exit 13 from resetConfirmation on an approved plan would follow the table, suggest reset-confirmation, get exit 13 again, and loop. The "si aplica" qualifier requires the agent to understand state context, but exit 13 alone doesn't carry that context.
- Recommendation: Add a `reason` field to exit 13 errors (similar to exit 26's `numeric_value`/`not_in_options`/`placeholder_value`). Example reasons: `"invalid_phase"`, `"invalid_status_for_reset"`, `"invalid_status_for_answer"`. Update the error table to branch on reason. Alternatively, add the current state to the error response so the agent can make an informed decision.
- Suggested test: `resetConfirmation(approved plan)` → exit 13 with reason indicating state is approved. Agent recovery: suggest new plan, not reset.
- Dedup key: error-13-recovery-ambiguity

### UX-005: Confirm→resolve→reset message misleads about optional field preservation

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6 — Revisión Final y Confirmación, step 6)
- Lines: 502-504
- Claim: When confirm succeeds but resolve fails, the template tells the user "Tus decisiones se preservaron pero necesitas confirmar de nuevo." But after resetConfirmation, optional fields (assets) are wiped and optionalAnswered is cleared. The message is misleading — required decisions are preserved, but optional decisions are not.
- Evidence: resetConfirmation step 5 clears `optionalAnswered = {}` and iterates OPTIONAL_FIELDS to set values to `""`. The user's assets answer is lost. The message says "decisiones se preservaron" without qualification. The correction section (line 508) has the more accurate phrasing "Campos requeridos preservados. Opcionales (assets) limpiados." but this phrasing isn't used in the resolve-failure recovery path.
- Impact: User sees "decisiones se preservadas" but then the summary shows assets empty. Minor confusion. The agent naturally re-asks assets (since optionalPendingCount > 0), so the flow recovers, but the user may wonder why they need to re-answer.
- Recommendation: Change the resolve-failure message to match the correction-section phrasing: "Tus decisiones requeridas se preservaron. Campos opcionales (assets) se reiniciaron. Necesitas confirmar de nuevo." Or simply: "Error técnico al procesar la confirmación. Se reiniciará la confirmación — los campos requeridos se preservan pero necesitarás confirmar de nuevo."
- Suggested test: No automated test — this is a template instruction. Verify template text matches the more accurate phrasing.
- Dedup key: resolve-failure-message-optional-wipe

### UX-006: readOnly and editable fields are redundant and could diverge

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 2 — questions() response)
- Lines: 159-160, 465
- Claim: The `questions()` response includes both `readOnly: false` and `editable: true` (and their inverses), which are always semantically opposite. The template checks both: "Si editable === false (o readOnly === true)". If an implementation bug causes them to diverge, agents would have inconsistent behavior.
- Evidence: Every state in the questions() behavior table produces `readOnly: true, editable: false` or `readOnly: false, editable: true`. They never diverge by design. But the template using `||` suggests they could, and agents might check one but not the other.
- Recommendation: Either: (a) keep only `editable` (actionable — "can I edit?") and remove `readOnly` (passive — "can I only read?"), or (b) add an explicit note: "readOnly is always !editable — they are inverse." Option (a) reduces surface area for bugs. The template should check only one field.
- Suggested test: For every questions() test case, assert `readOnly === !editable`.
- Dedup key: readonly-editable-redundancy

## Non-Issues Checked

- **"confirmo" regex negation check**: The negation regex `/\bno\s+(lo\s+)?(confirmo|confirmado)\b/i` correctly handles common Spanish negation patterns. The comma in "claro que no, confirmo" prevents the negation regex from matching, which is correct. "No confirmo" without comma is properly rejected.
- **Multi-field semantic mapping rules**: The mapping rules (semantic, not positional; don't save if uncertain; save partial if quantity < pending) are well-defined and handle edge cases. The keyword table provides clear guidance.
- **answer() validation order**: Input validation (field) → state validation → confirmation validation → value validation is a sound ordering. Invalid input returns immediately before checking state, preventing confusing error messages.
- **ensureV2Fields() idempotency**: Using `??` means no overwrite of existing values. Calling it multiple times is safe. The distinction between read-only persistence (questions/status) and mutation persistence (answer/confirm/reset) is clear.
- **questions() never throws**: The function always returns a response with `readOnly: true` for unrecognized states, preventing agent crashes. The `suggestedAction` field provides clear next-step guidance.
- **Idempotent resetConfirmation**: Re-execution converges correctly after crashes. plan.json written before decisions.json enables clean recovery. History deduplication prevents noise.
- **Error table catch-all**: "Cualquier otro código → Detener flujo. Reportar error completo. Sugerir plan status" is a safe fallback for unexpected errors.
- **Placeholder detection migration**: Changing from `includes()` to `===` is a documented breaking change with pre-implementation grep audit. Values like "PENDIENTE DE REVISIÓN" no longer matching is intentional and documented.
- **Hash migration v1→v2**: Single NORMALIZE function prevents divergence. confirmDecisions always computes v2. resolveQuestions/submitMockup dispatch on stored algorithm. Migration is atomic (hash + label always match after confirm).

## Residual Risks

- **staleMockupExists deadlock** (UX-001) is the blocking issue. Until the cleanup step is fixed, the system has an unrecoverable state. This is the sole reason for `reject_until_fixed`.
- **Error 13 reason field** (UX-004) would require an API shape change. If not addressed before implementation, agents may loop on invalid-state errors for approved plans. Not blocking but should be addressed during implementation.
- **"jamás confirmo" / "nunca confirmo" false positive** (mentioned in UX-003) is an acknowledged edge case. Extremely unlikely in practice given the conversational context of a confirmation flow. Mitigated by reset-confirmation escape hatch.
- **Agent multi-field mapping variance**: Different LLM agents may interpret ambiguous user input differently despite the keyword table. This is inherent to natural language and not fully preventable by spec. The conservative "don't save if uncertain" rule limits damage.
