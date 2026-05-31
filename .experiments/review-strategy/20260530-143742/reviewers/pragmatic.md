# Review: pragmatic

## Summary

- Verdict: reject_until_fixed
- Top risk: `computeDecisionsHash` normalize function is incompatible with existing v1 hashes — every v1 plan's hash verification would fail on resolve/submit after this code lands
- Confidence: high

## Findings

### P1-HASH-NORM: Hash normalize function breaks backward compatibility with v1 plans

- Severity: P1
- Category: integrity
- Status: valid
- File: target.md (Section 8, lines 426-432)
- Lines: 426-432
- Claim: The proposal defines `computeDecisionsHash` with `const normalize = (v) => String(v || '').trim().toLowerCase();` and dispatches on field count only (6 for v1, 7 for v2).
- Evidence: Current code at `lib/plan-manager.js:205` uses `const normalize = (val) => String(val || '').trim().normalize('NFC');` — case-sensitive with NFC normalization. The proposal's normalize drops NFC and adds `.toLowerCase()`. For any value with uppercase characters (e.g., `vertical: "Moda"`), the current code hashes `"Moda"` while the proposal's dispatch hashes `"moda"`. This means `resolveQuestions()` and `submitMockup()` would compute a different hash than what is stored in any existing v1 plan's `confirmation.decisionsHash`, producing a permanent `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (exit 21) for every v1 plan.
- Impact: All existing v1 plans become unverifiable. Verification step 14 ("Fixture v1.1 → resolve-questions + submit-mockup pasan con hash v1") is impossible with the specified function. Any implementer following the spec literally will break every existing plan at the hash check in `resolveQuestions()` (plan-manager.js:308) and `submitMockup()` (plan-manager.js:379).
- Recommendation: The dispatch function must use the exact same normalize for v1 as the current code: `(v) => String(v || '').trim().normalize('NFC')`. Only v2 should use the new normalize with `.toLowerCase()`. Alternatively, if the intent is to never verify v1 hashes through the new function (i.e., all v1 plans must be reset before re-use), this must be stated explicitly and the verification step 14 removed.
- Suggested test: Create a fixture with `hashAlgorithm: "sha256-decisions-v1"`, a known `decisionsHash` computed by the current code, and values with uppercase (e.g., `vertical: "Moda"`). Call `resolveQuestions()`. Assert hash matches. This test fails with the proposal's normalize.
- Dedup key: computeDecisionsHash-v1-normalize-incompatible

### P1-HASH-ALGO-SWAP: confirmDecisions v1→v2 algorithm swap creates mismatch on resolve

- Severity: P1
- Category: state
- Status: valid
- File: target.md (Section 8, lines 436-438)
- Lines: 436-438
- Claim: The proposal states all three functions (`confirmDecisions`, `resolveQuestions`, `submitMockup`) use `computeDecisionsHash(decisions, confirmation.hashAlgorithm)`, and `confirmDecisions()` siempre escribe `hashAlgorithm: 'sha256-decisions-v2'`.
- Evidence: For a v1 plan entering `confirmDecisions()`: (1) reads `hashAlgorithm: "sha256-decisions-v1"`, (2) computes hash with v1 dispatch (6 fields), (3) stores that v1 hash in `confirmation.decisionsHash`, (4) writes `hashAlgorithm: "sha256-decisions-v2"`. Then `resolveQuestions()` reads `hashAlgorithm: "sha256-decisions-v2"`, computes with v2 dispatch (7 fields including `assets: ""`), and compares — mismatch. The stored hash was computed over 6 fields; the verification hash is over 7 fields.
- Impact: First confirmation of any v1 plan produces a hash that immediately fails verification in `resolveQuestions()`. Even if the normalize issue above is fixed, the field-count mismatch between compute and verify would still break.
- Recommendation: Either (a) `confirmDecisions()` must compute the hash using v2 algorithm unconditionally (ignoring `confirmation.hashAlgorithm`), so compute and verify always align, or (b) `confirmDecisions()` must update `hashAlgorithm` to v2 in memory BEFORE computing the hash, then store both. Option (a) is simpler and consistent with "siempre escribe v2".
- Suggested test: Create v1 plan (hashAlgorithm: "sha256-decisions-v1"), call `confirmDecisions()`, then `resolveQuestions()`. Assert `resolveQuestions()` succeeds (no hash mismatch).
- Dedup key: confirmDecisions-v1-v2-algorithm-swap-mismatch

