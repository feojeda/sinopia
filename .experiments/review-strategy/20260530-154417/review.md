# Review Consolidado: docs/PROPOSAL_v1.2_interactive_questions.md

## Meta

- Target: docs/PROPOSAL_v1.2_interactive_questions.md
- Estrategia: 2 — Default recomendado
- Reviewers: pragmatic, operator, modeler, agent-ux
- Fecha: 20260530-154417

## Summary

- Verdict: approve_with_changes
- Top risk: answer() operation order omits plan.json read for state validation (CF-02), enabling writes in wrong states if implemented literally
- Confidence: high

## Findings

### CF-01: Missing pre-implementation grep audit for GSDC_ARTIFACT_MISSING → GSDC_MOCKUP_MISSING rename

- Severity: P2
- Category: integrity
- Status: valid
- File: lib/plan-manager.js, bin/gsd-canva.js, tests/plan.test.js
- Lines: plan-manager.js:390, gsd-canva.js:279, plan.test.js:124
- Claim: The proposal renames `GSDC_ARTIFACT_MISSING` (exit 20) to `GSDC_MOCKUP_MISSING` but lacks a pre-implementation grep audit step, unlike every other breaking change in the document which provides explicit `rg` commands.
- Evidence: Target line 36 provides grep for exit-15 migration, line 44 for `exitCode ||`. The rename is mentioned at lines 104 and 555 but has no audit command. Three current code sites reference the old name: `plan-manager.js:390`, `bin/gsd-canva.js:279`, `plan.test.js:124`.
- Impact: Implementer following only explicit audit steps would miss these sites. Test fails at runtime, CLI fallback masks wrong code string. Error still works (same exit 20) but code string in JSON output is inconsistent with the documented error table.
- Recommendation: Add pre-implementation step: `rg "GSDC_ARTIFACT_MISSING" lib/ bin/ tests/ templates/` and audit every hit. Mirror the format of existing audit commands.
- Suggested test: Post-impl: `rg "GSDC_ARTIFACT_MISSING" lib/ bin/ tests/` returns 0 hits.
- Dedup key: artifact-missing-rename-audit-missing
- Sources: pragmatic:F-01

### CF-02: answer() operation order omits plan.json read for state validation

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (new `answer()` function)
- Lines: target.md:261
- Claim: The answer() operation order specifies "leer decisions.json" as the only file read, but `mockup:questions_pending` state lives in `plan.json`, not `decisions.json`. An implementer following the literal order would skip state validation.
- Evidence: target.md:261 lists "leer decisions.json" as the sole read. State `mockup:questions_pending` is in plan.json (confirmed by plan-manager.js:174,258). The `confirmed` flag is in decisions.json but the state machine status is not.
- Impact: If plan.json state check is skipped, answer() could write to decisions.json in states like `ready_for_html` or `pending_approval`, bypassing the confirmation gate and breaking state machine integrity.
- Recommendation: Update operation order to: "acquire lock → leer plan.json + decisions.json → validar estado mockup:questions_pending (plan.json) → ensureV2Fields() → validar confirmation.confirmed !== true (decisions.json) → validar choice value → escribir decisions.json atómicamente → release lock en finally".
- Suggested test: Plan in state `ready_for_html`, confirmed=true. Call `answer(planId, 'vertical', 'new')`. Assert exit 13 (GSDC_INVALID_STATE), not exit 23 (GSDC_DECISIONS_LOCKED).
- Dedup key: answer-operation-order-missing-plan-json-read
- Sources: operator:OP-001

