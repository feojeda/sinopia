# Plan: Preguntas Interactivas en `/canva-mockup` — Antigravity Edition (Rev. 16)

**Based on**: Rev. 15 (`PROPOSAL_v1.2_interactive_questions.md`)
**Fecha**: 2026-05-30
**Estado**: Pendiente de aprobación
**Cambio principal**: Integración con herramienta `ask_question` de Antigravity. Eliminación de "Opción personalizada" manual — Antigravity provee texto libre automáticamente.

**Fecha**: 2026-05-30
**Estado**: Pendiente de aprobación
**Prerequisito verificable**: El branch debe partir de main con `git status --short` limpio y v1.1 aplicado (commit `7d571b6` o posterior). Si hay cambios dirty, el plan no debe implementarse.

---

## Problema

Cuando el agente ejecuta `/canva-mockup test2`, detecta que faltan campos y responde con un bloque de texto plano con 7 preguntas numeradas. No hay estructura, no hay opciones predefinidas, y el agente improvisa las preguntas cada vez.

## Solución

Tres nuevos comandos CLI:
1. `gsd-canva plan questions` — genera JSON estructurado con preguntas y opciones
2. `gsd-canva plan answer` — escribe respuestas individualmente con validación atómica
3. `gsd-canva plan reset-confirmation` — desbloquea decisiones ya confirmadas para edición

El agente renderiza las preguntas como pueda (UI nativa o chat numerado), recopila respuestas, las guarda via `plan answer`, y solo al final presenta un resumen y pide confirmación explícita antes de congelar.

---

## Invariantes que v1.1 garantiza

Esta proposal asume que el commit `7d571b6` ya está en main:
- CLI global (`gsd-canva`) sin copia de runtime
- Los 4 comandos slash usan CLI global con preflight
- `canva-mockup.md` tiene regla `decisions.json` primero
- Tests 7, 8, 8b pasan (ausencia de runtime + migración legacy)

---

## Breaking Changes

**`findPlanDir()` exit code migration**: `GSDC_JSON_PARSE_ERROR` (exit 15) → `GSDC_PLAN_NOT_FOUND` (exit 24) para todas las funciones. **Pre-implementation step**: `rg "exit.*15|GSDC_JSON_PARSE_ERROR|exitCode.*15|code.*15" templates/ bin/ tests/ docs/` y auditar cada hit. Funciones afectadas: `findPlanDir()`, `status()`, `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`, `approveMockup()`.

**`GSDC_ARTIFACT_MISSING` → `GSDC_MOCKUP_MISSING` rename**: **Pre-implementation step**: `rg "GSDC_ARTIFACT_MISSING" lib/ bin/ tests/ templates/` y reemplazar cada hit. Post-impl: `rg "GSDC_ARTIFACT_MISSING" lib/ bin/ tests/` retorna 0 hits.

**`hashAlgorithm` upgrade**: `confirmDecisions()` siempre computa hash v2 (7 campos con `assets`). Planes existentes con hash v1 almacenado son verificados con la normalize vieja (`NFC`, case-sensitive). La confirmación migra automáticamente a v2.

**`readJsonOrThrow()` migration**: `status()`, `confirmDecisions()`, `resolveQuestions()`, `submitMockup()` cambian missing-file de exit 15 → 25.

**Placeholder detection**: Named placeholder detection: `includes()` → `===` (exact match). Bracket detection (`[...]`) permanece substring-based. Valores como `"PENDIENTE DE REVISIÓN"` o `"TODO: definir colores"` ya NO son detectados como placeholder — solo los valores exactos de la lista y bracket-wrapped. Esto es intencional.

**CLI `handleError` fallbacks**: Regla blanket: todos los `err.exitCode || <code>` → `err.exitCode || 1` en `bin/gsd-canva.js` (todos los handlers, no solo plan). Post-impl: `grep -n 'exitCode ||' bin/gsd-canva.js` solo produce `|| 1`.

---

## Cambios

### 1. `lib/plan-manager.js` — `FIELD_REGISTRY` y helpers compartidos

**`FIELD_REGISTRY`**: Constante a nivel módulo — única fuente de verdad:

```js
const FIELD_REGISTRY = [
  { id: 'vertical', question: '¿Qué tipo de diseño quieres crear?', type: 'choice', required: true, allowCustom: true, options: [
    { label: 'SaaS / Producto Digital', value: 'SaaS / Producto Digital' },
    { label: 'E-Commerce / Retail', value: 'E-Commerce / Retail' },
    { label: 'Evento / Workshop', value: 'Evento / Workshop' },
    { label: 'Restaurante / Alimentos', value: 'Restaurante / Alimentos' },
    { label: 'Educación / Curso', value: 'Educación / Curso' },
    { label: 'Salud / Bienestar', value: 'Salud / Bienestar' },
    { label: 'Inmobiliaria', value: 'Inmobiliaria' },
    { label: 'Personal Brand / Portafolio', value: 'Personal Brand / Portafolio' }
  ]},
  { id: 'formato', question: '¿Qué formato y dimensiones necesitas?', type: 'choice', required: true, allowCustom: true, options: [
    { label: 'Instagram Post (1080x1080)', value: 'Instagram Post (1080x1080)' },
    { label: 'Instagram Story (1080x1920)', value: 'Instagram Story (1080x1920)' },
    { label: 'Facebook Post (1200x630)', value: 'Facebook Post (1200x630)' },
    { label: 'LinkedIn Banner (1584x396)', value: 'LinkedIn Banner (1584x396)' },
    { label: 'YouTube Thumbnail (1280x720)', value: 'YouTube Thumbnail (1280x720)' },
    { label: 'A4 Flyer (2480x3508)', value: 'A4 Flyer (2480x3508)' },
    { label: 'Pinterest Pin (1000x1500)', value: 'Pinterest Pin (1000x1500)' }
  ]},
  { id: 'audiencia', question: '¿A qué público objetivo nos dirigimos?', type: 'text', required: true, placeholder: 'Ej: Desarrolladores jóvenes, Mujeres 25-40, Profesionales creativos...' },
  { id: 'paleta', question: '¿Qué colores o paleta cromática prefieres?', type: 'text', required: true, placeholder: 'Ej: Azul corporativo + blanco, Tonos tierra, Neón oscuro...' },
  { id: 'copy', question: '¿Cuál será el texto principal o eslogan?', type: 'text', required: true, placeholder: "Ej: '50% de descuento en toda la tienda', 'Lanzamiento oficial 2026'..." },
  { id: 'cta', question: '¿Qué texto llevará el botón de acción?', type: 'choice', required: true, allowCustom: true, options: [
    { label: 'Comprar Ahora', value: 'Comprar Ahora' },
    { label: 'Registrarse Gratis', value: 'Registrarse Gratis' },
    { label: 'Saber Más', value: 'Saber Más' },
    { label: 'Reservar Cupo', value: 'Reservar Cupo' },
    { label: 'Descargar', value: 'Descargar' },
    { label: 'Ver Colección', value: 'Ver Colección' }
  ]},
  { id: 'assets', question: '¿Hay tipografías específicas, logos o recursos visuales externos?', type: 'text', required: false, placeholder: 'Ej: Logo en PNG, fuente Montserrat, imagen de fondo...' }
];

const REQUIRED_FIELDS = FIELD_REGISTRY.filter(f => f.required).map(f => f.id);
const ALL_FIELDS = FIELD_REGISTRY.map(f => f.id);
const OPTIONAL_FIELDS = FIELD_REGISTRY.filter(f => !f.required).map(f => f.id);
```

