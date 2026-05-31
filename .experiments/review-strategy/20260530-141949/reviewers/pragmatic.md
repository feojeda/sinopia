# Review: pragmatic

## Summary

- Verdict: approve_with_changes
- Top risk: `resetConfirmation()` and `questions()` silently reject `approved` and later states, creating dead-ends with no documented recovery path for post-approval decision correction.
- Confidence: high

## Findings

### P2-01: `resetConfirmation()` rejects `approved` and later states — no recovery path

- Severity: P2
- Category: state
- Status: valid
- File: target.md
- Lines: 282-296
- Claim: `resetConfirmation()` accepts only `questions_pending`, `ready_for_html`, and `pending_approval`. Plans in `mockup:approved` or later phases (`draft`, `refine`, `deliver`) hit `GSDC_INVALID_STATE` (exit 13) with no documented path back.
- Evidence: Target section 4 lists accepted states: "Acepta estados `mockup:questions_pending`, `mockup:ready_for_html` o `mockup:pending_approval`". Repo context shows the state machine includes `approved` and later phases. Section 6 error table for exit 13 says: "Si el estado es `ready_for_html` o `pending_approval`, sugerir `reset-confirmation`" — no suggestion for `approved`.
- Impact: An implementer following the spec literally will reject reset attempts on approved plans. If a stakeholder wants to revise decisions after approval, the agent has no actionable guidance — it falls through to a generic "explain current state" dead-end.
- Recommendation: Either (a) explicitly add `approved` and relevant later states to `resetConfirmation()`'s accepted list (with appropriate cleanup of downstream artifacts), or (b) document that post-approval correction is out of scope and requires a new plan. If (b), add a note to the template's error handling table.
- Suggested test: `resetConfirmation()` on plan in `mockup:approved` — verify either succeeds with proper cleanup or returns a distinct, documented error code (not generic `GSDC_INVALID_STATE`).
- Dedup key: reset-confirmation-approved-state-dead-end

### P2-02: `questions()` returns `GSDC_INVALID_STATE` for `approved`+ — inconsistent with read-only pattern

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md
- Lines: 232
- Evidence: Target section 2 says `questions()` returns read-only snapshot for `ready_for_html` and `pending_approval`. For unrecognized states: "Estado no reconocido → `GSDC_INVALID_STATE` (exit 13)". `mockup:approved` is a recognized state in the machine but is treated as unrecognized by `questions()`.
- Impact: An agent inspecting an approved plan's decisions gets an error instead of a read-only view. This breaks the "inspect before deciding to reset" workflow for approved plans. Inconsistent UX — read-only works for two post-confirmation states but not others.
- Recommendation: Extend read-only behavior to all post-`questions_pending` states (including `approved` and later phases). The function is non-mutating; there is no integrity reason to reject it.
- Suggested test: `questions()` on plan in `mockup:approved` → returns `{ readOnly: true, filled: [...], pending: [] }`.
- Dedup key: questions-read-only-approved-states

### P2-03: Exit code migration verification is insufficiently concrete

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md
- Lines: 36, 484, 527
- Evidence: Target "Breaking Changes" section says "Verificar que ningún template ni script externo dependa de exit 15 para el caso 'plan no encontrado'". This is an instruction to the implementer, not a concrete verification step. The grep in section 9 (`rg "mockup:pending"`) doesn't check for exit code references.
- Impact: An implementer could skip this check or do a superficial grep. If a CI pipeline, shell script, or agent template checks `EXIT_CODE == 15` to detect "plan not found," it will silently break after migration. The plan's own test 14 (`plan status --id 999` → exit 24) only validates the new behavior, not absence of old consumers.
- Recommendation: Add a concrete pre-implementation grep step: `rg "exit.*15\|GSDC_JSON_PARSE_ERROR\|exitCode.*15\|code.*15" templates/ bin/ tests/ docs/ scripts/ 2>/dev/null` and require the implementer to audit each hit. Include this as a numbered step before any code changes.
- Suggested test: Grep audit passes with zero hits on exit-15-for-plan-not-found before implementation begins.
- Dedup key: exit-code-15-migration-verification

### P2-04: `hashAlgorithm: ""` after reset not handled in dispatch logic

