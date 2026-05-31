# Review: modeler

## Summary

- Verdict: approve_with_changes
- Top risk: `optionalAnswered` state can survive `resetConfirmation()` while the corresponding field value remains stale, creating a semantic contradiction where `questions()` reports a field as "answered" when it was answered for a prior confirmation cycle.
- Confidence: high

## Findings

### M01: `optionalAnswered` not cleared by `resetConfirmation()`

- Severity: P2
- Category: state
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 220-228 (resetConfirmation behavior), 65-66 (optionalAnswered definition)
- Claim: `resetConfirmation()` clears `confirmation.confirmed`, `confirmation.confirmedAt`, and `confirmation.decisionsHash` but does not mention clearing `optionalAnswered`.
- Evidence: Section 4 (line 220) specifies: "Pone `confirmation.confirmed = false`, `confirmation.confirmedAt = null`, `confirmation.decisionsHash = ""`". There is no mention of `optionalAnswered`. Section 1 (line 65) defines `optionalAnswered` as tracking which optional fields were explicitly answered or declined.
- Impact: After `reset-confirmation` → `plan answer` (modify a field) → `plan questions`, `optionalAnswered.assets = true` persists from the prior cycle. If the user changed context (e.g., now wants to provide assets), the system reports `optionalPendingCount: 0` and `allQuestionsAnswered: true`, hiding the assets question. The agent never re-asks. This is a semantic error: "declined" was true for a prior decision cycle, not this one.
- Recommendation: Add explicit instruction to `resetConfirmation()`: clear `optionalAnswered` to `{}` (or at minimum, the implementer must decide the semantics). Document the chosen behavior. If intentional to preserve, explain why in the proposal and add a mechanism for the user to re-open an optional question.
- Suggested test: Create plan → answer all required + decline assets (`optionalAnswered.assets = true`) → confirm → resolve → `resetConfirmation()` → verify `optionalAnswered` is `{}` (or verify intended behavior) → `plan questions` → verify `optionalPendingCount === 1`.
- Dedup key: `optionalAnswered-survives-reset-confirmation`

### M02: `findPlanDirOrThrow` migration changes exit code for existing error path — backward compatibility

- Severity: P2
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js
- Lines: 20-34 (current `findPlanDir`), proposal lines 37-42
- Claim: Migrating `findPlanDir()` from `GSDC_JSON_PARSE_ERROR` (exit 15) to `GSDC_PLAN_NOT_FOUND` (exit 24) changes the exit code for every existing command when the plan ID doesn't exist.
- Evidence: Current `findPlanDir()` at line 29 throws `GSDC_JSON_PARSE_ERROR` / exit 15. The proposal (line 38) says "Actualizar `findPlanDir()` existente para usar el mismo helper, migrando el error de `GSDC_JSON_PARSE_ERROR` a `GSDC_PLAN_NOT_FOUND`." The existing test at `tests/plan.test.js` doesn't test for this specific error code on invalid plan IDs, but any external consumer (agent templates, error handling tables) may depend on exit 15 for "plan not found."
- Impact: Agents or scripts that handle exit 15 for "plan not found" will no longer match. The error table in `canva-mockup.md` (section 6 of the proposal) only documents the new exit codes for the new commands. The existing commands' error behavior changes silently. This is a breaking CLI contract change.
- Recommendation: The migration is correct (exit 24 is semantically better), but it must be explicitly documented as a breaking change. Add a migration note to the proposal listing all existing commands affected and ensure `canva-mockup.md` error table includes both old and new behaviors, or add a "Breaking Changes" section.
- Suggested test: `plan status --id 999` returns exit 24 (not 15) — already listed as test at line 406. Also test `confirm-decisions`, `resolve-questions`, `submit-mockup` with nonexistent plan ID returns exit 24.
- Dedup key: `findPlanDir-exit-code-migration-15-to-24`

### M03: `questions()` requires state `mockup:questions_pending` — prevents re-questioning after partial `answer` in other states