**Integración con Antigravity `ask_question`**: El agente NO debe renderizar preguntas manualmente. Debe usar la herramienta `ask_question` de Antigravity para cada pregunta, pasando las opciones directamente desde el JSON de `plan questions`. Antigravity provee automáticamente un campo de texto libre ("Other") — **NUNCA** agregar una opción manual "Otro", "Opción personalizada", o similar. Campos con `allowCustom: true` indican a `answer()` que acepte valores custom del texto libre de Antigravity.

**`ensureV2Fields(decisions)`**: Normaliza planes v1.1 con per-field patching:
```js
decisions.optionalAnswered = decisions.optionalAnswered || {};
decisions.assets = decisions.assets !== undefined ? decisions.assets : "";
decisions.confirmation = decisions.confirmation || {};
decisions.confirmation.confirmed = decisions.confirmation.confirmed ?? false;
decisions.confirmation.confirmedAt = decisions.confirmation.confirmedAt ?? null;
decisions.confirmation.confirmedBy = decisions.confirmation.confirmedBy ?? null;
decisions.confirmation.source = decisions.confirmation.source ?? "chat";
decisions.confirmation.decisionsHash = decisions.confirmation.decisionsHash ?? "";
decisions.confirmation.hashAlgorithm = decisions.confirmation.hashAlgorithm ?? "sha256-decisions-v2";
```
Garantiza skeleton completo antes de cualquier acceso a `confirmation.*`. Funciona para planes v1.1 que ya tienen `confirmation` parcial (4 campos) — `??` no overwrites valores existentes. Se llama al inicio de **todas** las funciones que leen `decisions.json`: `questions()`, `answer()`, `resetConfirmation()`, `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`, `status()`. Después de state validation, antes de cualquier operación.

**State notation**: Identificadores de estado usan notación `phase:status`. Implementación debe verificar `plan.phase === 'mockup' && plan.status === '<status>'`, no `plan.status === 'mockup:<status>'`. Ejemplo: `mockup:questions_pending` → `plan.phase === 'mockup' && plan.status === 'questions_pending'`.

**`findPlanDirOrThrow(planId, cwd)`**: `GSDC_PLAN_NOT_FOUND` (exit 24) cuando directorio no existe. Migrar todas las funciones existentes.

**Reemplazar hardcoded field arrays**: En `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`: reemplazar todos los arrays hardcodeados `['vertical', 'audiencia', ...]` con `REQUIRED_FIELDS`. Post-impl: `rg "vertical.*audiencia.*formato.*paleta.*copy.*cta" lib/plan-manager.js` retorna 0 hits (excepto FIELD_REGISTRY y hash migration fields).

**`readJsonOrThrow(filePath)`**: Archivo no existe → `GSDC_PLAN_ARTIFACT_MISSING` (exit 25). JSON corrupto → `GSDC_JSON_PARSE_ERROR` (exit 15). No aplica a `list()`.

**Distinción de errores**: `GSDC_PLAN_NOT_FOUND` (24) = directorio no existe. `GSDC_PLAN_ARTIFACT_MISSING` (25) = archivo falta dentro de plan. `GSDC_MOCKUP_MISSING` (20) = rename de `GSDC_ARTIFACT_MISSING` — mockup.html falta durante submit (nombre más explícito).

**`getEmptyFields(decisions, fieldList, optionalAnswered)`**:

```js
function getEmptyFields(decisions, fieldList, optionalAnswered = {}) {
  const placeholders = ['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR'];
  return fieldList.filter(field => {
    if (optionalAnswered[field] && OPTIONAL_FIELDS.includes(field)) return false;
    const val = String(decisions[field] || '').trim();
    const upper = val.toUpperCase();
    const isPlaceholder = placeholders.some(p => upper === p) || (val.startsWith('[') && val.endsWith(']'));
    return !val || isPlaceholder;
  });
}
```

**Semántica de contadores**:
- `requiredFieldsComplete`: `true` cuando `requiredPendingCount === 0`. El agente debe preguntar assets (si pending) y luego presentar resumen. No es permiso para auto-confirmar ni para saltar opcionales.
- `allQuestionsAddressed`: `true` cuando `requiredPendingCount === 0 && optionalPendingCount === 0`. **Nota**: Tracks question-presentation completion, no value presence. Puede ser `true` cuando `assets === ""` (declinado).

**`optionalAnswered`**: Se set `optionalAnswered[field] = true` para **toda** respuesta a campo opcional (vacío o no). `getEmptyFields()` excluye campos con flag `true`.

**`optionalAnsweredStatus`**: `questions()` incluye `{ "assets": false }` indicando por campo opcional si fue respondido (true) o no (false). Permite al agente distinguir "declinado" (`true`, value vacío) de "nunca preguntado" (`false`).

### 2. `lib/plan-manager.js` — Agregar función `questions(planId)`

Retorna datos crudos (CLI envuelve via `handleSuccess()`):

