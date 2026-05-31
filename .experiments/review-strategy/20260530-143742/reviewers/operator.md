# Review: operator

## Summary

- Verdict: approve_with_changes
- Top risk: `answer()` accepts arbitrary values for choice fields without validation, allowing invalid data to enter the state machine and pass the `requiredFieldsComplete` gate.
- Confidence: high

## Findings

### OP-01: `answer()` does not validate values against choice field options

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `answer()`)
- Lines: target.md:241-257
- Claim: `answer()` validates that the `field` parameter exists in `ALL_FIELDS` but never validates that the `value` matches one of the allowed options for `type: 'choice'` fields. An agent (or direct CLI invocation) can store `"foobar"` as `vertical` and the system will accept it, set `requiredFieldsComplete: true`, and allow `confirmDecisions()` to hash it.
- Evidence: Target §3 specifies `answer()` behavior: "Valida que field esté en ALL_FIELDS" — no mention of value validation against `FIELD_REGISTRY[].options`. The `FIELD_REGISTRY` defines 4 choice fields (vertical, formato, cta with fixed options, plus Otro), but `answer()` treats all values as opaque strings.
- Impact: Invalid data silently enters the state machine. The `requiredFieldsComplete` gate passes, `confirmDecisions()` hashes the invalid value, and the downstream mockup generation receives garbage. The template (§6) instructs the agent to validate, but there is no programmatic backstop if the agent misbehaves or the CLI is called directly.
- Recommendation: Add a validation step in `answer()`: if `FIELD_REGISTRY` declares the field as `type: 'choice'` and the value does not match any `options[].value` (and is not the `customFollowUp` empty-string sentinel for "Otro"), emit a new error (e.g., `GSDC_INVALID_CHOICE_VALUE`, exit 26). This preserves the "Otro (personalizado)" path: empty string is allowed only when `allowCustom: true`.
- Suggested test: `plan answer --id 001 --field vertical --value "INVALID_OPTION"` → exit 26 or chosen error code.
- Dedup key: answer-no-choice-value-validation

### OP-02: `resetConfirmation()` recovery re-execution can produce near-duplicate history entries

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `resetConfirmation()`)
- Lines: target.md:283-293
- Claim: After a crash between step 5 (write plan.json) and step 6 (rename mockup), re-executing `resetConfirmation()` proceeds because the idempotency triple-check fails (`mockupExists === true`). Step 5 re-writes plan.json with `from: 'questions_pending'` (the current state after the previous step 5), producing a second history entry `{ action: 'reset-confirmation', from: 'questions_pending', to: 'questions_pending' }` alongside the original `{ from: 'ready_for_html', ... }`.
- Evidence: Target §4 step 5: "Si el último history entry ya tiene action: 'reset-confirmation' con mismo from → no duplicar." The dedup key is `(action, from)`. After partial recovery, the `from` differs (`ready_for_html` vs `questions_pending`), so dedup does not match.
- Impact: Audit trail contains a confusing double-entry showing two resets in quick succession with different `from` values. Not a correctness issue, but degrades forensic value of history.
- Recommendation: Broaden the dedup key to `(action)` only (ignore `from`) when the target state is `questions_pending`, or track a `resetCorrelationId` so recovery runs are linked. Alternatively, document this as expected behavior in the Notes section.
- Suggested test: Simulate crash after step 5, re-execute `resetConfirmation()`, assert history length === 1 (or document expected length === 2).
- Dedup key: reset-recovery-duplicate-history

### OP-03: `questions()` calls `ensureV2Fields()` but never persists the v1→v2 migration

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `questions()`)
- Lines: target.md:91, 230
- Claim: `questions()` is documented as read-only and calls `ensureV2Fields()` to normalize in-memory, but does not write back to disk. A v1.1 plan inspected repeatedly via `questions()` alone will never have its `decisions.json` upgraded with `optionalAnswered: {}` and `assets: ""`.
- Evidence: Target §2: "`questions()` adquiere lock global antes de leer, libera en `finally`" — read-only semantics confirmed. Target §1: "`ensureV2Fields()` ... Llamado al inicio de `questions()`, `answer()`, y `resetConfirmation()` antes de cualquier operación."
- Impact: Not a correctness bug — the next `answer()` or `resetConfirmation()` call persists the migration. However, a user inspecting the raw `decisions.json` file after only calling `questions()` would see v1.1 format, contradicting the in-memory state. Could confuse manual debugging.
- Recommendation: Either (a) document that `questions()` intentionally does not persist migration, or (b) have `questions()` perform a lightweight write-back of the normalized file when it detects missing fields. Option (a) is simpler and sufficient.
- Suggested test: Create v1.1 fixture, call `questions()` twice, assert `decisions.json` on disk still lacks `optionalAnswered` (if documenting behavior) or has it (if implementing write-back).
- Dedup key: questions-v2-migration-not-persisted

### OP-04: No programmatic guard against empty-string value for "Otro (personalizado)" on required choice fields

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `answer()`)
- Lines: target.md:89, 152, 241-257
- Claim: The "Otro (personalizado)" option has `value: ""`. If an agent selects "Otro" but fails to follow up with the custom text and passes `""` to `answer()`, the field remains empty. For required fields, `getEmptyFields()` would still see it as empty, so `requiredFieldsComplete` stays false — this is a natural safeguard. However, the system accepts the no-op write silently rather than signaling the error.
- Evidence: Target §6 template: "Solo el texto resultante se pasa a plan answer. ⚠️ PROHIBIDO guardar 'Otro' o un índice como valor." The prohibition is at the template level only.
- Impact: Low — the `requiredFieldsComplete` gate prevents progression. But the agent gets a successful response from `answer()` (exit 0) with no warning that the value was effectively discarded. This could cause the agent to believe the field was answered and skip re-asking.
- Recommendation: In `answer()`, if the field is `type: 'choice'` and `required: true` and the value is empty string, return a warning flag in the response (e.g., `"warning": "empty_value_for_required_choice"`) without failing. This nudges the agent without breaking the flow.
- Suggested test: `plan answer --id 001 --field vertical --value ""` → success with warning flag, `requiredFieldsComplete: false`.
- Dedup key: otro-empty-value-no-guard

