# Review: modeler

## Summary

- Verdict: approve_with_changes
- Top risk: `NORMALIZE_V1`/`NORMALIZE_V2` naming implies divergent implementations that are identical, creating a latent hash-compatibility break hazard for future maintainers.
- Confidence: high

## Findings

### M-01: NORMALIZE_V1 and NORMALIZE_V2 are identical functions with versioned names that promise divergence

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed, section 8)
- Lines: target.md:452-453
- Claim: Two normalize functions (`NORMALIZE_V1`, `NORMALIZE_V2`) encode hash algorithm versioning through their names, but their implementations are byte-identical (`String(v || '').trim().normalize('NFC')`).
- Evidence: Target section 8 explicitly defines both functions with the same body and then states: "La normalize es la misma (NFC, case-sensitive) para v1 y v2." The only actual difference between v1 and v2 is the **field list** (6 vs 7 fields), not the normalize function. The naming anchors the version to the normalize function rather than to the field list.
- Impact: A future maintainer reading `NORMALIZE_V2` will reasonably assume it differs from `NORMALIZE_V1` and may "correct" it (e.g., adding `toLowerCase()` for a "v2 normalization improvement"), silently breaking hash verification for all migrated v1 plans. The names encode a versioning promise the functions do not fulfill. The real versioning axis (field list) is handled elsewhere in `computeDecisionsHash` via an `if` on `hashAlgorithm`.
- Recommendation: Use a single `NORMALIZE` constant. The version dispatch should only live in the field-list selection, which already exists. If a future normalize change is needed, introduce it then with a genuinely different function. Alternatively, rename to `NORMALIZE_DECISIONS` to avoid implying versioning.
- Suggested test: Existing tests cover hash compatibility. Add a comment-based assertion in the test file that `NORMALIZE_V1.toString() === NORMALIZE_V2.toString()` to make the identity explicit and detect accidental divergence.
- Dedup key: normalize-v1-v2-identical-naming

### M-02: `optionalAnswered` map trusts convention over enforcement — a required field entry would silently hide it from validation

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed, section 1)
- Lines: target.md:106-118, target.md:263
- Claim: `getEmptyFields()` treats `optionalAnswered[field] === true` as a skip regardless of whether `field` is required or optional. The invariant that only optional fields appear in `optionalAnswered` is enforced only by the `answer()` implementation rule ("solo cuando `OPTIONAL_FIELDS.includes(field)`"), not by `getEmptyFields()` itself.
- Evidence: The proposed `getEmptyFields()` at target.md:108-118 does `if (optionalAnswered[field]) return false` with no check on whether `field` belongs to `OPTIONAL_FIELDS`. The caller for required fields (`getEmptyFields(decisions, REQUIRED_FIELDS)`) passes no `optionalAnswered` argument (defaulting to `{}`), which is safe today. However, if a future refactor passes `decisions.optionalAnswered` uniformly (e.g., `getEmptyFields(decisions, REQUIRED_FIELDS, decisions.optionalAnswered)`), or if `answer()` has a bug setting it for required fields, the consequence is that a required field would appear "complete" while being empty — and `confirmDecisions()` uses `getEmptyFields` output to determine `requiredPendingCount`, which gates the confirmation flow.
- Impact: A single-line bug in `answer()` (forgetting the `OPTIONAL_FIELDS.includes(field)` guard) or a well-intentioned refactor of `getEmptyFields` callers would cause `requiredFieldsComplete: true` when a required field is actually empty. `confirmDecisions()` would still catch it via its own `getEmptyFields` call, but the counters returned by `answer()` and `questions()` would be wrong, and the agent would skip re-prompting and attempt confirmation, only to hit exit 19. The user experience degrades from "please answer this field" to an opaque error.
- Recommendation: Add a defensive guard in `getEmptyFields()`: `if (optionalAnswered[field] && OPTIONAL_FIELDS.includes(field)) return false;` This makes the function self-protecting regardless of caller behavior. Alternatively, rename the parameter to something more explicit like `answeredOptionalFields` and document the invariant in the function signature.
- Suggested test: Create a test where `decisions.optionalAnswered = { vertical: true }` (a required field) and verify that `getEmptyFields(decisions, REQUIRED_FIELDS, decisions.optionalAnswered)` still returns `vertical` as pending.
- Dedup key: optional-answered-no-structural-guard-for-required-fields

