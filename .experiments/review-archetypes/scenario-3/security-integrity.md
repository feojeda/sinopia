# Review: Security Integrity

## Findings

- Severity: High
- File: `.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` may accept `mockup:pending_approval` and invalidates stale `mockup.html`.
- Evidence: The proposal only says `ready_for_html` is reverted to `questions_pending` at lines 208-210; it does not require reverting `pending_approval`. In the current state machine, `approve-mockup` only checks `mockup:pending_approval` and then advances to `mockup:approved` without checking `mockup.html` or the decisions hash (`lib/plan-manager.js:445-453`). `submitMockup()` performs artifact/hash validation only before entering `pending_approval` (`lib/plan-manager.js:357-388`). Therefore, after reset from `pending_approval`, a plan can remain approvable even though confirmation was cleared and `mockup.html` was renamed stale.
- Recommendation: Require `resetConfirmation()` to revert both `mockup:ready_for_html` and `mockup:pending_approval` to `mockup:questions_pending`, and add a regression test that reset from `pending_approval` blocks `approve-mockup` until decisions are re-confirmed and a fresh mockup is submitted.
- Confidence: High

- Severity: Medium
- File: `.experiments/review-archetypes/input/target.md`
- Line: 213
- Claim: If `reset-confirmation` fails after renaming `mockup.html`, the state is still consistent and re-running or regenerating is sufficient because `submitMockup()` detects missing `mockup.html`.
- Evidence: That is true for `ready_for_html`, where `submitMockup()` requires `mockup.html` (`lib/plan-manager.js:357-388`). It is not true for `pending_approval`, because the next valid transition is `approve-mockup`, not `submitMockup()`, and `approve-mockup` does not inspect artifacts or confirmation (`lib/plan-manager.js:445-453`). The proposed failure mode can leave `pending_approval` with no valid mockup but still allow approval.
- Recommendation: Make the reset operation update `plan.json` to `questions_pending` before or atomically with artifact invalidation for all accepted post-confirmation states, or make `approve-mockup` reject plans with cleared confirmation/stale artifact markers.
- Confidence: High