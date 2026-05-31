# Review: pragmatic

## Summary

- Verdict: approve_with_changes
- Top risk: `resetConfirmation()` write ordering creates a dead code path for `staleMockupExists` flag persistence, and the same flag as a blocking guard in `submitMockup()` would trap users who regenerated their mockup after a rename failure.
- Confidence: high

## Findings

### P2-001: `resetConfirmation()` step 5→6 ordering makes `staleMockupExists` unpersistable

- Severity: P2
- Category: state
- Status: valid
- File: target.md (Section 4, `resetConfirmation()`)
- Lines: 340-351
- Claim: Step 5 writes `decisions.json` (clean). Step 6 attempts `mockup.html` rename. If rename fails, `staleMockupExists: true` should be persisted in `decisions.json`.
- Evidence: Steps are ordered 4→5→6. Step 5 writes `decisions.json` with `confirmed=false, hashAlgorithm="", optionalAnswered={}`. Step 6 then tries the rename. If rename fails, the flag needs to go into `decisions.json`, which was already written. The proposal says "resetConfirmation() persiste staleMockupExists: true en decisions.json cuando rename falla" but this contradicts the explicit step ordering — step 5 has already closed `decisions.json`.
- Impact: Implementer must either (a) reorder to try rename before decisions.json write, or (b) add a second write to decisions.json after step 6 on failure. The proposal does not specify which. A naive implementation following steps literally would never persist the flag.
- Recommendation: Reorder to: 4 (plan.json) → 6 (try rename, record outcome) → 5 (decisions.json, including `staleMockupExists` if rename failed). This preserves the crash-recovery invariant (plan.json written first) while making the flag persistable in a single decisions.json write.
- Suggested test: Create plan with mockup.html, confirm, call `resetConfirmation()`. Mock `fs.renameSync` to throw EACCES. Assert `decisions.json` on disk contains `staleMockupExists: true`. Then call `submitMockup()` with fresh mockup.html — see P2-002 for expected behavior.
- Dedup key: reset-confirmation-stale-flag-ordering

### P2-002: `staleMockupExists` as blocking guard traps valid resubmissions

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md (Section 4)
- Lines: 349
- Claim: "submitMockup() también rechaza si esta flag está presente."
- Evidence: If rename fails and flag is persisted, the user regenerates mockup.html (new mtime, fresh content) and tries to submit. The mtime check in `submitMockup()` would pass (new mtime > confirmedAt). But `staleMockupExists: true` would block submission regardless. There is no documented mechanism to clear this flag — not in `confirmDecisions()`, not in `resetConfirmation()` on re-execution, not when a new mockup is detected. The user is permanently stuck until manual `decisions.json` surgery.
- Impact: A transient I/O error during rename creates an unrecoverable state without manual intervention. This contradicts the proposal's design philosophy of idempotent recovery.
- Recommendation: Make `staleMockupExists` advisory (warning in response, not blocking error) and rely solely on the mtime check as the blocking guard. The mtime check is semantically correct — it detects whether the mockup was generated after the latest confirmation. Alternatively, clear the flag in `confirmDecisions()` (since re-confirmation implies a fresh cycle) or when `submitMockup()` detects `mockup.html` mtime > `confirmedAt`.
- Suggested test: Plan with `staleMockupExists: true` + fresh mockup.html (mtime > confirmedAt). Call `submitMockup()`. Assert: success (mtime guard passes, flag ignored or auto-cleared).
- Dedup key: stale-mockup-flag-blocking-trap

### P2-003: CLI handleError blanket `|| 1` silently changes exit code semantics

- Severity: P2
- Category: cli-contract
- Status: valid
- File: bin/gsd-canva.js
- Lines: 228, 247, 263, 279, 295, 311, 327, 343, 359, 376, 415, 450, 489
- Claim: The proposal mandates all `err.exitCode || <code>` → `err.exitCode || 1` as a blanket rule.
- Evidence: Current code has meaningful fallback codes: `create` uses `|| 10`, `confirm-decisions` uses `|| 19`, `submit-mockup` uses `|| 20`, `approve-mockup` uses `|| 13`, `deliver` uses `|| 14`. These fallbacks fire when `planManager` throws an error without setting `exitCode`. If a future bug in `planManager` produces an unexpected error (e.g., TypeError from null access), the current fallbacks give meaningful diagnostics. With `|| 1`, all unexpected errors collapse to exit 1, making it harder to distinguish "unexpected crash" from "expected failure with exit 1".
- Impact: Low probability but real: any `planManager` regression that throws without `exitCode` loses diagnostic information. Scripts that parse exit codes would see a different code.
- Recommendation: Keep the blanket rule but add a **single comment** in `bin/gsd-canva.js` documenting the rationale: "Fallback exit 1 for unexpected errors. All planManager errors set explicit exitCode." Also ensure every `planManager` function (including new `questions()`, `answer()`, `resetConfirmation()`) always throws with explicit `exitCode` — no bare `throw new Error(...)` without `.exitCode`.
- Suggested test: Call each CLI subcommand with a mocked `planManager` function that throws `new Error('unexpected')` without `exitCode`. Assert exit code is 1 (not 0).
- Dedup key: cli-handleerror-blanket-fallback

