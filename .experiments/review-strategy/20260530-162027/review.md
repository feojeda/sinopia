# Review Consolidado: docs/PROPOSAL_v1.2_interactive_questions.md

## Meta

- Target: docs/PROPOSAL_v1.2_interactive_questions.md
- Estrategia: 2 — Default recomendado
- Reviewers: pragmatic, operator, modeler, agent-ux
- Fecha: 20260530-162027

## Summary

- Verdict: approve_with_changes
- Top risk: Template error table omits exit 19 (GSDC_QUESTIONS_UNRESOLVED) — a recoverable error that the agent would dead-end via the catch-all row instead of re-prompting the user for missing fields
- Confidence: high

## Findings

### C-01: Template error table omits GSDC_QUESTIONS_UNRESOLVED (exit 19)

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md (Section 6, template error table)
- Lines: 453–464
- Claim: The template error table lists exit codes 21, 22, 23, 24, 25, 26, 13, and 15, but omits exit 19 (`GSDC_QUESTIONS_UNRESOLVED`) which `confirmDecisions()` throws when required fields are empty or placeholder. The catch-all row ("Detener flujo") would handle it, producing a generic dead-end instead of actionable "re-prompt missing fields" guidance.
- Evidence: `confirmDecisions()` runs `getEmptyFields(decisions, REQUIRED_FIELDS)` and throws exit 19 (target.md:528). The error table (target.md:454–464) does not include code 19. A v1.1 plan migrated via `ensureV2Fields()` preserves existing placeholder values like "TBD" or "TODO". If an agent calls `confirm-decisions` in this state, exit 19 fires with no specific recovery instruction. Although the normal flow checks `requiredFieldsComplete` before calling confirm (making exit 19 unlikely), race conditions or migrated plans could trigger it.
- Impact: Agent hits "detener flujo" on a recoverable error. User sees a generic stop instead of being re-asked for the problematic field. Recovery requires manual intervention or agent restart.
- Recommendation: Add a row: `GSDC_QUESTIONS_UNRESOLVED (19) → Re-ejecutar plan questions --json. Mostrar campos pendientes. Re-preguntar. Re-intentar confirm-decisions.`
- Suggested test: Store `audiencia: "TBD"` via answer, fill remaining required fields, call `confirm-decisions` → verify agent template guidance leads to successful recovery (re-answer audiencia, re-confirm).
- Dedup key: template-error-table-missing-exit-19
- Sources: pragmatic:P-PRAG-01, modeler:M-01, agent-ux:AU-01

### C-02: Empty required text fields accepted without warning (asymmetric with choice fields)

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `answer()`)
- Lines: 278–283
- Claim: `answer()` returns `warning: "empty_value_for_required_choice"` when a required choice field receives an empty value, but returns no warning when a required text field (audiencia, paleta, copy) receives an empty value. An agent relying solely on the `warning` field would silently accept empty text values and proceed to confirmation.
- Evidence: Lines 278–283 define the warning exclusively for choice-type fields with `value === "" && required === true`. Line 447 instructs the agent to "Verificar siempre el campo warning en la respuesta." If the agent treats absence of warning as "field accepted as valid," it would proceed past empty text fields. `requiredPendingCount` does catch this, but the asymmetric signalling creates an implementation trap.
- Impact: Agent allows empty required text fields through, leading to a confusing `GSDC_QUESTIONS_UNRESOLVED` (exit 19) at confirm time instead of immediate re-prompt. The round-trip through confirm→reject→re-ask is wasteful and degrades UX.
- Recommendation: Emit `warning: "empty_value_for_required_field"` for ALL required fields when value is empty, regardless of type. Alternatively, add an explicit note in the template that `warning` absence does NOT mean the field is valid — `requiredFieldsComplete` is the authoritative signal.
- Suggested test: `answer(planId, 'audiencia', '')` → response contains `warning: "empty_value_for_required_field"`. Verify `requiredPendingCount` still counts audiencia as pending.
- Dedup key: answer-empty-required-text-no-warning
- Sources: operator:OP-01

