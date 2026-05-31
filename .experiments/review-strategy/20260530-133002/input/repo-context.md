# Repo Context Snapshot

**Date**: 2026-05-30
**Last commit**: d06e6e3 (Update PROPOSAL_v1.2 Rev. 8)
**v1.1 commit**: 7d571b6

## Project Structure

```
gsd-canva/
  bin/gsd-canva.js          (496 lines) — CLI entry point using Commander.js
  lib/
    plan-manager.js          (693 lines) — State machine, hash, CRUD operations
    lock-manager.js          — File-based lock for concurrency
    installer.js             — init/upgrade/doctor commands
    template-catalog.js      — Template registration
  templates/
    commands/
      canva-mockup.md        (73 lines) — Agent instructions for /canva-mockup
      canva-deliver.md
      canva-draft.md
      canva-refine.md
    plan-templates/          — Template files copied into new plans
  tests/
    plan.test.js             (198 lines) — Unit tests via node assert
    installer.test.js
  docs/                      — Proposals and documentation
```

## Key Contracts

### State Machine (current)

```
create → mockup:questions_pending
confirm-decisions → hash + confirm (stays questions_pending)
resolve-questions → mockup:ready_for_html (validates hash)
submit-mockup → mockup:pending_approval (validates mockup.html + hash)
approve-mockup → mockup:approved
start-draft → draft:pending
approve-draft → draft:approved
start-refine → refine:pending
approve-refine → deliver:ready
deliver → deliver:delivered
```

### decisions.json (current schema)

```json
{
  "vertical": "",
  "audiencia": "",
  "formato": "",
  "paleta": "",
  "copy": "",
  "cta": "",
  "confirmation": {
    "confirmed": false,
    "confirmedAt": null,
    "confirmedBy": null,
    "source": "chat",
    "hashAlgorithm": "sha256-decisions-v1",
    "decisionsHash": ""
  }
}
```

### Exit Codes (current)

| Code | Exit | Meaning |
|---|---|---|
| GSDC_INVALID_STATE | 13 | Illegal state transition |
| GSDC_DELIVERY_MISSING | 14 | Delivery artifacts missing |
| GSDC_JSON_PARSE_ERROR | 15 | JSON parse error (also used for plan not found — bug) |
| GSDC_LOCK_TIMEOUT | 10 | Lock acquisition timeout |
| GSDC_QUESTIONS_UNRESOLVED | 19 | Required fields missing or unconfirmed |
| GSDC_ARTIFACT_MISSING | 20 | Required artifact (e.g. mockup.html) missing |
| GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION | 21 | Hash mismatch after confirmation |

### Key Implementation Details

- `findPlanDir()` currently throws `GSDC_JSON_PARSE_ERROR` (exit 15) when plan dir not found — proposal wants `GSDC_PLAN_NOT_FOUND` (exit 24)
- Hash uses `sha256-decisions-v1` algorithm over 6 fields (vertical, audiencia, formato, paleta, copy, cta) — proposal adds `assets` as 7th field with `sha256-decisions-v2`
- All mutations acquire global lock via `lock-manager.js`
- `writeAtomicJson()` uses tmp+rename pattern
- `confirmDecisions()` validates placeholders inline (lines 184-194) — duplicated in `resolveQuestions()` (lines 276-286)
- No `questions()`, `answer()`, or `resetConfirmation()` functions exist yet
- CLI uses `handleSuccess()` wrapper for `{ ok: true, data }` envelope
- Tests use `node assert` module, run via `node tests/run.js`
