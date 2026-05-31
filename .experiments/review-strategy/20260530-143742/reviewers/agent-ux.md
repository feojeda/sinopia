# Review: agent-ux

## Summary

- Verdict: approve_with_changes
- Top risk: `requiredFieldsComplete` transition logic causes agents to skip the optional assets question and jump directly to confirmation, breaking the intended interactive flow.
- Confidence: high

## Findings

### AGENT-UX-01: `requiredFieldsComplete` transition skips optional assets question

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (template section 2)
- Lines: 364-370
- Claim: The flow tells the agent to check `requiredFieldsComplete` after *every* `plan answer` call and "advance to confirmation" when true, but this causes the agent to skip the optional assets question that is specified earlier in the document.
- Evidence: Line 370 states: "Después de cada `plan answer`, revisa la respuesta. Si `requiredFieldsComplete === true`, avanza al paso de Revisión/Confirmación abajo." Line 364 specifies the assets question: "Si `optionalPendingCount > 0`, pregunta si el usuario quiere proveer assets." When the 6th required field is answered, `requiredFieldsComplete` flips to `true`, and the agent will jump to confirmation — never reaching the assets question. The document ordering (assets question at 364, transition logic at 365-370) implies assets is asked first, but the imperative "después de cada plan answer" overrides this.
- Impact: Agents will never ask the optional assets question. Users who want to provide logos or fonts lose the opportunity without realizing it. The `optionalPendingCount` remains 1 but the agent has already moved past the question phase.
- Recommendation: Change the transition logic to: "After each `plan answer`, if `requiredFieldsComplete === true` AND `optionalPendingCount === 0`, advance to confirmation. If `requiredFieldsComplete === true` AND `optionalPendingCount > 0`, ask the optional assets question first, then advance." Alternatively, restructure the flow to: (1) ask all required, (2) ask optional, (3) then confirm.
- Suggested test: Integration test: answer all 6 required fields, verify agent flow does NOT advance to confirmation until assets question is handled. Test with `optionalPendingCount > 0` after `requiredFieldsComplete === true`.
- Dedup key: requiredFieldsComplete-skips-optional-assets

### AGENT-UX-02: Multi-field response parsing is underspecified for agent implementation

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (template section 2)
- Lines: 361
- Claim: The instruction "extrae cada par campo-valor y ejecuta `plan answer` para cada uno" is insufficient for agents to correctly parse multi-value responses like "SaaS, Instagram Post, jóvenes".
- Evidence: Line 361 gives one example but defines neither: (a) how to map comma-separated values to specific fields when the count doesn't match the pending count, (b) what "ambiguo" means concretely (is "SaaS" ambiguous because it could map to vertical?), (c) whether to save successfully-parsed fields before asking for clarification on ambiguous ones (partial save vs all-or-nothing). An agent receiving "SaaS, Instagram Post, jóvenes" with 4 pending fields must guess which 3 of the 4 fields these map to.
- Impact: Different agent implementations will parse multi-value inputs differently. Some will map by position (first value = first pending field), others by semantic matching. Some will save partial results before asking for clarification, creating partial state. Inconsistent behavior across sessions.
- Recommendation: Specify: (1) map by semantic match to field question/option, not by position; (2) if count mismatches, save nothing and ask for clarification; (3) if any individual mapping is uncertain, skip that one and ask; (4) save fields one at a time (already called out via "secuencialmente") so partial state is acceptable as long as each individual save is unambiguous.
- Suggested test: Template review — verify the instruction produces identical behavior across two independent agent implementations for inputs: "SaaS, Instagram Post" (2 of 6 pending), "restaurante, azul" (2 ambiguous fields), "SaaS" (1 clear field).
- Dedup key: multi-field-parsing-underspecified

### AGENT-UX-03: Choice field value validation absent from `answer()` — invalid values saved silently

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (section 3)
- Lines: 241
- Claim: `answer()` validates that the field ID is in `ALL_FIELDS` but does not validate that the value matches a predefined option for `choice`-type fields, allowing agents to save semantically invalid values.
- Evidence: Line 241 states: "Valida que `field` esté en `ALL_FIELDS`" — this is the only validation listed. No validation of `value` against `FIELD_REGISTRY[id].options` for choice fields. The template at line 362 instructs agents not to pass free text, but this is a template-level prohibition with no programmatic enforcement. An agent sending `--field vertical --value "SaaS/Producto Digital"` (missing spaces) or `--field cta --value "Comprar"` (partial match) would have it saved without error.
- Impact: Invalid choice values get saved to `decisions.json`, included in the hash, and used for mockup generation. The error is only detectable by humans reviewing the final output. No programmatic recovery path exists — the agent wouldn't even know the value is wrong.
- Recommendation: Add validation in `answer()`: for fields where `FIELD_REGISTRY[id].type === 'choice'`, validate that `value` either matches one of the predefined option values (case-insensitive) or the field has `allowCustom: true`. Reject with a new error code (e.g., `GSDC_INVALID_CHOICE_VALUE`, exit 26) listing valid options. This also protects against the "Otro" literal problem (AGENT-UX-08).
- Suggested test: `answer(planId, 'vertical', 'SaaS/Producto Digital')` → exit 26 with valid options listed. `answer(planId, 'vertical', 'SaaS / Producto Digital')` → success. `answer(planId, 'vertical', 'My Custom Vertical')` → success (allowCustom).
- Dedup key: answer-no-choice-value-validation

