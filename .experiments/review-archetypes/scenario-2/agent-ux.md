# Review: Agent UX

## Findings

- Severity: Medium
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 258
- Claim: The chat-numbered choice flow can cause agents to save the literal number instead of the option value.
- Evidence: The proposal says to show choice options numbered plus “Otro” at lines 258-260, and then tells the agent to save `--value "<respuesta>"` at lines 267-270. `plan answer` is specified to write the provided value directly, with no option validation or mapping, at lines 156 and 172-177. A user answering “1” could therefore result in `"vertical": "1"` instead of `"SaaS / Producto Digital"`.
- Recommendation: Explicitly require the agent/UI to map numeric selections to the selected option’s `value` before calling `plan answer`; reject ambiguous numeric replies for text fields; add a CLI/contract test that `plan answer` is only called with final display text for choice selections.
- Confidence: High

- Severity: Medium
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 265
- Claim: Optional assets have no durable “declined” state, so agents may repeatedly ask a question the user already answered negatively.
- Evidence: The proposal says that if the user says no to assets, “simplemente se omite” and no placeholder is saved at line 265. It also states `assets` remains empty and `optionalPendingCount` remains greater than 0 when omitted at line 406. Since `questions()` reports pending fields from empty values, the system cannot distinguish “not yet asked” from “user declined assets.”
- Recommendation: Add an explicit representation for declined optional fields, such as `optionalResponses.assets = { status: "declined" }`, or allow a non-placeholder sentinel that is excluded from the hash/user-facing copy. Ensure `questions()` stops surfacing assets after a user declines, while still keeping it editable via reset or a new answer.
- Confidence: High

- Severity: Medium
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 287
- Claim: The stop/continue instruction can be read as forbidding the next section’s autonomous mockup generation even after confirmation.
- Evidence: Line 287 says it is prohibited to generate `mockup.html` or execute phase-transition commands autonomously, with only `confirm-decisions` and `resolve-questions` listed as exceptions. The proposal’s note at line 240 says Section 3 will still create `mockup.html` after `resolve-questions`, and the current template does exactly that at `templates/commands/canva-mockup.md:56-63`. The replacement text itself does not scope the prohibition to “during Section 2 / before entering Section 3.”
- Recommendation: Reword line 287 to explicitly say the prohibition applies only before explicit confirmation and while still inside the yield gate; after `resolve-questions` succeeds, the agent should continue to Section 3 unless the user asked it to stop.
- Confidence: High

- Severity: Low
- File: `/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`
- Line: 159
- Claim: Reporting a missing plan as `GSDC_JSON_PARSE_ERROR` creates misleading recovery guidance for agents and users.
- Evidence: The proposal specifies “Plan no existe → `GSDC_JSON_PARSE_ERROR`” at lines 159, 194, 217, and 340. In current code, `findPlanDir()` also throws `GSDC_JSON_PARSE_ERROR` for a missing plan at `lib/plan-manager.js:27-31`. From a UX standpoint, “JSON parse error” implies corrupt JSON rather than wrong ID, missing workspace, or wrong current directory.
- Recommendation: Introduce a distinct `GSDC_PLAN_NOT_FOUND` or include structured details like `{ reason: "plan_not_found", planId, cwd }`, and give the human-mode error a concrete recovery step: run `gsd-canva plan list` or verify the working directory.
- Confidence: High