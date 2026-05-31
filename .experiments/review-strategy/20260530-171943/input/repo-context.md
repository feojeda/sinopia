# Repo Context for Review

## Project: gsd-canva

A CLI tool (`gsd-canva`) that generates HTML mockups from user decisions. Written in Node.js.

## Key Files

- `bin/gsd-canva.js`: CLI entry point, subcommands
- `lib/plan-manager.js`: Core business logic
- `templates/commands/canva-mockup.md`: Template for agent instructions
- `tests/plan.test.js`: Test suite
- `docs/PROPOSAL_v1.1_architectural_fixes.md`: v1.1 already implemented
- `docs/PROPOSAL_v1.2_interactive_questions.md`: v1.2 generic version (frozen at Rev. 15)
- `docs/PROPOSAL_v1.2_antigravity_questions.md`: v1.2 Antigravity edition (Rev. 17, under review)

## Current State

- v1.1 fully implemented and tested (9 changes, all tests pass)
- v1.2 is proposal-only, not yet implemented
- Two proposal files exist: generic (frozen Rev. 15) and Antigravity edition (active Rev. 17)

## Git History

- `151b682`: Rev. 17 (P1-001/P1-003/P1-004/P1-006 + P2-002 fixes)
- `009bc21`: Rev. 16 (Antigravity edition initial)
- `6bdff71`: Rev. 15 (frozen generic version)
- `7d571b6`: v1.1 implementation

## Previous Review Results

- Rev. 11→15: 3 consecutive `approve_with_changes` on generic version
- Rev. 16 (Antigravity): `reject_until_fixed` — 1 P1 (contradictory custom handling), 4 P2s
- Rev. 17 fixes: P1-001 (residual refs), P1-003 (history-based recovery), P1-004 (stale mockup blocking), P1-006 (hash migration fixtures), P2-002 (ensureV2Fields ordering)
- Disputed P1s: P1-002 (confirmDecisions optional validation) and P1-005 ("claro que no, confirmo" acceptance)

## Architecture

- Plan lifecycle: create → questions_pending → ready_for_html → pending_approval → approved
- `decisions.json`: user decisions + confirmation object
- `plan.json`: plan metadata + status + phase
- `mockup.html`: generated artifact, hash-verified on submit
- FIELD_REGISTRY: single source of truth for field definitions (type, required, options, allowCustom)
- Hash algorithm: sha256 with versioned field lists (v1: 6 fields, v2: 7 fields)

## Error Codes

| Code | Name | Meaning |
|---|---|---|
| 13 | GSDC_INVALID_STATE | Operation not valid in current state |
| 15 | GSDC_JSON_PARSE_ERROR | Malformed JSON |
| 19 | GSDC_QUESTIONS_UNRESOLVED | Empty required fields on confirm |
| 20 | GSDC_MOCKUP_MISSING | mockup.html not found |
| 21 | GSDC_CHANGED_AFTER_CONFIRMATION | Decisions changed since confirm |
| 22 | GSDC_INVALID_FIELD | Unknown field name |
| 23 | GSDC_DECISIONS_LOCKED | Confirm already done |
| 24 | GSDC_PLAN_NOT_FOUND | No plan directory |
| 25 | GSDC_PLAN_ARTIFACT_MISSING | plan.json or decisions.json missing |
| 26 | GSDC_INVALID_CHOICE_VALUE | Invalid choice (numeric/placeholder/not_in_options) |
| 27 | GSDC_STALE_MOCKUP | Mockup stale (mtime predates confirm) |
