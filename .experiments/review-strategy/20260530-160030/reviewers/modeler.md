# Review: modeler

## Summary

- Verdict: approve_with_changes
- Top risk: `ensureV2Fields()` claims to guarantee a complete `confirmation` skeleton but only replaces the entire object when falsy — v1.1 plans with an existing `confirmation` object silently retain `undefined` for new fields (`confirmedBy`, `source`), breaking the stated invariant.
- Confidence: high

## Findings

### F1: `ensureV2Fields()` does not guarantee complete `confirmation` skeleton for v1.1 plans

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:98
- Claim: "`ensureV2Fields()`: Garantiza skeleton completo antes de cualquier acceso a `confirmation.*`."
- Evidence: The implementation shown uses `decisions.confirmation = decisions.confirmation || { ...full skeleton... }`. For v1.1 plans, `decisions.confirmation` already exists (with `confirmed`, `confirmedAt`, `decisionsHash`, `hashAlgorithm`) so the `||` short-circuits and the full skeleton is never applied. Fields `confirmedBy` and `source` remain `undefined` rather than `null`. The repo context (line 62-77) confirms v1.1 `confirmation` objects lack these fields. `resetConfirmation()` (target.md:310) later sets `confirmedBy = null`, creating an inconsistency where `confirmedBy` is `undefined` before first reset but `null` after.
- Impact: Any code comparing `confirmation.confirmedBy !== null` evaluates to `true` for `undefined !== null`, potentially executing guarded logic incorrectly. JSON serialization of `undefined` omits the key entirely, differing from `"confirmedBy": null`. An implementer trusting the "skeleton completo" guarantee will not add defensive checks.
- Recommendation: Replace the single `||` assignment with per-field patching using nullish coalescing:
  ```js
  decisions.confirmation = decisions.confirmation || {};
  decisions.confirmation.confirmed = decisions.confirmation.confirmed ?? false;
  decisions.confirmation.confirmedAt = decisions.confirmation.confirmedAt ?? null;
  decisions.confirmation.confirmedBy = decisions.confirmation.confirmedBy ?? null;
  decisions.confirmation.source = decisions.confirmation.source ?? "chat";
  decisions.confirmation.decisionsHash = decisions.confirmation.decisionsHash ?? "";
  decisions.confirmation.hashAlgorithm = decisions.confirmation.hashAlgorithm || "sha256-decisions-v2";
  ```
- Suggested test: Create a v1.1 fixture (confirmation without `confirmedBy`/`source`) → call `ensureV2Fields()` → assert `confirmation.confirmedBy === null` (not `undefined`) and `confirmation.source === "chat"`.
- Dedup key: ensureV2Fields-incomplete-confirmation-skeleton

### F2: `allQuestionsAnswered` naming conflates interaction-completeness with value-completeness

- Severity: P2
- Category: docs
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:124-125
- Claim: "`allQuestionsAnswered`: `true` cuando `requiredPendingCount === 0 && optionalPendingCount === 0`."
- Evidence: The note at target.md:125 states: "Tracks question-presentation completion, not value presence. Puede ser `true` cuando `assets === ""` (declinado)." The word "answered" in common English implies a substantive response was given. But the flag becomes `true` when an optional field is "declined" with an empty value. Meanwhile `requiredFieldsComplete` (target.md:123) is value-based: "true cuando `requiredPendingCount === 0`". The two counters use different standards — one tracks non-empty/non-placeholder values, the other tracks interaction events — but their names do not distinguish this.
- Impact: An implementer or agent author might gate confirmation on `allQuestionsAnswered` thinking all fields have substantive values, when in reality it only means the user was asked. Conversely, they might skip prompting for assets when `requiredFieldsComplete === true` and `allQuestionsAnswered === false`, assuming an empty-value answer would not flip the flag. The note clarifies the semantics but the name actively misleads.
- Recommendation: Rename to `allQuestionsAddressed` or `interactionComplete` to signal that the question was handled (not necessarily answered with a value). Alternatively, rename `requiredFieldsComplete` to `requiredFieldsFilled` for symmetry. If the name stays, add a `"_comment"` or rename the field to make the distinction structural rather than just documented.
- Suggested test: Unit test: `answer(assets, "")` → `allQuestionsAnswered === true` and `assets === ""`. Verifies the semantic contract is maintained regardless of naming.
- Dedup key: allQuestionsAnswered-naming-vs-semantics

