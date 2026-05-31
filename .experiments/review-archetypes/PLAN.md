# Review Archetypes Experiment Plan

## Objective

Compare whether using more low-reasoning subagents with different review archetypes improves architectural review quality enough to justify the extra cost and consolidation work.

The experiment compares three scenarios against the same frozen review target:

- Scenario 1: 3 styles, 3 subagents.
- Scenario 2: 4 styles, 4 subagents.
- Scenario 3: 6 styles, 6 subagents.

All reviewers must run with clean context, `low` reasoning, and no access to other reviewers' outputs.

## Directory Layout

```text
.experiments/review-archetypes/
  PLAN.md
  input/
    target.md
    repo-context.md
  scenario-1/
    pragmatic.md
    operator.md
    modeler.md
  scenario-2/
    pragmatic.md
    operator.md
    modeler.md
    agent-ux.md
  scenario-3/
    pragmatic.md
    operator.md
    modeler.md
    agent-ux.md
    security-integrity.md
    qa-verification.md
  evaluation/
    evaluator-report.md
    normalized-findings.json
    scorecard.md
```

## Reviewer Archetypes

Scenario 1:

- Pragmatic: implementation feasibility, CLI behavior, tests, compatibility with current code.
- Operator: state transitions, locks, partial failures, recovery, idempotency.
- Modeler: concepts, invariants, naming, contracts, semantic consistency.

Scenario 2:

- All Scenario 1 archetypes.
- Agent/UX: how an agent or user could misread the flow, interactive-question ergonomics, ambiguous instructions.

Scenario 3:

- All Scenario 2 archetypes.
- Security/Integrity: tampering, hashes, trust boundaries, permission assumptions, protected artifacts.
- QA/Verification: acceptance criteria, reproducibility, CI behavior, coverage gaps, test isolation.

## Reviewer Output Format

Each reviewer writes one Markdown file with raw findings:

```text
# Review: <archetype>

## Findings

- Severity: High | Medium | Low
- File:
- Line:
- Claim:
- Evidence:
- Recommendation:
- Confidence: High | Medium | Low
```

Reviewer rules:

- Do not edit repository source files.
- Do not read other scenario outputs.
- Do not assume conversation context.
- Use concrete file and line references.
- Report style or wording issues only when they create implementation ambiguity or agent/user risk.

## Independent Evaluator

After all scenario outputs exist, run one clean-context evaluator. The evaluator receives only:

- `input/target.md`
- `input/repo-context.md`
- all raw reviewer outputs
- this plan and rubric

The evaluator must:

- Deduplicate equivalent findings.
- Classify each finding as `valid`, `duplicate`, `weak/speculative`, `false_positive`, or `already_covered`.
- Score each scenario.
- Identify useful findings that appeared only in larger scenarios.
- Report noise and false-positive sources.

## Scoring Rubric

```text
High valid finding: +3
Medium valid finding: +2
Low valid finding: +1
Useful unique finding: +2
False positive: -2
Weak or speculative finding: -1
Excess duplicate: -1
```

Final metrics:

```text
scenario_score
score_per_agent
valid_high
valid_medium
valid_low
unique_valid_findings
duplicates
false_positives
weak_findings
best_unique_finding
noise_summary
```

## Procedure

1. Freeze the target document into `input/target.md`.
2. Capture minimal repo context into `input/repo-context.md`.
3. Run Scenario 1 with 3 clean-context low-reasoning subagents.
4. Run Scenario 2 with 4 clean-context low-reasoning subagents.
5. Run Scenario 3 with 6 clean-context low-reasoning subagents.
6. Save each raw review to its scenario file.
7. Run the independent evaluator.
8. Produce:
   - `evaluation/normalized-findings.json`
   - `evaluation/scorecard.md`
   - `evaluation/evaluator-report.md`

## Success Criteria

The experiment should answer:

- Whether 4 archetypes add meaningful value over 3.
- Whether 6 archetypes add enough unique valid findings to justify the extra cost.
- Which archetypes produce the strongest findings.
- Which archetypes produce the most noise.
- Which configuration should be used by default for future proposal reviews.

## Initial Hypothesis

- 3 agents should be the most efficient.
- 4 agents should likely provide the best quality/cost balance.
- 6 agents should improve coverage but produce more duplication and consolidation overhead.

The main comparison should be based on valid unique findings and `score_per_agent`, not raw finding count.
