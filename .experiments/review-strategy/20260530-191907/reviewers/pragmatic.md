# Review: pragmatic

## Summary

- Verdict: approve_with_changes
- Top risk: Inconsistency in exit codes and error mapping for "Plan not found" between existing code (which uses exit code 15 and `GSDC_JSON_PARSE_ERROR`) and the new proposed error `GSDC_PLAN_NOT_FOUND` (exit 24).
- Confidence: high

## Findings

### P2-001: Exit code inconsistency for plan not found error

- Severity: P2
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js
- Lines: 27-31, 399
- Claim: The proposal introduces `GSDC_PLAN_NOT_FOUND` (exit 24) for missing plans.
- Evidence: In the current codebase, `findPlanDir` throws an error with `GSDC_JSON_PARSE_ERROR` and exitCode `15` when a plan directory is not found.
- Impact: If the CLI does not align `findPlanDir`'s exception with the new `GSDC_PLAN_NOT_FOUND` (exit 24), there will be mismatched error behaviors between plan lookup operations and the rest of the CLI commands.
- Recommendation: Update `findPlanDir` in `lib/plan-manager.js` to throw `GSDC_PLAN_NOT_FOUND` with exit code `24` instead of `GSDC_JSON_PARSE_ERROR` with exit code `15`.
- Suggested test: Execute a command with a non-existent plan ID and assert that the CLI exits with code 24 and the error code is `GSDC_PLAN_NOT_FOUND`.
- Dedup key: plan-not-found-exit-code-alignment

### P3-001: Redundant choice validation logic when all choices allow custom values

- Severity: P3
- Category: cli-contract
- Status: valid
- File: docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md
- Lines: 85-162, 281-286
- Claim: Choice fields in `FIELD_REGISTRY` (`vertical`, `formato`, `cta`) all define `allowCustom: true`.
- Evidence: The proposal mentions "Choice custom permitido solo si `allowCustom === true`", but every choice field in the proposed registry has `allowCustom: true`.
- Impact: While the logic is robust, it represents a path that won't be fully exercised or tested unless a choice field with `allowCustom: false` is added.
- Recommendation: Keep the logic for future compatibility, but ensure there is a clear test case for `allowCustom: false` using a mock registry or an added field.
- Suggested test: Test `plan answer` validation against a temporary field where `allowCustom: false` to verify that invalid custom entries are blocked.
- Dedup key: choice-validation-allow-custom

## Non-Issues Checked

- Safe read-only behavior of `ensureQuestionFields()` in `questions()` and `status()` without mutating the disk prevents unwanted file touch/write operations on read commands.
- Atomic write pattern (`writeAtomicJson`) is correctly preserved and reused.

## Residual Risks

- None.