### CF-03: NORMALIZE_V1 and NORMALIZE_V2 are identical functions with versioned names that promise divergence

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed, section 8)
- Lines: target.md:452-453
- Claim: Two normalize functions encode hash algorithm versioning through their names but have byte-identical implementations. The real versioning axis (field list: 6 vs 7 fields) is handled elsewhere.
- Evidence: Target section 8 defines both with the same body: `String(v || '').trim().normalize('NFC')`. The text explicitly states "La normalize es la misma." The field-list difference is in `computeDecisionsHash`'s `if` on `hashAlgorithm`.
- Impact: A future maintainer reading `NORMALIZE_V2` may "correct" it (e.g., adding `toLowerCase()`), silently breaking hash verification for migrated v1 plans. The names encode a versioning promise the functions do not fulfill.
- Recommendation: Use a single `NORMALIZE` constant. The version dispatch should only live in field-list selection, which already exists. Alternatively, rename to `NORMALIZE_DECISIONS`.
- Suggested test: Add comment-based assertion: `NORMALIZE_V1.toString() === NORMALIZE_V2.toString()` to make identity explicit and detect accidental divergence.
- Dedup key: normalize-v1-v2-identical-naming
- Sources: modeler:M-01

### CF-04: optionalAnswered has no structural guard against required field entries

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed, section 1)
- Lines: target.md:106-118, target.md:263
- Claim: `getEmptyFields()` treats `optionalAnswered[field] === true` as a skip regardless of whether the field is required or optional. The invariant that only optional fields appear in `optionalAnswered` is enforced only by `answer()` implementation, not by `getEmptyFields()` itself.
- Evidence: `getEmptyFields()` at target.md:108-118 does `if (optionalAnswered[field]) return false` with no `OPTIONAL_FIELDS` check. A single-line bug in `answer()` (forgetting the `OPTIONAL_FIELDS.includes(field)` guard) would cause a required field to appear "complete" while being empty.
- Impact: `requiredFieldsComplete: true` when a required field is actually empty. `confirmDecisions()` catches it via its own `getEmptyFields` call (exit 19), but counters from `answer()`/`questions()` would be wrong, degrading UX from "please answer this field" to an opaque error.
- Recommendation: Add defensive guard: `if (optionalAnswered[field] && OPTIONAL_FIELDS.includes(field)) return false;` Makes the function self-protecting regardless of caller behavior.
- Suggested test: Create `decisions.optionalAnswered = { vertical: true }` (required field). Verify `getEmptyFields(decisions, REQUIRED_FIELDS, decisions.optionalAnswered)` still returns `vertical` as pending.
- Dedup key: optional-answered-no-structural-guard-for-required-fields
- Sources: modeler:M-02

### CF-05: Choice value matching semantics undefined — exact vs substring

- Severity: P2
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js (proposed, section 3)
- Lines: target.md:259
- Claim: The proposal says "no coincide con ninguna opcion (case-insensitive)" but "coincide" is ambiguous between exact match and substring match. The template (target.md:371) prescribes substring matching for the agent side. The API-level matching semantics are unspecified.
- Evidence: If `answer()` uses exact match and the agent sends a substring (e.g., `"SaaS"` for `"SaaS / Producto Digital"`), it would be accepted as custom via `allowCustom: true`. If `answer()` uses substring match, disambiguation logic is needed but undescribed. No precedent in current codebase.
- Impact: For fields with `allowCustom: true`, the mismatch is mostly invisible (custom value accepted). For any future field with `allowCustom: false`, the matching semantics become a hard gate — exact match would reject legitimate substring matches shown to the user by the template.
- Recommendation: Explicitly state `answer()` uses **exact case-insensitive comparison** against option `value` fields. This aligns with template flow (confirm → send full option text). Replace "coincide" with a precise description.
- Suggested test: `answer(vertical, "SaaS")` with `allowCustom: true` → accepted as custom (not matching). `answer(vertical, "saas / producto digital")` → matches "SaaS / Producto Digital" (case-insensitive exact).
- Dedup key: choice-value-matching-exact-vs-substring-undefined
- Sources: modeler:M-03, pragmatic:F-02

