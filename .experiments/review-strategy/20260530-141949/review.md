# Review Consolidado: docs/PROPOSAL_v1.2_interactive_questions.md

## Meta

- Target: docs/PROPOSAL_v1.2_interactive_questions.md
- Estrategia: 2 — Default recomendado
- Reviewers: pragmatic, operator, modeler, agent-ux
- Fecha: 20260530-141949

## Summary

- Verdict: **reject_until_fixed**
- Top risk: `answer()` crashes on pre-existing v1.1 plans that lack `optionalAnswered` — unhandled `TypeError` blocks the main interactive flow for any migrated plan still in `questions_pending`
- Confidence: high

## Findings

### C-01: `answer()` crashes on v1.1 plans missing `optionalAnswered`

- Severity: P1
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:251
- Claim: `answer()` unconditionally writes `decisions.optionalAnswered[field] = true` for optional fields, but pre-existing v1.1 plans have no `optionalAnswered` key in `decisions.json`. JavaScript `undefined[field] = true` throws `TypeError`.
- Evidence: Target section 3 (line 251) mandates setting `optionalAnswered[field] = true` on decline. Repo context (line 79) confirms v1.1 `decisions.json` has no `optionalAnswered` field. `create()` (section 7) initializes it only for new plans — no migration for existing plans is specified.
- Impact: Any v1.1 plan still in `questions_pending` will crash on the first optional-field answer with an unhandled exception instead of a structured error. Blocks the main flow for migrated plans.
- Recommendation: Add guard `decisions.optionalAnswered = decisions.optionalAnswered || {}` before any write, or add a dedicated `ensureV2Fields()` helper called on first read.
- Suggested test: Create v1.1 fixture plan (no `optionalAnswered`, state `questions_pending`). Call `answer("id", "assets", "")` → expect success, `optionalAnswered.assets === true`.
- Dedup key: answer-optionalAnswered-migration-crash
- Sources: operator:OP-01

### C-02: `resetConfirmation()` and `questions()` reject `approved` and later states — no recovery path

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:232, target.md:282-296
- Claim: `resetConfirmation()` accepts only `questions_pending`, `ready_for_html`, `pending_approval`. `questions()` returns read-only snapshots only for those same two post-confirmation states. Plans in `mockup:approved` or later phases hit `GSDC_INVALID_STATE` (exit 13) with no documented path back.
- Evidence: Target section 4 lists accepted states explicitly. Repo context shows the state machine includes `approved` and later phases. Section 6 error table for exit 13 only suggests reset for `ready_for_html`/`pending_approval` — no suggestion for `approved`. `questions()` treats `approved` as "unrecognized" despite it being a valid state.
- Impact: Agent cannot inspect or reset decisions on approved plans. Falls through to generic "explain current state" dead-end. Inconsistent — read-only works for two post-confirmation states but not others, despite `questions()` being non-mutating.
- Recommendation: (a) Extend `questions()` read-only behavior to all post-`questions_pending` states. (b) Either add `approved`+ to `resetConfirmation()` accepted list with appropriate cleanup, or document that post-approval correction is out of scope and requires a new plan.
- Suggested test: `questions()` on plan in `mockup:approved` → returns `{ readOnly: true, filled: [...], pending: [] }`. `resetConfirmation()` on `mockup:approved` → either succeeds with cleanup or returns a distinct documented error code.
- Dedup key: reset-confirmation-approved-state-dead-end
- Sources: pragmatic:P2-01, pragmatic:P2-02, operator:OP-04

