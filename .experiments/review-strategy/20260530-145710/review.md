# Review Consolidado: docs/PROPOSAL_v1.2_interactive_questions.md

## Meta

- Target: docs/PROPOSAL_v1.2_interactive_questions.md
- Estrategia: 2 — Default recomendado
- Reviewers: pragmatic, operator, modeler, agent-ux
- Fecha: 20260530-145710

## Summary

- Verdict: approve_with_changes
- Top risk: Template lacks recovery guidance for `questions_pending` + `confirmed=true` state, creating a user dead-end confirmed by 3 of 4 reviewers
- Confidence: high

## Findings

### CF-01: FIELD_REGISTRY missing `allowCustom` property for choice fields

- Severity: P2
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js (FIELD_REGISTRY)
- Lines: target.md:54-87
- Claim: FIELD_REGISTRY entries for `vertical`, `formato`, and `cta` omit `allowCustom` despite `answer()` validation and `questions()` output depending on it.
- Evidence: The registry snippet shows `{ id: 'vertical', type: 'choice', options: [...] }` with no `allowCustom`. Yet `answer()` branches on `allowCustom: true` (target.md:252-253) and `questions()` output includes `"allowCustom": true` (target.md:157,174,212). The registry is declared "única fuente de verdad" but doesn't encode this property.
- Impact: Implementer copying the snippet verbatim produces a registry without `allowCustom`. `answer()` would reject all custom values (exit 26), breaking the "Otro (personalizado)" flow entirely.
- Recommendation: Add `allowCustom: true` to the three choice field entries in FIELD_REGISTRY, or define an explicit derivation rule.
- Suggested test: `answer(planId, 'vertical', 'Restaurante Gourmet')` on a fresh plan — must succeed, not exit 26.
- Dedup key: field-registry-missing-allowCustom
- Sources: pragmatic:P2-01, modeler:M-01

### CF-02: "Otro (personalizado)" synthetic option absent from FIELD_REGISTRY — transformation rule unspecified

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:56-85 (FIELD_REGISTRY options), target.md:141-221 (questions output)
- Claim: FIELD_REGISTRY lists 8 options for `vertical`, but `questions()` output lists 9 including `{ "label": "Otro (personalizado)", "value": "", "customFollowUp": "..." }`. No rule specifies which fields get "Otro" appended, what `customFollowUp` text to use, or whether it's derived from `allowCustom`.
- Evidence: Same discrepancy for `formato` (7 vs 8 options) and `cta` (6 vs 7 options). The registry is supposed to be the single source of truth but the transformation from registry to `questions()` output is undocumented.
- Impact: Implementer must guess whether to append "Otro" to all choice fields, only `allowCustom` ones, or hard-code it. Wrong guess breaks agent template matching instructions.
- Recommendation: Either add "Otro" entries with `customFollowUp` directly to FIELD_REGISTRY options, or specify an explicit rule: "all choice fields with `allowCustom: true` automatically get an 'Otro' option appended."
- Suggested test: Assert `questions()` option count = FIELD_REGISTRY option count + 1 for `allowCustom` fields. Verify `customFollowUp` presence matches `allowCustom`.
- Dedup key: field-registry-missing-otro-option
- Sources: modeler:M-02

### CF-03: Template lacks recovery for `questions_pending` + `confirmed=true` state

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:230-231, 358-361, 291-299
- Claim: When `questions()` returns `readOnly: true, confirmed: true, status: "questions_pending"` (between confirm-decisions and resolve-questions), the agent template has no actionable suggestion. The readOnly guidance only covers `ready_for_html`/`pending_approval` and `approved` states. Additionally, a crash between `resetConfirmation()` steps 4-5 can produce `ready_for_html` + `confirmed=false` — another unhandled combination.
- Evidence: Line 358: "Si confirmed: true y estado es ready_for_html/pending_approval, sugiere reset-confirmation." Line 360: "Si approved o posterior, sugiere plan nuevo." Neither covers `questions_pending + confirmed=true`. The `questions()` contract at line 230 explicitly returns this combination. Three reviewers independently identified this gap from different angles (template coverage, crash recovery, dead-end UX).
- Impact: Agent shows "confirmado, esperando transición" but offers no escape hatch. User cannot answer, re-confirm, or reset. Dead-end state requiring manual intervention.
- Recommendation: Add template branch: "Si confirmed: true y readOnly: true → siempre sugerir reset-confirmation (excepto approved o posterior, donde se sugiere plan nuevo)."
- Suggested test: Fixture with `questions_pending + confirmed=true` → `plan questions --json` → verify agent template produces actionable suggestion.
- Dedup key: template-read-only-questions-pending-confirmed
- Sources: pragmatic:P2-02, operator:OP-01, agent-ux:AU-03

