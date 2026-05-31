# Review: operator

## Summary

- Verdict: approve_with_changes
- Top risk: answer() operation order spec omits plan.json read, which could lead an implementer to skip state validation and allow writes in wrong states.
- Confidence: high

## Findings

### OP-001: answer() operation order omits plan.json read for state validation

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (new `answer()` function)
- Lines: target.md:261
- Claim: The answer() operation order specifies "acquire lock → leer decisions.json → validar estado mockup:questions_pending → ensureV2Fields() → validar confirmation.confirmed !== true → validar choice value → escribir atómicamente → release lock en finally".
- Evidence: target.md:261 explicitly lists "leer decisions.json" as the only file read, but state is stored in `plan.json` (confirmed by current code at plan-manager.js:174,258 where all state-validated functions read planJsonPath). The `confirmed` flag is in decisions.json, but the `mockup:questions_pending` state lives in plan.json's `phase:status`. An implementer following the literal order would read decisions.json only and either skip the state check or have to infer that plan.json must also be read.
- Impact: If an implementer skips the plan.json state check, answer() could write to decisions.json in states like `ready_for_html` or `pending_approval`, bypassing the confirmation gate. This would break the state machine's integrity guarantees.
- Recommendation: Update target.md:261 operation order to: "acquire lock → leer plan.json + decisions.json → validar estado mockup:questions_pending (plan.json) → ensureV2Fields() → validar confirmation.confirmed !== true (decisions.json) → validar choice value → escribir decisions.json atómicamente → release lock en finally".
- Suggested test: Create plan in state `ready_for_html` (confirmed=true, resolved). Call `answer(planId, 'vertical', 'new value')`. Assert exit 13 (GSDC_INVALID_STATE), not exit 23 (GSDC_DECISIONS_LOCKED). This validates the state check uses plan.json, not just the confirmed flag.
- Dedup key: answer-operation-order-missing-plan-json-read

### OP-002: ensureV2Fields() doesn't ensure confirmation object structure

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (new `ensureV2Fields()` helper)
- Lines: target.md:96
- Claim: "ensureV2Fields(decisions): Normaliza planes v1.1: decisions.optionalAnswered = ...; decisions.assets = ...". It is called at the start of ALL functions that read decisions.json.
- Evidence: target.md:96 defines ensureV2Fields as only adding `optionalAnswered` and `assets`. The current v1.1 create() (plan-manager.js:107-114) always initializes `confirmation`, and the proposal's create() (target.md:436-443) also initializes it. However, answer() accesses `decisions.confirmation.confirmed` (target.md:261) immediately after ensureV2Fields(). If decisions.json is manually edited or corrupted to remove the `confirmation` key, ensureV2Fields() would not restore it, and the subsequent access would throw an unhandled TypeError rather than a controlled GSDC error.
- Impact: An unhandled TypeError crash in answer(), resetConfirmation(), or questions() when encountering a corrupted decisions.json missing the `confirmation` object. The error would be confusing to diagnose instead of returning a clean GSDC_JSON_PARSE_ERROR.
- Recommendation: Extend ensureV2Fields() to also guarantee the confirmation object skeleton: `decisions.confirmation = decisions.confirmation || { confirmed: false, confirmedAt: null, confirmedBy: null, source: 'chat', decisionsHash: '', hashAlgorithm: 'sha256-decisions-v2' };`. This is a one-line addition that makes the normalizer truly complete.
- Suggested test: Create a decisions.json fixture with `{ "vertical": "", "formato": "" }` (no confirmation, no optionalAnswered, no assets). Call `questions(planId)`. Assert it returns successfully with `confirmed: false` rather than crashing.
- Dedup key: ensure-v2-fields-missing-confirmation-normalization