```json
{
  "planId": "001",
  "phase": "mockup",
  "status": "questions_pending",
  "readOnly": false,
  "confirmed": false,
  "totalFields": 7,
  "filledCount": 0,
  "requiredPendingCount": 6,
  "optionalPendingCount": 1,
  "requiredFieldsComplete": false,
  "allQuestionsAddressed": false,
  "optionalAnsweredStatus": { "assets": false },
  "suggestedAction": "ask_questions",
  "editable": true,
  "filled": [],
  "pending": [
    {
      "id": "vertical",
      "question": "¿Qué tipo de diseño quieres crear?",
      "type": "choice",
      "options": [
        { "label": "SaaS / Producto Digital", "value": "SaaS / Producto Digital" },
        { "label": "E-Commerce / Retail", "value": "E-Commerce / Retail" },
        { "label": "Evento / Workshop", "value": "Evento / Workshop" },
        { "label": "Restaurante / Alimentos", "value": "Restaurante / Alimentos" },
        { "label": "Educación / Curso", "value": "Educación / Curso" },
        { "label": "Salud / Bienestar", "value": "Salud / Bienestar" },
        { "label": "Inmobiliaria", "value": "Inmobiliaria" },
        { "label": "Personal Brand / Portafolio", "value": "Personal Brand / Portafolio" }
      ],
      "allowCustom": true,
      "required": true
    },
    {
      "id": "formato",
      "question": "¿Qué formato y dimensiones necesitas?",
      "type": "choice",
      "options": [
        { "label": "Instagram Post (1080x1080)", "value": "Instagram Post (1080x1080)" },
        { "label": "Instagram Story (1080x1920)", "value": "Instagram Story (1080x1920)" },
        { "label": "Facebook Post (1200x630)", "value": "Facebook Post (1200x630)" },
        { "label": "LinkedIn Banner (1584x396)", "value": "LinkedIn Banner (1584x396)" },
        { "label": "YouTube Thumbnail (1280x720)", "value": "YouTube Thumbnail (1280x720)" },
        { "label": "A4 Flyer (2480x3508)", "value": "A4 Flyer (2480x3508)" },
        { "label": "Pinterest Pin (1000x1500)", "value": "Pinterest Pin (1000x1500)" }
      ],
      "allowCustom": true,
      "required": true
    },
    {
      "id": "audiencia",
      "question": "¿A qué público objetivo nos dirigimos?",
      "type": "text",
      "placeholder": "Ej: Desarrolladores jóvenes, Mujeres 25-40, Profesionales creativos...",
      "required": true
    },
    {
      "id": "paleta",
      "question": "¿Qué colores o paleta cromática prefieres?",
      "type": "text",
      "placeholder": "Ej: Azul corporativo + blanco, Tonos tierra, Neón oscuro...",
      "required": true
    },
    {
      "id": "copy",
      "question": "¿Cuál será el texto principal o eslogan?",
      "type": "text",
      "placeholder": "Ej: '50% de descuento en toda la tienda', 'Lanzamiento oficial 2026'...",
      "required": true
    },
    {
      "id": "cta",
      "question": "¿Qué texto llevará el botón de acción?",
      "type": "choice",
      "options": [
        { "label": "Comprar Ahora", "value": "Comprar Ahora" },
        { "label": "Registrarse Gratis", "value": "Registrarse Gratis" },
        { "label": "Saber Más", "value": "Saber Más" },
        { "label": "Reservar Cupo", "value": "Reservar Cupo" },
        { "label": "Descargar", "value": "Descargar" },
        { "label": "Ver Colección", "value": "Ver Colección" }
      ],
      "allowCustom": true,
      "required": true
    },
    {
      "id": "assets",
      "question": "¿Hay tipografías específicas, logos o recursos visuales externos?",
      "type": "text",
      "placeholder": "Ej: Logo en PNG, fuente Montserrat, imagen de fondo...",
      "required": false
    }
  ]
}
```

**Comportamiento ante estados**:
- Plan no existe → `GSDC_PLAN_NOT_FOUND` (exit 24)
- `decisions.json` corrupto → `GSDC_JSON_PARSE_ERROR` (exit 15)
- `decisions.json` faltante → `GSDC_PLAN_ARTIFACT_MISSING` (exit 25)
- `mockup:questions_pending` + `confirmed === false` → flujo normal con `readOnly: false`, `confirmed: false`, `editable: true`, `suggestedAction: "ask_questions"`.
- `mockup:questions_pending` + `confirmed === true` (entre confirm y resolve) → `readOnly: true`, `confirmed: true`, `editable: false`. **`suggestedAction` inspecciona history**: si último entry es `{ action: 'reset-confirmation', ... }` → `"suggest_reset"` (reset parcial por crash). Si no → `"retry_resolve"` (confirm pendiente de resolve).
- Cualquier estado post-`questions_pending` (`ready_for_html`, `pending_approval`) + `confirmed === true` → `readOnly: true`, `confirmed: true`, `editable: false`, `suggestedAction: "suggest_reset"`.
- Cualquier estado post-`questions_pending` + `confirmed === false` → `readOnly: true`, `confirmed: false`, `editable: false`, `suggestedAction: "suggest_reset"`.
- `approved` o posterior → `readOnly: true`, `editable: false`, `suggestedAction: "suggest_new_plan"`.
- **Non-mockup phases** (draft, refine, deliver): `phase` y `status` reflejan `plan.json`. Contadores se computan de `decisions.json` como normal. Response shape idéntico a mockup pero con `readOnly: true`, `editable: false`, `suggestedAction: "suggest_new_plan"`.
- **Cualquier otro estado no reconocido** → `readOnly: true`, `editable: false`, `suggestedAction: "suggest_new_plan"`. Status refleja el valor real de `plan.json`. `questions()` nunca lanza error.
- `questions()` **nunca** lanza `GSDC_INVALID_STATE`.

**`questions()` no persiste migración**: `ensureV2Fields()` modifica en memoria pero no escribe a disco (es read-only). La migración se persiste en la primera llamada a `answer()`, `resetConfirmation()`, o `confirmDecisions()`.

**Lock**: `questions()` adquiere lock antes de leer, libera en `finally`.

### 3. `lib/plan-manager.js` — Agregar función `answer(planId, field, value)`

```bash
gsd-canva plan answer --id 001 --field vertical --value "SaaS / Producto Digital"
gsd-canva plan answer --id 001 --field assets --value ""
gsd-canva plan answer --id 001 --field assets --value "Logo en PNG"
```

Comportamiento:
- Valida que `field` esté en `ALL_FIELDS`
- **Validación de choice values**: Si el campo es `type: 'choice'` en `FIELD_REGISTRY`:
  - Si `value` es `""` y campo es `required: true` → aceptar pero incluir `"warning": "empty_value_for_required_field"` en la respuesta (no fallar — `requiredFieldsComplete` será false). Aplica a **todos** los tipos (choice y text).
  - Si `value` es un string puramente numérico (regex `/^\d+$/`) → `GSDC_INVALID_CHOICE_VALUE` (exit 26) con `"reason": "numeric_value"` y mensaje "Valor numérico no válido. Usar el texto de la opción."
  - Si `value` no coincide con ninguna opción (case-insensitive **exact match**) y el campo tiene `allowCustom: true` → aceptar (valor custom)
  - Si `value` no coincide y el campo NO tiene `allowCustom` → `GSDC_INVALID_CHOICE_VALUE` (exit 26) con `"reason": "not_in_options"` listando opciones válidas
  - Si `value` coincide con una opción (case-insensitive exact) → **normalizar a forma canónica** (guardar el `value` del registry, no el input del usuario). Ej: input `"saas / producto digital"` → stored `"SaaS / Producto Digital"`.
- **Orden de operaciones**: acquire lock → leer `plan.json` + `decisions.json` → **validar field ∈ `ALL_FIELDS`** (exit 22) → validar estado `mockup:questions_pending` (de plan.json, exit 13) → `ensureV2Fields()` → validar `confirmation.confirmed !== true` (de decisions.json, exit 23) → validar choice value (exit 26) → escribir `decisions.json` atómicamente → release lock en `finally`
- **Rechazar placeholders**: Si `value` matchea exactamente (`===`, case-insensitive) un placeholder de la lista `['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR']` → `GSDC_INVALID_CHOICE_VALUE` (exit 26) con `"reason": "placeholder_value"` y mensaje "Valor placeholder no permitido. Usa un valor real." Aplica a **todos** los campos y tipos. Brackets `[...]` también rechazados.
- **Campos opcionales**: `optionalAnswered[field] = true` **solo cuando** `OPTIONAL_FIELDS.includes(field)`. Nunca setear para campos requeridos — `getEmptyFields()` usa este flag para saltar campos, y un flag errone en requerido ocultaría campos vacíos.
- Retorna datos crudos:

```json
{
  "planId": "001",
  "field": "vertical",
  "value": "SaaS / Producto Digital",
  "requiredPendingCount": 5,
  "optionalPendingCount": 1,
  "requiredFieldsComplete": false,
  "allQuestionsAddressed": false,
  "optionalAnsweredStatus": { "assets": false },
  "pendingFields": ["formato", "audiencia", "paleta", "copy", "cta", "assets"]
}
```

Respuesta con warning (empty value para required choice):
```json
{
  "planId": "001",
  "field": "cta",
  "value": "",
  "warning": "empty_value_for_required_field",
  "requiredPendingCount": 1,
  "optionalPendingCount": 1,
  "requiredFieldsComplete": false,
  "allQuestionsAddressed": false,
  "optionalAnsweredStatus": { "assets": false },
  "pendingFields": ["cta", "assets"]
}
```

Errores:
- `field` no reconocido → `GSDC_INVALID_FIELD` (exit 22)
- Plan no existe → `GSDC_PLAN_NOT_FOUND` (exit 24)
- Estado incorrecto → `GSDC_INVALID_STATE` (exit 13)
- Ya confirmado → `GSDC_DECISIONS_LOCKED` (exit 23)
- Valor inválido para choice → `GSDC_INVALID_CHOICE_VALUE` (exit 26)

### 4. `lib/plan-manager.js` — Agregar función `resetConfirmation(planId)`

```bash
gsd-canva plan reset-confirmation --id <ID>
```

Comportamiento:
- Valida que el plan exista
- Acepta estados `mockup:questions_pending`, `mockup:ready_for_html` o `mockup:pending_approval`
- **Idempotencia**: `if (state === 'questions_pending' && confirmed !== true && !mockupExists) → no-op`, retornar `"wasNoOp": true`. No pushea history entry en no-op.
- Si `ready_for_html` o `pending_approval`, revierte a `mockup:questions_pending`
- Si existe `mockup.html`, renombra a `.stale.<timestamp>`
- Limpia en `decisions.json`: `confirmed = false`, `confirmedAt = null`, `decisionsHash = ""`, `hashAlgorithm = ""`, `optionalAnswered = {}`, y **itera `OPTIONAL_FIELDS`** para poner cada valor a `""` (no hardcodea `assets`). **Campos requeridos se preservan** — vertical, formato, audiencia, paleta, copy, cta mantienen sus valores.
- **Orden de operaciones**:
  1. Acquire lock
  2. Leer archivos
  3. Validar estado
  4. Escribir `plan.json`: estado `questions_pending` + push history `{ action: 'reset-confirmation', from, to, timestamp }`. Si último entry ya tiene `action: 'reset-confirmation'` con mismo `from` → no duplicar.
  5. Escribir `decisions.json`: limpiar confirmation (`confirmed = false`, `confirmedAt = null`, `confirmedBy = null`, `decisionsHash = ""`, `hashAlgorithm = ""`) + `optionalAnswered = {}` + iterar `OPTIONAL_FIELDS` poner a `""`
  6. Renombrar `mockup.html` a `.stale` si existe. **Si rename falla** (I/O error): no throw — incluir `staleRenameFailed: true` en return. Documentar cleanup manual.
  7. Release lock en `finally`
- **Si `staleRenameFailed: true`**: Template debe informar: "El mockup anterior no se pudo renombrar pero los datos se reiniciaron. El archivo mockup.html anterior puede ser ignorado o eliminado manualmente."
- **Guard contra stale mockup reuso**: `submitMockup()` verifica que `mockup.html` mtime sea posterior a `confirmedAt`. Si predates → `staleMockupDetected: true` en la respuesta (no error — hash mismatch es la safety net final).
- **Recuperación**: Si falla después de paso 4, estado es `questions_pending` en plan.json pero `confirmed=true` en decisions.json → `answer()` falla con `GSDC_DECISIONS_LOCKED` (diagnósable). Re-ejecutar `resetConfirmation()` re-ejecuta todos los pasos idempotentemente. History puede acumular un entry extra en crash recovery — aceptable. Si falla después de paso 5, re-ejecutar ve mockupExists → procede con rename. Plan.json se escribe primero para que crash deje un estado donde `resetConfirmation()` puede continuar.
- Retorna confirmación + nuevo estado + si mockup fue staled + `staleRenameFailed: true` si rename falló

Errores:
- Plan no existe → `GSDC_PLAN_NOT_FOUND` (exit 24)
- Estado `approved`, non-mockup phase, o cualquier estado no aceptado → `GSDC_INVALID_STATE` (exit 13)

### 5. `bin/gsd-canva.js` — Agregar subcomandos + fix fallbacks

```
gsd-canva plan questions --id <ID> [--json]
gsd-canva plan answer --id <ID> --field <campo> --value <valor> [--json]
gsd-canva plan reset-confirmation --id <ID> [--json]
```

**CLI `handleError` fallbacks**: Regla blanket: todos los `err.exitCode || <code>` → `err.exitCode || 1` en `bin/gsd-canva.js` (todos los handlers, no solo plan). Post-impl: `grep -n 'exitCode ||' bin/gsd-canva.js` solo produce `|| 1`.

En modo `--json`: `handleSuccess()` envuelve en `{ ok: true, data }`.
En modo humano:
- `plan questions`:
  ```
  1. ¿Qué tipo de diseño quieres crear? (requerido)
     1) SaaS / Producto Digital    5) Educación / Curso
     2) E-Commerce / Retail        6) Salud / Bienestar
     3) Evento / Workshop          7) Inmobiliaria
     4) Restaurante / Alimentos    8) Personal Brand / Portafolio
                                     9) Otro (personalizado)
  ...
  7. ¿Hay tipografías, logos o recursos visuales? (opcional)

   Requeridos: 0/6 · Opcionales: 0/1
   ```
- `plan questions` readOnly: `"Plan 001 — locked (confirmed). Suggestion: gsd-canva plan reset-confirmation --id 001"` o `"Plan 001 — approved. Suggestion: create a new plan."` según `suggestedAction`.
- `plan answer`: confirmación + contadores + `requiredFieldsComplete` flag.
- `plan reset-confirmation`: confirmación + nuevo estado + "mockup.html renombrado a .stale.<ts>" si aplica.

### 6. `templates/commands/canva-mockup.md` — Reemplazar SECCIÓN 2 COMPLETA

Texto completo que reemplaza **toda la sección 2**:

```markdown
### 2. Levantamiento de Requisitos, Investigación y Confirmación (YIELD GATE OBLIGATORIO)
*   **Análisis del Contexto del Usuario**:
    *   Analiza la instrucción inicial del usuario y clasifica:
        *   **Contexto Requerido Completo**: Los 6 campos requeridos provistos → Guarda con `plan answer`.
        *   **Contexto Parcial**: Algunos datos provistos → Guarda **solo los explícitamente provistos** con `plan answer`.
        *   **Sin Contexto**: Solo nombre genérico → No guardes nada.
    *   **Tabla de ejemplos**:
        | Input | Guardar | Razón |
        |---|---|---|
        | "banner azul para mi restaurante" | `paleta: "azul"` | Solo "azul" explícito |
        | "Instagram post, CTA: Inscríbete Ya" | `formato`, `cta` | Explícitos |
        | "landing page, colores oscuros" | `paleta: "colores oscuros"` | Solo paleta |
    *   **Fallback**: Ante duda, NO guardes — deja que el flujo de preguntas lo recolecte.
    *   💡 **REGLA DE SUGERENCIAS**: Puedes proponer opciones como **propuestas tentativas**. ⚠️ **PROHIBIDO** registrarlas en `decisions.json` sin consentimiento.
*   **Preguntas Interactivas Obligatorias**:
    *   Ejecuta:
        ```bash
        gsd-canva plan questions --id <ID_DE_TRES_DÍGITOS> --json
        ```
    *   **Si `readOnly: true`**: Decisiones bloqueadas. Seguir `suggestedAction` del response:
        - `"ask_questions"`: Flujo normal de preguntas.
        - `"retry_resolve"`: Confirmación pendiente de resolve → ejecutar `resolve-questions`. Si falla, entonces `reset-confirmation`.
        - `"suggest_reset"`: Sugiere `reset-confirmation`.
        - `"suggest_new_plan"`: Plan approved o posterior → sugiere plan nuevo.
        Si `suggestedAction` no está presente, mostrar resumen y sugerir `plan status` para diagnóstico.
    *   **Renderizado de preguntas** (si hay `pending` y `readOnly === false`):
        *   ⚠️ **OBLIGATORIO**: Usar la herramienta `ask_question` de Antigravity para cada pregunta. NO renderizar como texto plano.
        *   Para cada campo en `pending`:
            - **Choice fields**: Invocar `ask_question` con `is_multi_select: false` y las opciones del JSON. Ejemplo:
              ```json
              {
                "toolSummary": "Pregunta interactiva de diseño",
                "toolAction": "Preguntando tipo de diseño",
                "questions": [{
                  "question": "¿Qué tipo de diseño quieres crear? (requerido)",
                  "is_multi_select": false,
                  "options": ["SaaS / Producto Digital", "E-Commerce / Retail", "..."]
                }]
              }
              ```
            - **Text fields**: Invocar `ask_question` con una sola opción placeholder si aplica, o sin opciones para input libre:
              ```json
              {
                "toolSummary": "Pregunta interactiva de diseño",
                "toolAction": "Preguntando público objetivo",
                "questions": [{
                  "question": "¿A qué público objetivo nos dirigimos? (requerido) Ej: Desarrolladores jóvenes, Mujeres 25-40...",
                  "is_multi_select": false,
                  "options": []
                }]
              }
              ```
        *   **Respuesta de Antigravity**: Si el usuario selecciona una opción → pasar el `value` a `plan answer`. Si el usuario usa el texto libre automático → pasar ese texto a `plan answer`. ⚠️ **PROHIBIDO** pasar índices numéricos a `plan answer --value`.
        *   ⚠️ **PROHIBIDO** agregar opciones manuales "Otro", "Opción personalizada", "Ninguno de los anteriores" — Antigravity provee texto libre automáticamente.
        *   **Mapeo numérico**: Si el entorno no usa `ask_question` (fallback), número → `value` de opción. `--value` siempre texto final. ⚠️ **PROHIBIDO** pasar índices numéricos a `plan answer --value`. Siempre convertir número → texto de opción ANTES de llamar.
        *   **Multi-campo**: Si el usuario responde con múltiples valores en un mensaje:
            1. Mapear por semántica (contenido → campo), no por posición
            2. Si cantidad **excede** campos pendientes → no guardar nada, pedir aclaración
            3. Si cantidad es **menor** que campos pendientes → guardar los mapeos exitosos, preguntar por los restantes
            4. Si algún mapeo es incierto → no guardar ese campo, preguntar
            5. Guardar campos exitosos uno por uno con `plan answer`
            6. **Ejemplos**: "Instagram post azul para restaurante" → guardar formato, paleta, vertical (todos claros). "banner para mi negocio" → no guardar formato ("banner" no es substring de ninguna opción). "LinkedIn banner azul para mi SaaS, CTA: Regístrate" → LinkedIn Banner → formato, azul → paleta, SaaS → vertical, Regístrate → cta.
            7. **Tabla de keywords por campo**:
                | Campo | Keywords/indicadores |
                |---|---|
                | `vertical` | Industrias, tipos de negocio (SaaS, restaurante, e-commerce, educación, etc.) |
                | `formato` | Plataformas + dimensiones (Instagram, LinkedIn, A4, 1080x1080, etc.) |
                | `paleta` | Colores, tonos (azul, oscuro, neón, tierra, corporativo, etc.) |
                | `copy` | Texto entre comillas, slogans, frases promocionales |
                | `cta` | Verbos de acción (comprar, registrarse, descargar, reservar, etc.) |
                | `audiencia` | Públicos, demografía, profesiones |
                | `assets` | Logos, fuentes, imágenes, recursos externos |
        *   **Texto libre de Antigravity**: Si el usuario usa el campo de texto libre automático de `ask_question` para un choice field, el agente pasa ese texto directamente a `plan answer`. Si el campo tiene `allowCustom: true` → se acepta. Si no → exit 26 `reason: "not_in_options"`.
    *   **Pregunta de assets**: Si `optionalPendingCount > 0`, preguntar assets. Si el usuario dice que no → `plan answer --field assets --value ""`.
    *   ⚠️ **Si `editable === false` (o `readOnly === true`) → seguir `suggestedAction`. NO usar `ask_question` ni `plan answer`.**
    *   **Guardado y transición** (solo si `readOnly === false`):
        *   Por cada respuesta:
            ```bash
            gsd-canva plan answer --id <ID> --field <campo> --value "<respuesta>"
            ```
        *   Después de cada `plan answer`:
            - ⚠️ **REGLA OBLIGATORIA**: Verificar siempre el campo `warning` en la respuesta antes de proceder. No avanzar sin chequear.
            - Si la respuesta contiene `"warning": "empty_value_for_required_field"` → re-preguntar ese campo inmediatamente. Informar: "Respuesta vacía para campo requerido. Por favor provee un valor."
            - Si `requiredFieldsComplete === false` → siguiente pregunta pendiente
            - Si `requiredFieldsComplete === true` Y `optionalPendingCount > 0` → preguntar assets
            - Si `requiredFieldsComplete === true` Y `optionalPendingCount === 0` → avanzar a Revisión/Confirmación
        *   ⚠️ **PROHIBIDO** escribir directamente en `decisions.json`.
    *   **Manejo de errores**:
        | Error | Acción |
        |---|---|
        | `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (21) | Ejecutar `reset-confirmation` y repetir. |
        | `GSDC_INVALID_FIELD` (22) | Re-ejecutar `plan questions`. |
        | `GSDC_DECISIONS_LOCKED` (23) | Si acabas de ejecutar `reset-confirmation` → reintentar. Si no → preguntar si ejecutar `reset-confirmation`. |
        | `GSDC_PLAN_NOT_FOUND` (24) | Sugerir `plan create`. |
        | `GSDC_PLAN_ARTIFACT_MISSING` (25) | Detener flujo. Sugerir `plan create` con mismo ID o verificar directorio del plan. |
        | `GSDC_QUESTIONS_UNRESOLVED` (19) | Re-ejecutar `plan questions --json`. Mostrar campos pendientes. Re-preguntar con `ask_question`. Re-intentar `confirm-decisions`. |
        | `GSDC_INVALID_CHOICE_VALUE` (26) | Mostrar opciones válidas. Re-preguntar. Si `reason: "numeric_value"` → "Usa el texto de la opción, no el número." Si `reason: "not_in_options"` → mostrar opciones. |
        | `GSDC_INVALID_STATE` (13) | Ejecutar `plan status`. Sugerir `reset-confirmation` si aplica. Nota: `questions()` no lanza este error — retorna `readOnly`. |
        | `GSDC_JSON_PARSE_ERROR` (15) | Detener flujo. Mostrar ruta del archivo corrupto. Sugerir inspección manual o recrear plan. |
        | Cualquier otro código | Detener flujo. Reportar error completo. Sugerir `plan status`. |
        Nota: `reset-confirmation` es idempotente — si falla, reintentar una vez. Si persiste, reportar estado.
