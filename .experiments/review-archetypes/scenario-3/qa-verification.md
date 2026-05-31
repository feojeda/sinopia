# Review: QA Verification

## Findings

- Severity: High
- File: `.experiments/review-archetypes/input/target.md`
- Line: 179
- Claim: `answer()` returns an object already wrapped as `{ ok: true, data: ... }`.
- Evidence: The CLI success handler already wraps every command result as `{ ok: true, data }` in `bin/gsd-canva.js:36-40`. If `planManager.answer()` returns the shape shown in the proposal, `gsd-canva plan answer --json` will emit nested JSON like `{ "ok": true, "data": { "ok": true, "data": ... } }`, unlike the existing CLI contract.
- Recommendation: Specify that `answer()` returns bare data only, e.g. `{ planId, field, value, requiredPendingCount, optionalPendingCount }`, and let `handleSuccess()` perform the only `ok/data` wrapping. Add a CLI contract test asserting the exact JSON shape.
- Confidence: High

- Severity: High
- File: `.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` accepts `mockup:pending_approval` and enables editing confirmed decisions.
- Evidence: The proposal accepts `mockup:pending_approval` at line 208, but only defines reverting `ready_for_html` to `questions_pending` at line 209. The existing state machine reaches `pending_approval` after `submitMockup()` in `lib/plan-manager.js:395-405`. `answer()` is specified to allow only `mockup:questions_pending` at target line 174. If reset from `pending_approval` leaves the plan in `pending_approval`, `plan answer` remains blocked, contradicting line 220 and line 293.
- Recommendation: Define reset behavior for `mockup:pending_approval` explicitly, most likely reverting it to `mockup:questions_pending`, and add a test for reset from `pending_approval` followed by successful `plan answer`.
- Confidence: High

- Severity: Medium
- File: `.experiments/review-archetypes/input/target.md`
- Line: 350
- Claim: CLI contract tests are covered by adding `child_process` tests for the new subcommands.
- Evidence: The listed CLI test guidance only says to execute subcommands through `execSync` and capture dynamic plan IDs at lines 352-355. It does not require assertions for the existing stdout/stderr/exit-code contract: JSON successes must write only stdout and exit 0 in `bin/gsd-canva.js:36-40`, while JSON errors must write only stderr and exit with the command-specific code in `bin/gsd-canva.js:56-66`.
- Recommendation: Use `spawnSync` or equivalent for CLI tests and assert status code, stdout, stderr, and parseable JSON for both success and negative cases, especially `GSDC_INVALID_FIELD` exit 22, `GSDC_DECISIONS_LOCKED` exit 23, and `GSDC_INVALID_STATE` exit 13.
- Confidence: High