### CF-04: Existing test 2 will break with placeholder `includes()` → `===` migration

- Severity: P2
- Category: testing
- Status: valid
- File: tests/plan.test.js
- Lines: tests/plan.test.js:62-73, target.md:42
- Claim: Current test at `plan.test.js:62` uses `decisions.paleta = 'TODO: definir'` which is detected as placeholder by current `includes()` logic. New `getEmptyFields()` uses exact match (`===`), so `'TODO: DEFINIR'` ≠ `'TODO'`. The plan doesn't call out this required test modification.
- Evidence: Verification step 18 confirms `"TODO: definir colores" → no placeholder.` The plan's test section lists new cases but never states "update existing test 2 to use plain 'TODO'."
- Impact: `npm test` fails at line 72 after implementation. Diagnosable but wastes time and could be mistaken for an implementation error.
- Recommendation: Add explicit note: "Update existing test 2 (plan.test.js:62) to use `'TODO'` instead of `'TODO: definir'`."
- Suggested test: After implementation, `npm test` passes with modified test value.
- Dedup key: test-2-placeholder-includes-to-exact-break
- Sources: pragmatic:P2-03

### CF-05: "confirmo" parsing rejects virtually all natural conversational responses

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:402-403
- Claim: The confirmation gate requires exact match of single word "confirmo" (after stripping trailing `.!`,`,`), rejecting "sí confirmo", "lo confirmo", "ok confirmo", "confirmo gracias", etc.
- Evidence: Verification step 19 confirms `"confirmo, gracias"` is rejected. In chat interactions, users almost never respond with a bare single word. Template hard-prohibits execution without exact match (line 406).
- Impact: Adversarial confirmation loop. Minimum 3-5 extra turns per session for users who don't follow the exact format. Erodes trust.
- Recommendation: Allow confirmation when "confirmo" appears as a standalone word via word-boundary match: `/\bconfirmo\b/i.test(userInput.trim())`. Explicitly decide whether "no confirmo" should be handled (negation detection).
- Suggested test: "sí, confirmo" → confirmed. "confirmo gracias" → confirmed. "no confirmo" → rejected (needs explicit decision). "confirmar" → rejected.
- Dedup key: confirmo-exact-match-rejects-natural-input
- Sources: agent-ux:AU-01

### CF-06: Empty required-choice warning has no agent template instruction

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:249, 378-380
- Claim: `answer()` accepts empty string for required choice fields and returns `warning: "empty_value_for_required_choice"`, but the agent template provides no instruction for handling this warning. The flow decision tree checks `requiredFieldsComplete` and `optionalPendingCount` but never the `warning` field.
- Evidence: Line 249 defines the warning. Lines 378-380 show the post-answer decision tree without warning handling. The error table (lines 383-394) covers exit codes, not in-band warnings. Additionally, required text fields have no equivalent warning (asymmetric — operator:OP-05).
- Impact: Agent silently proceeds past an empty required field without telling the user their answer was empty. User sees the agent asking the next question without acknowledging the previous empty answer, creating a confusing loop.
- Recommendation: Add explicit template instruction: "If `plan answer` response contains `warning`, re-prompt the user for that field immediately before proceeding." Add to error handling table as a warning-level entry.
- Suggested test: `answer(vertical, "")` for required choice → response includes warning → agent re-prompts before advancing.
- Dedup key: empty-required-choice-warning-no-agent-handling
- Sources: agent-ux:AU-02, operator:OP-05

