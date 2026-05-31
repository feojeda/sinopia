# Review: pragmatic

## Summary

- Verdict: approve_with_changes
- Top risk: `loadAllCapabilities` will throw an unhandled exception and crash if any sub-directory inside `templates/agent-source` is missing a `capability.json` file (e.g. system directories, backups, or temporary folders created during development or testing).
- Confidence: high

## Findings

### P2-001: loadAllCapabilities crashes on non-capability directories

- Severity: P2
- Category: cli-contract
- Status: valid
- File: lib/agent-adapters/index.js
- Lines: 85-92
- Claim: The adapter loader iterates through all entries in the `sourceRoot` directory and attempts to load them if they are directories.
- Evidence: `fs.statSync(dirPath).isDirectory()` triggers `loadCapability(dirPath)`, which throws `GSDC_CAPABILITY_MISSING` if `capability.json` does not exist inside it.
- Impact: If a developer has an untracked temporary folder, local backup, or an editor-created directory inside `templates/agent-source`, any CLI execution requiring the agent adapters will completely crash.
- Recommendation: Modify `loadAllCapabilities` to skip directories that do not contain `capability.json`, or wrap the `loadCapability` call in a try-catch and only throw for directories that are explicitly expected to be capabilities.
- Suggested test: Create an empty dummy directory under `templates/agent-source` and verify that `loadAllCapabilities` does not throw an error and simply ignores it.
- Dedup key: load-all-capabilities-non-capability-dir

### P3-001: Missing check for triggers array in antigravity skill description formatting

- Severity: P3
- Category: ux
- Status: valid
- File: lib/agent-adapters/antigravity-skill.js
- Lines: 18-21
- Claim: The skill formatter assumes `capability.triggers` is always an array of strings.
- Evidence: `(capability.triggers || []).join(' or ')` handles the undefined/missing triggers case, but does not validate if `triggers` is not an array, which could crash the adapter.
- Impact: A malformed `capability.json` containing `triggers: "/some-trigger"` (a string instead of an array) would cause `join` to throw a TypeError.
- Recommendation: Ensure that `triggers` is strictly verified or cast to an array if present, or add validation in `loadCapability`.
- Suggested test: Load a capability JSON where triggers is a string instead of an array and assert that it handles it gracefully or fails validation under `loadCapability`.
- Dedup key: triggers-array-type-validation

## Non-Issues Checked

- Unit tests are comprehensive and verify all adapters under normal and error conditions.
- Output target directories matches exactly the required project structure.

## Residual Risks

- None.