### C-03: `hashAlgorithm: ""` after reset not handled in dispatch logic

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:286, target.md:434-436
- Claim: `resetConfirmation()` sets `hashAlgorithm = ""` (empty string), but `computeDecisionsHash()` dispatch mentions `undefined` as the fallback: "Si es `sha256-decisions-v2` (o undefined en planes nuevos)". Empty string `""` is neither `'sha256-decisions-v1'`, `'sha256-decisions-v2'`, nor `undefined`.
- Evidence: Target line 286: `confirmation.hashAlgorithm = ""`. Target line 435: dispatch references `undefined`. After reset, `hashAlgorithm` is `""`, not `undefined`. An implementer writing `if/else` on string values would miss the empty-string case.
- Impact: After reset + re-answer + `confirmDecisions()`, hash computation could produce incorrect results if the dispatch treats `""` as v1 or throws. Implementer must guess.
- Recommendation: Change spec text to: "Si `hashAlgorithm` es `sha256-decisions-v1` → 6 campos. En cualquier otro caso (v2, vacío, undefined) → 7 campos." Makes the fallback explicit.
- Suggested test: After `resetConfirmation()`, assert `hashAlgorithm === ""`. Call `confirmDecisions()` → assert computed hash uses 7 fields (v2) and writes `hashAlgorithm: 'sha256-decisions-v2'`.
- Dedup key: hash-algorithm-empty-string-after-reset
- Sources: pragmatic:P2-04, modeler:M-03

### C-04: `readJsonOrThrow()` changes error codes for existing functions without migration list

- Severity: P2
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:92-94
- Claim: `readJsonOrThrow()` returns exit 25 for missing files and exit 15 for corrupt JSON. The spec says "Usar en todas las funciones que leen artefactos requeridos" but only explicitly calls out `findPlanDir()` migration. Existing functions (`status()`, `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`) may silently change error codes.
- Evidence: Target line 92-93 mandates adoption across all functions reading artifacts. Changes section only mentions `findPlanDir()`. `status()` is not mentioned in any change section. Currently, missing `decisions.json` in an existing plan returns exit 15; after migration it returns exit 25.
- Impact: Inconsistent error codes across CLI surface. Missing `decisions.json` could produce exit 15 from `status()` but exit 25 from `questions()`. Downstream consumers get inconsistent behavior.
- Recommendation: Provide explicit list of existing functions switching to `readJsonOrThrow()` with before/after error code changes. Add test: `plan status --id <plan-without-decisions-json> --json` → exit 25 (not 15).
- Suggested test: For each migrated function, verify new exit code for plan with missing `decisions.json` is 25 (not 15).
- Dedup key: read-json-or-throw-existing-function-migration
- Sources: pragmatic:P2-05, modeler:M-04

### C-05: Exit code 15→24 migration verification is insufficiently concrete

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md
- Lines: 36, 484, 527
- Claim: The breaking change says "Verificar que ningún template ni script externo dependa de exit 15" but this is an instruction, not a concrete step. The grep in section 9 doesn't check for exit code references.
- Evidence: Target line 36 says verify but doesn't specify how. Test 14 validates new behavior only. No grep for `exit.*15|GSDC_JSON_PARSE_ERROR|exitCode.*15` across templates/bin/tests/docs/scripts is mandated.
- Impact: If CI pipeline or agent template checks `EXIT_CODE == 15` for "plan not found," it silently breaks. Implementer could skip the check or do a superficial grep.
- Recommendation: Add a concrete pre-implementation grep step: `rg "exit.*15|GSDC_JSON_PARSE_ERROR|exitCode.*15|code.*15" templates/ bin/ tests/ docs/ scripts/` and require audit of each hit. Include as numbered step before code changes.
- Suggested test: Grep audit passes with zero hits on exit-15-for-plan-not-found before implementation begins.
- Dedup key: exit-code-15-migration-verification
- Sources: pragmatic:P2-03

