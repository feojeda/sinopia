# Review Consolidado: PROPOSAL_v1.2_antigravity_questions (Rev. 17)

## Meta

- Target: docs/PROPOSAL_v1.2_antigravity_questions.md (Rev. 17)
- Estrategia: 2 — Default recomendado
- Reviewers: pragmatic, operator, modeler, agent-ux
- Fecha: 2026-05-30

## Summary

- Verdict: reject_until_fixed
- Top risk: `staleMockupExists` flag creates an unrecoverable deadlock — no operation clears it, `submitMockup()` blocks unconditionally, and manual editing is prohibited
- Confidence: high

## Findings

### CF-001: `staleMockupExists` flag creates unrecoverable deadlock

- Severity: P1
- Category: state
- Status: valid
- File: target.md (Section 4 — resetConfirmation, Guard contra stale mockup reuso)
- Lines: 339-351
- Claim: When `resetConfirmation()` fails to rename `mockup.html`, it persists `staleMockupExists: true` in `decisions.json`. No documented operation ever clears this flag, and `submitMockup()` rejects unconditionally if present. This creates a permanent deadlock.
- Evidence: (1) resetConfirmation step 5 cleans `confirmed`, `confirmedAt`, `confirmedBy`, `decisionsHash`, `hashAlgorithm`, `optionalAnswered`, optional values — but NOT `staleMockupExists`. (2) Step 6 (rename) runs after step 5 (decisions.json write), so persisting the flag requires a second write not specified in the step model. (3) Re-running resetConfirmation does not clear the flag (step 5 doesn't list it). (4) `confirmDecisions()` and `answer()` do not mention it. (5) `submitMockup()` blocks if flag is present regardless of mtime. (6) Manual editing of `decisions.json` is explicitly prohibited by the template. User flow: reset fails → flag set → generate new mockup → submit blocked → reset again → flag persists → loop forever.
- Impact: Unrecoverable state without manual `decisions.json` surgery, contradicting the proposal's idempotent recovery philosophy. A transient I/O error during rename permanently traps the user.
- Recommendation: Two changes required: (a) Reorder resetConfirmation steps to 4 (plan.json) → 6 (try rename, record outcome) → 5 (decisions.json including `staleMockupExists` if rename failed). This makes the flag persistable in a single write. (b) Add `staleMockupExists: false` to resetConfirmation's cleanup list in step 5. On re-execution, always clear the flag. If rename then fails again, re-set it. This ensures the flag is always reset to clean slate on each resetConfirmation call.
- Suggested test: Plan → fill → confirm → resolve → resetConfirmation with mocked `fs.renameSync` throwing EACCES → verify `staleMockupExists: true` in `decisions.json` → re-run resetConfirmation → verify `staleMockupExists` is cleared (or absent) → fill + confirm + submit succeeds.
- Dedup key: staleMockupExists-deadlock
- Sources: agent-ux:UX-001, pragmatic:P2-001, pragmatic:P2-002, operator:OP-001

### CF-002: `confirmDecisions()` should warn on unaddressed optional fields

- Severity: P2
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js (Section 8 — confirmDecisions)
- Lines: target.md:564-566, counter-arguments.md:8-23
- Claim: `confirmDecisions()` validates required fields (exit 19) but provides zero signal about unaddressed optional fields. The separation-of-layers argument is valid (optional gating is UX policy), but the API should emit an advisory warning consistent with `answer()`'s warning pattern.
- Evidence: (1) `confirmDecisions()` calls `getEmptyFields(decisions, REQUIRED_FIELDS)` — only required checked. (2) `allQuestionsAddressed` is computed by `questions()`/`answer()` but never referenced at confirmation boundary. (3) The author's own counter-proposal (counter-arguments.md:23) acknowledges the gap and suggests `warning: "optional_fields_not_addressed"`. (4) `answer()` already uses the warning pattern for empty required fields — consistent design.
- Impact: A buggy agent that fills required fields and calls `confirmDecisions()` directly gets no feedback that optionals were skipped. The warning provides a secondary safety net without coupling the API to a specific UI policy.
- Recommendation: Adopt the author's counter-proposal: add `"warning": "optional_fields_not_addressed"` to `confirmDecisions()` response when any optional field has `optionalAnswered[field] !== true`. Do NOT block (exit 19) — keep advisory. Document in template that agents should check this warning.
- Suggested test: Fill 6/6 required, skip assets → `confirmDecisions()` → success with `warning: "optional_fields_not_addressed"`. Fill all + decline assets → `confirmDecisions()` → success, no warning.
- Dedup key: confirmDecisions-optional-warning-gap
- Sources: modeler:MOD-002, agent-ux:UX-002, operator:OP-004

### CF-003: CLI handleError blanket `|| 1` silently collapses diagnostics

- Severity: P2
- Category: cli-contract
- Status: valid
- File: bin/gsd-canva.js
- Lines: target.md:51, 365
- Claim: The proposal mandates all `err.exitCode || <code>` → `err.exitCode || 1` as a blanket rule. Current code has meaningful per-command fallback codes (`|| 10`, `|| 19`, `|| 20`, `|| 13`, `|| 14`) that provide diagnostics when `planManager` throws without `exitCode`.
- Evidence: If a future bug produces an unexpected error (e.g., TypeError from null access), the current fallbacks give meaningful per-command diagnostics. With `|| 1`, all unexpected errors collapse to exit 1, making it harder to distinguish "unexpected crash" from other exit-1 scenarios.
- Impact: Any `planManager` regression that throws without `exitCode` loses diagnostic information. Scripts parsing exit codes see different behavior.
- Recommendation: Keep the blanket rule but ensure every `planManager` function (including new `questions()`, `answer()`, `resetConfirmation()`) always throws with explicit `exitCode` — no bare `throw new Error(...)` without `.exitCode`. Add a comment documenting the rationale.
- Suggested test: Call each CLI subcommand with mocked `planManager` that throws `new Error('unexpected')` without `exitCode`. Assert exit code is 1 (not 0).
- Dedup key: cli-handleerror-blanket-fallback
- Sources: pragmatic:P2-003

### CF-004: Pre-implementation grep for exit 15 may miss template text references

- Severity: P2
- Category: integrity
- Status: valid
- File: target.md (Section "Breaking Changes")
- Lines: target.md:41
- Claim: The grep pattern `rg "exit.*15|GSDC_JSON_PARSE_ERROR|exitCode.*15|code.*15" templates/ bin/ tests/ docs/` catches source code references but may miss descriptive text in templates that says "exit code 15 means X" or "si ves error 15...".
- Evidence: `templates/commands/canva-mockup.md` may reference error handling by code number. If the template says "código 15" and the migration changes it to exit 24, the template text becomes wrong.
- Impact: Users get incorrect guidance post-migration if template text references exit 15 descriptively.
- Recommendation: Expand pre-implementation grep to include `rg "15" templates/` with manual review. Also grep for "exit 15", "código 15", "error 15" in template files.
- Suggested test: Post-implementation: `rg "exit.*15[^0-9]|code.*15[^0-9]|código.*15[^0-9]" templates/ docs/` returns 0 hits.
- Dedup key: exit-15-template-audit
- Sources: pragmatic:P2-004

### CF-005: `confirmDecisions()` lacks re-confirmation guard

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (Section 8 — confirmDecisions)
- Lines: target.md:566
- Claim: `confirmDecisions()` does not check `confirmed === true`. If called on `questions_pending + confirmed: true` (between confirm and resolve), it silently re-computes and overwrites the hash. While idempotent by accident if values unchanged, it violates the "confirmed = locked" principle that `answer()` enforces with exit 23.
- Evidence: `answer()` ordering includes "validar `confirmation.confirmed !== true` (exit 23)". `confirmDecisions()` ordering has no such check. If field values changed between calls, the hash updates silently to the new state.
- Impact: Calling `confirm-decisions` twice without resolve in between silently updates the hash. If values changed, the stored hash no longer matches what the user originally confirmed. Breaks the "confirmed = locked" mental model.
- Recommendation: Add check: if `confirmed === true` and hash already matches → return success (idempotent by design). If `confirmed === true` but values changed → exit 23 (decisions locked, use reset). Aligns with `answer()` behavior.
- Suggested test: Call `confirmDecisions()` twice without changing fields → success both times, same hash. Change a field, call `confirmDecisions()` again → exit 23.
- Dedup key: confirmDecisions-reconfirmation-guard
- Sources: operator:OP-002

### CF-006: `allQuestionsAddressed` name misrepresents semantics

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:144
- Claim: `allQuestionsAddressed` is `true` when all questions have been presented, not when all have substantive answers. The name implies value presence but the spec says it "Tracks question-presentation completion, not value presence."
- Evidence: target.md:144 explicitly says: "Puede ser `true` cuando `assets === ""` (declinado)." An implementer reading `if (allQuestionsAddressed)` will reasonably assume values exist for all fields. This is a naming invariant violation.
- Impact: Implementer may skip value-presence checks thinking the flag guarantees them. Template-level bugs where assets is assumed non-empty when flag is true.
- Recommendation: Either rename to `allQuestionsPresented` or `allQuestionsHandled`, or add an inline code comment: `// true = every question was asked; NOT that every field has a non-empty value`.
- Suggested test: Verify `allQuestionsAddressed === true` while `assets === ""` after decline, confirming documentation matches implementation.
- Dedup key: allQuestionsAddressed-naming-semantics
- Sources: modeler:MOD-001

### CF-007: Hash dispatch assumes binary version set — no forward compatibility

- Severity: P2
- Category: integrity
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:542-572
- Claim: `resolveQuestions()` and `submitMockup()` dispatch hash computation: v1 → 6 fields, "any other case" → 7 fields. Unknown future versions (e.g., `sha256-decisions-v3`) would silently compute a v2 hash, get a mismatch, and fail with misleading `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (exit 21).
- Evidence: The dispatch (target.md:572): "Si es `sha256-decisions-v1`, usan 6 campos. Cualquier otro caso (v2, vacío, undefined) → 7 campos." A v3 plan would compute wrong hash. Not a current risk (only v1/v2 exist) but the pattern is not forward-compatible.
- Impact: Future hash algorithm changes produce confusing error messages instead of clear version errors.
- Recommendation: Add explicit check: if `hashAlgorithm` starts with `"sha256-decisions-"` but is neither v1 nor v2, throw descriptive error. Fallback to 7 fields should only apply to empty/undefined.
- Suggested test: Fixture with `hashAlgorithm: "sha256-decisions-v99"` → `resolveQuestions()` throws descriptive version error, not hash mismatch.
- Dedup key: hash-version-forward-compatibility
- Sources: modeler:MOD-007

### CF-008: Error 13 (GSDC_INVALID_STATE) recovery is ambiguous

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md (Section 6 — Manejo de errores)
- Lines: target.md:479-491
- Claim: Exit 13 covers multiple distinct scenarios requiring different recovery actions, but the error table gives one-size-fits-all advice. An agent that gets exit 13 from `resetConfirmation()` on an approved plan would suggest reset again, get exit 13 again, and loop.
- Evidence: Exit 13 occurs in: (1) `answer()` when not `questions_pending` — check state, (2) `resetConfirmation()` when `approved`/non-mockup — suggest new plan, (3) `resetConfirmation()` unexpected state — suggest `plan status`. The table says "Sugerir reset-confirmation si aplica" but for approved plans, reset fails again with exit 13. No structured `reason` field like exit 26 has.
- Impact: Agent loops on invalid-state errors for approved plans because exit 13 alone doesn't carry enough context to choose the correct recovery action.
- Recommendation: Add a `reason` field to exit 13 errors (like exit 26's `numeric_value`/`not_in_options`/`placeholder_value`). Example reasons: `"invalid_phase"`, `"invalid_status_for_reset"`, `"invalid_status_for_answer"`. Update error table to branch on reason.
- Suggested test: `resetConfirmation(approved plan)` → exit 13 with reason indicating approved state. Agent recovery: suggest new plan, not reset.
- Dedup key: error-13-recovery-ambiguity
- Sources: agent-ux:UX-004

### CF-009: `answer()` field validation before state validation is deliberate but unusual

- Severity: P3
- Category: cli-contract
- Status: valid
- File: target.md (Section 3)
- Lines: target.md:285, 610
- Claim: `answer()` validates field membership (exit 22) before state (exit 13). A caller in wrong state with a typo gets "invalid field" instead of "wrong state". The spec explicitly defines this order and has a test for it.
- Evidence: target.md:285: "validar field ∈ ALL_FIELDS (exit 22) → validar estado mockup:questions_pending (exit 13)". target.md:610 confirms: "Campo inválido en estado incorrecto → exit 22". Deliberate design.
- Impact: Minor UX confusion — the error is technically correct but doesn't surface the more fundamental issue.
- Recommendation: Accept as documented design choice. Field validation is stateless and cheap; state validation requires file reads. Add note in error table: "Field validation precedes state validation in `answer()`."
- Suggested test: Already covered in test matrix (target.md:610).
- Dedup key: answer-field-before-state-validation
- Sources: pragmatic:P3-001, operator:OP-006

### CF-010: `getEmptyFields()` defensive test over-specifies internal implementation

- Severity: P3
- Category: testing
- Status: valid
- File: target.md (Section 11)
- Lines: target.md:622
- Claim: Test "optionalAnswered = { vertical: true } (bug simulado) → getEmptyFields still retorna vertical como pending" directly tests internal helper behavior, coupling tests to implementation details.
- Evidence: `getEmptyFields()` is an internal helper, not public API. If implementation changes internal structure, this test breaks even if public behavior is correct.
- Impact: Minor — test is valuable for catching the specific bug class but couples to internals.
- Recommendation: Keep the test but consider supplementing with public API test: `answer(vertical, "SaaS")` with manual `optionalAnswered` injection, then `questions()` should still show `vertical` in pending.
- Suggested test: Already specified in proposal.
- Dedup key: getemptyfields-overspecified-test
- Sources: pragmatic:P3-002

### CF-011: "confirmo que no" edge case accepted as confirmation

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6)
- Lines: target.md:500
- Claim: The regex accepts "confirmo que no quiero seguir" as confirmation. The negation regex only catches negation before the verb ("no confirmo"), not after ("confirmo que no").
- Evidence: "confirmo que no" matches positive regex, doesn't match negation regex (negation is after verb). Same trade-off class as "confirmo pero quiero cambiar" — already documented.
- Impact: Low — escape hatch exists (reset-confirmation). Already documented as accepted trade-off.
- Recommendation: Accept as documented trade-off. Add to verification list: `"confirmo que no" → accepted`.
- Suggested test: Add to verification list alongside existing trade-off examples.
- Dedup key: confirmo-edge-case-confirmo-que-no
- Sources: pragmatic:P3-003

### CF-012: `resolveQuestions()` "escribir archivos atómicamente" ambiguity

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js (Section 8 — resolveQuestions)
- Lines: target.md:568
- Claim: resolveQuestions() ordering says "escribir archivos atómicamente" (plural) but doesn't clarify whether it writes both `plan.json` AND `decisions.json`, or just `plan.json`. For crash recovery analysis, this matters.
- Evidence: Hash migration fixtures suggest resolveQuestions only reads hash and transitions status (plan.json only). If both files are written, crash recovery between writes needs documentation.
- Impact: Implementation ambiguity. If implementer writes both files, crash recovery depends on write order.
- Recommendation: Explicitly state which files resolveQuestions() writes. If only plan.json, say "escribir plan.json". If both, document write order and crash recovery.
- Suggested test: resolveQuestions() crash after plan.json write but before decisions.json write → re-run converges.
- Dedup key: resolveQuestions-file-write-ambiguity
- Sources: operator:OP-003

### CF-013: `ensureV2Fields()` mutates in-place — fragile for programmatic consumers

- Severity: P3
- Category: integrity
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:103-115
- Claim: `ensureV2Fields()` mutates the `decisions` object in-place. For read-only functions (`questions()`, `status()`), this is not persisted. But the in-place mutation could cause aliasing bugs if callers cache the pre-mutation object.
- Evidence: Function uses assignment operators (`decisions.optionalAnswered = decisions.optionalAnswered || {}`). Each function re-reads from disk, so no issue in CLI usage. Risk exists if module is used programmatically.
- Impact: Low in CLI context (single process per invocation). Higher if plan-manager is imported as a library.
- Recommendation: Add code comment: `// Mutates decisions in-place. Read-only callers must NOT persist. Mutating callers persist via atomic write.` Consider returning the mutated object for clarity.
- Suggested test: Call `questions()` twice on same v1.1 fixture — verify second call returns same results (no accumulated mutation on disk).
- Dedup key: ensureV2Fields-in-place-mutation
- Sources: modeler:MOD-004

### CF-014: REQUIRED_FIELDS/OPTIONAL_FIELDS disjoint invariant not asserted

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:96-98
- Claim: `getEmptyFields()` guards against false `optionalAnswered` on required fields via `OPTIONAL_FIELDS.includes(field)`. The inverse (required field in OPTIONAL_FIELDS) is not guarded. Currently impossible (disjoint by construction from same registry with mutually exclusive filters) but the invariant is not asserted.
- Evidence: Sets are derived from `FIELD_REGISTRY.filter(f => f.required)` and `FIELD_REGISTRY.filter(f => !f.required)` — always disjoint. But no assertion ensures this.
- Impact: Negligible with current architecture. Invariant maintained by construction.
- Recommendation: Add module-level assertion: `const OVERLAP = REQUIRED_FIELDS.filter(f => OPTIONAL_FIELDS.includes(f)); assert(OVERLAP.length === 0)`. Makes invariant explicit and fails fast.
- Suggested test: Add dummy field to FIELD_REGISTRY with `required: true`, verify `OPTIONAL_FIELDS` does not include it. Cleanup after.
- Dedup key: required-optional-disjoint-invariant
- Sources: modeler:MOD-005

### CF-015: `resetConfirmation()` history dedup only checks last entry — oversuppression risk

- Severity: P3
- Category: integrity
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:344
- Claim: History dedup checks only the last entry. Two distinct resets with same `from` state (but a confirm in between) would have the second incorrectly deduplicated.
- Evidence: Scenario: `questions_pending` → `ready_for_html` → reset (history: `[{from: ready_for_html}]`) → confirm → `ready_for_html` → reset again. Last entry has same `from: ready_for_html`, so second reset is suppressed. But the events are distinct.
- Impact: History loses audit fidelity. Not a state integrity issue but complicates forensics.
- Recommendation: Always append history entries (accept minor duplication). The proposal already notes "History puede acumular un entry extra en crash recovery — aceptable" — extend this acceptance to all dedup.
- Suggested test: Confirm → reset → confirm → reset → verify history has 2 reset-confirmation entries.
- Dedup key: reset-history-dedup-oversuppression
- Sources: modeler:MOD-006

### CF-016: `optionalAnswered` is monotonic — invariant undocumented

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed)
- Lines: target.md:287
- Claim: `answer()` sets `optionalAnswered[field] = true` but never unsets. The flag is monotonically increasing within a session, only cleared by `resetConfirmation()`. This is correct behavior but the invariant is not documented.
- Evidence: Answering optional field with empty string still sets flag. Answering again doesn't change it. Reset clears everything. Monotonicity is correct for "was this question presented."
- Impact: No practical impact — the flag correctly represents "was this question asked."
- Recommendation: Document the invariant: `// optionalAnswered is monotonic — once set, only resetConfirmation() clears it.` No code change needed.
- Suggested test: Answer assets with value, then answer assets with empty → verify `optionalAnswered.assets === true` both times.
- Dedup key: optionalAnswered-monotonic-invariant
- Sources: modeler:MOD-008

