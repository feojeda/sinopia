# Review: modeler

## Summary

- Verdict: approve_with_changes
- Top risk: `resetConfirmation()` clears `optionalAnswered` but not optional field values — non-empty optionals silently carry forward after reset, contradicting the stated invariant that "all optional questions must be re-asked."
- Confidence: high

## Findings

### M-01: `resetConfirmation()` fails to re-surface non-empty optional fields after reset

- Severity: P2
- Category: state
- Status: valid
- File: `lib/plan-manager.js` (proposed `resetConfirmation`)
- Lines: target.md:287, target.md:544
- Claim: The proposal states "al resetear para re-editar, todas las preguntas opcionales deben volverse a preguntar" (line 287) and "reset-confirmation limpia optionalAnswered — todas las preguntas opcionales se re-preguntan" (line 544).
- Evidence: `resetConfirmation()` clears `optionalAnswered = {}` but does **not** clear optional field values in `decisions.json`. After reset, `getEmptyFields()` (target.md:96-108) checks `optionalAnswered[field]` first (now falsy), then checks the value. If `assets` has a non-empty value like "Logo en PNG", the value check passes (non-empty, non-placeholder) → the field is excluded from the pending list. `optionalPendingCount` remains 0. The agent will not re-ask about assets because `questions()` shows it as filled. The only test for this path (target.md:475, "Test reset-confirmation limpia optionalAnswered") uses a **declined** (empty) optional, which correctly re-surfaces. No test covers the non-empty optional case.
- Impact: After resetting to re-edit decisions, a previously answered optional field carries its old value forward silently. If the user reset to change context (e.g., switching from a restaurant to SaaS vertical), stale asset data may persist through confirmation without being re-validated. The stated invariant is violated for a real workflow scenario.
- Recommendation: Either (a) clear optional field values to `""` during `resetConfirmation()` alongside `optionalAnswered`, matching the stated intent; or (b) qualify the statement to "all *declined* optional questions are re-asked; previously answered optionals retain their values" and accept the current mechanism. If (a), add a test: fill `assets` with a non-empty value, confirm, reset → `optionalPendingCount === 1`, `assets` value is `""`.
- Suggested test: Create plan → `answer(assets, "Logo PNG")` → confirm → resolve → `resetConfirmation()` → `questions()` → assert `optionalPendingCount === 1` and `assets` value is empty (if option a) or assert `optionalPendingCount === 0` and document the behavior (if option b).
- Dedup key: reset-confirmation-optional-nonempty-reask

### M-02: `optionalAnswered` naming implies broader semantics than its actual behavior

- Severity: P3
- Category: state
- Status: valid
- File: `lib/plan-manager.js` (proposed `FIELD_REGISTRY` and `answer`)
- Lines: target.md:120-121, target.md:251-252
- Claim: `optionalAnswered` is set only when an optional field is answered with an empty value (declined). It is never set for non-empty answers.
- Evidence: target.md:251-252: "Si field es un campo opcional y value es '', marca optionalAnswered[field] = true sin cambiar el valor." No corresponding statement for non-empty values. The name `optionalAnswered` reads as "this optional field has been answered" (in either direction), but it actually means "this optional field was explicitly declined." An implementer could reasonably set `optionalAnswered[field] = true` for ALL optional answers (empty and non-empty), which would change the behavior of `getEmptyFields()` edge cases.
- Impact: Implementer misinterpretation risk. If an implementer sets the flag for all optional answers, the behavioral difference only surfaces in edge cases involving external `decisions.json` manipulation (which the system prohibits). Low practical risk but the naming invites confusion.
- Recommendation: Rename to `optionalDeclined` or `optionalDismissed` to match the actual semantics. Alternatively, if the intent is to track all optional answers, set the flag for both empty and non-empty values and document the distinction.
- Suggested test: After `answer(assets, "Logo PNG")`, assert `optionalAnswered.assets` is either `undefined` (current design, rename to `optionalDeclined`) or `true` (if semantics expanded).
- Dedup key: optional-answered-naming-semantics

