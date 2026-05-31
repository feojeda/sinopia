# Slash Command: /review-strategy <1|2|3> <target>

Run a structured review using the local strategy definitions in `docs/REVIEW_STRATEGIES.md`.

The primary output is an actionable consolidated review of the target, not an evaluation of reviewer quality. Reviewer-quality scoring is secondary metadata.

This command is local to this repository. It is not part of the installable `gsd-canva` command templates and must not be copied into `templates/commands/`.

## Invocation

```text
/review-strategy 1 docs/PROPOSAL_v1.2_interactive_questions.md
/review-strategy 2 docs/PROPOSAL_v1.2_interactive_questions.md
/review-strategy 3 current-pr
```

## Required Behavior

When invoked:

1. Parse the first argument as the strategy number: `1`, `2`, or `3`.
2. Parse the remaining argument(s) as the review target.
3. Read `docs/REVIEW_STRATEGIES.md`.
4. Follow the matching strategy exactly:
   - `1`: Review eficiente.
   - `2`: Default recomendado.
   - `3`: Review ampliado.
5. Use the standard review output template from `docs/REVIEW_STRATEGIES.md`.
6. Run reviewer subagents with low reasoning/low-cost settings by default.
7. Keep reviewer contexts isolated.
8. Do not edit the review target or source files.
9. Save raw reviewer outputs separately under `.experiments/review-strategy/`.
10. Run an independent consolidator after all reviewer outputs are complete.
11. The consolidator must produce `review-report.md`: a unified, deduplicated, actionable review for the target.
12. If useful, also produce reviewer-quality artifacts (`review-quality.md`, `scorecard.md`, `normalized-findings.json`) as secondary outputs.
13. Return a concise summary with links to:
    - raw reviewer outputs
    - consolidated review report
    - reviewer-quality report, if generated
    - scorecard, if generated
    - normalized findings, if generated

## Target Handling

- If the target is a file path, freeze a copy into the experiment input directory before review.
- If the target is `current-pr`, inspect the current git branch/diff and freeze the relevant diff/context into the experiment input directory.
- If the target is ambiguous, ask one concise clarification question before running agents.

## Experiment Directory

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

Only create files needed by the selected strategy.

## Final Response

Report:

- strategy used
- target reviewed
- top consolidated findings
- recommendation
- paths to generated artifacts

## Consolidated Review Report Requirements

`evaluation/review-report.md` must be written for the implementer of the target document or PR. It should not primarily discuss which reviewer performed better.

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

## Reviewer-Quality Report Requirements

Only create `evaluation/review-quality.md` when comparing strategies or when the user asks about review quality. This report may include duplicate counts, score per agent, false positives, and which archetypes added value.

## Cost Control

- Reviewer subagents must run with low reasoning/low-cost settings.
- Do not use high-reasoning reviewer agents unless the user explicitly asks for it.
- The consolidator may also use low reasoning by default; use higher reasoning only if the user explicitly asks for a higher-quality consolidation.