### CF-017: Confirm→resolve failure message misleads about optional preservation

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6 — Revisión Final y Confirmación, step 6)
- Lines: target.md:502-504
- Claim: When confirm succeeds but resolve fails, the template says "Tus decisiones se preservaron" but after `resetConfirmation()`, optional fields (assets) are wiped. The correction section (line 508) has the accurate phrasing but it's not used in the resolve-failure path.
- Evidence: resetConfirmation step 5 clears `optionalAnswered = {}` and sets optional values to `""`. User's assets answer is lost. Message says "decisiones se preservaron" without qualification.
- Impact: User sees "decisiones preserved" but summary shows assets empty. Minor confusion.
- Recommendation: Change resolve-failure message to: "Tus decisiones requeridas se preservaron. Campos opcionales se reiniciaron. Necesitas confirmar de nuevo."
- Suggested test: Verify template text matches the more accurate phrasing.
- Dedup key: resolve-failure-message-optional-wipe
- Sources: agent-ux:UX-005

### CF-018: `readOnly` and `editable` fields are redundant

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 2 — questions() response)
- Lines: target.md:159-160, 465
- Claim: `questions()` returns both `readOnly: true` and `editable: false` (always semantically inverse). Template checks both with `||`, suggesting they could diverge. If an implementation bug causes divergence, agents get inconsistent behavior.
- Evidence: Every state produces `readOnly === !editable`. Never diverge by design. But template using `||` and two fields doubles the surface area for bugs.
- Recommendation: Keep only `editable` (actionable) and remove `readOnly` (passive). Or add explicit note: "readOnly is always !editable — they are inverse." Template should check only one field.
- Suggested test: For every `questions()` test case, assert `readOnly === !editable`.
- Dedup key: readonly-editable-redundancy
- Sources: agent-ux:UX-006

