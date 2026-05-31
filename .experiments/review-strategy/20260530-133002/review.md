# Review Consolidado: Preguntas Interactivas en `/canva-mockup` (Rev. 8)

## Meta

- Target: `docs/PROPOSAL_v1.2_interactive_questions.md` (Rev. 8)
- Estrategia: 2 — multi-perspective (pragmatic, operator, modeler, agent-ux)
- Reviewers: pragmatic, operator, modeler, agent-ux
- Fecha: 2026-05-30T13:30:02

## Summary

- Verdict: **reject_until_fixed**
- Top risk: "Otro (personalizado)" option absent from structured JSON while mandated by template text, causing a complete break of the intended interaction flow for any agent rendering questions from JSON alone
- Confidence: high
- P1 findings: 3 | P2 findings: 13 | P3 findings: 6

## Findings

### C-01: "Otro (personalizado)" option absent from structured JSON but mandated by template

- Severity: **P1**
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 86-159 (JSON spec), 275-279 (template text)
- Claim: The `questions()` JSON output defines choice-type questions with a fixed `options` array, but the template text (line 275) requires appending "Otro (personalizado)" as the last option. The JSON contains `allowCustom: true` but no structured representation of the custom option itself.
- Evidence: The JSON for `vertical` (lines 88-98) has 8 options ending with "Personal Brand / Portafolio" — no "Otro" entry. The template (line 275) states "La última opción siempre es 'Otro (personalizado)' para valor custom." Line 278 says agents map numeric input to JSON array values — if an agent appends "Otro" manually, numeric indices are off-by-one. Two agents will implement this differently.
- Impact: Agents rendering from JSON alone never display "Otro (personalizado)." Agents following the template must append it manually with no structured guidance, producing inconsistent behavior. The mapping rule and the JSON data are in direct conflict.
- Recommendation: Either (a) include "Otro (personalizado)" as the last entry in every `choice` options array with a sentinel `value` (e.g., `""`) and a `customFollowUp` field, or (b) make `allowCustom: true` the authoritative signal and define the rendering rule ("if allowCustom, append synthetic 'Otro' option outside the numeric mapping scope") explicitly in the JSON output metadata.
- Suggested test: `plan questions --json` output for a `choice` field with `allowCustom: true` must contain enough structured data for an agent to render "Otro" and handle custom input without hardcoding field-specific logic or violating the numeric mapping rule.
- Dedup key: otro-custom-option-missing-from-json
- Sources: agent-ux:AU-01

### C-02: Confirmation parsing semantics too vague for reliable agent implementation

- Severity: **P1**
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 313
- Claim: Line 313 states "Solo una afirmación sin calificar después del último resumen cuenta como confirmación" — this is natural-language guidance with no structured enforcement mechanism. Agents must classify utterances like "sí", "dale", "ok", "me parece bien", "sí, pero..." into binary confirmed/not-confirmed with no heuristic or pattern.
- Evidence: The only example is "sí, pero cambia la paleta a verde" → not confirmed. But "sí, todo bien", "ok vamos", "dale, confirmo" are undefined. The entire hash-based integrity system depends on this gate being correct, yet different agents will implement detection differently.
- Impact: Non-deterministic yield gate behavior across agents. The security model of the hash-based integrity system is undermined if confirmation detection varies.
- Recommendation: Replace natural-language confirmation detection with a structured protocol: (1) present summary, (2) ask "Responde 'confirmo' para continuar", (3) only match the exact string "confirmo" (case-insensitive, trimmed). This removes all ambiguity while keeping the UX simple.
- Suggested test: Template review: the confirmation step must specify an exact trigger phrase or pattern that an agent can match programmatically.
- Dedup key: confirmation-parsing-vague-agent-ambiguity
- Sources: agent-ux:AU-02

### C-03: `resetConfirmation()` partial failure leaves valid `mockup.html` in `questions_pending` state

