# Review: pragmatic

## Summary

- Verdict: approve_with_changes
- Top risk: CLI fallback migration scope is imprecise — implementer may under- or over-migrate fallback exit codes in `bin/gsd-canva.js`, breaking error handling for unrelated commands.
- Confidence: high

## Findings

### P2-01: CLI handleError fallback migration scope is under-specified

- Severity: P2
- Category: cli-contract
- Status: valid
- File: bin/gsd-canva.js
- Lines: 228, 247, 263, 279, 295, 312, 327, 344, 359, 375, 414, 451, 489
- Claim: The proposal states "Cambiar todos los `err.exitCode || 15` y `err.exitCode || 19` a `err.exitCode || 1`" and "Cualquier error sin exitCode explícito usa 1, no un code viejo."
- Evidence: Target §5 (line 316) and §Breaking Changes (line 44) only call out `|| 15` and `|| 19`. But the actual CLI has 10+ distinct fallback codes: `|| 10` (create, line 228), `|| 13` (approve-mockup line 295, start-draft line 312, etc.), `|| 14` (deliver, line 375), `|| 16` (init line 121, upgrade line 155), `|| 18` (doctor line 193), `|| 20` (submit-mockup line 279). The blanket statement "cualquier error sin exitCode explícito usa 1" contradicts the narrow instruction to only change 15 and 19.
- Impact: Implementer either changes only `|| 15` and `|| 19` (inconsistent — other stale fallbacks remain) or changes everything (init, upgrade, doctor, deliver fallbacks become generic, losing diagnostic signal). Either outcome is a real behavior change not fully analyzed.
- Recommendation: Explicitly list every CLI action handler and its intended fallback. Decide: (a) change only plan-related commands' fallbacks to `|| 1`, or (b) change all commands. Document the decision with a complete before/after table.
- Suggested test: After implementation, `grep -n 'exitCode ||' bin/gsd-canva.js` should produce exactly the expected set of fallbacks with no surprises.
- Dedup key: cli-handleerror-fallback-scope

### P2-02: Hardcoded field arrays in existing functions not explicitly replaced

- Severity: P2
- Category: integrity
- Status: valid
- File: lib/plan-manager.js
- Lines: 185, 277
- Claim: The proposal introduces `FIELD_REGISTRY` and `REQUIRED_FIELDS` as the single source of truth, but does not explicitly instruct replacing the hardcoded `fields` arrays in `confirmDecisions()` (line 185) and `resolveQuestions()` (line 277).
- Evidence: Target §1 defines `REQUIRED_FIELDS` derived from `FIELD_REGISTRY` (line 89). Target §8 discusses hash changes. But no section says "replace `const fields = ['vertical', 'audiencia', ...]` with `REQUIRED_FIELDS`" in the existing functions. Current code at line 185: `const fields = ['vertical', 'audiencia', 'formato', 'paleta', 'copy', 'cta']` and at line 277 the same. An implementer focused on the hash migration could leave these hardcoded arrays untouched, creating divergence if `FIELD_REGISTRY` ever changes.
- Impact: If `FIELD_REGISTRY` is later modified (e.g., a field added), the validation arrays would not update, creating a silent inconsistency between validation and registry.
- Recommendation: Add explicit instruction: "In `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`: replace all hardcoded `fields` arrays with `REQUIRED_FIELDS` imported from `FIELD_REGISTRY`."
- Suggested test: After implementation, `rg "vertical.*audiencia.*formato.*paleta.*copy.*cta" lib/plan-manager.js` should return 0 hits — all field lists derive from `FIELD_REGISTRY`.
- Dedup key: hardcoded-fields-not-replaced

