# Reviewer Prompt: Agent UX

You are running a clean-context, read-only review for an experiment.

Review the frozen target document:

`/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/target.md`

Against the repo:

`/Users/franciscoojeda/gsd-canva`

Use this repo context file as a starting point, but verify claims against files when needed:

`/Users/franciscoojeda/gsd-canva/.experiments/review-archetypes/input/repo-context.md`

Archetype: Agent/UX architect.

Focus on how an AI agent or user could misunderstand the flow, interactive-question ergonomics, ambiguous stop/continue instructions, optional data handling, and error recovery from the user's point of view.

Rules:

- Read only. Do not edit files.
- Do not assume any conversation context.
- Do not read other scenario outputs.
- Prefer concrete bugs over style issues.
- Use file and line references.
- If there are no findings, say so explicitly.

Output exactly this structure:

```markdown
# Review: Agent UX

## Findings

- Severity: High | Medium | Low
- File:
- Line:
- Claim:
- Evidence:
- Recommendation:
- Confidence: High | Medium | Low
```
