# Review: Pragmatic

## Findings

- Severity: High
- File: `.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` accepts `mockup:pending_approval` and enables correction by using `plan answer` afterward.
- Evidence: The proposal only says to revert `ready_for_html` to `mockup:questions_pending` at line 209. Existing `answer()` is specified to reject any state other than `mockup:questions_pending` at lines 174-196, and the current state machine uses `pending_approval` after `submitMockup()` in `lib/plan-manager.js:395-397`. If `reset-confirmation` accepts `pending_approval` but does not revert it, the follow-up `plan answer` flow described at lines 220 and 293 remains blocked.
- Recommendation: Specify that both `mockup:ready_for_html` and `mockup:pending_approval` revert to `mockup:questions_pending`, with a history event and stale `mockup.html` invalidation.
- Confidence: High

- Severity: Medium
- File: `.experiments/review-archetypes/input/target.md`
- Line: 179
- Claim: `answer()` returns an object shaped as `{ ok: true, data: { ... } }`.
- Evidence: The existing CLI wrapper already wraps every command result in `{ ok: true, data }` in `bin/gsd-canva.js:36-40`. Existing plan-manager functions return raw data objects, for example `confirmDecisions()` returns `{ planId, confirmed, decisionsHash }` in `lib/plan-manager.js:227-231`. If implementers follow the sample literally inside `lib/plan-manager.js`, CLI JSON becomes double-wrapped.
- Recommendation: State that plan-manager `answer()` returns raw data only, and the shown `{ ok: true, data }` envelope is CLI stdout in `--json` mode.
- Confidence: High

- Severity: Medium
- File: `.experiments/review-archetypes/input/target.md`
- Line: 38
- Claim: `readJsonOrThrow()` should be used in “las existentes que usan JSON.parse directo”.
- Evidence: Current `lib/plan-manager.js` has direct `JSON.parse(fs.readFileSync(...))` in mutating functions and also in `list()` where corrupt plans are intentionally ignored (`lib/plan-manager.js:624-644`). Applying the helper mechanically to all existing direct parses would change `list()` behavior from tolerant listing to failing the whole command on one corrupt plan.
- Recommendation: Narrow the instruction to stateful commands that must fail on corrupt JSON, and explicitly preserve `list()`’s current “ignore corrupt plans” behavior unless intentionally changing that contract.
- Confidence: High