### CF-07: resetConfirmation() step 6 failure leaves stale mockup.html after successful state transition

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:296-299
- Claim: If the `mockup.html` rename (step 6) fails after steps 4-5 succeed, the plan transitions to `questions_pending` but `mockup.html` remains. The recovery text only covers crashes between steps 4-5 and 5-6, not a persistent I/O failure after step 5.
- Evidence: Steps 4-5 write decisions.json and plan.json atomically. Step 6 renames mockup.html. A persistent rename failure (permissions, disk full) leaves a stale mockup. `submitMockup()` hash verification prevents submitting stale content, but the artifact misleads the agent.
- Impact: Stale `mockup.html` could mislead the agent/user into thinking a mockup is ready. Re-execution of `resetConfirmation()` retries the rename, so recovery exists if the failure is transient.
- Recommendation: Make step 6 failure non-fatal: catch rename error, include `staleRenameFailed: true` in return value. Document manual cleanup.
- Suggested test: Mock `fs.renameSync` to throw `EACCES` after steps 4-5 → verify return includes `staleRenameFailed: true` and state is correct.
- Dedup key: reset-confirmation-mockup-rename-failure-stale-artifact
- Sources: operator:OP-02

### CF-08: History dedup only checks last entry, creating near-duplicates on crash re-execution

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:296
- Claim: The dedup rule "Si último entry ya tiene action: 'reset-confirmation' con mismo from → no duplicar" only checks the last entry. After crash between steps 5-6 and re-execution, the `from` state differs (original was `ready_for_html`, re-run sees `questions_pending`), so dedup fails and a confusing `from: questions_pending, to: questions_pending` self-transition is added.
- Evidence: Line 296. Crash-recovery re-execution starts from `questions_pending` (already written by step 5). New entry has different `from` than original → no dedup. Also, re-execution processes all steps (not skipping to step 5 as the description implies — operator:OP-03).
- Impact: History accumulates misleading self-transition entries. Functionally harmless but confusing for auditing.
- Recommendation: Extend dedup to also suppress entries where `from === to` and `action === 'reset-confirmation'`. Or accept as-is — pragmatically sufficient for a CLI tool.
- Suggested test: Fixture with history ending in `{action: 'reset-confirmation', from: 'ready_for_html', to: 'questions_pending'}` → call resetConfirmation → verify no new entry with `from === to`.
- Dedup key: reset-history-dedup-last-entry-only
- Sources: pragmatic:P3-06, operator:OP-04, operator:OP-03

### CF-09: ensureV2Fields() persistence for status() unspecified

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:94, 561
- Claim: Notes say `ensureV2Fields()` doesn't persist in `questions()` (read-only) but don't specify whether `status()` (also read-only) should persist.
- Evidence: Line 94 lists `status()` among functions calling `ensureV2Fields()`. Line 561 only exempts `questions()`. If `status()` gains decisions.json reading, calling `plan status` on a v1 plan could silently modify `decisions.json` on disk.
- Impact: Inconsistent behavior — either `status()` persists (surprising for a read operation) or it doesn't (undocumented).
- Recommendation: Add `status()` to the explicit non-persistence note: "`ensureV2Fields()` no persiste en `questions()` ni `status()` (read-only)."
- Suggested test: Fixture v1.1 → call `status()` → verify disk still lacks `optionalAnswered`.
- Dedup key: ensure-v2-fields-status-persistence-ambiguous
- Sources: pragmatic:P3-01

### CF-10: optionalAnswered scope should explicitly exclude required fields

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:256
- Claim: "optionalAnswered[field] = true para toda respuesta" doesn't explicitly state this flag must only be set for `OPTIONAL_FIELDS`. If set for a required field, `getEmptyFields()` at line 108 would skip it, potentially hiding an empty required field from pending counts.
- Evidence: Line 256 in `answer()` behavior. `getEmptyFields()` checks `if (optionalAnswered[field]) return false` before evaluating emptiness. If `optionalAnswered['vertical']` were set, an empty required field could be hidden.
- Impact: Low — `getEmptyFields()` is called with `REQUIRED_FIELDS` or `OPTIONAL_FIELDS` as fieldList, but sloppy implementation could cause `requiredFieldsComplete: true` prematurely.
- Recommendation: Add guard: "Only set `optionalAnswered[field] = true` when `OPTIONAL_FIELDS.includes(field)`."
- Suggested test: `answer(planId, 'vertical', '')` → verify `optionalAnswered` does NOT contain `vertical`.
- Dedup key: optional-answered-scope-required-fields
- Sources: pragmatic:P3-02