*   **Poblado de archivos Markdown**:
    *   Actualizar como espejo de `decisions.json`. ⚠️ **PROHIBIDO** editar Markdown con datos que no estén primero en `decisions.json`. ⚠️ **Usar datos de `plan questions` o `plan status` (CLI) para poblar Markdown** — no leer `decisions.json` directamente. El archivo en disco puede estar una versión atrás (sin `assets`, `optionalAnswered`) hasta la primera mutación.
*   **Revisión Final y Confirmación**:
    1. Presenta resumen de todas las respuestas.
    2. Destaca confirmado vs tentativo.
    3. **"Responde 'confirmo' para continuar."**
    4. ⚠️ **DETÉN** hasta respuesta.
    5. **Parsing**: `/\b(confirmo|confirmado)\b/i.test(userInput.trim())` — acepta "confirmo", "sí confirmo", "confirmado". **Negation check**: `/\bno\s+(lo\s+)?(confirmo|confirmado)\b/i` → rechazar. Solo detecta negación directa del verbo ("no confirmo", "no lo confirmo"), no "no" en otra cláusula. Si no match → "Responde con una frase que incluya 'confirmo' (ej: 'sí, confirmo')." No entrar en flujo de edición.
    6. Solo con "confirmo":
        - `gsd-canva plan confirm-decisions --id <ID>`
        - `gsd-canva plan resolve-questions --id <ID>`
        - **Si `confirm-decisions` exitosa pero `resolve-questions` falla**: reintentar `resolve-questions` una vez. Si persiste, ejecutar `reset-confirmation` e informar al usuario: "Error técnico al procesar la confirmación. Tus decisiones se preservaron pero necesitas confirmar de nuevo." Reanudar desde resumen (campos están completos, no desde cero).
    7. ⚠️ **PROHIBIDO** ejecutar sin "confirmo". **PROHIBIDO** generar `mockup.html` autónomamente.
*   **Corrección post-confirmación**:
    *   Si hay `mockup.html`: ⚠️ "Esto invalidará el mockup. ¿Continuar?"
    *   Si confirma: `reset-confirmation` → informar "Campos requeridos preservados. Opcionales (assets) limpiados. Para cambiar requeridos, usa `plan answer`." → **re-ejecutar `plan questions --id <ID> --json`** para ver campos pending post-reset → seguir flujo normal.
    *   ⚠️ **PROHIBIDO** editar `decisions.json` directamente.
```

### 7. `lib/plan-manager.js` — `create()` inicializa campos nuevos

```json
{
  "vertical": "",
  "formato": "",
  "audiencia": "",
  "paleta": "",
  "copy": "",
  "cta": "",
  "assets": "",
  "optionalAnswered": {},
  "confirmation": {
    "confirmed": false,
    "confirmedAt": null,
    "confirmedBy": null,
    "source": "chat",
    "decisionsHash": "",
    "hashAlgorithm": "sha256-decisions-v2"
  }
}
```

`hashAlgorithm: "sha256-decisions-v2"` en `create()`. El objeto `confirmation` debe existir desde creación — `resolveQuestions()` accede `decisions.confirmation.confirmed`.

### 8. `lib/plan-manager.js` — Hash criptográfico con migración v1→v2

```js
const NORMALIZE = (v) => String(v || '').trim().normalize('NFC');