### P2-03: resetConfirmation() recovery window leaves diagnosable but unhandled state

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: (new function, not yet in file)
- Claim: Target §4 (lines 293-301) documents recovery: "Si falla después de paso 4, estado es `ready_for_html`/`pending_approval` + `confirmed=false` → `answer()` falla con `GSDC_INVALID_STATE`."
- Evidence: The template error table (target §6, line 394) says for `GSDC_INVALID_STATE`: "Ejecutar `plan status`. Sugerir `reset-confirmation` si aplica." This correctly routes the agent. However, `plan status` (current `status()` at plan-manager.js:658-682) does not read `decisions.json` — it only reads `plan.json`. So `status` would show the plan's state (`ready_for_html`) but not reveal that `confirmed` is `false` inside `decisions.json`. The agent would see `ready_for_html` and might conclude no reset is needed.
- Impact: During the recovery window, an agent calling `plan status` would not have enough information to diagnose the inconsistency between `plan.json` (showing `ready_for_html`) and `decisions.json` (showing `confirmed: false`). The recovery depends on the agent blindly re-running `resetConfirmation()`, which works but is not well-supported by diagnostics.
- Recommendation: Either (a) extend `status()` output to include `confirmation.confirmed` when present in `decisions.json`, or (b) add a note in the template that `GSDC_INVALID_STATE` after a failed reset should trigger an immediate re-execution of `reset-confirmation` without relying on `status` for diagnosis.
- Suggested test: Create fixture: `plan.json` with `ready_for_html` + `decisions.json` with `confirmed: false`. Run `resetConfirmation()`. Verify it succeeds and produces correct final state.
- Dedup key: reset-confirmation-recovery-diagnosis

### P2-04: questions() confirmed masking hides unfilled required fields from contract

- Severity: P2
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js
- Lines: (new function, not yet in file)
- Claim: Target §2 (line 232) and §Notes (line 585): `questions()` returns `pending: []` when `confirmed === true`, regardless of actual field completeness.
- Evidence: The `confirmDecisions()` function validates all required fields before setting `confirmed = true`. So in normal flow, all required fields are filled when confirmed. However, `resetConfirmation()` preserves required field values while clearing `optionalAnswered` and optional values. If after reset, someone manually sets `confirmed = true` in `decisions.json` without filling all fields, `questions()` would return `pending: []` — hiding the incompleteness. More importantly, any consumer that only reads `pending` without checking `confirmed` first would get a false positive. The plan documents this (line 585) but the JSON contract itself offers no structural guard.
- Impact: A future consumer (agent, script, or test) that reads only `pending` from `questions()` output would believe all fields are answered when `confirmed === true`, even if fields are empty. This is a footgun in the API contract.
- Recommendation: Add an explicit `"pendingMasked": true` flag when `confirmed === true` and `pending` is overridden to `[]`. This gives consumers a machine-readable signal that `pending` does not reflect reality. Alternatively, always return real `pending` and add a separate `"editable": false` flag.
- Suggested test: Create fixture: `confirmed: true`, 5/6 required fields filled. Call `questions()`. Assert `pending` is `[]`. Assert `confirmed` is `true`. Assert `readOnly` is `true`.
- Dedup key: questions-confirmed-pending-masking

### P3-01: create() schema omits confirmedBy and source present in confirmDecisions()

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: 100-115 (current create), target §7 line 428-434
- Claim: Target §7 shows `create()` initializing `confirmation` with only `confirmed`, `confirmedAt`, `decisionsHash`, `hashAlgorithm`. Current `confirmDecisions()` (plan-manager.js:216-223) writes `confirmedBy` and `source` fields.
- Evidence: Current `create()` at line 110-111 includes `confirmedBy: null` and `source: "chat"`. The proposal's §7 (line 428-434) omits these. `confirmDecisions()` at line 219 writes `confirmedBy: options.by || "user"` and line 220 `source: "chat"`. The proposal does not state whether to remove or keep these fields.
- Impact: Minor schema inconsistency. The fields are absent at creation but appear after confirmation. No functional break, but any consumer expecting these fields at creation time would get `undefined`.
- Recommendation: Either keep `confirmedBy: null` and `source: "chat"` in `create()` for consistency with existing behavior, or explicitly document their removal as a breaking change.
- Suggested test: After `create()`, read `decisions.json` and assert the `confirmation` object matches the documented schema exactly.
- Dedup key: create-confirmation-schema-fields

