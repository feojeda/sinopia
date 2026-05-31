# Review: Operator

## Findings

- Severity: High
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` accepts `mockup:pending_approval` and unlocks decisions for correction.
- Evidence: The proposal only reverts `ready_for_html` to `questions_pending` on line 209. For `pending_approval`, it would clear confirmation and rename `mockup.html`, but leave `plan.json` in `mockup:pending_approval`. The proposed `answer()` only allows `mockup:questions_pending` (line 174), so the user cannot actually edit after reset. Worse, current approval only checks `mockup:pending_approval` and then moves to approved; it does not re-check `mockup.html` or the decisions hash: `/Users/franciscoojeda/gsd-canva/lib/plan-manager.js:445`.
- Recommendation: For both `ready_for_html` and `pending_approval`, `resetConfirmation()` should transition back to `mockup:questions_pending`, append history, and invalidate any existing mockup artifact before unlocking decisions.
- Confidence: High

- Severity: High
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 213
- Claim: A failed `reset-confirmation` leaves a detectable consistent state because `submitMockup()` will detect missing `mockup.html`.
- Evidence: This is only true for `ready_for_html`. If reset is run from `mockup:pending_approval`, `submitMockup()` is no longer in the path because it requires `mockup:ready_for_html`: `/Users/franciscoojeda/gsd-canva/lib/plan-manager.js:357`. The next valid lifecycle command is `approve-mockup`, which only validates state and does not inspect the artifact: `/Users/franciscoojeda/gsd-canva/lib/plan-manager.js:445`.
- Recommendation: Do not rely on `submitMockup()` for recovery from `pending_approval`. Either always revert `pending_approval` to `questions_pending` before or atomically with artifact invalidation, or make `approve-mockup` verify the submitted artifact and decisions hash.
- Confidence: High

- Severity: Medium
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 60
- Claim: `questions(planId)` reads plan state and decisions to report pending fields.
- Evidence: The proposal does not require `questions()` to acquire the global lock, while all current mutating state-machine operations acquire it before reading and writing: `/Users/franciscoojeda/gsd-canva/lib/plan-manager.js:156`, `/Users/franciscoojeda/gsd-canva/lib/plan-manager.js:240`, `/Users/franciscoojeda/gsd-canva/lib/plan-manager.js:340`. Without the same lock, `questions()` can race with `answer()`, `confirm-decisions`, or `reset-confirmation` and return counters from a mixed snapshot of `plan.json` and `decisions.json`.
- Recommendation: Have `questions()` acquire the same global lock while reading `plan.json` and `decisions.json`, or define a retryable consistent-read protocol that detects changed mtimes/hashes between reads.
- Confidence: Medium