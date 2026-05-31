# Review: Pragmatic

## Findings

- Severity: High
- File: `.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` accepts `mockup:pending_approval`, but only `ready_for_html` is explicitly reverted to `mockup:questions_pending`.
- Evidence: The proposal says accepted states include `mockup:pending_approval` at line 208, then only describes reverting `ready_for_html` at line 209. Current code allows `approve-mockup` from `mockup:pending_approval` by state check only in `lib/plan-manager.js:445-454`; it does not verify `mockup.html` still exists. `submitMockup()` checks `mockup.html`, but only when state is `mockup:ready_for_html` in `lib/plan-manager.js:357-388`.
- Recommendation: Specify that `reset-confirmation` must revert both `ready_for_html` and `pending_approval` to `mockup:questions_pending`, or disallow `pending_approval`. Otherwise a stale/missing mockup can remain in `pending_approval` and still be approved.
- Confidence: High

- Severity: Medium
- File: `.experiments/review-archetypes/input/target.md`
- Line: 352
- Claim: Add CLI contract tests in `tests/plan.test.js` using a temporary clean workspace.
- Evidence: Existing `tests/plan.test.js` uses one shared `tempProjectDir`, changes cwd once, creates fixed plan `001`, and then mutates it through the full lifecycle in `tests/plan.test.js:23-190`. Adding child-process CLI tests into the same flow risks conflicting with the existing fixed ID and cwd unless the plan explicitly requires isolated setup/teardown per CLI contract test.
- Recommendation: Make the acceptance criteria explicit: CLI contract tests should create their own temp workspace, run `installer.init()` or `gsd-canva init`, avoid reusing the existing `plan_001` lifecycle fixture, and restore cwd after each test block.
- Confidence: Medium

- Severity: Medium
- File: `.experiments/review-archetypes/input/target.md`
- Line: 230
- Claim: In `--json` mode, the new commands “retorna JSON en stdout.”
- Evidence: The current CLI always wraps successful JSON output as `{ ok: true, data }` in `bin/gsd-canva.js:36-40`. The `questions()` section shows a raw schema object at lines 64-153, while the `answer()` section shows a wrapped CLI-shaped response at lines 179-189. This ambiguity can lead implementers or tests to assert the wrong stdout contract.
- Recommendation: State clearly that manager functions return raw data, while CLI `--json` stdout must use the existing `{ ok: true, data }` envelope. Update verification steps to parse `data.requiredPendingCount`, not a top-level field.
- Confidence: High