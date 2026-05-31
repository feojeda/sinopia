# Repo Context: gsd-canva

## Directory Structure
- `lib/plan-manager.js`: Handles backend state transitions (create, confirmDecisions, resolveQuestions, submitMockup, transitionState, deliver, list, status). Uses file locking and atomic writes.
- `lib/agent-adapters/`: Implements rendering functions to adapt neutral capability definitions from `templates/agent-source/` to specific agent formats:
  - `antigravity-skill.js` (targets `.agents/skills/<id>/SKILL.md`)
  - `codex-command.js` (targets `.codex/commands/<id>.md`)
  - `opencode-command.js` (targets `.opencode/commands/<id>.md`)
- `templates/agent-source/`: Neutral definition source containing subfolders for each capability, like `canva-mockup/` and `canva-deliver/`. Each folder has `capability.json` and `instructions.md`.
- `tests/`: Testing suites including `tests/adapter.test.js` and `tests/run.js`.

## Current State of State Machine (v1.3)
- Decisions are stored in `decisions.json`.
- The decisions format currently uses six fields: `vertical`, `audiencia`, `formato`, `paleta`, `copy`, `cta`.
- Uses `confirmation` object containing `confirmed` (boolean), `hashAlgorithm` (currently `"sha256-decisions-v1"`), `decisionsHash` (SHA256 of the 6 normalized fields serialized as JSON).
