# Review: modeler

## Summary

- Verdict: approve_with_changes
- Top risk: Conceptual inconsistency where `optionalAnswered.assets` is only marked as `true` when the optional field is answered with an empty string, meaning a valid non-empty answer would fail to mark the question as addressed.
- Confidence: high

## Findings

### P2-001: optionalAnswered flag not set on non-empty optional answers

- Severity: P2
- Category: state
- Status: valid
- File: docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md
- Lines: 285-288, 257-260
- Claim: The proposal states: "Opcional vacio: guardar `""` y marcar `optionalAnswered.assets = true`."
- Evidence: There is no mention of setting `optionalAnswered.assets = true` when a user provides a *non-empty* answer for the optional field `assets`.
- Impact: If a user provides a valid tipography or resource (e.g. `"Montserrat"`), `optionalAnswered.assets` remains unset or `false`. Consequently, `allQuestionsAddressed` will remain `false`, and `confirmDecisions()` may trigger a warning `optional_fields_not_addressed` even though the user fully resolved the question.
- Recommendation: Ensure that `optionalAnswered.assets` is set to `true` whenever the optional field is answered, regardless of whether the value is an empty string (declined) or a non-empty string (specified).
- Suggested test: Answer `assets` with `"Montserrat"`, check `plan questions`, and assert that `allQuestionsAddressed` is `true` and `optionalAnsweredStatus.assets` is `true`.
- Dedup key: optional-answered-non-empty-handling

### P3-001: Typo in hash dispatch version fallback description

- Severity: P3
- Category: docs
- Status: valid
- File: docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md
- Lines: 327-333
- Claim: The proposal states: "Valor vacio o undefined se trata como v2."
- Evidence: In another section, it says: "Cualquier otro caso (v2, vacío, undefined) -> 7 campos... Si es sha256-decisions-v2, vacío, o undefined -> 7 campos."
- Impact: While functionally correct (v2 has 7 fields), using both "v2" and "vacío/undefined" in multiple places without clearly establishing the default algorithm label in the confirmation JSON could lead to minor implementation confusion.
- Recommendation: Clarify that if the stored `hashAlgorithm` is empty or undefined, it defaults to using the v2 schema (7 fields) for checking, but new confirmations always write `"sha256-decisions-v2"`.
- Suggested test: N/A (Documentation/Clarity only).
- Dedup key: hash-algorithm-fallback-clarity

## Non-Issues Checked

- Unicode normalization NFC format is stable and avoids hash discrepancies due to character representations.
- Separation of `requiredFieldsComplete` and `allQuestionsAddressed` provides clear semantic states.

## Residual Risks

- None.
