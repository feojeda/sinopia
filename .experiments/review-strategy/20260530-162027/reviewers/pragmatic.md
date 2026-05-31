# Review: pragmatic

## Summary

- Verdict: approve_with_changes
- Top risk: Template error table omits `GSDC_QUESTIONS_UNRESOLVED` (exit 19), causing agent to halt flow with a generic catch-all when `confirmDecisions()` rejects empty required fields — a recoverable scenario the agent should handle gracefully.
- Confidence: high

## Findings

### P-PRAG-01: Template error table missing GSDC_QUESTIONS_UNRESOLVED (exit 19)

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md (Section 6, template error table)
- Lines: 453-464
- Claim: The template error handling table in the new `canva-mockup.md` Section 2 lists exit codes 21, 22, 23, 24, 25, 26, 13, 15, and a catch-all — but omits `GSDC_QUESTIONS_UNRESOLVED` (exit 19), which `confirmDecisions()` throws when required fields are empty or placeholder (target.md line 528).
- Evidence: The error table rows at lines 453-464 cover every code except 19. The plan explicitly states at line 528: "`confirmDecisions()` valida campos vacíos ... Si hay campos vacíos o placeholder → `GSDC_QUESTIONS_UNRESOLVED` (exit 19)." The catch-all at line 464 says "Detener flujo. Reportar error completo. Sugerir `plan status`." — this is disproportionate for a recoverable "fill missing fields" condition.
- Impact: In normal flow the agent checks `requiredFieldsComplete === true` before calling `confirm-decisions`, so exit 19 is unlikely. But under a race condition (another process modifies `decisions.json` between the last `questions()` call and `confirm-decisions`), the agent would hit the catch-all and halt the user's flow with a generic error, when the correct action is to re-prompt for the missing field. An implementer following the error table literally would not add specific handling for exit 19.
- Recommendation: Add a row to the template error table: `| GSDC_QUESTIONS_UNRESOLVED (19) | Re-ejecutar plan questions. Mostrar campos pendientes. Re-preguntar. |`
- Suggested test: Create a fixture with all fields filled, call `questions()` to verify `requiredFieldsComplete === true`, then manually empty a required field in `decisions.json`, then call `confirm-decisions` → expect exit 19. Verify agent template handles it by re-running `questions()` and re-prompting.
- Dedup key: template-error-table-missing-exit-19

### P-PRAG-02: `answer()` field validation (exit 22) before state validation (exit 13) masks state errors

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 3)
- Lines: 284
- Claim: The specified operation order validates `field ∈ ALL_FIELDS` (exit 22) before state (exit 13). When a plan is in an uneditable state (e.g., `approved`), calling `answer()` with an invalid field name returns exit 22 instead of exit 13.
- Evidence: Target line 284: "validar field ∈ ALL_FIELDS (exit 22) → validar estado mockup:questions_pending (exit 13)". Test at line 568 confirms: "Campo inválido en estado incorrecto → exit 22 (field validation primero, antes de state check)."
- Impact: An agent or developer testing against a locked/approved plan sees "invalid field" when the real problem is the plan's state. Minor debugging friction; the plan explicitly specifies this order and tests confirm it, so it is a deliberate design choice (fail-fast on input validation).
- Recommendation: Acceptable as-is. Consider adding a comment in implementation noting the ordering rationale.
- Suggested test: Already covered by test at line 568.
- Dedup key: answer-field-validation-before-state-validation

### P-PRAG-03: `questions()` error spec does not explicitly list corrupt or missing `plan.json`

- Severity: P3
- Category: cli-contract
- Status: valid
- File: target.md (Section 2)
- Lines: 249-261
- Claim: The `questions()` error behaviors list cases for `decisions.json` (corrupt → exit 15, missing → exit 25) but do not explicitly mention `plan.json` corrupt or missing scenarios. An implementer must infer that `readJsonOrThrow` applied to `plan.json` produces the same exit codes.
- Evidence: Lines 250-252 list three error cases, all about `decisions.json` or plan directory. Lines 118-120 define `readJsonOrThrow` generically. The `questions()` function must read `plan.json` to determine state (phase + status), but the error spec only addresses `decisions.json` paths.
- Impact: Low risk — `readJsonOrThrow` is defined generically and would handle `plan.json` correctly. But an implementer who only reads the `questions()` error case list might use `JSON.parse` directly for `plan.json` instead of `readJsonOrThrow`, producing unstructured errors on corrupt files.
- Recommendation: Add two lines to the `questions()` error behaviors: "`plan.json` corrupto → `GSDC_JSON_PARSE_ERROR` (exit 15)" and "`plan.json` faltante → `GSDC_PLAN_ARTIFACT_MISSING` (exit 25)".
- Suggested test: Fixture with corrupt `plan.json` → `questions()` → exit 15. Fixture with missing `plan.json` → `questions()` → exit 25.
- Dedup key: questions-missing-plan-json-error-spec

