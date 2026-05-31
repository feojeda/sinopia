# Review: modeler

## Summary

- Verdict: approve_with_changes
- Top risk: Hash migration v1→v2 writes v2 algorithm label over a v1-computed hash, causing a false mismatch on the next verification step and breaking the re-confirmation path for existing plans.
- Confidence: high

## Findings

### M-01: Hash migration computes v1 hash but labels it v2

- Severity: P1
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `confirmDecisions()`)
- Lines: target.md:426-438
- Claim: `confirmDecisions()` reads the current `hashAlgorithm`, computes the hash with that algorithm, stores the hash, then unconditionally writes `hashAlgorithm: 'sha256-decisions-v2'`.
- Evidence: target.md line 438 states "confirmDecisions() siempre escribe hashAlgorithm: 'sha256-decisions-v2'". Line 438 also says "confirmDecisions(), resolveQuestions(), submitMockup() usan computeDecisionsHash(decisions, confirmation.hashAlgorithm)". For a v1 plan: (1) reads `hashAlgorithm: 'sha256-decisions-v1'`, (2) computes hash over 6 fields → H_v1, (3) stores `decisionsHash: H_v1`, (4) writes `hashAlgorithm: 'sha256-decisions-v2'`. When `resolveQuestions()` next runs, it reads `hashAlgorithm: 'sha256-decisions-v2'`, computes over 7 fields → H_v2, and compares H_v2 ≠ H_v1, yielding `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (exit 21). This is a false positive that blocks the normal flow for any existing v1 plan being re-confirmed.
- Impact: Every v1 plan that goes through `confirmDecisions()` will immediately fail at `resolveQuestions()`. The migration path described as "la primera re-confirmación migra automáticamente" (line 38) is broken. Plans created before v1.2 cannot complete the mockup flow.
- Recommendation: `confirmDecisions()` must compute the hash using the **target** algorithm (v2), not the incoming one. Specifically: always call `computeDecisionsHash(decisions, 'sha256-decisions-v2')` and write both the v2 hash and the v2 label. This makes migration atomic — the hash and label are always consistent. For v1 plans, `assets` is `undefined`, which normalizes to `""` in the hash, producing a stable v2 hash.
- Suggested test: Create fixture with `hashAlgorithm: 'sha256-decisions-v1'` and 6 fields filled. Run `confirmDecisions()`. Then run `resolveQuestions()`. Assert: no exit 21, plan transitions to `ready_for_html`, `hashAlgorithm === 'sha256-decisions-v2'`.
- Dedup key: hash-migration-v1-v2-label-mismatch

### M-02: `questions()` output hides confirmed-locked state in `questions_pending`

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `questions()`)
- Lines: target.md:222-228
- Claim: When a plan is in `mockup:questions_pending` with `confirmation.confirmed === true` (the window after `confirmDecisions()` succeeds but before `resolveQuestions()` transitions state), `questions()` returns normal interactive output with `pending`/`filled` arrays and no indication that answers are locked.
- Evidence: target.md line 226 says "Plan en mockup:questions_pending → flujo normal con pending/filled" with no check on `confirmed` status. Line 242 shows `answer()` validates `confirmation.confirmed !== true` and fails with exit 23. An agent seeing pending fields would attempt `answer()`, hit exit 23, and only then discover the lock.
- Impact: Agent renders pending questions to the user, user attempts to answer, receives a confusing error. The `questions()` output promises interactivity that `answer()` denies. This violates the contract that the `questions()` response accurately reflects what operations are possible.
- Recommendation: Add a `confirmed: true` flag to the `questions()` output when `confirmation.confirmed === true`, regardless of state. Alternatively, treat `questions_pending + confirmed=true` as read-only (return `readOnly: true` with a `reason` field like `"awaiting resolve"`). This lets the agent skip the answer flow and either wait or call `resolveQuestions()`.
- Suggested test: Create plan in `questions_pending` with `confirmed: true`. Call `questions()`. Assert output includes `confirmed: true` or `readOnly: true`. Assert `answer()` returns exit 23 (existing behavior, unchanged).
- Dedup key: questions-omits-confirmed-flag-in-pending-state

### M-03: `ensureV2Fields()` not called in `confirmDecisions()` — legacy path creates inconsistent plan

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:91, target.md:438
- Claim: `ensureV2Fields()` is specified for `questions()`, `answer()`, and `resetConfirmation()` only (line 91). `confirmDecisions()` is not listed. Yet `confirmDecisions()` writes `hashAlgorithm: 'sha256-decisions-v2'` and the new `getEmptyFields()` helper uses `optionalAnswered`.
- Evidence: target.md line 91 explicitly enumerates the three functions. Line 114 says `confirmDecisions()` uses `getEmptyFields()`, which reads `optionalAnswered` (a v2 field). Line 438 says `confirmDecisions()` writes v2 algorithm. Repo context shows v1 `decisions.json` has no `assets` or `optionalAnswered` fields.
- Impact: A v1 plan that goes directly to `confirmDecisions()` (legacy agent path, no `questions()`/`answer()` first) will have `decisions.json` labeled as v2 but missing `optionalAnswered` and `assets`. `getEmptyFields()` defaults `optionalAnswered` to `{}`, which works for the check, but the stored `decisions.json` is structurally inconsistent — labeled v2 without v2 fields. Future code that reads these fields directly (without `ensureV2Fields()`) may throw `TypeError` or produce wrong results.
- Recommendation: Add `ensureV2Fields()` to the start of `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`, and `status()`. Any function that reads or writes `decisions.json` should normalize it first. Alternatively, move the call into a shared read path (e.g., inside `readJsonOrThrow()` or a wrapper) so it cannot be skipped.
- Suggested test: Create v1 fixture (no `assets`, no `optionalAnswered`). Call `confirmDecisions()` directly. Assert `decisions.json` now contains `assets: ""` and `optionalAnswered: {}` after the call.
- Dedup key: ensurev2fields-missing-from-confirmDecisions

### M-04: `resetConfirmation()` optional clearing hardcodes field names instead of deriving from `FIELD_REGISTRY`

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `resetConfirmation()`)
- Lines: target.md:282
- Claim: The spec says "valores de campos opcionales a '' (ej: assets = '')" — a single example, implying hardcoded logic. If a new optional field is added to `FIELD_REGISTRY` later, `resetConfirmation()` must be independently updated.
- Evidence: target.md line 282 lists `optionalAnswered = {}` (generic) and `assets = ""` (field-specific). The pattern is not expressed as a derivation from the registry. Line 551 says "FIELD_REGISTRY es única fuente de verdad" but the reset logic doesn't fully honor this for field clearing.
- Impact: Adding a new optional field to `FIELD_REGISTRY` without updating `resetConfirmation()` creates a silent inconsistency: `optionalAnswered` is cleared but the field value persists. `questions()` would show the field as filled (since `optionalAnswered` is empty and the field has a value), which is wrong after a reset.
- Recommendation: Express the clearing logic as: `for (const field of FIELD_REGISTRY.filter(f => !f.required)) { decisions[f.id] = ""; }`. This ensures new optional fields are automatically handled.
- Suggested test: After implementation, add a test-only optional field to `FIELD_REGISTRY`. Run `resetConfirmation()`. Assert the new field's value is cleared to `""`.
- Dedup key: reset-hardcodes-optional-fields-instead-of-registry

### M-05: `requiredFieldsComplete` naming invites auto-proceed misinterpretation

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js, templates/commands/canva-mockup.md
- Lines: target.md:117, target.md:370
- Claim: The name `requiredFieldsComplete` semantically reads as "required fields are done, proceed." The spec explicitly says it means "presentar resumen y pedir confirmación" (line 117) and "NO es permiso para auto-confirmar." But the name itself does not encode this constraint.
- Evidence: target.md line 117 states the invariant and the warning. Line 370 in the template correctly routes to the review step. However, an implementer reading only the JSON output or the function signature may miss the note and treat the flag as a green light.
- Impact: An implementer or future agent template could check `requiredFieldsComplete` and auto-trigger `confirm-decisions` without presenting the review summary, violating the explicit confirmation gate.
- Recommendation: Rename to `readyForReview` or `requiredPendingCount === 0` (using the counter directly). If keeping the name, add the flag to every JSON output example with a `"readyForReview": true, "readyForReview_note": "present summary, do NOT auto-confirm"` annotation, or include it in the JSON schema comment.
- Suggested test: Grep implementation for `requiredFieldsComplete` and verify it only appears in: (1) questions/answer output, (2) template routing to review step. Assert it never appears in a conditional that calls `confirm-decisions`.
- Dedup key: requiredfieldscomplete-naming-auto-proceed-risk

### M-06: Error codes 20 vs 25 share "file missing inside plan" semantics with unclear boundary

- Severity: P3
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:510-519
- Claim: `GSDC_ARTIFACT_MISSING` (20) means mockup.html is absent in `submitMockup()`. `GSDC_PLAN_ARTIFACT_MISSING` (25) means any required file is absent inside an existing plan directory (used by `readJsonOrThrow()`). Both describe "file missing inside a plan directory" but have different codes and names.
- Evidence: target.md line 97 states "GSDC_ARTIFACT_MISSING (20) = se mantiene para submitMockup() (mockup.html falta)." Line 95 states `readJsonOrThrow` uses exit 25 for missing files. Line 518 clarifies "Distinto de GSDC_ARTIFACT_MISSING (20)."
- Impact: An agent handling errors generically (e.g., "if exit >= 20, suggest re-creating plan") would treat both the same, but the correct recovery is different: exit 20 means "generate the mockup first," exit 25 means "plan is corrupt, investigate." An agent that doesn't distinguish them gives wrong recovery advice.
- Recommendation: Rename exit 20 to `GSDC_MOCKUP_ARTIFACT_MISSING` to make the boundary explicit: "mockup artifact" vs "plan artifact." This aligns the name with the actual semantic distinction.
- Suggested test: Assert error message for exit 20 contains "mockup" and error message for exit 25 contains "plan artifact" or "decisions.json". Assert no function uses both codes for the same condition.
- Dedup key: error-code-20-25-semantic-overlap

## Non-Issues Checked

- **`optionalAnswered` semantics**: Setting `true` for both empty and non-empty optional answers is consistent. The name "este campo opcional fue respondido" is precise. `getEmptyFields()` correctly excludes these fields. Declining with `""` is semantically "answered with nothing," which is distinct from "never asked." Sound design.
- **`getEmptyFields()` placeholder detection**: Uses `===` instead of `includes()` (fixing the "Nodo" bug from repo context line 57-58). Bracket detection `[...]` is appropriate. Case-insensitive via `.toUpperCase()`. Correct.
- **Lock ordering**: All three new functions acquire lock → read → validate → write → release in `finally`. Consistent with existing pattern. No deadlock risk since all use a single global lock.
- **`resetConfirmation()` idempotency**: Three-condition check (`state === questions_pending && confirmed !== true && !mockupExists`) correctly identifies the true no-op case. Partial failure recovery (lines 291-294) is well-analyzed — re-execution converges.
- **`computeDecisionsHash` normalization**: `toLowerCase()` prevents false hash mismatches from casing differences. Appropriate for an integrity check that should be insensitive to trivial typography.
- **`FIELD_REGISTRY` as single source of truth**: `REQUIRED_FIELDS`, `ALL_FIELDS`, `getEmptyFields()`, `questions()` output, `answer()` validation all derive from it. Consistent.
- **History deduplication in `resetConfirmation()`**: Checking last entry for same `action` + `from` prevents audit noise on retries. Correct.
- **"Otro (personalizado)" not hardcoded by agents**: Comes from `questions()` JSON output with `customFollowUp`. Agents render it from data, not code. Clean separation.
- **`answer()` does not update `plan.json`**: By design, audit trail lives in `decisions.json`. `plan.json` only changes on state transitions. Consistent.
- **`questions()` never throws `GSDC_INVALID_STATE`**: Returns `readOnly: true` for post-`questions_pending` states. Error table (line 568) and template (line 382) both note this. Consistent contract.

## Residual Risks

- **M-01 fix may need `ensureV2Fields()` in `confirmDecisions()`**: Resolving the hash migration bug by always computing v2 hash requires that `decisions.assets` exists (or normalizes correctly from `undefined`). Current normalization handles `undefined → ""`, so this is safe. But if normalization logic changes, this assumption could break. Recommend an explicit guard.
- **Concurrent agent calls**: The global lock prevents concurrent writes, but if two agent sessions call `questions()` simultaneously, both get the same pending list and could attempt to answer the same field. The lock serializes writes, so the second write wins. This is safe (last-write-wins) but could surprise a user who answered in two windows. Not a bug, but worth documenting.
- **`confirmDecisions()` called without prior `answer()`**: A legacy agent could call `confirm-decisions` directly on a plan where no fields were filled via the new flow. The function would validate required fields and fail with `GSDC_QUESTIONS_UNRESOLVED` (19). This is correct behavior but untested in the test plan — no test covers "confirm without answer."
- **Future optional fields**: If more optional fields are added to `FIELD_REGISTRY`, all code paths that handle `optionalAnswered` must be audited. The current design is extensible but the coupling is implicit (field IDs must match between registry, `resetConfirmation()`, and `ensureV2Fields()`).
