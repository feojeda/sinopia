# Review: modeler

## Summary

- Verdict: approve_with_changes
- Top risk: FIELD_REGISTRY declared as "única fuente de verdad" but lacks `allowCustom` property and "Otro" option entries that `answer()` validation and `questions()` output depend on — implementer must guess the mapping.
- Confidence: high

## Findings

### M-01: FIELD_REGISTRY missing `allowCustom` property

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:54-87 (FIELD_REGISTRY), target.md:252-253 (answer validation)
- Claim: FIELD_REGISTRY is "Constante a nivel módulo — única fuente de verdad" for field definitions.
- Evidence: The registry entries for `vertical`, `formato`, and `cta` (target.md:56-85) define `type: 'choice'` with `options` arrays but no `allowCustom` property. Yet `answer()` validation (target.md:252-253) branches on `allowCustom`: "Si value no coincide con ninguna opción y el campo tiene `allowCustom: true` → aceptar (valor custom)" vs "Si value no coincide y el campo NO tiene `allowCustom` → `GSDC_INVALID_CHOICE_VALUE` (exit 26)". The `questions()` output (target.md:157,174,212) shows `allowCustom: true` for these three fields. The registry doesn't encode this.
- Impact: An implementer cannot determine from FIELD_REGISTRY alone which choice fields accept custom values. They must hard-code this or infer it from the questions() example, breaking the "single source of truth" invariant. A wrong guess either rejects legitimate custom values (broken UX) or accepts values that shouldn't be custom (data integrity).
- Recommendation: Add `allowCustom: true` to the relevant FIELD_REGISTRY entries, or define a derivation rule (e.g., "all choice fields have allowCustom: true unless explicitly set to false"). Document the rule in the plan.
- Suggested test: Create a plan, call `answer(planId, "vertical", "Custom Vertical Value")` — should succeed because `allowCustom: true`. Create a future choice field without `allowCustom`, call `answer(planId, "newField", "Custom Value")` — should get exit 26.
- Dedup key: field-registry-missing-allowCustom

### M-02: "Otro (personalizado)" option absent from FIELD_REGISTRY — transformation rule unspecified

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:56-85 (FIELD_REGISTRY options), target.md:141-221 (questions output)
- Claim: FIELD_REGISTRY is the single source of truth for field definitions including options.
- Evidence: `vertical` in FIELD_REGISTRY (target.md:56-65) lists 8 options. The `questions()` output (target.md:147-156) lists 9 options including `{ "label": "Otro (personalizado)", "value": "", "customFollowUp": "Escribe tu opción personalizada:" }`. Same discrepancy for `formato` (7 vs 8 options) and `cta` (6 vs 7 options). No rule in the plan specifies: (a) which fields get "Otro" appended, (b) what `customFollowUp` text to use, (c) whether `customFollowUp` is derived from the question text or hard-coded.
- Impact: An implementer must guess whether to append "Otro" to all choice fields, only certain ones, or derive it from `allowCustom`. If the rule is wrong, the questions() output differs from spec, breaking the agent template's matching instructions (target.md:363-364).
- Recommendation: Either (a) add "Otro (personalizado)" entries with `customFollowUp` directly to FIELD_REGISTRY options, or (b) specify an explicit transformation rule such as "all choice fields with `allowCustom: true` automatically get an 'Otro' option appended with `customFollowUp` derived from the field's question." Option (a) is simpler and keeps the registry truly self-contained.
- Suggested test: Assert `questions()` output option count equals FIELD_REGISTRY option count (if "Otro" is in registry) or FIELD_REGISTRY option count + 1 (if derived). Verify `customFollowUp` presence matches `allowCustom` for all choice fields.
- Dedup key: field-registry-missing-otro-option

### M-03: Bracket placeholder detection contradicts "exact match only" framing

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:42 (breaking change claim), target.md:104-114 (getEmptyFields)
- Claim: "Placeholder detection: `includes()` → `===` (exact match)." Breaking change documented at target.md:42.
- Evidence: `getEmptyFields` (target.md:111) uses `upper === p` for known placeholders (correct exact match) BUT also checks `val.startsWith('[') && val.endsWith(']')` (target.md:111) which is substring-based bracket detection. A value like `"[see attached document]"` would be classified as placeholder, contradicting the "exact match only" framing. The current code at `plan-manager.js:190` uses `includes()` for both checks; the plan only changes the named-placeholder check to `===` while preserving the substring bracket check.
- Impact: Low — the bracket check is useful and intentional. But the "Breaking Changes" section (target.md:42) frames the change as `includes() → ===` without noting the bracket exception. An implementer or reviewer might incorrectly believe ALL placeholder detection is now exact-match, and either remove the bracket check or be confused by its presence.
- Recommendation: Update the breaking change note (target.md:42) to: "Named placeholder detection: `includes()` → `===` (exact match). Bracket detection (`[...]`) remains substring-based." This removes ambiguity.
- Suggested test: `getEmptyFields({ field: "[see attached]" }, ["field"], {})` returns `["field"]` (bracket placeholder). `getEmptyFields({ field: "TODO: definir" }, ["field"], {})` returns `[]` (not a bracket, not exact match). Both assertions in one test.
- Dedup key: placeholder-exact-match-bracket-exception