### M-03: `hashAlgorithm` cleared to `""` but dispatch logic references `undefined`

- Severity: P3
- Category: state
- Status: valid
- File: `lib/plan-manager.js` (proposed `computeDecisionsHash`, `resetConfirmation`)
- Lines: target.md:286, target.md:434-436
- Claim: `resetConfirmation()` sets `hashAlgorithm = ""` (empty string), but the v2 dispatch condition says "Si es sha256-decisions-v2 (o undefined en planes nuevos)" — `""` is neither v2 nor `undefined`.
- Evidence: target.md:286: `confirmation.hashAlgorithm = ""`. target.md:435: "Si es sha256-decisions-v2 (o undefined en planes nuevos) → calcular hash con 7 campos". After reset, `hashAlgorithm` is `""`, not `undefined`.
- Impact: An implementer who writes `if (hashAlgorithm === 'sha256-decisions-v1') { /* v1 */ } else if (hashAlgorithm === 'sha256-decisions-v2' || hashAlgorithm === undefined) { /* v2 */ }` would miss the `""` case. The natural `if/else` structure handles it correctly, but the specification text encourages a fragile pattern by mentioning `undefined` instead of the actual reset value.
- Recommendation: Change the specification text to: "Si hashAlgorithm es sha256-decisions-v1 → 6 campos. En cualquier otro caso (sha256-decisions-v2, vacío, undefined) → 7 campos." This makes the fallback explicit and matches the actual reset state.
- Suggested test: After `resetConfirmation()`, assert `hashAlgorithm === ""`. Call `confirmDecisions()` → assert computed hash uses 7 fields (v2). Verify `hashAlgorithm` is now `"sha256-decisions-v2"`.
- Dedup key: hash-algorithm-empty-string-vs-undefined

### M-04: `readJsonOrThrow()` adoption scope for existing functions is underspecified

- Severity: P3
- Category: docs
- Status: valid
- File: `lib/plan-manager.js`
- Lines: target.md:92-93
- Claim: The proposal defines `readJsonOrThrow()` and says "Usar en todas las funciones que leen artefactos requeridos dentro de un plan existente" but only explicitly calls out migration of `findPlanDir()`. Existing functions like `status()`, `confirmDecisions()`, `resolveQuestions()`, and `submitMockup()` also read JSON artifacts and may still use the old error codes.
- Evidence: target.md:92: "Usar en todas las funciones que leen artefactos requeridos dentro de un plan existente." The changes section (sections 1-4) only mentions `findPlanDir()` migration and the new functions. `status()` is not mentioned in any change section. If `status()` currently reads `decisions.json` and the file is missing, it would throw whatever error the current inline logic produces — potentially `GSDC_JSON_PARSE_ERROR` (15) instead of `GSDC_PLAN_ARTIFACT_MISSING` (25).
- Impact: Inconsistent error codes across the CLI surface. A missing `decisions.json` in an existing plan could produce exit 15 from `status()` but exit 25 from `questions()`. Downstream consumers (agents, templates) that distinguish these errors would get inconsistent behavior.
- Recommendation: Add an explicit change item: "Migrate all existing functions that read JSON artifacts (`status()`, `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`) to use `readJsonOrThrow()`." Or add a test: "Test status missing decisions.json → exit 25 (not 15)."
- Suggested test: `plan status --id <existing-plan-without-decisions-json> --json` → assert exit code 25, not 15.
- Dedup key: readjsonorthrow-scope-existing-functions

## Non-Issues Checked

- **Placeholder detection fix (exact match vs `includes()`)**: The proposal correctly identifies the preexisting bug (repo-context.md:57-58, "Nodo" matching "TODO" via `includes()`) and fixes it with `===` (target.md:105, target.md:111). The placeholder list `['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR']` is checked with exact match after `.toUpperCase()`. Bracket detection `startsWith('[') && endsWith(']')` is also reasonable. Test coverage (target.md:478, 486) is adequate.