### C-03: Modified existing functions lack explicit operation-ordering blocks

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 110, 528–530
- Claim: `confirmDecisions()`, `resolveQuestions()`, and `submitMockup()` are modified (ensureV2Fields insertion, hash v2 migration, REQUIRED_FIELDS replacement) but their lock acquisition, state validation, and full operation ordering are not restated. Only the new functions (questions, answer, resetConfirmation) get complete step-by-step sequences.
- Evidence: Lines 265, 284, and 339–346 specify complete operation sequences for the three new functions. Lines 110 and 528–530 only specify where ensureV2Fields is inserted ("después de state validation, antes de cualquier operación") and what changes to make. An implementer refactoring these functions could accidentally reorder operations or drop state checks if they treat the proposal as the complete specification rather than a diff.
- Impact: If ensureV2Fields() is placed before state validation, it could normalize a decisions.json from a plan in an invalid state, masking the state error. If placed after lock release, the in-memory migration would be lost.
- Recommendation: Add explicit operation-ordering blocks for `confirmDecisions()`, `resolveQuestions()`, and `submitMockup()` matching the detail level of lines 284 and 339–346, showing exactly where ensureV2Fields, REQUIRED_FIELDS, and hash dispatch fit relative to lock, state validation, and writes.
- Suggested test: For each modified function, a test that verifies ensureV2Fields is called after state validation by calling the function on a plan in an invalid state — should still exit 13, not succeed after normalizing.
- Dedup key: modified-functions-missing-operation-ordering
- Sources: operator:OP-02

### C-04: Custom choice value matching a placeholder string creates contradictory state

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 126–134, 281
- Claim: `answer()` accepts any value for a choice field with `allowCustom: true` that doesn't match an existing option. `getEmptyFields()` rejects exact matches against `['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR']`. A user who legitimately provides a custom value matching a placeholder (e.g., "TODO") would have it accepted by `answer()` but flagged as empty by `getEmptyFields()`.
- Evidence: Line 281: custom values accepted for allowCustom fields. Lines 130–131: `placeholders.some(p => upper === p)` rejects "TODO". So `answer(planId, 'vertical', 'TODO')` succeeds, stores `vertical: "TODO"`, but `requiredPendingCount` still shows vertical as pending and `confirmDecisions()` rejects with exit 19. Agent loops indefinitely: answer accepts → counters show pending → asks again → user confirms same value → loop.
- Impact: Agent enters an infinite re-ask loop for a value the system already accepted. The only escape is the user providing a different value, which they may not understand is needed since `answer()` returned success.
- Recommendation: Either (a) reject placeholder strings in `answer()` for ALL field types, returning exit 26 with `reason: "placeholder_value"`, or (b) explicitly document in the template that custom values matching placeholder strings are prohibited and the agent should re-prompt with explanation.
- Suggested test: `answer(planId, 'vertical', 'TODO')` → exit 26 with `reason: "placeholder_value"` (if option a). Current spec: answer succeeds, requiredPendingCount stays > 0.
- Dedup key: custom-choice-value-matches-placeholder
- Sources: operator:OP-03

### C-05: "confirmo" negation regex rejects legitimate confirmations

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md (Section 2, confirmation parsing)
- Lines: target.md:473
- Claim: The negation check `/\bno\s+.*\b(confirmo|confirmado)\b/i` is unanchored and matches natural language patterns where "no" refers to a different clause than the confirmation intent.
- Evidence: User says "claro que no [quiero cambiar nada], confirmo" — the regex matches `\bno\s+.*\bconfirmo\b` and rejects the input. The user intended full confirmation. The trade-off note at target.md:676 acknowledges false positives in the positive direction but does not address false negatives from the negation check.
- Impact: User legitimately trying to confirm is rejected with a prompt to include "confirmo" — which they already did. Frustrating loop. Agent cannot proceed without the user rephrasing.
- Recommendation: Anchor the negation check more tightly, e.g. `/\bno\s+(lo\s+)?(confirmo|confirmado)\b/i` to only match direct negation of the confirmation verb, not unrelated "no" in the same sentence. Alternatively, limit the gap between "no" and the keyword to max 2 words.
- Suggested test: Add to assertion table: "claro que no, confirmo" → should be accepted (currently would be rejected).
- Dedup key: confirmo-negation-regex-overbroad
- Sources: agent-ux:AU-02