- Severity: P2
- Category: state
- Status: valid
- File: target.md
- Lines: 287, 433-438
- Evidence: `resetConfirmation()` sets `hashAlgorithm: ""` (empty string). `computeDecisionsHash()` dispatch says: "Si `confirmation.hashAlgorithm === 'sha256-decisions-v1'` → v1 fields. Si es `sha256-decisions-v2` (o undefined en planes nuevos) → v2 fields." Empty string `""` is neither `'sha256-decisions-v1'`, `'sha256-decisions-v2'`, nor `undefined`. It falls through to no branch or default behavior that is unspecified.
- Impact: After `resetConfirmation()` + re-answering + `confirmDecisions()`, the hash computation could produce incorrect results if the dispatch treats `""` as v1 or as an error. An implementer must guess whether `""` should be treated as `undefined` (v2) or throw.
- Recommendation: Add explicit handling: `if (!hashAlgorithm || hashAlgorithm === 'sha256-decisions-v2') → v2`. Or document that `resetConfirmation()` sets `hashAlgorithm: undefined` instead of `""`. The distinction matters because `JSON.stringify` preserves `""` but drops `undefined`.
- Suggested test: After `resetConfirmation()`, `confirmDecisions()` uses v2 hash (7 fields) and writes `hashAlgorithm: 'sha256-decisions-v2'`. Verify the `"empty string"` path explicitly.
- Dedup key: hash-algorithm-empty-string-after-reset

### P2-05: `readJsonOrThrow()` changes error codes for existing functions without migration list

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md
- Lines: 92-94
- Evidence: Target says `readJsonOrThrow()` returns exit 25 for missing files and exit 15 for corrupt JSON. It also says "Usar en todas las funciones que leen artefactos requeridos dentro de un plan existente." Currently, existing functions like `confirmDecisions()`, `resolveQuestions()`, and `status()` may return exit 15 when `decisions.json` is missing. After migration, they return exit 25 instead.
- Impact: The template's error table (section 6) includes exit 25 with proper handling, but only for the new interactive flow. If existing commands (e.g., `plan status`) previously returned exit 15 for missing `decisions.json` and now return exit 25, any code or agent template handling those errors will misroute. The proposal does not enumerate which existing functions change behavior.
- Recommendation: Provide an explicit list of existing functions that will switch to `readJsonOrThrow()` and document the before/after error code change for each. Example: `status(planId)` → missing `decisions.json` changes from exit 15 to exit 25.
- Suggested test: For each migrated function, verify the new exit code for a plan with missing `decisions.json` is 25 (not 15).
- Dedup key: read-json-or-throw-existing-function-migration

### P3-01: Human-readable output for `plan questions` is underspecified

- Severity: P3
- Category: ux
- Status: valid
- File: target.md
- Lines: 313
- Evidence: "imprime preguntas requeridas primero, numeradas con opciones numeradas, assets al final marcado como '(opcional)', y contadores al final: `Requeridos: 3/6 · Opcionales: 0/1`." No example output is shown. The format for filled fields (do they appear? how?) is unspecified. Whether the "Otro (personalizado)" option appears with its follow-up prompt is unspecified for human mode.
- Impact: Two implementers could produce very different CLI outputs. Agent template section 6 describes rendering behavior that assumes specific output structure, creating a tight coupling to an unspecified format.
- Recommendation: Add a concrete example of human-readable output, covering the partial state (some filled, some pending), all-pending, and all-filled cases.
- Suggested test: Snapshot test on human-readable output for a plan with 2/6 fields filled.
- Dedup key: human-readable-questions-format-underspecified

### P3-02: Recovery re-execution of `resetConfirmation()` creates duplicate history entries

- Severity: P3
- Category: state
- Status: valid
- File: target.md
- Lines: 289-296
- Evidence: The proposal's recovery logic says re-execution is safe because "re-ejecutar ve `state === questions_pending` + `confirmed === true` → procede con cleanup." But re-execution re-runs step 4 (write `plan.json` with history push), creating a duplicate `reset-confirmation` history entry. Step 5 is effectively idempotent, but the history is not deduplicated.
- Impact: After a partial failure + recovery, the audit trail shows two `reset-confirmation` entries for the same logical operation. This is cosmetically confusing but not harmful. An auditor might misinterpret it as two separate reset attempts.
- Recommendation: Either (a) make step 4 idempotent by checking if the latest history entry already has `action: 'reset-confirmation'` with the same `from` state, or (b) document that duplicate entries are expected after recovery and are benign.
- Suggested test: After simulated partial failure + re-execution, verify history has exactly one `reset-confirmation` entry (if idempotent) or document that two entries are acceptable.
- Dedup key: reset-confirmation-duplicate-history-recovery