### CF-06: No resolve-retry path for confirmed+questions_pending state

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md (proposed section 6)
- Lines: target.md:365
- Claim: When `questions()` returns `confirmed: true, readOnly: true, status: questions_pending`, the template only suggests `reset-confirmation`. But this state means confirm succeeded and resolve hasn't run — the agent could simply retry `resolve-questions` instead.
- Evidence: Section 6: "Si `confirmed: true` y estado es `questions_pending` (entre confirm y resolve), sugiere `reset-confirmation`." No mention of retrying resolve. Reset discards the user's "confirmo" and requires a full re-confirmation cycle.
- Impact: If a session crashes between confirm-decisions and resolve-questions, the next session suggests reset instead of the simpler resolve retry. User's explicit confirmation is lost unnecessarily.
- Recommendation: Add explicit step: "Si `confirmed: true` y estado es `questions_pending` → primero intentar `resolve-questions`. Si falla, entonces sugerir `reset-confirmation`."
- Suggested test: Fill fields, confirm-decisions succeeds, do NOT call resolve-questions. New session calls `questions()` → sees confirmed+questions_pending → retries resolve-questions → succeeds. No reset needed.
- Dedup key: confirmed-pending-no-resolve-retry
- Sources: agent-ux:AU-01

### CF-07: confirm→resolve failure discards confirmation with no user-facing guidance

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md (proposed section 6, step 6)
- Lines: target.md:416
- Claim: When confirm succeeds but resolve fails twice, the agent runs `reset-confirmation` and says "la confirmación fue revertida" with no guidance on why or what happens next.
- Evidence: "Si `confirm-decisions` exitosa pero `resolve-questions` falla: reintentar `resolve-questions` una vez. Si persiste, ejecutar `reset-confirmation` e informar al usuario que la confirmación fue revertida." — no guidance on explaining the failure or that re-confirmation is needed from scratch.
- Impact: User said "confirmo" and their intent is silently discarded with no context. Naive agent says "your confirmation was reverted" — user confused about what went wrong.
- Recommendation: Add template guidance: "Informar: 'Error técnico al procesar la confirmación. Tus decisiones se preservaron pero necesitas confirmar de nuevo.' Reanudar flujo desde resumen (campos están completos, no desde cero)."
- Suggested test: Simulate confirm success + resolve failure. Agent: (1) retries resolve once, (2) runs reset, (3) informs user with reason, (4) re-presents summary for re-confirmation without re-asking all fields.
- Dedup key: confirm-resolve-failure-ux-gap
- Sources: agent-ux:AU-02

### CF-08: readOnly state decision tree is complex and error-prone for agents

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md (proposed section 6)
- Lines: target.md:365
- Claim: The `readOnly: true` handling has 4 sub-cases based on `confirmed` + `status` combinations with different actions, embedded in prose. No decision table or API-level `suggestedAction` field.
- Evidence: Cases: (1) confirmed+ready_for_html/pending_approval → suggest reset, (2) confirmed+questions_pending → suggest reset, (3) unconfirmed+not questions_pending → run status + suggest reset if applicable, (4) approved+ → suggest new plan. Cases 1 and 2 suggest reset for different reasons. An agent could conflate these or suggest reset for approved plans (where reset is exit 13).
- Impact: Agents may incorrectly advise users — suggesting "create new plan" when reset is available, or suggesting reset for approved plans where it's forbidden.
- Recommendation: Either (a) add `suggestedAction` field to `questions()` response (`["ask_questions", "retry_resolve", "suggest_reset", "suggest_new_plan"]`), or (b) add a decision table with explicit state → action mapping.
- Suggested test: For each readOnly state combination, verify correct advice. Specifically: approved state → agent must NOT suggest reset (only new plan).
- Dedup key: readonly-state-agent-decision-tree
- Sources: agent-ux:AU-03

### CF-09: answer() stores non-canonical case for case-insensitive choice matches

