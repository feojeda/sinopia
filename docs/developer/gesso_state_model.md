# Developer Reference: Gesso State Model and Lifecycle

**Sinopia v1.5 · Phase 0 internals**

This document describes the internal architecture, data model, state transitions, and compatibility guarantees of the Gesso subsystem. It is intended for developers maintaining or extending Sinopia.

---

## Directory Structure

```
<project-root>/
├── lienzos/                          ← Gesso root (created lazily on first gesso create)
│   └── lienzo_<ID>_<slug>/           ← One folder per lienzo
│       ├── lienzo.json               ← State machine + metadata + hash
│       ├── gesso.md                  ← Human-readable creative brief
│       └── sesion.json               ← Conversational audit log + working notes
├── canva-plans/                      ← Unchanged legacy plan domain
│   └── plan_<ID>_<slug>/
│       ├── plan.json                 ← Contains optional sourceLienzoId after link
│       ├── decisions.json
│       └── mockup.html
└── .gsd-canva/
    └── .lock                         ← Shared lock file for atomic writes
```

IDs are **independent sequences**: lienzo IDs (001–999) and plan IDs (001–999) are separate counters. A lienzo 001 and a plan 001 can coexist without collision.

---

## `lienzo.json` Fields

```json
{
  "id": "001",
  "name": "Mi Cafe",
  "slug": "mi-cafe",
  "phase": "gesso",
  "status": "en_blanco",
  "methodology": "socratic",
  "language": "es",
  "linkedPlanId": null,
  "timestamps": {
    "created": "2026-05-31T00:00:00.000Z",
    "updated": "2026-05-31T00:00:00.000Z",
    "approved": null
  },
  "confirmation": {
    "confirmed": false,
    "confirmedAt": null,
    "confirmedBy": null,
    "source": "chat",
    "hashAlgorithm": "sha256-gesso-v1",
    "gessoHash": ""
  },
  "history": [
    {
      "timestamp": "2026-05-31T00:00:00.000Z",
      "action": "created",
      "details": "Lienzo inicializado"
    }
  ]
}
```

### Field Reference

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | 3-digit zero-padded lienzo ID (`"001"`–`"999"`). |
| `name` | `string` | Human-readable name. |
| `slug` | `string` | Lowercase slug derived from name for folder naming. |
| `phase` | `string` | Always `"gesso"` in v1.5. |
| `status` | `string` | State-machine status. See transitions below. |
| `methodology` | `string` | Conversation methodology: `socratic`, `creative_brief`, `jobs_to_be_done`, `design_thinking`, `5w1h`. |
| `language` | `string` | Conversation language: `es`, `en`, `it`. |
| `linkedPlanId` | `string|null` | ID of linked mockup plan. `null` if unlinked. |
| `timestamps.created` | `ISO 8601` | Creation timestamp. |
| `timestamps.updated` | `ISO 8601` | Last mutation timestamp. |
| `timestamps.approved` | `ISO 8601|null` | Approval timestamp. `null` if not yet confirmed. |
| `confirmation.confirmed` | `boolean` | Whether gesso has been confirmed. |
| `confirmation.confirmedAt` | `ISO 8601|null` | When confirmation happened. |
| `confirmation.confirmedBy` | `string|null` | Who confirmed (`"user"`). |
| `confirmation.source` | `string` | Confirmation source (`"chat"`). |
| `confirmation.hashAlgorithm` | `string` | `"sha256-gesso-v1"`. |
| `confirmation.gessoHash` | `string` | 64-char hex SHA-256 hash of canonical gesso.md. |
| `history` | `Array<{timestamp, action, details}>` | Ordered audit trail of all mutations. |

---

## `sesion.json` Fields

```json
{
  "lienzoId": "001",
  "methodology": "socratic",
  "language": "es",
  "turns": [
    {
      "timestamp": "2026-05-31T00:00:00.000Z",
      "role": "user",
      "content": "Quiero algo para mi cafe",
      "tags": ["initial_prompt"]
    }
  ],
  "workingNotes": {
    "idea": "",
    "audience": "",
    "tone": "",
    "layout": "",
    "context": "",
    "constraints": "",
    "mandatoryElements": "",
    "discardedDirections": ""
  }
}
```

### Field Reference

| Field | Type | Description |
| :--- | :--- | :--- |
| `lienzoId` | `string` | Owning lienzo ID. |
| `methodology` | `string` | Mirror of `lienzo.json` methodology. |
| `language` | `string` | Mirror of `lienzo.json` language. |
| `turns` | `Array<Turn>` | Chronological list of conversation turns. |
| `turns[].timestamp` | `ISO 8601` | When the turn was recorded. |
| `turns[].role` | `string` | `user`, `assistant`, or `system`. |
| `turns[].content` | `string` | Text content of the turn. |
| `turns[].tags` | `string[]` | Classification tags. |
| `workingNotes` | `object` | Structured working notes with 8 predefined fields. |