### F3: `answer()` field validation (exit 22) position unspecified relative to state/confirmation checks

- Severity: P3
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:268
- Claim: "Orden de operaciones: acquire lock → leer plan.json + decisions.json → validar estado mockup:questions_pending → ensureV2Fields() → validar confirmation.confirmed !== true → validar choice value → escribir"
- Evidence: The order of operations lists state validation (exit 13), then confirmation validation (exit 23), then choice validation (exit 26). Field membership validation ("Valida que field esté en ALL_FIELDS", target.md:260) is not positioned in this sequence. The test cases (target.md:517) specify exit codes individually but no test covers the intersection: an invalid field on a confirmed plan, or an invalid field on a wrong-state plan. An implementer placing field validation after state check would return exit 13 for an invalid field on a non-`questions_pending` plan, while one placing it first would return exit 22.
- Impact: Inconsistent error codes across implementations. Agent error handling in the template (target.md:407-417) dispatches on exit code — receiving exit 13 instead of exit 22 for an invalid field would trigger wrong recovery logic (suggesting `reset-confirmation` or `plan status` instead of `plan questions`).
- Recommendation: Explicitly position field validation as the first validation step after lock acquisition and file reads, before state check: `acquire lock → read → validate field ∈ ALL_FIELDS (exit 22) → validate state (exit 13) → validate !confirmed (exit 23) → validate choice (exit 26) → write`. Add test: `answer(--field INVALID_FIELD, wrong state)` → exit 22.
- Suggested test: `answer(planInReadyForHtml, 'nonexistent_field', 'value')` → exit 22 (not exit 13).
- Dedup key: answer-field-validation-order-unspecified

### F4: `questions()` response structure underspecified for non-mockup phases

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:244
- Claim: "Non-mockup phases (draft, refine, deliver) → readOnly: true, status refleja fase real, suggestedAction: 'suggest_new_plan'."
- Evidence: The example JSON response (target.md:135-233) shows `"phase": "mockup"` and `"status": "questions_pending"`. For non-mockup phases, the `phase` and `status` values are unspecified. The `pending` and `filled` arrays, `requiredPendingCount`, `optionalPendingCount`, `requiredFieldsComplete`, and `allQuestionsAnswered` counters are also unspecified. Since `decisions.json` exists in non-mockup phases (created during mockup), `getEmptyFields()` would compute counters based on stored values, but the response shape is undefined. An implementer could hardcode `"phase": "mockup"` or return a response inconsistent with the mockup-phase contract.
- Impact: Non-mockup phase responses may have incorrect or misleading structure. Since `suggestedAction: "suggest_new_plan"` prevents the agent from trying to answer questions, practical impact is low. But diagnostic tooling (e.g., `plan questions --json` for debugging) would produce unreliable output.
- Recommendation: Add a clause specifying that for non-mockup phases, `phase` and `status` reflect `plan.json` values, counters are computed from `decisions.json` as normal, and the response shape is identical to the mockup response but with `readOnly: true`.
- Suggested test: Create a plan in `draft` phase → call `questions()` → assert `phase === "draft"` (not `"mockup"`) and `readOnly === true`.
- Dedup key: questions-non-mockup-phase-response-unspecified

### F5: `answer()` response omits `optionalAnswered` status for the answered field