## Disputed P1s Resolution

### P1-002: confirmDecisions should validate optional fields — **DOWNGRADED to P2 (CF-002)**

All four reviewers agree the original P1 does not stand. The separation-of-layers argument is valid: optional gating is a UX policy enforced by the template, not a data invariant. The API correctly guards required fields (exit 19), and `allQuestionsAddressed` is advisory by design.

However, three reviewers (modeler, agent-ux, operator) recommend adopting the author's counter-proposal: add `warning: "optional_fields_not_addressed"` to `confirmDecisions()` response. This maintains API flexibility while providing a signal at the confirmation boundary. See CF-002.

**Resolution: P1 → P2 (warning, not blocking). Author's defense accepted with enhancement.**

### P1-005: "claro que no, confirmo" acceptance — **DOWNGRADED to non-issue**

All four reviewers agree the author's defense is linguistically correct. "Claro que no, confirmo" is an affirmation in Spanish — the "no" negates an implied prior clause, not the confirmation. The negation regex correctly handles direct negation ("no confirmo", "no lo confirmo") and correctly does not match comma-separated patterns.

Edge cases like "confirmo que no" and "jamás confirmo" remain as accepted false positives, consistent with the documented trade-off (word detection, not NLP). The escape hatch (reset-confirmation) mitigates any false positive. Reviewers recommend adding an explicit note in the proposal: "Parsing detects presence of 'confirmo/confirmado' word, not context semantics. To undo a confirmation, use reset-confirmation."