### CF-11: Affected functions list for exit code migration is inaccurate

- Severity: P3
- Category: docs
- Status: valid
- File: target.md
- Lines: target.md:36
- Claim: Lists `approveMockup()` as an affected function, but it doesn't exist as a standalone function (it's an action within `transitionState()`). Omits `transitionState()` and `deliver()` which also call `findPlanDir()` and throw exit 15.
- Evidence: `plan-manager.js:426` shows `transitionState()` calls `findPlanDir()`. `plan-manager.js:541` shows `deliver()` calls `findPlanDir()`. Both throw `GSDC_JSON_PARSE_ERROR` (exit 15).
- Impact: Misleading list could cause implementer to focus on wrong functions. The pre-implementation grep audit acts as safety net.
- Recommendation: Correct list to: "findPlanDir(), status(), confirmDecisions(), resolveQuestions(), submitMockup(), transitionState(), deliver()". Remove `approveMockup()`.
- Suggested test: `plan status --id 999` → exit 24. `transitionState('999', 'approve-mockup')` → exit 24.
- Dedup key: affected-functions-list-incomplete-migration
- Sources: pragmatic:P3-03

### CF-12: handleError fallback migration scope should be blanket rule

- Severity: P3
- Category: cli-contract
- Status: valid
- File: bin/gsd-canva.js
- Lines: target.md:314
- Claim: Plan says "Cambiar todos los `err.exitCode || 15` y `err.exitCode || 19` a `err.exitCode || 1`" but `bin/gsd-canva.js:489` has `err.exitCode || 15` for `template register` which isn't in the plan command group.
- Evidence: The general principle implies all fallbacks should be `|| 1`, yet the explicit instruction only covers 15 and 19. Targeted find-replace would catch most but could miss non-plan commands.
- Recommendation: State as blanket rule: "All `handleError` calls with `err.exitCode || <code>` change to `err.exitCode || 1`."
- Suggested test: Inject error without `exitCode` into each CLI handler → verify exit code 1.
- Dedup key: handle-error-fallback-scope-incomplete
- Sources: pragmatic:P3-04

### CF-13: questions() `filled` field object structure unspecified

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:127-222
- Claim: The `questions()` return JSON shows `"filled": []` (empty) but never specifies the structure of a filled field object.
- Evidence: Line 141 shows `"filled": []`. Implementer must infer what properties a filled object has (`id`, `question`, `type`, `value`, `required`).
- Impact: Inconsistent rendering if `filled` objects have different shape than `pending` objects.
- Recommendation: Add a filled field example: `{"id": "vertical", "question": "...", "type": "choice", "value": "SaaS / Producto Digital", "required": true}`.
- Suggested test: Answer one field → call `questions()` → verify `filled[0]` has `id`, `question`, `type`, `value`, `required`.
- Dedup key: questions-filled-object-structure-unspecified
- Sources: pragmatic:P3-05

### CF-14: Placeholder exact-match breaking change omits bracket exception

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:42, 104-114
- Claim: Breaking change section says `includes()` → `===` (exact match), but `getEmptyFields()` also checks `val.startsWith('[') && val.endsWith(']')` which remains substring-based.
- Evidence: Line 42 frames the change as purely exact-match. Line 111 preserves bracket detection. `"[see attached document]"` would be classified as placeholder despite not being an exact match.
- Impact: Implementer/reviewer might incorrectly believe ALL placeholder detection is exact-match and remove the bracket check.
- Recommendation: Update breaking change note to: "Named placeholder detection: `includes()` → `===` (exact match). Bracket detection (`[...]`) remains substring-based."
- Suggested test: `getEmptyFields({ field: "[see attached]" }, ["field"], {})` returns `["field"]` (bracket). `getEmptyFields({ field: "TODO: definir" }, ["field"], {})` returns `[]` (not exact).
- Dedup key: placeholder-exact-match-bracket-exception
- Sources: modeler:M-03

