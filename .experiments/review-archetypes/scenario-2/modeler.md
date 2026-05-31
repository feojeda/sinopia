# Review: Modeler

## Findings

- Severity: High
- File: `.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` accepts `mockup:pending_approval`, but the state reset semantics only say `ready_for_html` reverts to `mockup:questions_pending`.
- Evidence: The proposal allows `mockup:pending_approval` at line 208, then only specifies reverting when state is `ready_for_html` at line 209. The correction flow says to run `reset-confirmation`, then use `plan answer` at lines 288-293. But `answer()` is specified to require `mockup:questions_pending` at lines 174-176 and error on incorrect state at line 195. Existing lifecycle confirms `pending_approval` is a real post-submit state in `lib/plan-manager.js:395-398`, and approval expects that state in `lib/plan-manager.js:445-447`.
- Recommendation: Define `resetConfirmation()` to revert both `mockup:ready_for_html` and `mockup:pending_approval` to `mockup:questions_pending`, or remove `pending_approval` from accepted states. Add a test for reset from `pending_approval` followed by `plan answer`.
- Confidence: High

- Severity: Medium
- File: `.experiments/review-archetypes/input/target.md`
- Line: 53
- Claim: If `questions()` reports `readyToConfirm: true`, then both `confirm-decisions` and `resolve-questions` cannot fail.
- Evidence: `readyToConfirm` is defined only as `requiredPendingCount === 0` at line 56. Existing `resolveQuestions()` also requires `decisions.confirmation.confirmed === true` and throws `GSDC_QUESTIONS_UNRESOLVED` if not confirmed in `lib/plan-manager.js:267-272`. Therefore `readyToConfirm: true` only proves the field-completeness invariant, not that `resolve-questions` can succeed.
- Recommendation: Narrow the invariant to “cannot fail due to missing/placeholder required fields,” or introduce a separate `confirmed`/`readyToResolve` semantic for the post-confirmation state.
- Confidence: High