### P2-CLI-FALLBACK-EXIT: CLI error handler fallback exit codes not updated for new error codes

- Severity: P2
- Category: cli-contract
- Status: valid
- File: bin/gsd-canva.js
- Lines: 247, 263, 279, 413, 447
- Claim: The proposal introduces exit codes 22-25 but does not update the CLI `handleError()` fallback defaults in `bin/gsd-canva.js`.
- Evidence: At `bin/gsd-canva.js:451`, `plan status` handler uses `err.exitCode || 15`. At line 247, `plan confirm-decisions` uses `err.exitCode || 19`. After migration, `findPlanDirOrThrow()` throws exit 24 and `readJsonOrThrow()` throws exit 25. If any error path forgets to set `exitCode` on the thrown error object, the CLI falls back to the old default (15 or 19), producing misleading exit codes. The pre-implementation grep step (target line 36) audits `exit.*15` in files but does not address the CLI fallback logic.
- Impact: An implementer could introduce new functions that throw errors without `exitCode`, and the CLI would emit a stale exit code (15 or 19) instead of the intended one, making error handling by agents unreliable.
- Recommendation: Update CLI `handleError` calls for `plan status`, `plan confirm-decisions`, `plan resolve-questions`, and `plan submit-mockup` to use fallback exit codes matching the migration (e.g., `err.exitCode || 24` for plan-not-found scenarios, or a generic `err.exitCode || 1`). Alternatively, make `handleError` require `exitCode` with no default, forcing explicit specification.
- Suggested test: Throw a plain `new Error('test')` without `exitCode` from within a plan-manager function called by the CLI. Assert the CLI exits with a known fallback, not 15.
- Dedup key: cli-handleError-fallback-exit-code-stale

### P2-ANSWER-NO-CHOICE-VALIDATION: answer() accepts arbitrary values for choice fields without validation

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md (Section 3, lines 232-263)
- Lines: 240-261
- Claim: `answer(planId, field, value)` validates that `field` is in `ALL_FIELDS` but does not validate that `value` matches an option in `FIELD_REGISTRY` for choice-type fields.
- Evidence: Target line 241: "Valida que field esté en ALL_FIELDS" — only field name is validated. No mention of value validation against options. The template (Section 6) instructs the agent to match values, but the CLI itself does not enforce this.
- Impact: A human CLI user or buggy agent can store `"xyz"` as the value for `vertical`, which would pass `answer()`, show as "filled" in `questions()`, and only potentially cause confusion downstream. The data integrity check relies entirely on the agent layer, not the CLI.
- Recommendation: Add optional validation in `answer()` for choice-type fields: if the value doesn't match any option's `value` and doesn't appear to be a custom answer (i.e., no "Otro (personalizado)" selection was indicated), log a warning in human mode or include `warning: "value not in predefined options"` in JSON mode. Alternatively, document this as intentional (flexibility for custom answers) and add a `--force` flag for bypassing validation.
- Suggested test: `gsd-canva plan answer --id 001 --field vertical --value "INVALID_OPTION" --json` → succeeds but response includes a `warning` field, or fails with a new error code.
- Dedup key: answer-no-choice-value-validation

### P2-RESET-OPTIONAL-HARDCODE: resetConfirmation() hardcodes optional field cleanup instead of deriving from FIELD_REGISTRY

- Severity: P2
- Category: state
- Status: valid
- File: target.md (Section 4, lines 265-300)
- Lines: 283-284
- Claim: `resetConfirmation()` clears `optionalAnswered = {}` and sets `assets = ""` as hardcoded cleanup.
- Evidence: Target line 284: "y valores de campos opcionales a '' (ej: assets = '')". The parenthetical suggests `assets` is the only example, but the implementation instruction uses `assets = ""` literally. If a second optional field is added to `FIELD_REGISTRY` later, `resetConfirmation()` must be manually updated. Meanwhile, `optionalAnswered = {}` is correctly cleared generically. The asymmetry means a new optional field's value would survive reset while its `optionalAnswered` flag is cleared, causing `getEmptyFields()` to see it as pending but with a stale value — `questions()` would show it as pending but the old value remains in `decisions.json`.
- Impact: Adding a future optional field to `FIELD_REGISTRY` without updating `resetConfirmation()` creates a subtle state inconsistency after reset. The field appears pending but has a non-empty stale value that could confuse agents.
- Recommendation: Derive optional field reset from `FIELD_REGISTRY.filter(f => !f.required)` instead of hardcoding `assets`. Iterate and set each optional field to `""`.
- Suggested test: Add a hypothetical optional field to `FIELD_REGISTRY`, create a plan with that field set, run `resetConfirmation()`, assert the field's value is `""`.
- Dedup key: resetConfirmation-optional-field-hardcode