### M-04: `questions()` returns `pending: []` when confirmed — hides actual field state

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:230 (confirmed + questions_pending behavior)
- Claim: When `mockup:questions_pending` + `confirmed === true` (between confirm and resolve), `questions()` returns `pending: []` regardless of actual field emptiness.
- Evidence: Target.md:230 states: "mockup:questions_pending + confirmed === true (entre confirm y resolve) → readOnly: true, confirmed: true, pending: []". If a required field somehow became empty after confirmation (e.g., `resetConfirmation()` failed between steps 4 and 5, leaving `confirmed=false` then a separate process set `confirmed=true` manually), the consumer sees `pending: []` and might conclude all fields are filled. The `confirmed: true` flag disambiguates, and the agent template (target.md:358) checks `readOnly` first, but a naive consumer checking only `pending.length` would be misled.
- Impact: Low — the agent template handles this correctly via `readOnly` check. But the contract is semantically inconsistent: `pending` claims there are no pending questions when there might be. A future consumer or test that checks `pending.length` to assert field completeness would get a false positive.
- Recommendation: Either (a) return actual pending fields even when `confirmed: true` (let the consumer use `readOnly` to decide whether to show them), or (b) document explicitly in the questions() contract that `pending` is empty when `confirmed: true` regardless of field state, and consumers must check `confirmed` before interpreting `pending`.
- Suggested test: Create plan, fill 5/6 required fields, confirm, call `questions()`. Assert `pending.length === 0` AND `confirmed === true` AND `readOnly === true`. Verify test comment explains this is intentional "pending masked by confirmed."
- Dedup key: questions-confirmed-pending-empty-mask

### M-05: NORMALIZE_V1 and NORMALIZE_V2 are identical — risk of accidental divergence

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:433-434
- Claim: The plan defines two separate normalize constants that are functionally identical.
- Evidence: `NORMALIZE_V1 = (v) => String(v || '').trim().normalize('NFC')` and `NORMALIZE_V2 = (v) => String(v || '').trim().normalize('NFC')` (target.md:433-434) are character-for-character identical. The plan notes this (target.md:446): "La normalize es la misma (NFC, case-sensitive) para v1 y v2."
- Impact: An implementer seeing two separate constants might assume they should differ and add `toLowerCase()` to one, breaking v1 hash verification for existing plans. The identity is correct but fragile — it relies on a comment for preservation.
- Recommendation: Use a single `NORMALIZE` constant and alias it: `const NORMALIZE = (v) => String(v || '').trim().normalize('NFC'); const NORMALIZE_V1 = NORMALIZE; const NORMALIZE_V2 = NORMALIZE;`. Or keep separate constants but add a runtime assertion: `assert.strictEqual(NORMALIZE_V1('test'), NORMALIZE_V2('test'))` in tests.
- Suggested test: Add test: `assert.strictEqual(NORMALIZE_V1('Módüló'), NORMALIZE_V2('Módüló'))` — if constants diverge, this fails. Also verify v1 fixture hash computed with NORMALIZE_V1 matches the stored hash.
- Dedup key: normalize-v1-v2-identical-fragile

### M-06: Section 7 create() snippet omits `confirmation` object

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:415-428
- Claim: Section 7 shows the initial `decisions.json` structure for new plans.
- Evidence: The snippet (target.md:416-426) shows field values and `optionalAnswered: {}` but omits the `confirmation` sub-object. The current v1.1 code (`plan-manager.js:107-114`) includes `confirmation: { confirmed: false, confirmedAt: null, confirmedBy: null, source: "chat", hashAlgorithm: "sha256-decisions-v1", decisionsHash: "" }`. The plan separately says `hashAlgorithm: "sha256-decisions-v2" en create()` (target.md:428) but doesn't show the full merged structure.
- Impact: An implementer might create new plans without the `confirmation` object, causing `resolveQuestions()` to crash when checking `decisions.confirmation.confirmed !== true` (current code at `plan-manager.js:268`). The `confirmDecisions()` function also writes to `decisions.confirmation` (line 216), which would create it, but `resolveQuestions()` reads it first.
- Recommendation: Show the complete v2 `decisions.json` structure for `create()` including the `confirmation` object with `hashAlgorithm: "sha256-decisions-v2"`.
- Suggested test: After `create()`, read `decisions.json` and assert `decisions.confirmation.confirmed === false` and `decisions.confirmation.hashAlgorithm === "sha256-decisions-v2"` and `decisions.optionalAnswered` exists.
- Dedup key: create-snippet-missing-confirmation

