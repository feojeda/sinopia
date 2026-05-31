# Review: operator

## Summary

- Verdict: approve_with_changes
- Top risk: `resetConfirmation()` error specification gap could lead an implementer to omit rejection of non-mockup phases, producing an incorrect exit code or unhandled state for draft/refine/deliver plans.
- Confidence: high

## Findings

### OP-01: `resetConfirmation()` error section does not list non-mockup phase rejection

- Severity: P2
- Category: docs
- Status: valid
- File: `target.md`
- Lines: 317-319
- Claim: The error section for `resetConfirmation()` lists only two error conditions: `GSDC_PLAN_NOT_FOUND` (exit 24) for non-existent plans, and `GSDC_INVALID_STATE` (exit 13) for "Estado approved o posterior."
- Evidence: Line 244 explicitly states "Non-mockup phases (draft, refine, deliver) → `resetConfirmation()` retorna `GSDC_INVALID_STATE` (exit 13)." However, lines 317-319 (the canonical error table for the function) omit this case. The phrase "approved o posterior" reads as "approved and later mockup states," not covering draft/refine/deliver phases, which are different phases entirely, not "posterior" to approved.
- Impact: An implementer reading only the error section (lines 317-319) would not add a guard for non-mockup phase rejection. Calling `resetConfirmation()` on a `draft:questions_pending` plan could produce an unexpected exit code or fall through to unintended logic.
- Recommendation: Add a third row to the `resetConfirmation()` error table: "Non-mockup phase (draft, refine, deliver) → `GSDC_INVALID_STATE` (exit 13)." Alternatively, rephrase "Estado approved o posterior" to "Cualquier estado no aceptado (approved, non-mockup phases, etc.) → exit 13."
- Suggested test: Call `resetConfirmation()` on a plan with `phase: "draft"` and `status: "questions_pending"`. Assert exit 13.
- Dedup key: `reset-confirmation-error-table-non-mockup`

### OP-02: `ensureV2Fields()` uses `||` on `confirmation` object, does not merge missing sub-fields

- Severity: P3
- Category: state
- Status: valid
- File: `target.md`
- Lines: 98
- Claim: `ensureV2Fields()` sets `decisions.confirmation = decisions.confirmation || { confirmed, confirmedAt, confirmedBy, source, decisionsHash, hashAlgorithm }`. For v1.1 plans where `confirmation` already exists (with `confirmed`, `confirmedAt`, `decisionsHash`, `hashAlgorithm`), the `||` short-circuits and does not add `confirmedBy` or `source`.
- Evidence: The v1.1 `confirmation` structure (repo-context.md lines 70-76) has 4 fields. The v2 skeleton (target.md line 98) has 6 fields. The `||` operator replaces only when the entire `confirmation` object is falsy. Existing v1.1 plans with a truthy `confirmation` object will not receive `confirmedBy: null` or `source: "chat"`.
- Impact: For v1.1 plans, `confirmation.confirmedBy` and `confirmation.source` are `undefined` until the first `confirmDecisions()` call. In JSON serialization, these fields are omitted rather than shown as `null`/"chat", producing inconsistent output between new and migrated plans. No current code reads these fields before writing them, so functional impact is cosmetic. However, any future code or debugging tool that assumes these fields exist will encounter `undefined`.
- Recommendation: Change the `confirmation` normalization to merge individual sub-fields: `decisions.confirmation.confirmedBy = decisions.confirmation.confirmedBy ?? null; decisions.confirmation.source = decisions.confirmation.source ?? "chat";` after the `||` guard. This ensures the full skeleton is present regardless of whether the parent object existed.
- Suggested test: Create a v1.1 fixture with `confirmation: { confirmed: false, confirmedAt: null, decisionsHash: "", hashAlgorithm: "sha256-decisions-v1" }` (no `confirmedBy`, no `source`). Call `ensureV2Fields()`. Assert `confirmation.confirmedBy === null` and `confirmation.source === "chat"`.
- Dedup key: `ensure-v2-fields-confirmation-subfield-merge`

### OP-03: `questions()` behavior unspecified for unrecognized mockup sub-states

