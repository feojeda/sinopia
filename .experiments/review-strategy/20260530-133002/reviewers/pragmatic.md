# Review: pragmatic

## Summary

- Verdict: approve_with_changes
- Top risk: `GSDC_ARTIFACT_MISSING` error name used with two different exit codes (20 and 25), which will cause implementation confusion and potential wrong error handling in the CLI and agent recovery logic.
- Confidence: high

## Findings

### F-01: GSDC_ARTIFACT_MISSING exit code collision (20 vs 25)

- Severity: P2
- Category: cli-contract
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 419-426
- Claim: The proposal introduces exit code 25 (`GSDC_ARTIFACT_MISSING`) for missing internal artifacts like `decisions.json` or `plan.json`.
- Evidence: The current code already uses `GSDC_ARTIFACT_MISSING` with exit code 20 in `submitMockup()` at `lib/plan-manager.js:390-392` for a missing `mockup.html`. The proposal's error table (line 426) defines the same error name `GSDC_ARTIFACT_MISSING` with exit code 25. The proposal does not mention renaming the existing exit-20 usage or distinguishing the two cases by name.
- Impact: An implementer writing `readJsonOrThrow()` will use the name `GSDC_ARTIFACT_MISSING` and may inadvertently use exit 20 (the existing constant) instead of 25. Agent error recovery tables in the template (line 296-302) only list `GSDC_ARTIFACT_MISSING` (25) — if the agent encounters exit 20 from `submitMockup()`, it maps to the same name but different semantics. Any consumer checking `error.code === 'GSDC_ARTIFACT_MISSING'` cannot distinguish between "missing mockup.html" and "missing decisions.json".
- Recommendation: Either (a) use a distinct error name for the new case (e.g., `GSDC_INTERNAL_ARTIFACT_MISSING` for exit 25), or (b) explicitly document that exit 20 = `GSDC_ARTIFACT_MISSING` is for end-of-flow artifacts (mockup.html) and exit 25 = `GSDC_ARTIFACT_MISSING` is for structural artifacts (decisions.json/plan.json), and add a code comment constant to prevent confusion. Option (a) is safer.
- Suggested test: Assert that `submitMockup()` with missing mockup.html returns exit 20, and `questions()` with missing decisions.json returns exit 25, and that their `error.code` values are distinguishable.
- Dedup key: artifact-missing-exit-code-collision

### F-02: resetConfirmation() omits plan.json history entry

- Severity: P2
- Category: state
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 221-229
- Claim: `resetConfirmation()` writes `plan.json` with the new state but does not mention appending to the `history` array.
- Evidence: All existing state transitions in `lib/plan-manager.js` push a history entry (`resolveQuestions` at line 319, `submitMockup` at line 399, `transitionState` at line 515, `deliver` at line 593). The proposal's step 4 (line 225) only says "Escribir `plan.json` con estado `mockup:questions_pending`" — no mention of history. An implementer following the steps literally would produce a plan with no audit trail of the reset.
- Impact: Breaks the auditability invariant — `plan.json.history` would have gaps. Any agent or tool that reconstructs the plan timeline from history would miss reset events.
- Recommendation: Add an explicit step between current steps 4 and 5: push a `{ action: 'reset-confirmation', details: '...' }` entry to `planData.history` before writing `plan.json`.
- Suggested test: After `resetConfirmation()`, read `plan.json` and assert that `history` contains an entry with `action: 'reset-confirmation'` and the new state is `questions_pending`.
- Dedup key: reset-confirmation-missing-history-entry

### F-03: No single source of truth for field definitions

- Severity: P2
- Category: integrity
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 46-56, 82-159, 183
- Claim: The 7 field definitions (names, types, required flags, options) are hardcoded in the `questions()` JSON output, separately from the field lists used by `getEmptyFields()` and `answer()` validation.
- Evidence: `getEmptyFields()` (line 47) takes `fieldList` as a parameter. `answer()` (line 183) validates against "campos conocidos" — a separate hardcoded list. `questions()` (line 82-159) has yet another inline definition of the 7 fields with their metadata. If someone adds a new field to one but not the others, `questions()` would report it as pending but `answer()` would reject it as `GSDC_INVALID_FIELD`, or `getEmptyFields()` wouldn't detect it as empty.
- Impact: Field lists can diverge silently across the three consumers. This has happened before — the current code already duplicates field lists between `confirmDecisions()` (line 185) and `resolveQuestions()` (line 277). The proposal extracts the empty-check logic but does not extract the field registry itself.
- Recommendation: Define a single `FIELD_REGISTRY` constant (or object) at module scope containing field names, required flags, types, options, and question text. All three functions (`questions()`, `answer()` validation, `getEmptyFields()`) should derive their lists from this single source.
- Suggested test: Add a test that iterates `FIELD_REGISTRY` and verifies every field name is accepted by `answer()`, and that `questions()` output length matches the registry size.
- Dedup key: no-single-field-registry