### P3-02: "confirmo" negation check is narrow

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target §6 line 405
- Claim: Target §6 specifies negation check: "Si el input contiene `"no confirmo"` → rechazar."
- Evidence: The check is a literal string match for `"no confirmo"`. But a user could write `"no lo confirmo"`, `"no quiero confirmo"`, or `"no, no confirmo"` — only `"no confirmo"` as a substring is checked. The regex `/\bconfirmo\b/i` would match all of these, and the negation check would miss the first two.
- Impact: Low probability — in practice, the user would need to write an unusual phrasing. But the template says "acepta frases naturales" (line 589), which sets an expectation that partial negations would be caught.
- Recommendation: Expand negation check to `/\bno\s+.*\bconfirmo\b/i` or similar pattern that catches negation words before "confirmo". Alternatively, simplify to: if input contains "no" and matches `confirmo`, reject.
- Suggested test: Assert `"no lo confirmo"` → rejected. Assert `"no quiero confirmo"` → rejected. Assert `"claro que confirmo"` → accepted.
- Dedup key: confirmo-negation-narrow

### P3-03: Lock inconsistency — questions() acquires lock but status() does not

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 658-682 (current status), target §2 line 238
- Claim: Target §2 (line 238) specifies `questions()` acquires lock before reading. Current `status()` (plan-manager.js:658-682) does not acquire a lock.
- Evidence: Both are read-only operations. `questions()` reads `decisions.json` and `plan.json`. `status()` reads only `plan.json`. The inconsistency means `questions()` is protected against concurrent writes but `status()` is not. If `answer()` is writing `decisions.json` while `status()` reads `plan.json`, `status()` could return stale state information.
- Impact: Low risk — `status()` only reads `plan.json` which is written atomically via `writeAtomicJson`. But the inconsistency could confuse future maintainers about when locks are needed for reads.
- Recommendation: Document the lock policy: "All new functions acquire locks. Existing `status()` and `list()` are grandfathered without locks. Future refactor should add locks uniformly." Or add locks to `status()` now for consistency.
- Suggested test: Not testable without simulating concurrent access. Document as known limitation.
- Dedup key: lock-inconsistency-questions-status

### P3-04: Pre-implementation grep audit is manual and unmetered

- Severity: P3
- Category: integrity
- Status: valid
- File: (cross-cutting)
- Lines: target §Breaking Changes line 36
- Claim: Target requires pre-implementation grep: `rg "exit.*15|GSDC_JSON_PARSE_ERROR|exitCode.*15|code.*15" templates/ bin/ tests/ docs/`
- Evidence: This is a manual step the implementer must perform before writing code. If forgotten or done incompletely, references to exit code 15 could remain in templates or docs, causing agents to expect the old behavior. The proposal lists it as a prerequisite but provides no verification step in the test plan.
- Recommendation: Add a test case or verification step: "After implementation, `rg 'GSDC_JSON_PARSE_ERROR' bin/` returns 0 hits for `findPlanDir`-related usage" or add it as step 22 in the verification checklist.
- Suggested test: `rg "exitCode.*15" bin/gsd-canva.js` returns 0 hits after migration (except for genuine JSON parse errors using the retained exit 15).
- Dedup key: pre-impl-grep-audit-unmetered

### P3-05: Section 9 cross-reference instruction is vague

- Severity: P3
- Category: docs
- Status: valid
- File: (cross-cutting)
- Lines: target §9 line 463
- Claim: Target §9 says: `rg "mockup:pending" templates/ docs/ README.md → actualizar.`
- Evidence: The current state machine does not have a state called `mockup:pending`. The valid states are `questions_pending`, `ready_for_html`, `pending_approval`, `approved`. The grep pattern `mockup:pending` might match `mockup:pending_approval` as a substring, but the instruction "actualizar" is ambiguous — update to what? Replace with what string?
- Impact: Implementer may skip this step or make incorrect substitutions. The instruction is too vague to execute deterministically.
- Recommendation: Replace with specific instruction: "Search for references to `mockup:pending` (which may match `pending_approval` as substring) and verify they reflect the current state machine. No state rename is needed — this is a verification step only." Or remove if not applicable.
- Suggested test: After implementation, `rg "mockup:pending[^_]" templates/ docs/` returns 0 hits (no bare `mockup:pending` without `_approval`).
- Dedup key: section9-crossref-vague