### C-06: `resetConfirmation()` non-atomic write order creates confusing intermediate state

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:288-296
- Claim: Step 4 writes `plan.json` (state → `questions_pending`) before step 5 writes `decisions.json` (clears confirmation). A crash between these steps leaves `state === questions_pending` but `confirmed === true`, causing `answer()` to fail with `GSDC_DECISIONS_LOCKED` despite the state looking editable.
- Evidence: Target lines 288-295 specify plan.json-first write order. Line 270 confirms `answer()` rejects when `confirmed === true`. Line 296 acknowledges partial-failure recovery via re-execution. But the error table routes `GSDC_DECISIONS_LOCKED` to "ask user if they want reset-confirmation" — the agent does not auto-recover.
- Impact: After crash, agent sees `questions_pending` and tries `answer()` → gets `DECISIONS_LOCKED`. State is misleading — agent must interpret this as "partial reset, re-run reset-confirmation" rather than "decisions were explicitly confirmed."
- Recommendation: Write `decisions.json` before `plan.json` (step 5 before step 4). If step 4 fails after step 5, state is `ready_for_html` + `confirmed === false` → `answer()` fails with `GSDC_INVALID_STATE` (clearly diagnosable). Alternatively, add auto-recovery: "If state is `questions_pending` and `GSDC_DECISIONS_LOCKED` occurs, automatically re-run `reset-confirmation`."
- Suggested test: Existing test at target line 473 covers partial recovery. Verify it also asserts `answer()` attempt + `resetConfirmation()` recovery, not just direct re-execution.
- Dedup key: reset-confirmation-non-atomic-plan-before-decisions
- Sources: operator:OP-03

### C-07: Stale optional field values persist after reset and decline

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:251, target.md:287, target.md:544
- Claim: `resetConfirmation()` clears `optionalAnswered = {}` but does not clear optional field values. After reset, non-empty optional values (e.g., `assets: "Logo en PNG"`) pass `getEmptyFields()` value check → excluded from pending list → agent does not re-ask. Similarly, declining with empty value sets `optionalAnswered[field] = true` without clearing the existing value, causing `questions()` to show the stale value in `filled`.
- Evidence: Target line 287 clears `optionalAnswered` only. Target line 251 preserves value on decline. Target lines 96-108: `getEmptyFields` skips fields with non-empty values. Only test for this path (line 475) uses a declined (empty) optional — no test covers non-empty optional after reset. Notes line 544 says "todas las preguntas opcionales se re-preguntan" — contradicted by actual behavior for non-empty values.
- Impact: After reset, stale asset data persists through confirmation without re-validation. After decline, `filled` display shows old value, implying it's still selected. Stated invariant is violated for real workflow scenarios.
- Recommendation: Clear optional field values to `""` during `resetConfirmation()` alongside `optionalAnswered`, matching stated intent. When declining, also clear the field value. Add test: fill assets with non-empty value, confirm, reset → `optionalPendingCount === 1`, assets value is `""`.
- Suggested test: Create plan → `answer(assets, "Logo PNG")` → confirm → resolve → `resetConfirmation()` → `questions()` → assert `optionalPendingCount === 1` and assets value is empty.
- Dedup key: reset-confirmation-optional-nonempty-reask
- Sources: operator:OP-05, modeler:M-01

### C-08: No template instruction for `requiredFieldsComplete` transition

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6 template)
- Lines: 339-397
- Claim: The template describes asking questions one-by-one and calling `plan answer`, but never states the conditional for transitioning from the question loop to the summary+confirmation step.
- Evidence: Lines 358-363 cover calling `plan answer` per question. Lines 379-389 cover summary+confirmation. The connection — what triggers moving from question loop to summary — is implied by the counters in section 3 (lines 252-263) but never stated as a conditional in the template.
- Impact: Agents may call `plan questions` after every `answer()` to re-check (wasteful), continue prompting already-filled fields, or skip the summary step entirely and jump to `confirm-decisions`.
- Recommendation: Add explicit conditional block after `plan answer` instructions: "After each `plan answer`, check the response. If `requiredFieldsComplete === true`, proceed to the Review/Confirmation step below. Otherwise, continue with the next pending question."
- Suggested test: Plan with 5/6 required fields filled, simulate `answer()` returning `requiredFieldsComplete: false`; fill 6th → verify agent transitions to summary instead of calling `plan questions` again.
- Dedup key: template-requiredFieldsComplete-transition-gap
- Sources: agent-ux:UX-01