### F-04: resetConfirmation() description omits hashAlgorithm clear in one location

- Severity: P3
- Category: docs
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 220, 364
- Claim: The resetConfirmation step description at line 220 lists the fields to clear (`confirmed`, `confirmedAt`, `decisionsHash`) but omits `hashAlgorithm`. Section 8 line 364 states `resetConfirmation()` clears `hashAlgorithm`.
- Evidence: Line 220: "Pone `confirmation.confirmed = false`, `confirmation.confirmedAt = null`, `confirmation.decisionsHash = ""`" — no `hashAlgorithm`. Line 364: "`resetConfirmation()` limpia `hashAlgorithm` junto con `decisionsHash`". An implementer following the ordered steps (lines 221-228) literally would miss the `hashAlgorithm` clear.
- Impact: If `hashAlgorithm` is not cleared, it has no functional impact because `confirmDecisions()` always overwrites it and `resolveQuestions()` checks `confirmed === true` first. However, it creates an inconsistent state in `decisions.json` where `confirmed: false` but `hashAlgorithm: "sha256-decisions-v2"` persists. This could confuse debugging or future code that reads `hashAlgorithm` without checking `confirmed`.
- Recommendation: Add `confirmation.hashAlgorithm = ""` to the explicit list at line 220.
- Suggested test: After `resetConfirmation()`, assert `decisions.confirmation.hashAlgorithm === ""` (or the appropriate cleared value).
- Dedup key: reset-confirmation-hashAlgorithm-clear-inconsistency

### F-05: Section numbering gap (section 9 missing)

- Severity: P3
- Category: docs
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 366-368
- Claim: The proposal numbers sections 1-8, then jumps to section 10, skipping section 9.
- Evidence: Line 366 ends section 8. Line 368 begins "### 10. Referencias cruzadas".
- Impact: Could cause confusion when referencing sections by number in implementation discussions or code review.
- Recommendation: Renumber section 10 to 9, section 11 to 10, section 12 to 11.
- Suggested test: N/A
- Dedup key: section-numbering-gap

### F-06: Breaking change to plan status exit code not flagged as such

- Severity: P2
- Category: cli-contract
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 37-42, 406
- Claim: The migration from `GSDC_JSON_PARSE_ERROR` (exit 15) to `GSDC_PLAN_NOT_FOUND` (exit 24) for missing plans applies to ALL existing functions including `plan status`.
- Evidence: Current `findPlanDir()` (`lib/plan-manager.js:29-30`) throws `GSDC_JSON_PARSE_ERROR` (exit 15) for missing plans. The proposal's section 1 says this should become `GSDC_PLAN_NOT_FOUND` (exit 24). The verification at line 406 confirms: "`plan status --id 999` retorna `GSDC_PLAN_NOT_FOUND` (exit 24), no `GSDC_JSON_PARSE_ERROR`". The existing CLI handler for `plan status` (`bin/gsd-canva.js:448`) defaults to `GSDC_JSON_PARSE_ERROR` — this default would be overridden by the new error code, so it works. But any external consumer (agent prompts, scripts) checking exit 15 for "plan not found" would silently stop matching.
- Impact: This is a silent breaking change to the CLI contract. The proposal presents it as a fix (the error code was "wrong"), which is reasonable, but it should be explicitly flagged as a breaking change so consumers can update.
- Recommendation: Add a "Breaking Changes" subsection noting that exit code 15 will no longer be emitted for missing plans, replaced by exit 24. Verify no template or agent prompt checks for exit 15 in the "plan not found" case.
- Suggested test: `plan status --id 999 --json` exits with code 24 and `code: 'GSDC_PLAN_NOT_FOUND'`.
- Dedup key: plan-not-found-exit-code-migration-breaking