### C-06: readOnly: true combined with real pending data creates agent footgun

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md (Section 2, question rendering)
- Lines: target.md:253–259, target.md:440
- Claim: When `questions()` returns `readOnly: true`, it also returns real `pending` and `filled` arrays with full data. An agent that processes the response sequentially (render pending → collect answers → call answer) may skip the `readOnly` check and enter the answer loop, which will fail with exit 13 or 23.
- Evidence: target.md:672 explicitly states questions() "retorna siempre valores reales" regardless of readOnly. The template at target.md:440 says "NO entrar al loop de answer()." Despite the prohibition, the JSON shape invites the error — the agent sees actionable-looking data with real field values and options.
- Impact: Agent enters answer loop on a locked plan, gets unexpected exit 13/23, falls through to error table recovery. User sees confusing error recovery instead of the intended suggestedAction guidance. Most likely with less capable agents or truncated templates.
- Recommendation: Add a top-level `"editable": false` field when `readOnly: true` (redundant but unambiguous). Alternatively, return `"pending": []` and `"filled": []` as empty arrays when `readOnly: true`, with a separate `"snapshot"` key for read-only display.
- Suggested test: Give an agent the readOnly questions response and verify it follows suggestedAction without calling answer().
- Dedup key: readonly-real-pending-data-footgun
- Sources: agent-ux:AU-03

### C-07: answer() field validation (exit 22) before state validation (exit 13) masks state errors

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 3)
- Lines: 284
- Claim: `answer()` validates `field ∈ ALL_FIELDS` (exit 22) before state (exit 13). When a plan is in an uneditable state (e.g., approved), calling `answer()` with an invalid field name returns exit 22 instead of exit 13. The agent's error recovery path then differs depending on which field was used.
- Evidence: Target line 284 specifies the order. For a plan in wrong state, a typo in the field name sends the agent down the "re-run questions" path instead of "check state" path. The agent might loop: re-run questions → get readOnly → suggest reset → reset → try again with same typo → exit 22 again. Documented and intentional (target.md:568).
- Impact: Minor debugging friction. Agent eventually discovers state issue when questions returns readOnly, but error recovery is misleading for the specific failure.
- Recommendation: Accept as-is (intentional). Consider adding a template note: "If exit 22 persists after re-running questions, check plan status."
- Suggested test: Already covered by test at line 568.
- Dedup key: answer-field-validation-before-state-validation
- Sources: pragmatic:P-PRAG-02, agent-ux:AU-08

### C-08: questions() error spec does not explicitly list corrupt or missing plan.json

- Severity: P3
- Category: cli-contract
- Status: valid
- File: target.md (Section 2)
- Lines: 249–261
- Claim: The `questions()` error behaviors list cases for `decisions.json` (corrupt → exit 15, missing → exit 25) but do not explicitly mention `plan.json` corrupt or missing scenarios. An implementer must infer that `readJsonOrThrow` applied to `plan.json` produces the same exit codes.
- Evidence: Lines 250–252 list three error cases, all about `decisions.json` or plan directory. `questions()` must read `plan.json` to determine state, but the error spec only addresses `decisions.json` paths.
- Impact: An implementer who only reads the `questions()` error case list might use `JSON.parse` directly for `plan.json` instead of `readJsonOrThrow`, producing unstructured errors on corrupt files.
- Recommendation: Add two lines to the `questions()` error behaviors: "plan.json corrupto → GSDC_JSON_PARSE_ERROR (exit 15)" and "plan.json faltante → GSDC_PLAN_ARTIFACT_MISSING (exit 25)".
- Suggested test: Fixture with corrupt `plan.json` → `questions()` → exit 15. Fixture with missing `plan.json` → `questions()` → exit 25.
- Dedup key: questions-missing-plan-json-error-spec
- Sources: pragmatic:P-PRAG-03

