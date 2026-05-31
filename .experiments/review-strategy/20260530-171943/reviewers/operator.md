# Review: operator

## Summary

- Verdict: approve_with_changes
- Top risk: `resetConfirmation()` step 6 requires a second write to `decisions.json` if mockup rename fails, breaking the clean step ordering model (mitigated by mtime fallback in `submitMockup()`).
- Confidence: high

## Findings

### OP-001: staleMockupExists persistence creates double-write inside resetConfirmation()

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (Section 4 — resetConfirmation)
- Lines: target.md:339-349
- Claim: The spec requires persisting `staleMockupExists: true` to `decisions.json` when mockup rename fails, but `decisions.json` is already fully written in step 5 (confirmation cleared, optional fields reset). Step 6 (rename) happens after step 5, so persisting the flag requires a second write to `decisions.json` within the same operation.
- Evidence: The ordering spec says step 5 writes decisions.json, then step 6 renames mockup. If rename fails, `staleMockupExists: true` must be "persisted in decisions.json" (target.md:349). This means decisions.json is written twice: once in step 5 and again in step 6 on failure. The spec's step model (4→5→6, each writing once) is violated.
- Impact: Not a correctness issue — the lock is still held, and the mtime fallback in `submitMockup()` provides redundant protection. After reset, any re-confirmation sets `confirmedAt = now`, which is strictly newer than the stale mockup's mtime, so `submitMockup()` would reject regardless. However, the double-write complicates implementation and could confuse future maintainers who expect single-write-per-file-per-operation semantics.
- Recommendation: Clarify the spec with one of: (a) move mockup existence check before step 5, set `staleMockupExists` preemptively in the same decisions.json write, then attempt rename; or (b) explicitly document that step 6 may re-write decisions.json and that this is intentional. Option (a) is cleaner because the flag is set optimistically — if rename then succeeds, the flag is harmless (mockup is gone).
- Suggested test: After resetConfirmation with failed rename, verify `decisions.json` on disk contains `staleMockupExists: true`. Then confirm + resolve + submitMockup → exit 27 even if mtime check would pass (e.g., mockup mtime artificially set to future).
- Dedup key: resetConfirmation-staleMockupExists-double-write

### OP-002: confirmDecisions() does not guard against re-confirmation

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (Section 8 — confirmDecisions)
- Lines: target.md:566
- Claim: The `confirmDecisions()` operation ordering does not include a check for `confirmed === true`. If called on a plan already in `questions_pending + confirmed: true` (between confirm and resolve), it silently re-computes and overwrites the hash with the same value. While idempotent by accident, this is inconsistent with `answer()` which explicitly rejects with exit 23 in the same scenario.
- Evidence: `answer()` ordering (target.md:285) includes "validar `confirmation.confirmed !== true` (exit 23)". `confirmDecisions()` ordering (target.md:566) goes: "validar estado → ensureV2Fields() → getEmptyFields → compute hash → write" with no confirmed check. The state `questions_pending + confirmed: true` is a valid intermediate state that `confirmDecisions()` can be called on.
- Impact: If a user (or agent) calls `confirm-decisions` twice without `resolve-questions` in between, the second call succeeds silently. If any field changed between calls, the hash updates to reflect the new state, which could be confusing. Not a data integrity risk (hash still matches decisions), but breaks the principle that `confirmed: true` should be a lock.
- Recommendation: Add a check: if `confirmed === true` and hash already matches → return success (idempotent by design, not accident). If `confirmed === true` but values changed → exit 23 (decisions locked, use reset). This aligns with `answer()` behavior and makes the state machine more predictable.
- Suggested test: Call `confirmDecisions()` twice without changing fields → success both times, same hash. Change a field, call `confirmDecisions()` again → exit 23.
- Dedup key: confirmDecisions-reconfirmation-guard

