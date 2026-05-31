# Review: modeler

## Summary

- Verdict: approve_with_changes
- Top risk: `questions()` masks `pending` when `confirmed === true`, hiding real field state from consumers who check `pending.length` without first gating on `confirmed`.
- Confidence: high

## Findings

### M-01: `questions()` returns `pending: []` when confirmed, hiding real field incompleteness

- Severity: P2
- Category: state
- Status: valid
- File: target.md
- Lines: 232-233, 585
- Claim: When `confirmed === true` and state is `questions_pending` (between confirm and resolve), `questions()` returns `pending: []` regardless of how many fields are actually empty.
- Evidence: Lines 232-233 state: "`questions_pending` + `confirmed === true` → `readOnly: true`, `confirmed: true`, `pending: []`." Line 585 notes: "questions() retorna `pending: []` cuando `confirmed: true` independientemente del estado real de campos — esto es intencional." Test at line 487 explicitly validates this: "llenar 5/6 requeridos, confirmar → pending.length === 0 AND confirmed === true."
- Impact: Any consumer that interprets `pending.length === 0` as "all fields answered" without first checking `confirmed` will make incorrect decisions. This is especially dangerous for agent templates where the flow control logic branches on `pending` count. The invariant is documented but structurally unenforced — there is no type-level or runtime guard preventing misuse.
- Recommendation: Add an explicit `pendingMasked: true` flag to the response when this masking occurs. This gives consumers a second signal beyond `confirmed` and makes the contract self-documenting in the JSON shape. Alternatively, always return accurate `pending` and let consumers gate on `readOnly`/`confirmed` to decide whether to act on it.
- Suggested test: Create a plan with 5/6 required fields answered. Manually set `confirmed: true` in `decisions.json`. Call `questions()`. Assert `pending.length === 1` (not 0) if accurate-pending approach is chosen, OR assert `pendingMasked === true` if masking is kept.
- Dedup key: questions-pending-masked-when-confirmed

### M-02: `resetConfirmation()` non-atomic two-file write leaves recoverable but diagnosable inconsistent state

- Severity: P2
- Category: state
- Status: valid
- File: target.md
- Lines: 293-301
- Claim: Steps 4 (write `decisions.json`) and 5 (write `plan.json`) are separate non-atomic writes. A crash between them leaves `decisions.json` with `confirmed: false` but `plan.json` still at `ready_for_html` or `pending_approval`.
- Evidence: Lines 293-300 specify the sequential steps: step 4 writes `decisions.json` (clears confirmation, optional fields), step 5 writes `plan.json` (sets state to `questions_pending`, pushes history). Line 301 documents recovery: "Si falla después de paso 4, estado es `ready_for_html`/`pending_approval` + `confirmed=false` → `answer()` falla con `GSDC_INVALID_STATE` (diagnósable). Re-ejecutar procede desde paso 5."
- Impact: The intermediate state is visible to `questions()` and `status()` calls. `questions()` would show `status: "ready_for_html"` with `confirmed: false` and `readOnly: true` — a combination that has no documented handling in the agent template. The recovery path (re-run `resetConfirmation()`) is documented but requires the agent or user to recognize the inconsistency and take corrective action. The agent template's error table at line 394 covers `GSDC_INVALID_STATE` with "sugerir `reset-confirmation` si aplica" — but the user never sees exit 13 here because `questions()` succeeds and returns the weird state.
- Recommendation: Either (a) add a note in the agent template for handling `readOnly: true` + `confirmed: false` as a "partial reset detected, re-run reset-confirmation" signal, or (b) reverse the write order — write `plan.json` first (set `questions_pending`), then `decisions.json`. If crash occurs after `plan.json` but before `decisions.json`, the state is `questions_pending` with `confirmed: true` — which `resetConfirmation()` handles as a non-no-op and re-corrects. This direction is safer because `answer()` would still reject (`confirmed: true`), but `resetConfirmation()` would fix it cleanly.
- Suggested test: Mock `writeAtomicJson` to fail on the second call (plan.json). Verify that re-running `resetConfirmation()` completes successfully and both files are consistent.
- Dedup key: reset-confirmation-non-atomic-two-file-write

### M-03: `optionalAnswered` name conflates "prompted" with "answered with value"

