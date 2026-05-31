# Review: pragmatic

## Summary

- Verdict: approve_with_changes
- Top risk: Crash recovery after `resetConfirmation()` mid-write produces a state where `questions()` incorrectly suggests `retry_resolve`, causing the agent to silently undo the reset.
- Confidence: high

## Findings

### P2-01: resetConfirmation crash recovery produces wrong suggestedAction

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: (target.md:240-244, 306-314)
- Claim: `questions()` returns `suggestedAction: "retry_resolve"` for `questions_pending + confirmed === true`, which is correct for the normal "confirmed-but-not-yet-resolved" flow but catastrophically wrong after a `resetConfirmation()` crash between steps 4 and 5.
- Evidence: Target §4 specifies write order: plan.json (step 4) before decisions.json (step 5). Target §2 (§questions behavior) maps `questions_pending + confirmed === true → suggestedAction: "retry_resolve"`. Template §6 (§suggest_reset flow) says for `retry_resolve`: "ejecutar resolve-questions. Si falla, entonces reset-confirmation." After a crash, plan.json is `questions_pending`, decisions.json still has `confirmed: true` with a valid hash. `resolveQuestions()` checks state (`questions_pending` is valid), checks confirmation (`true`), verifies hash (matches — decisions.json unchanged) — and **succeeds**, transitioning to `ready_for_html`. The reset is silently undone. The agent never reaches the fallback to `reset-confirmation` because resolve did not fail.
- Impact: An agent following `suggestedAction` after this crash will reverse the user's explicit reset request, returning the plan to `ready_for_html` with original decisions intact and mockup un-staled. The user's intent is lost without any error or warning.
- Recommendation: Either (a) have `questions()` inspect the last `history` entry — if it is `{ action: 'reset-confirmation', ... }`, return `suggestedAction: "suggest_reset"` instead of `"retry_resolve"` — or (b) change the template to always prefer `reset-confirmation` over `retry_resolve` when `suggestedAction` is `"retry_resolve"` and the last history entry is a reset. Option (a) is cleaner because it keeps the decision in the API.
- Suggested test: Create fixture: plan.json with `status: "questions_pending"` and history ending in `{ action: "reset-confirmation", from: "ready_for_html", to: "questions_pending" }`; decisions.json with `confirmed: true` and valid hash. Call `questions()`. Assert `suggestedAction === "suggest_reset"` (not `"retry_resolve"`).
- Dedup key: reset-crash-suggested-action

### P2-02: ensureV2Fields does not deep-merge partial confirmation objects

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: (target.md:98)
- Claim: `ensureV2Fields()` uses `decisions.confirmation = decisions.confirmation || { full skeleton }`, which is an all-or-nothing guard. A v1 plan with a partial confirmation object (e.g., `{ confirmed: false, confirmedAt: null, decisionsHash: "", hashAlgorithm: "sha256-decisions-v1" }` — missing `confirmedBy` and `source`) keeps the partial object as-is.
- Evidence: Target §1 shows the exact code: `decisions.confirmation = decisions.confirmation || { confirmed: false, confirmedAt: null, confirmedBy: null, source: "chat", decisionsHash: "", hashAlgorithm: "sha256-decisions-v2" }`. The `||` operator only triggers when `decisions.confirmation` is falsy. A v1 confirmation object is truthy, so the skeleton is never applied. Repo context §Current decisions.json shows v1 has `{ confirmed, confirmedAt, decisionsHash, hashAlgorithm }` — no `confirmedBy`, no `source`.
- Impact: `confirmedBy` is `undefined` (not `null`) on migrated v1 plans until the first `confirmDecisions()` call sets it. Any code that reads `confirmation.confirmedBy` and distinguishes `undefined` from `null` (e.g., `if (confirmedBy === null)` vs `if (!confirmedBy)`) could behave inconsistently. The test at target §11 specifies `resetConfirmation confirmedBy cleanup: confirmar + reset → confirmedBy === null`, which passes after a full confirm+reset cycle, but the v1 migration path is untested.
- Recommendation: Change `ensureV2Fields()` to deep-merge missing keys: iterate the skeleton's keys and set only the ones that are `undefined` in the existing object. For example: `const skeleton = { confirmed: false, ... }; decisions.confirmation = decisions.confirmation || {}; for (const [k, v] of Object.entries(skeleton)) { if (decisions.confirmation[k] === undefined) decisions.confirmation[k] = v; }`. This ensures every sub-key exists without overwriting present values.
- Suggested test: Fixture with `decisions.confirmation = { confirmed: false, hashAlgorithm: "sha256-decisions-v1" }` (missing `confirmedBy`, `source`, `confirmedAt`, `decisionsHash`). Call `answer('vertical', 'test')`. Read decisions.json from disk. Assert `confirmation.confirmedBy === null`, `confirmation.source === "chat"`, `confirmation.confirmedAt === null`, `confirmation.decisionsHash === ""`.
- Dedup key: ensurev2fields-partial-confirmation-merge