### P-PRAG-04: No test verifying `optionalAnsweredStatus` update in `answer()` return value

- Severity: P3
- Category: testing
- Status: valid
- File: target.md (Section 11)
- Lines: 288-301
- Claim: The `answer()` return value includes `optionalAnsweredStatus` (line 298), and the spec states answering an optional field sets `optionalAnswered[field] = true`. But the test plan has no test verifying that `optionalAnsweredStatus` flips from `{"assets": false}` to `{"assets": true}` after answering an optional field.
- Evidence: Test list at lines 565-578 covers field validation, state checks, choice validation, canonical normalization, `requiredFieldsComplete`, and `optionalAnswered` guard — but no test asserts `optionalAnsweredStatus.assets === true` after `answer(assets, "Logo PNG")`.
- Evidence: The test at line 590 (`resetConfirmation` post-reset `questions()`) verifies `optionalAnsweredStatus.assets === false`, confirming the field is expected in the response, but the positive case is untested.
- Impact: If the implementer forgets to compute `optionalAnsweredStatus` in the `answer()` return (only adding it to `questions()`), the agent would never see the status flip and might re-prompt for an already-answered optional field.
- Recommendation: Add test: `answer(assets, "Logo PNG") → response.optionalAnsweredStatus.assets === true`. Add test: `answer(assets, "") → response.optionalAnsweredStatus.assets === true` (declined still counts as answered).
- Suggested test: `answer(planId, 'assets', 'Logo PNG')` then assert `response.optionalAnsweredStatus.assets === true`. Also test `answer(planId, 'assets', '')` → `response.optionalAnsweredStatus.assets === true`.
- Dedup key: answer-optionalAnsweredStatus-not-tested

### P-PRAG-05: `ensureV2Fields()` uses `??` for `hashAlgorithm` — empty string after reset won't be upgraded

- Severity: P3
- Category: state
- Status: valid
- File: target.md (Section 1)
- Lines: 108, 339
- Claim: `resetConfirmation()` sets `hashAlgorithm = ""` (line 339). `ensureV2Fields()` uses `??` (line 108) which does NOT replace empty strings (`"" ?? "sha256-decisions-v2"` = `""`). After reset, `hashAlgorithm` stays empty until `confirmDecisions()` overwrites it.
- Evidence: Line 108: `decisions.confirmation.hashAlgorithm = decisions.confirmation.hashAlgorithm ?? "sha256-decisions-v2"`. Line 339: clears to `""`. The `??` operator only replaces `null`/`undefined`, not empty string.
- Impact: This is actually correct behavior — an empty `hashAlgorithm` with empty `decisionsHash` signals "no hash computed." `confirmDecisions()` always writes v2. `resolveQuestions()` dispatches empty/undefined to the 7-field path. The plan is internally consistent. However, an implementer might incorrectly use `||` instead of `??`, which would upgrade `""` to `"sha256-decisions-v2"` without computing a matching hash, causing a subtle hash mismatch later.
- Recommendation: Add a code comment in `ensureV2Fields()` noting that `??` is intentional (not `||`) because empty string after reset means "no hash computed." Consider adding a test: after reset, `ensureV2Fields()` does NOT upgrade `hashAlgorithm` from `""`.
- Suggested test: `resetConfirmation()` → `answer(vertical, "SaaS")` → read `decisions.json` from disk → `confirmation.hashAlgorithm === ""`.
- Dedup key: ensureV2Fields-nullish-coalescing-empty-string

### P-PRAG-06: Confirm→resolve→fail→reset flow loses optional field data without explicit UX note

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6)
- Lines: 477
- Claim: When `confirm-decisions` succeeds but `resolve-questions` fails twice and the agent calls `reset-confirmation`, the template says "Reanudar desde resumen (campos están completos, no desde cero)." But `resetConfirmation()` clears `optionalAnswered` and optional field values (assets), so the user must re-answer the optional question. The wording "campos están completos" is slightly misleading — only required fields are preserved.
- Evidence: Line 338: "itera OPTIONAL_FIELDS para poner cada valor a ''" and `optionalAnswered = {}`. Line 477: "Reanudar desde resumen (campos están completos, no desde cero)." The post-reset template section at line 481 correctly states "Campos requeridos preservados. Opcionales (assets) limpiados." but the confirm→resolve→fail→reset flow at line 477 does not repeat this clarification.
- Impact: Minimal — after reset, `questions()` returns `optionalPendingCount: 1`, so the agent will naturally re-prompt for assets. The user experience is correct; only the template wording at line 477 is imprecise.
- Recommendation: Change line 477 to: "Error técnico al procesar la confirmación. Tus decisiones se preservaron pero necesitas confirmar de nuevo. Campos requeridos intactos; opcionales (assets) fueron limpiados y se te preguntarán de nuevo."
- Suggested test: Fill all fields including assets → confirm → mock `resolveQuestions` to fail → agent calls reset → `questions()` returns `optionalPendingCount === 1`, `assets === ""`.
- Dedup key: confirm-resolve-fail-reset-optional-data-loss

