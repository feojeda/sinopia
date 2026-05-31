# Review: Modeler

## Findings

- Severity: High
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` accepts `mockup:pending_approval` and then allows the correction flow to continue with `plan answer`.
- Evidence: The proposal accepts `mockup:pending_approval` at line 208, but only specifies reverting `ready_for_html` to `mockup:questions_pending` at line 209. Later it says "Luego usa `plan answer`" at line 293. However `answer()` is specified to validate state `mockup:questions_pending` at line 174, so a reset from `pending_approval` would remain in a state where `plan answer` must reject with `GSDC_INVALID_STATE`. Current code also models `pending_approval` as the precondition for approval, not editing: `lib/plan-manager.js:446`.
- Recommendation: Define reset semantics for `pending_approval` explicitly. Either revert both `ready_for_html` and `pending_approval` to `mockup:questions_pending`, or do not accept `pending_approval`.
- Confidence: High

- Severity: Medium
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 213
- Claim: A `ready_for_html`/`pending_approval` state without valid `mockup.html` is detectable by `submitMockup()`.
- Evidence: Current `submitMockup()` only runs artifact validation after requiring state `mockup:ready_for_html`; it rejects any other state first in `lib/plan-manager.js:357-363`. Therefore a `pending_approval` plan without `mockup.html` is not detectable by `submitMockup()` as an artifact problem. It would fail as `GSDC_INVALID_STATE`, which is a different contract.
- Recommendation: Remove `pending_approval` from that idempotence claim, or add explicit validation/recovery semantics for stale/missing mockups in `pending_approval`.
- Confidence: High

- Severity: Medium
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 53
- Claim: If `questions()` reports `readyToConfirm: true`, then `confirm-decisions` and `resolve-questions` cannot fail.
- Evidence: `readyToConfirm` is defined only as `requiredPendingCount === 0` at line 56. Current `resolveQuestions()` also requires `decisions.confirmation.confirmed === true` before resolving, and fails otherwise with `GSDC_QUESTIONS_UNRESOLVED` in `lib/plan-manager.js:267-272`. So field completeness alone can make `confirm-decisions` eligible, but it cannot make `resolve-questions` eligible.
- Recommendation: Narrow the invariant: `readyToConfirm: true` means `confirm-decisions` should not fail for missing fields/placeholders. `resolve-questions` still requires a successful prior confirmation and matching hash.
- Confidence: High