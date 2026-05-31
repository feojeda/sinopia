# Review: pragmatic

## Summary

- Verdict: approve_with_changes
- Top risk: Missing grep audit for `GSDC_ARTIFACT_MISSING` rename could leave stale references in templates/tests after implementation, causing silent mismatches in error handling.
- Confidence: high

## Findings

### F-01: Missing pre-implementation grep audit for GSDC_ARTIFACT_MISSING -> GSDC_MOCKUP_MISSING rename

- Severity: P2
- Category: integrity
- Status: valid
- File: lib/plan-manager.js, bin/gsd-canva.js, tests/plan.test.js
- Lines: plan-manager.js:390, gsd-canva.js:279, plan.test.js:124
- Claim: The proposal renames `GSDC_ARTIFACT_MISSING` (exit 20) to `GSDC_MOCKUP_MISSING` but lacks a pre-implementation grep audit step, unlike every other breaking change in the document.
- Evidence: Target doc line 36 provides an explicit grep command for exit-15 migration (`rg "exit.*15|GSDC_JSON_PARSE_ERROR|..."`), and line 44 provides one for `exitCode ||`. The rename of `GSDC_ARTIFACT_MISSING` is mentioned at line 104 and 555 but has no corresponding audit command. Current code references: `plan-manager.js:390` (`error.code = 'GSDC_ARTIFACT_MISSING'`), `bin/gsd-canva.js:279` (`err.code || 'GSDC_ARTIFACT_MISSING'`), `tests/plan.test.js:124` (`assert.strictEqual(err.code, 'GSDC_ARTIFACT_MISSING'`).
- Impact: An implementer following only the explicit audit steps would miss these three sites. The test would fail at runtime (asserting old code string), the CLI fallback in submit-mockup handler would mask the wrong code, and `plan-manager.js` would still throw the old code. The error would still functionally work (same exit code 20) but the code string in JSON output would be inconsistent with the documented error table.
- Recommendation: Add a pre-implementation step: `rg "GSDC_ARTIFACT_MISSING" lib/ bin/ tests/ templates/` and audit every hit. Mirror the format of the existing audit commands in the Breaking Changes section.
- Suggested test: After implementation, `rg "GSDC_ARTIFACT_MISSING" lib/ bin/ tests/` returns 0 hits.
- Dedup key: artifact-missing-rename-audit-missing

### F-02: answer() stores non-canonical case for case-insensitive choice matches

- Severity: P3
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js (proposed answer())
- Lines: Target doc lines 259-260
- Claim: `answer()` performs case-insensitive matching against choice options but stores the user-provided value without normalizing to the canonical option form. This creates an ambiguous contract between the template (which shows canonical options for confirmation) and the CLI (which accepts any casing).
- Evidence: Target doc line 259: "Si value no coincide con ninguna opcion (case-insensitive) y el campo tiene allowCustom: true -> aceptar (valor custom)". This implies that if value DOES match case-insensitively, it is accepted and stored as-is. The hash is computed over the stored value (target doc line 461: `normalize(decisions[field])` where normalize is NFC case-sensitive). So `answer(vertical, "saas / producto digital")` would be stored as lowercase, producing a different hash than the canonical `"SaaS / Producto Digital"`. The template at target doc line 371 says "mostrar esa opcion para confirmar" (show canonical option), but does not mandate passing the canonical value to `answer()`.
- Impact: If the template passes the canonical value (as intended), no issue. If a direct CLI user or a poorly implemented template passes non-canonical casing, the stored value diverges from what the user saw during confirmation. The hash still protects the stored value correctly, but `decisions.json` would contain a surprising non-canonical value that could confuse downstream readers or manual inspection.
- Recommendation: Either (a) normalize accepted choice values to the canonical option form when case-insensitive match succeeds, or (b) explicitly document that `answer()` stores the value as-provided and the template is responsible for passing canonical forms. Option (a) is safer.
- Suggested test: `answer(vertical, "saas / producto digital")` -> stored value is `"SaaS / Producto Digital"` (normalized) OR stored value is `"saas / producto digital"` (documented as-is). Pick one and test it.
- Dedup key: answer-choice-case-normalization

### F-03: Missing explicit test for questions() output after resetConfirmation()

