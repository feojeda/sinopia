# Review: agent-ux

## Summary

- Verdict: approve_with_changes
- Top risk: The "Otro (personalizado)" option required by the template text is absent from the structured JSON returned by `plan questions`, so any agent that renders questions from JSON alone will never offer custom input — a complete break of the intended interaction flow.
- Confidence: high

## Findings

### AU-01: "Otro (personalizado)" option absent from structured JSON but mandated by template

- Severity: P1
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 86-159 (JSON spec), 275-279 (template text)
- Claim: The proposal defines choice-type questions in the JSON schema with a fixed array of options (e.g., 8 options for `vertical`, 7 for `formato`), but the template text in section 2 (line 275) states "La última opción siempre es 'Otro (personalizado)' para valor custom" and line 279 prohibits saving "Otro" as a value.
- Evidence: The `questions()` JSON output (lines 86-159) contains no entry with `"label": "Otro (personalizado)"`. The template instructions (line 275) require this option to be appended by the agent during rendering. Line 279 further mandates a follow-up question if "Otro" is selected.
- Impact: An agent that renders questions purely from the JSON response will never display "Otro (personalizado)" because it's not in the data. An agent that follows the template text must append it manually — but the mapping rule (line 278) says "Si el usuario responde con un número, el agente debe mapearlo al value de la opción correspondiente en el JSON." If the agent appends an extra option, the numeric mapping is off-by-one from the JSON array indices. Two different agents will implement this differently, producing inconsistent behavior. Implementers will disagree on whether the JSON is the source of truth or the template text.
- Recommendation: Either (a) add `"allowCustom": true` to choice-type questions in the JSON and have the rendering logic derive the "Otro" option from that flag, with the mapping rule referencing the JSON array indices plus the synthetic last option, or (b) include "Otro (personalizado)" directly as the last entry in the `options` array with a sentinel `value` like `""` and document the follow-up protocol in the JSON via a `customFollowUp` field.
- Suggested test: CLI test: `plan questions --json` output for a `choice` field with `allowCustom: true` must contain enough structured data for an agent to render "Otro" and handle custom input without hardcoding field-specific logic.
- Dedup key: otro-custom-option-missing-from-json

### AU-02: Confirmation parsing semantics too vague for reliable agent implementation

- Severity: P1
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 313
- Claim: Line 313 states "Solo una afirmación sin calificar después del último resumen cuenta como confirmación. Si la respuesta del usuario contiene correcciones, dudas, o adiciones (ej: 'sí, pero cambia la paleta a verde'), NO es confirmación."
- Evidence: The rule "afirmación sin calificar" is natural-language guidance with no structured enforcement. An agent must classify user utterances like "sí", "dale", "ok", "me parece bien", "sí, pero..." into binary confirmed/not-confirmed. The example only covers "sí, pero cambia la paleta a verde" — but what about "sí, todo bien"? Is "todo bien" a qualification or an intensifier? What about "ok vamos" vs "ok, pero..."? The proposal provides no heuristic or structured mechanism (e.g., a `plan confirm-decisions` command that only succeeds if the agent passes a `--confirmed` flag that the agent sets only after detecting explicit confirmation).
- Impact: Different agents will implement confirmation detection differently. Agent A might treat "ok" as confirmed; Agent B might not. Agent A might treat "sí, todo perfecto" as confirmed; Agent B might see "todo perfecto" as a qualification. This creates non-deterministic behavior in the critical yield gate — the entire security model of the hash-based integrity system depends on this being correct.
- Recommendation: Replace natural-language confirmation detection with a structured protocol: (1) present summary, (2) ask "¿Confirmas estas decisiones? Responde 'confirmo' para continuar." (3) only match the exact string "confirmo" (case-insensitive, trimmed) as confirmation. This removes all ambiguity. Alternatively, add a `--confirmation-text` parameter to `confirm-decisions` that logs what the user said, and have the CLI enforce that it matches a known affirmation set.
- Suggested test: Template review: the confirmation step must specify an exact trigger phrase or pattern that an agent can match programmatically, not a semantic classification rule.
- Dedup key: confirmation-parsing-vague-agent-ambiguity

### AU-03: Error recovery table omits GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION (exit 21)