- Severity: **P1**
- Category: state
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 221-229
- Claim: If `resetConfirmation()` fails after writing `plan.json` (step 4) but before renaming `mockup.html` (step 6), the plan reverts to `questions_pending` while retaining a valid `mockup.html`. The proposal claims re-execution completes cleanup, but the idempotency guard may prevent step 6 from executing.
- Evidence: Line 229: "Si falla después de escribir `plan.json` (paso 4), el plan ya está en `questions_pending` — seguro." Step 6 renames `mockup.html` to `.stale`. If step 6 fails (permission error, disk full), the mockup remains. The proposal's idempotency rule (line 217: "questions_pending sin confirmación previa → no-op") only applies when `confirmed !== true`. If step 5 (clearing confirmation) succeeded but step 6 failed, re-execution would see `confirmed === false` and `state === questions_pending`, making it a no-op — but the mockup still exists. However, if step 5 also failed, re-execution would see `confirmed === true` and `state === questions_pending`, which correctly proceeds with steps 5-6.
- Impact: A stale `mockup.html` from a prior iteration could be submitted if the user confirms + resolves again without changes (hash would match). The hash check is a safety net — if decisions changed, the hash mismatches and submission fails. But if the user only changes a non-hash field or re-confirms with same values, the stale mockup could be accepted. The recovery claim "re-ejecutar completa la limpieza" is not always true.
- Recommendation: Add `mockup.html` existence check to the idempotency logic: if `state === questions_pending && confirmed !== true && mockup.html exists` → still rename to `.stale`. Alternatively, have `submitMockup()` explicitly reject files with timestamps older than the current `confirmation.confirmedAt`.
- Suggested test: Simulate step 6 failure (make mockup.html read-only before rename) → verify re-executing `resetConfirmation` still renames the mockup (or verify `submitMockup` rejects stale mockups by timestamp).
- Dedup key: resetConfirmation-partial-failure-mockup-rename
- Sources: modeler:M06

### C-04: `GSDC_ARTIFACT_MISSING` exit code collision (20 vs 25)

- Severity: **P2**
- Category: cli-contract
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 40, 419-426
- Claim: The proposal introduces exit code 25 with error name `GSDC_ARTIFACT_MISSING` for missing internal artifacts (`decisions.json`, `plan.json`), but `submitMockup()` already uses the same error name with exit code 20 for missing `mockup.html`.
- Evidence: `lib/plan-manager.js:389-392` throws `GSDC_ARTIFACT_MISSING` with exit 20. Proposal error table (line 426) defines exit 25 with the same name. No mention of renaming the existing usage. Any consumer checking `error.code === 'GSDC_ARTIFACT_MISSING'` cannot distinguish between the two cases.
- Impact: Error handlers and agent recovery logic cannot distinguish "mockup.html missing during submit" (exit 20) from "decisions.json missing during questions" (exit 25) by code name alone. The canva-mockup.md error table only references the exit 25 case.
- Recommendation: Use a distinct error name for the new case (e.g., `GSDC_PLAN_ARTIFACT_MISSING` for exit 25), or unify both to exit 25 and update the existing `submitMockup()` usage. Option (a) is safer.
- Suggested test: Assert that `submitMockup()` with missing mockup.html returns exit 20 with code `GSDC_ARTIFACT_MISSING`, and `questions()` with missing decisions.json returns exit 25 with a distinguishable code.
- Dedup key: artifact-missing-exit-code-collision
- Sources: pragmatic:F-01, operator:OP-01

### C-05: `resetConfirmation()` omits `plan.json` history entry

- Severity: **P2**
- Category: state
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 221-229
- Claim: `resetConfirmation()` writes `plan.json` with the new state but does not mention appending to the `history` array, unlike all other state transitions in the codebase.
- Evidence: Existing transitions (`resolveQuestions` line 319, `submitMockup` line 399, `transitionState` line 515) all push history entries. The proposal's step 4 (line 225) only says "Escribir `plan.json` con estado `mockup:questions_pending`" — no history mention.
- Impact: Breaks the auditability invariant. `plan.json.history` would have gaps. Tools reconstructing the plan timeline from history would miss reset events.
- Recommendation: Add an explicit step between steps 4 and 5: push `{ action: 'reset-confirmation', from: previousState, to: 'questions_pending' }` to `planData.history`.
- Suggested test: After `resetConfirmation()`, assert `plan.json` history contains an entry with `action: 'reset-confirmation'`.
- Dedup key: reset-confirmation-missing-history-entry
- Sources: pragmatic:F-02