- Severity: P3
- Category: testing
- Status: valid
- File: tests/plan.test.js (proposed)
- Lines: Target doc lines 489-540 (test plan)
- Claim: The test plan covers `resetConfirmation()` behavior (lines 513-522) and `questions()` behavior (lines 489-499) separately, but does not explicitly test `questions()` output after `resetConfirmation()` to verify that optional fields reappear as pending and `optionalAnsweredStatus` reflects the reset.
- Evidence: Target doc line 516: "Limpia optional values: llenar assets='Logo PNG', confirmar, reset -> optionalPendingCount === 1, assets === ''" — this tests reset output but not `questions()` output post-reset. Target doc line 489-499 covers `questions()` tests but none call `questions()` after a reset. After reset, `optionalAnswered` is `{}` and `assets` is `""`, so `questions()` should show `optionalPendingCount: 1` and `optionalAnsweredStatus: { assets: false }`. This is the natural consequence of the reset but is not explicitly verified.
- Impact: If `resetConfirmation()` clears `optionalAnswered` but `questions()` has a stale cache or reads from a different path, the reset effect would not be visible to the agent. Low risk but the test gap could hide a subtle bug in the read-after-write path.
- Recommendation: Add one test: fill all fields + assets, confirm, reset, then call `questions()` and assert `optionalPendingCount === 1`, `optionalAnsweredStatus.assets === false`, `pending` includes assets, `requiredPendingCount === 0`.
- Suggested test: As described above.
- Dedup key: questions-after-reset-test-gap

### F-04: resolveQuestions() placeholder detection migration implied but not explicit

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: plan-manager.js:276-293 (current inline placeholder check)
- Claim: The proposal states a blanket change from `includes()` to `===` for placeholder detection (target doc line 42) and says to replace hardcoded field arrays in `resolveQuestions()` with `REQUIRED_FIELDS` (target doc line 100). But it does not explicitly state that `resolveQuestions()` should use `getEmptyFields()` or that its inline placeholder check should be replaced.
- Evidence: Current `resolveQuestions()` at plan-manager.js:276-293 has its own inline placeholder check using `includes()`. Target doc line 100 says "reemplazar todos los arrays hardcodeados" in `resolveQuestions()`, but this refers to the field array `['vertical', 'audiencia', ...]`, not the placeholder detection logic. The `getEmptyFields()` function (target doc lines 108-118) uses `===`, and the proposal says to use it in `confirmDecisions()` (target doc line 469). For `resolveQuestions()`, the placeholder check is a redundant belt-and-suspenders validation — `confirmDecisions()` already catches empty fields before `resolveQuestions()` runs. An implementer could reasonably keep the old `includes()` check in `resolveQuestions()`, creating an inconsistency where `confirmDecisions()` uses `===` but `resolveQuestions()` uses `includes()`.
- Impact: Inconsistent placeholder detection between confirm and resolve. `"PENDIENTE DE REVISION"` would pass `confirmDecisions()` (=== match, not detected) but could fail `resolveQuestions()` (includes match, detected). This creates a dead zone where a value accepted by confirm is rejected by resolve.
- Recommendation: Explicitly state that `resolveQuestions()` should also use `getEmptyFields(decisions, REQUIRED_FIELDS)` instead of its inline placeholder check, or remove the redundant check entirely since `confirmDecisions()` already validates.
- Suggested test: After implementation, `rg "includes\\(p\\)" lib/plan-manager.js` returns 0 hits.
- Dedup key: resolve-placeholder-detection-inconsistency

### F-05: handleError blanket || 1 changes exit codes for non-plan command handlers

- Severity: P3
- Category: cli-contract
- Status: valid
- File: bin/gsd-canva.js
- Lines: gsd-canva.js:121, 156, 193, 416, 450, 488
- Claim: The proposal mandates changing ALL `err.exitCode || <code>` to `err.exitCode || 1` (target doc line 321), including non-plan handlers (`init`, `upgrade`, `doctor`, `plan list`, `plan status`, `template register`). This changes the fallback exit code for unexpected errors in these handlers from specific values (16, 18, 15) to generic 1.
- Evidence: Current fallbacks: `init` handler at gsd-canva.js:121 (`|| 16`), `doctor` at gsd-canva.js:193 (`|| 18`), `plan list` at gsd-canva.js:416 (`|| 15`), `plan status` at gsd-canva.js:450 (`|| 15`), `template register` at gsd-canva.js:488 (`|| 15`). Target doc line 321: "todos los err.exitCode || <code> -> err.exitCode || 1 en bin/gsd-canva.js (todos los handlers, no solo plan)."
- Impact: Any external scripts or CI pipelines that check exit codes for these commands would see 1 instead of 16/18/15 for unexpected errors. Since unexpected errors are by definition rare (all thrown errors have explicit `exitCode`), this is unlikely to cause real issues. Exit 1 is the standard POSIX "something went wrong" code, so this is arguably better. But it is a behavioral change not scoped to the plan subsystem.
- Recommendation: Either scope the blanket change to plan handlers only, or explicitly acknowledge that non-plan handlers also change. The current wording is clear about the scope ("todos los handlers, no solo plan") so this is intentional — just verify no CI scripts depend on codes 16, 18, or 15 from these commands.
- Suggested test: `grep -n 'exitCode ||' bin/gsd-canva.js` produces only `|| 1` post-implementation (already in verification step 23).
- Dedup key: handleerror-fallback-scope-breadth