### C-09: No test verifying optionalAnsweredStatus update in answer() return value

- Severity: P3
- Category: testing
- Status: valid
- File: target.md (Section 11)
- Lines: 288–301
- Claim: The `answer()` return value includes `optionalAnsweredStatus`, and the spec states answering an optional field sets `optionalAnswered[field] = true`. But the test plan has no test verifying that `optionalAnsweredStatus` flips from `{"assets": false}` to `{"assets": true}` after answering an optional field.
- Evidence: Test list at lines 565–578 covers field validation, state checks, choice validation, canonical normalization, `requiredFieldsComplete`, and `optionalAnswered` guard — but no test asserts `optionalAnsweredStatus.assets === true` after `answer(assets, "Logo PNG")`. The reset test at line 590 verifies the negative case (`=== false`).
- Impact: If the implementer forgets to compute `optionalAnsweredStatus` in the `answer()` return, the agent would never see the status flip and might re-prompt for an already-answered optional field.
- Recommendation: Add test: `answer(assets, "Logo PNG")` → `response.optionalAnsweredStatus.assets === true`. Add test: `answer(assets, "")` → `response.optionalAnsweredStatus.assets === true` (declined still counts as answered).
- Suggested test: `answer(planId, 'assets', 'Logo PNG')` → assert `response.optionalAnsweredStatus.assets === true`. Also `answer(planId, 'assets', '')` → `response.optionalAnsweredStatus.assets === true`.
- Dedup key: answer-optionalAnsweredStatus-not-tested
- Sources: pragmatic:P-PRAG-04

### C-10: ensureV2Fields() uses ?? for hashAlgorithm — empty string after reset won't be upgraded

- Severity: P3
- Category: state
- Status: valid
- File: target.md (Section 1)
- Lines: 108, 339
- Claim: `resetConfirmation()` sets `hashAlgorithm = ""`. `ensureV2Fields()` uses `??` which does NOT replace empty strings (`"" ?? "sha256-decisions-v2"` = `""`). After reset, `hashAlgorithm` stays empty until `confirmDecisions()` overwrites it. This is correct behavior, but an implementer might incorrectly use `||` instead of `??`, which would upgrade `""` to `"sha256-decisions-v2"` without computing a matching hash.
- Evidence: Line 108: `??` operator. Line 339: clears to `""`. The behavior is internally consistent — `resolveQuestions()` dispatches empty/undefined to the 7-field path, and `confirmDecisions()` always writes v2.
- Impact: Implementation fragility. A single misplaced `||` would cause silent hash mismatches.
- Recommendation: Add a code comment noting that `??` is intentional (not `||`). Add test: after reset, `ensureV2Fields()` does NOT upgrade `hashAlgorithm` from `""`.
- Suggested test: `resetConfirmation()` → `answer(vertical, "SaaS")` → read `decisions.json` from disk → `confirmation.hashAlgorithm === ""`.
- Dedup key: ensureV2Fields-nullish-coalescing-empty-string
- Sources: pragmatic:P-PRAG-05

