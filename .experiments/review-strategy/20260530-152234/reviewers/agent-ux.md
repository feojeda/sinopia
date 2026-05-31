# Review: agent-ux

## Summary

- Verdict: approve_with_changes
- Top risk: `questions()` returning `pending: []` for confirmed-but-unresolved state will cause agents to misinterpret the flow and skip prompting, breaking the main interactive loop.
- Confidence: high

## Findings

### UX-01: `questions()` returns `pending: []` when confirmed but unresolved — agent misinterprets as "nothing to ask"

- Severity: P1
- Category: ux
- Status: valid
- File: target.md
- Lines: 231-233, 487, 585
- Claim: When the plan is in `questions_pending` with `confirmed: true` (between `confirm-decisions` and `resolve-questions`), `questions()` returns `pending: []`, `readOnly: true`, `confirmed: true`. The note says "esto es intencional" and the agent should check `confirmed` before interpreting `pending`.
- Evidence: target.md:487 — test case "questions() confirmed pending masking: llenar 5/6 requeridos, confirmar → pending.length === 0 AND confirmed === true AND readOnly === true (intencional)." target.md:585 — "questions() retorna pending: [] cuando confirmed: true independientemente del estado real de campos — esto es intencional: el consumidor debe verificar confirmed antes de interpretar pending."
- Impact: An agent that does not guard on `confirmed` will see `pending: []` and either (a) tell the user "all questions answered" when 5/6 required fields are complete, or (b) skip to the next phase without resolve. The JSON shape `pending: []` semantically means "no pending questions" in every other context, making this a footgun for any consumer. The plan documents it in Notes, but Notes are not a runtime guard.
- Recommendation: Either (a) include a top-level `"reason": "confirmed_pending_resolve"` when masking pending, giving the agent an explicit signal, or (b) do not mask `pending` — return the real list with `readOnly: true` so the agent can display what was confirmed. Option (a) is less disruptive to existing semantics.
- Suggested test: Agent template test: call `questions()` on confirmed-but-unresolved plan → assert agent message contains "confirmed, awaiting resolve" and does NOT say "all questions answered."
- Dedup key: questions-pending-empty-mask-on-confirmed

### UX-02: Confirmation prompt rejects "confirmar" but the rejection message uses "confirmar" as instruction

- Severity: P2
- Category: ux
- Status: valid
- File: target.md
- Lines: 405
- Claim: The confirmation parsing regex `/\bconfirmo\b/i` rejects "confirmar" (infinitive form). The fallback message is "Para confirmar, responde con una frase que incluya 'confirmo'." — using "confirmar" to instruct the user to say "confirmo."
- Evidence: target.md:405 — "Parsing: `/\bconfirmo\b/i.test(userInput.trim())` — acepta 'confirmo', 'sí confirmo', 'confirmo gracias'. Negation check: Si el input contiene 'no confirmo' → rechazar. 'confirmar' → rechazar (no es 'confirmo'). Si no match → 'Para confirmar, responde con una frase que incluya confirmo.'"
- Impact: A Spanish-speaking user naturally writes "confirmar" (infinitive) or "lo confirmo" or "confirmado." The regex only accepts the first-person present form. The rejection message itself uses the infinitive "confirmar," creating a cognitive mismatch — the system tells the user to "confirmar" but rejects it when they try. This will cause repeated failed attempts and user frustration.
- Recommendation: Either accept both "confirmo" and "confirmar" in the regex, or change the prompt to use the accepted form: "Responde con una frase que incluya 'confirmo' (ej: 'sí, confirmo')." Also consider accepting "confirmado" as a past participle form. At minimum, the rejection message must not use a word that is itself rejected.
- Suggested test: Behavioral test: user says "confirmar" → rejected with message that does NOT contain the word "confirmar" as an instruction, or alternatively "confirmar" is accepted.
- Dedup key: confirmo-rejects-confirmar-but-message-uses-confirmar

### UX-03: Multi-field answer discards all valid inputs when count mismatches pending fields

- Severity: P2
- Category: ux
- Status: valid
- File: target.md
- Lines: 367-372
- Claim: Step 2 of the multi-field rule says "Si cantidad no coincide con campos pendientes → no guardar nada, pedir aclaración." If the user provides 3 answers for 4 pending fields, all 3 valid answers are discarded.
- Evidence: target.md:369 — "Si cantidad no coincide con campos pendientes → no guardar nada, pedir aclaración"
- Impact: A user who provides 3 correct answers along with an unclear fourth response loses all 3 valid answers. The agent asks again from scratch, wasting user effort. Users learn not to batch answers, defeating the multi-field feature.
- Recommendation: Change rule to: "Si quantity exceeds pending count → no guardar nada, pedir aclaración. Si quantity is less than pending count → guardar los mapeos exitosos, preguntar por los restantes." This preserves user effort while still handling ambiguity.
- Suggested test: Agent simulation: 4 pending fields, user provides 3 valid answers → agent saves 3, asks for remaining 1.
- Dedup key: multi-field-discard-all-on-count-mismatch

### UX-04: `answer()` empty-value warning is a response body field — agents can easily miss it