### F-06: confirmedBy and source fields initialized but never populated or discussed

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed create()), canva-mockup.md (proposed template)
- Lines: Target doc lines 436-444
- Claim: The proposed `create()` structure initializes `confirmation.confirmedBy: null` and `confirmation.source: "chat"`, but neither the proposal's changes to `confirmDecisions()` nor the template discuss who sets `confirmedBy` or what values `source` takes.
- Evidence: Current code at plan-manager.js:110 already has `confirmedBy: null` and `source: "chat"` in `create()`, and `confirmDecisions()` at line 219 sets `confirmedBy: options.by || "user"`. The proposal's section 7 (target doc lines 436-444) shows `confirmedBy: null` and `source: "chat"` but does not mention that `confirmDecisions()` should continue to accept `options.by` and populate `confirmedBy`. The existing `--by` CLI flag at gsd-canva.js:239 is not mentioned in the proposal's CLI changes (section 5).
- Impact: If the implementer follows only the proposal text and doesn't check existing code, they might not wire up `confirmedBy` in the updated `confirmDecisions()`. The field would remain null after confirmation. This is a minor data completeness issue but could affect audit trails.
- Recommendation: Add a note in section 8 (hash/confirm changes) that `confirmDecisions()` continues to accept `options.by` and populate `confirmedBy` as in the current implementation.
- Suggested test: `confirmDecisions('001', { by: 'user_test' })` -> `decisions.confirmation.confirmedBy === 'user_test'`.
- Dedup key: confirmedby-source-semantics-undefined

## Non-Issues Checked

- **Placeholder detection === change for test 2**: Target doc correctly identifies `plan.test.js:62` (`'TODO: definir'`) needs updating to `'TODO'`. Without this fix, the test would break because `===` would not match `'TODO: definir'`.
- **findPlanDir exit code migration**: Target doc provides thorough grep audit at line 36 listing all affected functions. Current `findPlanDir()` at plan-manager.js:29 throws `GSDC_JSON_PARSE_ERROR` (15), and the audit covers all call sites.
- **Hash migration v1 to v2**: Both normalize functions are identical (NFC, case-sensitive). The only difference is field count (6 vs 7). `confirmDecisions()` always computes v2. Clean migration path.
- **resetConfirmation() write ordering**: plan.json written before decisions.json (target doc line 305-306). If crash occurs between steps, re-execution can continue. Correct recovery design.
- **ensureV2Fields() non-persistence in questions()**: Read-only operations don't persist migration. First mutation persists. Consistent with read-only semantics.
- **optionalAnswered semantics**: Flag set for all optional field responses (empty or not). `getEmptyFields()` excludes flagged fields. Clean design.
- **Lock manager exclusive locks**: lock-manager.js uses file-based exclusive locks. `questions()` acquiring a lock is correct for read consistency, even though it's read-only. Contention is bounded by the 10s timeout.
- **Lock release in finally blocks**: All proposed functions follow the existing pattern of `try/finally` with lock release. Consistent with current code.
- **Error table completeness**: New error codes 22-26 fill gaps without colliding with existing codes (10, 13-15, 19-21).
- **Idempotency of resetConfirmation()**: No-op when `questions_pending + confirmed !== true + no mockup`. Re-executable after partial failure. Well specified.
- **confirmo parsing regex**: Word-boundary regex with negation check handles edge cases. Test plan covers "sí, confirmo", "no confirmo", "confirmar" (rejected).
- **CLI --json double-wrap prevention**: `handleSuccess()` wraps data in `{ ok: true, data }`. Functions return raw data. No double-wrap. Test at target doc line 536.
- **Stale mockup rename failure handling**: `staleRenameFailed: true` in return (target doc line 304). Non-fatal. Documented cleanup. Acceptable.

## Residual Risks

- **.stale file accumulation**: `resetConfirmation()` renames `mockup.html` to `.stale.<timestamp>` but no automated cleanup or retention policy is documented. Over many reset cycles, stale files could accumulate. Low priority but worth noting in operational docs.
- **Template-agent contract enforcement**: The proposal relies on the agent template (canva-mockup.md) to pass canonical option values to `answer()`. Nothing in the CLI enforces this. A misbehaving agent could pass non-canonical values that are accepted and stored differently from what the user confirmed. Mitigated by the template being detailed and explicit.
- **Concurrent CLI invocations**: While the lock manager handles concurrency, the proposal doesn't test concurrent `answer()` calls on the same plan. The lock serializes operations, so correctness is maintained, but no test verifies this.
- **v1 plan migration edge case**: A plan created with v1 code that has `hashAlgorithm: "sha256-decisions-v1"` and a stored hash, if `confirmDecisions()` is re-called (currently not possible since state blocks it), would be migrated to v2. The proposal correctly prevents this via state validation, but if state validation is bypassed (direct file edit), the migration behavior should still be correct — and it is, since `confirmDecisions()` always computes v2.