### M-07: `resetConfirmation()` does not explicitly state that required field values are preserved

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:290-296
- Claim: `resetConfirmation()` clears confirmation metadata and optional field values, but the preservation of required field values is only implied.
- Evidence: Target.md:290 states: "Limpia en decisions.json: confirmed = false, confirmedAt = null, decisionsHash = '', hashAlgorithm = '', optionalAnswered = {}, y itera OPTIONAL_FIELDS para poner cada valor a """. Required field values are not mentioned in the clearing list — they are preserved by omission. The test spec (target.md:490) implies preservation: "Reset: confirmed=false, hashAlgorithm='', optionalAnswered={}, optional values=''" — mentions optional values specifically.
- Impact: Low for an experienced implementer, but an implementer could interpret "reset" as clearing all values. If required fields are erroneously cleared, the user loses all their typed answers and must re-enter everything after a reset — a bad UX regression.
- Recommendation: Add an explicit note: "Required field values (vertical, formato, audiencia, paleta, copy, cta) are preserved during reset. Only optional field values are cleared."
- Suggested test: Fill all 6 required fields + optional field, confirm, reset. Assert required field values are unchanged. Assert `assets === ""`. Assert `optionalAnswered === {}`.
- Dedup key: reset-preserves-required-values-implicit

## Non-Issues Checked

- **Hash migration v1→v2 correctness**: `confirmDecisions()` always computes v2 (7 fields), writes `hashAlgorithm: 'sha256-decisions-v2'`. `resolveQuestions()` and `submitMockup()` dispatch on stored algorithm. Normalize functions are identical (NFC, case-sensitive). Migration path is atomic and sound.
- **`answer()` empty-value handling for required choice fields**: `answer(planId, "vertical", "")` succeeds with `warning` but `requiredFieldsComplete` remains false. Agent template instructs to keep asking when `requiredFieldsComplete === false`. Guard is sufficient.
- **Lock semantics**: All mutating functions acquire lock before read, release in `finally`. `questions()` also acquires lock (target.md:236). No deadlock risk observed.
- **`resetConfirmation()` recovery path**: Steps 4→5→6 ordering (decisions.json before plan.json before mockup rename) is correct. Re-execution converges to correct state.
- **Error code distinctness**: Exit codes 13, 15, 20, 21, 22, 23, 24, 25, 26 are all distinct. No collisions.
- **`ensureV2Fields()` read-only in `questions()`**: Modifies in-memory only, doesn't write to disk. First mutating call (`answer()` or `resetConfirmation()`) persists. This is correct.
- **State machine completeness**: `resetConfirmation()` accepts `questions_pending`, `ready_for_html`, `pending_approval`. Rejects `approved` and later. `answer()` only accepts `questions_pending` + `confirmed=false`. `questions()` is read-only for all states. No unreachable or missing transitions detected.
- **`optionalAnswered` semantics**: Set for all optional field responses (empty or not). `getEmptyFields` skips flagged fields. `allQuestionsAnswered` correctly reflects "all questions asked and responded to" not "all fields have values." Naming is accurate.
- **Idempotent history dedup**: Only checks last entry for same action+from. Consecutive duplicate resets deduped. Non-consecutive ones preserved. Reasonable and documented.
- **"confirmo" parsing**: Strip trailing `.`, `!`, `,` then case-insensitive trimmed comparison. `"confirmo."` → accepted. `"confirmo, gracias"` → rejected (comma is not trailing after trimming `"confirmo, gracias"` → still has content after comma). Correct as specified.

## Residual Risks

- The `allowCustom` derivation rule (M-01) could interact with future choice fields that should NOT allow custom values. Without explicit `allowCustom` in the registry, adding a restricted-choice field requires also updating the derivation logic — a hidden coupling.
- The `pending: []` masking when `confirmed: true` (M-04) is safe under the current agent template but could cause issues if a different consumer (e.g., a dashboard UI) uses `questions()` output without checking `confirmed` first.
- The bracket-based placeholder detection (M-03) is intentionally substring-based but could match legitimate bracketed values like `[Logo v2]`. This is a known trade-off not flagged in the plan.
