# Review: modeler

## Summary

- Verdict: approve_with_changes
- Top risk: `allQuestionsAddressed` naming invites implementer misinterpretation; `confirmDecisions()` lacks even advisory coverage for optional fields
- Confidence: high

## Findings

### MOD-001: `allQuestionsAddressed` name misrepresents its semantics

- Severity: P2
- Category: state
- Status: valid
- File: `lib/plan-manager.js` (proposed)
- Lines: target.md:144
- Claim: `allQuestionsAddressed` is `true` when all questions have been presented, not when all have substantive answers.
- Evidence: The spec explicitly says (target.md:144): "Tracks question-presentation completion, not value presence. Puede ser `true` cuando `assets === ""` (declinado)." The name uses "addressed" which in common English implies "dealt with / answered". An implementer reading `if (allQuestionsAddressed)` will reasonably assume values exist for all fields. This is a naming invariant violation — the name promises more than the field proves.
- Impact: Implementer may skip value-presence checks thinking the flag guarantees them. Template-level bugs where assets is assumed non-empty when the flag is true.
- Recommendation: Rename to `allQuestionsPresented` or `allQuestionsHandled`. If "addressed" is kept, add an inline code comment at declaration: `// true = every question was asked; NOT that every field has a non-empty value`.
- Suggested test: Test that verifies `allQuestionsAddressed === true` while `assets === ""` after decline, confirming documentation matches implementation.
- Dedup key: allQuestionsAddressed-naming-semantics

### MOD-002: P1-002 (confirmDecisions optional validation) — downgrade to P2, adopt warning counter-proposal

- Severity: P2
- Category: cli-contract
- Status: valid
- File: `lib/plan-manager.js` (proposed `confirmDecisions()`)
- Lines: target.md:564-566
- Claim: The original P1-002 asserted that `confirmDecisions()` must reject when optional fields are unaddressed. The author's separation-of-layers argument is partially valid — the API correctly guards required fields (exit 19), and the template is the correct layer for UX policy. However, the API currently provides **zero signal** about optional field status during confirmation, which is a gap in the API contract.
- Evidence: (1) `confirmDecisions()` calls `getEmptyFields(decisions, REQUIRED_FIELDS)` — only required fields checked. (2) `allQuestionsAddressed` is computed by `questions()` and `answer()` but never referenced in `confirmDecisions()`. (3) The author's own counter-proposal (counter-arguments.md:23) suggests a warning, acknowledging the gap exists. (4) The `answer()` precedent (empty required → warning, not error) establishes the pattern the author correctly invokes — but that pattern should apply here too.
- Impact: A buggy agent that fills required fields and calls `confirmDecisions()` directly gets no feedback that optionals were skipped. The `allQuestionsAddressed` advisory field becomes invisible at the critical confirmation boundary.
- Recommendation: Adopt the author's counter-proposal: `confirmDecisions()` returns `{ warning: "optional_fields_not_addressed" }` when `optionalAnswered` doesn't cover all `OPTIONAL_FIELDS`. Do NOT block (exit 19) — keep it advisory, consistent with `answer()` philosophy.
- Suggested test: Fill 6/6 required, skip assets, call `confirmDecisions()` → success with `warning: "optional_fields_not_addressed"` in response. Fill 6/6 + answer assets → success, no warning.
- Dedup key: confirmDecisions-optional-warning-gap

### MOD-003: P1-005 ("claro que no, confirmo" acceptance) — original P1 does not stand

- Severity: P3
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (proposed)
- Lines: target.md:500
- Claim: The original P1-005 asserted that "claro que no, confirmo" should be rejected. The author's defense is **correct** on Spanish semantics.
- Evidence: (1) In Spanish, "claro que no, confirmo" is pragmatically an affirmation — the "no" negates an implicit antecedent ("¿no vas a confirmar?"), not "confirmo". (2) The negation regex `/\bno\s+(lo\s+)?(confirmo|confirmado)\b/i` correctly catches direct negation patterns: "no confirmo", "no lo confirmo", "no confirmado". (3) "Claro que no, confirmo" has a word boundary between "no" and "confirmo" that the negation regex does not match, which is correct behavior. (4) The escape hatch (`reset-confirmation`) handles genuine mistakes. (5) The precedent argument (counter-arguments.md:44-45) is sound — CLIs should not need NLP.
- Impact: The only remaining risk is "confirmo pero quiero cambiar" which the proposal already documents as an accepted trade-off (target.md:722). This is low-severity — the user can immediately `reset-confirmation`.
- Recommendation: Accept current design. Add the explicit note the author proposes (counter-arguments.md:46): "Parsing detects presence of 'confirmo/confirmado' word, not context semantics. To undo, use reset-confirmation."
- Suggested test: Already covered in target.md:653 — "claro que confirmo" → confirmed. No new tests needed.
- Dedup key: confirmo-negation-spanish-semantics

### MOD-004: `ensureV2Fields()` mutates in-memory but callers may not expect mutation

