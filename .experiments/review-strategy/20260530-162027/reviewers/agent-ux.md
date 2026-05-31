# Review: agent-ux

## Summary

- Verdict: approve_with_changes
- Top risk: Template error table missing exit 19 leaves agents without recovery guidance when confirm-decisions rejects placeholder values — the catch-all row dead-ends the main flow instead of directing re-answering.
- Confidence: high

## Findings

### AU-01: Template error table missing `GSDC_QUESTIONS_UNRESOLVED` (exit 19) recovery

- Severity: P2
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (Section 2, error table)
- Lines: target.md:454-464
- Claim: The error table lists exit codes 21-26, 13, and 15 but omits exit 19 (`GSDC_QUESTIONS_UNRESOLVED`). This error is thrown by `confirmDecisions()` when a required field contains a placeholder value (line 528). The table's catch-all row ("Cualquier otro código → Detener flujo") would cause the agent to dead-end instead of recovering.
- Evidence: target.md:528 states `confirmDecisions()` runs `getEmptyFields()` and throws exit 19 for empty/placeholder required fields. target.md:454-464 lists the error table — exit 19 is absent. A v1.1 plan migrated with `ensureV2Fields()` preserves existing placeholder values like `"TBD"` or `"TODO"`. If an agent calls `confirm-decisions` in this state (e.g., after filling other fields without re-checking), exit 19 fires with no actionable guidance.
- Impact: Agent hits "detener flujo" on a recoverable error. User sees a generic stop message instead of being re-asked for the problematic field. Recovery requires manual intervention or agent restart.
- Recommendation: Add a row to the error table: `GSDC_QUESTIONS_UNRESOLVED (19) → Re-ejecutar plan questions --json. Re-preguntar campos en pending. Volver a confirmar.` Also consider having `answer()` warn on placeholder values for required text fields (not just empty choice values), preventing the error upstream.
- Suggested test: Store `audiencia: "TBD"` via answer, fill remaining required fields, call `confirm-decisions` → verify agent template guidance leads to successful recovery (re-answer audiencia, re-confirm).
- Dedup key: error-table-missing-exit-19

### AU-02: "confirmo" negation regex rejects legitimate confirmations

- Severity: P2
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (Section 2, confirmation parsing)
- Lines: target.md:473
- Claim: The negation check `/\bno\s+.*\b(confirmo|confirmado)\b/i` is unanchored and matches natural language patterns where "no" refers to a different clause than the confirmation intent.
- Evidence: target.md:473 defines the negation regex. Example: user says "claro que no [quiero cambiar nada], confirmo" — the regex matches `\bno\s+.*\bconfirmo\b` and rejects the input. The user intended full confirmation. Conversely, the trade-off note at target.md:676 acknowledges false positives in the positive direction but does not address false negatives from the negation check.
- Impact: User legitimately trying to confirm is rejected with a prompt to include "confirmo" — which they already did. Frustrating loop. Agent cannot proceed without the user rephrasing.
- Recommendation: Anchor the negation check more tightly, e.g. `/\bno\s+(lo\s+)?(confirmo|confirmado)\b/i` to only match direct negation of the confirmation verb, not unrelated "no" in the same sentence. Alternatively, require negation to precede the keyword within a short window (e.g., max 2 words between "no" and "confirmo").
- Suggested test: Assertion table in target.md:609 covers "no confirmo" and "no lo confirmo" (rejected) and "claro que confirmo" (accepted). Add test: "claro que no, confirmo" → should be accepted (currently would be rejected).
- Dedup key: confirmo-negation-regex-overbroad

### AU-03: `readOnly: true` combined with real `pending` data creates agent footgun

- Severity: P2
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (Section 2, question rendering)
- Lines: target.md:253-259, target.md:440
- Claim: When `questions()` returns `readOnly: true`, it also returns real `pending` and `filled` arrays with full data. An agent that processes the response sequentially (render pending → collect answers → call answer) may skip the `readOnly` check and enter the answer loop, which will fail with exit 13 or 23.
- Evidence: target.md:672 explicitly states questions() "retorna siempre valores reales" regardless of readOnly. The template at target.md:440 says "Si readOnly === true → seguir suggestedAction. NO entrar al loop de answer(). Los campos pending contienen datos reales pero no son editables." Despite the prohibition, the JSON shape invites the error — the agent sees actionable-looking data.
- Impact: Agent enters answer loop on a locked plan, gets unexpected exit 13/23, falls through to error table recovery. User sees confusing error recovery instead of the intended suggestedAction guidance. Most likely to happen with less capable agents or when the template instructions are truncated by context limits.
- Recommendation: Add a top-level `"editable": false` field when `readOnly: true` (redundant but unambiguous). Alternatively, return `"pending": []` and `"filled": []` as empty arrays when `readOnly: true`, with a separate `"snapshot"` key containing the read-only data for display purposes. The current design optimizes for template flexibility at the cost of agent safety.
- Suggested test: Give an agent the readOnly questions response and verify it follows suggestedAction without calling answer(). Test that the JSON shape does not trigger the standard "pending fields → ask → answer" loop.
- Dedup key: readonly-real-pending-data-footgun

