# Evaluator Prompt

You are running a clean-context evaluation of a multi-agent review experiment.

Do not edit source files. Read the experiment inputs and raw outputs, then produce a quality evaluation.

Experiment root:

`/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes`

Read:

- `PLAN.md`
- `input/target.md`
- `input/repo-context.md`
- all review files in `scenario-1/`, `scenario-2/`, and `scenario-3/`

Evaluate the quality of each scenario:

- Scenario 1: pragmatic, operator, modeler.
- Scenario 2: pragmatic, operator, modeler, agent-ux.
- Scenario 3: pragmatic, operator, modeler, agent-ux, security-integrity, qa-verification.

Classification labels:

- `valid`: accurate and actionable.
- `duplicate`: substantially same issue as another finding in the same scenario.
- `weak/speculative`: plausible but not well supported or low actionability.
- `false_positive`: wrong or contradicted by the target/repo.
- `already_covered`: issue is already explicitly addressed by the frozen target.

Scoring:

```text
High valid finding: +3
Medium valid finding: +2
Low valid finding: +1
Useful unique finding: +2
False positive: -2
Weak or speculative finding: -1
Excess duplicate: -1
```

Output Markdown with:

1. Executive summary.
2. Scorecard table:
   `Scenario | Agents | Valid High | Valid Medium | Valid Low | Unique Valid | Duplicates | Weak | False Positives | Score | Score/Agent`
3. Normalized findings by scenario.
4. Findings that only appeared in Scenario 2 or Scenario 3 and whether they justified the added agents.
5. Best default configuration recommendation.
6. Notes on evaluator confidence and unresolved ambiguity.