### C-06: No single source of truth for field definitions

- Severity: **P2**
- Category: integrity
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 46-56, 82-159, 183
- Claim: The 7 field definitions (names, types, required flags, options) are hardcoded in three separate places: `questions()` JSON output, `answer()` validation list, and `getEmptyFields()` field list parameter. No shared field registry exists.
- Evidence: `getEmptyFields()` (line 47) takes `fieldList` as parameter. `answer()` (line 183) validates against a separate hardcoded list. `questions()` (lines 84-158) has inline field definitions. The current code already has this problem between `confirmDecisions()` (line 185) and `resolveQuestions()` (line 277). The proposal extracts the empty-check logic but not the field registry.
- Impact: Field lists can diverge silently. Adding a field to `questions()` but forgetting `answer()` validation causes `answer()` to reject valid fields with `GSDC_INVALID_FIELD`. Single-point-of-failure maintenance risk.
- Recommendation: Define a single `FIELD_REGISTRY` constant at module scope containing field names, required flags, types, options, and question text. All three functions derive their lists from this registry.
- Suggested test: Test that iterates `FIELD_REGISTRY` and verifies every field name is accepted by `answer()`, and `questions()` output length matches registry size.
- Dedup key: no-single-field-registry
- Sources: pragmatic:F-03, modeler:M04

### C-07: Breaking change to plan-not-found exit code not flagged

- Severity: **P2**
- Category: cli-contract
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 37-42, 406
- Claim: Migrating `findPlanDir()` from `GSDC_JSON_PARSE_ERROR` (exit 15) to `GSDC_PLAN_NOT_FOUND` (exit 24) changes the exit code for every existing command when the plan ID doesn't exist. This is presented as a fix but is a silent breaking CLI contract change.
- Evidence: Current `findPlanDir()` (`lib/plan-manager.js:29-30`) throws exit 15. The proposal changes this to exit 24 for all functions. Verification at line 406 confirms. Any external consumer (agent prompts, scripts) checking exit 15 for "plan not found" silently stops matching.
- Impact: Agents or scripts handling exit 15 for missing plans will no longer match. The error table only documents new commands' error behavior, not the changed behavior of existing commands.
- Recommendation: Add a "Breaking Changes" subsection noting exit 15 will no longer be emitted for missing plans. Verify no template or agent prompt checks for exit 15 in the "plan not found" case.
- Suggested test: `plan status --id 999 --json` exits with code 24 and `code: 'GSDC_PLAN_NOT_FOUND'`. Also test `confirm-decisions`, `resolve-questions`, `submit-mockup` with nonexistent plan ID return exit 24.
- Dedup key: plan-not-found-exit-code-migration-breaking
- Sources: pragmatic:F-06, modeler:M02

### C-08: `resetConfirmation()` idempotency condition ambiguous for partial failure recovery

- Severity: **P2**
- Category: state
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 217-229
- Claim: The idempotency rule ("questions_pending without prior confirmation → no-op") and the partial failure recovery rule ("re-execute completes cleanup") are potentially contradictory when state is `questions_pending` but `confirmation.confirmed === true`.
- Evidence: Line 229 states re-execution completes cleanup. Line 217 states "questions_pending sin confirmación previa → no-op." If crash occurs after step 4 (state → `questions_pending`) but before step 5 (clearing `confirmed`), re-execution encounters `state === questions_pending && confirmed === true`. The spec does not make explicit that the idempotency guard checks BOTH state AND confirmed status.
- Impact: An implementer may write `if (state === 'questions_pending') return noOp()` without checking `confirmed`, causing cleanup to be skipped. The plan stays in inconsistent state: editable state but `answer()` rejects writes because `confirmed` is still true.
- Recommendation: Make the idempotency condition explicit with pseudocode: `if (state === 'questions_pending' && confirmed !== true) → no-op; else → proceed with remaining steps`. Add a note that the guard is `state + !confirmed`, not `state` alone.
- Suggested test: Confirm a plan, manually set state to `questions_pending` while leaving `confirmed === true`, then run `resetConfirmation()` → verify it clears confirmation (not a no-op).
- Dedup key: reset-confirmation-partial-failure-idempotency-ambiguity
- Sources: operator:OP-02