function computeDecisionsHash(decisions, hashAlgorithm) {
  const fields = hashAlgorithm === 'sha256-decisions-v1'
    ? ['vertical', 'audiencia', 'formato', 'paleta', 'copy', 'cta']
    : ['vertical', 'audiencia', 'formato', 'paleta', 'copy', 'cta', 'assets'];
  const payload = JSON.stringify(Object.fromEntries(fields.map(f => [f, NORMALIZE(decisions[f])])));
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

**Normalize única** (`NFC`, case-sensitive). La normalización es idéntica para v1 y v2 — el versionado está solo en el field list (6 vs 7 campos), no en la normalize. Usar un solo `NORMALIZE` previene divergencia accidental.

**`confirmDecisions()` siempre computa con v2**: Ignora el `hashAlgorithm` entrante, computa hash sobre 7 campos, escribe `hashAlgorithm: 'sha256-decisions-v2'`. Esto hace la migración atómica — hash almacenado y label siempre coinciden. Continúa aceptando `options.by` para `confirmedBy`.

**`confirmDecisions()` valida campos vacíos**: Antes de computar hash, ejecuta `getEmptyFields(decisions, REQUIRED_FIELDS)`. Si hay campos vacíos o placeholder → `GSDC_QUESTIONS_UNRESOLVED` (exit 19). Protección a nivel API — no depende solo del template.

**`confirmDecisions()` operation ordering**: acquire lock → leer `plan.json` + `decisions.json` → `readJsonOrThrow` → validar estado → `ensureV2Fields()` → `getEmptyFields(REQUIRED_FIELDS)` → exit 19 si hay pendientes → computar hash v2 → escribir `decisions.json` atómicamente → release lock en `finally`.

**`resolveQuestions()` operation ordering**: acquire lock → leer `plan.json` + `decisions.json` → `readJsonOrThrow` → validar estado → `ensureV2Fields()` → validar `confirmed === true` → dispatch hash (v1: 6 campos, v2: 7 campos) → verificar match → transicionar estado → escribir archivos atómicamente → release lock en `finally`.

**`submitMockup()` operation ordering**: acquire lock → leer `plan.json` + `decisions.json` → `readJsonOrThrow` → validar estado → `ensureV2Fields()` → dispatch hash → verificar match → verificar mockup.html existe → transicionar estado → escribir archivos atómicamente → release lock en `finally`.

**`resolveQuestions()` y `submitMockup()`**: Leen `confirmation.hashAlgorithm` y usan dispatch. Si es `sha256-decisions-v1`, usan 6 campos + normalize vieja. Cualquier otro caso (v2, vacío, undefined) → 7 campos. **`resolveQuestions()` usa `getEmptyFields(decisions, REQUIRED_FIELDS)`** para validación de placeholders — no inline `includes()`. Post-impl: `rg "includes\(p\)" lib/plan-manager.js` retorna 0 hits.

### 9. Referencias cruzadas

Buscar `mockup:pending` en templates/docs/README — verificar que reflejan la state machine actual. No hay rename de estados; solo verificación. Post-impl: `rg "mockup:pending[^_]" templates/ docs/` retorna 0 hits (no hay estado `mockup:pending`, solo `mockup:pending_approval`).

### 10. `templates/plan-templates/preguntas.md` — Agregar `assets`

### 11. `tests/plan.test.js`

**Test existente a modificar**: Actualizar test 2 existente (`plan.test.js:62`) que usa `decisions.paleta = 'TODO: definir'` — cambiar a `'TODO'` para que coincida con exact-match. `'TODO: definir'` ya NO es placeholder con `===`.

**FIELD_REGISTRY y helpers**:
- FIELD_REGISTRY consistency: cada `id` aceptado por `answer()`, `questions()` length = registry.
- optionalAnswered migration v1.1: fixture sin `optionalAnswered` → `answer(assets, "")` → éxito, flag set.
- optionalAnswered migration v1.1 questions: fixture → `questions()` → éxito.
- ensureV2Fields in confirmDecisions: fixture v1.1 → `confirmDecisions()` → `assets: ""`, `optionalAnswered: {}` en disco.
- ensureV2Fields confirmation skeleton: fixture sin `confirmation` → `questions()` retorna `confirmed: false` sin crash.
- confirmDecisions confirmedBy: `confirmDecisions('001', { by: 'user_test' })` → `confirmedBy === 'user_test'`.
- resetConfirmation confirmedBy cleanup: confirmar + reset → `confirmedBy === null`.

**questions()**:
- Vacío: `requiredPendingCount === 6`.
- Parcial, completo, assets lleno, assets declinado, assets no-vacío (flag set).
- Read-only ready_for_html: `readOnly: true`, `status === "ready_for_html"`.
- Read-only approved: `readOnly: true`.
- Read-only pending + confirmed: `readOnly: true`, `confirmed: true`.
- Plan inexistente: exit 24. Corrupto: exit 15. Faltante: exit 25.
- Choice fields en JSON: no incluyen "Otro" manual — Antigravity lo provee automáticamente.
- questions() no persiste v2 migration: fixture v1.1 → `questions()` → disco sigue sin `optionalAnswered`.
- questions() filled structure: responder un campo → `filled[0]` tiene `{ id, question, type, value, required }`.
- questions() confirmed pending refleja verdad: llenar 5/6 requeridos, confirmar → `pending.length === 1` AND `confirmed === true` AND `readOnly === true` AND `requiredPendingCount === 1` AND `requiredFieldsComplete === false`.
- questions() suggestedAction retry_resolve: confirm sin resolve → `suggestedAction === "retry_resolve"`.
- questions() suggestedAction suggest_reset after crash: plan.json `questions_pending` + history con `reset-confirmation` + decisions `confirmed: true` → `suggestedAction === "suggest_reset"`.

**answer()**:
- Campo inválido: exit 22. Estado incorrecto: exit 13. Post-confirmation: exit 23.
- Estado ready_for_html + confirmed=true: `answer(vertical, 'new')` → exit 13 (no exit 23 — state check antes que confirmation check).
- Campo inválido en estado incorrecto: `answer(planInReadyForHtml, 'nonexistent', 'value')` → exit 22 (field validation primero, antes de state check).
- Choice value numérico puro (`"3"`): exit 26 con `reason: "numeric_value"`.
- Choice value `"Opción personalizada"`: exit 26 con `reason: "not_in_options"` (no es una opción válida del registry).
- Choice value no en opciones sin allowCustom: exit 26 con `reason: "not_in_options"`.
- Choice value custom con allowCustom: éxito.
- Choice value en opciones: éxito.
- Choice value case-insensitive exact: `answer(vertical, "saas / producto digital")` → stored como `"SaaS / Producto Digital"` (forma canónica).
- Retorna `requiredFieldsComplete` y `allQuestionsAddressed`.
- Empty value para required choice: éxito con `warning: "empty_value_for_required_field"`.
- Empty value para required text: éxito con `warning: "empty_value_for_required_field"`.
- Placeholder value rechazado: `answer(vertical, 'TODO')` → exit 26 con `reason: "placeholder_value"`. `answer(audiencia, 'TBD')` → exit 26. `answer(audiencia, '[pendiente]')` → exit 26.
- `optionalAnswered` no se setea para campos requeridos: `answer(vertical, "SaaS")` → `optionalAnswered` no contiene `vertical`.
- `getEmptyFields` defensive guard: `optionalAnswered = { vertical: true }` (bug simulado) → `getEmptyFields(decisions, REQUIRED_FIELDS, optionalAnswered)` still retorna `vertical` como pending (no se deja engañar por flag en requerido).

**resetConfirmation()**:
- Reset: confirmed=false, hashAlgorithm="", optionalAnswered={}, optional values="".
- History: contiene `reset-confirmation` entry.
- No duplicate history on re-execution.
- Limpia optional values: llenar assets="Logo PNG", confirmar, reset → `optionalPendingCount === 1`, `assets === ""`.
- Deriva de OPTIONAL_FIELDS (no hardcodea `assets`): test con segundo optional field dummy.
- Partial recovery: state=questions_pending + confirmed=true → limpia.
- Mockup stale recovery: re-ejecutar rename.
- Mockup rename failure (mock fs.renameSync EACCES): return incluye `staleRenameFailed: true`, estado correcto.
- No-op: questions_pending + confirmed=false + sin mockup.
- Post-reset questions(): llenar todo + confirmar + reset → `questions()` → `optionalPendingCount === 1`, `optionalAnsweredStatus.assets === false`, `requiredPendingCount === 0`, `pending` incluye assets.
- Approved: GSDC_INVALID_STATE.

**Hash**:
- v1 fixture → resolve + submit pasan con normalize NFC.
- v2 plan nuevo → `hashAlgorithm === "sha256-decisions-v2"`.
- `confirmDecisions()` siempre computa v2: v1 plan → confirm → label v2 + hash v2 (7 campos) → resolve pasa.
- `confirmDecisions()` rechaza empty required: 5/6 llenos + 1 empty (warning) → exit 19 `GSDC_QUESTIONS_UNRESOLVED`.
- `hashAlgorithm = ""` → confirm usa v2 (fallback).
- Assets modificado post-confirm → mismatch.
- v1 fixture con uppercase (`vertical: "Moda"`) → resolve pasa (normalize NFC preserva case).

**Otros**:
- Placeholder: `"TBD"` → pending. `"Nodo"` → no. `"TODO"` → yes. `"TODO: definir colores"` → no (exact match). `"PENDIENTE DE REVISIÓN"` → no.
- findPlanDir: `plan status --id 999` → exit 24.
- CLI questions JSON: no double-wrap.
- CLI reset menciona stale.
- CLI handleError fallback: error sin exitCode → exit 1.
- Lock release after questions().
- "confirmo" parsing: `"sí, confirmo"` → confirmed. `"confirmado"` → confirmed. `"claro que no, confirmo"` → confirmed. `"no confirmo"` → rejected. `"no lo confirmo"` → rejected. `"confirmar"` → rejected. `"claro que confirmo"` → confirmed.

---

## Tabla de errores

| Código | Exit | Descripción |
|---|---|---|
| `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` | 21 | Decisiones modificadas post-confirmación. |
| `GSDC_INVALID_FIELD` | 22 | Campo no reconocido. |
| `GSDC_DECISIONS_LOCKED` | 23 | Modificación post-confirm. Usar `reset-confirmation`. |
| `GSDC_PLAN_NOT_FOUND` | 24 | Directorio del plan no existe. |
| `GSDC_PLAN_ARTIFACT_MISSING` | 25 | Archivo falta dentro del plan. |
| `GSDC_INVALID_CHOICE_VALUE` | 26 | Valor no válido para campo choice. Ver opciones. |

Nota: `GSDC_MOCKUP_MISSING` (20) renombra `GSDC_ARTIFACT_MISSING` para mockup.html.

---

## Verificación

1. `npm test`.
2. `plan questions --json` → `requiredPendingCount: 6`.
3. `plan answer --field vertical --value "SaaS" --json` → `requiredPendingCount: 5`.
4. 6 requeridos → `requiredFieldsComplete: true`, preguntar assets antes de confirmar.
5. `confirm-decisions` → `hashAlgorithm: "sha256-decisions-v2"`.
6. Post-confirm answer → exit 23.
7. `reset-confirmation` → `optionalAnswered === {}`, `assets === ""`.
8. `plan questions` en ready_for_html → `readOnly: true`, `status: "ready_for_html"`.
9. `plan questions` en approved → `readOnly: true`.
10. Reset desde approved → exit 13.
11. Confirm + resolver → reset → `questions_pending`, mockup stale.
12. canva-mockup.md sin escritura directa.
13. Assets modificado post-confirm → hash mismatch.
14. **v1 fixture con "Moda" → resolve + submit pasan (NFC normalize preserva case)**.
15. **v1 fixture → confirm → hash label v2 + hash v2 (7 campos) → resolve pasa**.
16. No double-wrap.
17. `plan status --id 999` → exit 24.
18. `"TODO: definir colores"` → no placeholder. `"TODO"` → sí.
19. `"sí, confirmo"` → accepted. `"confirmado"` → accepted. `"claro que no, confirmo"` → accepted. `"no confirmo"` → rejected. `"no lo confirmo"` → rejected. `"confirmar"` → rejected.
20. `answer(vertical, "3")` → exit 26.
21. Fixture v1.1 → `answer(assets, "")` → éxito.
22. Pre-implementation grep audit completado.
23. Post-implementation: `grep -n 'exitCode ||' bin/gsd-canva.js` solo produce `|| 1`.
24. Post-implementation: `rg "vertical.*audiencia.*formato.*paleta.*copy.*cta" lib/plan-manager.js` retorna 0 hits (excepto FIELD_REGISTRY y hash fields).
25. Post-implementation: `rg "GSDC_ARTIFACT_MISSING" lib/ bin/ tests/` retorna 0 hits.

---

## Notas

- `FIELD_REGISTRY` = única fuente de verdad. Incluye `allowCustom: true` y `customFollowUp` en campos de choice que aceptan valores custom (vertical, formato, cta).
- Template usa `ask_question` de Antigravity para preguntas interactivas. Antigravity provee texto libre automáticamente — nunca agregar "Otro" manual.
- `answer()` rechaza placeholders (`TODO`, `TBD`, etc.) con exit 26 `reason: "placeholder_value"` para todos los campos.
- `questions()` incluye `suggestedAction` y `editable` fields. `editable: false` es protección estructural — el JSON no invita al error.
- `questions()` incluye `optionalAnsweredStatus` para distinguir "declinado" de "nunca preguntado".
- `ensureV2Fields()` al inicio de TODAS las funciones que leen `decisions.json` — incluyendo `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`, `status()`. Normaliza `confirmation` skeleton.
- `ensureV2Fields()` no persiste en `questions()` ni `status()` (read-only) — se persiste en primera mutación.
- Normalize única `NORMALIZE` = `NFC` case-sensitive para v1 y v2 — versión solo difiere en field list (6 vs 7). Previene divergencia accidental.
- `confirmDecisions()` siempre computa hash v2 (7 campos) — migración atómica. Hash almacenado y label siempre coinciden.
- `optionalAnswered` set para toda respuesta opcional (vacío o no).
- `resetConfirmation()` itera `OPTIONAL_FIELDS` para limpiar valores — no hardcodea `assets`.
- `questions()` muestra `confirmed: true` + `readOnly: true` cuando questions_pending + confirmed (entre confirm y resolve).
- `questions()` read-only para todos los estados post-questions_pending.
- `questions()` retorna **siempre valores reales** para `pending`, `filled`, `filledCount`, `requiredPendingCount`, `optionalPendingCount`, `requiredFieldsComplete`, `allQuestionsAddressed` — independientemente de `readOnly` o `confirmed`. `readOnly: true` es la protección contra edición, no masking de datos.
- Template transición: requiredFieldsComplete → preguntar assets → confirmar. No salta opcionales.
- Template multi-campo: mapeo semántico, no posicional. No guardar si incierto.
- Template matching: substring case-insensitive de exactamente 1 opción → confirmar. Múltiples/ninguna → lista completa.
- "confirmo" parsing: word-boundary regex `/\b(confirmo|confirmado)\b/i` con negation check anclado (`/\bno\s+(lo\s+)?(confirmo|confirmado)\b/i` → rechazar). Solo detecta negación directa del verbo. **Trade-off aceptado**: "confirmo pero quiero cambiar" pasa — reset-confirmation disponible.
- `answer()` valida choice values: rechaza numéricos puros (`reason: "numeric_value"`), placeholders (`reason: "placeholder_value"`), valores fuera de opciones (`reason: "not_in_options"`).
- `GSDC_MOCKUP_MISSING` (20) reemplaza `GSDC_ARTIFACT_MISSING` para mockup — sin colisión.
- CLI handleError fallback → `err.exitCode || 1`.
- Error table tiene catch-all row para códigos inesperados.
- Reset-confirmation es idempotente y reintentable — error table lo indica.
- `resetConfirmation()` escribe plan.json antes que decisions.json — crash deja estado donde re-ejecución continúa limpiamente.
- Placeholder detection `===` es breaking change documentado.
- Breaking changes con pre-implementation grep.
- `confirmDecisions()` rechaza campos requeridos vacíos con `GSDC_QUESTIONS_UNRESOLVED` (exit 19) — protección a nivel API.
- Template multi-campo: si cantidad < pendientes, guardar exitosos, preguntar restantes.
- Template Otro: detectar por label (no value — value es `""`).
- Template confirm→resolve: si resolve falla, reintentar una vez. Si persiste, reset-confirmation.
- Template reset: informar usuario qué se preserva (requeridos) y qué se limpia (opcionales).
- `questions()` incluye `optionalAnsweredStatus` para distinguir "declinado" de "nunca preguntado".
- Hardcoded field arrays en funciones existentes reemplazados con `REQUIRED_FIELDS`.