### CF-15: questions() returns `pending: []` when confirmed, masking actual field state

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:230
- Claim: When `confirmed: true`, `questions()` returns `pending: []` regardless of actual field emptiness. Semantically inconsistent — `pending` claims no pending questions when fields may be empty.
- Evidence: Line 230. Agent template handles this via `readOnly` check, but a future consumer checking only `pending.length` would get a false positive.
- Impact: Low under current template, but the contract is misleading for any consumer that doesn't check `confirmed` before interpreting `pending`.
- Recommendation: Either return actual pending fields when confirmed, or document explicitly that `pending` is empty when `confirmed: true` regardless of field state.
- Suggested test: Fill 5/6 required fields, confirm, call `questions()`. Assert `pending.length === 0` AND `confirmed === true` AND `readOnly === true`. Comment that this is intentional.
- Dedup key: questions-confirmed-pending-empty-mask
- Sources: modeler:M-04

### CF-16: NORMALIZE_V1 and NORMALIZE_V2 are identical — fragile against accidental divergence

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:433-434
- Claim: Two separate constants are character-for-character identical. An implementer might assume they should differ and add `toLowerCase()` to one, breaking v1 hash verification.
- Evidence: Both are `(v) => String(v || '').trim().normalize('NFC')`. The plan notes the identity (line 446) but relies on a comment for preservation.
- Impact: Accidental divergence would break hash verification for existing plans without any compile-time or test-time signal.
- Recommendation: Use a single `NORMALIZE` constant aliased: `const NORMALIZE_V1 = NORMALIZE; const NORMALIZE_V2 = NORMALIZE;`. Or add runtime assertion in tests.
- Suggested test: `assert.strictEqual(NORMALIZE_V1('Módüló'), NORMALIZE_V2('Módüló'))`.
- Dedup key: normalize-v1-v2-identical-fragile
- Sources: modeler:M-05

### CF-17: Section 7 create() snippet omits confirmation object

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:415-428
- Claim: Section 7 shows field values and `optionalAnswered: {}` but omits the `confirmation` sub-object. Current v1.1 code includes it with `confirmed: false, confirmedAt: null, hashAlgorithm: "sha256-decisions-v1"`, etc.
- Evidence: The plan separately says `hashAlgorithm: "sha256-decisions-v2" en create()` (line 428) but doesn't show the full merged structure. `resolveQuestions()` reads `decisions.confirmation.confirmed` — missing object would crash.
- Impact: Implementer might create plans without `confirmation` object, causing `resolveQuestions()` to crash on property access of undefined.
- Recommendation: Show complete v2 `decisions.json` structure for `create()` including the `confirmation` object with `hashAlgorithm: "sha256-decisions-v2"`.
- Suggested test: After `create()`, assert `decisions.confirmation.confirmed === false` and `decisions.confirmation.hashAlgorithm === "sha256-decisions-v2"`.
- Dedup key: create-snippet-missing-confirmation
- Sources: modeler:M-06

### CF-18: resetConfirmation() doesn't explicitly state required field values are preserved

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:290-296
- Claim: `resetConfirmation()` clearing list mentions `optionalAnswered`, optional field values, and confirmation metadata, but preservation of required field values is only implied by omission.
- Evidence: Line 290 lists everything that IS cleared. Required fields are not mentioned. An implementer could interpret "reset" as clearing all values.
- Impact: If required fields are erroneously cleared, user loses all typed answers — bad UX regression.
- Recommendation: Add explicit note: "Required field values (vertical, formato, audiencia, paleta, copy, cta) are preserved. Only optional field values are cleared."
- Suggested test: Fill all required + optional, confirm, reset. Assert required values unchanged, `assets === ""`, `optionalAnswered === {}`.
- Dedup key: reset-preserves-required-values-implicit
- Sources: modeler:M-07

### CF-19: Lock orphan after process crash not addressed