### C-09: `optionalAnswered` not cleared by `resetConfirmation()`

- Severity: **P2**
- Category: state
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 220, 227
- Claim: `resetConfirmation()` clears `confirmed`, `confirmedAt`, `decisionsHash`, and `hashAlgorithm`, but does not clear `optionalAnswered`. After reset, previously declined optional fields remain marked as answered.
- Evidence: Line 220 lists fields to clear — no `optionalAnswered`. Line 227 lists steps 4-7 — no step clears it. `getEmptyFields()` (line 50) excludes fields where `optionalAnswered[field] === true`. After reset, `questions()` reports `optionalPendingCount: 0` for previously declined assets, hiding it from the interactive flow.
- Impact: A user who resets to "edit everything" is never re-prompted about assets. The assets question disappears. The user can still call `plan answer` manually, but the guided flow silently skips it — contradicting the reset's purpose of enabling full re-editing.
- Recommendation: Add a step to clear `optionalAnswered` to `{}` during `resetConfirmation()`. If preservation is intentional, document it explicitly as a design decision and add a mechanism for re-opening optional questions.
- Suggested test: Fill all fields, decline assets (`optionalAnswered.assets = true`), confirm, reset, call `questions()` → verify `optionalPendingCount === 1`.
- Dedup key: reset-confirmation-optional-answer-not-cleared
- Sources: operator:OP-03, modeler:M01

### C-10: `questions()` rejects non-`questions_pending` states — no read-only inspection

- Severity: **P2**
- Category: state
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 166-168
- Claim: `questions()` throws `GSDC_INVALID_STATE` if the plan is not in `mockup:questions_pending`. This prevents agents from inspecting decision values after confirmation, even as a read-only query. No alternative inspection command exists.
- Evidence: Line 168 enforces the state gate. `plan status` shows phase/status but not individual field values. The error recovery table (line 298) for `GSDC_INVALID_STATE` says "explain current state" but doesn't suggest `reset-confirmation` as a path to re-view answers.
- Impact: After the yield gate, an agent cannot present a decision summary without reading `decisions.json` directly (which the proposal prohibits). A user asking "what did I choose for vertical?" cannot be answered through the CLI API.
- Recommendation: Either (a) allow `questions()` in read-only mode for `ready_for_html` and `pending_approval` states (returning current values without pending questions), or (b) add a `plan decisions --id <ID>` command that returns field values for any state. At minimum, add `reset-confirmation` as a suggested action in the `GSDC_INVALID_STATE` error recovery row.
- Suggested test: `plan questions --id <ID>` on a plan in `ready_for_html` should either return read-only data or the proposal should provide an alternative inspection command.
- Dedup key: questions-state-gate-read-only
- Sources: operator:OP-04, modeler:M03, agent-ux:AU-08

### C-11: `submitMockup()` hash migration v1→v2 not explicitly addressed