### P2-03: State notation "mockup:questions_pending" is ambiguous against stored format

- Severity: P2
- Category: docs
- Status: valid
- File: (target.md throughout)
- Lines: (target.md:236-244, 268, 299-300)
- Claim: The target uses `mockup:questions_pending` as a state identifier throughout, but repo context §Current plan.json shows `phase: "mockup"` and `status: "questions_pending"` as separate fields. The target never clarifies whether `mockup:questions_pending` is a single string or a shorthand for the two-field combination.
- Evidence: Repo context §Current plan.json Structure: `{ "phase": "mockup", "status": "questions_pending" }`. Target §3: "validar estado mockup:questions_pending (de plan.json)". Target §4: "Acepta estados mockup:questions_pending, mockup:ready_for_html o mockup:pending_approval". An implementer could read `status === 'mockup:questions_pending'` (literal) or `phase === 'mockup' && status === 'questions_pending'` (split). The repo confirms they are separate fields.
- Impact: If an implementer treats `mockup:questions_pending` as a literal value for `status`, every state check fails silently and all operations reject with `GSDC_INVALID_STATE`. This would break the entire flow.
- Recommendation: Add an explicit note to §1 or §Changes header: "State identifiers use `phase:status` notation. Implementation must check `plan.phase === 'mockup' && plan.status === '<status>'` (split form), not `plan.status === 'mockup:<status>'`." Also show one example of the actual check: `if (plan.phase !== 'mockup' || plan.status !== 'questions_pending') throw ...`.
- Suggested test: Not testable in document review — the test would be the implementation itself. The existing test plan implicitly covers this if tests pass, but the ambiguity could cause a false-start implementation.
- Dedup key: state-notation-ambiguity

### P3-01: answer() response omits optionalAnsweredStatus

- Severity: P3
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js, bin/gsd-canva.js
- Lines: (target.md:271-283)
- Claim: `questions()` returns `optionalAnsweredStatus` (e.g., `{ "assets": false }`) but `answer()` does not. After answering the last required field, the agent sees `optionalPendingCount: 1` but cannot tell whether assets was previously asked and declined (`optionalAnsweredStatus.assets === true, assets === ""`) or never asked (`false`).
- Evidence: Target §3 shows the `answer()` return JSON with `requiredPendingCount`, `optionalPendingCount`, `requiredFieldsComplete`, `allQuestionsAnswered` — no `optionalAnsweredStatus`. Target §2 shows `questions()` includes it. Template §6 says "Si requiredFieldsComplete === true Y optionalPendingCount > 0 → preguntar assets" — this works on first pass but after a reset+re-answer cycle, the agent cannot distinguish "declined again" from "never re-asked" without calling `questions()`.
- Impact: Minor UX degradation — agent may re-ask an already-declined optional question after reset. Workaround: call `questions()` after each `answer()` that sets `requiredFieldsComplete === true`, but this doubles CLI calls.
- Recommendation: Add `optionalAnsweredStatus` to the `answer()` return JSON. It is already computed internally (since `answer()` reads and writes `optionalAnswered`).
- Suggested test: Answer all required fields, then answer `assets` with `""`. Assert `optionalAnsweredStatus.assets === true` in the `answer()` return.
- Dedup key: answer-missing-optional-status

### P3-02: Human-readable output not specified for readOnly edge states

- Severity: P3
- Category: ux
- Status: valid
- File: bin/gsd-canva.js
- Lines: (target.md:333-348)
- Claim: Target §5 shows human-readable output for `plan questions` in normal flow (numbered questions with options). No format is specified for `readOnly: true` states, `suggestedAction` display, or `confirmed: true` scenarios in human mode.
- Evidence: Target §5 shows only the happy-path numbered list. Target §2 defines 5 different `suggestedAction` values and multiple `readOnly`+`confirmed` combinations, none with human-mode output examples.
- Impact: Implementer must improvise human-mode output for edge states. Could result in inconsistent UX across states or missing information (e.g., not showing `suggestedAction` in human mode).
- Recommendation: Add one example for `readOnly: true` human output, e.g.: `"Plan 001 is locked (confirmed). Suggestion: run 'gsd-canva plan reset-confirmation --id 001' to edit."`
- Suggested test: CLI test: `plan questions --id 001` after confirm → human output contains "locked" or "confirmed" and mentions "reset-confirmation".
- Dedup key: human-readable-read-only-format

### P3-03: resetConfirmation no-op condition may mask bugs