- Severity: P3
- Category: docs
- Status: valid
- File: target.md
- Lines: 123, 258
- Claim: The field name `optionalAnswered` suggests the optional field has a non-empty answer, but the actual semantics are "the user was prompted and responded, including with an empty value."
- Evidence: Line 123: "`optionalAnswered`: Se set `optionalAnswered[field] = true` para **toda** respuesta a campo opcional (vacío o no)." Line 258: "`optionalAnswered[field] = true` solo cuando `OPTIONAL_FIELDS.includes(field)`."
- Impact: An implementer reading `optionalAnswered.assets === true` might assume `assets` has a non-empty value and skip displaying it, when in fact the user explicitly declined (empty answer). This doesn't break the plan's logic (`getEmptyFields` correctly skips flagged fields), but it could mislead someone maintaining or extending the code.
- Recommendation: Rename to `optionalPrompted` or `optionalResolved` to accurately convey that the field was addressed (not necessarily filled). Update all references in `FIELD_REGISTRY`, `getEmptyFields`, `answer()`, `resetConfirmation()`, tests, and the agent template.
- Suggested test: After rename, all existing tests should pass unchanged (rename-only refactoring).
- Dedup key: optionalAnswered-naming-semantics

### M-04: `ensureV2Fields()` mutates in-memory in read-only paths, returning a view not on disk

- Severity: P3
- Category: state
- Status: valid
- File: target.md
- Lines: 96, 236
- Claim: `questions()` and `status()` call `ensureV2Fields()` which adds `optionalAnswered: {}` and `assets: ""` to the in-memory decisions object, but does not persist these additions. The JSON response includes these fields even though they don't exist on disk.
- Evidence: Line 96: "Se llama al inicio de **todas** las funciones que leen `decisions.json`." Line 236: "`questions()` no persiste migración: `ensureV2Fields()` modifica en memoria pero no escribe a disco (es read-only)."
- Impact: If a consumer (agent template or external tool) reads `decisions.json` directly from disk after calling `questions()`, it will see a different shape than what `questions()` returned. This is mitigated by the lock during `questions()` execution and by the rule "PROHIBIDO escribir directamente en decisions.json", but creates a conceptual inconsistency between the API view and the disk view. The plan explicitly documents this as intentional, so the risk is primarily for future maintainers who might not read the full spec.
- Recommendation: Add a `_migratedFields: ["optionalAnswered", "assets"]` array to the `questions()` response when migration occurred, so consumers can distinguish between "these fields exist on disk" and "these fields were synthesized for compatibility." Alternatively, this is acceptable as-is with a code comment at the `ensureV2Fields()` call site in `questions()`.
- Suggested test: Load a v1 fixture (no `optionalAnswered`, no `assets` on disk). Call `questions()`. Verify response includes `optionalAnswered: {}` and `assets: ""`. Verify disk file is unchanged (no `optionalAnswered`, no `assets`).
- Dedup key: ensurev2fields-read-path-mutation

### M-05: `resetConfirmation()` asymmetrically clears optional values but preserves required — no "full reset" path

- Severity: P3
- Category: ux
- Status: valid
- File: target.md
- Lines: 292
- Claim: `resetConfirmation()` iterates `OPTIONAL_FIELDS` to set values to `""` but explicitly preserves all required field values. There is no mechanism for a user to clear required fields without manually re-answering each one.
- Evidence: Line 292: "itera `OPTIONAL_FIELDS` para poner cada valor a `""` ... **Campos requeridos se preservan** — vertical, formato, audiencia, paleta, copy, cta mantienen sus valores."
- Impact: A user who wants to start completely fresh after reset must re-answer each required field individually via `answer()`. The optional fields are conveniently wiped, but required fields linger. This is a deliberate design choice (avoids accidental data loss for expensive-to-recollect fields), but it creates an asymmetry in the user's mental model of "reset" — they might expect all values to be cleared.
- Recommendation: Document this behavior explicitly in the CLI human-readable output for `reset-confirmation`: "Required fields preserved. Optional fields cleared. To change required fields, use `plan answer`." No code change needed — this is a clarity issue.
- Suggested test: Verify CLI output for `reset-confirmation` includes a message about preserved required fields.
- Dedup key: reset-confirmation-asymmetric-clear

### M-06: `confirmDecisions()` validation does not account for choice fields with empty-string custom values

- Severity: P2
- Category: state
- Status: uncertain
- File: target.md
- Lines: 250-251, 119-121
- Claim: `answer()` allows empty string for required choice fields (with warning), meaning `decisions.vertical` can be `""` after a successful answer. `confirmDecisions()` must validate that all required fields are non-empty before confirming, but the plan does not specify whether `confirmDecisions()` re-runs `getEmptyFields()` or has its own validation.
- Evidence: Line 250-251: "Si `value` es `""` y campo es `required: true` → aceptar pero incluir `warning`." Lines 119-121 define `requiredFieldsComplete` as `requiredPendingCount === 0` based on `getEmptyFields()`. The current v1.1 `confirmDecisions()` (repo-context.md line 26) validates fields and computes hash — it presumably checks for empty required fields.
- Impact: If `confirmDecisions()` uses `getEmptyFields()` for validation, an empty-string required choice (which `getEmptyFields` would flag as empty) would be correctly rejected. But if `confirmDecisions()` only checks the `requiredFieldsComplete` counter from a previous `answer()` response (which would be `false` due to the warning), it depends on the agent template to prevent calling `confirm` when `requiredFieldsComplete === false`. The template does enforce this (line 383: "Si `requiredFieldsComplete === true` → avanzar a confirmación"). So the guard is at the template level, not the API level. If someone calls `confirmDecisions()` directly without the template, empty required choices could potentially be confirmed.
- Recommendation: Add an explicit invariant to the spec: "`confirmDecisions()` MUST reject (exit 19 `GSDC_QUESTIONS_UNRESOLVED`) if any required field is empty or a placeholder, using `getEmptyFields(decisions, REQUIRED_FIELDS)`." This ensures the API-level guard is independent of the template.
- Suggested test: Answer all 6 required fields, one with empty string (gets warning). Call `confirmDecisions()`. Assert exit 19.
- Dedup key: confirm-decisions-empty-required-choice-validation

