# Review Consolidado: docs/PROPOSAL_v1.2_interactive_questions.md

## Meta

- Target: docs/PROPOSAL_v1.2_interactive_questions.md
- Estrategia: 2 — Default recomendado
- Reviewers: pragmatic, operator, modeler, agent-ux
- Fecha: 20260530-143742

## Summary

- Verdict: reject_until_fixed
- Top risk: Hash migration v1→v2 breaks all existing v1 plans — `confirmDecisions()` computes a v1 hash then labels it v2, and `resolveQuestions()`/`submitMockup()` recompute with v2 fields producing a permanent mismatch
- Confidence: high

## Findings

### C-01: Hash normalize function breaks backward compatibility with v1 plans

- Severity: P1
- Category: integrity
- Status: valid
- File: target.md (Section 8)
- Lines: 426-432
- Claim: `computeDecisionsHash` uses `toLowerCase()` + no NFC normalization, while the current code uses case-sensitive `NFC` normalization. Any v1 plan with uppercase values produces a different hash.
- Evidence: Current `plan-manager.js:205` uses `(val) => String(val || '').trim().normalize('NFC')`. Proposal uses `(v) => String(v || '').trim().toLowerCase()`. For `vertical: "Moda"`, current hashes `"Moda"`, proposal hashes `"moda"`. All v1 plans with uppercase values fail `resolveQuestions()` and `submitMockup()` with exit 21.
- Impact: Every existing v1 plan becomes unverifiable. Verification step 14 is impossible with the specified function.
- Recommendation: Use the exact same normalize for v1 dispatch as current code: `(v) => String(v || '').trim().normalize('NFC')`. Only v2 should use the new normalize. Or explicitly state v1 plans must be reset and remove verification step 14.
- Suggested test: Create v1 fixture with known `decisionsHash` (computed by current code) and `vertical: "Moda"`. Call `resolveQuestions()`. Assert hash matches (will fail with proposal's normalize).
- Dedup key: computeDecisionsHash-v1-normalize-incompatible
- Sources: pragmatic:P1-HASH-NORM

### C-02: confirmDecisions v1→v2 algorithm swap creates hash mismatch on resolve

- Severity: P1
- Category: state
- Status: valid
- File: target.md (Section 8)
- Lines: 436-438
- Claim: `confirmDecisions()` reads v1 algorithm, computes 6-field hash, stores it, then writes `hashAlgorithm: 'sha256-decisions-v2'`. Next `resolveQuestions()` reads v2 label and computes 7-field hash — guaranteed mismatch.
- Evidence: Target line 438: "confirmDecisions() siempre escribe hashAlgorithm: 'sha256-decisions-v2'". For v1 plan: compute over 6 fields → store H_6field → label v2 → resolve computes over 7 fields → H_7field ≠ H_6field → exit 21. The migration path "la primera re-confirmación migra automáticamente" (line 38) is broken.
- Impact: All v1 plans that go through `confirmDecisions()` immediately fail at `resolveQuestions()`. The mockup flow is blocked for every pre-v1.2 plan.
- Recommendation: `confirmDecisions()` must compute with v2 unconditionally (ignore incoming `hashAlgorithm`), so stored hash and label always align. This makes migration atomic.
- Suggested test: Create v1 plan (hashAlgorithm: "sha256-decisions-v1"), call `confirmDecisions()`, then `resolveQuestions()`. Assert success, `hashAlgorithm === 'sha256-decisions-v2'`.
- Dedup key: confirmDecisions-v1-v2-algorithm-swap-mismatch
- Sources: pragmatic:P1-HASH-ALGO-SWAP, modeler:M-01

### C-03: answer() accepts arbitrary values for choice fields without validation

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md (Section 3)
- Lines: 241
- Claim: `answer()` validates `field` is in `ALL_FIELDS` but never validates `value` against `FIELD_REGISTRY` options for choice-type fields. Invalid data enters the state machine silently.
- Evidence: Line 241 only mentions field-name validation. Three independent reviewers confirmed the gap. Values like `"foobar"` for `vertical` pass through, set `requiredFieldsComplete: true`, and get hashed. Template-level prohibition (line 362) has no programmatic backstop.
- Impact: Invalid choice values get saved to `decisions.json`, included in hash, used for mockup generation. No programmatic recovery path.
- Recommendation: Add validation in `answer()`: for `type: 'choice'` fields, validate `value` matches an option or field has `allowCustom: true`. Reject with new error code (e.g., `GSDC_INVALID_CHOICE_VALUE`, exit 26) listing valid options.
- Suggested test: `answer(planId, 'vertical', 'INVALID_OPTION')` → exit 26. `answer(planId, 'vertical', 'SaaS / Producto Digital')` → success. `answer(planId, 'vertical', 'My Custom')` → success if `allowCustom`.
- Dedup key: answer-no-choice-value-validation
- Sources: pragmatic:P2-ANSWER-NO-CHOICE-VALIDATION, operator:OP-01, agent-ux:AGENT-UX-03

### C-04: resetConfirmation() hardcodes optional field cleanup instead of deriving from FIELD_REGISTRY

- Severity: P2
- Category: state
- Status: valid
- File: target.md (Section 4)
- Lines: 282-284
- Claim: `resetConfirmation()` clears `optionalAnswered = {}` generically but sets `assets = ""` as a hardcoded literal. Future optional fields would not be cleared.
- Evidence: Target line 284: "valores de campos opcionales a '' (ej: assets = '')" — parenthetical implies `assets` is the only case. If a second optional field is added, `resetConfirmation()` must be manually updated. Asymmetry: `optionalAnswered` cleared generically, field values cleared specifically.
- Impact: New optional field added to `FIELD_REGISTRY` without updating `resetConfirmation()` → `optionalAnswered` cleared but stale value persists → `questions()` shows field as pending but `decisions.json` has old value. Subtle state inconsistency.
- Recommendation: Derive optional field reset from `FIELD_REGISTRY.filter(f => !f.required)` and iterate: `for (const f of optionalFields) { decisions[f.id] = ""; }`.
- Suggested test: Add test-only optional field to `FIELD_REGISTRY`, create plan with field set, run `resetConfirmation()`, assert field value is `""`.
- Dedup key: resetConfirmation-optional-field-hardcode
- Sources: pragmatic:P2-RESET-OPTIONAL-HARDCODE, modeler:M-04

### C-05: CLI handleError fallback exit codes not updated for new error codes

- Severity: P2
- Category: cli-contract
- Status: valid
- File: bin/gsd-canva.js
- Lines: 247, 263, 279, 413, 447, 451
- Claim: The proposal introduces exit codes 22-25 but CLI `handleError()` calls use stale fallback defaults (e.g., `err.exitCode || 15` at line 451, `err.exitCode || 19` at line 247).
- Evidence: After migration, `findPlanDirOrThrow()` throws exit 24, `readJsonOrThrow()` throws exit 25. If any error path forgets `exitCode` on the thrown error, CLI falls back to old codes (15 or 19), producing misleading exit codes. Pre-implementation grep step (target line 36) audits `exit.*15` but doesn't address fallback logic.
- Impact: Agents relying on exit codes for error handling receive wrong codes when `exitCode` is missing from error objects. Diagnosability degrades.
- Recommendation: Update CLI `handleError` fallbacks to use `err.exitCode || 1` (generic) or match migrated codes. Alternatively, require `exitCode` with no default.
- Suggested test: Throw `new Error('test')` without `exitCode` from plan-manager. Assert CLI exits with known fallback, not 15.
- Dedup key: cli-handleError-fallback-exit-code-stale
- Sources: pragmatic:P2-CLI-FALLBACK-EXIT

### C-06: Placeholder detection changes from `includes` to `===` without documented breaking change

- Severity: P2
- Category: state
- Status: valid
- File: target.md (Section 1)
- Lines: 108
- Claim: `getEmptyFields()` uses exact match (`===`) replacing current `includes()`. Values like `"PENDIENTE DE REVISIÓN"` or `"TODO: definir"` change from "placeholder" to "filled".
- Evidence: Current `plan-manager.js:190` uses `includes()`. Proposal line 108 uses `===`. Verification step 20 only tests exact `"TODO"` and `"Nodo"`, not substring cases. Plans with `"PENDIENTE DE REVISIÓN"` that previously couldn't confirm would now pass.
- Impact: Silent behavior change allows low-quality placeholder data through confirmation. Existing plans may change state unexpectedly.
- Recommendation: Document as intentional breaking change in Breaking Changes section. Add test: `"TODO: definir colores"` → not placeholder (new behavior).
- Suggested test: Assert `"TODO: definir colores"` is NOT detected as placeholder. Assert `"TODO"` IS detected.
- Dedup key: placeholder-detection-includes-to-exact
- Sources: pragmatic:P2-PLACEHOLDER-BEHAVIOR-CHANGE

### C-07: questions() omits confirmed flag when plan is in questions_pending with confirmed=true

- Severity: P2
- Category: state
- Status: valid
- File: target.md (Section 2)
- Lines: 222-228
- Claim: After `confirmDecisions()` succeeds but before `resolveQuestions()` transitions state, the plan is `questions_pending` + `confirmed=true`. `questions()` returns normal interactive output with no indication answers are locked.
- Evidence: Line 226: "Plan en mockup:questions_pending → flujo normal con pending/filled" — no check on `confirmed`. Meanwhile `answer()` validates `confirmed !== true` and fails with exit 23. Agent renders pending questions, user tries to answer, gets confusing exit 23.
- Impact: `questions()` output promises interactivity that `answer()` denies. Violates the contract that `questions()` response reflects what operations are possible.
- Recommendation: Add `confirmed: true` flag to `questions()` output when `confirmation.confirmed === true`, or treat this state as `readOnly: true` with `reason: "awaiting resolve"`.
- Suggested test: Create plan in `questions_pending` with `confirmed: true`. Call `questions()`. Assert output includes `confirmed: true` or `readOnly: true`.
- Dedup key: questions-omits-confirmed-flag-in-pending-state
- Sources: modeler:M-02

### C-08: requiredFieldsComplete transition skips optional assets question

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (template section 2)
- Lines: 364-370
- Claim: The template instructs agents to check `requiredFieldsComplete` after every `plan answer` and advance to confirmation when true. This causes agents to skip the optional assets question.
- Evidence: Line 370: "Si `requiredFieldsComplete === true`, avanza al paso de Revisión/Confirmación." Line 364 specifies the assets question. When the 6th required field is answered, agent jumps to confirmation without asking about assets. The imperative "después de cada plan answer" overrides the document ordering.
- Impact: Users never get asked about assets (logos, fonts). `optionalPendingCount` remains 1 but agent has moved past the question phase.
- Recommendation: Change transition logic to: advance only when `requiredFieldsComplete === true AND optionalPendingCount === 0`. Or restructure: (1) ask required, (2) ask optional, (3) confirm.
- Suggested test: Answer all 6 required fields. Verify agent does NOT advance to confirmation until assets question is handled.
- Dedup key: requiredFieldsComplete-skips-optional-assets
- Sources: agent-ux:AGENT-UX-01

### C-09: Multi-field response parsing underspecified for agent implementation

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (template section 2)
- Lines: 361
- Claim: "extrae cada par campo-valor y ejecuta plan answer para cada uno" is insufficient — no rules for count mismatch, ambiguity definition, or partial-save behavior.
- Evidence: Input "SaaS, Instagram Post, jóvenes" with 4 pending fields: agent must guess which 3 fields these map to. No rule for positional vs semantic matching, partial saves, or ambiguity resolution. Different agents will parse differently.
- Impact: Inconsistent behavior across sessions and agent implementations. Some save partial state before clarification.
- Recommendation: Specify: (1) map by semantic match to field question/option, not position; (2) if count mismatches, save nothing and ask; (3) if any mapping is uncertain, skip and ask; (4) save fields one at a time so partial state is acceptable per field.
- Suggested test: Template review — verify identical behavior across implementations for: "SaaS, Instagram Post" (2 of 6 pending), "restaurante, azul" (2 ambiguous), "SaaS" (1 clear).
- Dedup key: multi-field-parsing-underspecified
- Sources: agent-ux:AGENT-UX-02

### C-10: reset-confirmation errors have no retry guidance in agent template

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (sections 4 and 6)
- Lines: 291-294, 372-382
- Claim: Partial failure recovery paths for `resetConfirmation()` are documented (lines 291-294) but the agent error-handling table (lines 373-382) has no row for `reset-confirmation` errors.
- Evidence: Recovery is idempotent by design — re-execution converges. But the agent template provides no instruction to retry. If `resetConfirmation()` crashes mid-execution (EPERM, disk full), agent receives unhandled error and reports failure instead of retrying.
- Impact: Transient failure leaves plan in recoverable intermediate state, but agent doesn't retry. User sees failure and may create a new plan unnecessarily.
- Recommendation: Add row to error table: "| `reset-confirmation` any error | Retry once. If retry fails, run `plan status` and report state with note of possible intermediate state. |"
- Suggested test: Simulate `resetConfirmation()` failure after step 4. Agent should retry. Verify second call succeeds.
- Dedup key: reset-confirmation-no-retry-guidance
- Sources: agent-ux:AGENT-UX-04

### C-11: ensureV2Fields() not called in confirmDecisions() or resolveQuestions()

- Severity: P2
- Category: state
- Status: valid
- File: target.md (Section 1)
- Lines: 91, 114, 438
- Claim: `ensureV2Fields()` is called only in `questions()`, `answer()`, `resetConfirmation()`. But `confirmDecisions()` uses `getEmptyFields()` (reads `optionalAnswered`) and writes `hashAlgorithm: 'sha256-decisions-v2'`. A v1 plan reaching `confirmDecisions()` directly gets labeled v2 without v2 fields.
- Evidence: Line 91 enumerates three functions. `confirmDecisions()` and `resolveQuestions()` not listed. A v1 plan via legacy agent path (no `questions()`/`answer()`) reaches `confirmDecisions()` with no `assets` or `optionalAnswered`. Stored `decisions.json` is structurally inconsistent — labeled v2 without v2 fields.
- Impact: Future code reading these fields directly (without `ensureV2Fields()`) may throw `TypeError` or produce wrong results. Hash computation is safe (normalizes `undefined → ""`), but structural inconsistency creates latent risk.
- Recommendation: Add `ensureV2Fields()` to start of `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`, and `status()`. Or move into shared read path so it cannot be skipped.
- Suggested test: Create v1 fixture (no `assets`, no `optionalAnswered`). Call `confirmDecisions()` directly. Assert `decisions.json` now contains `assets: ""` and `optionalAnswered: {}`.
- Dedup key: ensureV2Fields-not-in-confirm-resolve
- Sources: pragmatic:P3-ENSURE-V2-SCOPE, modeler:M-03

### C-12: questions() read-only response does not specify status field value

- Severity: P3
- Category: cli-contract
- Status: valid
- File: target.md (Section 2)
- Lines: 227-228
- Claim: For read-only plans, `status` field in JSON response is unspecified. The only JSON example shows `status: "questions_pending"`.
- Evidence: Line 227: "retorna snapshot read-only con readOnly: true, filled con todos los campos, pending: []". No example for read-only case. Agents cannot determine whether `status` reflects actual plan state or is fixed.
- Impact: Agents may misinterpret `status` in read-only mode or rely on wrong field as primary indicator.
- Recommendation: Add JSON example for read-only case. Specify that `status` returns the actual plan state from `plan.json`.
- Suggested test: Call `questions()` on plan in `ready_for_html`. Assert `status === "ready_for_html"` and `readOnly === true`.
- Dedup key: questions-readonly-status-field-unspecified
- Sources: pragmatic:P3-QUESTIONS-READONLY-STATUS

### C-13: No test coverage for concurrent access or lock contention

- Severity: P3
- Category: testing
- Status: valid
- File: target.md (Section 11)
- Lines: 501
- Claim: Test plan includes lock-release test for `questions()` only. No test for concurrent access (two agents calling `answer()` simultaneously).
- Evidence: Three new lock-acquiring functions added to six existing ones. Lock manager is file-based. No contention test.
- Impact: Edge cases (timeout, stale lock files) only surface in production under concurrent use.
- Recommendation: Add test: two concurrent `answer()` calls on same plan, verify both succeed sequentially and final state reflects both writes.
- Suggested test: `Promise.all([answer(planId, 'vertical', 'SaaS'), answer(planId, 'formato', 'Instagram')])` → both succeed, `decisions.json` has both fields.
- Dedup key: no-concurrent-access-test
- Sources: pragmatic:P3-NO-CONCURRENT-TEST

### C-14: resetConfirmation() recovery re-execution produces near-duplicate history entries

- Severity: P3
- Category: state
- Status: valid
- File: target.md (Section 4)
- Lines: 283-293
- Claim: After crash between step 5 and step 6, re-execution produces a second history entry with `from: 'questions_pending'` (current state), different from original `from: 'ready_for_html'`. Dedup key `(action, from)` doesn't match.
- Impact: Audit trail has confusing double-entry. Not a correctness issue but degrades forensic value.
- Recommendation: Broaden dedup key to `(action)` only when target is `questions_pending`, or document as expected behavior.
- Suggested test: Simulate crash after step 5, re-execute, assert history length.
- Dedup key: reset-recovery-duplicate-history
- Sources: operator:OP-02

### C-15: questions() calls ensureV2Fields() but never persists v1→v2 migration

- Severity: P3
- Category: state
- Status: valid
- File: target.md (Section 2)
- Lines: 91, 230
- Claim: `questions()` is read-only and calls `ensureV2Fields()` in-memory, but never writes back to disk. Repeated `questions()` calls on a v1.1 plan never upgrade `decisions.json`.
- Impact: Not a correctness bug — next `answer()` or `resetConfirmation()` persists migration. But raw file inspection shows v1.1 format, contradicting in-memory state. Confuses manual debugging.
- Recommendation: Document that `questions()` intentionally does not persist migration. (Simplest option.)
- Suggested test: Create v1.1 fixture, call `questions()` twice, assert `decisions.json` on disk still lacks `optionalAnswered`.
- Dedup key: questions-v2-migration-not-persisted
- Sources: operator:OP-03

### C-16: No warning when empty string saved for required choice field via "Otro"

- Severity: P3
- Category: state
- Status: valid
- File: target.md (Section 3)
- Lines: 89, 152, 241-257
- Claim: "Otro (personalizado)" has `value: ""`. If agent selects "Otro" but doesn't follow up with custom text and passes `""` to `answer()`, the write succeeds silently. `requiredFieldsComplete` stays false (natural safeguard), but agent gets no warning the value was discarded.
- Impact: Agent may believe field was answered and skip re-asking. Low severity because `requiredFieldsComplete` gate prevents progression.
- Recommendation: In `answer()`, if field is `type: 'choice'`, `required: true`, and value is `""`, return warning flag `"warning": "empty_value_for_required_choice"` without failing.
- Suggested test: `answer(planId, 'vertical', '')` → success with warning flag, `requiredFieldsComplete: false`.
- Dedup key: otro-empty-value-no-guard
- Sources: operator:OP-04

### C-17: ensureV2Fields() executes before state validation in answer()

- Severity: P3
- Category: state
- Status: valid
- File: target.md (Section 3)
- Lines: 242
- Claim: Operation order is: lock → read → `ensureV2Fields()` → validate state. If state is wrong (e.g., `ready_for_html`), normalization mutates in-memory before rejection. Mutation is discarded (not persisted), but violates "validate early, transform late."
- Impact: No functional impact. Could mislead implementers into thinking normalization is part of validation.
- Recommendation: Reorder to: lock → read → validate state → `ensureV2Fields()` → validate confirmed → write.
- Suggested test: Call `answer()` on plan in `ready_for_html`. Verify `decisions.json` on disk is untouched.
- Dedup key: ensurev2fields-before-state-validation
- Sources: operator:OP-05

### C-18: requiredFieldsComplete naming invites auto-proceed misinterpretation

- Severity: P3
- Category: docs
- Status: valid
- File: target.md (Section 1)
- Lines: 117, 370
- Claim: Name `requiredFieldsComplete` reads as "proceed." Spec explicitly says "NO es permiso para auto-confirmar" (line 117) but the name doesn't encode this constraint.
- Evidence: An implementer reading only JSON output may miss the note and treat the flag as a green light to auto-trigger `confirm-decisions`.
- Impact: Future agent template could auto-confirm without review summary, violating explicit confirmation gate.
- Recommendation: Rename to `readyForReview` or use counter directly. If keeping name, add annotation to JSON examples.
- Suggested test: Grep implementation for `requiredFieldsComplete` — verify it only appears in output and template routing to review step, never in a conditional calling `confirm-decisions`.
- Dedup key: requiredfieldscomplete-naming-auto-proceed-risk
- Sources: modeler:M-05

### C-19: Error codes 20 vs 25 share "file missing" semantics with unclear boundary

- Severity: P3
- Category: cli-contract
- Status: valid
- File: target.md
- Lines: 510-519
- Claim: `GSDC_ARTIFACT_MISSING` (20) = mockup.html absent. `GSDC_PLAN_ARTIFACT_MISSING` (25) = any file absent in plan. Both mean "file missing in plan dir" but have different codes. Agents handling errors generically treat both the same but recovery differs.
- Impact: Agent gives wrong recovery advice (e.g., "re-create plan" for mockup missing, or "generate mockup" for corrupt plan).
- Recommendation: Rename exit 20 to `GSDC_MOCKUP_ARTIFACT_MISSING` to make boundary explicit.
- Suggested test: Assert error message for exit 20 contains "mockup" and exit 25 contains "plan artifact". Assert no function uses both for same condition.
- Dedup key: error-code-20-25-semantic-overlap
- Sources: modeler:M-06

### C-20: Fuzzy matching algorithm for choice fields is unspecified

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (template section 2)
- Lines: 362
- Claim: "Muestra las opciones más cercanas" is undefined. Could mean substring match, Levenshtein, token overlap, or re-show all. Fallback "o la lista completa" makes preference unclear.
- Impact: Inconsistent agent behavior. One shows single close match, another shows full list. Both comply.
- Recommendation: Specify concrete strategy: "If input is case-insensitive substring of exactly one option, show that option. Otherwise, show full numbered list."
- Suggested test: Input "comprar" → single match "Comprar Ahora?". Input "instagram" matching 2 options → full list.
- Dedup key: fuzzy-matching-unspecified
- Sources: agent-ux:AGENT-UX-05

### C-21: "confirmo" parsing rejects natural trailing punctuation

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (template section 2)
- Lines: 392
- Claim: Strict "confirmo"-only rule rejects "confirmo." and "confirmo!" which users commonly type, especially in Spanish.
- Impact: Minor frustration. Users must make second attempt to confirm. Reduces trust.
- Recommendation: Strip trailing `.`, `!`, `,` before exact-match check.
- Suggested test: "confirmo." → accepted. "confirmo!" → accepted. "confirmo, gracias" → rejected with prompt.
- Dedup key: confirmo-trailing-punctuation-rejection
- Sources: agent-ux:AGENT-UX-06

### C-22: No catch-all error instruction for unexpected exit codes

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (template section 2)
- Lines: 372-382
- Claim: Error table covers 7 specific exit codes. No instruction for unlisted codes (exit 1, 126, SIGTERM, etc.).
- Impact: Agent behavior undefined for unexpected errors (out-of-disk, permission changes, corrupted modules).
- Recommendation: Add catch-all row: "| Cualquier otro código | Detener flujo. Reportar error completo. Sugerir `plan status`. |"
- Suggested test: Simulate `plan answer` returning exit 1 with stderr "EACCES: permission denied". Agent should stop, report, suggest `plan status`.
- Dedup key: no-catch-all-error-handling
- Sources: agent-ux:AGENT-UX-07

### C-23: No programmatic guard against saving literal "Otro" or index as value

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (sections 2 and 3)
- Lines: 241, 363
- Claim: Template prohibits saving "Otro" or numeric indices (line 363), but `answer()` has no validation. Agent that skips `customFollowUp` flow can save `vertical: "Otro"` or `vertical: "3"`.
- Impact: Semantically meaningless values entered into state machine. Only recoverable via `reset-confirmation`.
- Recommendation: If C-03 (choice validation) is accepted, this is largely mitigated. Otherwise, add specific check rejecting "Otro (personalizado)" and pure numeric strings for choice fields.
- Suggested test: `answer(planId, 'vertical', 'Otro (personalizado)')` → rejected. `answer(planId, 'vertical', '3')` → rejected. `answer(planId, 'vertical', 'Mi Vertical')` → accepted.
- Dedup key: otro-literal-no-programmatic-guard
- Sources: agent-ux:AGENT-UX-08

## Non-Issues Checked

- **Double-wrap in JSON output**: Raw data from manager, wrapped once by `handleSuccess()`. Verification step 15 tests. OK.
- **"Nodo" placeholder false positive**: Fixed by `===` comparison. Verification step 20 tests. OK.
- **Lock ordering**: All functions use single global lock. No nested locks, no deadlock. OK.
- **`answer()` empty string for required fields**: Intentionally allowed — validation at `confirmDecisions()` time. Layered validation correct. OK.
- **`confirmDecisions()` state check**: Already validates `mockup:questions_pending`. Maintained. OK.
- **`resetConfirmation()` partial failure recovery**: Three failure modes documented and diagnosable. Re-executable. OK.
- **History deduplication in reset**: Deduplicates consecutive identical entries. Normal sequences produce distinct entries. OK.
- **`create()` v2 initialization**: New plans get `hashAlgorithm: "sha256-decisions-v2"` and `assets: ""`. OK.
- **"confirmo" case-insensitivity**: Explicitly handled. OK.
- **`optionalAnswered` semantics**: Set `true` for any response (empty or not). Name precise. `getEmptyFields()` correctly excludes. OK.
- **State machine completeness**: All transitions well-defined. No unreachable states. OK.
- **`questions()` never throws `GSDC_INVALID_STATE`**: Returns `readOnly: true` for post-`questions_pending`. Consistent. OK.
- **`answer()` not updating `plan.json`**: By design. Audit trail in `decisions.json`. OK.
- **Exit code migration three-way split**: 24=dir missing, 25=file missing, 15=corrupt JSON. Improves diagnostics. OK.
- **`writeAtomicJson` atomicity**: Write-temp-then-rename pattern. Acceptable for local CLI. OK.
- **Context extraction fallback**: "Ante duda, no guardes" is conservative and safe. OK.
- **Error table note about `questions()` not throwing exit 13**: Explicitly clarified. OK.
- **"Otro (personalizado)" from JSON not hardcoded**: Agents render from `questions()` output. Clean separation. OK.

## Residual Risks

- **C-01 and C-02 are interdependent**: Fixing one without the other still breaks v1 compatibility. Both must be addressed together. Simplest fix: `confirmDecisions()` always computes v2 hash with old normalize for v1 plans or forces v2 compute.
- **Exit code migration breadth**: Risk of missing references in docs, agent templates, external scripts despite pre-implementation grep. Consider deprecation period with both old and new codes documented.
- **Stale lock files after process crash**: Pre-existing risk amplified by three new lock-acquiring functions. `lock-manager.js` stale-lock handling not specified.
- **No transactional guarantee across decisions.json + plan.json**: Two files not atomically updated. Intermediate states are diagnosable but inconsistency windows exist.
- **Concurrent agent calls**: Global lock serializes writes but two agents could get same `questions()` output and race to answer. Last-write-wins is safe but could surprise users with two windows.
- **`ensureV2Fields()` does not guard against non-object `optionalAnswered`**: `|| {}` passes truthy non-objects through. Unlikely but not defensively handled.
- **Multi-field parsing ambiguity**: Inherent to prompt-based approach. Even with clearer rules, semantic interpretation varies across implementations.
- **Error table omits exit code 19** (`GSDC_QUESTIONS_UNRESOLVED`): Existing code may still throw it from `confirmDecisions()`. Template should cover it or confirm removal.
- **No specification for mid-flow abandonment**: User stops responding — no guidance on whether agent should call `plan status`, leave state as-is, or timeout.
- **Future optional fields**: Adding fields to `FIELD_REGISTRY` requires auditing `optionalAnswered` coupling in all code paths. Extensibility is implicit, not enforced.