---

## `gesso.md` Required Sections

`gesso.md` is the human-readable creative brief. It must contain **11 required sections** with the following normalized headings:

| # | Section Heading (Spanish) | Purpose |
| :---: | :--- | :--- |
| 1 | `Nombre del lienzo` | Project name. |
| 2 | `Metodologia usada` | Which methodology was used. |
| 3 | `Resumen narrativo` | Narrative summary of the idea. |
| 4 | `Intencion visual y tonal` | Visual and tonal intent. |
| 5 | `Audiencia y contexto de uso` | Target audience and usage context. |
| 6 | `Mensaje central` | Core message. |
| 7 | `Estructura de layout propuesta` | Proposed layout structure. |
| 8 | `Elementos obligatorios` | Mandatory design elements. |
| 9 | `Riesgos o restricciones` | Risks or constraints. |
| 10 | `Exploraciones descartadas` | Discarded explorations. |
| 11 | `Recomendaciones para Abbozzo` | Recommendations for Phase 1 (Abbozzo). |

### Section Validation

Sections are validated by **normalized heading matching**:

1. Extract all `## ...` lines from the markdown.
2. Normalize each heading: lowercase → NFD → strip diacritics → strip non-alphanumerics.
3. Check that all 11 required normalized headings are present.

This means minor orthographic variations (e.g., `Metodología` vs `Metodologia`) are treated as equivalent. The search is intentionally loose to avoid rejecting documents over accent differences.

### Section Content

Sections must not contain:
- Unresolved `{{placeholders}}` (mustache-style template markers).
- The text `(Por definir durante la conversación)` (placeholder text from the initial template).
- The text `Este documento es un placeholder`.

---

## Status Transitions

```
                 ┌─────────────┐
                 │  en_blanco  │  ← Initial state. Editable.
                 └──────┬──────┘
                        │ gesso confirm
                        ▼
                 ┌─────────────┐
                 │ gesso_listo │  ← Gesso approved and frozen.
                 └──────┬──────┘
                        │
              ┌─────────┼──────────┐
              │                    │
    gesso link-plan        gesso archive
              │                    │
              ▼                    ▼
     ┌──────────────┐    ┌─────────────┐
     │  con_mockup  │    │  archivado  │
     └──────────────┘    └─────────────┘
```

### State Reference

| State | Meaning | Editable? | Allowed Transitions |
| :--- | :--- | :---: | :--- |
| `en_blanco` | Active brainstorming. Turn recording and note editing allowed. | ✅ | → `gesso_listo` (`confirm`) |
| `gesso_listo` | Gesso approved and frozen. Hash-verified. | ❌ | → `con_mockup` (`link-plan`), → `archivado` (`archive`) |
| `con_mockup` | Lienzo linked to a mockup plan. | ❌ | Terminal (unlinking not supported in v1.5) |
| `archivado` | Lienzo preserved without continuation. | ❌ | Terminal |

### State Guard Rules

- `append-turn` and `update-notes` are **only allowed in `en_blanco`** (error code 32).
- `confirm` requires `en_blanco` + valid `gesso.md` with all 11 sections.
- `link-plan` requires `gesso_listo` + hash match.
- `archive` requires `gesso_listo`.

---

## Hash Behavior

### Algorithm

`sha256-gesso-v1` is computed as:

```
SHA-256(NFC-normalized content, with \r\n → \n, trailing whitespace trimmed)
```

Implementation in `lib/gesso-manager.js`:

```javascript
function hashGessoV1(content) {
  const normalized = content
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}
```

### When It's Computed

1. **On `confirm`**: hash is computed and stored in `lienzo.json.confirmation.gessoHash`.
2. **On `verify`**: hash is recomputed and compared against stored value.
3. **On `link-plan`**: hash is recomputed and validated before linking.

### Error on Mismatch

If the current hash differs from the stored confirmation hash, operations that require integrity (verify, link-plan) throw `GSDC_GESSO_CHANGED_AFTER_CONFIRMATION` (exit code 35).

---

## Link Behavior with `canva-plans/`

### Bidirectional Link

When `gesso link-plan --id <lienzoId> --plan <planId>` executes:

1. **Lienzo side**: `linkedPlanId` is set, status transitions to `con_mockup`.
2. **Plan side**: `sourceLienzoId` is set in `plan.json`.

```
lienzo.json                    plan.json
  linkedPlanId: "001"  ←──→    sourceLienzoId: "001"
  status: "con_mockup"          (status unchanged)
```