- Severity: P2
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 295-302
- Claim: The error handling table in section 2 lists recovery actions for exit codes 22, 23, 13, 15, 25, and 24, but omits `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (exit 21).
- Evidence: Exit code 21 is used in `resolveQuestions()` (plan-manager.js line 310) and `submitMockup()` (line 382) for hash mismatch detection. The proposal introduces `reset-confirmation` which is the natural recovery path — but the table doesn't mention it. An agent that executes `confirm-decisions` followed by `resolve-questions` and gets exit 21 (e.g., because of a race condition or a manual edit) will have no recovery instruction.
- Impact: An agent encountering exit 21 during the interactive flow has no guidance from the template. It might fall through to a generic error handler, or worse, attempt to re-run `confirm-decisions` without `reset-confirmation`, which would re-hash already-modified decisions and silently accept the tampering.
- Recommendation: Add a row to the error table: `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (21) → "Las decisiones fueron modificadas después de la confirmación. Ejecutar `reset-confirmation` y repetir el flujo de preguntas y confirmación."
- Suggested test: Verify the template error table covers all exit codes that can occur during the section 2 flow (13, 15, 19, 21, 22, 23, 24, 25).
- Dedup key: error-table-missing-exit-21

### AU-04: reset-confirmation from pending_approval loses mockup with no user-facing warning

- Severity: P2
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 218-219, 319-324
- Claim: `reset-confirmation` accepts state `pending_approval` (line 217), renames `mockup.html` to `.stale` (line 219), and reverts to `questions_pending`. The template text (lines 319-324) shows the agent simply executing `reset-confirmation` when the user "wants to correct" — no warning about mockup destruction.
- Evidence: When a plan is in `pending_approval`, the user has already seen and potentially iterated on a `mockup.html`. Resetting to `questions_pending` and renaming the mockup to `.stale` means the user loses all mockup work. The template text (line 319) says "Si el usuario quiere corregir después de confirmar, ejecuta reset-confirmation" — this treats a minor field correction the same as a full mockup destruction.
- Impact: A user who says "cambia el CTA a 'Comprar Ya'" after seeing the mockup will have their mockup destroyed. The agent doesn't warn the user because the template doesn't instruct it to. The `.stale` rename is irreversible in the normal flow (no command restores it).
- Recommendation: Add a warning step to the template: before executing `reset-confirmation` from `ready_for_html` or `pending_approval`, the agent must warn the user that the current mockup will be invalidated. Alternatively, add a `--force` flag to `reset-confirmation` that is required when the plan has a mockup, and the agent must get explicit user consent before using it.
- Suggested test: Verify that the template instructs the agent to warn the user before reset when `mockup.html` exists.
- Dedup key: reset-confirmation-destroys-mockup-no-warning

### AU-05: answer() response omits requiredFieldsComplete — agent must infer transition trigger

- Severity: P2
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 188-198, 60-63
- Claim: The `answer()` return format (lines 188-198) includes `requiredPendingCount` and `optionalPendingCount` but not `requiredFieldsComplete` or `allQuestionsAnswered`. Section on semantics (lines 60-63) defines `requiredFieldsComplete` as the key signal for "agent must present summary and ask for explicit confirmation."
- Evidence: After the last required field is answered, `answer()` returns `requiredPendingCount: 0` but not `requiredFieldsComplete: true`. The agent must compute `requiredFieldsComplete = (requiredPendingCount === 0)` itself. Line 63 states "El agente puede avanzar al paso de confirmación cuando requiredFieldsComplete === true" — but this boolean is only returned by `questions()`, not by `answer()`.
- Impact: An agent that only checks `answer()` return values will not see `requiredFieldsComplete` and must either (a) re-call `questions()` after every `answer()` to get the flag (wasteful and slow for interactive UX), or (b) implement the derivation `requiredPendingCount === 0` itself (fragile — what if the required field count changes in a future version?). Agents that miss this will either never transition to the confirmation step or transition prematurely.
- Recommendation: Add `requiredFieldsComplete` and `allQuestionsAnswered` to the `answer()` return format, mirroring `questions()`. This eliminates the need for the agent to re-query or derive these critical flow-control flags.
- Suggested test: After answering the 6th required field, `answer()` response must include `requiredFieldsComplete: true`.
- Dedup key: answer-omits-required-fields-complete

### AU-06: Context extraction "provided" vs "inferred" boundary is underspecified for agents

- Severity: P2
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 264-266
- Claim: The template instructs agents to save "solo los campos explícitamente provistos por el usuario" (line 265) and prohibits saving "campos inferidos del contexto" with the example "si dice 'banner para mi app', no infieras vertical, paleta, ni cta."
- Evidence: The rule "explícitamente provistos" is ambiguous. If a user says "quiero un banner azul para mi restaurante de comida italiana", is `vertical` provided ("restaurante") or inferred? Is `paleta` provided ("azul") or inferred? Is `formato` provided ("banner") or inferred? The proposal gives one clear negative example but no positive examples of what counts as "explicitly provided" for each field. Different agents will classify the same user input differently.
- Impact: Agent A might save `vertical: "restaurante"` from "banner para mi restaurante"; Agent B might not. This leads to divergent behavior where the same user input produces different `decisions.json` contents, affecting the hash and downstream flow. The agent UX is unpredictable.
- Recommendation: Add a concrete mapping table: for each field, specify 1-2 examples of what counts as "explicitly provided" vs "inferred." For example: `"quiero un banner azul" → formato: "banner" (inferred, don't save), paleta: "azul" (explicit, save)`. Alternatively, change the rule to "only save fields where the user used the exact field name or a direct synonym recognized in a mapping table."
- Suggested test: Provide 3 example user inputs and specify exactly which fields should be saved for each.
- Dedup key: context-extraction-provided-vs-inferred-ambiguous