### C-11: Confirm→resolve→fail→reset flow wording imprecise about optional field data loss

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6)
- Lines: 477
- Claim: When confirm-decisions succeeds but resolve-questions fails twice and the agent calls reset-confirmation, the template says "Reanudar desde resumen (campos están completos, no desde cero)." But `resetConfirmation()` clears `optionalAnswered` and optional field values (assets), so only required fields are preserved. The wording is slightly misleading.
- Evidence: Line 338 clears optional fields. Line 477 says "campos están completos." The post-reset section at line 481 correctly states "Opcionales (assets) limpiados" but the confirm→resolve→fail→reset path at line 477 does not repeat this.
- Impact: Minimal — after reset, `questions()` returns `optionalPendingCount: 1`, so the agent naturally re-prompts. Only the template wording at line 477 is imprecise.
- Recommendation: Change line 477 to: "Error técnico al procesar la confirmación. Tus decisiones se preservaron pero necesitas confirmar de nuevo. Campos requeridos intactos; opcionales (assets) fueron limpiados y se te preguntarán de nuevo."
- Suggested test: Fill all fields including assets → confirm → mock resolveQuestions fail → reset → `questions()` returns `optionalPendingCount === 1`, `assets === ""`.
- Dedup key: confirm-resolve-fail-reset-optional-data-loss
- Sources: pragmatic:P-PRAG-06

### C-12: questions() catch-all suggestedAction masks state machine bugs

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 259
- Claim: For any unrecognized state, `questions()` returns `suggestedAction: "suggest_new_plan"`. This treats corrupt or unexpected states the same as completed lifecycle states, potentially masking bugs and orphaning plan data.
- Evidence: Line 259: "Cualquier otro estado no reconocido → readOnly: true, suggestedAction: 'suggest_new_plan'." If a bug introduces an invalid state string (e.g., "question_pending" typo), `questions()` suggests creating a new plan rather than flagging the anomaly.
- Impact: Debugging difficulty. A corrupted state silently routes to "create new plan" instead of surfacing as an error. Existing plan data and history could be lost if the user follows the suggestion.
- Recommendation: Return a distinct `suggestedAction` for unrecognized states (e.g., "diagnose_state") and include the raw state value in the response. The template can map this to "run plan status for diagnosis."
- Suggested test: Manually set plan.json status to "unknown_state" → `questions()` returns `suggestedAction: "diagnose_state"` (or similar), not "suggest_new_plan".
- Dedup key: questions-catch-all-masks-invalid-state
- Sources: operator:OP-04

### C-13: resetConfirmation() does not clear confirmation.source

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 344
- Claim: `resetConfirmation()` clears `confirmed`, `confirmedAt`, `confirmedBy`, `decisionsHash`, and `hashAlgorithm`, but does not clear `source`. After reset, `source` retains its pre-reset value while every other confirmation field is reset.
- Evidence: Line 344 explicitly lists five fields cleared. `source` is absent. After a confirm-by-user-A → reset → confirm-by-user-B cycle, `source` would still reflect user A's context if set to something other than the "chat" default.
- Impact: Minor diagnostic confusion. `source` is informational metadata and does not affect control flow. Inconsistent reset semantics could mislead debugging or audit trails.
- Recommendation: Add `source: null` to the resetConfirmation() clear list. Since `ensureV2Fields()` would restore "chat" on next read via `??`, clearing to `null` is cleanest.
- Suggested test: `confirmDecisions('001', { by: 'user_A', source: 'api' })` → `resetConfirmation()` → `decisions.confirmation.source === null`.
- Dedup key: reset-confirmation-source-not-cleared
- Sources: operator:OP-05

### C-14: Tabla de errores omits existing exit codes used by new functions

- Severity: P3
- Category: docs
- Status: valid
- File: target.md
- Lines: 613–624
- Claim: The summary "Tabla de errores" lists only new codes 20–26, but the new functions also produce existing codes 13, 15, and 19. The table title implies completeness but is effectively "new codes only."
- Evidence: Table at lines 613–624 lists only codes 20–26. Per-function specs correctly list codes 13, 15, 19. A developer building CLI error handlers from this table alone will miss these codes.
- Impact: Misleading single-source impression. Developer misses codes 13, 15, 19 when building error handlers from the summary table.
- Recommendation: Either rename to "Nuevos códigos de error" or add existing codes 13, 15, 19 with a note that they are pre-existing. Include a cross-reference to the per-function error lists.
- Suggested test: Verify that every exit code mentioned in function error sections appears in the table or is explicitly cross-referenced.
- Dedup key: error-table-missing-existing-codes
- Sources: modeler:M-02