### C-09: No template handling guidance for `readOnly: true` from `questions()`

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6 template)
- Lines: 231, 339-353
- Claim: `questions()` returns `readOnly: true` when the plan is in `ready_for_html` or `pending_approval`, but the template does not instruct the agent what to do with this response.
- Evidence: Line 231 defines `readOnly: true` output. Lines 339-353 describe rendering pending questions but never check for `readOnly`. Error table covers `GSDC_INVALID_STATE` (exit 13) but `questions()` does not throw that error for these states — it returns a read-only snapshot. No instruction path for this case.
- Impact: Agent calling `plan questions` on a confirmed plan receives `readOnly: true` with no pending questions and no instruction to display "decisions are locked" or suggest `reset-confirmation`. May silently show empty question list.
- Recommendation: Add template instruction: "If `questions()` returns `readOnly: true`, inform user that decisions are already confirmed. Display filled fields as summary. Suggest `reset-confirmation` if user wants changes."
- Suggested test: Agent calls `questions()` on `ready_for_html` plan, receives `readOnly: true`; verify agent output includes locked-decisions message and mentions `reset-confirmation`.
- Dedup key: template-readOnly-no-handling
- Sources: agent-ux:UX-02

### C-10: No template guidance for multi-field or batch user responses

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6 template)
- Lines: 348-349
- Claim: Template mandates sequential one-at-a-time questions but provides no instruction when a user answers multiple questions in a single message.
- Evidence: Line 348-349 enforces sequential flow. Users commonly respond with combined answers. No instruction for parsing and dispatching multiple fields from one message.
- Impact: Agent following template literally will pass entire multi-field text as the value for one field → garbage in `decisions.json` with no recovery path except manual correction.
- Recommendation: Add template instruction: "If the user provides answers for multiple fields in one message, extract each field-value pair and call `plan answer` for each one sequentially. If any field name is ambiguous, ask for clarification before saving."
- Suggested test: User sends "SaaS / Producto Digital, Instagram Post, jóvenes" when asked only `vertical`. Verify agent either extracts and saves separately, or asks for clarification.
- Dedup key: template-batch-answer-no-handling
- Sources: agent-ux:UX-03

### C-11: No fuzzy matching guidance for choice fields

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6 template)
- Lines: 346-350
- Claim: Template specifies numeric mapping ("1" → first option value) but does not address text-based partial matches (e.g., "instagram" vs "Instagram Post (1080x1080)").
- Evidence: Line 349 says map numbers to values. Line 224 says "what user selects is what gets saved." No instruction for partial text matches or casing differences.
- Impact: Agents will improvise matching logic inconsistently. Some will pass "instagram" as literal value to `plan answer` — stored in `decisions.json` as a non-option value. Others will ask for clarification each time, degrading UX.
- Recommendation: Add template rule: "For `choice` fields, if user's text input does not exactly match an option `value` (case-insensitive), ask user to confirm by showing closest matches or full numbered list. Do not pass free text as choice value unless user selected 'Otro (personalizado)'."
- Suggested test: User types "instagram" for `formato`. Verify agent does not save "instagram" but presents matching options or asks for clarification.
- Dedup key: template-choice-fuzzy-match-undefined
- Sources: agent-ux:UX-04

### C-12: No test for `optionalAnswered` migration on v1.1 fixture

- Severity: P2
- Category: testing
- Status: valid
- File: tests/plan.test.js
- Lines: target.md:451-486
- Claim: Test list includes hash migration v1 test (line 480) but no test exercises `answer()` or `questions()` against a v1.1 fixture lacking `optionalAnswered`.
- Evidence: Target line 480 covers hash migration. No corresponding test for `optionalAnswered` field migration. The P1 crash (C-01) would not be caught by the specified test suite.
- Impact: Implementer following the test plan would believe all migration cases are covered when they are not.
- Recommendation: Add test: "Test optionalAnswered migration v1.1: v1.1 fixture without `optionalAnswered` → `plan answer --field assets --value ""` succeeds and sets `optionalAnswered.assets === true`; `plan questions` returns `optionalPendingCount === 0`."
- Suggested test: See recommendation — concrete fixture and assertions provided.
- Dedup key: test-optionalAnswered-v1-migration
- Sources: operator:OP-02

