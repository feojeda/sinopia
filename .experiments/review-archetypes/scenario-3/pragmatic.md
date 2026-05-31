# Review: Pragmatic

## Findings

- Severity: High
- File: `.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` accepts `mockup:pending_approval`, then the user can use `plan answer` to modify fields.
- Evidence: The plan only specifies reverting to `mockup:questions_pending` when the state is `ready_for_html` on lines 209 and 220. It does not say to revert `pending_approval`. But `plan answer` is specified to reject any state other than `mockup:questions_pending` on line 174. Current code transitions submitted mockups to `pending_approval` in `lib/plan-manager.js:397`, and approval expects `pending_approval` in `lib/plan-manager.js:446`.
- Recommendation: Specify that `reset-confirmation` reverts both `mockup:ready_for_html` and `mockup:pending_approval` to `mockup:questions_pending`, and include a test for reset from `pending_approval`.
- Confidence: High

- Severity: Medium
- File: `.experiments/review-archetypes/input/target.md`
- Line: 213
- Claim: If `reset-confirmation` fails after renaming `mockup.html`, re-running it or regenerating the mockup is sufficient and no rollback is needed.
- Evidence: If the plan remains `mockup:ready_for_html`, `submitMockup()` will detect missing `mockup.html` as stated. But if the plan remains `mockup:pending_approval`, `submitMockup()` cannot be used because current `submitMockup()` only accepts `mockup:ready_for_html` in `lib/plan-manager.js:357-363`, while approval can still proceed from `pending_approval` in `lib/plan-manager.js:445-454`. That leaves a state that can be approved even though the mockup was invalidated.
- Recommendation: For `pending_approval`, require `reset-confirmation` to update `plan.json` to `questions_pending` before or atomically with stale-renaming, or make `approve-mockup` validate that `mockup.html` still exists and is not stale.
- Confidence: High

- Severity: Medium
- File: `.experiments/review-archetypes/input/target.md`
- Line: 38
- Claim: Use `readJsonOrThrow()` in “the existing functions that use `JSON.parse` directo.”
- Evidence: `lib/plan-manager.js` uses direct JSON parsing in mutating lifecycle functions, but `list()` intentionally catches corrupt `plan.json` and skips bad plans in `lib/plan-manager.js:628-644`. Applying `readJsonOrThrow()` mechanically to all existing parses would change `plan list` behavior from tolerant listing to failing the whole command on one corrupt plan.
- Recommendation: Scope the helper requirement to functions where corrupt JSON should be fatal, and explicitly preserve `list()`’s skip-corrupt-plan behavior unless the desired CLI contract is changing.
- Confidence: High

- Severity: Low
- File: `.experiments/review-archetypes/input/target.md`
- Line: 174
- Claim: `answer()` operation order is “acquire lock → leer `decisions.json` → validar estado...”
- Evidence: The state lives in `plan.json`, not `decisions.json`; current lifecycle functions read `plan.json` to validate phase/status, for example `confirmDecisions()` in `lib/plan-manager.js:173-179` and `resolveQuestions()` in `lib/plan-manager.js:257-263`.
- Recommendation: Change the order to explicitly read both `plan.json` and `decisions.json` inside the lock before validating state and confirmation. This removes ambiguity for implementers.
- Confidence: High