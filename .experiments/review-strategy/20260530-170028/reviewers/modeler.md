# Modeler Review

## Finding 1 — High — `confirmDecisions()` can confirm before optional questions are addressed

**Evidence:** The plan defines `allQuestionsAddressed` as required + optional pending counts both zero, and says the agent must ask `assets` before confirmation. But `confirmDecisions()` only validates `getEmptyFields(decisions, REQUIRED_FIELDS)` before hashing, so an API caller can confirm with `optionalPendingCount > 0` and `optionalAnswered.assets !== true`.

**Impact:** The durable confirmation contract does not match the user-facing invariant. A plan can become confirmed while an optional question was never presented, making `allQuestionsAddressed` advisory rather than enforced and allowing silent omission of assets.

**Required change:** Either make `confirmDecisions()` reject pending optional fields with a dedicated error until every optional field has `optionalAnswered[field] === true`, or explicitly redefine confirmation as requiring only required fields and remove the "ask assets before confirming" invariant from the contract.

**Suggested test:** Fill all six required fields, leave `assets === ""` and `optionalAnswered.assets !== true`, then call `confirmDecisions()`. Expected result should be unambiguous: either a failure for unresolved optional questions or a documented success with `allQuestionsAddressed === false`.

## Finding 2 — High — `allowCustom: true` contradicts the required rejection of `"Opción personalizada"`

**Evidence:** All current choice fields (`vertical`, `formato`, `cta`) have `allowCustom: true`. The `answer()` contract says any non-option value is accepted when `allowCustom` is true. Later tests require `answer(choice, "Opción personalizada")` to fail with `reason: "not_in_options"`.

**Impact:** The implementation cannot satisfy both rules. If it follows `allowCustom`, the test fails; if it rejects `"Opción personalizada"`, then there is an undocumented reserved-value rule overriding custom input.

**Required change:** Add an explicit reserved-label rejection before the `allowCustom` branch for `"Otro"`, `"Opción personalizada"`, and similar UI sentinel labels, or remove the rejection test and accept those as literal custom values.

**Suggested test:** For each `allowCustom` choice field, verify a real custom value succeeds and each reserved UI label fails with a distinct `reason`, e.g. `"reserved_ui_label"`.

## Finding 3 — Medium — The plan both forbids and specifies manual `"Otro"` options

**Evidence:** The Antigravity contract says never add manual `"Otro"` / `"Opción personalizada"` options because Antigravity provides free text automatically. The human CLI rendering example for `plan questions` includes `9) Otro (personalizado)`.

**Impact:** There are two competing semantics for the same question surface. Agents or users using non-JSON/human output can see a sentinel option that `answer()` is supposed to reject, while the JSON surface is required not to include it.

**Required change:** Decide whether the CLI human renderer is a true fallback UI or only a display aid. If it is a fallback UI, define how `"Otro"` maps to a subsequent free-text value without ever passing the sentinel to `answer()`. If not, remove `"Otro"` from the human output example.

**Suggested test:** Snapshot human `plan questions` output and assert the chosen contract: either no `"Otro"` appears, or selecting the displayed custom option cannot result in `plan answer --value "Otro"` / `"Opción personalizada"`.

## Finding 4 — Medium — `ensureV2Fields()` ordering is self-contradictory for state behavior

**Evidence:** The plan says `ensureV2Fields()` runs "después de state validation, antes de cualquier operación" for all functions. But `questions()` never throws invalid-state and must inspect `decisions.confirmation.confirmed` to choose `readOnly`, `editable`, and `suggestedAction`. Legacy plans may lack `confirmation`, so `questions()` needs `ensureV2Fields()` before that state-response computation.

**Impact:** Implementers can reasonably place `ensureV2Fields()` too late and crash or misclassify legacy plans without `confirmation`. This undermines the stated migration invariant.

**Required change:** Split the rule: read files, call `ensureV2Fields()` before any access to `decisions.confirmation.*`, then perform state validation or state-response classification. If any function truly needs state validation first, call out that exception explicitly.

**Suggested test:** Legacy fixture without `confirmation`, with `plan.phase = "mockup"` and `plan.status = "questions_pending"`, calls `questions()` and returns `confirmed: false`, `readOnly: false` without throwing.

## Finding 5 — Medium — `hashAlgorithm` has conflicting meanings: default algorithm vs active confirmed hash label

**Evidence:** `create()` initializes `confirmation.hashAlgorithm` to `"sha256-decisions-v2"` even when `confirmed: false`; `resetConfirmation()` clears it to `""`; `ensureV2Fields()` only defaults nullish values, not empty strings; `resolveQuestions()` treats empty/undefined as v2 fallback.

**Impact:** The same field alternates between "default algorithm for future confirmation" and "algorithm for the currently stored decisionsHash." That makes unconfirmed plans semantically inconsistent and risks future code interpreting a non-empty `hashAlgorithm` as evidence that a valid hash exists.

**Required change:** Define `hashAlgorithm` as meaningful only when `confirmed === true` and `decisionsHash` is non-empty, then initialize and reset it to `""`; or define it as the default algorithm and never clear it on reset. Keep one meaning across create, migration, reset, confirm, and resolve.

**Suggested test:** Assert the full confirmation invariant after create, reset, and confirm: for unconfirmed plans, `confirmed === false`, `decisionsHash === ""`, and `hashAlgorithm` follows the chosen single meaning; for confirmed plans, hash and label are both present and aligned.

## Finding 6 — Low — `filledCount` / `filled` semantics are underspecified for declined optional fields

**Evidence:** `allQuestionsAddressed` can be true when `assets === ""` because the user declined assets. The response also exposes `filledCount` and `filled`, but the plan does not define whether an optional field answered with an empty value appears as filled or only as addressed.

**Impact:** Consumers may display inconsistent summaries: one implementation may show 7/7 filled after declined assets, another 6/7 filled but all addressed. Both are plausible from the current text.

**Required change:** Define `filled` as value-present fields only, or as addressed fields including declined optionals. If both concepts matter, expose separate names such as `valueFilledCount` and `addressedCount`.

**Suggested test:** Answer all required fields and decline assets with `value ""`; assert exact `filled`, `filledCount`, `pending`, `optionalAnsweredStatus`, and `allQuestionsAddressed` values.