### M-03: Choice value matching semantics in `answer()` left implicit — "coincide" undefined as exact vs substring

- Severity: P2
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js (proposed, section 3)
- Lines: target.md:259
- Claim: The proposal says "Si `value` no coincide con ninguna opción (case-insensitive) y el campo tiene `allowCustom: true` → aceptar (valor custom)." The word "coincide" is ambiguous between exact case-insensitive match and substring match. Meanwhile, the template (target.md:371) prescribes substring matching: "Si el texto del usuario es case-insensitive substring de exactamente una opción."
- Evidence: The template at target.md:371 explicitly says "substring de exactamente una opción" for agent-side matching. But `answer()` at target.md:259 just says "no coincide." If `answer()` uses exact match and the agent sends a substring (e.g., `--value "SaaS"` for option `"SaaS / Producto Digital"`), it would be accepted as a custom value because `allowCustom: true`. Conversely, if `answer()` uses substring match, a value like `"Instagram"` would match both `"Instagram Post"` and `"Instagram Story"`, requiring disambiguation logic inside `answer()` that the proposal doesn't describe. The current codebase has no choice validation at all (no `FIELD_REGISTRY`, no `answer()` function), so there is no precedent.
- Impact: If `answer()` does exact match but the template does substring matching, the agent would confirm a match with the user but send the confirmed full text, making the mismatch invisible in the happy path. However, if the agent sends the raw user input without confirmation, non-standard values get stored as "custom" (e.g., `"SaaS"` instead of `"SaaS / Producto Digital"`). More critically, for any future choice field with `allowCustom: false`, the matching semantics become a hard gate — an exact-match implementation would reject legitimate substring matches that the template showed to the user.
- Recommendation: Explicitly state in the proposal that `answer()` uses **exact case-insensitive comparison** against option `value` fields. This aligns with the template flow (confirm → send full option text) and is simpler to implement correctly. Add a post-impl verification: `rg "coincide" lib/plan-manager.js` should not appear — replace with a precise comment like `// Exact case-insensitive match against FIELD_REGISTRY option values`.
- Suggested test: `answer(vertical, "SaaS")` with `allowCustom: true` → accepted as custom value (not matching "SaaS / Producto Digital"). `answer(vertical, "saas / producto digital")` → matches "SaaS / Producto Digital" (case-insensitive exact). This confirms exact-match semantics.
- Dedup key: choice-value-matching-exact-vs-substring-undefined

### M-04: `questions()` and `resetConfirmation()` behavior for non-mockup phases (draft/refine/deliver) is unspecified

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:238, target.md:293
- Claim: The state machine includes phases beyond mockup (`draft:pending`, `draft:approved`, `refine:pending`, `deliver:ready`, `deliver:delivered`). `questions()` says "Cualquier estado post-questions_pending (...) etc. → readOnly: true." `resetConfirmation()` says "Estado `approved` o posterior → GSDC_INVALID_STATE." Neither function explicitly enumerates non-mockup states or defines what happens when a plan in `draft:pending` has `questions()` called on it.
- Evidence: The state machine (repo-context.md:20) lists `draft`, `refine`, `deliver` phases. The current `transitionState()` in plan-manager.js:456-499 transitions through `start-draft` → `draft:pending` → `approve-draft` → `draft:approved` → `start-refine` → `refine:pending` → `approve-refine` → `deliver:ready` → `deliver:delivered`. For `questions()`, the `status` field in the response would need to return e.g., `"draft:pending"` — the proposal says "status refleja el estado real del plan" but doesn't confirm the response shape for non-mockup phases. For `resetConfirmation()`, "approved o posterior" presumably means `mockup:approved` and beyond, but the check is against the status string — an implementer needs to know whether `draft:pending` counts as "posterior to approved."
- Impact: Low. In practice, `questions()` would return `readOnly: true` for any non-mockup state, which is correct. `resetConfirmation()` would reject with `GSDC_INVALID_STATE` for any post-mockup state, also correct. But an implementer must infer this from "etc." and "o posterior" rather than from an explicit state list or a phase-level check.
- Recommendation: Add one sentence clarifying: "For plans past the mockup phase entirely (draft, refine, deliver), `questions()` returns `readOnly: true` with the current phase:status, and `resetConfirmation()` returns `GSDC_INVALID_STATE`." Alternatively, check `planData.phase !== 'mockup'` as the gate rather than enumerating statuses.
- Suggested test: Call `questions()` on a plan in `draft:pending` → `readOnly: true`, `status: "draft:pending"`. Call `resetConfirmation()` on same → exit 13.
- Dedup key: non-mockup-phase-behavior-unspecified

