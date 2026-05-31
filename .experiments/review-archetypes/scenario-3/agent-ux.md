# Review: Agent UX

## Findings

- Severity: High
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` accepts `mockup:pending_approval`, but the recovery flow does not define how that state becomes editable.
- Evidence: The proposal says accepted states include `mockup:pending_approval` at line 208, but line 209 only reverts `ready_for_html` to `mockup:questions_pending`. The later instruction says “Luego usa `plan answer`” at line 293, while `answer()` is specified to require `mockup:questions_pending` at line 174. In the current repo, `submitMockup()` transitions to `pending_approval` in `lib/plan-manager.js:395-397`.
- Recommendation: Specify that `reset-confirmation` must also revert `mockup:pending_approval` to `mockup:questions_pending`, with history update and stale mockup invalidation, so the documented correction flow works after a submitted mockup.
- Confidence: High

- Severity: Medium
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 265
- Claim: The optional `assets` question has no durable “declined” state, so agents may keep re-asking it.
- Evidence: Line 265 says if the user says no, “simplemente se omite” and “No se guarda valor placeholder.” Line 406 repeats that `assets` remains empty and `optionalPendingCount` remains greater than 0. But line 57 defines `allQuestionsAnswered` as false while `optionalPendingCount > 0`, leaving a permanent pending optional question even after the user explicitly declined.
- Recommendation: Store an explicit user answer such as `assets: "Sin assets"` or add structured metadata like `assetsDeclined: true`, then count it as no longer pending. Alternatively, rename the counter to make clear it means “empty optional fields,” not unanswered questions.
- Confidence: High

- Severity: Medium
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 258
- Claim: The rendering instruction can cause the agent to skip the optional assets question when all required fields are complete.
- Evidence: Line 258 says to present each pending question when `requiredPendingCount > 0`. If the six required fields are filled and only `assets` is pending, `requiredPendingCount` is 0 and this instruction no longer triggers, even though line 265 says the assets question is recommended when `optionalPendingCount > 0`.
- Recommendation: Change the rendering condition to iterate over `pending` questions, or explicitly say required questions are blocking and optional questions should be offered once when `optionalPendingCount > 0`.
- Confidence: High

- Severity: Low
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 159
- Claim: Reporting a missing plan as `GSDC_JSON_PARSE_ERROR` is misleading for agent recovery.
- Evidence: Lines 159, 194, and 217 specify `GSDC_JSON_PARSE_ERROR` for “Plan no existe,” while corrupt JSON also uses the same code at line 160. That collapses two different recovery paths: retry with a valid plan ID vs repair malformed JSON.
- Recommendation: Add a distinct error such as `GSDC_PLAN_NOT_FOUND`, or require `details.reason` to distinguish missing plan from corrupt JSON.
- Confidence: Medium