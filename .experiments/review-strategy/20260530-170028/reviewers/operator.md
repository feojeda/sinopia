# Operator Review: /review-strategy 2

## Findings

### High: `resetConfirmation()` writes state before data and can strand locked decisions

- **Evidence**: The plan orders reset as: write `plan.json` to `questions_pending`, then write `decisions.json`, then stale `mockup.html`. It documents the crash state `questions_pending` + `confirmed=true`, but `answer()` rejects that with `GSDC_DECISIONS_LOCKED`. `questions()` then relies on history to infer `"suggest_reset"` only if the last history entry is `reset-confirmation`.
- **Impact**: A crash or write failure after the `plan.json` update can leave a plan visibly back in `questions_pending` while edits are still locked. If history is truncated, reordered, or duplicated, the recovery hint may be wrong and the user cannot proceed without manual diagnosis.
- **Required change**: Make reset recovery independent of history. Treat `phase=mockup`, `status=questions_pending`, `confirmation.confirmed=true` as a recoverable partial reset state and allow `resetConfirmation()` to continue idempotently. Also persist an explicit recovery marker or compute it from state plus confirmation instead of from the last history entry.
- **Suggested test**: Simulate crash after `plan.json` write and before `decisions.json` write. Verify `questions()` returns `readOnly: true`, `suggestedAction: "suggest_reset"` and a second `reset-confirmation` clears confirmation without adding duplicate misleading history.

### High: multi-file transitions are not atomic but are described as atomic

- **Evidence**: `resolveQuestions()` and `submitMockup()` say "transicionar estado → escribir archivos atómicamente" while operating on at least `plan.json` and potentially other artifacts. `confirmDecisions()` writes `decisions.json` only; `resolveQuestions()` later writes `plan.json`. `resetConfirmation()` writes `plan.json`, then `decisions.json`, then renames `mockup.html`.
- **Impact**: Atomic file writes only protect each file independently. Cross-file state can diverge on process crash, disk full, permission errors, or interrupted rename. Downstream commands may observe mixed state: confirmed decisions with old plan status, reset plan with locked decisions, or pending approval with stale mockup.
- **Required change**: Define cross-file recovery invariants for every transition. Either introduce a small transaction/recovery marker file with phase and step, or make each command explicitly tolerate and repair every documented partial state before normal validation. Avoid calling multi-file updates atomic unless a transaction protocol exists.
- **Suggested test**: Fault-inject write failures after each file write in `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`, and `resetConfirmation()`. Re-run the same command and verify it converges or returns a deterministic recovery action without manual edits.

### Medium: lock scope does not cover agent-side confirm and resolve sequence

- **Evidence**: The template runs `confirm-decisions` and then `resolve-questions` as separate CLI invocations. Each command has its own lock, released between commands. The plan expects a retry/reset path if `resolve-questions` fails.
- **Impact**: Another agent/process can call `reset-confirmation`, `answer`, or status-changing commands between confirm and resolve. The second command may fail correctly, but recovery behavior can discard optional answers or force re-confirmation despite no user-level conflict.
- **Required change**: Add a single CLI command for the confirm-and-resolve transition, or make `resolveQuestions()` idempotently complete an already-confirmed `questions_pending` plan when the stored hash still matches. If keeping two commands, document and test interleavings with reset/answer/submit attempts between them.
- **Suggested test**: Confirm decisions, then run `reset-confirmation` before `resolve-questions`. Verify `resolve-questions` returns a clear invalid-state/recovery error and does not overwrite reset decisions. Also test two concurrent confirm/resolve flows for the same plan.

### Medium: stale mockup handling is non-blocking even when it detects unsafe ordering