- Severity: P3
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js (proposed answer())
- Lines: target.md:259-260
- Claim: `answer()` performs case-insensitive matching but stores the user-provided value without normalizing to canonical option form. The hash is computed over the stored value (NFC case-sensitive).
- Evidence: If `answer(vertical, "saas / producto digital")` is accepted and stored as-is, hash differs from canonical `"SaaS / Producto Digital"`. Template says "mostrar esa opcion para confirmar" but doesn't mandate passing canonical value to `answer()`.
- Impact: If template passes canonical value (as intended), no issue. A direct CLI user or poorly implemented template could produce non-canonical stored values. Hash still protects the stored value but `decisions.json` would contain surprising non-canonical value.
- Recommendation: Normalize accepted choice values to canonical option form when case-insensitive match succeeds. This is safer than documenting as-is behavior.
- Suggested test: `answer(vertical, "saas / producto digital")` → stored value is `"SaaS / Producto Digital"` (normalized).
- Dedup key: answer-choice-case-normalization
- Sources: pragmatic:F-02

### CF-10: Missing explicit test for questions() output after resetConfirmation()

- Severity: P3
- Category: testing
- Status: valid
- File: tests/plan.test.js (proposed)
- Lines: target.md:489-540
- Claim: The test plan covers `resetConfirmation()` and `questions()` separately but never calls `questions()` after a reset to verify optional fields reappear as pending and `optionalAnsweredStatus` reflects the reset.
- Evidence: Test line 516 tests reset output (`optionalPendingCount === 1, assets === ""`) but not `questions()` output post-reset. After reset, `optionalAnswered = {}`, `assets = ""` — `questions()` should show `optionalPendingCount: 1`, `optionalAnsweredStatus: { assets: false }`. Natural consequence of reset but unverified.
- Impact: If `questions()` has a stale cache or different read path, reset effect would not be visible to the agent. Low risk but test gap could hide a subtle bug in read-after-write.
- Recommendation: Add one test: fill all fields + assets, confirm, reset, call `questions()`. Assert `optionalPendingCount === 1`, `optionalAnsweredStatus.assets === false`, `pending` includes assets, `requiredPendingCount === 0`.
- Suggested test: As described above.
- Dedup key: questions-after-reset-test-gap
- Sources: pragmatic:F-03

### CF-11: resolveQuestions() placeholder detection migration implied but not explicit

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: plan-manager.js:276-293
- Claim: The proposal mandates `includes()` → `===` for placeholder detection and replacing hardcoded field arrays in `resolveQuestions()`, but does not explicitly state that `resolveQuestions()` should use `getEmptyFields()` or replace its inline placeholder check.
- Evidence: Target line 100 says "reemplazar arrays hardcodeados" referring to field arrays, not placeholder logic. `getEmptyFields()` uses `===`. An implementer could keep `includes()` in `resolveQuestions()`, creating inconsistency with `confirmDecisions()`.
- Impact: `"PENDIENTE DE REVISIÓN"` passes `confirmDecisions()` (=== match, not detected) but could fail `resolveQuestions()` (includes match, detected). Dead zone where a value accepted by confirm is rejected by resolve.
- Recommendation: Explicitly state `resolveQuestions()` should use `getEmptyFields(decisions, REQUIRED_FIELDS)` or remove the redundant check since `confirmDecisions()` already validates.
- Suggested test: Post-impl: `rg "includes\\(p\\)" lib/plan-manager.js` returns 0 hits.
- Dedup key: resolve-placeholder-detection-inconsistency
- Sources: pragmatic:F-04

### CF-12: handleError blanket || 1 changes non-plan handler exit codes

- Severity: P3
- Category: cli-contract
- Status: valid
- File: bin/gsd-canva.js
- Lines: gsd-canva.js:121, 156, 193, 416, 450, 488
- Claim: The proposal mandates changing ALL `err.exitCode || <code>` to `err.exitCode || 1` including non-plan handlers (init, upgrade, doctor, plan list, plan status, template register), changing fallback exit codes from 16/18/15 to generic 1.
- Evidence: Current fallbacks: init `|| 16`, doctor `|| 18`, plan list/status `|| 15`, template register `|| 15`. Target line 321: "todos los handlers, no solo plan." The wording is clear and intentional.
- Impact: External scripts checking exit codes for unexpected errors would see 1 instead of specific codes. Since unexpected errors are rare (all thrown errors have explicit exitCode), unlikely to cause real issues. Exit 1 is standard POSIX. But behavioral change is not scoped to plan subsystem.
- Recommendation: Verify no CI scripts depend on codes 16, 18, or 15 from these commands. The change is intentional per the proposal.
- Suggested test: Post-impl: `grep -n 'exitCode ||' bin/gsd-canva.js` produces only `|| 1` (already in verification step 23).
- Dedup key: handleerror-fallback-scope-breadth
- Sources: pragmatic:F-05

