# Review: modeler

## Summary

- Verdict: approve_with_changes
- Top risk: Exit 19 (`GSDC_QUESTIONS_UNRESOLVED`) missing from the template error-handling table — an agent hitting this during `confirm-decisions` will stop the flow instead of guiding the user to fill missing fields.
- Confidence: high

## Findings

### M-01: GSDC_QUESTIONS_UNRESOLVED (exit 19) absent from template error table

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6, template error table)
- Lines: 453–464
- Claim: The template error table lists every error the agent must handle during the interactive flow.
- Evidence: `confirmDecisions()` calls `getEmptyFields(decisions, REQUIRED_FIELDS)` and throws `GSDC_QUESTIONS_UNRESOLVED` (exit 19) when any required field is empty or placeholder (target.md:528). The template error table (lines 454–464) includes codes 21, 22, 23, 24, 25, 26, 13, and 15, but **not** code 19. The catch-all row ("Cualquier otro código → Detener flujo") would handle it, producing a generic stop instead of a targeted "these required fields are still empty, please answer them" message.
- Impact: An implementer following only the template table will not provide specific recovery for exit 19. If a required field was stored as `""` (e.g., after receiving the `empty_value_for_required_choice` warning and not re-asking), `confirm-decisions` throws 19 and the agent stops the flow entirely rather than looping back to collect the missing field. The user sees a generic error instead of actionable guidance.
- Recommendation: Add a row to the template error table: `GSDC_QUESTIONS_UNRESOLVED (19) → Re-ejecutar plan questions --json, mostrar campos pendientes, recolectar respuestas faltantes, re-intentar confirm-decisions.` Also ensure the template's flow checks `requiredFieldsComplete` strictly before calling `confirm-decisions` (it currently does, so exit 19 is a safety net — but the safety net should still have explicit handling).
- Suggested test: Create a plan, answer 5/6 required fields with valid values, skip one (store `""` with warning), then call `confirm-decisions`. Verify the agent response shows which field is missing and re-enters the question loop, rather than stopping.
- Dedup key: exit-19-missing-from-template-error-table

### M-02: Tabla de errores omits existing exit codes used by new functions

- Severity: P3
- Category: docs
- Status: valid
- File: target.md
- Lines: 613–624
- Claim: The summary "Tabla de errores" is a complete reference for exit codes the new functions produce.
- Evidence: The table (lines 613–624) lists only codes 20–26. However, the new functions also produce existing codes: `GSDC_INVALID_STATE` (13) from `answer()` and `resetConfirmation()`, `GSDC_JSON_PARSE_ERROR` (15) from `readJsonOrThrow()` used by all new functions, and `GSDC_QUESTIONS_UNRESOLVED` (19) from `confirmDecisions()`. The table title "Tabla de errores" implies completeness but is effectively "new codes only."
- Impact: A developer building CLI error handlers from this table alone will miss codes 13, 15, and 19. The per-function specs list these correctly, but the summary table creates a misleading single-source impression.
- Recommendation: Either rename to "Nuevos códigos de error" or add existing codes 13, 15, 19 with a note that they are pre-existing. Include a cross-reference to the per-function error lists.
- Suggested test: Verify that every exit code mentioned in `questions()`, `answer()`, `resetConfirmation()` error sections appears in the table or is explicitly cross-referenced.
- Dedup key: error-table-missing-existing-codes

### M-03: `allQuestionsAddressed` naming implies value presence, not presentation completion

- Severity: P3
- Category: state
- Status: valid
- File: target.md
- Lines: 139–140
- Claim: The name `allQuestionsAddressed` clearly communicates its semantics.
- Evidence: The proposal clarifies (line 139): "Tracks question-presentation completion, not value presence. Puede ser `true` cuando `assets === ""` (declinado)." The word "addressed" is ambiguous — it could mean "answered with a real value" or "presented to the user and responded to (including decline)." An implementer reading only the field name (in a JSON response) might use it to skip the optional-asset prompt, assuming the user already provided a value. The note (line 138) that `requiredFieldsComplete` "No es permiso para auto-confirmar ni para saltar opcionales" partially guards against this, but the two flags together create confusion: `requiredFieldsComplete=true` means "all required values present," while `allQuestionsAddressed=true` means "all questions presented (including declined optionals)."
- Impact: An implementer could incorrectly branch on `allQuestionsAddressed` to skip optional prompts or auto-confirm, treating it as "all values filled." This would bypass the asset question for users who haven't been asked yet.
- Recommendation: Consider renaming to `allQuestionsPresented` or `allFieldsAddressed` (aligning with the "presentation" semantics). Alternatively, add a prominent doc comment in the response JSON spec and the FIELD_REGISTRY section emphasizing that this tracks presentation, not value presence.
- Suggested test: N/A (naming/semantics, not behavioral).
- Dedup key: allQuestionsAddressed-naming-ambiguity

### M-04: Non-mockup phase counters are semantically misleading

