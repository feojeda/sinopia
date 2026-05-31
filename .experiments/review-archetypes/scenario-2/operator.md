# Review: Operator

## Findings

- Severity: High
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` accepts `mockup:pending_approval` as a valid state, invalidates `mockup.html`, and unlocks decisions for correction.
- Evidence: The proposal only specifies reverting `ready_for_html` to `mockup:questions_pending` at line 209, while line 213 explicitly allows the plan to remain in `pending_approval` after `mockup.html` is renamed stale. In the current repo, `plan answer` would only be valid in `mockup:questions_pending` per the proposed validation at target line 174, and current approval only checks state `mockup:pending_approval` without revalidating `mockup.html` or the decision hash: `/Users/franciscoojeda/gsd-canva/lib/plan-manager.js:445`. That means reset from `pending_approval` can leave an invalidated/stale mockup in a state that cannot be edited with `plan answer`, yet can still be approved via `approve-mockup`.
- Recommendation: For `pending_approval`, either revert the plan to `mockup:questions_pending` just like `ready_for_html`, or reject reset in `pending_approval`. Also add an approval guard or test ensuring `approve-mockup` cannot approve after `mockup.html` has been stale-renamed and confirmation cleared.
- Confidence: High