### C-13: Human-readable output for `plan questions` is underspecified

- Severity: P3
- Category: ux
- Status: valid
- File: target.md
- Lines: 313
- Claim: Spec says "imprime preguntas requeridas primero, numeradas con opciones numeradas, assets al final marcado como '(opcional)', y contadores al final" but shows no example output. Format for filled fields, "Otro (personalizado)" display in human mode, and partial-state rendering are unspecified.
- Evidence: Target line 313 gives prose description only. No concrete example for partial, all-pending, or all-filled cases.
- Impact: Two implementers could produce very different CLI outputs. Agent template section 6 assumes specific output structure, creating tight coupling to unspecified format.
- Recommendation: Add concrete example of human-readable output covering partial state (some filled, some pending), all-pending, and all-filled cases.
- Suggested test: Snapshot test on human-readable output for a plan with 2/6 fields filled.
- Dedup key: human-readable-questions-format-underspecified
- Sources: pragmatic:P3-01

### C-14: Recovery re-execution of `resetConfirmation()` creates duplicate history entries

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:289-296
- Claim: Re-execution for recovery re-runs step 4 (write `plan.json` with history push), creating a duplicate `reset-confirmation` history entry. Step 5 is effectively idempotent but history is not deduplicated.
- Evidence: Target lines 289-295: step 4 always pushes history entry. Recovery re-execution at line 296 repeats step 4.
- Impact: Audit trail shows two `reset-confirmation` entries for one logical operation. Cosmetically confusing — auditor might misinterpret as two separate attempts.
- Recommendation: Make step 4 idempotent by checking if latest history entry already has `action: 'reset-confirmation'` with same `from` state, or document that duplicate entries after recovery are benign.
- Suggested test: After simulated partial failure + re-execution, verify history has exactly one `reset-confirmation` entry (if idempotent) or document that two entries are acceptable.
- Dedup key: reset-confirmation-duplicate-history-recovery
- Sources: pragmatic:P3-02

### C-15: Context extraction rules are inherently subjective with uncovered edge cases

- Severity: P3
- Category: docs
- Status: valid
- File: target.md (Section 6 template)
- Lines: 329-337
- Claim: The extraction table's boundary between "explicit" and "inferred" is agent-dependent and unverifiable. Three examples are given but many common inputs are unspecified. "PROHIBIDO inferir" contradicts the agent's need to map natural language to field IDs.
- Evidence: Line 335: "restaurante" excluded as inferred vertical, but "Instagram post" is mapped to specific format despite similar ambiguity. No fallback rule for uncertain cases.
- Impact: Different agents will extract different fields from the same input. Inconsistent behavior across sessions. Not mechanically testable.
- Recommendation: Acknowledge as soft guideline. Add fallback: "If uncertain whether information maps to a specific field, do NOT save it — let the structured question flow collect it." Consider expanding table with 2-3 more ambiguous edge cases.
- Suggested test: User says "landing page para mi negocio de ropa, colores vivos". Verify `paleta: "colores vivos"` is saved and "ropa" is not saved as vertical.
- Dedup key: context-extraction-subjectivity
- Sources: pragmatic:P3-03, agent-ux:UX-06

### C-16: `optionalAnswered` naming implies broader semantics than actual behavior

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:120-121, target.md:251-252
- Claim: `optionalAnswered` is set only when an optional field is declined (empty value), never for non-empty answers. The name reads as "this optional field has been answered" but actually means "this optional field was explicitly declined."
- Evidence: Target line 251-252: only empty-value case sets the flag. No corresponding statement for non-empty values.
- Impact: Implementer misinterpretation risk — could reasonably set the flag for all optional answers, changing `getEmptyFields()` edge cases.
- Recommendation: Rename to `optionalDeclined` or `optionalDismissed` to match actual semantics. Alternatively, set flag for both empty and non-empty values and document the distinction.
- Suggested test: After `answer(assets, "Logo PNG")`, assert `optionalAnswered.assets` is either `undefined` (current design, rename) or `true` (if semantics expanded).
- Dedup key: optional-answered-naming-semantics
- Sources: modeler:M-02