### P2-PLACEHOLDER-BEHAVIOR-CHANGE: Placeholder detection changes from `includes` to `===` without migration note

- Severity: P2
- Category: state
- Status: valid
- File: target.md (Section 1, lines 99-111) vs lib/plan-manager.js:184-194
- Lines: 108
- Claim: `getEmptyFields()` uses exact match (`===`) for placeholder detection, replacing the current `includes()` approach.
- Evidence: Current code at `plan-manager.js:190`: `placeholders.some(p => val.toUpperCase().includes(p))`. Proposal at target line 108: `placeholders.some(p => upper === p)`. This changes behavior for values containing placeholders as substrings, e.g., `"TODO: definir colores"` was a placeholder (includes "TODO") but now is not (!== "TODO"). Verification step 20 only tests `"Nodo"` and `"TODO"` as exact matches — it does not test `"TODO: something"`.
- Impact: Existing plans with values like `"PENDIENTE DE REVISIÓN"` or `"TODO: definir"` would change from "empty/placeholder" to "filled". Plans that previously could not pass `confirmDecisions()` (due to placeholder detection) would now pass. This is a behavior change that could allow low-quality data through confirmation.
- Recommendation: Document this as an intentional breaking change in the Breaking Changes section. Add a test case: `"TODO: definir colores"` → not a placeholder (new behavior). Consider whether a migration step should clear such values in existing plans.
- Suggested test: Assert `"TODO: definir colores"` is NOT detected as placeholder by `getEmptyFields()`. Assert `"TODO"` IS detected.
- Dedup key: placeholder-detection-includes-to-exact

### P3-ENSURE-V2-SCOPE: ensureV2Fields() not called in confirmDecisions() or resolveQuestions()

- Severity: P3
- Category: state
- Status: valid
- File: target.md (Section 1, line 91)
- Lines: 91
- Claim: `ensureV2Fields()` is called only in `questions()`, `answer()`, and `resetConfirmation()`.
- Evidence: Target line 91: "Llamado al inicio de questions(), answer(), y resetConfirmation() antes de cualquier operación." The functions `confirmDecisions()` and `resolveQuestions()` are not listed. If an old v1.1 plan bypasses the new functions and goes directly to confirm (e.g., an agent manually populates decisions.json then calls confirm-decisions), `decisions.assets` is `undefined`.
- Impact: `computeDecisionsHash` handles `undefined` gracefully (`String(undefined || '')` → `""`), so the hash computation is correct. However, `confirmDecisions()` iterates over `REQUIRED_FIELDS` (which excludes `assets`), so the undefined field is never checked. This is functionally safe but creates an unclear contract — two code paths exist for reaching confirm: one with `ensureV2Fields` (via questions/answer) and one without (direct confirm).
- Recommendation: Either call `ensureV2Fields()` at the top of `confirmDecisions()` and `resolveQuestions()` for consistency, or document that the direct-confirm path is unsupported and agents must always go through `questions()`/`answer()` first.
- Suggested test: Create a v1.1 fixture (no `assets`, no `optionalAnswered`), call `confirmDecisions()` directly. Assert it succeeds and the hash includes `assets: ""`.
- Dedup key: ensureV2Fields-not-in-confirm-resolve

### P3-QUESTIONS-READONLY-STATUS: questions() read-only response does not specify status field value