### CF-13: resetConfirmation() crash recovery may produce extra history entries

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed resetConfirmation())
- Lines: target.md:306
- Claim: The recovery doc says "re-ejecutar resetConfirmation() procede desde paso 5" but the function has no checkpoint — it re-executes all steps. The history dedup rule matches on `action + from`, but re-run uses `from: questions_pending` (different from first run's `from: original_state`), producing a duplicate entry.
- Evidence: First crash leaves entry with `from: ready_for_html`. Re-run produces entry with `from: questions_pending`. Dedup rule (same action + same from) does not catch this.
- Impact: Audit trail contains a spurious `reset-confirmation` entry after crash recovery. Not functionally harmful but violates "no duplicate" intent. Documentation claim "proceeds from step 5" is imprecise.
- Recommendation: Update docs: "Re-ejecutar re-ejecuta todos los pasos idempotentemente. History puede acumular un entry extra — aceptable para crash recovery." Alternatively, match dedup on `action` alone when target state is already `questions_pending`.
- Suggested test: Simulate partial crash from `ready_for_html`, intercept after plan.json write. Re-run. Assert: state correct, confirmed false, history has 2 entries with action='reset-confirmation'.
- Dedup key: reset-confirmation-crash-recovery-extra-history
- Sources: operator:OP-003, modeler:residual-risk

### CF-14: Stale mockup rename failure — no system cleanup or agent guidance

- Severity: P3
- Category: ux
- Status: valid
- File: lib/plan-manager.js, templates/commands/canva-mockup.md
- Lines: target.md:304, target.md:340-341
- Claim: `resetConfirmation()` may return `staleRenameFailed: true` when mockup rename fails, but the file remains in place and neither the system nor the template provides cleanup guidance. The flag is a successful-response field, not an error code, so the error table's catch-all doesn't apply.
- Evidence: Target.md:304: "incluir staleRenameFailed: true en return." Template section 6 only mentions success path for stale rename. No template instruction for the failure case. The agent has no prescribed behavior when receiving this flag.
- Impact: Agent ignores the flag (leaving stale mockup that could cause confusion) or alarms the user unnecessarily. When a new mockup is later generated, it silently overwrites the stale file with no audit trail.
- Recommendation: Add template instruction: "Si reset-confirmation retorna `staleRenameFailed: true`, informar: 'El mockup anterior no se pudo renombrar pero los datos se reiniciaron. El archivo mockup.html anterior puede ser ignorado o eliminado manualmente.'" Alternatively, add `staleMockupExists: true` to `questions()` output when mockup.html exists but state is `questions_pending`.
- Suggested test: Mock renameSync to throw EACCES. Call resetConfirmation(). Assert return includes `staleRenameFailed: true`, mockup.html still exists, state is `questions_pending`.
- Dedup key: reset-confirmation-stale-mockup-no-cleanup-path
- Sources: operator:OP-004, agent-ux:AU-04

### CF-15: Global exclusive lock creates unnecessary contention for read-only operations

- Severity: P3
- Category: state
- Status: valid
- File: lib/lock-manager.js, lib/plan-manager.js
- Lines: target.md:243, lock-manager.js:91-107
- Claim: `questions()` acquires the global exclusive lock despite being read-only. All functions contend on the same `.gsd-canva/.lock` file. `writeAtomicJson`'s tmp+rename pattern already guarantees atomic reads.
- Evidence: lock-manager.js:20-52 implements exclusive-only locking. Target.md:243 specifies questions() acquires lock. 10s timeout bounds contention.
- Impact: In multi-agent scenarios, a long-running answer() blocks questions() for ALL plans. Throughput bottleneck, not correctness issue. Negligible for single-user CLI.
- Recommendation: Acceptable for current scope. Note as future optimization: read-only operations could skip the lock (writeAtomicJson guarantees atomic reads) or implement reader-writer lock.
- Suggested test: N/A — performance characteristic, not correctness bug.
- Dedup key: global-exclusive-lock-for-read-operations
- Sources: operator:OP-005

### CF-16: Non-mockup phase behavior unspecified for questions() and resetConfirmation()

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:238, target.md:293
- Claim: The state machine includes `draft`, `refine`, `deliver` phases. `questions()` says "etc. → readOnly: true" and `resetConfirmation()` says "approved o posterior → GSDC_INVALID_STATE" — neither explicitly defines behavior for non-mockup phases.
- Evidence: State machine lists draft:pending, draft:approved, etc. An implementer must infer from "etc." that `draft:pending` returns readOnly and that reset rejects it. No explicit state list or phase-level check.
- Impact: Low — in practice, questions() returning readOnly for non-mockup states is correct, and reset rejecting is correct. But implementer must infer rather than follow explicit instructions.
- Recommendation: Add one sentence: "For plans past the mockup phase (draft, refine, deliver), `questions()` returns `readOnly: true` with current status, and `resetConfirmation()` returns `GSDC_INVALID_STATE`."
- Suggested test: Call `questions()` on plan in `draft:pending` → readOnly: true, status: "draft:pending". Call `resetConfirmation()` → exit 13.
- Dedup key: non-mockup-phase-behavior-unspecified
- Sources: modeler:M-04

### CF-17: ensureV2Fields() incomplete — missing confirmation object normalization and confirmedBy/source lifecycle

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed sections 1, 7, 8)
- Lines: target.md:96, target.md:436-444
- Claim: `ensureV2Fields()` only migrates `optionalAnswered` and `assets` but not the `confirmation` object skeleton. If decisions.json is corrupted or pre-dates these fields, `answer()` accessing `decisions.confirmation.confirmed` would throw unhandled TypeError. Additionally, `confirmedBy` and `source` fields are initialized in create() but not discussed in the proposal's changes to `confirmDecisions()` or `resetConfirmation()`.
- Evidence: target.md:96 defines ensureV2Fields as only adding `optionalAnswered` and `assets`. answer() accesses `decisions.confirmation.confirmed` (target.md:261) right after ensureV2Fields(). Current confirmDecisions() sets `confirmedBy: options.by || "user"` (plan-manager.js:219) but proposal doesn't mention this. resetConfirmation() doesn't clear `confirmedBy`/`source`.
- Impact: (1) Unhandled TypeError crash on corrupted decisions.json missing `confirmation` object. (2) `confirmedBy` remains null or stale after reset. No data integrity risk since confirmDecisions() overwrites the entire confirmation object, but the omission is inconsistent with "full reset" semantics.
- Recommendation: (a) Extend ensureV2Fields() to guarantee confirmation skeleton. (b) Add note that confirmDecisions() continues accepting `options.by`. (c) Add `confirmedBy: null, source: "chat"` to resetConfirmation()'s cleanup.
- Suggested test: (1) Fixture with `{ "vertical": "" }` (no confirmation) → `questions()` returns successfully with `confirmed: false`. (2) `confirmDecisions('001', { by: 'user_test' })` → `confirmedBy === 'user_test'`. (3) `resetConfirmation()` → `confirmedBy === null`.
- Dedup key: ensure-v2-fields-missing-confirmation-normalization
- Sources: operator:OP-002, modeler:M-05, pragmatic:F-06