### OP-003: resetConfirmation() crash recovery produces extra history entries and re-writes plan.json

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (new `resetConfirmation()` function)
- Lines: target.md:306
- Claim: "Si falla después de paso 4, estado es questions_pending en plan.json pero confirmed=true en decisions.json → answer() falla con GSDC_DECISIONS_LOCKED (diagnósable). Re-ejecutar resetConfirmation() procede desde paso 5."
- Evidence: target.md:306 states recovery "proceeds from step 5", but the function has no checkpoint mechanism. On re-run, it executes steps 2-7 in full. Step 4 writes plan.json again with state=questions_pending and pushes a history entry with `from: 'questions_pending'`. The history dedup rule (target.md:302 "Si último entry ya tiene action: 'reset-confirmation' con mismo from → no duplicar") does NOT match because the first crash left a `from: <original_state>` entry, and the re-run uses `from: questions_pending`. A second entry is added. The recovery works correctly in terms of data integrity (the lock prevents concurrent access, writeAtomicJson is atomic), but the documentation claim is imprecise and the history accumulates artifacts.
- Impact: Audit trail contains a spurious `reset-confirmation` entry after crash recovery. Not functionally harmful but violates the "no duplicate" intent of the dedup rule. An implementer expecting "proceeds from step 5" might try to implement a checkpoint that doesn't exist.
- Recommendation: Update target.md:306 to state: "Re-ejecutar resetConfirmation() re-ejecuta todos los pasos idempotentemente. Steps 4 y 5 son seguros para re-escribir (mismo estado y datos). El history puede acumular un entry extra — aceptable para crash recovery." Alternatively, change the history dedup rule to match on `action: 'reset-confirmation'` alone (ignoring `from`) when the target state is already `questions_pending`.
- Suggested test: Simulate partial crash: call resetConfirmation() from `ready_for_html`, intercept after plan.json write but before decisions.json write. Verify decisions.json still has confirmed=true. Re-run resetConfirmation(). Assert: state is questions_pending, confirmed is false, history has 2 entries with action='reset-confirmation'.
- Dedup key: reset-confirmation-crash-recovery-extra-history

### OP-004: Stale mockup.html left in place after rename failure with no automated cleanup

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (new `resetConfirmation()` function)
- Lines: target.md:304, target.md:306
- Claim: "Si rename falla (I/O error): no throw — incluir staleRenameFailed: true en return. Documentar cleanup manual."
- Evidence: target.md:304 specifies that if `fs.renameSync` for mockup.html fails, the function returns `staleRenameFailed: true` but does not throw. The mockup.html file remains in the plan directory. After reset, the plan state is `questions_pending` with `confirmed: false`. The proposal correctly notes that submit-mockup requires `ready_for_html` state (plan-manager.js:358), so the stale mockup cannot be accidentally re-submitted. However, when the agent later generates a NEW mockup.html (after re-answering and re-confirming), it would typically write to the same path. If the stale file is not removed, the write would silently overwrite it. The agent has no way to know a stale version existed.
- Impact: No functional corruption — the state machine prevents the stale mockup from being submitted. But the agent loses the ability to detect that a stale mockup was left behind, and the `.stale.<timestamp>` naming convention's audit trail is broken for this case. Manual cleanup is required but the template (target.md:340-341) only mentions the success path for stale rename.
- Recommendation: Add a template instruction: when `staleRenameFailed: true` is returned, the agent should warn the user and attempt to delete `mockup.html` manually before generating a new one. Alternatively, the `questions()` output could include a `staleMockupExists: true` flag when `mockup.html` is present but state is `questions_pending`.
- Suggested test: Mock `fs.renameSync` to throw EACCES. Call resetConfirmation() from `pending_approval` with mockup.html present. Assert return includes `staleRenameFailed: true`. Assert state is `questions_pending`. Assert `mockup.html` still exists. Call `questions()` and verify no indication of stale mockup (demonstrating the gap).
- Dedup key: reset-confirmation-stale-mockup-no-cleanup-path

### OP-005: Single global lock creates unnecessary contention for read-only operations

- Severity: P3
- Category: state
- Status: valid
- File: lib/lock-manager.js, lib/plan-manager.js
- Lines: target.md:243, lock-manager.js:91-107
- Claim: "questions() adquiere lock antes de leer, libera en finally."
- Evidence: target.md:243 specifies questions() acquires the global lock. The lock manager (lock-manager.js:20-52) implements exclusive-only locking via `fs.writeFileSync` with 'wx' flag. All functions — including read-only questions() and status() — contend on the same `.gsd-canva/.lock` file. The lock timeout is 10s (lock-manager.js:14). While writeAtomicJson's tmp+rename pattern ensures reads are never torn, the lock still blocks concurrent readers.
- Impact: In multi-agent scenarios, a long-running answer() call (or a held lock from a slow process) blocks questions() calls for ALL plans. For a single-user CLI this is negligible, but for concurrent agent workflows it's a throughput bottleneck. Not a correctness issue — only performance.
- Recommendation: Acceptable for current scope. Consider noting as a future optimization: read-only operations could skip the lock entirely since writeAtomicJson guarantees atomic reads, or implement a reader-writer lock pattern. No change required for this proposal.
- Suggested test: N/A — performance characteristic, not a correctness bug.
- Dedup key: global-exclusive-lock-for-read-operations

