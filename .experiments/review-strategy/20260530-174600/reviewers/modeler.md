# Review: modeler

## Summary

- Verdict: approve_with_changes
- Top risk: Missing schema validation for `invocation` and `title` fields in capability loading, leading to malformed rendered outputs (e.g. `undefined` in markdown headers) for Codex, OpenCode, and Antigravity templates.
- Confidence: high

## Findings

### P2-001: Missing validation for title and invocation in loadCapability

- Severity: P2
- Category: cli-contract
- Status: valid
- File: lib/agent-adapters/index.js
- Lines: 47-58
- Claim: `loadCapability` only validates that `id` and `description` fields exist in `capability.json`.
- Evidence: In `lib/agent-adapters/index.js`, we only see validation checks for `id` and `description`. However, `antigravity-skill.js` relies on `capability.title`, while `codex-command.js` and `opencode-command.js` rely on `capability.invocation`.
- Impact: If a new capability is created without a `title` or `invocation`, the loader will successfully parse it. However, during the rendering phase, it will generate markdown files containing `# undefined` or `# Slash Command: undefined`, corrupting the agent instructions.
- Recommendation: Add validation for `title` and `invocation` in `loadCapability` inside `lib/agent-adapters/index.js`.
- Suggested test: Create a capability json missing `title` or `invocation`, call `loadCapability` or render it, and verify that it throws an appropriate validation error.
- Dedup key: missing-title-invocation-validation

### P3-001: Inconsistent casing normalization in Antigravity skill description formatting

- Severity: P3
- Category: docs
- Status: valid
- File: lib/agent-adapters/antigravity-skill.js
- Lines: 19-21
- Claim: The adapter normalizes the first character of the description to lowercase using a regex replacement.
- Evidence: `replace(/^\w/, c => c.toLowerCase())` is applied to `capability.description` when combined with triggers.
- Impact: If the description starts with markdown styling (e.g. `**Export** assets...`) or a non-word character, `replace(/^\w/)` will fail to match the first character, or if it starts with an acronym (e.g., `MCP tool`), it will lowercase the first letter to `mCP tool` which looks unprofessional.
- Recommendation: Avoid manual first-letter lowercasing or use a more precise string validation that preserves acronym capitalizations.
- Suggested test: Verify rendering with descriptions starting with formatting or acronyms.
- Dedup key: description-first-letter-lowercasing

## Non-Issues Checked

- "re-confirmation guard" semantics are clean and the Spanish grammar note under "confirmo" parsing is logically consistent with real-world agent interactions.

## Residual Risks

- None.
