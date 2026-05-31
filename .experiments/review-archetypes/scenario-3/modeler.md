# Review: Modeler

## Findings

- Severity: High
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` accepts `mockup:pending_approval` and unlocks decisions for editing.
- Evidence: The proposal says accepted states include `mockup:pending_approval`, but only defines reverting `ready_for_html` to `mockup:questions_pending` at line 209. `plan answer` is specified to require `mockup:questions_pending` at line 174. In the current state machine, `pending_approval` is a distinct post-submit state produced by `submitMockup()` in `/Users/franciscoojeda/gsd-canva/lib/plan-manager.js:397`, and approval expects that same state in `/Users/franciscoojeda/gsd-canva/lib/plan-manager.js:446`. If reset from `pending_approval` leaves the plan in `pending_approval`, the user still cannot call `plan answer`, so the advertised unlock path is broken.
- Recommendation: Define `resetConfirmation()` to revert both `mockup:ready_for_html` and `mockup:pending_approval` to `mockup:questions_pending`, or remove `pending_approval` from accepted states. Add a test for reset from `pending_approval` proving `plan answer` works afterward.
- Confidence: High

- Severity: Medium
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 53
- Claim: If `questions()` reports `readyToConfirm: true`, both `confirm-decisions` and `resolve-questions` cannot fail.
- Evidence: `readyToConfirm` is defined only as `requiredPendingCount === 0` at line 56. But `resolveQuestions()` currently has additional required invariants: confirmation must already be registered in `/Users/franciscoojeda/gsd-canva/lib/plan-manager.js:268`, and the stored hash must match in `/Users/franciscoojeda/gsd-canva/lib/plan-manager.js:308`. A plan with all required fields filled but not confirmed would correctly have `readyToConfirm: true` and still fail `resolve-questions`.
- Recommendation: Narrow the contract: `readyToConfirm: true` means `confirm-decisions` is eligible, not that `resolve-questions` is eligible. If a combined readiness signal is needed, add a separate field such as `readyToResolve` based on `confirmation.confirmed === true` and hash validity.
- Confidence: High