### P2-004: Pre-implementation grep for exit 15 migration may miss template references

- Severity: P2
- Category: integrity
- Status: valid
- File: target.md (Section "Breaking Changes")
- Lines: 41
- Claim: `rg "exit.*15|GSDC_JSON_PARSE_ERROR|exitCode.*15|code.*15" templates/ bin/ tests/ docs/` will catch all exit 15 references.
- Evidence: The current codebase uses `GSDC_JSON_PARSE_ERROR` with exit 15 in `findPlanDir()` (line 29), `create()` (line 51), `confirmDecisions()` (line 169), `resolveQuestions()` (line 253), `submitMockup()` (line 353), `transitionState()` (line 433), `deliver()` (line 547), `status()` (line 665, 679). The grep pattern is correct for source files. However, `templates/commands/canva-mockup.md` may reference error handling by code number. If the template says "exit code 15 means X" and the migration changes it to exit 24, the template text must also be updated. The proposal doesn't explicitly list template text audit for exit code references.
- Impact: If template text references exit 15 descriptively (e.g., "si ves error 15..."), users get wrong guidance post-migration.
- Recommendation: Expand pre-implementation grep to include `rg "15" templates/` with manual review. Also grep for "exit 15", "código 15", "error 15" in template files.
- Suggested test: Post-implementation: `rg "exit.*15[^0-9]|code.*15[^0-9]|código.*15[^0-9]" templates/ docs/` returns 0 hits.
- Dedup key: exit-15-template-audit

### P3-001: `answer()` field validation before state validation is unusual but documented

- Severity: P3
- Category: cli-contract
- Status: valid
- File: target.md (Section 3)
- Lines: 285
- Claim: Field validation (exit 22) runs before state validation (exit 13), so `answer(planInReadyForHtml, 'nonexistent', 'value')` returns exit 22, not exit 13.
- Evidence: The proposal explicitly specifies this ordering in the operation list and the test matrix (line 610) confirms it. This is a deliberate design choice.
- Impact: Low — callers get INVALID_FIELD instead of INVALID_STATE. Both are errors. But it means field errors are reported even when the operation would be impossible anyway. This can confuse debugging ("why is it complaining about the field when the real problem is the state?").
- Recommendation: Accept as documented design choice. Add a one-line note in the error table: "Field validation precedes state validation in `answer()`."
- Suggested test: Already covered in proposal (line 610).
- Dedup key: answer-field-before-state-validation

### P3-002: `getEmptyFields()` defensive guard test may over-specify implementation

- Severity: P3
- Category: testing
- Status: valid
- File: target.md (Section 11)
- Lines: 622
- Claim: Test "optionalAnswered = { vertical: true } (bug simulado) → getEmptyFields still retorna vertical como pending" tests internal function behavior.
- Evidence: The test directly calls `getEmptyFields()` with a poisoned `optionalAnswered` map. This is a good defensive test, but `getEmptyFields()` is an internal helper, not a public API. If the implementation changes to use a different internal structure, this test breaks even though the public behavior is correct.
- Impact: Minor. Test is valuable for catching the specific bug class but couples to implementation details.
- Recommendation: Keep the test but consider testing through the public API: `answer(vertical, "SaaS")` followed by manual `optionalAnswered = { vertical: true }` injection, then `questions()` should still show `vertical` in pending. Or test via reset which clears the flag.
- Suggested test: Already specified in proposal.
- Dedup key: getemptyfields-overspecified-test

### P3-003: "confirmo" parsing edge case — "confirmo que no" accepted

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6)
- Lines: 500
- Claim: The regex `/\b(confirmo|confirmado)\b/i` would accept "confirmo que no quiero seguir" as a confirmation.
- Evidence: "confirmo que no" matches the positive regex and does not match the negation regex `/\bno\s+(lo\s+)?(confirmo|confirmado)\b/i` because "no" appears after "confirmo". The negation check only catches "no confirmo" / "no lo confirmo" — negation before the verb.
- Impact: Low — the escape hatch exists (reset-confirmation). The proposal already documents this trade-off for "confirmo pero quiero cambiar". Same class of edge case.
- Recommendation: Accept as documented trade-off. The proposal already states: "Parsing detects presence of 'confirmo/confirmado' word, not context semantics." No change needed.
- Suggested test: Add to verification list: `"confirmo que no" → accepted`. Document in notes alongside existing trade-off examples.
- Dedup key: confirmo-edge-case-confirmo-que-no

## Disputed P1 Evaluations

### P1-002 (confirmDecisions optional validation): **Author's argument is valid — downgrade to non-issue**