- Severity: P3
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:272-283
- Claim: `answer()` returns `{ planId, field, value, requiredPendingCount, optionalPendingCount, requiredFieldsComplete, allQuestionsAnswered }`.
- Evidence: When answering an optional field (e.g., `assets`), `optionalAnswered[field]` is set to `true` internally (target.md:127, 270), but the response does not include this flag. The agent must either call `questions()` again to see `optionalAnsweredStatus` (target.md:129) or track the state locally. For required fields this is irrelevant, but for optional fields the only signal that the field was "answered" (vs still pending) is the change in `optionalPendingCount`. If `optionalPendingCount` was already 0 (because the field was answered before and then reset), answering again would show no counter change, making it impossible to distinguish from a no-op.
- Impact: Agent cannot reliably determine whether an optional field's `optionalAnswered` flag was set without an additional `questions()` call. In edge cases (re-answering a previously-answered optional after partial state), the counter alone is insufficient.
- Recommendation: Add `"optionalAnswered": true` to the `answer()` response when the field is optional, mirroring the internal flag. This is a single boolean that disambiguates without requiring a full `questions()` call.
- Suggested test: `answer(assets, "")` → response contains `"optionalAnswered": true`. `answer(vertical, "SaaS")` → response does NOT contain `"optionalAnswered"` (or it is absent/undefined for required fields).
- Dedup key: answer-response-missing-optionalAnswered-flag

## Non-Issues Checked

- **`confirmDecisions()` always computes v2 hash**: Consistent with `resolveQuestions()` dispatch logic. After confirm, stored label and hash always match (7 fields). v1 plans are correctly handled by `resolveQuestions()` reading the stored `hashAlgorithm`.
- **`resetConfirmation()` write ordering (plan.json before decisions.json)**: Crash leaves re-executable state. Recovery path is well-documented (target.md:314). History may accumulate an extra entry — acknowledged as acceptable.
- **Placeholder detection `===` breaking change**: Intentionally narrowing from `includes()` to exact match. Breaking change documented (target.md:44). Pre-existing "Nodo" false positive (repo context line 58) is fixed.
- **Error code separation (exit 24 vs 25)**: `GSDC_PLAN_NOT_FOUND` (24) = directory missing, `GSDC_PLAN_ARTIFACT_MISSING` (25) = file missing within plan. Clear, non-overlapping semantics.
- **Lock acquisition order**: All three new functions acquire lock first, release in `finally`. No TOCTOU gap.
- **`confirmo` regex**: `/\b(confirmo|confirmado)\b/i` with negation check. Edge cases ("no, confirmo" — comma breaks `\s+`, accepted correctly; "confirmo que no" — accepted, which is arguably correct; "confirmar" — not matched, correct) behave reasonably.
- **Idempotent `resetConfirmation()` with history dedup**: Only checks last entry for same `from` state. Tradeoff documented. Acceptable for crash recovery.
- **`answer()` permissive + `confirmDecisions()` strict**: Intentional layered defense. `answer()` accepts empty values (with warning for choice fields), `confirmDecisions()` rejects via `getEmptyFields()`. Prevents premature blocking while maintaining final validation.
- **Choice value case-insensitive normalization**: `answer()` normalizes to canonical form from registry. Hash uses NFC case-sensitive normalize. Stored value is always canonical, so hash is deterministic. Consistent.
- **`optionalAnswered` guard in `getEmptyFields()`**: Checks `OPTIONAL_FIELDS.includes(field)` before honoring the flag, preventing a spurious flag on a required field from hiding empty values. Test explicitly verifies this (target.md:528).
- **`questions()` never throws `GSDC_INVALID_STATE`**: Returns `readOnly: true` with `suggestedAction` instead. Consistent read-only semantics for a query operation.

## Residual Risks

- **`approveMockup()` not listed in `ensureV2Fields()` consumers**: target.md:98 lists seven functions but `approveMockup()` is not among them. If it accesses `confirmation.confirmedBy` without `ensureV2Fields()`, v1.1 plans could expose `undefined`. Not verified because the function is not detailed in the proposal.
- **Stale mockup rename failure**: Handled with `staleRenameFailed: true` flag (target.md:311) but requires manual cleanup. No automated retry or scheduled cleanup mechanism.
- **Multi-process race conditions**: File-based locks mitigate concurrent access but do not eliminate race conditions in network-mounted or unusual filesystem scenarios. Not a regression from current design.