### AU-04: Multi-field parsing "equal count" case is underspecified

- Severity: P3
- Category: docs
- Status: valid
- File: `templates/commands/canva-mockup.md` (Section 2, multi-campo)
- Lines: target.md:422-427
- Claim: The multi-field rules cover "excede" (more values than pending fields → don't save) and "menor" (fewer → save successful mappings) but never explicitly state what happens when the count equals the pending count.
- Evidence: target.md:422-426 lists three rules for multi-field: excedes → nothing, fewer → save + ask rest, uncertain mapping → don't save that field. The "equal" case is handled implicitly (it's not "excede" and not "menor" so it would fall to semantic mapping), but an agent implementer could interpret "excede" as `>=` (a common off-by-one interpretation), causing it to refuse saving even when counts match.
- Impact: Agent might refuse to save valid multi-field answers when the count matches pending fields exactly, asking for unnecessary clarification. Low severity since the user can re-state their answers.
- Recommendation: Add an explicit bullet: "Si cantidad es igual a campos pendientes → mapear por semántica y guardar exitosos, igual que el caso 'menor'."
- Suggested test: 3 pending fields, user provides exactly 3 values → verify agent saves all successfully mapped values.
- Dedup key: multi-field-equal-count-underspecified

### AU-05: `suggestedAction` catch-all contradicts "always present" guarantee

- Severity: P3
- Category: docs
- Status: valid
- File: `templates/commands/canva-mockup.md` (Section 2, readOnly handling)
- Lines: target.md:259, target.md:414
- Claim: The spec states `questions()` never throws and always sets `suggestedAction` (target.md:259). Yet the template includes a catch-all at target.md:414: "Si `suggestedAction` no está presente, mostrar resumen y sugerir `plan status`." These two statements create ambiguity for the implementer.
- Evidence: target.md:259 says `questions()` never throws `GSDC_INVALID_STATE` and always returns a valid response with suggestedAction. target.md:414 instructs the agent to handle the absent case. An implementer might wonder if there's an undocumented edge case where suggestedAction is missing, and invest effort in a defensive path that can never trigger.
- Impact: Implementer confusion. Time spent on unreachable code path. May also signal to the implementer that the spec's guarantee is unreliable, reducing trust in other "always" claims.
- Recommendation: Either remove the catch-all (trusting the spec guarantee) or add a comment: "This catch-all is defensive — `questions()` always sets suggestedAction per spec, but this guards against future changes."
- Suggested test: Call `questions()` for every possible plan state and verify `suggestedAction` is always a non-empty string in the known enum.
- Dedup key: suggestedaction-catchall-contradicts-guarantee

### AU-06: "Opción personalizada" detection by label vs value is a subtle trap

- Severity: P3
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (Section 2, custom option handling)
- Lines: target.md:438, target.md:179
- Claim: The custom option in the JSON is `{ label: "Opción personalizada", value: "", customFollowUp: "..." }`. The template instructs: "Detectar por label (no por value — value es `""`)." An agent checking `option.value === ""` to detect custom selection would match, but so would any other empty-valued option if the schema changes.
- Evidence: target.md:438 explicitly warns against using value. But the JSON structure uses `value: ""` which is a natural thing for an agent to key on. The spec at target.md:280 also blocks `answer()` from accepting literal "Opción personalizada" as a value (exit 26), so a misdetection at the template level would be caught by the CLI — but only after a wasted round-trip and a confusing error message ("Selecciona 'Opción personalizada' y provee un valor personalizado" when the user already provided one).
- Impact: Agent detects custom option by value="" → passes user's custom text as value → works. But if the detection logic is "value is empty → this is the custom option", it could break if another empty-valued option is added. More immediately: if agent passes "Opción personalizada" as the value (misunderstanding the detection), CLI rejects with exit 26 and the error message is confusing because the user did select that option.
- Recommendation: Consider using a sentinel value like `value: "__custom__"` instead of `value: ""`. This makes detection unambiguous without relying on label matching and avoids confusion with genuinely empty values.
- Suggested test: Agent selects option with `value: ""` → verify it triggers `customFollowUp` and does NOT pass "Opción personalizada" or "" to `answer()`.
- Dedup key: custom-option-label-vs-value-trap

### AU-07: `reset-confirmation` response `staleRenameFailed` not covered in template