### C-17: Confirmation trigger `"confirmo"` strictness may cause recovery loops

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6 template)
- Lines: 383-384
- Claim: Only exact word "confirmo" (case-insensitive, trimmed, no additional text) is accepted. Users appending pleasantries ("confirmo, gracias") are rejected and re-prompted with "do you want changes?" — misleading since they just confirmed.
- Evidence: Line 384 rejects "sí", "dale", "ok". Re-prompt asks if user wants changes, which is confusing when user intended to confirm.
- Impact: Users who append pleasantries loop 2-3 times before saying the bare word. Re-prompt is misleading.
- Recommendation: Keep strict rule but change re-prompt to "I need you to respond with exactly 'confirmo' to proceed" instead of "do you want changes?". Or accept "confirmo" as substring/startsWith match.
- Suggested test: User says "confirmo, todo bien". Verify agent does not re-enter edit flow but asks for exact trigger word.
- Dedup key: confirmo-strict-trigger-recovery-loop
- Sources: agent-ux:UX-05

### C-18: `reset-confirmation` CLI human-mode output silent about stale mockup

- Severity: P3
- Category: docs
- Status: valid
- File: target.md
- Lines: 315, 285-286
- Claim: `reset-confirmation` human output (Section 5) only says "confirmación de desbloqueo + nuevo estado" — does not mention that `mockup.html` was renamed to `.stale`. Template warns before reset, but CLI output itself is silent about the stale file.
- Evidence: Line 315: output description lacks stale rename mention. Lines 285-286: mockup is renamed. Direct CLI users are not informed.
- Impact: User invoking `reset-confirmation` directly via CLI (not through template flow) will not know a mockup was staled.
- Recommendation: Add to Section 5: `reset-confirmation` human output should include "mockup.html renombrado a mockup.html.stale.<timestamp>" when a mockup existed.
- Suggested test: Create plan with `mockup.html`, run `reset-confirmation` (no `--json`), verify stdout mentions stale rename.
- Dedup key: reset-confirmation-cli-stale-not-reported
- Sources: agent-ux:UX-07

### C-19: Error table conflates `questions()` and `answer()` exit-13 paths

- Severity: P3
- Category: docs
- Status: valid
- File: target.md (Section 6 error table)
- Lines: 372
- Claim: Error table entry for exit 13 says "suggest `reset-confirmation` for `ready_for_html`/`pending_approval`." But `questions()` does not throw exit 13 for these states — it returns `readOnly: true`. This error is only thrown by `answer()`.
- Evidence: Line 232: unrecognized state → exit 13. Lines 230-231: `ready_for_html`/`pending_approval` return readOnly, not error. Line 269: `answer()` throws exit 13 for wrong state. Table applies to both commands but recovery instructions assume exit 13 only comes from `answer()`.
- Impact: Misleading — implies `questions()` can throw this error. Implementer might add exit 13 handling to `questions()` unnecessarily.
- Recommendation: Split error table into per-command sections, or add note: "`questions()` returns `readOnly: true` for `ready_for_html`/`pending_approval` instead of throwing this error."
- Suggested test: Call `questions()` on `ready_for_html` plan. Verify it returns `readOnly: true` and does NOT throw exit 13.
- Dedup key: error-table-invalid-state-questions-vs-answer
- Sources: agent-ux:UX-08

## Non-Issues Checked