### P3-03: Context extraction rules in template are inherently subjective

- Severity: P3
- Category: docs
- Status: valid
- File: target.md
- Lines: 329-338
- Evidence: The extraction table shows `"quiero un banner azul para mi restaurante"` → only `paleta: "azul"`, with "restaurante" excluded as "inferido como vertical." But `"Instagram post para promocionar mi curso de cocina"` → `formato: "Instagram Post (1080x1080)"`, where "Instagram post" is mapped to a specific format value despite being similarly ambiguous ("post" could be Story or Post). The boundary between "explicit" and "inferred" is agent-dependent.
- Impact: Different agents (or the same agent in different contexts) will extract different fields from the same user input. No mechanical test can enforce this rule. The PROHIBITED annotation on inference is well-intentioned but unverifiable.
- Recommendation: Acknowledge this as a soft guideline rather than a hard rule. Consider adding a "when in doubt, don't save — ask" heuristic, or limit auto-extraction to only unambiguous keyword matches (e.g., exact option values from `FIELD_REGISTRY`).
- Suggested test: Not mechanically testable. Consider adding a few example-based assertions that validate known-unambiguous extractions (e.g., exact match of a registry option value).
- Dedup key: context-extraction-subjectivity

## Non-Issues Checked

- **Lock semantics**: `questions()` acquires the global lock before reading. Given this is a file-based lock manager, the performance impact is acceptable. Lock release in `finally` is correct.
- **`FIELD_REGISTRY` as single source of truth**: Sound design. All functions derive from it. Adding a new field requires updating only the registry.
- **`answer()` not updating `plan.json`**: Intentional by design. Audit trail in `decisions.json` is sufficient. The `requiredFieldsComplete` flag in the return value eliminates the need for a follow-up `questions()` call.
- **`optionalAnswered` interaction with required fields in `getEmptyFields()`**: When `fieldList` is `REQUIRED_FIELDS`, `optionalAnswered` never matches any entry (it only tracks optional fields). No silent exclusion of required fields.
- **Placeholder `===` vs `includes()` migration**: The change from `includes()` to exact match is correct and well-documented. The test for `"Nodo"` vs `"TODO"` covers this. This is a bug fix, not a regression.
- **Hash v1→v2 migration**: Backward compatibility is addressed. The migration path (confirm → auto-upgrade to v2) is sound. `submitMockup()` dispatch is specified.
- **Error code collision**: `GSDC_PLAN_ARTIFACT_MISSING` (25) vs `GSDC_ARTIFACT_MISSING` (20) — no collision, distinct names and codes.
- **Double-wrap prevention**: `handleSuccess()` wraps raw manager output. Test explicitly checks `parsed.data.data` doesn't exist. The contract is clear.
- **`plan questions` in `ready_for_html`/`pending_approval` returning read-only snapshot**: Well-specified. The agent can inspect without modifying. Reset is required before editing.

## Residual Risks

- **External consumers of exit code 15**: The proposal acknowledges the `findPlanDir()` migration but relies on the implementer to verify no external dependencies. Without a CI-level check (e.g., an exit code assertion in a smoke test), regressions could surface in production after deployment.
- **Agent template compliance**: The "PROHIBIDO" rules in section 6 (no direct `decisions.json` writes, no auto-confirmation) depend on agent behavior. There is no mechanical enforcement — only template instructions. A misbehaving agent could bypass these rules.
- **`mockup:approved`+ state handling**: If the plan later extends to support post-approval editing, `resetConfirmation()` and `questions()` will need updating. The current spec creates a silent gap that may be forgotten.
- **Concurrent agent access**: The global lock serializes operations, but the proposal does not address what happens if two agents simultaneously call `plan answer` for different fields on the same plan. The lock prevents corruption, but one agent may see stale counter values if it read `questions()` before the other agent's `answer()` completes. This is an inherent limitation of the lock-per-plan model and is acceptable for the current use case.