- Severity: P3
- Category: state
- Status: uncertain
- File: `target.md`
- Lines: 235-245
- Claim: `questions()` specifies behavior for: (1) `questions_pending` + not confirmed, (2) `questions_pending` + confirmed, (3) post-`questions_pending` states + confirmed, (4) post-`questions_pending` + not confirmed, (5) `approved` or later, (6) non-mockup phases. No behavior is specified for unrecognized mockup sub-states (e.g., `mockup:corrupted` or `mockup:unknown`).
- Evidence: Line 245 states "`questions()` **nunca** lanza `GSDC_INVALID_STATE`." Since the function must return data for any state and no fallback clause covers unrecognized mockup sub-states, the implementer must infer the default behavior.
- Impact: Low. Unrecognized states should not occur in normal operation. If they do (corruption, manual edit), the implementer must guess the intended behavior. Most likely they would default to `readOnly: true`, which is safe, but an explicit fallback clause would eliminate ambiguity.
- Recommendation: Add a catch-all clause: "Any other state → `readOnly: true`, `suggestedAction: "suggest_new_plan"`. Status reflects the actual value from `plan.json`."
- Suggested test: Set `plan.json` status to `mockup:unknown_state`. Call `questions()`. Assert `readOnly: true` and no error thrown.
- Dedup key: `questions-unrecognized-mockup-state-fallback`

## Non-Issues Checked

- **`resetConfirmation()` crash recovery between plan.json and decisions.json writes**: Acknowledged at line 314. Re-execution is idempotent and recovers correctly because `questions_pending` is an accepted state for re-entry. Lock is acquired before reads. History may accumulate an extra entry — explicitly accepted.
- **Two-step confirm→resolve window**: Between `confirmDecisions()` (sets confirmed=true) and `resolveQuestions()` (transitions state), the plan is `questions_pending` + confirmed=true. `answer()` correctly blocks with exit 23. `questions()` returns `readOnly: true` with `suggestedAction: "retry_resolve"`. Recovery paths documented at lines 240, 430.
- **`answer()` empty required choice values**: Accepted with warning (line 262). `getEmptyFields()` still detects the empty value. `confirmDecisions()` rejects with exit 19. Three-layer defense (answer warning → getEmptyFields → confirmDecisions) is sound.
- **`answer()` order of state vs. confirmation validation**: State check precedes confirmation check (line 268). Test at line 518 confirms exit 13 (not 23) when state is wrong and confirmed is true. Consistent.
- **`optionalAnswered` defensive guard**: `getEmptyFields()` at line 113-114 uses `OPTIONAL_FIELDS.includes(field)` to prevent required fields from being masked by a spurious `optionalAnswered` flag. Test at line 528 confirms this.
- **`confirmDecisions()` always-computes-v2 hash**: Line 479. Stored hash and label always match. `resolveQuestions()`/`submitMockup()` dispatch on stored algorithm for backward compatibility. Migration is atomic per confirmation event.
- **`answer()` idempotency**: Calling twice with same args overwrites with same value. Counters recomputed from current state. No side effects beyond the write.
- **Lock release in `finally`**: All three new functions (`questions`, `answer`, `resetConfirmation`) specify lock release in `finally`. Correct for exception safety.
- **`resetConfirmation()` no-op condition**: Line 301. Correctly guards: `questions_pending` + not confirmed + no mockup → skip writes. Still acquires lock (steps 1-2 before the check), which is correct for consistency.
- **`questions()` read-only does not persist migration**: Line 247. Intentional. Migration persists on first mutation. No risk of partial writes from a read path.
- **`staleRenameFailed` non-fatal handling**: Line 311-313. Rename failure does not throw. Old mockup remains but hash mismatch protects against accidental reuse. Manual cleanup documented.
- **Choice value normalization**: Line 267. Case-insensitive exact match → canonical form stored. Prevents case-variant duplicates. Sound.
- **Placeholder detection `===` change**: Line 44, documented as intentional breaking change. `"TODO: definir colores"` no longer detected. `getEmptyFields()` code at line 117 uses `upper === p` (exact). Consistent with spec.

## Residual Risks

- **Lock manager stale lock handling**: `lib/lock-manager.js` implementation is not reviewed. If a process crashes while holding the lock, subsequent operations could deadlock unless the lock manager has timeout/cleanup logic. Not introduced by this plan but critical for all lock-dependent operations.
- **Concurrent access not tested in unit tests**: The test plan (lines 491-559) does not include concurrent `answer()` calls. Lock serialization correctness depends on the lock manager implementation. Integration-level testing would be needed.
- **History accumulation on crash recovery**: Explicitly accepted (line 314: "History puede acumular un entry extra en crash recovery — aceptable"). The `from` field in the duplicate entry may be `questions_pending`→`questions_pending` (recovery from partial write), which could confuse audit readers.
- **`writeAtomicJson()` crash safety**: Assumed to be temp-file + rename. If the implementation is different, individual file writes may not be atomic. Not specified in this plan.