## Non-Issues Checked

- **Exit code collisions**: New codes 22-26 do not collide with existing 13, 15, 19, 20, 21. Verified against error table at lines 533-541 and repo-context.md error codes.
- **Hash migration v1→v2 correctness**: `NORMALIZE_V1` and `NORMALIZE_V2` are identical (NFC, case-sensitive). Only the field set differs (6 vs 7). `confirmDecisions()` always computes v2. `resolveQuestions()` and `submitMockup()` dispatch on stored `hashAlgorithm`. Migration is atomic (hash + label always match after confirm). No invariant violation.
- **Placeholder detection `===` vs `includes()` fix**: The `getEmptyFields()` function correctly uses `upper === p` for exact case-insensitive match, fixing the "Nodo" false-positive from the current `includes()` code. Bracket detection `[...]` remains substring-based. This is well-specified.
- **"Otro (personalizado)" handling**: `questions()` generates it from `allowCustom` flag (not hardcoded). `answer()` rejects `"Otro (personalizado)"` as a value (exit 26) and rejects numeric-only values (exit 26). Custom values are accepted when `allowCustom: true`. The template mandates follow-up via `customFollowUp`. Complete and consistent.
- **Lock semantics for `questions()`**: `questions()` acquires lock before reading, releases in `finally`. This serializes access and prevents stale reads during concurrent writes. Acceptable.
- **`answer()` state validation order**: Acquire lock → read → validate state → `ensureV2Fields()` → validate confirmation → validate choice → write. State validation reads from `plan.json` (separate from `decisions.json`), so `ensureV2Fields()` modifying decisions in memory does not affect state check. Correct ordering.
- **`optionalAnswered` flag isolation**: `answer()` only sets the flag for `OPTIONAL_FIELDS`, never for required fields. `getEmptyFields()` uses the flag to skip optional fields. This prevents the bug where a flag on a required field would hide an empty required value. Well-specified at line 258.
- **`resetConfirmation()` idempotency**: No-op condition (`questions_pending` + `!confirmed` + `!mockupExists`) is well-defined. History dedup (`same from → no duplicate`) prevents history bloat on re-execution. Correct.
- **"confirmo" regex parsing**: `/\bconfirmo\b/i` with negation check for `"no confirmo"` and rejection of `"confirmar"` (not "confirmo"). Handles edge cases: punctuation, capitalization, phrases. Well-specified.
- **`GSDC_MOCKUP_MISSING` (20) rename from `GSDC_ARTIFACT_MISSING`**: No semantic change, just clearer naming. Code 20 is unchanged. New code 25 (`GSDC_PLAN_ARTIFACT_MISSING`) is for a different scenario (decisions.json missing). No collision or confusion.
- **`create()` initialization**: New plans get `assets: ""`, `optionalAnswered: {}`, and `hashAlgorithm: "sha256-decisions-v2"` from creation. This eliminates migration concerns for new plans. Correct.
- **CLI handleError fallback**: `err.exitCode || 1` ensures unknown errors get generic exit code instead of stale domain-specific codes. Breaking change documented. Correct.

## Residual Risks

- **Direct file manipulation**: The state machine assumes `decisions.json` and `plan.json` are only modified through the API. Direct editing can create states the spec doesn't cover (e.g., `confirmed: true` with missing required fields). The `questions()` masking behavior (M-01) makes this worse by hiding the inconsistency.
- **Concurrent process access**: While individual operations hold locks, there's no mechanism to prevent a user from running two agent sessions against the same plan. The lock manager handles serialization but the agent template has no awareness of concurrent modifications.
- **`resetConfirmation()` from `pending_approval`**: Reverting from `pending_approval` to `questions_pending` is a significant backward jump. If an approver has already seen the mockup, resetting invalidates their review. The spec doesn't mention notifying or tracking this in the approval workflow.