### OP-003: resolveQuestions() "escribir archivos" ambiguity

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js (Section 8 — resolveQuestions)
- Lines: target.md:568
- Claim: The resolveQuestions() ordering says "escribir archivos atómicamente" (plural), but the spec doesn't clarify whether it writes both `plan.json` AND `decisions.json`, or just `plan.json`. For crash recovery analysis, this distinction matters.
- Evidence: target.md:568 says "escribir archivos atómicamente" (plural). But the hash migration fixtures (target.md:557-564) suggest resolveQuestions only reads the hash and transitions status, which would only write plan.json. If decisions.json is also written (e.g., for hash migration during re-confirm flow), the crash recovery between the two writes needs documentation.
- Impact: Implementation ambiguity. If the implementer writes both files, crash recovery depends on write order (plan.json first, like resetConfirmation). If only plan.json is written, "archivos" should be singular or clarified.
- Recommendation: Explicitly state which files resolveQuestions() writes. If only plan.json (status transition), say "escribir plan.json". If both, document the write order and crash recovery path (same as resetConfirmation: plan.json first).
- Suggested test: resolveQuestions() crash after plan.json write but before decisions.json write (if applicable) → re-run converges.
- Dedup key: resolveQuestions-file-write-ambiguity

### OP-004: P1-002 disputed — confirmDecisions optional validation (DEFENSE ACCEPTED)

- Severity: P3
- Category: cli-contract
- Status: uncertain
- File: lib/plan-manager.js (Section 8)
- Lines: target.md:566, counter-arguments.md:8-23
- Claim: The original P1-002 argued that `confirmDecisions()` should reject if optional fields are not addressed. The author's defense is valid: optional addressing is a UX policy enforced by the template, not an API invariant. The separation of layers is correct — the API should not couple to a specific UI flow.
- Evidence: (1) `allQuestionsAddressed` exists as an advisory field for templates. Making it an API guard makes it redundant. (2) Automated scripts that fill required fields and confirm are a legitimate use case. (3) `answer()` accepts empty required values with warning (same advisory philosophy). (4) The template explicitly gates on `optionalPendingCount > 0` before confirmation. The author's counter-proposal to add `warning: "optional_fields_not_addressed"` is a good improvement that maintains the advisory pattern.
- Impact: Without the warning, a misbehaving agent could skip the assets question and confirm. But this is an agent compliance issue, not an API design flaw. The `optionalAnsweredStatus` in `questions()` response correctly shows `false` for unaddressed optionals, providing observability.
- Recommendation: Accept author's defense. Implement the counter-proposal: add `warning: "optional_fields_not_addressed"` in `confirmDecisions()` response when any optional field has `optionalAnswered[field] !== true`. This maintains API flexibility while giving the template a signal.
- Suggested test: Fill 6/6 required, skip assets, call confirmDecisions() → success with `warning: "optional_fields_not_addressed"`. Fill all + decline assets, call confirmDecisions() → success, no warning.
- Dedup key: P1-002-confirmDecisions-optional-validation

### OP-005: P1-005 disputed — "claro que no, confirmo" acceptance (DEFENSE ACCEPTED)

- Severity: P3
- Category: ux
- Status: uncertain
- File: templates/commands/canva-mockup.md (Section 6)
- Lines: target.md:500, counter-arguments.md:29-46
- Claim: The original P1-005 argued that "claro que no, confirmo" should be rejected. The author's defense is valid: in Spanish, this phrase is an affirmation where "no" negates an implied prior clause, not the confirmation itself. The comma between "no" and "confirmo" prevents the negation regex `/\bno\s+(lo\s+)?(confirmo|confirmado)\b/i` from matching (comma is not `\s`).
- Evidence: (1) "Claro que no, confirmo" = "Of course [I'm not refusing], I confirm" — correct Spanish pragmatics. (2) The negation regex is anchored: `\bno\s+` requires whitespace immediately after "no", but "no, confirmo" has a comma. The regex correctly does NOT match. (3) The escape hatch (`reset-confirmation`) exists for mistaken confirmations. (4) The trade-off is documented: parsing detects the confirmation word, not sentiment. This is the same principle as `git commit` accepting any message.
- Impact: False negatives (rejecting valid confirmations) would be more confusing to Spanish-speaking users than false positives (accepting ambiguous phrases). The reset escape hatch handles the false positive case.
- Recommendation: Accept author's defense. Add the proposed explicit note: "Parsing detects presence of 'confirmo/confirmado' word, not context semantics. To undo a confirmation, use reset-confirmation." This manages expectations without over-engineering.
- Suggested test: Already covered in test matrix (target.md:653): `"claro que no, confirmo"` → confirmed. `"no confirmo"` → rejected. `"no lo confirmo"` → rejected.
- Dedup key: P1-005-claro-que-no-confirmo