### C-15: allQuestionsAddressed naming implies value presence, not presentation completion

- Severity: P3
- Category: state
- Status: valid
- File: target.md
- Lines: 139–140
- Claim: The name `allQuestionsAddressed` is ambiguous — it could mean "answered with a real value" or "presented to the user and responded to (including decline)." An implementer reading only the field name might use it to skip the optional-asset prompt, assuming the user already provided a value.
- Evidence: Line 139 clarifies: "Tracks question-presentation completion, not value presence. Puede ser true cuando assets === '' (declinado)." The word "addressed" is ambiguous. The two flags `requiredFieldsComplete` (means "all required values present") and `allQuestionsAddressed` (means "all questions presented including declined optionals") use different semantics despite similar naming patterns.
- Impact: An implementer could incorrectly branch on `allQuestionsAddressed` to skip optional prompts or auto-confirm, bypassing the asset question for users who haven't been asked.
- Recommendation: Consider renaming to `allQuestionsPresented`. Alternatively, add a prominent doc comment emphasizing that this tracks presentation, not value presence.
- Suggested test: N/A (naming/semantics, not behavioral).
- Dedup key: allQuestionsAddressed-naming-ambiguity
- Sources: modeler:M-03

### C-16: Non-mockup phase counters are semantically misleading

- Severity: P3
- Category: state
- Status: valid
- File: target.md
- Lines: 258
- Claim: `questions()` returns counter values for non-mockup phases (draft, refine, deliver) that are computed against FIELD_REGISTRY fields regardless of phase relevance. For a plan in draft phase, all 7 fields would be "empty," producing `requiredPendingCount: 6`. While `readOnly: true` prevents editing, the counters suggest the plan needs attention it doesn't need.
- Evidence: Line 258: "Contadores se computan de decisions.json como normal." Non-mockup decisions.json likely has none of these fields. `readOnly: true` and `suggestedAction: "suggest_new_plan"` prevent editing.
- Impact: Dashboard or monitoring logic based on `requiredPendingCount` across all plans would flag non-mockup plans as "incomplete." False alerts.
- Recommendation: Either set counters to `null`/omit for non-mockup phases, or add a `phaseApplicable: false` flag, or document that counters are only meaningful when `phase === "mockup"`.
- Suggested test: Create a plan, transition to draft phase, call `questions()`. Verify response documents that counter values are not meaningful for non-mockup phases.
- Dedup key: non-mockup-phase-counter-semantics
- Sources: modeler:M-04

### C-17: Multi-field parsing "equal count" case is underspecified

- Severity: P3
- Category: docs
- Status: valid
- File: templates/commands/canva-mockup.md (Section 2, multi-campo)
- Lines: 422–427
- Claim: The multi-field rules cover "excede" and "menor" cases but never explicitly state what happens when the count equals the pending count. An agent implementer could interpret "excede" as `>=`, refusing to save even when counts match.
- Evidence: Lines 422–426 list three rules. The "equal" case is handled implicitly (not "excede" and not "menor"), but the ambiguity could cause an off-by-one interpretation.
- Impact: Agent might refuse to save valid multi-field answers when count matches pending fields exactly.
- Recommendation: Add an explicit bullet: "Si cantidad es igual a campos pendientes → mapear por semántica y guardar exitosos, igual que el caso 'menor'."
- Suggested test: 3 pending fields, user provides exactly 3 values → verify agent saves all successfully mapped values.
- Dedup key: multi-field-equal-count-underspecified
- Sources: agent-ux:AU-04

### C-18: suggestedAction catch-all contradicts "always present" guarantee