- Severity: P3
- Category: state
- Status: valid
- File: lib/lock-manager.js (implicit)
- Lines: target.md:292, 254, 236
- Claim: Three new functions acquire locks released in `finally`, but a hard crash (SIGKILL, OOM) leaves the lock file on disk. No staleness detection specified.
- Evidence: Pre-existing concern amplified by adding three more lock-acquiring functions. `lock-manager.js` exists but proposal doesn't document its staleness handling.
- Impact: After hard crash, all plan operations on that planId hang indefinitely.
- Recommendation: Ensure `lock-manager.js` implements staleness detection (lock age > N seconds → force release) or PID-based validation. Document in proposal.
- Suggested test: Kill process while lock is held. Verify next operation acquires lock after timeout or force-releases stale lock.
- Dedup key: lock-orphan-crash-deadlock-no-staleness-detection
- Sources: operator:OP-06

### CF-20: Multi-field semantic mapping too vague for deterministic agent behavior

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:365-370
- Claim: "Mapear por semántica (contenido → campo), no por posición" is too vague for deterministic behavior across LLM implementations. No examples of ambiguous cases provided.
- Evidence: Different agents may disagree on mapping "colores azul y rojo, el texto es 'compra ya'" to `paleta` vs `copy`. The "when in doubt, ask" fallback mitigates but doesn't define "incierto."
- Impact: Non-deterministic behavior across agent implementations. Safe fallback causes unnecessary re-asking.
- Recommendation: Add concrete heuristic anchors: "colores → paleta", "texto entre comillas → copy", "formato con dimensiones → formato". Add example mappings in template.
- Suggested test: Template review: given ["azul, compra ya, instagram post", "SaaS, 1080x1080, jóvenes"], verify deterministic mapping.
- Dedup key: multi-field-semantic-mapping-vague
- Sources: agent-ux:AU-04

### CF-21: GSDC_PLAN_ARTIFACT_MISSING (exit 25) has zero recovery path

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:389, 523
- Claim: Error 25 tells the agent "Detener flujo" with no suggested recovery action, unlike every other error in the table.
- Evidence: Line 389: "| GSDC_PLAN_ARTIFACT_MISSING (25) | Detener flujo. |" — no secondary suggestion. Compare with exit 24 (suggests `plan create`), exit 23 (asks about `reset-confirmation`).
- Impact: Agent stops and offers user no path forward.
- Recommendation: Change to: "Detener flujo. Sugerir `plan create` para plan nuevo, o intervención manual."
- Suggested test: Verify error table entry for exit 25 includes a recovery suggestion.
- Dedup key: artifact-missing-no-recovery-suggestion
- Sources: agent-ux:AU-05

### CF-22: requiredFieldsComplete flag name invites agent misinterpretation

- Severity: P3
- Category: ux
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:118-119, 378-380
- Claim: `requiredFieldsComplete: true` suggests the flow is "complete" when only required fields are done. Name works against the template instruction to also ask optional fields.
- Evidence: Line 118 clarifies "No es permiso para auto-confirmar ni para saltar opcionales." Despite this note, the name "complete" is semantically loaded. A hasty implementer could skip the assets question.
- Impact: Agent shortcuts by checking only `requiredFieldsComplete` without reading template carefully, skipping the assets question.
- Recommendation: Rename to `requiredFieldsSatisfied` or `allRequiredAnswered` — conveys "required part done" without implying overall completeness. Low cost (rename in response schema + template).
- Suggested test: `requiredFieldsSatisfied: true, optionalPendingCount: 1` → agent asks assets question (not skip to confirm).
- Dedup key: required-fields-complete-name-misleading
- Sources: agent-ux:AU-06

### CF-23: Choice substring matching direction ambiguous

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:364
- Claim: "Si el texto del usuario es case-insensitive substring de exactamente una opción" specifies `user ⊆ option`, but the natural reading (and more useful direction for NLP) would be `option ⊆ user`. User saying "quiero algo para SaaS" gets zero matches under the spec direction.
- Evidence: Line 364. Both directions produce same result for short inputs like "SaaS", but diverge for verbose natural responses. Spec direction (user ⊆ option) means most chat users will always see the full list.
- Impact: Fuzzy matching is limited to very short inputs. Spec direction may not match real user behavior in a chat setting.
- Recommendation: Clarify direction explicitly: `option.value.toLowerCase().includes(userText.toLowerCase())`. Consider whether reversed direction is actually the intended behavior for natural language. Add concrete examples.
- Suggested test: `matchChoices("SaaS", options)` → 1 match. `matchChoices("quiero SaaS", options)` → 0 matches (per spec) or 1 match (per reversed direction).
- Dedup key: choice-substring-matching-direction-ambiguous
- Sources: agent-ux:AU-07