- Severity: P2
- Category: ux
- Status: valid
- File: target.md
- Lines: 251, 380
- Claim: When an empty value is submitted for a required choice field, `answer()` succeeds (exit 0) and includes `"warning": "empty_value_for_required_choice"` in the JSON response. The agent must check this warning field to detect the problem.
- Evidence: target.md:251 — "Si value es '' y campo es required: true → aceptar pero incluir 'warning': 'empty_value_for_required_choice' en la respuesta (no fallar — requiredFieldsComplete será false)." target.md:380 — "Si la respuesta contiene 'warning': 'empty_value_for_required_choice' → re-preguntar ese campo inmediatamente."
- Impact: An agent that only checks exit code and `requiredFieldsComplete` will see success, see `requiredFieldsComplete: false`, and proceed to the next pending question — but the field was recorded as empty. The user never gets re-prompted for that specific field. The only recovery is when the agent calls `questions()` again and sees the field still pending, but there's no guarantee the agent does this. The warning is structurally invisible to agents that only branch on exit codes.
- Recommendation: Consider returning a non-zero exit code (e.g., a soft error or a specific exit code for "accepted but needs attention") OR elevate the warning to a top-level `"status": "accepted_with_warning"` field that agents are more likely to check. Alternatively, make the template instruction a hard rule: "After every `answer()`, check for `warning` field before proceeding."
- Suggested test: Agent simulation: call `answer(vertical, "")` → agent detects warning → re-prompts user for vertical.
- Dedup key: answer-empty-required-choice-warning-not-exit-code

### UX-05: Error code 26 (`GSDC_INVALID_CHOICE_VALUE`) covers three distinct failure modes with same exit code — no programmatic disambiguation

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md
- Lines: 252-255, 533-540
- Claim: Exit code 26 is used for: (1) numeric-only values, (2) literal "Otro (personalizado)" string, (3) values not matching any option for non-custom fields. Each case has a different recovery path for the agent, but the exit code is identical.
- Evidence: target.md:252-255 — three different conditions all mapped to exit 26. target.md:393 — error table has a single row for exit 26: "Valor no válido para campo choice. Ver opciones."
- Impact: An agent receiving exit 26 must parse the human-readable error message to determine which recovery action to take. There is no structured error code or JSON field to distinguish the cases programmatically. If the agent just shows "opciones válidas" for all three cases, it gives misleading guidance — telling the user to pick from a list when they typed "3" (should be told "use the text label") or when they typed "Otro (personalizado)" (should be told to provide the custom value directly).
- Recommendation: Add a `reason` or `subcode` field to the error response JSON: `"subcode": "numeric_value"` | `"otro_literal"` | `"not_in_options"`. This allows agents to tailor recovery messaging without parsing free-text error descriptions.
- Suggested test: Call `answer(vertical, "3")` → assert error JSON contains `subcode: "numeric_value"`. Call `answer(vertical, "Otro (personalizado)")` → assert `subcode: "otro_literal"`.
- Dedup key: exit-26-three-failure-modes-no-subcode

### UX-06: `readOnly: true` + `confirmed: false` state combination has no explicit agent guidance

- Severity: P2
- Category: ux
- Status: valid
- File: target.md
- Lines: 232-233, 360-361
- Claim: The template covers `readOnly: true` + `confirmed: true` scenarios (suggest `reset-confirmation`) and `approved` scenarios (suggest new plan). But `readOnly: true` + `confirmed: false` is possible in post-`questions_pending` states (e.g., `ready_for_html` where the plan transitioned but confirmation was somehow cleared, or after a partial reset). There is no explicit agent instruction for this combination.
- Evidence: target.md:232 — post-questions_pending states return `readOnly: true` with `confirmed` reflecting actual state. target.md:360-361 — template only covers `confirmed: true` paths and `approved` paths.
- Impact: An agent encountering `readOnly: true, confirmed: false` has no prescribed action. It might attempt `reset-confirmation` (which could fail on state), or tell the user nothing can be done, or get stuck in a loop. This is a gap in the interactive flow specification.
- Recommendation: Add an explicit row in the template's error/state table: `readOnly: true + confirmed: false` → suggest `plan status` for diagnosis + `reset-confirmation` if state allows it.
- Suggested test: Agent simulation: plan in `ready_for_html` with `confirmed: false` → agent shows status and suggests recovery path.
- Dedup key: readonly-true-confirmed-false-no-agent-guidance

### UX-07: "Otro (personalizado)" option has `value: ""` — agent must match by label, not value