### F-07: Concurrent questions() test is fragile for CI

- Severity: P3
- Category: testing
- Status: valid
- File: `docs/PROPOSAL_v1.2_interactive_questions.md`
- Lines: 405
- Claim: The test "questions lock consistente: verificar que questions() retorna snapshot consistente bajo escritura concurrente" is listed but is impractical to implement reliably.
- Evidence: The lock manager uses synchronous file-based locks with 100ms retry intervals (`lib/lock-manager.js:100`). Testing true concurrency requires spawning child processes with precise timing, which is inherently flaky in CI environments with variable load.
- Impact: This test will either be skipped (leaving the guarantee unverified) or will be flaky and cause CI failures.
- Recommendation: Replace with a more targeted test: verify that `questions()` acquires and releases the lock correctly (check lock file is gone after completion), and that `questions()` + `answer()` are serialized (run `answer()` during `questions()` and verify serialization, not concurrency). Or accept that lock consistency is an invariant guaranteed by the lock manager's own tests.
- Suggested test: Assert lock file does not exist after `questions()` completes. Assert that calling `questions()` then `answer()` sequentially produces consistent counters.
- Dedup key: concurrent-questions-test-fragility

## Non-Issues Checked

- **Hash v1/v2 migration logic**: The dual-algorithm approach (check `hashAlgorithm` field, use 6 or 7 fields accordingly) is sound. `confirmDecisions()` writes v2, `resolveQuestions()` and `submitMockup()` read both. Migration is automatic on next confirmation. No data loss for existing plans.
- **Double-wrap prevention**: The proposal explicitly states manager functions return raw data and CLI wraps via `handleSuccess()`. Verification step 15 checks for no `parsed.data.data`. This is well-designed.
- **Existing test compatibility**: Tests 1-7 use `decisions.json` reads/writes that include the full object. Adding `assets: ""` and `optionalAnswered: {}` to `create()` output does not break any existing assertions. No test checks for a specific `hashAlgorithm` value.
- **`optionalAnswered` not reset by resetConfirmation()**: This is correct behavior — resetting confirmation should not erase the record of which optional questions were already asked. The user can re-answer via `plan answer` if desired.
- **Lock acquisition for `questions()` read operation**: Reasonable trade-off for snapshot consistency. Single-user CLI tool, lock hold time is minimal.
- **State transitions in `resetConfirmation()`**: Accepted states (`questions_pending`, `ready_for_html`, `pending_approval`) are correct. Excluding `mockup:approved` and later states is intentional — post-approval changes are a different workflow.
- **Recovery after partial `resetConfirmation()` failure**: Documented at line 229. Re-running completes cleanup. The error recovery table instructs agents to offer `reset-confirmation` on `GSDC_DECISIONS_LOCKED`, providing a path out of the intermediate state.
- **`roadmap_progreso.md` references `mockup:pending`**: Correctly identified at line 371 as needing update to `mockup:questions_pending`. Template at `templates/plan-templates/roadmap_progreso.md:11` confirms the reference exists.
- **`preguntas.md` missing assets field**: Correctly identified at line 375-377. Current template only has 6 fields.
- **`answer()` does not validate value content**: Intentional — `answer()` is a thin write-through. Completeness validation belongs to `confirmDecisions()`.
- **`readJsonOrThrow()` excluded from `list()`**: Correct — `list()` has its own tolerant try-catch for corrupt plans. No change needed.

## Residual Risks

- The `GSDC_ARTIFACT_MISSING` name collision (F-01) may not surface until an agent encounters exit 20 from `submitMockup()` and maps it to the wrong recovery action. This should be resolved before implementation.
- The field registry divergence risk (F-03) is moderate. The proposal extracts the empty-check helper but leaves the field definitions scattered. A future addition of an 8th field could easily introduce inconsistencies if the registry is not centralized.
- The `questions()` output hardcodes Spanish-language question text and option labels inside the library function. This is not a problem for the current use case but would need restructuring if the framework ever supports i18n. Not blocking.
- The `mockup.html.stale.<timestamp>` renaming in `resetConfirmation()` could accumulate multiple `.stale` files if the user repeatedly resets and re-submits. `submitMockup()` correctly only checks for `mockup.html`, so this is cosmetic. Not blocking.