### M-05: `ensureV2Fields()` does not migrate the `confirmation` object — new fields `confirmedBy`/`source` absent from v1 plans

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed, sections 1 and 7)
- Lines: target.md:96, target.md:436-444
- Claim: The proposed `create()` initializes `confirmation` with `confirmedBy: null` and `source: "chat"` (target.md:439-440), which do not exist in the current v1.1 structure (repo-context.md:70-76 shows no `confirmedBy` or `source`). `ensureV2Fields()` only migrates `optionalAnswered` and `assets` (target.md:96). Existing v1 plans calling `confirmDecisions()` would have `confirmation.confirmedBy` and `confirmation.source` as `undefined`.
- Evidence: Current `create()` at plan-manager.js:107-114 already includes `confirmedBy: null` and `source: "chat"`. But existing plans created before this code was added (or before the current v1.1 migration) would lack these fields. The current `confirmDecisions()` at plan-manager.js:216-223 overwrites the entire `confirmation` object, setting `confirmedBy: options.by || "user"` and `source: "chat"`. So in practice, `confirmDecisions()` always sets these fields on confirmation. The risk is limited to code that reads `confirmation.confirmedBy` or `confirmation.source` before the first confirmation.
- Impact: Low. No proposed function reads `confirmedBy` or `source` — they appear to be write-only metadata. But `resetConfirmation()` clears `confirmed = false`, `confirmedAt = null`, `decisionsHash = ""`, `hashAlgorithm = ""` without mentioning `confirmedBy` or `source`. After a reset, these fields retain their pre-reset values (or remain `undefined`). On re-confirmation, `confirmDecisions()` overwrites the entire object, so stale values are replaced. No data integrity risk, but the omission from `resetConfirmation()` is inconsistent with the "full reset" semantics implied by the function's name.
- Recommendation: Either (a) add `confirmedBy: null, source: "chat"` to `resetConfirmation()`'s cleanup, or (b) add them to `ensureV2Fields()` for completeness. Option (a) is more consistent — a reset should clear all confirmation metadata.
- Suggested test: Create v1 fixture without `confirmedBy`/`source` → call `confirmDecisions()` → verify `confirmation.confirmedBy` and `confirmation.source` are set. Then `resetConfirmation()` → verify they are cleared.
- Dedup key: ensure-v2-fields-missing-confirmation-metadata

### M-06: `allQuestionsAnswered` name conflates "flow completed" with "all values non-empty"

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js (proposed, section 1)
- Lines: target.md:123
- Claim: `allQuestionsAnswered` is `true` when `requiredPendingCount === 0 && optionalPendingCount === 0`. But optional fields with `optionalAnswered[field] = true` and `value === ""` contribute 0 to `optionalPendingCount`. So `allQuestionsAnswered: true` can hold when an optional field has an empty value.
- Evidence: Target.md:123 defines the counter. Target.md:125 states: "Se set `optionalAnswered[field] = true` para **toda** respuesta a campo opcional (vacío o no)." Target.md:110-118 shows `getEmptyFields` skips fields where `optionalAnswered[field]` is true. So an optional field answered with `""` has `optionalAnswered.assets = true`, `getEmptyFields` skips it, `optionalPendingCount` decrements, and `allQuestionsAnswered` becomes `true` despite the empty value.
- Impact: Low in practice — the semantics are correct for the question flow (the question was asked and answered, even if the answer is "nothing"). But an agent or future developer reading `allQuestionsAnswered: true` might reasonably infer that all 7 fields have non-empty values and skip displaying the optional field's value. This is a naming/interpretation risk, not a logic bug.
- Recommendation: Consider renaming to `allQuestionsFlowComplete` or documenting in the JSON response that this flag tracks question-presentation completion, not value presence. Alternatively, the Notes section (target.md:596) already clarifies: "`optionalAnswered` set para toda respuesta opcional (vacío o no)." Adding a similar note directly in the `questions()` response schema would prevent misinterpretation at the point of use.
- Suggested test: `answer(assets, "")` → verify `allQuestionsAnswered === true` and `optionalPendingCount === 0` while `assets === ""`. Confirm the flag is semantically correct (flow complete) but the name is potentially misleading.
- Dedup key: all-questions-answered-naming-conflation