- **Lock semantics**: `questions()`, `answer()`, `resetConfirmation()` all acquire global lock before reading/writing, release in `finally`. Consistent across all functions. No deadlock risk in single-process model.
- **`FIELD_REGISTRY` as single source of truth**: Sound design. `REQUIRED_FIELDS`, `ALL_FIELDS`, `CHOICE_FIELDS` derived from registry. Adding a field requires updating only the registry.
- **`answer()` not updating `plan.json`**: Intentional by design. Audit trail in `decisions.json` is sufficient. `requiredFieldsComplete` flag in return eliminates need for follow-up `questions()` call.
- **`optionalAnswered` interaction with required fields**: When `fieldList` is `REQUIRED_FIELDS`, `optionalAnswered` never matches any entry. No silent exclusion of required fields.
- **Placeholder `===` vs `includes()` migration**: Correct bug fix. `"Nodo"` no longer matches `"TODO"`. Bracket detection is reasonable. Tests specified.
- **Hash v1→v2 migration**: Backward compatible. Migration path (confirm → auto-upgrade) is sound. `submitMockup()` dispatch is specified.
- **Error code collision**: `GSDC_PLAN_ARTIFACT_MISSING` (25) vs `GSDC_ARTIFACT_MISSING` (20) — distinct names and codes. No collision.
- **Double-wrap prevention**: `handleSuccess()` wraps raw manager output. Test explicitly checks `parsed.data.data` doesn't exist. Contract is clear.
- **Read-only snapshot for `ready_for_html`/`pending_approval`**: Well-specified. Agent can inspect without modifying. Reset required before editing.
- **`answer()` state guard ordering**: Lock → read → validate state → validate `confirmed !== true` → write. All mutations inside lock. Prevents TOCTOU races.
- **`confirmDecisions()` validation scope**: Uses `REQUIRED_FIELDS` (6 fields). `assets` not validated for completeness. Hash includes `assets` in v2. Consistent.
- **"Otro (personalizado)" sentinel design**: `value: ""` means empty answer to required field leaves it pending. Agent can't accidentally confirm empty custom value. Correct.
- **`writeAtomicJson` crash safety**: Atomic writes via temp-file + rename. No partial JSON on disk after crash.
- **`resetConfirmation()` partial failure recovery**: Well-documented recovery paths. Re-execution correctly handles each partial state.
- **`optionalAnswered` interaction with hash**: Hash covers field values only. Changing `optionalAnswered` without changing values doesn't break hash verification. Correct.
- **`computeDecisionsHash` determinism**: `Object.fromEntries` preserves field array order. v1 and v2 field lists explicitly ordered. Hashes deterministic.
- **Idempotency of `resetConfirmation`**: Three-way check correctly identifies the only safe no-op case. All other combinations proceed with cleanup.

## Residual Risks

- **Exit code 15 external dependency**: Breaking change documented but relies on implementer grep. CI-level check not mandated. External scripts in other repos may depend on exit 15 for "plan not found."
- **Agent template compliance**: "PROHIBIDO" rules depend on agent behavior with no mechanical enforcement. A misbehaving agent could bypass template instructions and write directly to `decisions.json`.
- **Post-approval state handling gap**: `approved` and later states not handled by `resetConfirmation()` or `questions()`. This gap may be forgotten when post-approval editing is needed later.
- **Lock/concurrency limitations**: File-based lock serializes operations but does not address stale counter values when two agents concurrently answer different fields. Lock staleness after crash depends on `lock-manager.js` behavior not specified here. Real-world filesystem locking on network mounts may not provide same guarantees.
- **`optionalAnswered` semantic gaps**: Flag only set for empty-value decline, not for non-empty answers. If semantics are extended later, the absence for non-empty answers will be a gap.
- **Agent behavior inconsistency**: Fuzzy matching for choice fields (C-11), context extraction rules (C-15), and strict "confirmo" trigger (C-17) will produce inconsistent behavior across different agents and model providers until explicit rules are added.
- **Non-empty optional after reset test gap**: Test matrix covers declined-optional case after `resetConfirmation()` but not the non-empty-optional case, even if C-07 is resolved with option (b) (accept current behavior).
