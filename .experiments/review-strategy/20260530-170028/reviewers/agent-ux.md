# Agent UX Review - /review-strategy 2

## Findings

### High - Antigravity usage conflicts with CLI human output
- **Evidence:** The plan says Antigravity must provide the automatic free-text "Other" and the agent must never add manual "Otro"/"Opción personalizada". Later, CLI human output for `plan questions` explicitly renders `9) Otro (personalizado)`.
- **Impact:** Agents can copy the human CLI rendering into Antigravity or treat "Otro" as a real option, causing `answer()` to reject `"Opción personalizada"` or save ambiguous custom values.
- **Required change:** Make the CLI human rendering clearly fallback-only and forbid using it as the source for Antigravity options. Prefer removing manual "Otro" from CLI output or labeling it "fallback UI only; not present in JSON/options".
- **Suggested test:** Assert `plan questions --json` choice options contain no custom/other labels, and add a template compliance test that the Antigravity example options are exactly JSON registry options without appended fallback choices.

### High - Reset UX says required fields are preserved but cannot be edited
- **Evidence:** Post-confirmation correction says reset preserves required fields and then: "Para cambiar requeridos, usa `plan answer`." But after reset, required fields remain filled, so `plan questions` pending only includes `assets`; the flow does not define how the agent should ask which preserved required fields the user wants to edit.
- **Impact:** A user trying to fix `copy`, `cta`, or `paleta` after confirmation may be shown only the optional assets question, while the agent believes the plan is complete and asks for confirmation again.
- **Required change:** Add an explicit post-reset edit mode: ask which preserved required fields to change, call `plan answer` for those fields, then re-run `plan questions`. Alternatively add a CLI flag/command to clear selected fields during reset.
- **Suggested test:** Simulate confirmed plan with all fields filled, user says "change CTA"; after `reset-confirmation`, verify template flow asks for/selects `cta` and writes the new value before re-confirming.

### High - Confirmation parsing accepts contradictory confirmations
- **Evidence:** Verification and notes mark `"claro que no, confirmo"` as accepted, because only direct `"no confirmo"` / `"no lo confirmo"` is rejected.
- **Impact:** A user can express negation or hesitation and still trigger irreversible confirmation/resolve flow, including later mockup generation.
- **Required change:** Treat any input containing `no` before `confirmo/confirmado` in the same clause, or containing edit/change intent, as non-confirmation requiring clarification.
- **Suggested test:** Add negative cases for `"claro que no, confirmo"`, `"no, espera, confirmo luego"`, and `"confirmo pero quiero cambiar el CTA"`; verify no confirm command runs.

### Medium - Text-field `ask_question` shape may be invalid or misleading
- **Evidence:** The template says text fields use `ask_question` with `options: []`, or "una sola opción placeholder". It does not define whether Antigravity supports empty options, placeholder-only options, or free-text-only questions.
- **Impact:** Agents may provide placeholder text as a selectable answer, then save example content or trigger placeholder rejection. In environments where `ask_question` requires options, the flow may fail without a recovery path.
- **Required change:** Specify the exact accepted Antigravity payload for free-text questions. If empty options are supported, forbid placeholder options. If not supported, define one safe option label and require text-free response handling that never saves the placeholder.
- **Suggested test:** Contract test/mock for text-field `ask_question` payloads: `audiencia`, `paleta`, `copy`, and `assets` must not save example placeholder strings as answers.

### Medium - Optional `assets` decline is under-specified
- **Evidence:** The plan says if the user says no to assets, run `plan answer --field assets --value ""`. It does not list accepted decline phrases, how to distinguish "no logo but use stock photos", or how Antigravity free text should be interpreted.
- **Impact:** Agents may over-save "no" as literal asset text, leave assets pending, or incorrectly clear useful partial asset instructions.
- **Required change:** Define decline parsing for optional fields: direct negatives (`no`, `ninguno`, `sin assets`, etc.) map to empty string and set `optionalAnswered`; mixed answers are saved verbatim only when they include actual asset guidance.
- **Suggested test:** Verify `"no"`, `"ninguno"`, and `"sin logos"` set `assets: ""` with `optionalAnswered.assets === true`; verify `"sin logo, usa Montserrat"` stores the useful instruction.

### Medium - Error recovery asks the agent to reset too aggressively
- **Evidence:** Error table says `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` should execute `reset-confirmation` and repeat. Confirmation failure recovery also resets after repeated resolve failure.
- **Impact:** A hash mismatch could be caused by a real user edit, stale CLI state, or file corruption. Automatic reset can hide the cause and force reconfirmation without showing what changed.
- **Required change:** Before reset on hash/change errors, require showing a diff or at least a field-level summary of confirmed hash fields vs current values, then ask user whether to reset.
- **Suggested test:** Mutate `copy` after confirmation and trigger resolve; verify the template path surfaces the changed field and does not reset until the user authorizes it.

### Medium - `suggestedAction` handling includes impossible/confusing branch
- **Evidence:** In the `readOnly: true` block, the template includes `"ask_questions": Flujo normal de preguntas`, although normal ask flow requires `readOnly === false`. The same section says if `editable === false` or `readOnly === true`, do not use `ask_question`.
- **Impact:** Agents may follow the first branch and ask questions on a locked plan, then hit `GSDC_DECISIONS_LOCKED` or `GSDC_INVALID_STATE`.
- **Required change:** Remove `"ask_questions"` from the `readOnly: true` action list or state it is invalid when `readOnly` is true and should be treated as diagnostic inconsistency.
- **Suggested test:** Template lint/golden test for read-only responses: no path may call `ask_question` or `plan answer` when `readOnly === true`.

### Low - Multi-field semantic mapping is too permissive for user trust
- **Evidence:** Examples allow `"Instagram post azul para restaurante"` to auto-save `formato`, `paleta`, and `vertical` without confirmation, while the fallback rule says "Ante duda, NO guardes".
- **Impact:** Agents may infer an industry or format from casual words and persist wrong decisions before the user sees options.
- **Required change:** Require a quick confirmation for multi-field inferred mappings unless the user used exact option labels or explicit `Campo: valor` syntax.
- **Suggested test:** For `"banner azul para mi restaurante"`, verify only explicit `paleta` is saved and `vertical/formato` remain pending unless the user confirms the inferred mapping.

### Low - Error messages need user-facing next steps, not only codes
- **Evidence:** The error table mostly names CLI actions. Some branches say "Sugerir plan create" or "Reportar error completo" without user-facing wording or examples.
- **Impact:** Agents may expose raw implementation errors to end users, making recovery feel like a developer-only workflow.
- **Required change:** Add canonical user-facing messages for each common error, especially missing artifact, invalid choice, locked decisions, and JSON parse error.
- **Suggested test:** Snapshot template outputs for each error code and assert they include: what happened, whether data is preserved, and the next safe action.