- Severity: P3
- Category: docs
- Status: valid
- File: templates/commands/canva-mockup.md (Section 2, readOnly handling)
- Lines: target.md:259, target.md:414
- Claim: The spec states `questions()` always sets `suggestedAction`, yet the template includes a catch-all at line 414: "Si suggestedAction no está presente, mostrar resumen y sugerir plan status." These statements create ambiguity for the implementer.
- Evidence: target.md:259 guarantees suggestedAction is always present. target.md:414 handles the absent case. An implementer may wonder if there's an undocumented edge case, investing effort in an unreachable path.
- Impact: Implementer confusion. Time spent on unreachable code path. May reduce trust in other "always" claims.
- Recommendation: Either remove the catch-all or add a comment: "This catch-all is defensive — questions() always sets suggestedAction per spec, but this guards against future changes."
- Suggested test: Call `questions()` for every possible plan state → verify `suggestedAction` is always a non-empty string in the known enum.
- Dedup key: suggestedaction-catchall-contradicts-guarantee
- Sources: agent-ux:AU-05

### C-19: "Opción personalizada" detection by label vs value is a subtle trap

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md (Section 2, custom option handling)
- Lines: target.md:438, target.md:179
- Claim: The custom option uses `{ label: "Opción personalizada", value: "" }`. The template instructs detection by label, but agents naturally key on `value`. Using `value: ""` is ambiguous — if another empty-valued option were added, detection would break. If an agent passes "Opción personalizada" as value (misunderstanding detection), CLI rejects with exit 26 and a confusing message.
- Evidence: target.md:438 warns against using value. target.md:280 blocks literal "Opción personalizada" as a value. But the JSON structure invites the error.
- Impact: Agent misdetects by value → either works accidentally or triggers confusing exit 26. If schema changes to add other empty-valued options, detection breaks silently.
- Recommendation: Consider using a sentinel value like `value: "__custom__"` instead of `value: ""` for unambiguous detection without relying on label matching.
- Suggested test: Agent selects option with `value: ""` → verify it triggers `customFollowUp` and does NOT pass "Opción personalizada" or "" to `answer()`.
- Dedup key: custom-option-label-vs-value-trap
- Sources: agent-ux:AU-06

### C-20: reset-confirmation staleRenameFailed not covered in template

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md (Section 2, error handling)
- Lines: target.md:345–347, target.md:479–482
- Claim: `resetConfirmation()` can return `staleRenameFailed: true` when mockup rename fails. The spec documents a human-readable message, but the agent template does not instruct the agent to check this field or relay the message.
- Evidence: target.md:345–347 defines the field and suggested message. target.md:479–482 covers reset flow but only mentions the success case. Error table has no row for this partial-failure scenario.
- Impact: After reset succeeds but mockup rename fails, agent reports success without mentioning the stale file. User has no idea cleanup is needed.
- Recommendation: Add to the template reset-confirmation handling: "Verificar campo staleRenameFailed en la respuesta. Si true, informar: 'El mockup anterior no se pudo renombrar pero los datos se reiniciaron. El archivo mockup.html anterior puede ser ignorado o eliminado manualmente.'"
- Suggested test: Run reset-confirmation with a mock fs.renameSync failure → verify agent template instructs informing the user about the stale file.
- Dedup key: stale-rename-failed-not-in-template
- Sources: agent-ux:AU-07

## Non-Issues Checked

