# Review: agent-ux

## Summary

- Verdict: approve_with_changes
- Top risk: Template lacks an explicit branching instruction tying `requiredFieldsComplete` from `answer()` to the summary+confirmation sub-flow, so agents may not know when to stop asking and present the summary.
- Confidence: high

## Findings

### UX-01: No template instruction for `requiredFieldsComplete` transition

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6, template text)
- Lines: 339-397
- Claim: The template describes asking questions one-by-one and calling `plan answer`, but never states "WHEN `requiredFieldsComplete === true` in the `answer()` response, STOP asking and proceed to the summary step."
- Evidence: Lines 358-363 cover calling `plan answer` per question. Lines 379-389 cover the summary+confirmation step. The connection — *what triggers moving from the question loop to the summary* — is implied by the counters and flags described in Section 3 (lines 252-263) but never stated as a conditional in the template itself. An agent following the template literally would keep calling `plan questions` to check status or would not know to transition.
- Impact: Agents may call `plan questions` after every `answer()` to re-check state (wasteful), or may continue prompting the user for already-filled fields, or may skip the summary step entirely and jump to `confirm-decisions`.
- Recommendation: Add an explicit conditional block in the template after the `plan answer` instructions: "After each `plan answer`, check the response. If `requiredFieldsComplete === true`, proceed to the Review/Confirmation step below. Otherwise, continue with the next pending question."
- Suggested test: Write a template-reading agent test: given a plan with 5 of 6 required fields filled, simulate `answer()` returning `requiredFieldsComplete: false`; then fill the 6th and verify the agent transitions to summary output instead of calling `plan questions` again.
- Dedup key: template-requiredFieldsComplete-transition-gap

### UX-02: No handling guidance for `readOnly: true` from `questions()`

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 2, line 231 and Section 6 template)
- Lines: 231, 339-353
- Claim: `questions()` returns `readOnly: true` when the plan is in `ready_for_html` or `pending_approval`, but the template does not instruct the agent what to do with this response.
- Evidence: Line 231 defines the `readOnly: true` output. Lines 339-353 in the template describe rendering pending questions but never check for or handle `readOnly`. The error table (lines 364-373) covers `GSDC_INVALID_STATE` (exit 13) but `questions()` does not throw that error for these states — it returns a read-only snapshot. The agent has no instruction path for this case.
- Impact: An agent calling `plan questions` on a confirmed plan will receive `readOnly: true` with no pending questions and no explicit instruction to display "your decisions are locked" or to suggest `reset-confirmation`. The agent may silently show an empty question list or confuse the user.
- Recommendation: Add a template instruction: "If `questions()` returns `readOnly: true`, inform the user that decisions are already confirmed. Display the filled fields as a summary. Suggest `reset-confirmation` if the user wants to make changes."
- Suggested test: Template compliance test: agent calls `questions()` on a `ready_for_html` plan and receives `readOnly: true`; verify agent output includes a message about locked decisions and mentions `reset-confirmation`.
- Dedup key: template-readOnly-no-handling

### UX-03: No guidance for multi-field or batch user responses

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6, template text)
- Lines: 348-349
- Claim: The template mandates "Espera la respuesta del usuario antes de pasar a la siguiente pregunta" (sequential one-at-a-time), but provides no instruction when a user answers multiple questions in a single message.
- Evidence: Line 348-349 explicitly enforces sequential flow. Users in chat commonly respond with combined answers like "vertical: SaaS, formato: Instagram Post, audiencia: jóvenes desarrolladores". The template has no instruction for parsing and dispatching multiple fields from one message. The error handling table (lines 364-373) does not cover this scenario either.
- Impact: An agent following the template literally will interpret a multi-field response as the answer to the single current question, calling `plan answer` with the entire multi-field text as the value for one field — producing garbage in `decisions.json` and no recovery path except manual correction.
- Recommendation: Add a template instruction: "If the user provides answers for multiple fields in one message, extract each field-value pair and call `plan answer` for each one sequentially. If any field name is ambiguous, ask for clarification before saving."
- Suggested test: Simulate a user sending "SaaS / Producto Digital, Instagram Post, jóvenes" when asked only the `vertical` question. Verify the agent either: (a) extracts and saves all three as separate answers, or (b) asks for clarification instead of saving the entire text to the `vertical` field.
- Dedup key: template-batch-answer-no-handling