### AGENT-UX-04: No retry guidance for `reset-confirmation` partial failures in agent template

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (sections 4 and 6)
- Lines: 291-294, 372-382
- Claim: The plan documents partial failure recovery paths for `resetConfirmation()` (lines 291-294) but the agent error-handling table (lines 373-382) does not mention `reset-confirmation` failures at all, so the agent has no instruction to retry.
- Evidence: Lines 291-294 explain that re-executing `resetConfirmation()` after a partial failure proceeds from the failed step. But the error table at lines 373-382 only covers errors from `plan answer` and `plan questions`. There is no row for `reset-confirmation` errors. If `resetConfirmation()` crashes mid-execution (e.g., EPERM on rename, disk full), the agent receives an unhandled error and will report failure to the user instead of retrying.
- Impact: A transient failure during reset leaves the plan in an intermediate state that is recoverable by design, but the agent doesn't know to retry. The user sees a failure message and may attempt manual intervention or create a new plan unnecessarily.
- Recommendation: Add a row to the error table: "| `reset-confirmation` any error | Retry once. If retry fails, ejecutar `plan status` y reportar estado al usuario con nota de posible estado intermedio. |" Also add a note that `reset-confirmation` is idempotent and safe to retry.
- Suggested test: Simulate `resetConfirmation()` failure after step 4 (decisions.json written). Agent template should instruct retry. Verify second call succeeds and produces correct state.
- Dedup key: reset-confirmation-no-retry-guidance

### AGENT-UX-05: Fuzzy matching algorithm for choice fields is unspecified

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (template section 2)
- Lines: 362
- Claim: "Muestra las opciones más cercanas" is undefined — different agents will implement different matching strategies.
- Evidence: Line 362 says "Si el texto del usuario no coincide exactamente con un `value` (case-insensitive), muestra las opciones más cercanas o la lista completa numerada para confirmar." "Opciones más cercanas" could mean: substring match, Levenshtein distance, token overlap, or just re-showing all options. An agent might show 1 close option or 8. The fallback "o la lista completa" makes it unclear whether showing closest is preferred or equivalent.
- Impact: Inconsistent agent behavior. One agent shows "Did you mean 'Comprar Ahora'?" for input "comprar"; another shows all 6 CTA options. Both comply with the spec but produce different UX.
- Recommendation: Specify a concrete strategy: "If the input is a case-insensitive substring of exactly one option value, show that option for confirmation. Otherwise, show the full numbered list." This is simple, deterministic, and implementable without NLP.
- Suggested test: Input "comprar" → agent shows single match "Comprar Ahora?" for confirmation. Input "instagram" when it matches 2 options → agent shows full list.
- Dedup key: fuzzy-matching-unspecified

### AGENT-UX-06: "confirmo" parsing rejects natural trailing punctuation and filler

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (template section 2)
- Lines: 392
- Claim: The strict "confirmo"-only rule rejects natural responses like "confirmo." or "confirmo!" or "sí, confirmo" which users will commonly type.
- Evidence: Line 392 says only `"confirmo"` (case-insensitive, trimmed) counts. "confirmo, gracias" triggers a redirect message. But "confirmo." (with period) or "confirmo!" (with exclamation) also contain "additional text" and would trigger the same redirect. The plan does handle "contains confirmo + additional text" by asking for just "confirmo" — but users who type these natural variants will experience a confusing rejection cycle, especially since the prompt is in Spanish where trailing punctuation is common.
- Impact: Minor user frustration. Users must make a second attempt to confirm. Not data-breaking, but reduces trust in the system's intelligence.
- Recommendation: Strip common trailing punctuation (`.`, `!`, `,`) before the exact-match check. The instruction becomes: "Trim whitespace and trailing `.`, `!`, `,`, then case-insensitive exact match against 'confirmo'."
- Suggested test: "confirmo." → accepted. "confirmo!" → accepted. "confirmo, gracias" → rejected with clarification prompt. "confirmo" → accepted.
- Dedup key: confirmo-trailing-punctuation-rejection