## Non-Issues Checked

- **Lock ordering and release**: Both `questions()` and `answer()` specify lock-in-`finally` pattern. No deadlock risk identified for single-user CLI.
- **Crash recovery in `resetConfirmation()`**: Plan.json written before decisions.json. Re-running `resetConfirmation()` handles all intermediate crash states idempotently. Well-specified.
- **Hash migration v1→v2**: `confirmDecisions()` always computes v2 (7 fields), `resolveQuestions()` dispatches on stored label. Migration path for existing v1.1 plans is lazy (on first mutation) and correct.
- **`ensureV2Fields()` ordering**: Called after state read from `plan.json` but before accessing `decisions.json` confirmation fields. No conflict between state source and normalization target.
- **`getEmptyFields()` defensive guard**: Only skips optional fields with `optionalAnswered` flag. Required fields are never skipped even if buggy `optionalAnswered` data exists. Test at line 578 confirms.
- **Placeholder detection breaking change**: `includes()` → `===` is documented as intentional. `"PENDIENTE DE REVISIÓN"` and `"TODO: definir colores"` no longer detected. Acceptable trade-off for fixing the `"Nodo"` false positive.
- **Exit code migration 15→24**: Pre-implementation grep audit specified. Existing tests updated (line 604). Clean migration path.
- **`GSDC_ARTIFACT_MISSING` → `GSDC_MOCKUP_MISSING` rename**: Pre/post grep commands specified. No collision with existing codes.
- **CLI `handleError` fallback to `|| 1`**: Blanket rule with grep verification. Correct behavior for unexpected errors.
- **`questions()` never throws `GSDC_INVALID_STATE`**: Stated twice (lines 260-261). Read-only diagnostic function returns `readOnly: true` for all states. Consistent with the catch-all behavior at line 259.
- **Choice value normalization**: Case-insensitive exact match → canonical form. Agent acts as intermediary (substring matching in template, canonical text to CLI). No mismatch between template and CLI contracts.
- **History deduplication in `resetConfirmation()`**: "Same `from` → no duplicate" prevents history spam during crash recovery re-runs. Correct.
- **`FIELD_REGISTRY` as single source of truth**: Derived constants (`REQUIRED_FIELDS`, `ALL_FIELDS`, `OPTIONAL_FIELDS`) used everywhere. No hardcoded field lists remain post-implementation (grep verified).
- **`optionalAnswered` semantics**: Set for all optional answers (empty or not). `getEmptyFields` excludes flagged optionals. `optionalAnsweredStatus` in `questions()` distinguishes "declined" from "never asked." Well-designed.
- **`confirmDecisions()` empty-field validation**: Uses `getEmptyFields(decisions, REQUIRED_FIELDS)` without `optionalAnswered` param (defaults to `{}`). Only checks required fields. Consistent with the flow where agent verifies `requiredFieldsComplete` before calling confirm.

## Residual Risks

- **Concurrent CLI processes**: Lock manager prevents data corruption, but if two agents simultaneously call `questions()` and `answer()`, the second agent's `questions()` response may be stale by the time it calls `answer()`. This is inherent to any CLI-based architecture and acceptable for a single-user tool.
- **Stale mockup after `staleRenameFailed`**: If `resetConfirmation()` cannot rename `mockup.html` (I/O error), the old file remains. The plan documents this with `staleRenameFailed: true` and manual cleanup instructions. No automated recovery — acceptable given rarity of I/O errors.
- **`"confirmo"` parsing accepts `"confirmo pero quiero cambiar"`**: The plan explicitly accepts this trade-off (line 676), noting the user can use `reset-confirmation` after. Low risk but worth monitoring user feedback.
- **`ensureV2Fields()` implementation fragility**: The `??` vs `||` distinction for `hashAlgorithm` (finding P-PRAG-05) is easy to get wrong. A single misplaced `||` would cause silent hash mismatches. Recommend careful code review of this function.