## Non-Issues Checked

- **Hash migration v1→v2 atomicity**: `confirmDecisions()` always computes v2 hash + v2 label in one write. `resolveQuestions()`/`submitMockup()` dispatch on stored algorithm. Normalize functions are identical (NFC, case-sensitive). Migration is correct.
- **Normalize function identity**: `NORMALIZE_V1` and `NORMALIZE_V2` are both NFC case-sensitive. Current code uses identical normalize. No hash breakage for existing plans.
- **questions() never throws GSDC_INVALID_STATE**: Returns `readOnly: true` for all non-questions_pending states. Error table correctly notes this.
- **Exit code distinctness**: Codes 13, 15, 20, 21, 22, 23, 24, 25, 26 are all distinct. No collisions.
- **optionalAnswered semantics for asset decline**: Setting flag on empty-value answer is correct. `getEmptyFields()` skips flagged fields. `allQuestionsAnswered` correctly reflects "all questions asked and responded to."
- **"Otro (personalizado)" rejection**: Both CLI (exit 26) and template (PROHIBIDO) reject this value. Defense in depth is appropriate.
- **Lock serialization and finally release**: All functions acquire locks, release in `finally`. Concurrent access is serialized.
- **resetConfirmation idempotency**: Three-condition no-op check is correct. Re-execution converges to correct state.
- **create() hashAlgorithm**: New plans start with `sha256-decisions-v2`. Legacy plans keep v1 until next confirm. Clean migration.
- **ensureV2Fields lazy migration**: Only persists on first mutation, not on read-only calls. Consistent with `questions()`.
- **State machine completeness**: No unreachable or missing transitions detected for the new functions.
- **"confirmo" stripping logic**: Strip trailing `.!`,`,`, then case-insensitive trimmed comparison. `"confirmo."` → accepted. `"confirmo, gracias"` → rejected (not trailing comma). Correct per spec, though UX concern noted in CF-05.
- **Placeholder detection `===` breaking change**: Documented. `includes()` → `===` avoids false positives like "Nodo" matching "TODO". Intentional and correct.
- **writeAtomicJson usage**: All writes use existing atomic mechanism. Individual file writes are atomic.
- **confirm→resolve window**: `questions_pending + confirmed=true` is handled by `questions()` (readOnly) and `answer()` (GSDC_DECISIONS_LOCKED). Template gap is the concern (CF-03), not the API.
- **Error catch-all row**: Line 393 covers unexpected exit codes with "Detener flujo. Reportar error completo. Sugerir plan status." Adequate.
- **resetConfirmation does not clear required fields**: Only optional fields and confirmation metadata are cleared. Required values persist by design.

## Residual Risks

- **Test suite rewrite scope**: ~30+ new test cases added to a file with 6 existing tests. Plan doesn't specify whether existing tests 1-6 are kept, modified, or replaced. Implementer must decide test migration strategy.
- **Agent template behavioral testing**: "confirmo" parsing and multi-field mapping are agent behavior in Markdown — not CLI-testable. Verification depends on agent correctly following instructions. Manual testing only.
- **Lock manager staleness**: Proposal doesn't document `lock-manager.js` timeout/staleness behavior. Three additional lock-acquiring functions increase deadlock surface after hard crashes.
- **Stale `.stale.*` file accumulation**: Each reset with mockup creates a new `.stale.<timestamp>` file. No cleanup mechanism described. Low severity but operational hygiene concern.
- **allowCustom derivation coupling**: Without explicit `allowCustom` in FIELD_REGISTRY, adding a restricted-choice field in the future requires updating any derivation logic — a hidden coupling.
- **pending: [] masking for different consumers**: Safe under current agent template, but a dashboard UI or different consumer using `questions()` without checking `confirmed` could get false positives on field completeness.
- **Bracket placeholder false positives**: `[Logo v2]` would be classified as placeholder. Known trade-off not flagged in the plan.
- **"confirmo" negation handling**: If changed to word-boundary matching (CF-05 recommendation), "no confirmo" would match. Spec needs explicit negation decision.