### AGENT-UX-07: No catch-all error instruction for unexpected exit codes

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (template section 2)
- Lines: 372-382
- Claim: The error table covers exit codes 13, 15, 21-25 but provides no instruction for unlisted exit codes (e.g., exit 1 for generic Node.js errors, exit 126 for permission denied, exit SIGTERM).
- Evidence: The error handling table at lines 373-382 lists exactly 7 error codes. If `plan answer` crashes with exit 1 (unhandled exception), the agent has no prescribed action. The agent might: ignore it, retry indefinitely, or show the raw error. None of these are correct.
- Impact: Agent behavior is undefined for unexpected errors. In production, this covers real scenarios: out-of-disk-space, permission changes, corrupted Node modules.
- Recommendation: Add a catch-all row: "| Cualquier otro código de error | Detener flujo. Reportar el error completo al usuario. Sugerir ejecutar `plan status` para diagnosticar. |"
- Suggested test: Simulate `plan answer` returning exit code 1 with stderr "EACCES: permission denied". Agent should stop, report error, suggest `plan status`.
- Dedup key: no-catch-all-error-handling

### AGENT-UX-08: "Otro (personalizado)" — no programmatic guard against saving literal "Otro"

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (sections 2 and 3)
- Lines: 363, 241
- Claim: The template prohibits saving "Otro" as a value (line 363), but `answer()` has no validation to prevent it, so a misbehaving agent can save the literal string "Otro" as a valid field value.
- Evidence: Line 363 says "PROHIBIDO guardar 'Otro' o un índice como valor." Line 241 shows `answer()` only validates field ID. There is no check against the string "Otro" or numeric-only values. An agent that doesn't implement the two-step customFollowUp flow could save `vertical: "Otro"` and it would be accepted.
- Impact: "Otro" as a field value is semantically meaningless for mockup generation. The user's actual intent is lost. This is only recoverable via `reset-confirmation`.
- Recommendation: If AGENT-UX-03 is accepted (choice validation in `answer()`), this is largely mitigated — "Otro" wouldn't match any option value and would be rejected unless the field allows custom. If AGENT-UX-03 is rejected, add a specific check: reject values that exactly match "Otro (personalizado)" or are pure numeric strings for choice-type fields.
- Suggested test: `answer(planId, 'vertical', 'Otro (personalizado)')` → rejected. `answer(planId, 'vertical', '3')` → rejected (literal index). `answer(planId, 'vertical', 'Mi Vertical Custom')` → accepted.
- Dedup key: otro-literal-no-programmatic-guard

## Non-Issues Checked

- **Confirmation case-insensitivity**: "CONFIRMO" and "Confirmo" are explicitly handled via case-insensitive matching. No issue.
- **Read-only state includes status**: The `questions()` response includes `"status"` field (line 130), so agents can determine the current state and give correct guidance for reset vs new-plan suggestions. No issue.
- **Error code uniqueness**: Exit codes 22-25 are new and don't collide with existing codes 13, 15, 20, 21. No issue.
- **Placeholder detection**: Migration from `includes()` to `===` comparison (line 108) fixes the known "Nodo" bug. The new detection is correct. No issue.
- **Lock semantics**: `questions()` acquires lock before read (line 230), `answer()` acquires before write (line 242). Consistent pattern. No issue.
- **`ensureV2Fields()` backward compatibility**: V1.1 plans without `optionalAnswered` or `assets` are normalized before any operation. Prevents TypeError. No issue.
- **`readOnly` behavior for `approved` state**: `questions()` returns read-only without error for approved plans (line 228). Agent can inspect without crash. No issue.
- **Context extraction fallback**: "Ante duda, no guardes" (line 347) is a conservative rule that may cause redundant questions but is safe. No issue — this is a deliberate trade-off.
- **Error table note about `questions()` not throwing exit 13**: Line 382 explicitly clarifies this. No ambiguity.

## Residual Risks

- The multi-field parsing ambiguity (AGENT-UX-02) is hard to fully specify without constraining agent behavior excessively. Even with clearer rules, semantic interpretation of natural language will vary across agent implementations. This is inherent to the prompt-based approach.
- The `requiredFieldsComplete` / `allQuestionsAnswered` flag pair (AGENT-UX-01) creates a two-phase gate that could confuse future feature additions if more optional fields are added beyond `assets`.
- No specification exists for how the agent should handle a user who abandons mid-flow (stops responding). Should the agent call `plan status` and summarize? Leave state as-is? This is out of scope but could affect real sessions.
- The error table does not include exit code 19 (`GSDC_QUESTIONS_UNRESOLVED`) — this code exists in the current codebase and may still be thrown by `confirmDecisions()` or `resolveQuestions()`. The template should cover it or confirm it's being removed.