- **Evidence**: The plan says `submitMockup()` checks `mockup.html` mtime is after `confirmedAt`; if it predates, it returns `staleMockupDetected: true` but "no error". It relies on hash mismatch as final safety net, yet the mockup content itself is not tied to the decisions hash.
- **Impact**: A stale HTML file can be submitted after reset/reconfirm if decisions return to the same values or if the mockup file predates confirmation but still passes hash checks. The state can advance to approval with an artifact generated from an earlier decision set or earlier rendering attempt.
- **Required change**: Make stale mockup detection a blocking error for `submitMockup()` unless there is an explicit `--allow-stale` escape hatch. Better: write the decisions hash into mockup metadata at generation time and require it to match `confirmation.decisionsHash`.
- **Suggested test**: Generate `mockup.html`, confirm later with same decisions, then submit the older file. Verify submit fails with a stale-artifact error and does not advance state.

### Medium: idempotency rules for duplicate answers and repeated confirmation are under-specified

- **Evidence**: `answer()` permits writing any field while `questions_pending` and unlocked, but the plan does not say whether repeated writes of the same value are no-op, whether changing a previous value clears dependent Markdown mirrors, or whether duplicate `confirmDecisions()` calls are no-op or errors. The template also allows saving partial context before interactive questions.
- **Impact**: Retries after CLI timeout or agent crash can mutate timestamps/history inconsistently or cause confusing counters. Re-answering a field after Markdown has been mirrored can leave generated docs stale unless the mirror update is tied to the same state model.
- **Required change**: Define idempotency for `answer(field, value)` and `confirmDecisions()`: same input should be no-op or deterministic success; different input before confirmation should invalidate any derived mirrors or mark them stale. Add response fields that distinguish `wasNoOp` from `updated`.
- **Suggested test**: Run the same `answer()` twice, run `answer()` with a changed value, then run `confirmDecisions()` twice. Verify stable counters, no duplicate history noise, and no stale mirrored Markdown is treated as authoritative.

### Medium: lock implementation requirements are missing

- **Evidence**: The plan says `questions()`, `answer()`, `resetConfirmation()`, `confirmDecisions()`, `resolveQuestions()`, and `submitMockup()` acquire a lock, but does not specify lock file path, acquisition primitive, timeout, stale lock recovery, process identity, or whether all existing commands use the same lock.
- **Impact**: A weak or inconsistent lock can deadlock plans after crashes, allow concurrent writers if implemented with check-then-create, or fail to protect older commands such as `approveMockup()`. State guarantees in the plan depend on lock correctness.
- **Required change**: Specify a per-plan lock protocol using atomic creation/open with exclusive semantics, timeout behavior, stale lock metadata, and `finally` cleanup. Require all commands that read/write `plan.json`, `decisions.json`, or `mockup.html` to use the same lock.
- **Suggested test**: Start one command while holding the plan lock, verify a second writer blocks or fails with a deterministic lock error. Simulate a stale lock from a dead PID and verify recovery behavior.

### Low: `questions()` read-only behavior can mask artifact corruption in non-editable states

- **Evidence**: `questions()` "never throws `GSDC_INVALID_STATE`" and for non-mockup/unknown states returns a normal response shape with counters computed from `decisions.json`. It still throws for missing/corrupt `decisions.json`.
- **Impact**: Agents may interpret a read-only questions payload as safe state guidance even when the current phase should not depend on question counters. This increases the chance of recovery actions being chosen based on stale decisions rather than authoritative state.
- **Required change**: For non-mockup or unknown states, keep `pending`/`filled` but include a machine-readable `stateRecognized: false` or `questionFlowAvailable: false`, and avoid suggesting reset unless the state is one of the accepted mockup recovery states.
- **Suggested test**: Set `plan.phase='deliver'` with incomplete decisions and verify `questions()` does not suggest reset or ask flow, and exposes that question flow is unavailable.

## Summary

The plan is strong on per-command validation and error taxonomy, but it overstates atomicity across multiple files. The main required improvement is a clear recovery protocol for partial writes and interleavings, backed by fault-injection tests. Blocking stale mockup submission and specifying the lock protocol would close the largest operational gaps.
