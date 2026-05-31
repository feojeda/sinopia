## Executive Summary

Scenario 2 is the best default. It adds the Agent UX reviewer, which produced several genuinely useful findings that the 3-agent setup missed: numeric choice mapping, optional `assets` decline state, and template stop/continue ambiguity. Scenario 3 found a few more useful issues, but most added output duplicated the same `reset-confirmation` / `pending_approval` defect and lowered efficiency.

The strongest overall finding across all scenarios was the same: `reset-confirmation` accepts `mockup:pending_approval` but does not clearly revert that state to `mockup:questions_pending`, so `plan answer` remains blocked and stale/invalid mockups may still be approvable.

## Scorecard

| Scenario | Agents | Valid High | Valid Medium | Valid Low | Unique Valid | Duplicates | Weak | False Positives | Score | Score/Agent |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Scenario 1 | 3 | 2 | 4 | 0 | 6 | 3 | 0 | 0 | 23 | 7.67 |
| Scenario 2 | 4 | 1 | 6 | 1 | 8 | 2 | 0 | 0 | 30 | 7.50 |
| Scenario 3 | 6 | 2 | 6 | 2 | 10 | 7 | 0 | 0 | 33 | 5.50 |

Scoring used: severity points for each unique valid finding, `+2` per useful unique valid finding, and duplicate/noise penalties.

## Normalized Findings

### Scenario 1

| Finding | Severity | Classification | Notes |
|---|---:|---|---|
| `reset-confirmation` accepts `mockup:pending_approval` but only defines rollback for `ready_for_html`, leaving `plan answer` blocked. | High | valid | Accurate and highly actionable. Found by all three agents; two excess duplicates. |
| Partial failure/idempotence claim relies on `submitMockup()`, but `pending_approval` cannot be checked by `submitMockup()` and can proceed to approval. | High | valid | Distinct enough from the rollback issue because it identifies the approval-path integrity gap. One duplicate. |
| `answer()` sample shows `{ ok, data }`, but CLI already wraps results, risking double-wrapped JSON. | Medium | valid | Accurate against `bin/gsd-canva.js`. |
| `readJsonOrThrow()` instruction is too broad because `list()` intentionally skips corrupt plans. | Medium | valid | Accurate and useful contract-preservation finding. |
| `questions()` lacks a consistent-read/lock requirement and can race with mutating commands. | Medium | valid | Plausible and actionable; not as critical as mutating lock issues. |
| `readyToConfirm: true` does not mean `resolve-questions` cannot fail, because confirmation/hash checks still apply. | Medium | valid | Accurate semantic correction. |

### Scenario 2

| Finding | Severity | Classification | Notes |
|---|---:|---|---|
| `reset-confirmation` / `pending_approval` rollback and stale approval risk. | High | valid | Same core high-value issue as Scenario 1. Two excess duplicates. |
| CLI contract tests need isolated temp workspaces and cwd restoration, not the shared fixed `plan_001` fixture. | Medium | valid | Useful implementation-test risk. |
| CLI JSON shape is ambiguous; manager should return raw data and CLI should wrap once. | Medium | valid | Accurate; overlaps Scenario 1 but unique within Scenario 2. |
| `readyToConfirm` invariant overclaims `resolve-questions` readiness. | Medium | valid | Accurate. |
| Chat-numbered choices can cause agents to save `"1"` instead of the option `value`. | Medium | valid | Strong Agent UX finding; directly actionable. |
| Optional `assets` has no durable declined state, causing repeated prompting or permanently false `allQuestionsAnswered`. | Medium | valid | Strong Agent UX finding. |
| Section 2’s prohibition on autonomous `mockup.html` generation can be read as conflicting with Section 3 after confirmation. | Medium | valid | Useful template ambiguity finding. |
| Missing plan reported as `GSDC_JSON_PARSE_ERROR` gives poor recovery guidance. | Low | valid | Lower priority because it preserves existing behavior, but valid UX concern. |

### Scenario 3

| Finding | Severity | Classification | Notes |
|---|---:|---|---|
| `reset-confirmation` / `pending_approval` rollback gap blocks editing. | High | valid | Found repeatedly by nearly every agent; heavy duplication. |
| `pending_approval` stale artifact can still be approved because `approve-mockup` does not re-check artifact/hash. | High | valid | Security/Integrity and Operator framed this well. |
| `readJsonOrThrow()` should not mechanically change tolerant `plan list` behavior. | Medium | valid | Accurate. |
| `answer()` operation order mentions reading `decisions.json` before validating state, but state lives in `plan.json`. | Low | valid | Minor but actionable wording fix. |
| `readyToConfirm` overclaims readiness for `resolve-questions`. | Medium | valid | Accurate. |
| Optional `assets` lacks durable declined state. | Medium | valid | Accurate and useful. |
| Rendering condition tied to `requiredPendingCount > 0` can skip the optional assets question once required fields are complete. | Medium | valid | Good additional Agent UX detail. |
| Missing plan uses misleading `GSDC_JSON_PARSE_ERROR`. | Low | valid | Valid but low priority. |
| `answer()` response shape risks double CLI wrapping. | Medium | valid | Accurate; QA marked high, but practical severity is medium. |
| CLI tests should assert status/stdout/stderr/error JSON, not only use `execSync`. | Medium | valid | Useful QA addition. |

## Larger-Scenario-Only Findings

Scenario 2 added meaningful value over Scenario 1. The Agent UX reviewer found three issues that justified the fourth agent: numeric choice mapping, optional `assets` decline persistence, and the Section 2 / Section 3 autonomy ambiguity.

Scenario 3 added some value, mainly from QA and Security/Integrity: stricter CLI stdout/stderr assertions and a sharper approval-integrity regression test. However, the added agents mostly repeated the same `pending_approval` reset defect. The marginal quality gain did not justify the extra consolidation cost for default use.

## Recommendation

Use Scenario 2 as the default configuration: pragmatic, operator, modeler, and agent-ux.

It preserves most of Scenario 1’s efficiency while catching user/agent workflow ambiguities that the core engineering reviewers missed. Reserve Scenario 3 for higher-risk plans involving security boundaries, artifact integrity, external inputs, or complex test/CI contracts.

## Confidence

Evaluator confidence is high. The major findings were verified against the frozen target and current repo contracts, especially CLI JSON wrapping, state transitions, approval behavior, and tolerant `plan list` parsing.

The main ambiguity is scoring granularity: the `reset-confirmation` rollback bug and stale `pending_approval` approval bug are tightly related. I treated them as separate normalized findings when the raw review identified a distinct failure mode and recovery/approval consequence.