### CF-18: allQuestionsAnswered naming conflates "flow completed" with "all values non-empty"

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js (proposed, section 1)
- Lines: target.md:123
- Claim: `allQuestionsAnswered` is true when all questions were presented and answered (including optional with empty value), but the name implies all fields have non-empty values.
- Evidence: `optionalAnswered[field] = true` for empty optional answers. `getEmptyFields` skips flagged fields. So `allQuestionsAnswered: true` can hold when `assets === ""`.
- Impact: Agent or developer reading the flag might infer all 7 fields are non-empty and skip displaying the optional field's value. Naming/interpretation risk, not a logic bug.
- Recommendation: Consider renaming to `allQuestionsFlowComplete` or adding a note in the JSON response schema that this tracks question-presentation completion, not value presence.
- Suggested test: `answer(assets, "")` → `allQuestionsAnswered === true`, `optionalPendingCount === 0`, `assets === ""`. Confirm flag is semantically correct but name is potentially misleading.
- Dedup key: all-questions-answered-naming-conflation
- Sources: modeler:M-06

### CF-19: Number-to-value mapping relies on error recovery instead of prevention

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md (proposed section 6)
- Lines: target.md:370, target.md:257
- Claim: The template says "numero → value" but doesn't enforce it as mandatory pre-processing. The API catches numeric strings (exit 26), creating an error-recovery loop instead of preventing the error.
- Evidence: Template says `--value` always final text. answer() rejects `/^\d+$/` with exit 26. Error table maps to "Usa el texto de la opcion, no el numero." User types "3" → agent calls answer with "3" → CLI rejects → agent shows error → user re-answers. The agent should have mapped first.
- Impact: Degraded UX with unnecessary error round-trips. An LLM agent may not internalize that number→value is mandatory pre-processing.
- Recommendation: Strengthen to PROHIBIDO-level rule: "⚠️ **PROHIBIDO** pasar indices numericos a `plan answer --value`. Siempre convertir numero → texto de opcion ANTES de llamar."
- Suggested test: Agent receives "3" for choice field → converts to option value before calling `plan answer` → no exit 26.
- Dedup key: number-to-value-requires-pre-mapping
- Sources: agent-ux:AU-05