- Severity: **P2**
- Category: integrity
- Status: valid
- File: `lib/plan-manager.js`
- Lines: 346-364 (proposal), 367-384 (current submitMockup)
- Claim: Section 8 says "Las 3 funciones que validan hash deben soportar ambos [v1 and v2]" and names `confirmDecisions()`, `resolveQuestions()`, and `submitMockup()`. But the migration logic and numbered steps only detail behavior for `confirmDecisions()` and `resolveQuestions()`. `submitMockup()` needs the same v1/v2 dispatch but is not explicitly specified.
- Evidence: Lines 360-363 describe the v1/v2 conditional logic. The test at line 402 only tests v1 migration for `resolve-questions`. If `submitMockup()` always computes a 7-field v2 hash, existing v1 plans fail at submit stage.
- Impact: A plan confirmed with v1 hash that passes `resolve-questions` would fail at `submit-mockup` with hash mismatch. This breaks the migration path for existing plans.
- Recommendation: Explicitly state that `submitMockup()` needs the same v1/v2 hash dispatch logic. Add a test: fixture with v1 hash → pass `resolve-questions` → create mockup.html → `submit-mockup` passes.
- Suggested test: Fixture with `hashAlgorithm: "sha256-decisions-v1"` and 6-field hash → `resolve-questions` passes → create mockup.html → `submit-mockup` passes (no hash mismatch).
- Dedup key: submitMockup-hash-v1-v2-migration
- Sources: modeler:M05

### C-12: `getEmptyFields()` placeholder detection uses `includes()` — overly broad substring matching

- Severity: **P2**
- Category: state
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 48-55
- Claim: `val.toUpperCase().includes(p)` matches substrings. A legitimate value like "Estilo NODO" contains "TODO" (via "NODO") and would be incorrectly flagged as a placeholder. This is a pre-existing bug being preserved by the extraction.
- Evidence: Line 52: `placeholders.some(p => val.toUpperCase().includes(p))`. "NODO".toUpperCase() = "NODO", includes("TODO") = true. Spanish words like "PENDIENTE_DE_PAGO" would also match. Current `confirmDecisions()` at line 190 uses the same logic.
- Impact: Legitimate field values containing placeholder substrings are rejected. Low probability but high confusion when it happens, especially for Spanish-language content.
- Recommendation: Change to exact match (`===`) or word-boundary matching. This is an opportunity to fix the pre-existing issue while extracting the shared helper.
- Suggested test: Set `decisions.paleta = "Nodo"` → verify `getEmptyFields()` does NOT flag it as empty. Set to `"TODO"` → verify it IS flagged.
- Dedup key: getEmptyFields-placeholder-substring-match
- Sources: modeler:M09

### C-13: Error recovery table omits `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (exit 21)