**Resolution: P1 → non-issue. Author's defense accepted. Add clarifying note.**

## Non-Issues Checked

- **Error code collisions**: New codes 22-27 do not collide with existing 10, 13-15, 19-21. Clean.
- **`ensureV2Fields()` ordering**: Correctly specified as first step after file read, before state validation and `confirmation.*` access. `??` preserves existing values.
- **Hash v1→v2 migration atomicity**: `confirmDecisions()` always writes v2 hash + label together. No window where hash and label disagree.
- **`questions()` never throws INVALID_STATE**: All states return `readOnly: true`. Defensive design.
- **Lock ordering**: All functions acquire before read, release in `finally`. Consistent.
- **`create()` initialization**: New fields correctly specified with v2 `hashAlgorithm`.
- **`FIELD_REGISTRY` as single source of truth**: Replaces hardcoded arrays. Good.
- **Test 2 update (`'TODO: definir'` → `'TODO'`)**: Acknowledged. Consistent with `===` breaking change.
- **`GSDC_ARTIFACT_MISSING` → `GSDC_MOCKUP_MISSING` rename**: Breaking change with pre-implementation grep. Verified.
- **`findPlanDir()` exit 15 → 24 migration**: Breaking change documented with grep audit.
- **State notation (`phase:status`)**: Implementation uses separate fields, not compound string. Correct.
- **`resetConfirmation()` crash recovery**: plan.json first, re-execution converges. Correct.
- **Template `ask_question` integration**: Choice fields get options, text fields get empty options. Antigravity provides free text. No manual "Otro". Well-specified.
- **Stale mockup protection depth**: Triple defense (rename, flag, mtime). Mtime is robust primary guard.
- **Placeholder detection migration**: `includes()` → `===` is documented breaking change with grep audit.
- **`answer()` choice validation**: Numeric rejection, placeholder rejection, canonical normalization, allowCustom — all specified with clear exit codes.
- **Negation regex coverage**: Correctly matches "no confirmo"/"no lo confirmo" and correctly rejects "claro que no, confirmo" (comma boundary).
- **Multi-field semantic mapping rules**: Conservative "don't save if uncertain" with keyword table. Well-defined.
- **Idempotent resetConfirmation**: No-op path, re-runnable after partial failure, history dedup. Well-specified.
- **No double-wrap in CLI**: Verification step 16 covers this.

## Residual Risks

- **Stale mockup rename I/O failure**: Even with CF-001 fix, rename is inherently unreliable (if rename fails once, may fail again). Document that manual cleanup of `.html` files is acceptable and mtime guard is the primary safety net.
- **`ensureV2Fields()` in-memory mutation**: Safe in CLI context but could surprise programmatic consumers. Code comment recommended (CF-013).
- **Lock file cleanup on SIGKILL**: `finally` may not execute, leaving stale lock. Standard CLI tool risk, acceptable for this use case.
- **Template error table completeness**: Catch-all "Cualquier otro código" will need updating if new codes are added. Not a current issue.
- **Agent multi-field mapping variance**: Different LLMs may interpret ambiguous input differently despite keyword table. Conservative rules limit damage.
- **"jamás confirmo" / "nunca confirmo" false positive**: Extremely unlikely in confirmation flow. Mitigated by reset-confirmation escape hatch.
- **Hash version forward compatibility**: Current dispatch silently mishandles unknown versions. Should harden before implementation (CF-007).