### CF-20: Fatal errors (exit 15, 25) have no recovery guidance for agents

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md (proposed section 6, error table)
- Lines: target.md:399, target.md:402
- Claim: `GSDC_PLAN_ARTIFACT_MISSING` (25) and `GSDC_JSON_PARSE_ERROR` (15) both say "Detener flujo" with no actionable recovery. For artifact-missing, the fix is likely recreating the plan; for parse errors, inspecting the file.
- Evidence: Error table: "(25) → Detener flujo" and "(15) → Detener flujo. Pedir intervencion manual." No guidance on what "intervencion manual" means.
- Impact: Agent hits dead end with no advice. User is stranded with no next step.
- Recommendation: Add recovery hints: (25) "Sugerir `plan create` con mismo ID o verificar directorio del plan." (15) "Mostrar ruta del archivo corrupto. Sugerir inspeccion manual o recrear plan."
- Suggested test: Agent encounters exit 25 → suggests plan create. Agent encounters exit 15 → shows file path and suggests inspection.
- Dedup key: fatal-errors-no-recovery-guidance
- Sources: agent-ux:AU-06

### CF-21: Multi-field semantic mapping uncertainty threshold undefined

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md (proposed section 6)
- Lines: target.md:373-377
- Claim: The multi-field rules say "si algun mapeo es incierto → no guardar" but "incierto" is subjective. No multi-field examples provided beyond the single-field tabla de ejemplos.
- Evidence: Rule 4: "Si algun mapeo es incierto → no guardar ese campo, preguntar." "banner" could match any banner format. One agent maps confidently to "LinkedIn Banner", another considers it uncertain. No calibration examples.
- Impact: Inconsistent behavior across agents/sessions. Users get unpredictable experiences.
- Recommendation: Add 2-3 multi-field examples showing boundary: "'Instagram post azul para restaurante' → guardar formato, paleta, vertical (all clear). 'banner para mi negocio' → no guardar formato ('banner' matches multiple)."
- Suggested test: Two agents process same multi-field input → same save/skip decisions based on documented examples.
- Dedup key: multi-field-semantic-mapping-undefined-threshold
- Sources: agent-ux:AU-07