## Non-Issues Checked

- **Exit code 15 retention for JSON parse errors**: The proposal correctly retains exit 15 for `GSDC_JSON_PARSE_ERROR` (actual JSON corruption) while migrating plan-not-found to exit 24. The separation is clean.
- **Hash v1→v2 migration path**: The dispatch logic in `resolveQuestions()` and `submitMockup()` correctly falls back to 7-field hash for any unrecognized algorithm, ensuring v1 plans verified before upgrade continue to work. `confirmDecisions()` always writes v2, making the migration atomic.
- **`ensureV2Fields()` read-only behavior**: Correctly modifies in-memory only for read functions (`questions()`, `status()`) and persists on first mutation. No side-effect leakage.
- **`optionalAnswered` flag isolation**: The proposal explicitly constrains `optionalAnswered` to optional fields only (line 258), preventing a bug where setting the flag on required fields would hide empty required fields.
- **Placeholder detection `includes()` → `===` breaking change**: Acknowledged and documented. The test migration (changing `'TODO: definir'` to `'TODO'` in test 2) is correct. The pre-existing "Nodo" false positive bug (repo-context line 58) is fixed by this change.
- **`GSDC_MOCKUP_MISSING` rename**: Exit 20 is only used by `submitMockup()`, so renaming `GSDC_ARTIFACT_MISSING` to `GSDC_MOCKUP_MISSING` has no collision risk.
- **`findPlanDirOrThrow()` vs `findPlanDir()` side-effect removal**: The current `findPlanDir()` creates `canva-plans/` if absent (plan-manager.js:23). Removing this `mkdirSync` is safe — the directory exists if any plan was created. If no plans exist, `GSDC_PLAN_NOT_FOUND` is the correct error.
- **Test 7 (template registration) compatibility**: The proposal does not modify `templateCatalog.register()` or the template system. Test 7 should continue to pass unchanged.
- **`resetConfirmation()` idempotency**: The no-op condition (`questions_pending` + `confirmed !== true` + `!mockupExists`) and history dedup check (last entry same `action` + `from`) are well-specified and prevent duplicate entries.
- **`answer()` choice validation order**: Numeric rejection, "Otro" rejection, custom acceptance, and non-custom rejection are correctly ordered to avoid ambiguity.
- **`FIELD_REGISTRY` as single source of truth**: The "Otro (personalizado)" option is derived from `allowCustom`, not hardcoded. `OPTIONAL_FIELDS` and `REQUIRED_FIELDS` are computed from the registry. This is a clean design.

## Residual Risks

- **Concurrent mockup generation + reset**: If `mockup.html` is being written by another process while `resetConfirmation()` executes, the rename could race. The lock protects against CLI concurrency but not against external processes writing to the plan directory.
- **`status()` not reading `decisions.json`**: After this proposal, `status()` still only reads `plan.json`. It cannot report `confirmation.confirmed` or field completeness. This limits diagnostic value during the `resetConfirmation()` recovery window (finding P2-03).
- **Template section 2 replacement scope**: The proposal replaces "SECCIÓN 2 COMPLETA" of `canva-mockup.md`. If the template has been modified locally since the repo snapshot, the replacement could conflict. The pre-implementation prerequisite (clean git status) mitigates this.
- **New exit codes 24, 25, 26**: These are not used by any existing code. If the system has external monitoring or scripts that flag unrecognized exit codes, these would appear as new failure modes. The grep audit scope (templates/, bin/, tests/, docs/) does not cover external tooling.