### AU-07: Section numbering skips from 8 to 10

- Severity: P3
- Category: docs
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 368
- Claim: Section numbering jumps from "### 8." (line 344) to "### 10." (line 368), skipping section 9.
- Evidence: Line 344 starts "### 8. `lib/plan-manager.js` — `assets` incluido en el payload del hash criptográfico + migración". Line 368 starts "### 10. Referencias cruzadas". There is no "### 9."
- Impact: An implementer or reviewer counting sections may think content is missing or misreference sections.
- Recommendation: Renumber section 10 to 9, and section 11 to 10, and section 12 to 11.
- Suggested test: Visual scan of section numbering.
- Dedup key: section-numbering-skip-9

### AU-08: plan questions rejects non-questions_pending states — no read-only inspection mode

- Severity: P3
- Category: ux
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 168
- Claim: Line 168 specifies "Plan no está en mockup:questions_pending → ERROR GSDC_INVALID_STATE (exit 13). Un agente no debe interpretar 'sin preguntas' como permiso para avanzar."
- Evidence: While the security rationale is valid, this design prevents an agent from showing the user what decisions were made after confirmation. In `ready_for_html` or `pending_approval`, the user might ask "what did I choose for vertical?" and the agent has no CLI command to inspect field values. `plan status` shows phase/status but not individual decision values. The agent would need to read `decisions.json` directly — which the proposal prohibits.
- Impact: An agent cannot present a decision summary after the yield gate without reading `decisions.json` directly (forbidden) or parsing the output of a command that doesn't exist. The error recovery instruction for GSDC_INVALID_STATE (line 298) says to run `plan status`, but that doesn't show field values.
- Recommendation: Either (a) allow `plan questions` to work in read-only mode for non-questions_pending states (returning the filled/pending arrays without allowing mutation), or (b) add a `plan decisions --id <ID>` command that returns current field values for any state.
- Suggested test: `plan questions --id <ID>` on a plan in `ready_for_html` should either return read-only data or the proposal should provide an alternative inspection command.
- Dedup key: questions-rejects-non-pending-no-inspection

## Non-Issues Checked

- Exit code collision: Verified exit codes 22-25 don't collide with existing codes 10, 13, 14, 15, 19, 20, 21. OK.
- `optionalAnswered` persistence: The proposal correctly specifies that `answer()` writes `optionalAnswered.assets = true` and `getEmptyFields()` reads it. No race condition since both are within the lock.
- Hash migration v1→v2: The dual-algorithm approach in `resolveQuestions()` and `submitMockup()` is sound — v1 plans pass with 6-field hash, new confirmations use 7-field hash.
- `resetConfirmation()` idempotency for `questions_pending` without prior confirmation: Correctly specified as no-op (line 217).
- Lock acquisition order: `questions()`, `answer()`, `resetConfirmation()` all acquire lock before reading. Consistent with existing functions.
- `writeAtomicJson` via rename: Already used in codebase, safe for atomic writes.
- Double-wrap prevention: `handleSuccess()` wraps manager output in `{ok: true, data: ...}`, manager returns raw data. Test 15 verifies no double-wrap. OK.
- Error code GSDC_ARTIFACT_MISSING (25) vs existing GSDC_ARTIFACT_MISSING (20): Exit code 20 is used in `submitMockup()` for missing `mockup.html`. The proposal uses exit code 25 for missing artifacts within the plan directory. No collision — they share the error code name but have different exit codes. However, the error code string `GSDC_ARTIFACT_MISSING` is used for both exit 20 and exit 25 — this is a naming collision in the error code enum, though exit codes are distinct. Not blocking but worth noting.

## Residual Risks

- The confirmation parsing ambiguity (AU-02) is the most difficult to fully resolve. Even with a structured trigger phrase, agents operating in languages other than Spanish may not follow the instruction, or users may not comply with the exact phrase. A CLI-level enforcement (e.g., `confirm-decisions --user-confirmation-text "confirmo"`) would be more robust but adds complexity.
- The `optionalAnswered` mechanism only covers `assets` today. If additional optional fields are added later, the proposal hardcodes `optionalAnswered.assets` in several places (template line 284, notes line 472) — the generalization path is clear but not formally specified.
- The `.stale` rename in `resetConfirmation()` creates files that are never cleaned up. Over many reset cycles, plan directories could accumulate stale mockups. This is a minor operational risk, not a blocking issue.
