# Plan: Preguntas Interactivas en `/canva-mockup` (Rev. 10)

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

**`findPlanDir()` exit code migration**: Actualmente lanza `GSDC_JSON_PARSE_ERROR` (exit 15) cuando un plan no existe. Esta proposal lo migra a `GSDC_PLAN_NOT_FOUND` (exit 24) para **todas** las funciones existentes. **Pre-implementation step**: ejecutar `rg "exit.*15|GSDC_JSON_PARSE_ERROR|exitCode.*15|code.*15" templates/ bin/ tests/ docs/` y auditar cada hit antes de cambiar código. Funciones afectadas: `findPlanDir()`, `status()`, `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`, `approveMockup()`.

**`hashAlgorithm` upgrade**: Nuevas confirmaciones usan `sha256-decisions-v2` (7 campos). Planes existentes con `sha256-decisions-v1` son soportados — la primera re-confirmación migra automáticamente.

**`readJsonOrThrow()` migration**: Las siguientes funciones cambian error codes al adoptar el helper: `status()` (missing decisions.json: 15→25), `confirmDecisions()` (15→25), `resolveQuestions()` (15→25), `submitMockup()` (15→25), `questions()` (nueva), `answer()` (nueva), `resetConfirmation()` (nueva).

---

## Cambios

### 1. `lib/plan-manager.js` — `FIELD_REGISTRY` y helpers compartidos