- Severity: P2
- Category: ux
- Status: valid
- File: target.md
- Lines: 157, 365-366, 372
- Claim: The "Otro (personalizado)" option in the JSON has `value: ""`. The template says "número → value de opción" for mapping. An agent that maps user input to option `value` will see empty string for "Otro" and cannot distinguish it from "no selection." The agent must match by `label`, but this is never explicitly stated.
- Evidence: target.md:157 — `"Otro (personalizado)", "value": "", "customFollowUp": "Escribe tu opción personalizada:"`. target.md:365 — "Mapeo numérico: número → value de opción. --value siempre texto final."
- Impact: An agent that follows the "número → value" rule literally will try to pass `""` as the value to `plan answer`, which triggers the empty-required-choice warning. The user selected a valid option but the agent misinterprets the selection. The instruction at target.md:372 says "PROHIBIDO guardar 'Otro (personalizado)'" but doesn't say how to detect it — the agent needs to know to match by `label`, not `value`.
- Recommendation: Add explicit instruction: "For 'Otro (personalizado)', match by `label` (value is empty). When detected, trigger `customFollowUp` and use the user's custom text as `--value`." Also consider setting `value: "__custom__"` or similar sentinel instead of empty string to make detection unambiguous.
- Suggested test: Agent simulation: user selects option 9 (Otro) → agent detects via label, prompts customFollowUp, passes custom text to `plan answer`.
- Dedup key: otro-option-empty-value-label-matching-ambiguity

### UX-08: `optionalAnswered` is not exposed in `questions()` output — agent cannot distinguish "answered with empty" from "never asked"

- Severity: P3
- Category: ux
- Status: valid
- File: target.md
- Lines: 123, 218-223
- Claim: The `questions()` output includes `optionalPendingCount` but does not expose which optional fields have `optionalAnswered[field] = true`. After the agent calls `answer(assets, "")` (user declines assets), `optionalPendingCount` becomes 0, but the agent has no way to confirm from `questions()` alone that assets was explicitly declined vs never asked.
- Evidence: target.md:123 — "optionalAnswered: Se set optionalAnswered[field] = true para toda respuesta a campo opcional (vacío o no)." The `questions()` JSON output at target.md:129-224 does not include any `optionalAnswered` or per-field answered status.
- Impact: If the agent's context resets or it re-enters the flow, it calls `questions()`, sees `optionalPendingCount: 0`, and proceeds. But it can't tell the user "you previously declined assets" vs "all questions answered." This is minor since the count is correct, but it prevents the agent from giving informative context to the user during re-entry.
- Recommendation: Add `"optionalAnsweredStatus": {"assets": true}` or similar to the `questions()` output, or include `"answeredDeclined": ["assets"]` in the response.
- Suggested test: After `answer(assets, "")`, call `questions()` → assert output indicates assets was explicitly answered.
- Dedup key: optional-answered-not-exposed-in-questions-output

### UX-09: Asymmetric reset behavior — required preserved, optional cleared — with no user-facing explanation

- Severity: P3
- Category: ux
- Status: valid
- File: target.md
- Lines: 292, 504
- Claim: `resetConfirmation()` preserves all required field values but clears optional field values and `optionalAnswered`. The agent template at the reset step says "reset-confirmation → plan answer → nueva confirmación" but does not instruct the agent to inform the user that optional answers were cleared while required answers were preserved.
- Evidence: target.md:292 — "Campos requeridos se preservan — vertical, formato, audiencia, paleta, copy, cta mantienen sus valores." target.md:504 — test confirms assets cleared. target.md:412 — "Si confirma: reset-confirmation → plan answer → nueva confirmación" — no mention of informing user about asymmetric clearing.
- Impact: A user who had filled both required and optional fields, then triggers reset, will see their required answers intact but assets gone. Without the agent explaining this, the user might assume everything was preserved or everything was cleared, leading to confusion about what needs re-entry.
- Recommendation: Add to the template: after reset, inform user "Required answers were preserved. Optional answers (assets) were cleared and will need to be re-provided."
- Suggested test: Agent simulation: plan with all fields filled + confirmed → reset → agent message mentions that optional answers were cleared.
- Dedup key: asymmetric-reset-no-user-explanation

## Non-Issues Checked

- **Exit code migration 15→24/25**: Clean migration path with pre-implementation grep audit. No UX ambiguity — old codes simply stop being used.
- **Placeholder detection `===` vs `includes()`**: Breaking change is clearly documented. The preexisting "Nodo" bug is fixed. Exact match is less surprising than substring.
- **Hash v1→v2 migration**: Automatic and atomic in `confirmDecisions()`. No user-facing impact — hashes are internal integrity checks.
- **Lock semantics**: Lock acquired before read, released in `finally`. No UX interaction with locks — they're transparent.
- **`ensureV2Fields()` not persisting in read-only functions**: Intentional and documented. First mutation persists. No agent-facing impact.
- **CLI `--json` mode**: `handleSuccess()` wraps consistently. No ambiguity in output format.
- **Idempotency of `reset-confirmation`**: Documented and tested. Re-execution is safe.
- **Error table catch-all row**: "Cualquier otro código → Detener flujo. Reportar error completo." is a safe default.

## Residual Risks

- The `pending: []` masking behavior when confirmed (UX-01) is the single highest-impact risk. Even with documentation, every new agent consumer must discover and handle this edge case. A runtime sentinel field would be more robust than documentation alone.
- Multi-field semantic mapping (UX-03) relies entirely on the agent's ability to map user language to field IDs. No structured mapping hints are provided in the API. The quality of the multi-field experience depends on agent implementation quality, not on CLI design.
- The confirmation regex (UX-02) is correct but the instruction-message mismatch will cause predictable user frustration in Spanish-speaking users until the message is fixed.