- Severity: P3
- Category: state
- Status: valid
- File: target.md
- Lines: 258
- Claim: `questions()` returns meaningful counter values for non-mockup phases.
- Evidence: Line 258: "Non-mockup phases (draft, refine, deliver): phase y status reflejan plan.json. Contadores se computan de decisions.json como normal." `getEmptyFields()` iterates `FIELD_REGISTRY` fields (vertical, formato, audiencia, paleta, copy, cta, assets) regardless of phase. For a plan in `draft` phase, `decisions.json` likely has none of these fields, so all 7 would be "empty," producing `requiredPendingCount: 6, optionalPendingCount: 1`. While `readOnly: true` and `suggestedAction: "suggest_new_plan"` prevent editing, the counters suggest the plan needs attention that it doesn't actually need — those fields may be irrelevant for non-mockup phases.
- Impact: An implementer adding diagnostic logic or dashboard views based on `requiredPendingCount` across all plans would see non-mockup plans flagged as "incomplete." Could trigger false alerts or confuse monitoring.
- Recommendation: Either (a) set counters to `null`/omit them for non-mockup phases, or (b) add a `phaseApplicable: false` flag, or (c) document explicitly in the response spec that counters are only meaningful when `phase === "mockup"`.
- Suggested test: Create a plan, transition to `draft` phase, call `questions()`. Verify response does not produce misleading `requiredPendingCount: 6` or documents that the value is not meaningful.
- Dedup key: non-mockup-phase-counter-semantics

## Non-Issues Checked

- **Hash v1→v2 migration**: `confirmDecisions()` always writes v2 (7 fields); `resolveQuestions()`/`submitMockup()` dispatch on stored algorithm. Existing v1-confirmed plans continue to work. Migration is atomic — hash and label always match post-confirm.
- **`ensureV2Fields()` non-persistence in read-only functions**: Correct design. `questions()` and `status()` normalize in memory without writing; first mutation (`answer`, `resetConfirmation`, `confirmDecisions`) persists. No inconsistency.
- **Placeholder detection `includes()` → `===`**: Breaking change is documented (line 44). Fixes existing bug ("Nodo" matching "TODO"). Bracket detection `[...]` remains substring-based. Intentional and correct.
- **`answer()` validation ordering**: Field (22) → state (13) → ensureV2 → confirmed (23) → choice (26). Total order prevents deeper checks on invalid shallower premises. Test case explicitly validates (line 568–569).
- **`optionalAnswered` defensive guard**: `getEmptyFields()` checks `OPTIONAL_FIELDS.includes(field)` before trusting the flag. Required fields cannot be hidden by a spuriously set flag. Test explicitly validates (line 578).
- **`resetConfirmation()` crash recovery**: Writing `plan.json` first ensures re-execution can complete idempotently. Partial failure between steps 4–5 is diagnosable and recoverable. Documented at line 349.
- **Lock usage in `questions()`**: Read-locking prevents reading partially-written state during concurrent writes. Consistent with existing pattern.
- **`optionalAnswered` semantics**: Flag set for all optional responses (empty or not). `getEmptyFields` skips flagged optionals. After reset, both flag and optional values cleared. `optionalAnsweredStatus` distinguishes "declined" from "never asked." Internally consistent.
- **`confirmDecisions()` empty-value rejection**: Stores empty string via `answer()` warning, but `confirmDecisions()` catches it via `getEmptyFields` (exit 19). Double protection — template checks `requiredFieldsComplete`, API validates on confirm.
- **Duplicated line 260–261**: Editorial copy-paste (`questions()` never throws `GSDC_INVALID_STATE`). No implementation ambiguity — the spec is clear on this point elsewhere.
- **`staleRenameFailed` non-throwing behavior**: Graceful degradation. Mtime check and hash mismatch provide safety nets. Template informed to guide manual cleanup.
- **State machine completeness**: All transitions accounted for. `resetConfirmation()` accepts `questions_pending`, `ready_for_html`, `pending_approval`; rejects `approved` and non-mockup. Unrecognized states safely default to `readOnly: true`.
- **`suggestedAction` dispatch logic**: Four cases (ask_questions, retry_resolve, suggest_reset, suggest_new_plan) cover all combinations of phase, status, confirmation, and history. The crash-recovery case (questions_pending + confirmed + last history = reset-confirmation) correctly maps to `suggest_reset`.
- **`NORMALIZE` single function**: One normalize function (`NFC`, case-sensitive) used for v1 and v2. Versioning only in field list (6 vs 7). Prevents divergence.
- **`readOnly` vs `confirmed` independence**: `questions()` returns both flags independently. `readOnly` is derived from state/confirmation; `confirmed` reflects `decisions.json`. Consumers can distinguish "locked after confirm" from "locked by phase." Correct.

## Residual Risks

- **Manual `decisions.json` editing bypass**: The proposal prohibits direct editing, but if it occurs, `optionalAnswered` can desync from field values (e.g., value present but flag unset, or flag set but value empty). No integrity check detects this. Mitigated by "PROHIBIDO" rule and CLI-only access.
- **Confirmed v1 plan hash excludes `assets`**: Plans confirmed under v1 hash (6 fields) don't include `assets` in their integrity check. Manual editing of `assets` post-confirmation would not be detected by the v1 hash. This is a pre-existing limitation, not introduced by this proposal, and is closed for any newly confirmed plans (v2).
- **Concurrent agent interleaving between `confirm-decisions` and `resolve-questions`**: These are separate CLI calls. A concurrent `resetConfirmation()` between them would clear the confirmation, causing `resolve-questions` to fail. The template handles this (retry once, then reset), but the user experience involves re-confirmation. Lock manager prevents true concurrency but not interleaved sequential calls from different agents.
- **Non-atomic multi-file writes in `resetConfirmation()`**: `plan.json` and `decisions.json` are written separately. Crash between writes leaves partial state. Idempotent re-execution mitigates but recovery depends on the agent recognizing the partial state (via `questions()` suggestedAction).