- **State machine transitions for `approved` state**: `resetConfirmation()` accepts only `questions_pending`, `ready_for_html`, `pending_approval`. `approved` would get `GSDC_INVALID_STATE` (13). This is correct — approved plans should not be editable via reset.

- **`answer()` state guard ordering**: The proposal specifies lock → read → validate state → validate `confirmed !== true` → write (target.md:247-248). Both validations occur inside the lock. This prevents TOCTOU races. Correct.

- **`confirmDecisions()` validation scope**: Uses `REQUIRED_FIELDS` (6 fields) for emptiness check. `assets` is not validated for completeness. Hash includes `assets` in v2. This is consistent — optional fields are tracked but not required. `confirmDecisions()` will always write v2 hash algorithm, migrating old plans. Correct.

- **Double-wrap prevention**: Manager returns raw data, CLI wraps via `handleSuccess()`. Test explicitly checks `parsed.data.data` does not exist (target.md:492, 526). Adequate.

- **`submitMockup()` v1/v2 dispatch**: Proposal explicitly calls out that `submitMockup()` needs the same dispatch (target.md:438, 549). The implementer is warned. Test coverage includes v1 fixture (target.md:480, 525).

- **"Otro (personalizado)" sentinel value**: `value: ""` means an empty answer to a required field would leave it pending (`getEmptyFields()` catches it). The agent can't accidentally confirm an empty custom value because `confirmDecisions()` validates required fields. Correct.

- **`findPlanDir()` exit code migration**: Breaking change from exit 15 to exit 24 is explicitly documented (target.md:36). The proposal identifies the risk and requires verification of external dependencies. Test coverage (target.md:484, 527) is adequate.

- **`GSDC_PLAN_ARTIFACT_MISSING` (25) vs `GSDC_ARTIFACT_MISSING` (20) distinction**: Different codes, different semantics, different names. Exit codes don't collide. `list()` is explicitly excluded from strict error handling. Correct.

- **Lock semantics**: Both `questions()` and `answer()` acquire the global lock before reading/writing. Lock released in `finally`. Test checks lock file doesn't persist after `questions()` (target.md:496). Adequate for single-process correctness.

- **`resetConfirmation()` partial failure recovery**: Well-documented recovery paths (target.md:296). Re-execution correctly handles each partial state because idempotency condition checks `confirmed` and `mockup.html` existence, not just state. Correct.

- **`optionalAnswered` interaction with `confirmDecisions()` hash**: Hash only covers field values, not `optionalAnswered`. Changing `optionalAnswered` without changing field values doesn't break hash verification. `optionalAnswered` is metadata about tracking, not a decision. Correct.

- **`FIELD_REGISTRY` as single source of truth**: `REQUIRED_FIELDS`, `ALL_FIELDS`, `CHOICE_FIELDS` all derived from the registry. Tests verify consistency (target.md:453). Adequate.

## Residual Risks

- **No test for non-empty optional after reset**: The test matrix covers the declined-optional case but not the non-empty-optional case after `resetConfirmation()`. If M-01 is resolved with option (b) (accept current behavior), this test should still be added to document the expected behavior explicitly.

- **`status()` error code migration not explicitly tested**: The proposal doesn't include a test verifying that `status()` on a plan with missing `decisions.json` returns the new exit 25 rather than the old exit 15. This depends on whether `status()` is migrated to `readJsonOrThrow()` (see M-04).

- **External scripts depending on exit 15 for "plan not found"**: The breaking change is documented, but the verification step (target.md:36) relies on `rg` searches that may not cover all integration points (CI scripts, shell aliases, agent templates in other repos). Residual risk is low but non-zero.

- **"Otro (personalizado)" generation logic**: The proposal shows the output JSON with the "Otro" option appended but does not show the code that generates it. An implementer must infer that `questions()` should dynamically append this option for `allowCustom: true` fields. The risk is low (the intent is clear from the output example) but could be made explicit with a code snippet.