### OP-05: `ensureV2Fields()` executes before state validation in `answer()`, performing unnecessary mutations on rejected calls

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `answer()`)
- Lines: target.md:242
- Claim: The specified operation order for `answer()` is: acquire lock → read decisions.json → `ensureV2Fields()` → validate state. If the plan is in `ready_for_html`, `ensureV2Fields()` mutates the in-memory object before the state check rejects the call. The mutation is not persisted (state check fails before write), so this is harmless, but it performs work and obscures the intent that `ensureV2Fields()` is a prerequisite for the actual operation, not for validation.
- Evidence: Target §3: "Orden de operaciones: acquire lock → leer decisions.json → ensureV2Fields() → validar estado mockup:questions_pending → ..."
- Impact: No functional impact — the in-memory mutation is discarded. But it violates the principle of "validate early, transform late" and could mislead an implementer into thinking the normalization is part of the validation path.
- Recommendation: Reorder to: acquire lock → read decisions.json → validate state → `ensureV2Fields()` → validate confirmed → write. This makes it clear that normalization only happens on the happy path.
- Suggested test: Call `answer()` on a plan in `ready_for_html` state, verify `decisions.json` on disk is untouched (no v2 fields added).
- Dedup key: ensurev2fields-before-state-validation

## Non-Issues Checked

- **Lock contention between concurrent `answer()` calls**: Both acquire the same global lock (file-based), so calls are serialized. No deadlock possible since no nested locking. OK.
- **`resetConfirmation()` partial failure between step 4 and step 5**: State remains `ready_for_html` with `confirmed=false`. `answer()` rejects via `GSDC_INVALID_STATE`. Re-executing `resetConfirmation()` recovers correctly. Well-designed.
- **`resetConfirmation()` partial failure between step 5 and step 6**: State is `questions_pending`, `confirmed=false`, mockup exists. Idempotency triple-check fails (`mockupExists` is true), so re-execution proceeds to rename. Recovery path is correct.
- **Hash migration v1→v2 after reset**: `resetConfirmation()` clears `hashAlgorithm` to `""`. Next `confirmDecisions()` uses v2 dispatch (fallback). Hash changes from 6-field to 7-field, but old hash is already cleared, so no mismatch. OK.
- **`confirmDecisions()` followed by `resolveQuestions()` failure**: State stays `questions_pending`, `confirmed=true`. `answer()` rejects with `GSDC_DECISIONS_LOCKED`. `resetConfirmation()` accepts this state and cleans up. Recoverable. OK.
- **Placeholder detection fix**: Proposal correctly changes from `includes()` (which matched "Nodo" against "TODO") to `===` exact match. Verified against repo context bug report. OK.
- **State machine completeness**: All transitions are well-defined: `questions_pending` → `ready_for_html` (via resolveQuestions), `ready_for_html` → `pending_approval` (via submitMockup), `ready_for_html`/`pending_approval` → `questions_pending` (via resetConfirmation). No unreachable or orphan states. OK.
- **`questions()` returning `readOnly: true` for all post-`questions_pending` states**: Including `approved`. This means `questions()` never errors for state — always returns data. Consistent with its read-only nature. OK.
- **`answer()` not updating `plan.json`**: By design — audit trail lives in `decisions.json`. No timestamps needed in plan.json for individual answers. OK.
- **`optionalAnswered` semantics**: Set to `true` for any response to optional field (including empty/declined). `getEmptyFields()` correctly excludes these. `resetConfirmation()` clears both `optionalAnswered` and optional field values. Consistent. OK.
- **Exit code migration (15→24, 15→25)**: Breaking changes are documented with a pre-implementation grep step. The three-way split (24=dir missing, 25=file missing, 15=corrupt JSON) improves diagnostics. OK.
- **`writeAtomicJson` atomicity**: Existing helper assumed to be write-temp-then-rename. Standard pattern, atomic on same filesystem. Acceptable for a local CLI tool. OK.

## Residual Risks

- **Stale lock files after process crash (SIGKILL/power loss)**: The proposal relies on `lock-manager.js` for all locking. If the process is killed while holding a lock, the lock file remains on disk. The repo context does not specify whether `lock-manager.js` handles stale locks (e.g., via PID checking or timeout). This is a pre-existing risk, not introduced by this proposal, but it becomes more relevant with the new lock-acquiring functions (`questions()`, `answer()`, `resetConfirmation()`).
- **No transactional guarantee across `decisions.json` + `plan.json` writes in `resetConfirmation()`**: The proposal correctly orders writes and documents recovery paths, but the two files are not updated atomically. The intermediate states are diagnosable and recoverable, but an operator running the system must be aware that inconsistency windows exist.
- **`ensureV2Fields()` does not guard against `optionalAnswered` being a non-object type** (e.g., string, number): The check `decisions.optionalAnswered || {}` passes through truthy non-objects. Unlikely in practice but not defensively handled.
