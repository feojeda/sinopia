# Consolidated Review: https://github.com/feojeda/gsd-canva/pull/1

## Verdict

approve_with_changes

## Priority Findings

None. No blocking P1 issues were identified in this review.

## Secondary Findings

### P2-001: loadAllCapabilities crashes on non-capability directories

- **Category**: cli-contract
- **Source reviewers**: pragmatic
- **File**: [lib/agent-adapters/index.js](file:///Users/franciscoojeda/gsd-canva/lib/agent-adapters/index.js)
- **Lines**: 85-92
- **Problem**: The capability directory loader iterates through all entries in the template source directory and attempts to parse them as capability modules if they are directories.
- **Evidence**: `fs.statSync(dirPath).isDirectory()` triggers `loadCapability(dirPath)`, which throws `GSDC_CAPABILITY_MISSING` if `capability.json` does not exist inside it.
- **Impact**: Any untracked temporary folder, editor-created sub-directory, or OS backup folders inside `templates/agent-source` will cause any CLI command that runs the capability generator to completely crash.
- **Required change**: Modify `loadAllCapabilities` to skip directories that do not contain `capability.json`, or gracefully skip invalid directories unless they are expected to be capability folders.
- **Suggested test**: Create an empty dummy directory under `templates/agent-source` and assert that `loadAllCapabilities` succeeds without throwing.
- **Dedup key**: load-all-capabilities-non-capability-dir

### P2-002: Missing validation for title and invocation in loadCapability

- **Category**: cli-contract
- **Source reviewers**: modeler
- **File**: [lib/agent-adapters/index.js](file:///Users/franciscoojeda/gsd-canva/lib/agent-adapters/index.js)
- **Lines**: 47-58
- **Problem**: `loadCapability` only validates that `id` and `description` exist in `capability.json`, but the adapters rely on `title` and `invocation`.
- **Evidence**: `antigravity-skill.js` uses `capability.title` (line 24), and the Codex and OpenCode adapters use `capability.invocation` (line 18, 19) without verifying their existence.
- **Impact**: If a user/developer adds a new capability without a `title` or `invocation`, the loader succeeds but generated files will contain malformed headers like `# undefined` or `# Slash Command: undefined`.
- **Required change**: Add explicit validation checks for `title` and `invocation` in `loadCapability`.
- **Suggested test**: Try loading a capability JSON file missing `title` or `invocation` and verify that `loadCapability` throws a `GSDC_CAPABILITY_INVALID` error.
- **Dedup key**: missing-title-invocation-validation

### P3-001: Missing check for triggers array in antigravity skill description formatting

- **Category**: ux
- **Source reviewers**: pragmatic
- **File**: [lib/agent-adapters/antigravity-skill.js](file:///Users/franciscoojeda/gsd-canva/lib/agent-adapters/antigravity-skill.js)
- **Lines**: 18-21
- **Problem**: The formatter assumes `capability.triggers` is always an array of strings.
- **Evidence**: `(capability.triggers || []).join(' or ')` handles the missing array case, but would throw a TypeError if `triggers` is parsed as a plain string instead of an array.
- **Impact**: A malformed `capability.json` file where `triggers` is configured as a single string could cause a rendering crash.
- **Required change**: Ensure `triggers` is checked or cast to an array if present, or add validation under `loadCapability`.
- **Suggested test**: Pass a capability JSON with `triggers: "/test"` and verify that the adapter parses it or throws a validation error safely.
- **Dedup key**: triggers-array-type-validation

### P3-002: Absence of atomic file writing in future adapter CLI commands

- **Category**: state
- **Source reviewers**: operator
- **File**: [lib/agent-adapters/index.js](file:///Users/franciscoojeda/gsd-canva/lib/agent-adapters/index.js)
- **Lines**: 75-103
- **Problem**: The adapter library does not enforce atomic writing of generated files.
- **Evidence**: File writing is delegated entirely to the caller.
- **Impact**: If concurrent commands write target capability files, incomplete writes or corrupted files could occur if they do not lock the workspace or write atomically.
- **Required change**: Document or implement atomic file writes in any CLI commands utilizing `getAdapter().getTargets()`.
- **Suggested test**: N/A (Documentation/Integration requirement).
- **Dedup key**: adapter-atomic-writes

### P3-003: Inconsistent casing normalization in Antigravity skill description formatting

- **Category**: docs
- **Source reviewers**: modeler
- **File**: [lib/agent-adapters/antigravity-skill.js](file:///Users/franciscoojeda/gsd-canva/lib/agent-adapters/antigravity-skill.js)
- **Lines**: 19-21
- **Problem**: Manual casing conversion via `replace(/^\w/, c => c.toLowerCase())` is applied to description strings.
- **Evidence**: Descriptions starting with markdown bold styling or acronyms (e.g. `MCP`) will format poorly or lowercase acronyms incorrectly (e.g. `mCP`).
- **Impact**: Aesthetic inconsistencies in the rendered skills description header.
- **Required change**: Remove or refine the automatic lowercase normalization to preserve acronyms and styling.
- **Suggested test**: Verify rendering output with descriptions starting with format tags or capitalized acronyms.
- **Dedup key**: description-first-letter-lowercasing

## Non-Issues Confirmed

- The integration tests (`tests/adapter.test.js`) are robust, clean, and verify key edge cases like invalid fields, empty files, and different format outputs.
- The state machine enhancements in the proposal (replacing `staleMockupExists` with an `mtime` check) successfully prevent potential state machine deadlocks.

## Implementation Checklist

- [ ] Add checks in `loadAllCapabilities` to skip directories that lack `capability.json`.
- [ ] Add explicit validation for `title` and `invocation` in `loadCapability`.
- [ ] Ensure that `triggers` type is validated or safely handled in `antigravity-skill.js`.
- [ ] Refine the description formatting to avoid unwanted lowercasing of acronyms or formatted text.

## Residual Risks

- Future CLI integrations must implement proper write locks and atomicity when writing rendered files to disk.