## Non-Issues Checked

- **Lock release in finally blocks**: All new functions (questions, answer, resetConfirmation) use try/finally for lock release. The lock is released before the function returns, so handleSuccess/process.exit in the CLI layer happens after lock release. Confirmed safe.
- **writeAtomicJson atomicity**: Uses tmp+rename pattern (plan-manager.js:37-42). Crashes between tmp write and rename leave the old file intact. Reads always see either old or new version, never torn state. No issue.
- **Hash migration v1→v2 atomicity**: confirmDecisions() always writes hashAlgorithm='sha256-decisions-v2' alongside the v2 hash (target.md:467). resolveQuestions()/submitMockup() dispatch on the stored algorithm (target.md:471). After confirm, label and hash always match. No intermediate v1-hash-with-v2-label state possible.
- **resetConfirmation() write ordering (plan.json before decisions.json)**: Intentional and correct. Crash after plan.json but before decisions.json leaves state=questions_pending with confirmed=true. Re-running resetConfirmation() handles this because questions_pending is an accepted state. The lock prevents concurrent operations during the window.
- **answer() idempotency for same field**: Re-calling answer() with the same field/value overwrites with identical data. Counters are recomputed from disk state. No corruption.
- **confirmDecisions() empty-field protection**: Target.md:469 specifies getEmptyFields check on REQUIRED_FIELDS before hash computation. An answer() with empty value for required choice sets warning but doesn't block. confirmDecisions() catches it with GSDC_QUESTIONS_UNRESOLVED (exit 19). Two-layer protection is correct.
- **resetConfirmation() state boundary**: Accepted states are explicitly listed (target.md:293: questions_pending, ready_for_html, pending_approval). Approved and later phases are rejected with GSDC_INVALID_STATE. Non-mockup phases fall through to rejection since none match the three accepted states.
- **Lock stale detection**: lock-manager.js:57-86 implements PID-based stale detection with hostname+CWD matching and absolute timeout. If a process crashes with lock held, the next acquire() detects it as stale and reclaims. Default 10s timeout provides a safety net.
- **ensureV2Fields() read-only persistence**: questions() and status() call ensureV2Fields() in-memory only (target.md:241,593). First mutation (answer, resetConfirmation, confirmDecisions) persists the migration. No data loss or double-migration.
- **Placeholder detection breaking change**: Switch from `includes()` to `===` (target.md:42) is documented as a breaking change. Test 2 (plan.test.js:62) is identified for update (`'TODO: definir'` → `'TODO'`). The new behavior is strictly more permissive — strings like "PENDIENTE DE REVISIÓN" are no longer flagged. This is intentional and documented.
- **"confirmo" parsing edge cases**: The regex `/\b(confirmo|confirmado)\b/i` with negation check `/\bno\s+.*\b(confirmo|confirmado)\b/i` is well-specified (target.md:412,604). Test cases in verification step 19 (target.md:579) cover the critical paths. "confirmar" correctly rejected (different word).

## Residual Risks

- **SIGKILL during resetConfirmation()**: If the process is killed with SIGKILL (not catchable), the finally block doesn't run and the lock file remains. The lock manager's stale detection (PID check + 10s timeout) will eventually reclaim it, but there's a window where all plan operations are blocked. The current default timeout (10s) is reasonable for interactive use.
- **No transaction across plan.json + decisions.json**: resetConfirmation() writes two files non-atomically (by design, for crash recovery). There's a brief window where plan.json says questions_pending but decisions.json still has confirmed=true. The lock prevents concurrent reads of this inconsistent state. If the lock itself is bypassed (e.g., direct file access outside the CLI), an observer could see the inconsistency. This is acceptable given the tool's trust model.
- **ensureV2Fields() robustness for heavily corrupted decisions.json**: If decisions.json is not just missing fields but contains unexpected types (e.g., `confirmation: "string"` instead of an object), ensureV2Fields() as specified would not fix it. The `readJsonOrThrow` layer catches JSON parse errors but not structural errors. This is an edge case beyond the proposal's scope.