- **Lock ordering and release**: All new functions (questions, answer, resetConfirmation) acquire per-plan locks and release in `finally`. No deadlock risk for single-user CLI. Concurrent calls serialized correctly.
- **Crash recovery in resetConfirmation()**: plan.json written before decisions.json. Re-running is idempotent. All intermediate crash states recoverable. History may accumulate one extra entry — documented as acceptable.
- **Hash migration v1→v2**: confirmDecisions always computes v2 (7 fields). resolveQuestions/submitMockup dispatch on stored hashAlgorithm. Migration is atomic — hash and label always match post-confirm. Single NORMALIZE function prevents divergence.
- **ensureV2Fields() ordering and non-persistence**: Called after state read, before accessing confirmation fields. Read-only functions (questions, status) normalize in memory without writing. First mutation persists. No inconsistency.
- **Placeholder detection breaking change**: `includes()` → `===` fixes "Nodo" false positive. Bracket detection `[...]` remains substring-based. Documented as intentional.
- **Exit code migration 15→24**: Pre-implementation grep audit specified. Clean migration path.
- **GSDC_ARTIFACT_MISSING → GSDC_MOCKUP_MISSING rename**: Pre/post grep commands specified. No collision with existing codes.
- **CLI handleError fallback to `|| 1`**: Blanket rule with grep verification. Correct behavior for unexpected errors.
- **optionalAnswered semantics**: Set for all optional answers (empty or not). getEmptyFields excludes flagged optionals. Defensive guard prevents required fields from being hidden by spurious flags. Test explicitly validates.
- **confirmDecisions() empty-value rejection**: Double protection — template checks requiredFieldsComplete, API validates via getEmptyFields (exit 19).
- **Choice value normalization**: Case-insensitive exact match → canonical form from FIELD_REGISTRY. Hash computed on stored value. Consistent end-to-end.
- **History deduplication in resetConfirmation()**: Same `from` → no duplicate. Prevents history spam during crash recovery.
- **FIELD_REGISTRY as single source of truth**: Derived constants used everywhere. Post-implementation grep verifies no hardcoded field lists remain.
- **State machine completeness**: All transitions accounted for. Unrecognized states safely default to readOnly.
- **readOnly vs confirmed independence**: Both flags returned independently. Consumers can distinguish "locked after confirm" from "locked by phase."
- **questions() never throws GSDC_INVALID_STATE**: Read-only diagnostic function for all states. Consistent with catch-all behavior.
- **Duplicated line 260–261**: Editorial copy-paste. No implementation ambiguity.
- **Idempotency of resetConfirmation()**: No-op case well-defined (questions_pending + confirmed=false + no mockup).
- **Lock for read-only questions()**: Protects against reading partially-written state during concurrent writes. Acceptable tradeoff.

## Residual Risks

- **Concurrent CLI processes / agent interleaving**: Lock manager prevents data corruption but interleaved sequential calls (confirm-decisions → resolve-questions) from different agents could hit race conditions. The template handles this (retry once, then reset). Inherent to CLI-based architecture; acceptable for single-user tool.
- **Stale mockup after staleRenameFailed**: If resetConfirmation cannot rename mockup.html (I/O error), old file remains. Mtime and hash checks in submitMockup serve as safety nets. Manual cleanup documented. No automated recovery.
- **"confirmo" parsing false positives**: "confirmo pero quiero cambiar" passes. Trade-off explicitly accepted (target.md:676). reset-confirmation available as escape hatch. Monitor user feedback.
- **ensureV2Fields() implementation fragility**: `??` vs `||` distinction for hashAlgorithm is easy to get wrong. A single misplaced `||` would cause silent hash mismatches. Recommend careful code review of this function (see C-10).
- **Manual decisions.json editing bypass**: Direct editing circumvents all state machine invariants, locks, and validation. optionalAnswered can desync from field values. No integrity check for structural edits (only hash covers field values post-confirm). Mitigated by "PROHIBIDO" rule and CLI-only access.
- **Agent context window limits**: The full template section 2 replacement is substantial (~100 lines of dense instructions). Constrained agents may truncate and miss critical instructions (PROHIBIDO rules, multi-field mapping table). Not directly verifiable from spec.
- **Non-Spanish-speaking users**: All questions, options, and "confirmo" parsing are Spanish-specific. English responses ("I confirm") rejected. Likely intentional but creates language lock-in.
- **writeAtomicJson atomicity**: Assumed but implementation-dependent. Partial write would break recovery guarantees. Pre-existing dependency, not introduced by this proposal.
- **Custom value matching placeholder loop**: If C-04 is not addressed, answer() accepting "TODO" for allowCustom fields creates an infinite re-ask loop. Technically recoverable via counters preventing confirmation, but confusing for users.