### UX-04: No fuzzy matching guidance for choice fields

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6, template text)
- Lines: 346-350
- Claim: The template specifies numeric mapping ("1" → first option value) but does not address text-based partial matches.
- Evidence: Line 349 says "Si el usuario responde con un número, el agente debe mapearlo al `value`". Line 224 says "Lo que el usuario selecciona o escribe es lo que se guarda." But there is no instruction for when a user types "instagram" instead of "Instagram Post (1080x1080)", or "post" instead of the full option string, or "saaS" with different casing.
- Impact: Agents will improvise matching logic inconsistently. Some will pass "instagram" as the value to `plan answer`, which will be stored literally in `decisions.json` — a value that doesn't match any option and will confuse downstream rendering. Others will ask for clarification each time, degrading UX.
- Recommendation: Add a template rule: "For `choice` fields, if the user's text input does not exactly match an option `value` (case-insensitive), the agent should ask the user to confirm which option they mean by showing the closest matches or the full numbered list. Do not pass free text as a choice value unless the user selected 'Otro (personalizado)'."
- Suggested test: User types "instagram" for the `formato` field. Verify the agent does not save "instagram" as the value, but instead presents the matching options or asks for clarification.
- Dedup key: template-choice-fuzzy-match-undefined

### UX-05: Confirmation trigger `"confirmo"` is intentionally strict but may cause recovery loops

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6, template text)
- Lines: 383-384
- Claim: Only the exact word "confirmo" (case-insensitive, trimmed, no additional text) is accepted as confirmation. This is deliberate but creates a known UX friction point without a mitigation strategy.
- Evidence: Line 384 explicitly rejects "sí", "dale", "ok", "sí, pero cambia X". The template instructs the agent to "pregunta si quiere hacer cambios y vuelve al flujo de `plan answer`" for non-confirmo responses. But a user saying "confirmo, todo perfecto" (natural phrasing) would be rejected and re-prompted, with the agent asking if they want changes — which is confusing because the user just confirmed.
- Impact: Users who append pleasantries or punctuation ("confirmo." or "confirmo, gracias") will be rejected. The re-prompt asks if they want changes, which is misleading — they don't want changes, they just want to confirm. This could loop 2-3 times before the user says the bare word "confirmo".
- Recommendation: Consider one of: (a) accept "confirmo" as a substring match (if the response starts with or contains "confirmo"), or (b) change the re-prompt from "do you want changes?" to "I need you to respond with exactly 'confirmo' to proceed", or (c) keep the strict rule but add explicit recovery guidance: "If the user's response contains 'confirmo' but has extra text, ask them to reply with just 'confirmo'."
- Suggested test: User says "confirmo, todo bien". Verify the agent does not re-enter the edit flow but instead asks for the exact trigger word.
- Dedup key: confirmo-strict-trigger-recovery-loop