## Non-Issues Checked

- **`confirmDecisions()` state validation**: Verified that current code at plan-manager.js:174 already enforces `mockup:questions_pending`. The proposal modifies hash logic and adds `ensureV2Fields()`/`getEmptyFields()` but does not remove this check. No gap.

- **`resetConfirmation()` recovery ordering**: Verified the write-order (plan.json before decisions.json) is correct. Re-execution proceeds cleanly from step 5 if step 5 failed, and from step 6 if only step 6 failed. History deduplication handles the `same action + same from` case correctly for normal re-execution.

- **Hash v1→v2 migration path**: Verified that `confirmDecisions()` always writes v2 (7 fields) regardless of incoming `hashAlgorithm`. `resolveQuestions()` and `submitMockup()` dispatch on stored `hashAlgorithm`. For pre-existing v1 plans (already confirmed), they use 6-field normalization. For newly confirmed plans, they use 7 fields. Migration is atomic — hash and label always match after confirmation.

- **`answer()` empty-value-for-required-choice flow**: Verified that `answer()` accepts empty with warning, `getEmptyFields()` still counts it as pending, `requiredFieldsComplete` stays false, and `confirmDecisions()` would reject. Multiple layers of protection are consistent.

- **"confirmo" regex coverage**: Checked edge cases: "sí, confirmo" (accepted), "no confirmo" (rejected via negation), "confirmar" (rejected — not in alternation), "reconfirmo" (rejected — no word boundary before "confirmo"). The regex is reasonable for the use case.

- **Placeholder detection breaking change**: Verified `includes()` → `===` is documented under Breaking Changes (target.md:42). Current test at plan.test.js:62 uses `'TODO: definir'` which would no longer be a placeholder. The proposal identifies this and requires updating the test (target.md:481). Consistent.

- **Error code uniqueness**: Verified exit codes 20, 22, 23, 24, 25, 26 are new and don't collide with existing codes 13, 14, 15, 19, 21. `GSDC_MOCKUP_MISSING` (20) replaces `GSDC_ARTIFACT_MISSING` for the mockup-specific case. Clean.

- **`questions()` lock acquisition**: Specified at target.md:243. Consistent with existing pattern (all mutating functions acquire lock).

- **`create()` hashAlgorithm change**: v1 → v2 in `create()` is intentional and aligns with the overall migration strategy. New plans start at v2.

- **`optionalAnswered` only set by `answer()`**: Verified that only `answer()` and `resetConfirmation()` modify `optionalAnswered`. `questions()` reads it (via `getEmptyFields`). No other function touches it. The write paths are controlled.

- **CLI `handleError` fallback blanket rule**: The proposal requires all `err.exitCode || <code>` → `err.exitCode || 1`. Checked bin/gsd-canva.js: current code has varied fallbacks (10, 13, 14, 15, 16, 18, 19, 20). The proposal correctly identifies this as a systematic fix. Post-impl grep is specified.

## Residual Risks

- **`resetConfirmation()` history duplication on recovery**: If step 4 (plan.json write) succeeds but step 5 fails, re-execution reads current state `questions_pending`, computes `from: "questions_pending"`, which differs from the first execution's `from: "ready_for_html"`. The dedup check (same action + same from) would not catch this, producing a redundant history entry. Not harmful, but could confuse audit trails.

- **`confirmation.source` and `confirmation.confirmedBy` lifecycle**: These fields are set by `create()` and overwritten by `confirmDecisions()`, but `resetConfirmation()` does not clear them. After reset + re-confirm, old values are replaced. No data corruption, but the reset semantics are incomplete for these fields.

- **`answer()` for future choice fields with `allowCustom: false`**: All current choice fields (vertical, formato, cta) have `allowCustom: true`. The validation logic handles `allowCustom: false` (target.md:260), but no such field exists yet. The exact-match vs substring-match ambiguity (M-03) becomes more critical when a non-customizable choice field is added.

- **`questions()` response `status` field for non-mockup phases**: The proposal says `status` reflects the real plan status, but the response shape (e.g., whether `status` includes the phase prefix like `"draft:pending"`) is not shown in the example JSON. Agents parsing the response may not handle non-mockup status values.