- Severity: P3
- Category: cli-contract
- Status: valid
- File: target.md (Section 2, lines 222-229)
- Lines: 227-228
- Claim: For plans in post-`questions_pending` states, `questions()` returns `readOnly: true` with all fields as filled. The JSON example (lines 127-220) shows `status: "questions_pending"`, but no example is given for the read-only case.
- Evidence: Target line 227: "retorna snapshot read-only con readOnly: true, filled con todos los campos, pending: []". The `status` field in the response is unspecified for read-only. An agent consuming this JSON would not know whether to check `status` or `readOnly` as the primary indicator.
- Impact: Agents parsing the response may misinterpret the `status` field in read-only mode. If `status` reflects the actual plan state (e.g., `"ready_for_html"`), it differs from the example. If it always returns `"questions_pending"`, it's misleading for read-only plans.
- Recommendation: Add a JSON example for the read-only case. Specify that `status` returns the actual plan state from `plan.json`, not a fixed value.
- Suggested test: Call `questions()` on a plan in `ready_for_html`. Assert `status === "ready_for_html"` and `readOnly === true`.
- Dedup key: questions-readonly-status-field-unspecified

### P3-NO-CONCURRENT-TEST: No test coverage for concurrent access or lock contention

- Severity: P3
- Category: testing
- Status: valid
- File: target.md (Section 11, lines 448-502)
- Lines: 501
- Claim: The test plan includes a test for lock release after `questions()` (line 501) but no test for concurrent access scenarios.
- Evidence: The proposal adds three new lock-acquiring functions (`questions`, `answer`, `resetConfirmation`) alongside six existing ones. The lock manager is file-based (`lib/lock-manager.js`). No test verifies behavior when two operations contend for the same lock (e.g., two agents calling `answer()` simultaneously).
- Impact: If the lock manager has edge cases (timeout, stale lock files), they would only surface in production under concurrent use. The single lock-release test only verifies the happy path.
- Recommendation: Add at least one test: two concurrent `answer()` calls on the same plan, verify both succeed sequentially and the final state reflects both writes.
- Suggested test: `Promise.all([answer(planId, 'vertical', 'SaaS'), answer(planId, 'formato', 'Instagram')])` → both succeed, final `decisions.json` has both fields set.
- Dedup key: no-concurrent-access-test

## Non-Issues Checked

- **Double-wrap in JSON output**: The proposal correctly specifies raw data from manager functions, wrapped once by `handleSuccess()` in `bin/gsd-canva.js:39`. Verification step 15 explicitly tests this. OK.
- **"Nodo" placeholder false positive**: The proposal correctly fixes this with `===` comparison (target line 108). Verification step 20 tests it. OK.
- **Lock ordering**: All functions acquire the same single global lock. No nested locks, no deadlock risk. OK.
- **`answer()` empty string for required fields**: Intentionally allowed — validation happens at `confirmDecisions()` time via `getEmptyFields()`. This is correct layered validation. OK.
- **`confirmDecisions()` state check**: Current code already validates state is `mockup:questions_pending` (plan-manager.js:174). Proposal maintains this. OK.
- **`resetConfirmation()` partial failure recovery**: The proposal documents three failure modes and recovery paths (target lines 291-294). Each is diagnosable and re-executable. OK.
- **History deduplication in reset**: Only deduplicates consecutive identical `reset-confirmation` entries with same `from`. Normal sequences (reset, confirm, reset) would produce distinct entries. OK.
- **`create()` initializes v2**: New plans get `hashAlgorithm: "sha256-decisions-v2"` and `assets: ""` (target lines 407-422). OK.
- **"confirmo" exact parsing**: The template specifies case-insensitive, trimmed, no additional text (target lines 392-393). The "reject if additional text" rule prevents accidental confirmation. OK.

## Residual Risks

- The two P1 findings (hash normalize + algorithm swap) are interdependent: fixing one without the other still breaks v1 compatibility. Both must be addressed together. The simplest fix is to make `confirmDecisions()` always compute with v2 normalize and v2 field list, and make the dispatch function use the OLD normalize for v1 verification only.
- The exit code migration (15→24, 15→25) across all existing functions is a broad change. Even with the pre-implementation grep step, the risk of missing a reference (especially in documentation, agent templates, or external scripts) is non-trivial. The proposal should consider a deprecation period where both old and new exit codes are documented.
- The proposal does not address whether `plan.json` history entries from `answer()` are needed. Currently `answer()` does not write to `plan.json` (target line 243). If audit requirements change, this would need a separate proposal.
- `FIELD_REGISTRY` is defined at module level in `plan-manager.js`. If this module is loaded in a test environment with different plans, the registry is shared. This is not a problem currently but could affect test isolation if tests modify the registry.