The separation-of-layers argument is sound. `confirmDecisions()` hashes all 7 fields (v2) including `assets`. If `assets` is "" (unanswered), the hash is computed on "" — which is a valid state. After confirmation, `answer()` is blocked (exit 23). The only way to change `assets` is `reset-confirmation`, which clears everything. The system is self-consistent.

The template enforces the UX flow (ask about assets before confirming). If a caller bypasses the template and confirms without answering optionals, they get a valid hash on current state — which is correct API behavior. The counter-proposal of adding `warning: "optional_fields_not_addressed"` is a good P3 enhancement but not a blocking issue.

The `allQuestionsAddressed` field in the response is advisory — it lets the template gate without coupling the API to a specific UX policy. This is the correct design.

**Verdict: P1-002 does not stand. Design is sound.**

### P1-005 ("claro que no, confirmo" acceptance): **Author's argument is valid — downgrade to non-issue**

The author is correct about Spanish semantics. "Claro que no, confirmo" is pragmatically an affirmation in Spanish discourse. The "no" negates an implied prior question/statement, not the confirmation itself. Examples provided are linguistically accurate.

The negation regex `/\bno\s+(lo\s+)?(confirmo|confirmado)\b/i` correctly catches direct negation of the verb ("no confirmo"). It intentionally does not try to parse clause structure. This is the right scope for a CLI tool.

The trade-off is explicitly documented: word-level detection, not NLP. `reset-confirmation` is the escape hatch. This is consistent with the philosophy stated for other edge cases ("confirmo pero quiero cambiar").

**Verdict: P1-005 does not stand. Trade-off is acceptable and documented.**

## Non-Issues Checked

- **Error code collisions**: New codes 22-27 do not collide with existing 10, 13-15, 19-21. Clean.
- **`ensureV2Fields()` ordering**: Correctly specified as first step after file read, before state validation and `confirmation.*` access. `??` operator preserves existing values.
- **Hash v1→v2 migration**: `confirmDecisions()` always computes v2 (7 fields). `resolveQuestions()`/`submitMockup()` dispatch on stored `hashAlgorithm`. Consistent.
- **`questions()` never throws INVALID_STATE**: Correctly returns `readOnly: true` for all states. Good defensive design.
- **Lock ordering**: All functions acquire before read, release in `finally`. Consistent with existing pattern.
- **`create()` initialization**: New fields (`assets`, `optionalAnswered`, v2 `hashAlgorithm`) specified correctly.
- **`answer()` choice validation**: Numeric rejection, placeholder rejection, canonical normalization, allowCustom handling — all specified with clear exit codes and reasons.
- **`FIELD_REGISTRY` as single source of truth**: Replaces all hardcoded field arrays. `REQUIRED_FIELDS`, `ALL_FIELDS`, `OPTIONAL_FIELDS` derived from registry. Good.
- **Test 2 update (`'TODO: definir'` → `'TODO'`)**: Acknowledged in proposal. Consistent with `===` placeholder detection breaking change.
- **`GSDC_ARTIFACT_MISSING` → `GSDC_MOCKUP_MISSING` rename**: Breaking change with pre-implementation grep. Verification step 25 confirms 0 hits post-impl.
- **`findPlanDir()` exit 15 → 24 migration**: Breaking change documented with pre-implementation grep. Affects all callers.
- **State notation (`phase:status`)**: Clarification that implementation uses `plan.phase === 'mockup' && plan.status === 'questions_pending'`, not `plan.status === 'mockup:questions_pending'`. Correct — matches existing code pattern.
- **`resetConfirmation()` idempotent crash recovery**: plan.json written before decisions.json. Re-execution converges. Correct.
- **No double-wrap in CLI**: Verification step 16 covers this.
- **Template `ask_question` integration**: Choice fields get options array, text fields get empty options. Antigravity provides free text automatically. No manual "Otro" option. Well-specified.

## Residual Risks

- **Stale mockup rename I/O failure**: Even with P2-001/P2-002 fixes, the rename failure path is inherently unreliable (if rename fails once, it may fail again on retry). Consider documenting that manual cleanup of stale `.html` files is acceptable and that the mtime guard is the primary safety net.
- **Template error table completeness**: The error table in Section 6 lists all new codes but references "Cualquier otro código" as catch-all. If new error codes are added in future, the template text needs updating. Not a current issue but worth noting.
- **Multi-field semantic mapping**: The template's keyword-based mapping table (Section 6) is heuristic. Ambiguous inputs like "banner para mi negocio" will trigger "no guardar" correctly, but the mapping quality depends on agent interpretation. This is a template-level concern, not a CLI concern — acceptable.
- **`ensureV2Fields()` not persisted by `questions()`**: Read-only functions modify in-memory only. First mutation (`answer()`, `resetConfirmation()`, `confirmDecisions()`) persists. If the process crashes after `questions()` but before any mutation, v1 data remains on disk. On restart, `ensureV2Fields()` runs again — no data loss. Correct but worth documenting for implementers.