- Severity: P3
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (Section 2, error handling)
- Lines: target.md:345-347, target.md:479-482
- Claim: `resetConfirmation()` can return `staleRenameFailed: true` when the mockup rename fails (I/O error). The spec documents a human-readable message for this case (target.md:347), but the agent template does not instruct the agent to check this field or relay the message to the user.
- Evidence: target.md:345-347 defines the `staleRenameFailed` return field and the suggested message. target.md:479-482 covers the post-confirmation correction flow but only mentions the "mockup renombrado a .stale" success case. The error table does not include a row for this partial-failure scenario.
- Impact: After reset-confirmation succeeds but mockup rename fails, the agent reports success to the user without mentioning the stale file. The old mockup.html remains on disk and could cause confusion later (e.g., `submitMockup()` stale check). User has no idea cleanup is needed.
- Recommendation: Add to the reset-confirmation handling in the template: "Verificar campo `staleRenameFailed` en la respuesta. Si `true`, informar: 'El mockup anterior no se pudo renombrar pero los datos se reiniciaron. El archivo mockup.html anterior puede ser ignorado o eliminado manualmente.'"
- Suggested test: Run reset-confirmation with a mock fs.renameSync failure → verify agent template instructs informing the user about the stale file.
- Dedup key: stale-rename-failed-not-in-template

### AU-08: `answer()` validation order exposes different errors for same input depending on plan state

- Severity: P3
- Category: ux
- Status: valid
- File: `lib/plan-manager.js` (answer function)
- Lines: target.md:284
- Claim: `answer()` validates field existence (exit 22) before state validation (exit 13). This means calling `answer(planInReadyForHtml, 'nonexistent', 'value')` returns exit 22, but `answer(planInReadyForHtml, 'vertical', 'value')` returns exit 13. The agent's error recovery depends on which field name was used.
- Evidence: target.md:284 defines the order: "acquire lock → leer → validar field ∈ ALL_FIELDS (exit 22) → validar estado mockup:questions_pending (exit 13) → ...". target.md:568 documents this explicitly as a test case. The template's error table at target.md:454 maps exit 22 to "Re-ejecutar plan questions" and exit 13 to "Ejecutar plan status + sugerir reset-confirmation."
- Impact: For a plan in the wrong state, a typo in the field name sends the agent down the "re-run questions" path instead of the "check state" path. The agent might loop: re-run questions → get readOnly → suggest reset → reset → try again with same typo → exit 22 again. The root cause (wrong state) is masked by the field error.
- Impact: Low in practice — the agent would eventually notice the state issue when questions returns readOnly. But the error recovery is misleading for the specific failure.
- Recommendation: This is documented and intentional (target.md:568). Accept as-is but add a note in the template: "If exit 22 persists after re-running questions, check plan status — the plan may be in an unexpected state."
- Suggested test: Call answer with invalid field on plan in ready_for_html → verify exit 22. Then call with valid field → verify exit 13. Agent template should handle both without looping.
- Dedup key: answer-validation-order-masking-state-error

## Non-Issues Checked

- **"confirmo" positive match is intentionally permissive**: The spec acknowledges "confirmo pero quiero cambiar" passes and justifies the trade-off (target.md:676). Acceptable since reset-confirmation is available. Not a bug, just a design choice.
- **`ensureV2Fields()` memory-only in questions()**: Correctly documented as non-persisting (target.md:263). Agent reads stale disk data until first mutation. The template instructs using CLI output, not direct file reads, so this is safe.
- **Idempotency of reset-confirmation**: Spec is clear at target.md:335-336. No-op case is well-defined.
- **Lock release in finally**: target.md:265 confirms lock released in finally block for questions(). Safe.
- **Exit code migration plan (15→24, 15→25)**: Breaking changes are documented with pre-implementation grep steps. Adequate for agent consumers that check exit codes.
- **`optionalAnswered` not set for required fields**: Defensive guard documented at target.md:286 and tested at target.md:577-578. Correctly prevents false negatives in getEmptyFields.
- **State notation `phase:status` vs separate fields**: Clarified at target.md:112 with explicit implementation note. Clear enough for implementers.
- **Error catch-all row**: "Cualquier otro código → Detener flujo" is a reasonable fallback for unexpected errors. The issue is only with exit 19 which should not be "unexpected."
- **Hash migration v1→v2**: Always computes v2 in confirmDecisions (target.md:526). Migration is atomic. No agent UX issue — the migration is transparent.

## Residual Risks

- **Agent context window limits**: The full template section 2 replacement is substantial (~100 lines of dense instructions with tables, examples, and warnings). If an agent's context window is constrained, it may truncate the template and miss critical instructions (e.g., the PROHIBIDO rules or the multi-field mapping table). Not directly verifiable from the spec but worth noting for deployment.
- **Non-Spanish-speaking users**: All questions, options, and confirmation parsing are in Spanish. The "confirmo" regex is Spanish-specific. A user responding in English ("I confirm") would be rejected. This is likely intentional but creates a language lock-in.
- **Race condition between questions() and answer()**: An agent calls questions(), sees pending fields, but between that call and the subsequent answer() call, another process could reset the plan. The answer() would fail with exit 13 or 23. The error table handles this, but the agent would need to re-read questions() to get the updated state. This is a theoretical concern since the system appears single-agent.
