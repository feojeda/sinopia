# Plan: Preguntas Interactivas en `/canva-mockup` (Rev. 11)

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

**`hashAlgorithm` upgrade**: `confirmDecisions()` siempre computa hash v2 (7 campos con `assets`). Planes existentes con hash v1 almacenado son verificados con la normalize vieja (`NFC`, case-sensitive). La confirmación migra automáticamente a v2.

**`readJsonOrThrow()` migration**: `status()`, `confirmDecisions()`, `resolveQuestions()`, `submitMockup()` cambian missing-file de exit 15 → 25.

**Placeholder detection**: `includes()` → `===` (exact match). Valores como `"PENDIENTE DE REVISIÓN"` o `"TODO: definir colores"` ya NO son detectados como placeholder — solo los valores exactos de la lista. Esto es intencional.

**CLI `handleError` fallbacks**: Actualizar `err.exitCode || 15` y `err.exitCode || 19` a `err.exitCode || 1` (generic fallback). Cualquier error sin `exitCode` explícito usa 1, no un code viejo.

---

## Cambios

### 1. `lib/plan-manager.js` — `FIELD_REGISTRY` y helpers compartidos

**`FIELD_REGISTRY`**: Constante a nivel módulo — única fuente de verdad:

```js
const FIELD_REGISTRY = [
  { id: 'vertical', question: '¿Qué tipo de diseño quieres crear?', type: 'choice', required: true, options: [
    { label: 'SaaS / Producto Digital', value: 'SaaS / Producto Digital' },
    { label: 'E-Commerce / Retail', value: 'E-Commerce / Retail' },
    { label: 'Evento / Workshop', value: 'Evento / Workshop' },
    { label: 'Restaurante / Alimentos', value: 'Restaurante / Alimentos' },
    { label: 'Educación / Curso', value: 'Educación / Curso' },
    { label: 'Salud / Bienestar', value: 'Salud / Bienestar' },
    { label: 'Inmobiliaria', value: 'Inmobiliaria' },
    { label: 'Personal Brand / Portafolio', value: 'Personal Brand / Portafolio' }
  ]},
  { id: 'formato', question: '¿Qué formato y dimensiones necesitas?', type: 'choice', required: true, options: [
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
  { id: 'cta', question: '¿Qué texto llevará el botón de acción?', type: 'choice', required: true, options: [
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

**`ensureV2Fields(decisions)`**: Normaliza planes v1.1: `decisions.optionalAnswered = decisions.optionalAnswered || {}; decisions.assets = decisions.assets !== undefined ? decisions.assets : "";`. Se llama al inicio de **todas** las funciones que leen `decisions.json`: `questions()`, `answer()`, `resetConfirmation()`, `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`, `status()`. Después de state validation, antes de cualquier operación.

**`findPlanDirOrThrow(planId, cwd)`**: `GSDC_PLAN_NOT_FOUND` (exit 24) cuando directorio no existe. Migrar todas las funciones existentes.

**`readJsonOrThrow(filePath)`**: Archivo no existe → `GSDC_PLAN_ARTIFACT_MISSING` (exit 25). JSON corrupto → `GSDC_JSON_PARSE_ERROR` (exit 15). No aplica a `list()`.

**Distinción de errores**: `GSDC_PLAN_NOT_FOUND` (24) = directorio no existe. `GSDC_PLAN_ARTIFACT_MISSING` (25) = archivo falta dentro de plan. `GSDC_MOCKUP_MISSING` (20) = rename de `GSDC_ARTIFACT_MISSING` — mockup.html falta durante submit (nombre más explícito).

**`getEmptyFields(decisions, fieldList, optionalAnswered)`**:

```js
function getEmptyFields(decisions, fieldList, optionalAnswered = {}) {
  const placeholders = ['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR'];
  return fieldList.filter(field => {
    if (optionalAnswered[field]) return false;
    const val = String(decisions[field] || '').trim();
    const upper = val.toUpperCase();
    const isPlaceholder = placeholders.some(p => upper === p) || (val.startsWith('[') && val.endsWith(']'));
    return !val || isPlaceholder;
  });
}
```

**Semántica de contadores**:
- `requiredFieldsComplete`: `true` cuando `requiredPendingCount === 0`. El agente debe preguntar assets (si pending) y luego presentar resumen. No es permiso para auto-confirmar ni para saltar opcionales.
- `allQuestionsAnswered`: `true` cuando `requiredPendingCount === 0 && optionalPendingCount === 0`.

**`optionalAnswered`**: Se set `optionalAnswered[field] = true` para **toda** respuesta a campo opcional (vacío o no). `getEmptyFields()` excluye campos con flag `true`.

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
  "allQuestionsAnswered": false,
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
        { "label": "Personal Brand / Portafolio", "value": "Personal Brand / Portafolio" },
        { "label": "Otro (personalizado)", "value": "", "customFollowUp": "Escribe tu opción personalizada:" }
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
        { "label": "Pinterest Pin (1000x1500)", "value": "Pinterest Pin (1000x1500)" },
        { "label": "Otro (personalizado)", "value": "", "customFollowUp": "Escribe el formato y dimensiones:" }
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
        { "label": "Ver Colección", "value": "Ver Colección" },
        { "label": "Otro (personalizado)", "value": "", "customFollowUp": "Escribe el texto del botón:" }
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
- `mockup:questions_pending` + `confirmed === false` → flujo normal con `readOnly: false`, `confirmed: false`
- `mockup:questions_pending` + `confirmed === true` (entre confirm y resolve) → `readOnly: true`, `confirmed: true`, `pending: []`. El agente informa "confirmado, esperando transición" y no permite answers.
- Cualquier estado post-`questions_pending` (`ready_for_html`, `pending_approval`, `approved`, etc.) → `readOnly: true`, `confirmed: true/false` según corresponda, `status` refleja el estado real del plan, `filled` con todos, `pending: []`.
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
  - Si `value` es `""` y campo es `required: true` → aceptar pero incluir `"warning": "empty_value_for_required_choice"` en la respuesta (no fallar — `requiredFieldsComplete` será false)
  - Si `value` es un string puramente numérico (regex `/^\d+$/`) → `GSDC_INVALID_CHOICE_VALUE` (exit 26) con mensaje "Valor numérico no válido. Usar el texto de la opción."
  - Si `value` es exactamente `"Otro (personalizado)"` → `GSDC_INVALID_CHOICE_VALUE` (exit 26) con mensaje "Selecciona 'Otro' y provee un valor personalizado."
  - Si `value` no coincide con ninguna opción (case-insensitive) y el campo tiene `allowCustom: true` → aceptar (valor custom)
  - Si `value` no coincide y el campo NO tiene `allowCustom` → `GSDC_INVALID_CHOICE_VALUE` (exit 26) listando opciones válidas
- **Orden de operaciones**: acquire lock → leer `decisions.json` → validar estado `mockup:questions_pending` → `ensureV2Fields()` → validar `confirmation.confirmed !== true` → validar choice value → escribir atómicamente → release lock en `finally`
- No actualiza `plan.json` por diseño
- **Campos opcionales**: `optionalAnswered[field] = true` para toda respuesta
- Retorna datos crudos:

```json
{
  "planId": "001",
  "field": "vertical",
  "value": "SaaS / Producto Digital",
  "requiredPendingCount": 5,
  "optionalPendingCount": 1,
  "requiredFieldsComplete": false,
  "allQuestionsAnswered": false
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
- **Idempotencia**: `if (state === 'questions_pending' && confirmed !== true && !mockupExists) → no-op`
- Si `ready_for_html` o `pending_approval`, revierte a `mockup:questions_pending`
- Si existe `mockup.html`, renombra a `.stale.<timestamp>`
- Limpia en `decisions.json`: `confirmed = false`, `confirmedAt = null`, `decisionsHash = ""`, `hashAlgorithm = ""`, `optionalAnswered = {}`, y **itera `OPTIONAL_FIELDS`** para poner cada valor a `""` (no hardcodea `assets`)
- **Orden de operaciones**:
  1. Acquire lock
  2. Leer archivos
  3. Validar estado
  4. Escribir `decisions.json`: limpiar confirmation + `optionalAnswered = {}` + iterar `OPTIONAL_FIELDS` poner a `""`
  5. Escribir `plan.json`: estado `questions_pending` + push history `{ action: 'reset-confirmation', from, to, timestamp }`. Si último entry ya tiene `action: 'reset-confirmation'` con mismo `from` → no duplicar.
  6. Renombrar `mockup.html` a `.stale` si existe
  7. Release lock en `finally`
- **Recuperación**: Si falla después de paso 4, estado es `ready_for_html`/`pending_approval` + `confirmed=false` → `answer()` falla con `GSDC_INVALID_STATE` (diagnósable). Re-ejecutar procede desde paso 5. Si falla después de paso 5, re-ejecutar ve mockupExists → procede con rename.
- Retorna confirmación + nuevo estado + si mockup fue staled

Errores:
- Plan no existe → `GSDC_PLAN_NOT_FOUND` (exit 24)
- Estado `approved` o posterior → `GSDC_INVALID_STATE` (exit 13)

### 5. `bin/gsd-canva.js` — Agregar subcomandos + fix fallbacks

```
gsd-canva plan questions --id <ID> [--json]
gsd-canva plan answer --id <ID> --field <campo> --value <valor> [--json]
gsd-canva plan reset-confirmation --id <ID> [--json]
```

**CLI `handleError` fallbacks**: Cambiar todos los `err.exitCode || 15` y `err.exitCode || 19` a `err.exitCode || 1`. Cualquier error sin `exitCode` explícito usa 1 (generic).

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
    *   **Si `readOnly: true`**: Decisiones bloqueadas. Muestra resumen. Si `confirmed: true` y estado es `ready_for_html`/`pending_approval`, sugiere `reset-confirmation`. Si `approved` o posterior, sugiere plan nuevo.
    *   **Renderizado de preguntas** (si hay `pending`):
        *   Presenta preguntas pendientes numeradas. Requeridos primero.
        *   Para `choice`: muestra opciones numeradas exactamente como vienen en JSON.
        *   Para `text`: muestra placeholder.
        *   **Mapeo numérico**: número → `value` de opción. `--value` siempre texto final.
        *   **Matching en choices**: Si el texto del usuario es case-insensitive substring de exactamente una opción, mostrar esa opción para confirmar. Si coincide con múltiples o ninguna, mostrar lista completa numerada. No pasar texto libre como valor de choice.
        *   **Multi-campo**: Si el usuario responde con múltiples valores en un mensaje:
            1. Mapear por semántica (contenido → campo), no por posición
            2. Si cantidad no coincide con campos pendientes → no guardar nada, pedir aclaración
            3. Si algún mapeo es incierto → no guardar ese campo, preguntar
            4. Guardar campos exitosos uno por uno con `plan answer`
        *   **"Otro (personalizado)"**: Si selecciona esta opción, hacer follow-up con `customFollowUp`. Solo el texto resultante va a `plan answer`. ⚠️ **PROHIBIDO** guardar `"Otro (personalizado)"` o índices numéricos.
    *   **Pregunta de assets**: Si `optionalPendingCount > 0`, preguntar assets. Si el usuario dice que no → `plan answer --field assets --value ""`.
    *   **Guardado y transición**:
        *   Por cada respuesta:
            ```bash
            gsd-canva plan answer --id <ID> --field <campo> --value "<respuesta>"
            ```
        *   Después de cada `plan answer`:
            - Si `requiredFieldsComplete === false` → siguiente pregunta pendiente
            - Si `requiredFieldsComplete === true` Y `optionalPendingCount > 0` → preguntar assets
            - Si `requiredFieldsComplete === true` Y `optionalPendingCount === 0` → avanzar a Revisión/Confirmación
        *   ⚠️ **PROHIBIDO** escribir directamente en `decisions.json`.
    *   **Manejo de errores**:
        | Error | Acción |
        |---|---|
        | `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (21) | Ejecutar `reset-confirmation` y repetir. |
        | `GSDC_INVALID_FIELD` (22) | Re-ejecutar `plan questions`. |
        | `GSDC_DECISIONS_LOCKED` (23) | Preguntar si ejecutar `reset-confirmation`. |
        | `GSDC_PLAN_NOT_FOUND` (24) | Sugerir `plan create`. |
        | `GSDC_PLAN_ARTIFACT_MISSING` (25) | Detener flujo. |
        | `GSDC_INVALID_CHOICE_VALUE` (26) | Mostrar opciones válidas. Re-preguntar. |
        | `GSDC_INVALID_STATE` (13) | Ejecutar `plan status`. Sugerir `reset-confirmation` si aplica. Nota: `questions()` no lanza este error — retorna `readOnly`. |
        | `GSDC_JSON_PARSE_ERROR` (15) | Detener flujo. Pedir intervención manual. |
        | Cualquier otro código | Detener flujo. Reportar error completo. Sugerir `plan status`. |
        Nota: `reset-confirmation` es idempotente — si falla, reintentar una vez. Si persiste, reportar estado.
*   **Poblado de archivos Markdown**:
    *   Actualizar como espejo de `decisions.json`. ⚠️ **PROHIBIDO** editar Markdown con datos que no estén primero en `decisions.json`.
*   **Revisión Final y Confirmación**:
    1. Presenta resumen de todas las respuestas.
    2. Destaca confirmado vs tentativo.
    3. **"Responde 'confirmo' para continuar."**
    4. ⚠️ **DETÉN** hasta respuesta.
    5. **Parsing**: Strip trailing `.`, `!`, `,` del input. Luego comparar con `"confirmo"` (case-insensitive, trimmed). Si no coincide → "Para confirmar, responde únicamente 'confirmo'." No entrar en flujo de edición.
    6. Solo con "confirmo":
        - `gsd-canva plan confirm-decisions --id <ID>`
        - `gsd-canva plan resolve-questions --id <ID>`
    7. ⚠️ **PROHIBIDO** ejecutar sin "confirmo". **PROHIBIDO** generar `mockup.html` autónomamente.
*   **Corrección post-confirmación**:
    *   Si hay `mockup.html`: ⚠️ "Esto invalidará el mockup. ¿Continuar?"
    *   Si confirma: `reset-confirmation` → `plan answer` → nueva confirmación.
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
  "optionalAnswered": {}
}
```

`hashAlgorithm: "sha256-decisions-v2"` en `create()`.

### 8. `lib/plan-manager.js` — Hash criptográfico con migración v1→v2

```js
const NORMALIZE_V1 = (v) => String(v || '').trim().normalize('NFC');
const NORMALIZE_V2 = (v) => String(v || '').trim().normalize('NFC');

function computeDecisionsHash(decisions, hashAlgorithm) {
  const normalize = hashAlgorithm === 'sha256-decisions-v1' ? NORMALIZE_V1 : NORMALIZE_V2;
  const fields = hashAlgorithm === 'sha256-decisions-v1'
    ? ['vertical', 'audiencia', 'formato', 'paleta', 'copy', 'cta']
    : ['vertical', 'audiencia', 'formato', 'paleta', 'copy', 'cta', 'assets'];
  const payload = JSON.stringify(Object.fromEntries(fields.map(f => [f, normalize(decisions[f])])));
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

**La normalize es la misma** (`NFC`, case-sensitive) para v1 y v2. Esto garantiza compatibilidad exacta con hashes existentes.

**`confirmDecisions()` siempre computa con v2**: Ignora el `hashAlgorithm` entrante, computa hash sobre 7 campos, escribe `hashAlgorithm: 'sha256-decisions-v2'`. Esto hace la migración atómica — hash almacenado y label siempre coinciden.

**`resolveQuestions()` y `submitMockup()`**: Leen `confirmation.hashAlgorithm` y usan dispatch. Si es `sha256-decisions-v1`, usan 6 campos + normalize vieja. Cualquier otro caso (v2, vacío, undefined) → 7 campos.

### 9. Referencias cruzadas

`rg "mockup:pending" templates/ docs/ README.md` → actualizar.

### 10. `templates/plan-templates/preguntas.md` — Agregar `assets`

### 11. `tests/plan.test.js`

**FIELD_REGISTRY y helpers**:
- FIELD_REGISTRY consistency: cada `id` aceptado por `answer()`, `questions()` length = registry.
- optionalAnswered migration v1.1: fixture sin `optionalAnswered` → `answer(assets, "")` → éxito, flag set.
- optionalAnswered migration v1.1 questions: fixture → `questions()` → éxito.
- ensureV2Fields in confirmDecisions: fixture v1.1 → `confirmDecisions()` → `assets: ""`, `optionalAnswered: {}` en disco.

**questions()**:
- Vacío: `requiredPendingCount === 6`.
- Parcial, completo, assets lleno, assets declinado, assets no-vacío (flag set).
- Read-only ready_for_html: `readOnly: true`, `status === "ready_for_html"`.
- Read-only approved: `readOnly: true`.
- Read-only pending + confirmed: `readOnly: true`, `confirmed: true`.
- Plan inexistente: exit 24. Corrupto: exit 15. Faltante: exit 25.
- Otro en JSON: choice tiene "Otro (personalizado)" con `value: ""`.
- questions() no persiste v2 migration: fixture v1.1 → `questions()` → disco sigue sin `optionalAnswered`.

**answer()**:
- Campo inválido: exit 22. Estado incorrecto: exit 13. Post-confirmation: exit 23.
- Choice value numérico puro (`"3"`): exit 26.
- Choice value `"Otro (personalizado)"`: exit 26.
- Choice value no en opciones sin allowCustom: exit 26.
- Choice value custom con allowCustom: éxito.
- Choice value en opciones: éxito.
- Retorna `requiredFieldsComplete` y `allQuestionsAnswered`.
- Empty value para required choice: éxito con `warning: "empty_value_for_required_choice"`.

**resetConfirmation()**:
- Reset: confirmed=false, hashAlgorithm="", optionalAnswered={}, optional values="".
- History: contiene `reset-confirmation` entry.
- No duplicate history on re-execution.
- Limpia optional values: llenar assets="Logo PNG", confirmar, reset → `optionalPendingCount === 1`, `assets === ""`.
- Deriva de OPTIONAL_FIELDS (no hardcodea `assets`): test con segundo optional field dummy.
- Partial recovery: state=questions_pending + confirmed=true → limpia.
- Mockup stale recovery: re-ejecutar rename.
- No-op: questions_pending + confirmed=false + sin mockup.
- Approved: GSDC_INVALID_STATE.

**Hash**:
- v1 fixture → resolve + submit pasan con normalize NFC.
- v2 plan nuevo → `hashAlgorithm === "sha256-decisions-v2"`.
- `confirmDecisions()` siempre computa v2: v1 plan → confirm → label v2 + hash v2 (7 campos) → resolve pasa.
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
19. `"confirmo."` → accepted (stripped). `"confirmo, gracias"` → rejected.
20. `answer(vertical, "3")` → exit 26.
21. Fixture v1.1 → `answer(assets, "")` → éxito.
22. Pre-implementation grep audit completado.

---

## Notas

- `FIELD_REGISTRY` = única fuente de verdad.
- `ensureV2Fields()` al inicio de TODAS las funciones que leen `decisions.json` — incluyendo `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`, `status()`.
- `ensureV2Fields()` no persiste en `questions()` (read-only) — se persiste en primera mutación.
- Normalize es `NFC` case-sensitive para v1 y v2 — compatibilidad exacta con hashes existentes. No hay `toLowerCase()`.
- `confirmDecisions()` siempre computa hash v2 (7 campos) — migración atómica. Hash almacenado y label siempre coinciden.
- `optionalAnswered` set para toda respuesta opcional (vacío o no).
- `resetConfirmation()` itera `OPTIONAL_FIELDS` para limpiar valores — no hardcodea `assets`.
- `questions()` muestra `confirmed: true` + `readOnly: true` cuando questions_pending + confirmed (entre confirm y resolve).
- `questions()` read-only para todos los estados post-questions_pending.
- Template transición: requiredFieldsComplete → preguntar assets → confirmar. No salta opcionales.
- Template multi-campo: mapeo semántico, no posicional. No guardar si incierto.
- Template matching: substring case-insensitive de exactamente 1 opción → confirmar. Múltiples/ninguna → lista completa.
- "confirmo" parsing: strip `.`, `!`, `,` trailing antes de comparar.
- `answer()` valida choice values: rechaza numéricos puros, "Otro (personalizado)", valores fuera de opciones.
- `GSDC_MOCKUP_MISSING` (20) reemplaza `GSDC_ARTIFACT_MISSING` para mockup — sin colisión.
- CLI handleError fallback → `err.exitCode || 1`.
- Error table tiene catch-all row para códigos inesperados.
- Reset-confirmation es idempotente y reintentable — error table lo indica.
- `resetConfirmation()` escribe decisions.json antes que plan.json.
- Placeholder detection `===` es breaking change documentado.
- Breaking changes con pre-implementation grep.
