# Repo Context Snapshot

## Structure

```
lib/plan-manager.js    — 693 lines, core business logic
lib/lock-manager.js    — file-based lock manager
bin/gsd-canva.js       — 496 lines, CLI entry point
templates/commands/canva-mockup.md — 73 lines, agent template
tests/plan.test.js     — 198 lines
```

## Current State Machine (v1.1)

States in `plan-manager.js`:
- `mockup:questions_pending` — initial state after plan creation
- `mockup:ready_for_html` — after `resolve-questions` succeeds
- `mockup:pending_approval` — after `submit-mockup` succeeds
- `mockup:approved` — after approve
- Later phases for draft/refine/deliver

## Current Functions (plan-manager.js)

Exported async functions:
- `create(options)` — creates plan with `decisions.json`, `plan.json`
- `confirmDecisions(planId, options)` — validates fields, computes hash, sets `confirmation.confirmed = true`
- `resolveQuestions(planId)` — validates confirmation + hash, transitions to `ready_for_html`
- `submitMockup(planId)` — validates `mockup.html` exists + hash, transitions to `pending_approval`
- `transitionState(planId, action)` — generic state transitions
- `deliver(planId)` — final delivery
- `list(options)` — list plans (tolerant to corrupt plans)
- `status(planId)` — show plan status

Internal helpers:
- `getPlansDir()`, `getLockFile()`, `getPlanTemplatesDir()`, `sanitizeFolderName()`
- `findPlanDir(planId)` — currently throws `GSDC_JSON_PARSE_ERROR` (exit 15) when not found
- `writeAtomicJson(filePath, data)` — atomic JSON writes

## Current Error Codes (plan-manager.js)

| Code | Exit | Used by |
|---|---|---|
| `GSDC_JSON_PARSE_ERROR` | 15 | JSON parse failures, findPlanDir (plan not found) |
| `GSDC_INVALID_STATE` | 13 | Wrong state for operation |
| `GSDC_QUESTIONS_UNRESOLVED` | 19 | Missing required fields |
| `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` | 21 | Hash mismatch |
| `GSDC_ARTIFACT_MISSING` | 20 | mockup.html missing in submitMockup |

## Current Hash Logic (confirmDecisions)

- Computes SHA-256 over 6 fields: vertical, audiencia, formato, paleta, copy, cta
- Hash algorithm: `sha256-decisions-v1`
- Stored in `decisions.json` under `confirmation.decisionsHash`

## Current Placeholder Detection (confirmDecisions/resolveQuestions)

- Uses `includes()` check against `['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR']`
- Preexisting bug: "Nodo" would match "TODO" via `includes()`

## Current decisions.json Structure (v1.1)

```json
{
  "vertical": "",
  "formato": "",
  "audiencia": "",
  "paleta": "",
  "copy": "",
  "cta": "",
  "confirmation": {
    "confirmed": false,
    "confirmedAt": null,
    "decisionsHash": "",
    "hashAlgorithm": "sha256-decisions-v1"
  }
}
```

No `assets` field, no `optionalAnswered` field in v1.1.

## Current canva-mockup.md Template

73 lines. Section 2 contains inline instructions for writing directly to `decisions.json`.
The proposal replaces this entire section with CLI-mediated interactions.

## Current plan.json Structure

```json
{
  "phase": "mockup",
  "status": "questions_pending",
  "history": []
}
```