- Severity: P3
- Category: testing
- Status: valid
- File: lib/plan-manager.js
- Lines: (target.md:301)
- Claim: `resetConfirmation()` has a no-op path: "if (state === 'questions_pending' && confirmed !== true && !mockupExists) → no-op". This silently succeeds when called on an already-reset plan, which is correct for idempotency but makes it impossible to distinguish "nothing to reset" from "reset succeeded".
- Evidence: Target §4 defines the no-op condition. The return value is "confirmación + nuevo estado" but for no-op there is no explicit distinction. Target §11 test "No-op: questions_pending + confirmed=false + sin mockup" verifies it returns success without specifying how the response differs from an actual reset.
- Impact: An agent calling `resetConfirmation` twice cannot tell if the second call was a no-op. In theory this doesn't matter (state is correct), but for debugging it could be confusing. Also, the no-op does not push a history entry (since nothing changed), which is correct but undocumented.
- Recommendation: Include `"wasNoOp": true` in the return when the no-op path is taken, and document that no history entry is pushed. This gives the agent and tests a clear signal.
- Suggested test: Call `resetConfirmation()` on already-reset plan. Assert `wasNoOp === true` in return. Assert `plan.json` history length unchanged.
- Dedup key: reset-no-op-signal

## Non-Issues Checked

- **Hash v1→v2 migration path**: `confirmDecisions()` always computes v2 (7 fields), `resolveQuestions()` dispatches on stored `hashAlgorithm` label. After confirm, label and hash are always v2. Backward-compatible for existing v1 plans that skip re-confirm. Sound design.
- **Exit code migration (15 → 24/25)**: Pre-implementation grep step (`rg "exit.*15|GSDC_JSON_PARSE_ERROR"`) is specified. Post-impl verification step exists. Clean separation: 24 = directory missing, 25 = file missing within plan.
- **Placeholder detection `includes()` → `===`**: Breaking change is explicitly documented (target §Breaking Changes). The old behavior had a real bug ("Nodo" matching "TODO" via `includes`). Test plan covers edge cases (`"TODO: definir colores"` → not placeholder, `"TODO"` → placeholder). Intentional and correct.
- **`answer()` validation order (state before confirmation)**: Clearly specified and tested. `ready_for_html + confirmed=true → exit 13` (not 23). Prevents confusing error messages.
- **`FIELD_REGISTRY` as single source of truth**: Required fields, optional fields, choice options, and custom follow-ups all derived from one constant. `resetConfirmation()` iterates `OPTIONAL_FIELDS` (not hardcoded `assets`). Forward-looking test with dummy optional field.
- **Lock semantics**: `questions()`, `answer()`, `resetConfirmation()` all acquire lock before read, release in `finally`. Consistent with existing pattern.
- **`confirmDecisions()` rejects empty required fields**: `getEmptyFields(decisions, REQUIRED_FIELDS)` runs before hash computation. Exit 19 (`GSDC_QUESTIONS_UNRESOLVED`). API-level guard independent of template.
- **`answer()` choice validation**: Rejects numeric-only (`/^\d+$/`), literal "Otro (personalizado)", and non-matching values (when `!allowCustom`). Normalizes case-insensitive exact matches to canonical form. Well-specified with 3 distinct `reason` codes.
- **`resetConfirmation()` write ordering**: plan.json before decisions.json. Crash leaves a state where re-execution continues cleanly. Documented recovery path is valid.
- **"confirmo" parsing regex**: `/\b(confirmo|confirmado)\b/i` with negation check `/\bno\s+.*\b(confirmo|confirmado)\b/i`. Test plan covers "sí confirmo", "no confirmo", "confirmar" (rejected). Correct word-boundary usage.
- **Template §6 multi-field matching rules**: Semantic mapping, not positional. Guardrails for over-count (don't save anything) and under-count (save successful, ask rest). Uncertain mappings are skipped. Well-designed for agent consumption.
- **`questions()` includes `filled` array with actual values**: Even in `readOnly` mode, real data is returned. `readOnly` is the guard, not data masking. Correct.
- **`GSDC_MOCKUP_MISSING` rename**: No collision with existing codes (20 was `GSDC_ARTIFACT_MISSING`). Pre-impl grep + post-impl verification specified.

## Residual Risks

- **Concurrent lock contention**: If an agent polls `questions()` rapidly while another process calls `answer()`, lock contention could cause delays or `ELOCKED` errors. Not specified in the plan — current lock-manager behavior under contention is assumed sufficient. Not testable without load testing.
- **Malformed confirmation objects beyond ensureV2Fields() scope**: `ensureV2Fields()` handles `confirmation: undefined` and partial objects, but not `confirmation: "string"` or `confirmation: []`. These edge cases would cause `confirmation.confirmed` to be truthy (for non-empty string) or undefined (for array), potentially leading to unexpected behavior. Low probability — requires manual JSON editing.
- **External deletion of decisions.json between calls**: If `decisions.json` is deleted between `questions()` and `answer()`, `answer()` calls `readJsonOrThrow()` which would throw `GSDC_PLAN_ARTIFACT_MISSING` (25). The template handles this ("Detener flujo. Sugerir plan create"). Acceptable but not explicitly tested.
- **`NORMALIZE` only uses NFC**: Does not strip whitespace beyond `trim()`. Internal whitespace differences (e.g., `"SaaS  / Producto Digital"` with double space) would cause hash mismatch after confirm. This is by design (exact semantics) but could surprise users who manually edit JSON.