- Severity: P2
- Category: integrity
- Status: uncertain
- File: `lib/plan-manager.js` (proposed)
- Lines: target.md:103-115
- Claim: `ensureV2Fields()` mutates the `decisions` object in-place (`decisions.optionalAnswered = ...`). For read-only functions like `questions()` and `status()`, this is documented as intentional (not persisted). But if any caller caches the pre-mutation object or passes it to another function, the in-place mutation creates aliasing bugs.
- Evidence: The function uses assignment operators (`decisions.optionalAnswered = decisions.optionalAnswered || {}`) which mutate the parsed JSON object. `questions()` explicitly does NOT write to disk after this mutation. But if `questions()` is called, then `answer()` is called on the same logical plan, there's no issue because each function re-reads from disk. The risk is within a single function call chain in the same process — unlikely in CLI usage but possible if the module is used programmatically.
- Impact: Low in CLI context (each invocation is a process). Higher if plan-manager is ever imported as a library. The invariant (mutate then optionally persist) is correct but fragile.
- Recommendation: Add a code comment on `ensureV2Fields()`: `// Mutates decisions in-place. Read-only callers (questions, status) must NOT persist. Mutating callers (answer, confirm, reset) persist via atomic write.` Consider returning the mutated object for clarity, or cloning if performance allows.
- Suggested test: Call `questions()` twice on same v1.1 fixture — verify second call returns same results (no accumulated mutation on disk).
- Dedup key: ensureV2Fields-in-place-mutation

### MOD-005: `getEmptyFields` and `optionalAnswered` coupling has a latent asymmetry

- Severity: P3
- Category: state
- Status: valid
- File: `lib/plan-manager.js` (proposed)
- Lines: target.md:127-139
- Claim: `getEmptyFields()` guards against false `optionalAnswered` flags on required fields (line 133: `OPTIONAL_FIELDS.includes(field)`). But the inverse is not guarded: a required field ID that is also listed in `OPTIONAL_FIELDS` would be silently skipped. Currently impossible (the sets are disjoint by design), but the registry-driven architecture means adding a field with `required: true` that someone also adds to `OPTIONAL_FIELDS` would create a silent skip.
- Evidence: `REQUIRED_FIELDS = FIELD_REGISTRY.filter(f => f.required).map(f => f.id)` and `OPTIONAL_FIELDS = FIELD_REGISTRY.filter(f => !f.required).map(f => f.id)` — these are derived from the same registry with mutually exclusive filters, so they are always disjoint. The guard in `getEmptyFields` is defensive against external `optionalAnswered` corruption, not against registry bugs.
- Impact: Negligible with current architecture. The invariant (disjoint sets) is maintained by construction. But the function doesn't assert this invariant.
- Recommendation: Add a module-level assertion: `const OVERLAP = REQUIRED_FIELDS.filter(f => OPTIONAL_FIELDS.includes(f)); assert(OVERLAP.length === 0, 'REQUIRED_FIELDS and OPTIONAL_FIELDS must be disjoint');` This makes the invariant explicit and fails fast.
- Suggested test: Add a dummy field to FIELD_REGISTRY with `required: true`, verify `OPTIONAL_FIELDS` does not include it. (Cleanup after test.)
- Dedup key: required-optional-disjoint-invariant

### MOD-006: `resetConfirmation()` history dedup only checks last entry

- Severity: P3
- Category: integrity
- Status: valid
- File: `lib/plan-manager.js` (proposed)
- Lines: target.md:344
- Claim: The proposal says "Si último entry ya tiene `action: 'reset-confirmation'` con mismo `from` → no duplicar." This only checks the **last** history entry. If two different `from` states produce the same `to` state after multiple resets, the dedup logic could incorrectly suppress a legitimate history entry.
- Evidence: Scenario: plan goes `questions_pending` → `ready_for_html` → reset (history: `[{from: ready_for_html, to: questions_pending}]`) → confirm → `ready_for_html` → reset again. Last entry is `reset-confirmation from: ready_for_html` from the first reset. The second reset also has `from: ready_for_html`, so it would be deduplicated. But the resets are distinct events — there was a confirm in between.
- Impact: History loses fidelity. Not a state integrity issue (the actual state is correct), but audit trail is incomplete. In crash recovery scenarios, missing history entries could complicate forensics.
- Recommendation: Either (a) always append history entries (accept minor duplication), or (b) dedup by checking both `action` AND `timestamp` proximity (e.g., within 1 second), or (c) add a unique `resetId` to each reset invocation. Option (a) is simplest and the proposal already notes "History puede acumular un entry extra en crash recovery — aceptable" — extend this acceptance to all dedup.
- Suggested test: Confirm → reset → confirm → reset → verify history has 2 reset-confirmation entries (both preserved).
- Dedup key: reset-history-dedup-oversuppression

### MOD-007: Hash migration dispatch assumes binary version set