### UX-06: Context extraction boundary between "explicit" and "inferred" has uncovered edge cases

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6, template text)
- Lines: 329-337
- Claim: The context extraction table gives three examples but leaves many common inputs unspecified.
- Evidence: Line 335 shows "restaurante" is inferred as vertical and NOT saved. But what about "quiero un post para mi curso de Python"? — "curso de Python" could be `copy` text, `audiencia` description, or inferred `vertical` (Educación). The rule "Solo campos explícitamente provistos" depends on the agent's interpretation of what counts as "explicit". The prohibition on inference (line 330: "PROHIBIDO inferir") contradicts the agent's need to map natural language to field IDs.
- Impact: Different agents will make different extraction decisions for the same input. Some will save "curso" as vertical (seeing it as explicit), others won't. Inconsistent behavior across sessions or agents.
- Recommendation: Either (a) expand the table to cover at least 2-3 more edge cases involving ambiguous multi-field language, or (b) add a fallback rule: "If uncertain whether a piece of information maps to a specific field, do NOT save it — let the structured question flow collect it instead."
- Suggested test: User says "landing page para mi negocio de ropa, colores vivos". Verify that at minimum `paleta: "colores vivos"` is saved, and that "ropa" / "negocio de ropa" is not saved as vertical (since it's not an exact option match and would require inference).
- Dedup key: context-extraction-edge-cases-underspecified

### UX-07: `reset-confirmation` UX warning about mockup invalidation is in Notes but not in template

- Severity: P3
- Category: docs
- Status: valid
- File: target.md (Section 6 template and Notes)
- Lines: 391-396, 546
- Claim: The template correctly includes the warning about mockup invalidation (line 391-392). However, the `reset-confirmation` CLI human-mode output (Section 5, line 315) only says "imprime confirmación de desbloqueo + nuevo estado" — it does not include a warning about stale mockup.
- Evidence: Line 315 says `reset-confirmation` human output is "confirmación de desbloqueo + nuevo estado". Lines 285-286 say it renames `mockup.html` to `.stale`. But the CLI output description does not mention informing the user that a mockup was staled. The template (line 391-392) warns the user *before* reset, but after reset the CLI output itself is silent about the stale file.
- Impact: If an agent or user invokes `reset-confirmation` directly via CLI (not through the template flow), they will not be informed that a mockup was staled. The stale file exists but is not surfaced.
- Recommendation: Add to Section 5: `reset-confirmation` human output should include "⚠️ mockup.html renombrado a mockup.html.stale.<timestamp>" when a mockup existed.
- Suggested test: Create a plan with a mockup.html, run `reset-confirmation` (no `--json`), verify stdout mentions the stale rename.
- Dedup key: reset-confirmation-cli-stale-not-reported

### UX-08: Error table `GSDC_INVALID_STATE` recovery conflates `questions()` and `answer()` paths

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6, error table)
- Lines: 372
- Claim: The error table entry for exit 13 says "Ejecutar `plan status` y explicar al usuario el estado actual. Si el estado es `ready_for_html` o `pending_approval`, sugerir `reset-confirmation`." But `questions()` does not throw exit 13 for these states — it returns `readOnly: true`. This error is only thrown by `answer()`.
- Evidence: Line 232 says unrecognized state → exit 13. Lines 230-231 show `ready_for_html`/`pending_approval` return readOnly, not an error. `answer()` (line 269) throws exit 13 for wrong state. The error table applies to both commands but the recovery instructions are written as if any exit 13 could come from either.
- Impact: Low — an agent getting exit 13 from `answer()` will follow the correct recovery (check status, suggest reset). But the table is misleading because it implies `questions()` can also throw this error for those states, when it cannot. An implementer might add exit 13 handling to `questions()` unnecessarily.
- Recommendation: Split the error table into per-command sections, or add a note: "Note: `questions()` returns `readOnly: true` for `ready_for_html`/`pending_approval` instead of throwing this error."
- Suggested test: Call `questions()` on a plan in `ready_for_html`. Verify it returns `readOnly: true` and does NOT throw exit 13.
- Dedup key: error-table-invalid-state-questions-vs-answer

## Non-Iissues Checked

- Placeholder detection migration from `includes()` to `===` (exact match) — unambiguous, "Nodo" no longer false-positive. Well-specified.
- `optionalAnswered` clearing on `reset-confirmation` — intentional re-asking of optional questions is documented in Notes (line 544).
- "Otro (personalizado)" sentinel with `value: ""` and `customFollowUp` — clear contract, explicit prohibition on saving the sentinel string (line 350).
- Lock acquisition order (acquire → read → validate → write → release in finally) — consistent across all functions, no deadlock risk in single-process model.
- `FIELD_REGISTRY` as single source of truth — prevents drift between `questions()`, `answer()`, and `getEmptyFields()`.
- Double-wrap prevention (`handleSuccess()` wrapping raw manager data) — explicitly tested (verification step 13).
- Idempotency of `reset-confirmation` — well-specified with partial recovery cases.
- Breaking change documentation for exit code migration (15→24) — explicitly called out with verification step.

## Residual Risks

- The `requiredFieldsComplete` transition (UX-01) could cause agents to loop indefinitely if they always re-call `plan questions` instead of checking the `answer()` response flags — no hard limit on question cycles is specified.
- Fuzzy matching for choice fields (UX-04) will produce inconsistent agent behavior until a rule is added — different model providers may handle this differently.
- The strict "confirmo" trigger (UX-05) may cause user frustration in Spanish-speaking contexts where pleasantries are culturally expected alongside confirmations — this is a UX judgment call that may need iteration based on real usage.
- Context extraction (UX-06) will produce inconsistent behavior across agents for ambiguous inputs — the fallback rule "when in doubt, don't save" mitigates but doesn't eliminate this.
