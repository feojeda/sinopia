---
name: review-strategy
description: Use when the user invokes /review-strategy or asks to run review strategy 1, 2, or 3 for a document, PR, branch, diff, or current changes. Runs low-cost clean-context reviewer agents using docs/REVIEW_STRATEGIES.md, then produces an actionable consolidated review.
---

# Review Strategy

Run structured multi-agent reviews for this repository.

This skill is local to the workspace. It is not part of the installable `gsd-canva` command templates and must not be copied into `templates/commands/`.

## Trigger

Use this skill when the user says any of:

- `/review-strategy 1 <target>`
- `/review-strategy 2 <target>`
- `/review-strategy 3 <target>`
- `usa review strategy 2 para <target>`
- `usa la estrategia de review 3 para este PR`

## Core Rules

- Read `docs/REVIEW_STRATEGIES.md` before running the review.
- Treat the first argument as strategy number `1`, `2`, or `3`.
- Treat the remaining argument(s) as the review target.
- The main output is an actionable consolidated review, not a quality evaluation of the reviewers.
- Reviewer agents must run with low reasoning/low-cost settings by default.
- Do not use high-cost reviewer agents unless the user explicitly asks.
- Keep reviewer contexts isolated; reviewers must not read each other's outputs.
- Do not edit the target or source files under review.
- Save raw reviewer outputs to disk.
- Run an independent consolidator after all reviewer outputs complete.

## Strategies

- Strategy 1: `pragmatic`, `operator`, `modeler`
- Strategy 2: `pragmatic`, `operator`, `modeler`, `agent-ux`
- Strategy 3: `pragmatic`, `operator`, `modeler`, `agent-ux`, `security-integrity`, `qa-verification`

Use Strategy 2 as the default only when the user does not specify a number.

## Target Handling

- If target is a file path: freeze a copy into the experiment input directory.
- If target is `current-pr`: inspect the current branch/diff and freeze the relevant diff/context.
- If target is ambiguous: ask one concise clarification question.

## Output Directory

Use a timestamped directory:

```text
.experiments/review-strategy/YYYYMMDD-HHMMSS/
  input/
    target.md | diff.patch
    repo-context.md
  reviewers/
    pragmatic.md
    operator.md
    modeler.md
    agent-ux.md
    security-integrity.md
    qa-verification.md
  evaluation/
    review-report.md
    review-quality.md
    scorecard.md
    normalized-findings.json
```

Only create reviewer files required by the selected strategy.

## Reviewer Instructions

Each reviewer must:

- Use the standard review template from `docs/REVIEW_STRATEGIES.md`.
- Focus only on its assigned archetype.
- Produce atomic findings with severity `P1`, `P2`, or `P3`.
- Include `Dedup key` for each finding.
- Write its output to `.experiments/review-strategy/<timestamp>/reviewers/<archetype>.md`.

## Consolidator Instructions

The consolidator must read all raw reviewer outputs and write:

```text
.experiments/review-strategy/<timestamp>/evaluation/review-report.md
```

`review-report.md` is for the implementer. It must deduplicate findings and prioritize actionable fixes.

Required sections:

```md
# Consolidated Review: <target>

## Verdict

approve | approve_with_changes | reject_until_fixed

## Priority Findings

### P1-001: <title>

- Category:
- Source reviewers:
- File:
- Lines:
- Problem:
- Evidence:
- Impact:
- Required change:
- Suggested test:
- Dedup key:

## Secondary Findings

<P2/P3 findings in the same format>

## Non-Issues Confirmed

- <items checked and considered OK>

## Implementation Checklist

- [ ] <concrete change>

## Residual Risks

- <remaining ambiguity>
```

Only create `review-quality.md`, `scorecard.md`, or `normalized-findings.json` when the user asks to compare reviewer quality or when the run is explicitly experimental.

## Final Response

Return a concise summary with:

- strategy used
- target reviewed
- verdict
- top consolidated findings
- path to `evaluation/review-report.md`
- paths to raw reviewer outputs