- Severity: **P2**
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 295-302
- Claim: The error handling table covers exit codes 22, 23, 13, 15, 25, and 24, but omits exit code 21 (`GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION`). This error can occur during `resolve-questions` or `submit-mockup` within the section 2 flow.
- Evidence: Exit 21 is used in `resolveQuestions()` (plan-manager.js:310) and `submitMockup()` (line 382). The proposal introduces `reset-confirmation` as the natural recovery path but doesn't mention it for this error. An agent encountering exit 21 has no recovery instruction from the template.
- Impact: An agent encountering exit 21 during the interactive flow might attempt to re-run `confirm-decisions` without `reset-confirmation`, which would re-hash modified decisions and silently accept the tampering.
- Recommendation: Add a row to the error table: `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (21) → "Las decisiones fueron modificadas después de la confirmación. Ejecutar `reset-confirmation` y repetir el flujo."
- Suggested test: Verify the template error table covers all exit codes that can occur during the section 2 flow (13, 15, 19, 21, 22, 23, 24, 25).
- Dedup key: error-table-missing-exit-21
- Sources: agent-ux:AU-03

### C-14: `reset-confirmation` from `pending_approval` destroys mockup with no user-facing warning

- Severity: **P2**
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 218-219, 319-324
- Claim: `reset-confirmation` accepts `pending_approval` state, renames `mockup.html` to `.stale`, and reverts to `questions_pending`. The template text shows the agent simply executing `reset-confirmation` when the user "wants to correct" — no warning about mockup destruction.
- Evidence: In `pending_approval`, the user has iterated on a `mockup.html`. Resetting destroys it. Line 319: "Si el usuario quiere corregir después de confirmar, ejecuta `reset-confirmation`" — treats a minor field correction the same as full mockup destruction. The `.stale` rename is irreversible in the normal flow.
- Impact: A user saying "cambia el CTA" after seeing the mockup loses all mockup work without warning.
- Recommendation: Add a warning step to the template: before executing `reset-confirmation` from `ready_for_html` or `pending_approval`, the agent must warn that the current mockup will be invalidated. Alternatively, add a `--force` flag required when the plan has a mockup.
- Suggested test: Verify the template instructs the agent to warn the user before reset when `mockup.html` exists.
- Dedup key: reset-confirmation-destroys-mockup-no-warning
- Sources: agent-ux:AU-04

### C-15: `answer()` response omits `requiredFieldsComplete` — agent must infer transition trigger

- Severity: **P2**
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 188-198, 60-63
- Claim: The `answer()` return format includes `requiredPendingCount` and `optionalPendingCount` but not `requiredFieldsComplete` or `allQuestionsAnswered`. Line 63 defines `requiredFieldsComplete` as the key signal for transitioning to the confirmation step, but this boolean is only returned by `questions()`.
- Evidence: After answering the last required field, `answer()` returns `requiredPendingCount: 0` but not `requiredFieldsComplete: true`. The agent must either re-call `questions()` after every `answer()` (wasteful) or derive the flag itself (fragile).
- Impact: Agents that only check `answer()` return values must implement the derivation `requiredPendingCount === 0` — which breaks if the required field count changes in a future version. Agents that miss this never transition to the confirmation step.
- Recommendation: Add `requiredFieldsComplete` and `allQuestionsAnswered` to the `answer()` return format, mirroring `questions()`.
- Suggested test: After answering the 6th required field, `answer()` response must include `requiredFieldsComplete: true`.
- Dedup key: answer-omits-required-fields-complete
- Sources: agent-ux:AU-05

### C-16: Context extraction "provided" vs "inferred" boundary underspecified for agents

- Severity: **P2**
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 264-266
- Claim: The template instructs agents to save "solo los campos explícitamente provistos por el usuario" with one negative example ("si dice 'banner para mi app', no infieras vertical, paleta, ni cta"), but no positive examples of what counts as "explicitly provided" per field.
- Evidence: If a user says "quiero un banner azul para mi restaurante de comida italiana", is `vertical` provided ("restaurante") or inferred? Is `paleta` provided ("azul") or inferred? No mapping table exists. Different agents will classify the same input differently.
- Impact: Divergent behavior where the same user input produces different `decisions.json` contents across agents, affecting the hash and downstream flow.
- Recommendation: Add a concrete mapping table with 2-3 example user inputs and exactly which fields should be saved for each. For example: `"quiero un banner azul" → formato: "banner" (inferred, don't save), paleta: "azul" (explicit, save)`.
- Suggested test: Provide 3 example user inputs and specify exactly which fields should be saved for each.
- Dedup key: context-extraction-provided-vs-inferred-ambiguous
- Sources: agent-ux:AU-06

### C-17: `resetConfirmation()` step description omits `hashAlgorithm` clear

- Severity: **P3**
- Category: docs
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 220, 364
- Claim: Line 220 lists fields to clear (`confirmed`, `confirmedAt`, `decisionsHash`) but omits `hashAlgorithm`. Section 8 (line 364) states `resetConfirmation()` clears `hashAlgorithm`. An implementer following the ordered steps literally would miss it.
- Evidence: Line 220: no `hashAlgorithm`. Line 364: "limpia `hashAlgorithm` junto con `decisionsHash`". Inconsistent specification.
- Impact: If `hashAlgorithm` is not cleared, `confirmed: false` but `hashAlgorithm: "sha256-decisions-v2"` persists — an inconsistent state that could confuse debugging or future code. No functional impact because `confirmDecisions()` always overwrites it.
- Recommendation: Add `confirmation.hashAlgorithm = ""` to the explicit list at line 220.
- Suggested test: After `resetConfirmation()`, assert `decisions.confirmation.hashAlgorithm === ""`.
- Dedup key: reset-confirmation-hashAlgorithm-clear-inconsistency
- Sources: pragmatic:F-04

### C-18: Section numbering skips from 8 to 10 (section 9 missing)

- Severity: **P3**
- Category: docs
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 366-368
- Claim: Sections are numbered 1-8, then jumps to section 10. Section 9 is missing.
- Evidence: Line 366 ends section 8. Line 368 begins "### 10. Referencias cruzadas".
- Impact: Confusion when referencing sections by number. Could indicate missing content or a merge artifact.
- Recommendation: Renumber sections: 10→9, 11→10, 12→11.
- Suggested test: N/A
- Dedup key: section-numbering-gap
- Sources: pragmatic:F-05, modeler:M08, agent-ux:AU-07

### C-19: Concurrent `questions()` test specification is fragile for CI

- Severity: **P3**
- Category: testing
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 405
- Claim: The test "questions lock consistente" requires verifying snapshot consistency under concurrent writes, but the global lock serializes all operations, making true concurrency testing impractical and flaky in CI.
- Evidence: The lock manager uses synchronous file-based locks with 100ms retry intervals. Testing true concurrency requires spawning child processes with precise timing. The global lock guarantees serialization by construction.
- Impact: Test will either be skipped (leaving guarantee unverified) or be flaky in CI.
- Recommendation: Replace with targeted tests: (a) verify `questions()` acquires and releases the lock correctly (lock file absent after completion), (b) verify `questions()` + `answer()` sequential execution produces consistent counters. Accept that lock consistency is guaranteed by the lock manager's own tests.
- Suggested test: Assert lock file does not exist after `questions()` completes. Assert sequential `questions()` then `answer()` produces consistent counters.
- Dedup key: concurrent-questions-test-fragility
- Sources: pragmatic:F-07, operator:OP-06

### C-20: `create()` initializes `hashAlgorithm` as v1 in v1.2 code

- Severity: **P3**
- Category: docs
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 329-342
- Claim: Section 7 specifies new fields for `create()` but does not mention updating `hashAlgorithm` from `sha256-decisions-v1` to `sha256-decisions-v2`. New plans get v1 on creation but v2 on first confirmation.
- Evidence: Current `lib/plan-manager.js:112` sets `hashAlgorithm: "sha256-decisions-v1"`. Section 8 says `confirmDecisions()` always writes v2. But `create()` is not updated.
- Impact: Functionally harmless (empty hash, overwritten on first confirm). Inconsistent: v1.2 installation creates plans with a stale algorithm marker.
- Recommendation: Either update `create()` to write `hashAlgorithm: "sha256-decisions-v2"` or add a note in section 7 stating it intentionally keeps v1.
- Suggested test: N/A — documentation clarity issue.
- Dedup key: create-hash-algorithm-v1-stale
- Sources: operator:OP-05

### C-21: `answer()` does not update `plan.json` timestamps or history

- Severity: **P3**
- Category: state
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 173-204
- Claim: `answer()` writes to `decisions.json` but does not specify updating `plan.json` timestamps or history, unlike all other mutating operations in the codebase.
- Evidence: Existing mutations (`confirmDecisions` line 225, `resolveQuestions` line 325, `submitMockup` line 405) all update `plan.json` timestamps and push history. `answer()` only mentions writing `decisions.json`.
- Impact: `plan.json` timestamps won't reflect the latest answer. Auditing can't determine when the last answer was given from `plan.json` alone.
- Recommendation: Either update `plan.json.updated` timestamp on each answer (without history entries to avoid bloating), or explicitly document that `answer()` intentionally skips `plan.json` updates and the audit trail is in `decisions.json` field values.
- Suggested test: N/A — design choice.
- Dedup key: answer-no-plan-json-timestamp-update
- Sources: operator:OP-07

### C-22: `planState` field in `questions()` output inconsistent with other CLI outputs

- Severity: **P3**
- Category: cli-contract
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 74
- Claim: The `questions()` output includes `"planState": "mockup:questions_pending"` — a `phase:status` concatenation. Other CLI outputs (e.g., `plan status`) return `phase` and `status` as separate fields.
- Evidence: `plan status` returns separate `phase` and `status` fields (plan-manager.js:672-674). `questions()` returns a combined `planState` string.
- Impact: Inconsistent API shape across commands. Agents parsing `planState` format would break if internal state naming changes.
- Recommendation: Either use separate `phase` and `status` fields (consistent with `plan status`) or document that `planState` is a derived display field.
- Suggested test: Verify `planState` format is `"phase:status"` — or remove and use separate fields.
- Dedup key: questions-output-planState-format-inconsistency
- Sources: modeler:M07

## Non-Issues Checked

- **Hash v1/v2 migration logic**: Dual-algorithm approach (check `hashAlgorithm` field, use 6 or 7 fields) is sound. `confirmDecisions()` writes v2, readers support both. Automatic migration on next confirmation. No data loss for existing plans.
- **Double-wrap prevention**: Manager functions return raw data, CLI wraps via `handleSuccess()`. Verification step 15 checks for no `parsed.data.data`. Well-designed.
- **Existing test compatibility**: Adding `assets: ""` and `optionalAnswered: {}` to `create()` output does not break existing assertions.
- **Lock acquisition ordering**: `questions()`, `answer()`, `resetConfirmation()` all acquire lock before reading. Consistent with existing pattern.
- **`writeAtomicJson` via rename**: Already used in codebase for all writes. Safe.
- **`answer()` post-confirmation rejection**: `confirmed !== true` check inside the lock prevents post-confirmation writes. Correct.
- **Stale mockup.html blocking submit**: `.stale.<timestamp>` renaming ensures `submitMockup()` can't find `mockup.html`. Correct.
- **`readJsonOrThrow` excluded from `list()`**: `list()` silently skips corrupt plans. Correct exception.
- **State transitions for `resetConfirmation`**: Only accepts `questions_pending`, `ready_for_html`, `pending_approval`. Correctly rejects later states.
- **Global lock prevents concurrent answer + confirm-decisions race**: Lock serialization is the primary guard; secondary checks within lock are correct defense-in-depth.
- **`answer()` accepts placeholders, `questions()` detects them**: System works correctly through layered validation. `answer()` is thin write-through, `questions()` reports accurately via `getEmptyFields()`, `confirmDecisions()` blocks. Design is correct.
- **Section 3 of `canva-mockup.md` not modified**: Explicitly noted as running after `resolve-questions`. Not contradictory.
- **`getEmptyFields()` shared helper design**: Deduplicates placeholder logic. `optionalAnswered` parameter correctly excludes declined optionals.
- **`confirmDecisions` still validates only 6 required fields**: `requiredFieldsComplete` aligns with this. `assets` doesn't block.

## Residual Risks

- **Global single-lock serialization**: All plan operations across all plans share one lock. Under concurrent multi-agent use, this could cause lock timeout errors. Per-plan locking would be a future improvement.
- **`getEmptyFields()` hardcoded placeholder list**: `['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR']` requires code changes for new patterns. No mechanism for user-defined placeholders.
- **`questions()` hardcoded question catalog**: Adding new fields requires code changes rather than configuration. The `FIELD_REGISTRY` recommendation (C-06) would partially address this.
- **`optionalAnswered` generalization**: Currently only covers `assets`. If additional optional fields are added later, the proposal hardcodes `optionalAnswered.assets` in several places — generalization path is clear but not formally specified.
- **`.stale` file accumulation**: Over many reset cycles, plan directories accumulate stale mockups. `submitMockup()` correctly only checks for `mockup.html`, so this is cosmetic but could cause disk usage issues long-term.
- **Confirmation parsing across languages**: Even with a structured trigger phrase, agents operating in languages other than Spanish may not follow the instruction, or users may not comply. CLI-level enforcement would be more robust but adds complexity.