### OP-006: answer() field validation order — field check before state check

- Severity: P3
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js (Section 3)
- Lines: target.md:285, target.md:610
- Claim: `answer()` validates field membership (exit 22) before state (exit 13). This means calling `answer(planInReadyForHtml, 'nonexistent', 'value')` returns exit 22 instead of exit 13. While the spec explicitly defines this order and has a test, it can confuse callers who see "invalid field" when the real issue is wrong state.
- Evidence: target.md:285: "validar field ∈ ALL_FIELDS (exit 22) → validar estado mockup:questions_pending (exit 13)". target.md:610: "Campo inválido en estado incorrecto → exit 22 (field validation primero, antes de state check)".
- Impact: Minor UX confusion. A caller in wrong state with a typo in field name gets "invalid field" instead of "wrong state". The error is technically correct (field IS invalid) but doesn't surface the more fundamental issue (wrong state). This is a deliberate design choice documented in tests.
- Recommendation: Accept as-is. The order is consistent (always catch field errors first, regardless of state) and makes the API predictable. Document the rationale: "field validation is stateless and cheap; state validation requires file reads."
- Suggested test: Already in test matrix (target.md:610).
- Dedup key: answer-field-validation-order

## Non-Issues Checked

- **Two-file crash recovery in resetConfirmation()**: plan.json written first (step 4), decisions.json second (step 5). If crash between, re-running resetConfirmation() converges because it sees `questions_pending + confirmed: true` and proceeds to clear decisions.json. History dedup prevents duplicate entries. Well-designed.

- **ensureV2Fields() in-memory-only for read-only functions**: questions() and status() run ensureV2Fields() in memory without persisting. First mutation (answer/reset/confirm) persists the migration. This is correct — read-only functions should not have side effects.

- **Lock semantics**: All functions acquire lock before reading, release in finally. Single-process CLI tool means no deadlock risk. No lock timeout needed for short-lived operations.

- **Hash migration v1→v2**: confirmDecisions() always computes v2 (7 fields). resolveQuestions()/submitMockup() dispatch on stored label, fallback to v2 for empty/undefined. Unknown labels fall to v2 and fail closed (hash mismatch). Correct and safe.

- **Stale mockup protection depth**: Triple defense — (1) rename to .stale during reset, (2) staleMockupExists flag, (3) mtime check in submitMockup(). After reset + re-confirmation, confirmedAt is set to now, which is newer than stale mockup mtime. The mtime check provides robust protection even if flag persistence fails.

- **questions() never throws GSDC_INVALID_STATE**: All states return read-only with real counter values. Even unrecognized states get a valid response. Good defensive design.

- **Idempotency of resetConfirmation()**: No-op when questions_pending + !confirmed + !mockup. Re-runnable after partial failure. History dedup on re-execution. Well-specified.

- **optionalAnswered defensive guard**: getEmptyFields() only skips optional fields with the flag; required fields with erroneously set flag are still caught (test target.md:622). This prevents a bug in optionalAnswered from hiding empty required fields.

- **Non-mockup phases**: questions() returns read-only for draft/refine/deliver phases. No crash on wrong phase. Correct.

- **Placeholder detection breaking change**: `===` exact match (vs `includes()`) is documented as a breaking change. `'TODO: definir colores'` is no longer a placeholder. The pre-implementation grep audit and test updates account for this.

## Residual Risks

- **staleMockupExists double-write implementation**: While safe (mtime fallback works), the implementer must decide HOW to handle the second write — either preemptive flag setting or explicit second write within lock. Spec should clarify intent (see OP-001).

- **confirmDecisions() silent re-confirmation**: Without an explicit guard, calling confirmDecisions() on already-confirmed plans produces no error. If field values changed between calls, the hash updates silently. Low risk but violates the "confirmed = locked" mental model (see OP-002).

- **Lock file cleanup on process kill (SIGKILL)**: If the process is killed with SIGKILL (not SIGINT/SIGTERM), the finally block may not execute, leaving a stale lock file. This is a standard risk for file-based locks in CLI tools and acceptable for this use case, but worth noting for documentation.