- Severity: P2
- Category: integrity
- Status: valid
- File: `lib/plan-manager.js` (proposed)
- Lines: target.md:542-572
- Claim: `resolveQuestions()` and `submitMockup()` dispatch hash computation based on `confirmation.hashAlgorithm`. If `hashAlgorithm` is `"sha256-decisions-v1"` → 6 fields; "any other case" → 7 fields. This means unknown future versions (e.g., `"sha256-decisions-v3"`) would silently fall through to 7-field computation, producing a hash that doesn't match the stored one.
- Evidence: The dispatch logic (target.md:572): "Si es `sha256-decisions-v1`, usan 6 campos + normalize vieja. Cualquier otro caso (v2, vacío, undefined) → 7 campos." A v3 plan would compute v2 hash, get a mismatch, and fail with `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (exit 21) — a misleading error for what's actually a version mismatch.
- Impact: Future hash algorithm changes would produce confusing error messages instead of a clear version error. Not a current risk (only v1 and v2 exist) but the dispatch pattern is not forward-compatible.
- Recommendation: Add an explicit check: if `hashAlgorithm` starts with `"sha256-decisions-"` but is neither v1 nor v2, throw `GSDC_JSON_PARSE_ERROR` or a new `GSDC_UNSUPPORTED_HASH_VERSION` with a clear message. The fallback to 7 fields should only apply to empty/undefined, not to unknown versions.
- Suggested test: Create fixture with `hashAlgorithm: "sha256-decisions-v99"` → `resolveQuestions()` throws descriptive error (not hash mismatch).
- Dedup key: hash-version-forward-compatibility

### MOD-008: `optionalAnswered` not cleaned on field value overwrite

- Severity: P3
- Category: state
- Status: valid
- File: `lib/plan-manager.js` (proposed)
- Lines: target.md:287
- Claim: `answer()` sets `optionalAnswered[field] = true` when answering optional fields. But if the user later resets and then answers required fields, `optionalAnswered` is cleaned by `resetConfirmation()`. However, there's no mechanism to unset `optionalAnswered[field]` if the user explicitly clears an optional field value without going through reset. The `answer()` function only sets the flag, never unsets it.
- Evidence: The spec says (target.md:287): "optionalAnswered[field] = true solo cuando OPTIONAL_FIELDS.includes(field)". Answering with empty string (`plan answer --field assets --value ""`) still sets the flag to true. This is by design (the question was addressed, the answer is "nothing"). But answering the same field again doesn't change the flag. The flag is monotonically increasing within a session.
- Impact: No practical impact — the flag correctly represents "was this question presented to the user". Once addressed, it stays addressed. Reset clears everything. The monotonicity is actually correct for the use case.
- Recommendation: Document the monotonic invariant: `// optionalAnswered is monotonic within a session — once set, only resetConfirmation() clears it.` No code change needed.
- Suggested test: Answer assets with value, then answer assets with empty → verify `optionalAnswered.assets === true` both times.
- Dedup key: optionalAnswered-monotonic-invariant

## Non-Issues Checked

- **State machine transitions**: `resetConfirmation()` recovery via plan.json-first write ordering is sound. Crash between plan.json and decisions.json writes leaves a diagnosable state where re-execution converges.
- **`requiredFieldsComplete` consistency**: Correctly derived from `requiredPendingCount === 0`, and `getEmptyFields` catches empty required values even when answered with empty string. No gap.
- **`getEmptyFields` defensive guard against `optionalAnswered` on required fields**: The `OPTIONAL_FIELDS.includes(field)` check prevents a buggy `optionalAnswered` from hiding required field gaps. Correct.
- **Hash migration atomicity**: `confirmDecisions()` always writes v2 hash + label together. No window where hash and label disagree.
- **`findPlanDir` vs `readJsonOrThrow` error code separation**: exit 24 (directory missing) vs exit 25 (file missing inside directory) is clear and non-overlapping.
- **`questions()` never throws GSDC_INVALID_STATE**: Verified — all unrecognized states fall through to read-only with `suggest_new_plan`. No crash path for unexpected states.
- **`ensureV2Fields()` call ordering**: Explicitly specified at the top of every function that reads `decisions.json`, including read-only ones. Consistent.
- **Negation regex coverage**: `/\bno\s+(lo\s+)?(confirmo|confirmado)\b/i` correctly matches "no confirmo", "no lo confirmo", "no confirmado" and does NOT match "claro que no, confirmo" (word boundary between "no" and "confirmo"). Correct for Spanish semantics.

## Residual Risks

- **MOD-007 forward compatibility**: If a v3 hash algorithm is ever introduced, the current dispatch will silently compute a wrong hash. Not a current risk but should be hardened before implementation.
- **MOD-004 in-place mutation**: Safe in CLI context (single process per invocation), but the mutation-without-persist pattern in `questions()`/`status()` could surprise future programmatic consumers of the module.
- **MOD-002 advisory warning**: The author's counter-proposal is reasonable and should be adopted. Without it, the confirmation boundary provides zero feedback about optional field status, which is a minor but real API completeness gap.