**`FIELD_REGISTRY`**: Constante a nivel módulo — única fuente de verdad para los 7 campos. Todas las funciones derivan de ella:

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
```

Campos tipo `choice` incluyen `"Otro (personalizado)"` como última opción en la salida de `questions()` — viene del `FIELD_REGISTRY` con `value: ""` y `customFollowUp`.

**`ensureV2Fields(decisions)`**: Helper que normaliza planes v1.1 agregando campos faltantes: `decisions.optionalAnswered = decisions.optionalAnswered || {}; decisions.assets = decisions.assets !== undefined ? decisions.assets : "";`. Llamado al inicio de `questions()`, `answer()`, y `resetConfirmation()` antes de cualquier operación. Garantiza que planes creados antes de v1.2 funcionan sin crash.

**`findPlanDirOrThrow(planId, cwd)`**: Extraer `findPlanDir()` a helper dedicado que lanza `GSDC_PLAN_NOT_FOUND` (exit 24) cuando el directorio no existe. Migrar todas las funciones existentes.

**`readJsonOrThrow(filePath)`**: Helper para parsing de JSON. Archivo no existe → `GSDC_PLAN_ARTIFACT_MISSING` (exit 25). JSON corrupto → `GSDC_JSON_PARSE_ERROR` (exit 15). No aplica a `list()`.

**Distinción de errores**: `GSDC_PLAN_NOT_FOUND` (24) = directorio no existe. `GSDC_PLAN_ARTIFACT_MISSING` (25) = archivo falta dentro de plan existente. `GSDC_ARTIFACT_MISSING` (20) = se mantiene para `submitMockup()` (mockup.html falta).

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

`confirmDecisions()`, `resolveQuestions()`, `questions()` usan este helper.

**Semántica de contadores**:
- `requiredFieldsComplete`: `true` cuando `requiredPendingCount === 0`. Significa "presentar resumen y pedir confirmación". NO es permiso para auto-confirmar.
- `allQuestionsAnswered`: `true` cuando `requiredPendingCount === 0 && optionalPendingCount === 0`.

**`optionalAnswered` en `decisions.json`**: Objeto `optionalAnswered: {}` que rastrea qué campos opcionales fueron respondidos (con valor o vacío). Se set `optionalAnswered[field] = true` para **cualquier** respuesta a un campo opcional — tanto `"Logo PNG"` como `""` (declinado). `getEmptyFields()` excluye campos con `optionalAnswered[field] === true`. El nombre es preciso: "este campo opcional fue respondido".

### 2. `lib/plan-manager.js` — Agregar función `questions(planId)`

Leer `decisions.json`, filtrar campos vacíos/placeholders, retornar datos crudos (sin wrapper — CLI envuelve via `handleSuccess()`):

```json
{
  "planId": "001",
  "phase": "mockup",
  "status": "questions_pending",
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
- Plan en `mockup:questions_pending` → flujo normal con pending/filled
- Plan en cualquier estado post-`questions_pending` (`ready_for_html`, `pending_approval`, `approved`, etc.) → retorna snapshot read-only con `readOnly: true`, `filled` con todos los campos, `pending: []`. El agente puede inspeccionar decisiones. Para editar, usar `reset-confirmation` (solo disponible para `ready_for_html` y `pending_approval` — ver sección 4).
- `questions()` **nunca** lanza `GSDC_INVALID_STATE` — siempre retorna data, sea interactiva o read-only.

**Lock**: `questions()` adquiere lock global antes de leer, libera en `finally`.

### 3. `lib/plan-manager.js` — Agregar función `answer(planId, field, value)`

```bash
gsd-canva plan answer --id 001 --field vertical --value "SaaS / Producto Digital"
gsd-canva plan answer --id 001 --field assets --value ""
gsd-canva plan answer --id 001 --field assets --value "Logo en PNG"
```

Comportamiento:
- Valida que `field` esté en `ALL_FIELDS`
- **Orden de operaciones**: acquire lock → leer `decisions.json` → `ensureV2Fields()` → validar estado `mockup:questions_pending` → validar `confirmation.confirmed !== true` → escribir atómicamente → release lock en `finally`
- No actualiza `plan.json` por diseño — audit trail en `decisions.json`
- **Campos opcionales**: Para cualquier campo `required: false`, set `optionalAnswered[field] = true` (tanto valor vacío como no vacío). Esto rastrea que el campo fue respondido. `getEmptyFields()` excluye campos con `optionalAnswered[field] === true` de los pendientes.
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
- Estado incorrecto (no `questions_pending`) → `GSDC_INVALID_STATE` (exit 13)
- Ya confirmado → `GSDC_DECISIONS_LOCKED` (exit 23)

### 4. `lib/plan-manager.js` — Agregar función `resetConfirmation(planId)`

```bash
gsd-canva plan reset-confirmation --id <ID>
```

Comportamiento:
- Valida que el plan exista
- Acepta estados `mockup:questions_pending`, `mockup:ready_for_html` o `mockup:pending_approval`. Para `mockup:approved` y estados posteriores → `GSDC_INVALID_STATE` (exit 13) con mensaje "Post-approval reset no soportado. Crear un plan nuevo para cambios." (out of scope para esta versión).
- **Idempotencia (condición explícita)**:
  ```
  if (state === 'questions_pending' && confirmed !== true && !mockupExists) → no-op
  else → proceed with cleanup
  ```
  Verifica tres condiciones, no solo state. Cualquier otra combinación procede.
- Si el estado es `ready_for_html` o `pending_approval`, revierte a `mockup:questions_pending`
- Si existe `mockup.html`, lo renombra a `mockup.html.stale.<timestamp>`
- Limpia en `decisions.json`: `confirmed = false`, `confirmedAt = null`, `decisionsHash = ""`, `hashAlgorithm = ""`, `optionalAnswered = {}`, y valores de campos opcionales a `""` (ej: `assets = ""`)
- **Orden de operaciones** (decisions.json primero para evitar estado inconsistente):
  1. Acquire lock
  2. Leer archivos (`plan.json`, `decisions.json`)
  3. Validar estado
  4. Escribir `decisions.json`: `confirmed = false`, `confirmedAt = null`, `decisionsHash = ""`, `hashAlgorithm = ""`, `optionalAnswered = {}`, `assets = ""`
  5. Escribir `plan.json`: estado `mockup:questions_pending` + push history entry `{ action: 'reset-confirmation', from: previousState, to: 'questions_pending', timestamp }`. Si el último history entry ya tiene `action: 'reset-confirmation'` con mismo `from` → no duplicar (idempotencia de history).
  6. Renombrar `mockup.html` a `.stale` si existe
  7. Release lock en `finally`
- **Recuperación de fallos parciales**:
  - Si falla después de paso 4 (decisions limpio) pero antes de paso 5 (plan.json): estado sigue `ready_for_html`/`pending_approval` con `confirmed = false`. `answer()` falla con `GSDC_INVALID_STATE` — error claro y diagnosable. Re-ejecutar procede desde paso 5.
  - Si falla después de paso 5 (plan limpio) pero antes de paso 6 (mockup rename): estado `questions_pending`, `confirmed = false`, mockup existe. Re-ejecutar: idempotency check ve `mockupExists === true` → procede con rename.
  - Si falla en paso 4: estado original se mantiene, re-ejecutar procede normalmente.
- Retorna confirmación del reset + nuevo estado + si mockup fue staled

Errores:
- Plan no existe → `GSDC_PLAN_NOT_FOUND` (exit 24)
- Estado `approved` o posterior → `GSDC_INVALID_STATE` (exit 13) con mensaje específico

### 5. `bin/gsd-canva.js` — Agregar subcomandos

```
gsd-canva plan questions --id <ID> [--json]
gsd-canva plan answer --id <ID> --field <campo> --value <valor> [--json]
gsd-canva plan reset-confirmation --id <ID> [--json]
```

En modo `--json`: `handleSuccess()` envuelve en `{ ok: true, data: <resultado> }`.
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
     Ej: Logo en PNG, fuente Montserrat...

  Requeridos: 0/6 · Opcionales: 0/1
  ```
- `plan answer`: confirmación + contadores + `requiredFieldsComplete` flag.
- `plan reset-confirmation`: confirmación + nuevo estado + mención de mockup stale si aplica ("mockup.html renombrado a mockup.html.stale.20260530-140000").

### 6. `templates/commands/canva-mockup.md` — Reemplazar SECCIÓN 2 COMPLETA

**IMPORTANTE**: No reemplazar solo el roadblock. Reemplazar **toda la sección 2** para eliminar escritura directa en `decisions.json`.

Texto completo que reemplaza **toda la sección 2** del template actual:

```markdown
### 2. Levantamiento de Requisitos, Investigación y Confirmación (YIELD GATE OBLIGATORIO)
*   **Análisis del Contexto del Usuario**:
    *   Analiza la instrucción inicial del usuario cuidadosamente y clasifica el nivel de contexto recibido:
        *   **Contexto Requerido Completo**: El usuario proveyó vertical, audiencia, formato, paleta, copy y CTA (los 6 campos requeridos) → Guarda esos campos inmediatamente usando `gsd-canva plan answer`. `assets` es opcional y no afecta esta clasificación.
        *   **Contexto Parcial**: El usuario proveyó algunos datos pero no todos → Guarda **solo los campos explícitamente provistos** usando `gsd-canva plan answer`.
        *   **Sin Contexto**: El usuario solo proveyó un nombre genérico (ej: `test2`) → No guardes nada, pasa directo a preguntas.
    *   **Tabla de ejemplos de extracción**:
        | Input del usuario | Campos a guardar | Razón |
        |---|---|---|
        | `"quiero un banner azul para mi restaurante"` | `paleta: "azul"` | Solo "azul" es explícitamente provisto. "banner" es ambiguo, "restaurante" es inferido. |
        | `"Instagram post, CTA: Inscríbete Ya"` | `formato: "Instagram Post (1080x1080)"`, `cta: "Inscríbete Ya"` | Formato y CTA explícitos. |
        | `"landing page moderna, colores oscuros"` | `paleta: "colores oscuros"` | Solo la paleta es explícita. |
    *   **Regla fallback**: Ante duda sobre si información mapea a un campo, **NO** la guardes — deja que el flujo de preguntas estructuradas la recolecte. Es mejor preguntar de más que guardar incorrectamente.
    *   💡 **REGLA DE SUGERENCIAS**: Puedes proponer opciones al usuario como **propuestas tentativas no confirmadas**. ⚠️ **PROHIBIDO** registrarlas en `decisions.json` sin consentimiento explícito.
*   **Preguntas Interactivas Obligatorias**:
    *   Ejecuta el comando para obtener las preguntas estructuradas:
        ```bash
        gsd-canva plan questions --id <ID_DE_TRES_DÍGITOS> --json
        ```
    *   **Si `questions()` retorna `readOnly: true`**: Las decisiones ya están confirmadas. Muestra las decisiones actuales al usuario y explica que están bloqueadas. Si el usuario quiere cambios y el estado es `ready_for_html` o `pending_approval`, sugiere `reset-confirmation`. Si el estado es `approved` o posterior, informa que no se puede modificar y sugiere crear un plan nuevo.
    *   **Renderizado de preguntas** (si hay `pending`):
        *   Presenta cada pregunta pendiente al usuario de forma clara y numerada. Requeridos primero, assets al final.
        *   Para campos tipo `choice`: muestra las opciones numeradas **exactamente como vienen en el JSON**, incluyendo "Otro (personalizado)".
        *   Para campos tipo `text`: muestra el placeholder como guía.
        *   Espera la respuesta del usuario antes de pasar a la siguiente pregunta.
        *   **Mapeo de entrada numérica**: Si el usuario responde con un número, mapearlo al `value` de la opción correspondiente. `--value` siempre recibe texto final, nunca el índice.
        *   **Respuestas multi-campo**: Si el usuario responde con múltiples campos en un mensaje (ej: "SaaS, Instagram Post, jóvenes"), extrae cada par campo-valor y ejecuta `plan answer` para cada uno secuencialmente. Si algún campo es ambiguo, pide aclaración antes de guardar.
        *   **Matching en choice fields**: Si el texto del usuario no coincide exactamente con un `value` (case-insensitive), muestra las opciones más cercanas o la lista completa numerada para confirmar. No pases texto libre como valor de choice — solo valores exactos de opción o texto de "Otro (personalizado)".
        *   **Opción "Otro (personalizado)"**: Si el usuario la selecciona, haz la pregunta de seguimiento usando `customFollowUp`. Solo el texto resultante se pasa a `plan answer`. ⚠️ **PROHIBIDO** guardar `"Otro"` o un índice como valor.
    *   **Pregunta recomendada de assets**: Si `optionalPendingCount > 0`, pregunta si el usuario quiere proveer assets. Si dice que no o lo omite: ejecuta `plan answer --field assets --value ""`.
    *   **Guardado de respuestas y transición**:
        *   Por cada respuesta, ejecuta:
            ```bash
            gsd-canva plan answer --id <ID_DE_TRES_DÍGITOS> --field <campo> --value "<respuesta>"
            ```
        *   Después de cada `plan answer`, revisa la respuesta. Si `requiredFieldsComplete === true`, avanza al paso de Revisión/Confirmación abajo. Si no, continúa con la siguiente pregunta pendiente.
        *   ⚠️ **PROHIBIDO** escribir directamente en `decisions.json`.
    *   **Manejo de errores en flujo interactivo**:
        | Error | Acción del agente |
        |---|---|
        | `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (21) | Decisiones modificadas post-confirmación. Ejecutar `reset-confirmation` y repetir flujo. |
        | `GSDC_INVALID_FIELD` (22) | Re-ejecutar `plan questions` para obtener campos válidos. |
        | `GSDC_DECISIONS_LOCKED` (23) | Las decisiones están confirmadas. Si el usuario quiere cambios, ejecutar `reset-confirmation`. ⚠️ PROHIBIDO editar `decisions.json` directamente. |
        | `GSDC_PLAN_NOT_FOUND` (24) | Reportar que el plan no existe. Sugerir `plan create`. |
        | `GSDC_PLAN_ARTIFACT_MISSING` (25) | Falta un archivo requerido del plan. Detener flujo. |
        | `GSDC_INVALID_STATE` (13) | Ejecutar `plan status` y explicar estado. Si el estado permite reset (`ready_for_html`/`pending_approval`), sugerir `reset-confirmation`. |
        | `GSDC_JSON_PARSE_ERROR` (15) | `decisions.json` corrupto. Detener flujo. Pedir intervención manual. |
        Nota: `questions()` no lanza `GSDC_INVALID_STATE` — retorna `readOnly: true` para estados post-confirmación. La fila de exit 13 aplica solo a `answer()`.
*   **Poblado de archivos Markdown (espejo de decisions.json)**:
    *   Actualizar como espejo de lo que ya está en `decisions.json`.
    *   ⚠️ **PROHIBIDO** editar Markdown con datos que no estén primero en `decisions.json`.
    *   Escribe preguntas faltantes en `preguntas.md`.
*   **Revisión Final y Confirmación Explícita (OBLIGATORIO antes de congelar)**:
    1. Presenta un resumen completo de todas las respuestas registradas.
    2. Destaca qué es dato confirmado vs sugerencia tentativa.
    3. Pide confirmación explícita: **"Responde 'confirmo' para continuar con estas decisiones."**
    4. ⚠️ **DETÉN la ejecución** hasta que el usuario responda.
    5. **Parsing de confirmación**: Solo la palabra `"confirmo"` (case-insensitive, trimmed, sin texto adicional) cuenta como confirmación. Si la respuesta contiene "confirmo" pero también texto adicional (ej: "confirmo, gracias"), responde: "Para confirmar, responde únicamente con la palabra 'confirmo'." — no entres en flujo de edición. Cualquier otra respuesta → pregunta si quiere hacer cambios y vuelve al flujo de `plan answer`.
    6. Solo después de recibir "confirmo":
        - Ejecuta `gsd-canva plan confirm-decisions --id <ID>`.
        - Ejecuta `gsd-canva plan resolve-questions --id <ID>`.
    7. ⚠️ **PROHIBIDO** ejecutar `confirm-decisions` o `resolve-questions` sin "confirmo" explícito.
    8. ⚠️ **PROHIBIDO** generar `mockup.html` o ejecutar transiciones de fase de forma autónoma.
*   **Corrección de decisiones ya confirmadas**:
    *   Si el usuario quiere corregir y el plan ya tiene `mockup.html` (estado `ready_for_html` o `pending_approval`), el agente **debe** advertir: ⚠️ "Esto invalidará el mockup actual. ¿Deseas continuar?"
    *   Si el usuario confirma, ejecuta `reset-confirmation`.
    *   Luego usa `plan answer` para modificar y repite confirmación.
    *   ⚠️ **PROHIBIDO** editar `decisions.json` directamente.
```

### 7. `lib/plan-manager.js` — `create()` inicializa campos nuevos

`decisions.json` generado por `create()` incluye:
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

`hashAlgorithm` se inicializa como `"sha256-decisions-v2"` en `create()`.

### 8. `lib/plan-manager.js` — Hash criptográfico con migración v1→v2

```js
function computeDecisionsHash(decisions, hashAlgorithm) {
  const normalize = (v) => String(v || '').trim().toLowerCase();
  const fields = hashAlgorithm === 'sha256-decisions-v1'
    ? ['vertical', 'audiencia', 'formato', 'paleta', 'copy', 'cta']
    : ['vertical', 'audiencia', 'formato', 'paleta', 'copy', 'cta', 'assets'];
  const payload = JSON.stringify(Object.fromEntries(fields.map(f => [f, normalize(decisions[f])])));
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

**Dispatch**: `sha256-decisions-v1` → 6 campos. Cualquier otro caso (`sha256-decisions-v2`, `""`, `undefined`) → 7 campos. El fallback es explícitamente v2.

**Migración**: `confirmDecisions()`, `resolveQuestions()`, `submitMockup()` usan `computeDecisionsHash(decisions, confirmation.hashAlgorithm)`. `confirmDecisions()` siempre escribe `hashAlgorithm: 'sha256-decisions-v2'`. `resetConfirmation()` pone `hashAlgorithm = ""` → próxima confirmación usa v2 por el fallback.

### 9. Referencias cruzadas

Verificar con `rg "mockup:pending" templates/ docs/ README.md` y actualizar referencias obsoletas.

### 10. `templates/plan-templates/preguntas.md` — Agregar campo `assets`

Agregar sección `Assets / Recursos externos` como campo opcional.

### 11. `tests/plan.test.js` — Tests unitarios

**FIELD_REGISTRY y helpers**:
- **Test FIELD_REGISTRY consistency**: cada `id` aceptado por `answer()`, `questions()` output length = registry size.
- **Test optionalAnswered migration v1.1**: fixture sin `optionalAnswered` → `plan answer --field assets --value ""` → éxito, `optionalAnswered.assets === true`.
- **Test optionalAnswered migration v1.1 questions**: fixture sin `optionalAnswered` → `plan questions` → éxito, `optionalPendingCount === 1`.
- **Test ensureV2Fields**: fixture v1.1 sin `assets` ni `optionalAnswered` → después de cualquier operación, ambos campos existen.

**questions()**:
- **Test questions vacío**: `requiredPendingCount === 6`, `optionalPendingCount === 1`, `filledCount === 0`.
- **Test questions parcial**: 2 requeridos → `requiredPendingCount === 4`.
- **Test questions completo**: 6 requeridos → `requiredFieldsComplete === true`, `optionalPendingCount === 1`.
- **Test questions assets lleno**: 7 campos → `allQuestionsAnswered === true`.
- **Test questions assets declinado**: `answer(assets, "")` → `optionalPendingCount === 0`, `allQuestionsAnswered === true`.
- **Test questions assets no-vacío**: `answer(assets, "Logo PNG")` → `optionalAnswered.assets === true`, `optionalPendingCount === 0`.
- **Test questions read-only ready_for_html**: `readOnly: true`, `filled` con todos, `pending: []`.
- **Test questions read-only approved**: `readOnly: true`, sin error.
- **Test questions plan inexistente**: exit 24.
- **Test questions decisions corrupto**: exit 15.
- **Test questions decisions faltante**: exit 25.
- **Test questions Otro en JSON**: choice fields tienen "Otro (personalizado)" con `value: ""` y `customFollowUp`.

**answer()**:
- **Test answer campo inválido**: exit 22.
- **Test answer estado incorrecto**: exit 13.
- **Test answer post-confirmación**: exit 23.
- **Test answer retorna flags**: incluye `requiredFieldsComplete` y `allQuestionsAnswered`.

**resetConfirmation()**:
- **Test reset**: `confirmed === false`, `decisionsHash === ""`, `hashAlgorithm === ""`, `optionalAnswered === {}`, `assets === ""`.
- **Test reset history**: history contiene `action: 'reset-confirmation'`.
- **Test reset no duplicate history**: re-ejecutar no duplica entry si ya existe el último con mismo `from`.
- **Test reset desbloquea answer**: funciona de nuevo.
- **Test reset limpia optional**: llenar assets, confirmar, reset → `optionalPendingCount === 1`, `assets === ""`.
- **Test reset partial recovery**: state=questions_pending + confirmed=true → `resetConfirmation()` limpia (no es no-op).
- **Test reset mockup stale recovery**: simular fallo antes de rename, re-ejecutar → mockup se renombra.
- **Test reset no-op**: questions_pending + confirmed=false + sin mockup → sin cambios.
- **Test reset approved state**: `GSDC_INVALID_STATE` con mensaje específico.

**Hash migración**:
- **Test hash v1**: fixture v1 → `resolve-questions` + `submit-mockup` pasan.
- **Test hash v2**: plan nuevo → `hashAlgorithm === "sha256-decisions-v2"`.
- **Test hash vacío fallback**: `hashAlgorithm = ""` → `confirmDecisions()` usa 7 campos.
- **Test hash incluye assets**: modificar assets post-confirm → mismatch.

**Otros**:
- **Test helper placeholder**: `"TBD"` → pending, `"Nodo"` → no pending, `"TODO"` → pending.
- **Test resolve sin confirmación**: falla.
- **Test answer no plan.json update**: timestamps no cambian.
- **Test findPlanDir migración**: `plan status --id 999` → exit 24.
- **Test CLI questions JSON**: no double-wrap.
- **Test CLI questions humano**: formato correcto con numeración y contadores.
- **Test CLI reset menciona stale**: stdout menciona stale rename cuando aplica.
- **Test lock release**: lock file no existe después de `questions()`.

### Tests de contrato CLI (`child_process`)

- Usar `process.execPath` + ruta a `bin/gsd-canva.js`.
- Capturar `planId` desde `plan create --json`.

---

## Tabla de errores

| Código | Exit Code | Descripción | Origen |
|---|---|---|---|
| `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` | `21` | Decisiones modificadas post-confirmación. Usar `reset-confirmation`. | Existente |
| `GSDC_INVALID_FIELD` | `22` | Campo no reconocido. | Nuevo |
| `GSDC_DECISIONS_LOCKED` | `23` | Modificación después de `confirm-decisions`. Usar `reset-confirmation`. | Nuevo |
| `GSDC_PLAN_NOT_FOUND` | `24` | Directorio del plan no existe. | Nuevo (migra de exit 15) |
| `GSDC_PLAN_ARTIFACT_MISSING` | `25` | Archivo requerido falta dentro del plan. Distinto de `GSDC_ARTIFACT_MISSING` (20). | Nuevo |

---

## Verificación

1. `npm test` — todos pasan.
2. `plan questions --json` → `requiredPendingCount: 6`, `optionalPendingCount: 1`.
3. `plan answer --field vertical --value "SaaS / Producto Digital" --json` → `requiredPendingCount: 5`, `requiredFieldsComplete: false`.
4. Llenar 6 requeridos → `requiredFieldsComplete: true`.
5. `confirm-decisions` → `hashAlgorithm: "sha256-decisions-v2"`.
6. `plan answer` post-confirmar → `GSDC_DECISIONS_LOCKED` (exit 23).
7. `reset-confirmation` → desbloquea, `optionalAnswered === {}`, `assets === ""`.
8. `plan questions` en `ready_for_html` → `readOnly: true`, sin error.
9. `plan questions` en `approved` → `readOnly: true`, sin error.
10. `reset-confirmation` desde `approved` → `GSDC_INVALID_STATE` con mensaje.
11. Confirmar + resolver → reset → `questions_pending`, mockup stale.
12. `canva-mockup.md` sección 2 sin escritura directa.
13. Modificar `assets` post-confirmar → hash mismatch.
14. Fixture v1.1 → `resolve-questions` + `submit-mockup` pasan con hash v1.
15. No double-wrap: `parsed.data.data` no existe.
16. `plan status --id 999` → exit 24.
17. Assets declinado → `optionalPendingCount === 0`.
18. Reset post-decline → `optionalPendingCount === 1`, `assets === ""`.
19. Choice fields en JSON incluyen "Otro (personalizado)" con `customFollowUp`.
20. `"Nodo"` → no placeholder. `"TODO"` → placeholder.
21. Fixture v1.1 sin `optionalAnswered` → `plan answer --field assets --value ""` → éxito.
22. Pre-implementation grep: `rg "exit.*15|GSDC_JSON_PARSE_ERROR" templates/ bin/ tests/ docs/` → audit completado.

---

## Notas

- `FIELD_REGISTRY` es única fuente de verdad — `questions()`, `answer()`, `getEmptyFields()` derivan de ella.
- `ensureV2Fields()` normaliza planes v1.1 — agrega `optionalAnswered: {}` y `assets: ""` si faltan. Previene TypeError en planes migrados.
- `optionalAnswered` se set para **toda** respuesta a campo opcional (vacío o no). Nombre preciso: "este campo opcional fue respondido".
- `resetConfirmation()` limpia `optionalAnswered = {}` **y** valores opcionales a `""` — permite re-preguntar todo.
- `resetConfirmation()` escribe `decisions.json` antes de `plan.json` — si falla entre ambos, el estado refleja un estado post-confirmation (diagnósable) en vez de `questions_pending` + `confirmed=true` (confuso).
- `resetConfirmation()` idempotency: verifica `state === questions_pending AND confirmed !== true AND !mockupExists`. Cualquier otra combinación procede con cleanup.
- History entries se deduplican en recovery — no hay duplicados en auditoría.
- `questions()` retorna read-only para **todos** los estados post-`questions_pending` — incluyendo `approved`.
- `resetConfirmation()` rechaza `approved` y posterior — out of scope, se sugiere crear plan nuevo.
- `hashAlgorithm = ""` tras reset → fallback a v2 en próxima confirmación.
- `computeDecisionsHash` fallback: cualquier valor que no sea exactamente `'sha256-decisions-v1'` → v2 (7 campos).
- `submitMockup()` usa mismo dispatch v1/v2.
- Placeholder detection usa `===` — "Nodo" no es placeholder.
- "Otro (personalizado)" viene del JSON — agents no lo hardcodean.
- Confirmación usa trigger `"confirmo"` exacto. Si contiene texto adicional: pedir "responde únicamente 'confirmo'", no entrar en flujo de edición.
- `answer()` retorna `requiredFieldsComplete` y `allQuestionsAnswered`.
- Template incluye instrucciones para: transición via `requiredFieldsComplete`, manejo de `readOnly: true`, respuestas multi-campo, fuzzy matching en choices.
- Error table aclara que `questions()` no lanza exit 13 — retorna `readOnly: true`.
- Breaking changes documentados con pre-implementation grep step.
- `create()` usa `sha256-decisions-v2` — nuevos planes nacen con v2.
- `answer()` no actualiza `plan.json` por diseño.
- Context extraction: tabla de ejemplos + fallback "ante duda, no guardes".
