# Review: operator

## Summary

- Verdict: approve
- Top risk: Stateless file generation in the adapters has no write locking or atomicity, but since capability generation is part of install/init commands, this is acceptable.
- Confidence: high

## Findings

### P3-001: Absence of atomic file writing in future adapter CLI commands

- Severity: P3
- Category: state
- Status: valid
- File: lib/agent-adapters/index.js
- Lines: 75-103
- Claim: The adapter library loads capability templates, but the actual writing of these files is delegated to caller commands.
- Evidence: `index.js` only exposes loaders and individual adapter renderers/targets.
- Impact: If the CLI commands utilizing these adapters write files directly with standard `fs.writeFileSync` without locking, concurrent CLI operations could result in partially written or corrupted skill files.
- Recommendation: Ensure that the CLI commands utilizing `getAdapter().getTargets()` write to target files atomically (e.g., writing to a temp file and renaming) and ideally respect the workspace locks if they run concurrently with agent operations.
- Suggested test: Document lock/concurrency requirements for downstream CLI integrations.
- Dedup key: adapter-atomic-writes

## Non-Issues Checked

- The removal of the persisted `staleMockupExists` flag in favor of a robust `mtime` check prevents potential deadlocks where a state machine could get stuck in an unrecoverable state due to disk-write failures.
- The `re-confirmation guard` successfully prevents silent mutation of locked questions.

## Residual Risks

- None.