- Severity: P2
- Category: state
- Status: uncertain
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 165-169
- Claim: `questions()` is specified to error with `GSDC_INVALID_STATE` if the plan is not in `mockup:questions_pending`. This means `questions()` cannot be used in `ready_for_html` or `pending_approval` without first calling `resetConfirmation()`.
- Evidence: Line 168: "Plan no está en `mockup:questions_pending` → ERROR `GSDC_INVALID_STATE` (exit 13). Un agente no debe interpretar 'sin preguntas' como permiso para avanzar." The error table in section 6 (line 298) says for `GSDC_INVALID_STATE`: "Ejecutar `plan status --id <ID> --json` y explicar al usuario el estado actual del plan."
- Impact: This is intentional safety, but the error recovery path for `GSDC_INVALID_STATE` doesn't mention `reset-confirmation` as an option. If a user in `ready_for_html` wants to review their answers via `questions()`, the agent has no clear guidance to suggest `reset-confirmation` first. The error table for `GSDC_INVALID_STATE` just says "explain current state." An implementer might not connect this to the `reset-confirmation` flow.
- Recommendation: In the error recovery table (line 298), add a note under `GSDC_INVALID_STATE` for the `questions` command specifically: "Si el usuario quiere revisar o cambiar respuestas, sugerir `reset-confirmation` primero." Alternatively, make `questions()` a read-only operation that works in any mockup state (returns data but doesn't mutate), reserving the state check for `answer()`.
- Suggested test: Call `questions()` on a plan in `ready_for_html` → verify exit 13. Verify error message mentions current state and available actions.
- Dedup key: `questions-state-check-blocks-read-only-review`

### M04: `answer()` field validation list is hardcoded but not sourced from `questions()`

- Severity: P2
- Category: integrity
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 183, 46-55
- Claim: `answer()` validates that `field` is one of a hardcoded list (`vertical`, `formato`, `audiencia`, `paleta`, `copy`, `cta`, `assets`), but this list is defined separately from the field list used by `getEmptyFields()` and `questions()`.
- Evidence: Line 183: "Valida que el `field` sea uno de los campos conocidos (`vertical`, `formato`, `audiencia`, `paleta`, `copy`, `cta`, `assets`)". Line 47-55 shows `getEmptyFields()` takes a `fieldList` parameter. The field definitions in `questions()` (lines 84-158) list 7 fields. These three sources of truth must stay in sync.
- Impact: If a field is added to `questions()` output but forgotten in `answer()`'s validation list, `answer()` rejects it. This is a single-point-of-failure maintenance risk. The proposal mentions `getEmptyFields()` as a shared helper but doesn't define a shared constant for the field list.
- Recommendation: Define a single `KNOWN_FIELDS` constant array (or similar) used by `questions()`, `answer()`, `getEmptyFields()`, and `confirmDecisions()`. Reference this in the proposal.
- Suggested test: Add a test that verifies `answer()` accepts every field ID returned by `questions()`, ensuring no drift.
- Dedup key: `field-list-single-source-of-truth`

### M05: Hash migration in `submitMockup()` not explicitly addressed for v1→v2

- Severity: P2
- Category: integrity
- Status: valid
- File: lib/plan-manager.js
- Lines: 367-384 (submitMockup hash validation)
- Claim: The proposal (section 8, line 346) says "Las 3 funciones que validan hash deben soportar ambos [v1 and v2]" but only names `confirmDecisions()` and `resolveQuestions()` in the migration discussion. `submitMockup()` also recalculates and validates the hash at lines 367-384, and needs the same v1/v2 dispatch.
- Evidence: Section 8 line 346: "Actualmente `confirmDecisions()` (línea 206), `resolveQuestions()` (línea 298) y `submitMockup()` (línea 369) calculan el hash". Lines 360-363 describe the migration logic but the numbered steps only mention `confirmDecisions()` and `resolveQuestions()` behavior. The test at line 402 only tests v1 migration for `resolve-questions`.
- Impact: If `submitMockup()` doesn't implement v1/v2 dispatch, a plan confirmed with v1 hash that passes `resolve-questions` will fail at `submit-mockup` because `submitMockup()` always computes a 7-field v2 hash. This breaks the migration path for existing plans.
- Recommendation: Explicitly state that `submitMockup()` also needs the v1/v2 hash dispatch. Add a test: create fixture with v1 hash → pass `resolve-questions` → pass `submit-mockup` (with mockup.html present).
- Suggested test: Fixture with `hashAlgorithm: "sha256-decisions-v1"` and 6-field hash → `resolve-questions` passes → create mockup.html → `submit-mockup` passes (does not fail with hash mismatch).
- Dedup key: `submitMockup-hash-v1-v2-migration`

### M06: `resetConfirmation()` partial failure recovery assumes `plan.json` write is atomic but `writeAtomicJson` uses rename

- Severity: P1
- Category: state
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 221-229
- Claim: The proposal's recovery argument (line 229) says "Si falla después de escribir `plan.json` (paso 4), el plan ya está en `questions_pending`". But `writeAtomicJson()` at `plan-manager.js:37-42` uses `writeFileSync` + `renameSync`, which is atomic on most filesystems. If step 5 (`decisions.json` write) fails, the system is in a consistent state. However, if step 6 (rename mockup.html to .stale) fails, the plan is in `questions_pending` but `mockup.html` still exists and is valid.
- Evidence: Line 219: "Si existe `mockup.html` en la carpeta del plan, lo renombra a `mockup.html.stale.<timestamp>`". Line 228: step 6 is "Renombrar `mockup.html` a `.stale` si existe". The proposal says "Re-ejecutar `reset-confirmation` completa la limpieza sin efecto adverso" (line 229). But `submitMockup()` validates `mockup.html` existence — if rename fails, a stale `mockup.html` from a prior cycle could be submitted.
- Impact: If `mockup.html` rename fails (permission error, disk full, race condition), the plan reverts to `questions_pending` but retains a valid `mockup.html`. A user could then confirm + resolve + submit-mockup, submitting a stale mockup from a prior iteration. The hash would be different (decisions changed), so this would actually fail at hash validation. But this means the stale file is not truly dangerous. Lowering severity consideration: hash check protects against the worst case. However, the recovery claim "re-ejecutar completa la limpieza" is still valid only if step 6 failure doesn't block re-execution of step 4 (idempotent for `questions_pending`).
- Recommendation: This is mostly fine due to hash protection. Add a note acknowledging that the hash check is the safety net if mockup rename fails. Consider also: should `submitMockup()` reject `.stale` files explicitly, or is the hash check sufficient?
- Suggested test: Simulate step 6 failure (make mockup.html read-only before rename) → verify plan is in `questions_pending` → verify `submitMockup` fails with hash mismatch if decisions changed, or passes with old hash if unchanged.
- Dedup key: `resetConfirmation-partial-failure-mockup-rename`

### M07: `planState` field in `questions()` output exposes internal state representation

- Severity: P3
- Category: cli-contract
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 74
- Claim: The `questions()` output includes `"planState": "mockup:questions_pending"` which is a concatenation of `phase:status`. This format is an internal convention not used in any other CLI output.
- Evidence: Line 74: `"planState": "mockup:questions_pending"`. Other CLI outputs (e.g., `plan status`) return `phase` and `status` as separate fields (see `plan-manager.js:672-674`). The `handleSuccess()` wrapper in `bin/gsd-canva.js:39` wraps the whole result.
- Impact: An agent parsing the output might rely on the `planState` format string. If the internal state naming changes, this breaks consumers. Inconsistency with other commands' output shape makes the API harder to learn.
- Recommendation: Either use separate `phase` and `status` fields (consistent with `plan status` output) or document that `planState` is a derived display field. Consider aligning with existing output shapes.
- Suggested test: Verify `planState` format is `"phase:status"` — or remove it and use separate fields.
- Dedup key: `questions-output-planState-format-inconsistency`

### M08: Proposal missing section 9 — numbering skips from 8 to 10

- Severity: P3
- Category: docs
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 368
- Claim: The proposal sections are numbered 1-8, then skip to 10. Section 9 is missing.
- Evidence: Line 328 ends section 7. Line 345 starts section 8. Line 368 starts section 10. There is no section 9.
- Impact: Minor confusion for implementers referencing section numbers. Could indicate a missing section or a merge artifact. An implementer might wonder if content was accidentally deleted.
- Recommendation: Renumber to be sequential, or add a placeholder noting section 9 was removed/merged.
- Suggested test: N/A
- Dedup key: `proposal-missing-section-9`

### M09: `getEmptyFields()` placeholder detection uses `includes()` — overly broad matching

- Severity: P2
- Category: state
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 48-55
- Claim: The placeholder check `val.toUpperCase().includes(p)` matches substrings. A legitimate value containing "TODO" as a substring (e.g., "Estilo NODO" → contains "TODO" via "nODO" → no, wait: "NODO".toUpperCase() = "NODO", includes("TODO") = true) would be incorrectly flagged as a placeholder.
- Evidence: Line 52: `const isPlaceholder = placeholders.some(p => val.toUpperCase().includes(p))`. The placeholder list includes 'TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR'. Current `confirmDecisions()` at line 190 uses the same logic: `placeholders.some(p => val.toUpperCase().includes(p))`. So this is a pre-existing issue being preserved.
- Impact: Values like "NODO", "PENDIENTE_DE_PAGO" (Spanish for "pending payment"), or "NOTA" (contains no placeholder but close matches could occur) could be rejected. Specifically "NODO" → "NODO".includes("TODO") = true. This is a real risk for Spanish-language content where "pendiente" has broader usage.
- Impact level: Low probability but high confusion when it happens. The proposal preserves a pre-existing bug.
- Recommendation: Change to exact match (`===`) or word-boundary matching (`\b${p}\b`). This is an opportunity to fix the pre-existing issue while extracting the shared helper.
- Suggested test: Set `decisions.paleta = "Nodo"` → verify `getEmptyFields()` does NOT flag it as empty (currently would fail). Set to `"TODO"` → verify it IS flagged.
- Dedup key: `getEmptyFields-placeholder-substring-match`

### M10: `answer()` does not validate against placeholder injection

- Severity: P3
- Category: integrity
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 186
- Claim: `answer()` explicitly does not validate placeholders: "No valida placeholders ni completitud — eso lo hace `confirm-decisions`". This means a user can save `"TBD"` via `answer()`, and it will show as "filled" in `questions()` output.
- Evidence: Line 186: "No valida placeholders ni completitud — eso lo hace `confirm-decisions`". Line 169: "Todos los campos requeridos ya llenos → retorna `requiredPendingCount: 0`". But `getEmptyFields()` flags placeholders, so `questions()` would still show them as pending.
- Impact: Actually, `questions()` uses `getEmptyFields()` which detects placeholders, so a field with "TBD" would appear in `pending`, not `filled`. The contract is consistent: `answer()` accepts anything, `questions()` reports accurately, `confirmDecisions()` blocks. No real issue — the system works correctly through layered validation.
- Recommendation: No action needed. The design is correct.
- Suggested test: Verify `plan answer --field vertical --value "TBD"` succeeds, but `plan questions` still shows `vertical` in `pending` with `requiredPendingCount` unchanged.
- Dedup key: `answer-accepts-placeholders-questions-detects-them`

## Non-Issues Checked

- **Lock ordering for `questions()`**: Proposal correctly specifies acquire lock → read → release in `finally`. This prevents torn reads of `plan.json` + `decisions.json`. Consistent with existing pattern.
- **`answer()` lock ordering**: Acquire → read → validate state → validate confirmation → write → release. Correct.
- **`resetConfirmation()` write ordering**: `plan.json` first (safety), then `decisions.json`, then mockup rename. Correct priority — if later steps fail, plan is already in safe state.
- **Idempotency of `resetConfirmation()` in `questions_pending` without prior confirmation**: No-op, returns success. Correct — no side effects.
- **Double-wrap prevention**: Proposal explicitly states manager returns raw data, CLI wraps via `handleSuccess()`. Test at line 414 verifies `parsed.data.data` does not exist. Correct.
- **Hash migration v1→v2 auto-upgrade**: `confirmDecisions()` always writes `sha256-decisions-v2`. This migrates plans on next confirmation. Correct approach.
- **`create()` initializes `assets: ""` and `optionalAnswered: {}`**: Ensures fields exist from the start. Correct.
- **Exit code 25 (`GSDC_ARTIFACT_MISSING`) vs exit 20**: Exit 20 is for `mockup.html` missing in `submitMockup()` (existing). Exit 25 is new for missing artifacts within a plan (e.g., `decisions.json` or `plan.json`). The distinction is clear: 20 is domain-specific (mockup artifact), 25 is structural (plan integrity artifact). Acceptable.
- **Section 3 of `canva-mockup.md` not modified**: Proposal explicitly notes (line 256) that section 3 runs after `resolve-questions` and is not contradictory. Correct.
- **`list()` tolerance**: Proposal explicitly exempts `list()` from `readJsonOrThrow()` (line 40). Correct — `list()` silently skips corrupt plans.
- **`answer()` returns counters consistent with `questions()`**: Both return `requiredPendingCount` and `optionalPendingCount`. Agent can use either to track progress. Consistent.

## Residual Risks

- **`getEmptyFields()` placeholder substring matching** (M09): Pre-existing issue preserved. Low probability but could cause user confusion with Spanish words containing "TODO" or "PENDIENTE" substrings.
- **`optionalAnswered` semantics after `resetConfirmation()`** (M01): If not cleared, optional fields answered in a prior cycle are invisible in subsequent cycles. Needs explicit decision.
- **`submitMockup()` hash v1 migration** (M05): If implementer misses updating `submitMockup()`, existing v1 plans break at submit stage. Needs explicit mention in implementation instructions.
- **`planState` field format** (M07): If agents build parsers around the `"phase:status"` string format, future state name changes break them. Low risk but worth documenting.
- **Concurrent `resetConfirmation()` + `approve-mockup`**: Both acquire the same global lock, so they're serialized. But after `resetConfirmation()` writes `plan.json` to `questions_pending`, any concurrent `approve-mockup` that was waiting for the lock would then fail with `GSDC_INVALID_STATE` (correct). No issue, but worth noting the global lock ensures safety.