## Non-Issues Checked

- **Placeholder detection === change for test 2**: Target correctly identifies plan.test.js:62 needs updating from `'TODO: definir'` to `'TODO'`.
- **findPlanDir exit code migration**: Thorough grep audit provided (target line 36) covering all call sites.
- **Hash migration v1→v2**: Both normalize functions identical (NFC, case-sensitive). confirmDecisions() always computes v2. Atomic migration.
- **resetConfirmation() write ordering**: plan.json before decisions.json (target.md:305-306). Re-execution proceeds cleanly. Correct recovery design.
- **ensureV2Fields() non-persistence in questions()/status()**: Read-only operations don't persist. First mutation persists. Consistent.
- **optionalAnswered semantics**: Flag set for all optional responses (empty or not). getEmptyFields() excludes flagged fields. Clean design.
- **Lock release in finally blocks**: All proposed functions follow existing try/finally pattern.
- **writeAtomicJson atomicity**: tmp+rename pattern. Crashes leave old file intact. Reads never torn.
- **Error code uniqueness**: New codes 22-26 don't collide with existing 10, 13-15, 19-21. GSDC_MOCKUP_MISSING (20) clean rename.
- **Idempotency of resetConfirmation()**: No-op when questions_pending + confirmed !== true + no mockup. Re-executable.
- **confirmo parsing regex**: Word-boundary with negation check handles edge cases. Test plan covers critical paths.
- **CLI --json double-wrap prevention**: handleSuccess() wraps in { ok: true, data }. Functions return raw. No double-wrap.
- **confirmDecisions() empty-field protection**: getEmptyFields check before hash. answer() warning + confirmDecisions() rejection = two-layer protection.
- **Lock stale detection**: PID-based with hostname+CWD matching + 10s timeout. Crash recovery works.
- **answer() idempotency**: Re-calling overwrites with identical data. Counters recomputed from disk.
- **"Otro (personalizado)" detection by label**: Template correctly detects by label, API rejects literal string as safety net.
- **optionalAnsweredStatus for session resume**: Agent can re-call questions() to get full state. Data is durable.
- **Hash v1→v2 migration atomicity at confirm time**: hash and label always match after confirm. No intermediate state.
- **create() hashAlgorithm change**: v1→v2 in create() aligns with migration strategy.

## Residual Risks

- **SIGKILL during resetConfirmation()**: finally block doesn't run, lock remains. Lock manager's stale detection (PID + 10s timeout) reclaims it, but brief window where all operations are blocked.
- **No transaction across plan.json + decisions.json**: resetConfirmation() writes two files non-atomically. Lock prevents concurrent reads of inconsistent state. Acceptable given trust model.
- **.stale file accumulation**: resetConfirmation() renames to `.stale.<timestamp>` with no automated cleanup or retention policy. Low priority operational concern.
- **Template-agent contract enforcement**: Nothing in CLI enforces canonical option values from agents. Mitigated by detailed template instructions.
- **confirm→resolve→reset chain**: Narrow window where user confirmation is lost. resolve-retry (CF-06) would reduce but not eliminate this.
- **answer() for future choice fields with allowCustom: false**: All current choice fields have allowCustom: true. The matching semantics ambiguity (CF-05) becomes critical when a non-customizable choice field is added.
- **Multi-field mapping subjectivity**: Even with more examples (CF-21), different agents may behave differently. The fallback (don't save if uncertain) is safe but may cause extra round-trips.
- **questions() response status field for non-mockup phases**: Whether status includes phase prefix (e.g., `"draft:pending"`) is not shown in example JSON. Agents parsing response may not handle non-mockup values.