### Plan Compatibility

- A plan **can** exist without `sourceLienzoId` (created via direct `/canva-mockup`).
- A plan **can** have `sourceLienzoId` pointing to any confirmed lienzo.
- A plan **cannot** have `sourceLienzoId` pointing to two different lienzos.
- A **delivered** plan rejects linking (error code 36).
- The plan's own state machine (questions_pending → ready_for_html → pending_approval → delivered) is unaffected.

### Idempotency

`link-plan` is idempotent: if the lienzo is already linked to the same plan, it returns success. If the plan is missing the back-link (e.g., after a crash), it repairs it automatically.

### Crash Recovery

During `link-plan`, if `lienzo.json` has been written but `plan.json` hasn't, a subsequent `link-plan` call will detect the missing back-link and repair it without error.

---

## Compatibility Guarantees

### Gesso is Optional

- `gsd-canva plan create` works exactly as before.
- `gsd-canva plan questions`, `plan answer`, `plan confirm-decisions`, etc., are unchanged.
- The `decisions.json` schema (v2) is unchanged.
- The plan yield gate (decisions → confirm → resolve → submit) is unchanged.

### No Side Effects on Plans

- Creating a lienzo does not touch `canva-plans/`.
- Confirming a lienzo does not touch `canva-plans/`.
- Linking is the **only** operation that writes to both domains.
- Unlinking is not supported in v1.5.

### Legacy Commands

All `/canva-*` commands remain functional and independent of Gesso:

- `/canva-mockup` → `gsd-canva plan *`
- `/canva-blank-canvas` → `gsd-canva gesso *` (alias, same skill)

---

## Error Codes

| Code | Exit | Thrown By | Condition |
| :--- | ---: | :--- | :--- |
| `GSDC_GESSO_NOT_FOUND` | 31 | `findLienzoDir`, `status`, `write`, `confirm`, `verify`, `linkPlan` | Lienzo does not exist. |
| `GSDC_GESSO_INVALID_STATE` | 32 | `assertEditable`, `confirm`, `verify`, `linkPlan` | Illegal state transition. |
| `GSDC_GESSO_ARTIFACT_MISSING` | 33 | `write`, `confirm`, `verify`, `linkPlan` | `gesso.md` is missing or empty. |
| `GSDC_GESSO_INVALID_ARTIFACT` | 34 | `write`, `confirm` | `gesso.md` fails section validation or contains placeholders. |
| `GSDC_GESSO_CHANGED_AFTER_CONFIRMATION` | 35 | `verify`, `linkPlan` | Hash mismatch after confirmation. |
| `GSDC_GESSO_LINK_FAILED` | 36 | `linkPlan` | Cannot link: plan not found, delivered, already linked to another lienzo. |

These are **additive** to the existing error catalog in `lib/plan-manager.js` (`GSDC_INVALID_FIELD=22`, `GSDC_DECISIONS_LOCKED=23`, etc.).

---

## CLI Atomic Write Pattern

All mutations to `lienzo.json` and `sesion.json` use the atomic write pattern:

```javascript
function writeAtomicJson(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}
```

This means:
1. New content is written to a `.tmp` file.
2. The `.tmp` file is atomically renamed over the target.

If the process crashes mid-write, the original file is preserved. The `.tmp` file may be left behind but is harmless.

---

## Lock Manager Usage

The shared lock file at `.gsd-canva/.lock` is used for all Gesso mutations:

```javascript
await lockManager.acquire(lockFile);
try {
  // ... mutation logic
} finally {
  lockManager.release(lockFile);
}
```

This prevents race conditions when multiple commands mutate the same lienzo concurrently. The lock is shared with `plan-manager.js` — both domains serialize through the same lock file.

---

## Valid Values Reference

### Methodologies
`socratic`, `creative_brief`, `jobs_to_be_done`, `design_thinking`, `5w1h`

### Languages
`es`, `en`, `it`

### Roles (for append-turn)
`user`, `assistant`, `system`

### Working Note Fields
`idea`, `audience`, `tone`, `layout`, `context`, `constraints`, `mandatoryElements`, `discardedDirections`

---

## Véase También

- [Referencia de comandos CLI: gesso](../commands/gesso.md)
- [Guía de usuario: Gesso / Lienzo en Blanco](../guides/gesso_lienzo_en_blanco.md)
- [Propuesta de implementación v1.5](../PROPOSAL_v1.5_gesso_lienzo_en_blanco_implementation_plan.md)
- [Source: `lib/gesso-manager.js`](../../lib/gesso-manager.js)
- [Source: `bin/gsd-canva.js` (gesso commands)](../../bin/gsd-canva.js)
