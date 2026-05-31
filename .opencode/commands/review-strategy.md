# Slash Command: /review-strategy <1|2|3> <target>

Run a structured review using the local strategy definitions in `docs/REVIEW_STRATEGIES.md` and the consolidation procedure in `docs/REVIEW_CONSOLIDATION.md`.

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
3. Read `docs/REVIEW_STRATEGIES.md` for reviewer archetypes and strategy configuration.
4. Follow the matching strategy exactly:
   - `1`: Review eficiente (pragmatic, operator, modeler).
   - `2`: Default recomendado (pragmatic, operator, modeler, agent-ux).
   - `3`: Review ampliado (pragmatic, operator, modeler, agent-ux, security-integrity, qa-verification).
5. Use the standard review output template from `docs/REVIEW_STRATEGIES.md` for each reviewer.
6. Keep reviewer contexts isolated — reviewers must not read each other's outputs.
7. Do not edit the review target or source files.
8. Each reviewer subagent **writes its own output file** directly to `.experiments/review-strategy/<timestamp>/reviewers/<archetype>.md` using the Write tool. The main agent must NOT read subagent response content — only confirm completion.
9. Read `docs/REVIEW_CONSOLIDATION.md` for the consolidation procedure.
10. Run an independent consolidator subagent that reads the reviewer files from disk and merges them into a single consolidated review.
11. The consolidator subagent writes `review.md` directly to the experiment directory.
12. Return a concise summary with links to:
    - the consolidated review (`review.md`)
    - raw reviewer outputs

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
  review.md
```

Only create files needed by the selected strategy.

## Final Response

Report:

- strategy used
- target reviewed
- verdict (approve / approve_with_changes / reject_until_fixed)
- top findings
- recommendation
- path to `review.md`
