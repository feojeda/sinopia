# Plan: Preguntas Interactivas en `/canva-mockup` (Rev. 9)

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

**`findPlanDir()` exit code migration**: Actualmente `findPlanDir()` lanza `GSDC_JSON_PARSE_ERROR` (exit 15) cuando un plan no existe. Esta proposal lo migra a `GSDC_PLAN_NOT_FOUND` (exit 24). Esto cambia el exit code para **todos** los comandos existentes cuando el plan ID no existe: `plan status`, `confirm-decisions`, `resolve-questions`, `submit-mockup`, `approve-mockup`, etc. Verificar que ningún template ni script externo dependa de exit 15 para el caso "plan no encontrado".

**`hashAlgorithm` upgrade**: Nuevas confirmaciones usan `sha256-decisions-v2` (7 campos). Planes existentes con `sha256-decisions-v1` son soportados en read-only — la primera re-confirmación migra automáticamente.

---

## Cambios

### 1. `lib/plan-manager.js` — `FIELD_REGISTRY` y helpers compartidos

**`FIELD_REGISTRY`**: Constante a nivel módulo que define los 7 campos como única fuente de verdad. Todas las funciones (`questions()`, `answer()`, `getEmptyFields()`) derivan sus listas de este registry:

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
const CHOICE_FIELDS = FIELD_REGISTRY.filter(f => f.type === 'choice');
```

Campos tipo `choice` siempre incluyen `allowCustom: true` en la salida de `questions()` — el agente lo detecta y agrega la opción "Otro (personalizado)" al renderizar (ver sección 2 abajo para detalles).

**`findPlanDirOrThrow(planId, cwd)`**: Extraer la lógica de `findPlanDir()` a un helper dedicado que lanza `GSDC_PLAN_NOT_FOUND` (exit 24) cuando el directorio del plan no existe. Las funciones nuevas y existentes usan este helper. Migrar `findPlanDir()` actual para usar el mismo helper.

**`readJsonOrThrow(filePath)`**: Helper para parsing de JSON. Si el archivo no existe → `GSDC_PLAN_ARTIFACT_MISSING` (exit 25). Si JSON es corrupto → `GSDC_JSON_PARSE_ERROR` (exit 15). Usar en todas las funciones que leen artefactos requeridos dentro de un plan existente. **No aplica** a `list()`, que es tolerante a planes individuales corruptos y los omite silenciosamente.

**Distinción de errores**: `GSDC_PLAN_NOT_FOUND` (24) = directorio del plan no existe. `GSDC_PLAN_ARTIFACT_MISSING` (25) = archivo requerido falta dentro de un plan existente. `GSDC_ARTIFACT_MISSING` (20) = se mantiene para `submitMockup()` cuando `mockup.html` falta — nombres distintos, sin colisión.

**`getEmptyFields(decisions, fieldList, optionalAnswered)`**: Helper compartido para detección de campos vacíos/placeholders:

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

Nota: Placeholder detection usa `===` (exact match), no `includes()`. "Nodo" no se confunde con "TODO". Esto corrige un bug preexistente en `confirmDecisions()` y `resolveQuestions()`.

`confirmDecisions()` reutiliza este helper en vez de su lógica inline. `resolveQuestions()` (línea 275) también tiene validación duplicada y debe usar el mismo helper. `questions()` lo usa para determinar `filled` vs `pending`.

**Semántica de contadores**:
- `requiredFieldsComplete`: `true` cuando `requiredPendingCount === 0`. Significa "los 6 campos requeridos tienen valor — el agente debe presentar el resumen y pedir confirmación explícita". NO es permiso para auto-confirmar ni garantiza que `resolve-questions` vaya a pasar (requiere además `confirmed === true` + hash vigente).
- `allQuestionsAnswered`: `true` cuando `requiredPendingCount === 0 && optionalPendingCount === 0`. Todas las preguntas fueron respondidas o explícitamente declinadas.
- El agente puede avanzar al paso de confirmación cuando `requiredFieldsComplete === true`, sin importar `optionalPendingCount`.

**`optionalAnswered` en `decisions.json`**: Campo nuevo — objeto `optionalAnswered: {}` que rastrea qué campos opcionales fueron explícitamente respondidos o declinados. Cuando el usuario responde `assets` (con valor o declinando), se set `optionalAnswered.assets = true`. `getEmptyFields()` excluye campos con `optionalAnswered[field] === true` de la lista de pendientes.

### 2. `lib/plan-manager.js` — Agregar función `questions(planId)`

Leer `decisions.json` del plan, filtrar campos vacíos/placeholders usando el helper compartido, y retornar datos crudos (sin wrapper `{ok, data}` — el CLI se encarga del wrapper via `handleSuccess()`):

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

**"Otro (personalizado)" en el JSON**: La opción siempre es la última entrada en `options` para campos `choice` con `allowCustom: true`. Tiene `value: ""` (sentinel vacío) y `customFollowUp` con el prompt de seguimiento. El agente no debe hardcodear esta opción — viene del JSON. Si el usuario selecciona esta opción, el agente hace la pregunta de `customFollowUp` y pasa el texto resultante a `plan answer`.

**Regla de valores**: `value` siempre contiene el texto final que se escribe tal cual en `decisions.json`. No hay códigos internos. Lo que el usuario selecciona o escribe es lo que se guarda.

**Comportamiento ante estados**:
- Plan no existe → `GSDC_PLAN_NOT_FOUND` (exit 24)
- `decisions.json` corrupto → `GSDC_JSON_PARSE_ERROR` (exit 15)
- `decisions.json` faltante → `GSDC_PLAN_ARTIFACT_MISSING` (exit 25)
- Plan en `mockup:questions_pending` → retorna preguntas con campos pendientes/filled (flujo normal)
- Plan en `mockup:ready_for_html` o `mockup:pending_approval` → retorna snapshot read-only con `readOnly: true`, todos los campos en `filled`, `pending: []`, sin contadores pendientes. El agente puede inspeccionar decisiones pero no modificarlas. Si el usuario quiere editar, usar `reset-confirmation` primero.
- Estado no reconocido → `GSDC_INVALID_STATE` (exit 13).

**Lock**: `questions()` adquiere el lock global **antes** de leer `plan.json` y `decisions.json`, y lo libera en `finally`. Garantiza snapshot consistente.

### 3. `lib/plan-manager.js` — Agregar función `answer(planId, field, value)`

Escribe una respuesta individual en `decisions.json` con validación:

```bash
gsd-canva plan answer --id 001 --field vertical --value "SaaS / Producto Digital"
gsd-canva plan answer --id 001 --field assets --value ""
```

Comportamiento:
- Valida que el `field` sea uno de los campos en `ALL_FIELDS` (derivado de `FIELD_REGISTRY`)
- **Orden de operaciones**: acquire lock → leer `decisions.json` → validar estado `mockup:questions_pending` → validar `confirmation.confirmed !== true` → escribir atómicamente → release lock en `finally`
- Las validaciones ocurren **dentro** del lock para evitar race conditions
- No valida placeholders ni completitud — eso lo hace `confirm-decisions`
- No actualiza `plan.json` timestamps ni history por diseño — el audit trail está en `decisions.json` field values, y cada answer genera tráfico innecesario en `plan.json`
- **Campos opcionales con valor vacío**: Si `field` es un campo opcional y `value` es `""`, marca `optionalAnswered[field] = true` sin cambiar el valor. Representa "el usuario fue preguntado y declinó".
- Retorna los mismos contadores y flags que `questions()` como datos crudos:

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

### 4. `lib/plan-manager.js` — Agregar función `resetConfirmation(planId)`

Comando explícito para desbloquear decisiones confirmadas:

```bash
gsd-canva plan reset-confirmation --id <ID>
```

Comportamiento:
- Valida que el plan exista
- Acepta estados `mockup:questions_pending`, `mockup:ready_for_html` o `mockup:pending_approval`
- **Idempotencia (condición explícita)**: `if (state === 'questions_pending' && confirmation.confirmed !== true && mockup.html no existe) → no-op, retorna éxito`. En cualquier otro caso, procede con los pasos de cleanup. Esto cubre recuperación de fallos parciales donde el estado ya fue revertido pero quedan artefactos pendientes.
- Si el estado es `ready_for_html` o `pending_approval`, revierte a `mockup:questions_pending`
- Si existe `mockup.html`, lo renombra a `mockup.html.stale.<timestamp>`
- Pone `confirmation.confirmed = false`, `confirmation.confirmedAt = null`, `confirmation.decisionsHash = ""`, `confirmation.hashAlgorithm = ""`
- Limpia `optionalAnswered = {}` — al resetear para re-editar, todas las preguntas opcionales deben volverse a preguntar
- **Orden de operaciones** (prioriza seguridad de estado):
  1. Acquire lock
  2. Leer archivos (`plan.json`, `decisions.json`)
  3. Validar estado
  4. Escribir `plan.json`: estado `mockup:questions_pending` + push history entry `{ action: 'reset-confirmation', from: previousState, to: 'questions_pending', timestamp }`
  5. Escribir `decisions.json`: `confirmed = false`, `confirmedAt = null`, `decisionsHash = ""`, `hashAlgorithm = ""`, `optionalAnswered = {}`
  6. Renombrar `mockup.html` a `.stale` si existe
  7. Release lock en `finally`
- **Recuperación de fallos parciales**: Si falla después de paso 4, el plan ya está en `questions_pending` — seguro. Re-ejecutar procede desde paso 5 porque la condición de idempotencia verifica `confirmed` y `mockup.html`, no solo `state`. Si paso 5 falla pero paso 4 no, re-ejecutar ve `state === questions_pending` + `confirmed === true` → procede con cleanup. Si paso 6 falla, re-ejecutar ve `mockup.html` existe → procede con rename.
- Retorna confirmación del reset + nuevo estado

Errores:
- Plan no existe → `GSDC_PLAN_NOT_FOUND` (exit 24)
- Estado incorrecto → `GSDC_INVALID_STATE` (exit 13)

### 5. `bin/gsd-canva.js` — Agregar subcomandos

```
gsd-canva plan questions --id <ID> [--json]
gsd-canva plan answer --id <ID> --field <campo> --value <valor> [--json]
gsd-canva plan reset-confirmation --id <ID> [--json]
```

En modo `--json`: `handleSuccess()` envuelve el resultado del manager en `{ ok: true, data: <resultado> }`. Las funciones del manager retornan datos crudos.
En modo humano:
- `plan questions`: imprime preguntas requeridas primero, numeradas con opciones numeradas, assets al final marcado como "(opcional)", y contadores al final: `Requeridos: 3/6 · Opcionales: 0/1`.
- `plan answer`: imprime confirmación de respuesta guardada + contadores restantes + `requiredFieldsComplete` flag.
- `plan reset-confirmation`: imprime confirmación de desbloqueo + nuevo estado.

### 6. `templates/commands/canva-mockup.md` — Reemplazar SECCIÓN 2 COMPLETA

**IMPORTANTE**: No reemplazar solo el roadblock. Reemplazar **toda la sección 2** (desde `### 2.` hasta el final de esa sección) para eliminar todas las instrucciones de escritura directa en `decisions.json`.

**NOTA sobre sección 3**: La sección 3 vigente ("Propuesta Visual / Wireframing") ordena crear `mockup.html` y ejecutar `submit-mockup`. Esto NO es contradictorio — esa sección se ejecuta **después** de que `resolve-questions` transicione el plan a `ready_for_html`. La prohibición en la sección 2 es "no generar mockup.html durante el yield gate". No requiere cambios en la sección 3.

Texto completo que reemplaza **toda la sección 2** del template actual:

```markdown
### 2. Levantamiento de Requisitos, Investigación y Confirmación (YIELD GATE OBLIGATORIO)
*   **Análisis del Contexto del Usuario**:
    *   Analiza la instrucción inicial del usuario cuidadosamente y clasifica el nivel de contexto recibido:
        *   **Contexto Requerido Completo**: El usuario proveyó vertical, audiencia, formato, paleta, copy y CTA (los 6 campos requeridos) → Guarda esos campos inmediatamente usando `gsd-canva plan answer`. `assets` es opcional y no afecta esta clasificación.
        *   **Contexto Parcial**: El usuario proveyó algunos datos pero no todos → Guarda **solo los campos explícitamente provistos** usando `gsd-canva plan answer`. ⚠️ **PROHIBIDO** inferir campos del contexto.
        *   **Sin Contexto**: El usuario solo proveyó un nombre genérico (ej: `test2`) → No guardes nada, pasa directo a preguntas.
    *   **Tabla de ejemplos de extracción**:
        | Input del usuario | Campos a guardar | Razón |
        |---|---|---|
        | `"quiero un banner azul para mi restaurante"` | `paleta: "azul"` | Solo "azul" es explícitamente provisto como color. "banner" es ambiguo (¿formato?), "restaurante" es inferido como vertical. |
        | `"Instagram post para promocionar mi curso de cocina, CTA: Inscríbete Ya"` | `formato: "Instagram Post (1080x1080)"`, `cta: "Inscríbete Ya"` | Formato explícito + CTA explícito. "curso de cocina" es descripción pero no mapea a un campo directamente sin interpretación. |
        | `"landing page moderna, colores oscuros"` | `paleta: "colores oscuros"` | Solo la paleta es explícita. "landing page" y "moderna" son ambigüos. |
    *   💡 **REGLA DE SUGERENCIAS**: Puedes diseñar y proponer opciones estéticas o creativas sugeridas al usuario en el chat, marcándolas **explícitamente como propuestas tentativas no confirmadas**. Sin embargo, está **PROHIBIDO** registrarlas en `decisions.json` o darlas por definitivas en `requerimientos.md` o `investigacion.md` sin el consentimiento explícito del usuario.
*   **Preguntas Interactivas Obligatorias**:
    *   Ejecuta el comando para obtener las preguntas estructuradas:
        ```bash
        gsd-canva plan questions --id <ID_DE_TRES_DÍGITOS> --json
        ```
    *   **Renderizado de preguntas (first-class: chat numerado)**:
        *   Presenta cada pregunta pendiente al usuario de forma clara y numerada. Las preguntas de campos requeridos (`required: true`) se presentan primero. Si `optionalPendingCount > 0` después de responder los requeridos, se presenta la pregunta de assets como pregunta adicional no bloqueante.
        *   Para campos tipo `choice`: muestra las opciones numeradas **exactamente como vienen en el JSON**, incluyendo la opción "Otro (personalizado)" que es la última entrada con `value: ""`.
        *   Para campos tipo `text`: muestra el placeholder como guía.
        *   Espera la respuesta del usuario antes de pasar a la siguiente pregunta.
        *   **Mapeo de entrada numérica**: Si el usuario responde con un número (ej: "1"), el agente debe mapearlo al `value` de la opción correspondiente. El `--value` pasado a `plan answer` siempre debe ser el texto final del valor, nunca el índice numérico.
        *   **Opción "Otro (personalizado)"**: Si el usuario selecciona la opción "Otro (personalizado)" (la que tiene `value: ""` y `customFollowUp`), el agente **debe** hacer la pregunta de seguimiento usando el texto de `customFollowUp`. Solo el texto que el usuario proporcione se pasa a `plan answer --value`. ⚠️ **PROHIBIDO** guardar `"Otro"`, `"Otro (personalizado)"` o el índice numérico como valor.
    *   **Si tu entorno ofrece UI interactiva nativa** (herramientas de questions, choices, formularios):
        *   Puedes usarla como alternativa al chat numerado para mejorar la experiencia.
        *   Pero el flujo y las preguntas deben venir del JSON de `plan questions`, no improvisadas.
    *   **Pregunta recomendada de assets**: Si `optionalPendingCount > 0`, pregunta si el usuario quiere proveer assets. Es **recomendada** pero **no bloqueante**. Si el usuario dice que no o lo omite:
        *   Ejecuta `plan answer --field assets --value ""` para marcar como declinado (`optionalAnswered.assets = true`).
        *   `optionalPendingCount` baja a 0, `allQuestionsAnswered` sube a `true`.
    *   **Guardado de respuestas**:
        *   Por cada respuesta del usuario, ejecuta:
            ```bash
            gsd-canva plan answer --id <ID_DE_TRES_DÍGITOS> --field <campo> --value "<respuesta>"
            ```
        *   ⚠️ **PROHIBIDO** escribir directamente en `decisions.json` sin usar el comando `plan answer`.
        *   ⚠️ **PROHIBIDO** registrar respuestas tentativas o sugeridas sin confirmación del usuario.
    *   **Manejo de errores en flujo interactivo**:
        | Error | Acción del agente |
        |---|---|
        | `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (21) | Las decisiones fueron modificadas después de la confirmación. Ejecutar `reset-confirmation` y repetir el flujo. |
        | `GSDC_INVALID_FIELD` (22) | Re-ejecutar `plan questions` para obtener la lista de campos válidos. |
        | `GSDC_DECISIONS_LOCKED` (23) | Preguntar al usuario si desea ejecutar `reset-confirmation`. ⚠️ PROHIBIDO editar `decisions.json` directamente. |
        | `GSDC_PLAN_NOT_FOUND` (24) | Reportar que el plan no existe. Sugerir `plan create` para crear uno nuevo. |
        | `GSDC_PLAN_ARTIFACT_MISSING` (25) | Detener el flujo y reportar que falta un archivo requerido del plan. |
        | `GSDC_INVALID_STATE` (13) | Ejecutar `plan status --id <ID> --json` y explicar al usuario el estado actual. Si el estado es `ready_for_html` o `pending_approval`, sugerir `reset-confirmation` para re-editar. |
        | `GSDC_JSON_PARSE_ERROR` (15) | Detener el flujo y reportar que `decisions.json` está corrupto. Pedir intervención manual. |
*   **Poblado de archivos Markdown (espejo de decisions.json)**:
    *   Los archivos Markdown (`requerimientos.md`, `investigacion.md`) se actualizan como espejo de lo que ya está en `decisions.json`.
    *   Los campos desconocidos en los Markdown se dejan con los placeholders originales del template.
    *   ⚠️ **PROHIBIDO** editar `requerimientos.md` o `investigacion.md` con datos que no estén primero en `decisions.json`.
    *   Escribe las preguntas faltantes en la sección `Pendientes` de `preguntas.md`.
*   **Revisión Final y Confirmación Explícita (OBLIGATORIO antes de congelar)**:
    1. Presenta un resumen completo de todas las respuestas registradas.
    2. Destaca qué es dato confirmado vs qué es sugerencia tentativa (si hubo alguna).
    3. Pide confirmación explícita al usuario con una instrucción clara: **"Responde 'confirmo' para continuar con estas decisiones."**
    4. ⚠️ **DETÉN la ejecución** hasta que el usuario responda.
    5. **Parsing de confirmación**: Solo la palabra exacta `"confirmo"` (case-insensitive, trimmed, sin texto adicional) cuenta como confirmación. Cualquier otra respuesta — incluyendo "sí", "dale", "ok", "sí, pero cambia X" — NO es confirmación. Si la respuesta no es "confirmo", pregunta si quiere hacer cambios y vuelve al flujo de `plan answer`.
    6. Solo después de recibir "confirmo":
        - Ejecuta `gsd-canva plan confirm-decisions --id <ID_DE_TRES_DÍGITOS>`.
        - Ejecuta `gsd-canva plan resolve-questions --id <ID_DE_TRES_DÍGITOS>`.
    7. ⚠️ **PROHIBIDO** ejecutar `confirm-decisions` o `resolve-questions` sin confirmación explícita.
    8. ⚠️ **PROHIBIDO** generar `mockup.html` o ejecutar comandos de transición de fase de forma autónoma.
*   **Corrección de decisiones ya confirmadas**:
    *   Si el usuario quiere corregir después de confirmar y el plan ya tiene `mockup.html` (estado `ready_for_html` o `pending_approval`), el agente **debe** advertir: ⚠️ "Esto invalidará el mockup actual. ¿Deseas continuar?"
    *   Si el usuario confirma, ejecuta:
        ```bash
        gsd-canva plan reset-confirmation --id <ID_DE_TRES_DÍGITOS>
        ```
    *   Luego usa `plan answer` para modificar campos y repite la confirmación.
    *   ⚠️ **PROHIBIDO** editar `decisions.json` directamente para resetear la confirmación.
```

### 7. `lib/plan-manager.js` — `create()` inicializa campos nuevos

`decisions.json` generado por `create()` debe incluir:
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

Actualizar `hashAlgorithm` de `sha256-decisions-v1` a `sha256-decisions-v2` en `create()`. Nuevos planes nacen con v2 — no hay razón para usar el algoritmo legacy.

### 8. `lib/plan-manager.js` — Hash criptográfico con migración v1→v2

`confirmDecisions()`, `resolveQuestions()` y `submitMockup()` calculan el hash sobre los campos editables. `assets` se agrega al payload para v2:

```js
function computeDecisionsHash(decisions, version) {
  const normalize = (v) => String(v || '').trim().toLowerCase();
  const fields = version === 'v1'
    ? ['vertical', 'audiencia', 'formato', 'paleta', 'copy', 'cta']
    : ['vertical', 'audiencia', 'formato', 'paleta', 'copy', 'cta', 'assets'];
  const payload = JSON.stringify(Object.fromEntries(fields.map(f => [f, normalize(decisions[f])])));
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

**Migración**: Las 3 funciones soportan ambos algoritmos:
1. Si `confirmation.hashAlgorithm === 'sha256-decisions-v1'` → calcular hash con 6 campos originales (sin `assets`).
2. Si es `sha256-decisions-v2` (o undefined en planes nuevos) → calcular hash con 7 campos incluyendo `assets`.
3. `confirmDecisions()` siempre escribe `hashAlgorithm: 'sha256-decisions-v2'` al confirmar — migra automáticamente cada plan la primera vez.
4. `resetConfirmation()` limpia `hashAlgorithm` junto con `decisionsHash`.
5. `submitMockup()` necesita el mismo dispatch v1/v2 — explícitamente: leer `hashAlgorithm` de `confirmation`, seleccionar fields accordingly, comparar hash.

### 9. Referencias cruzadas — Verificar y actualizar archivos colaterales

Verificar con `rg "mockup:pending" templates/ docs/ README.md` y actualizar referencias obsoletas:
- `templates/plan-templates/roadmap_progreso.md`: reemplazar `mockup:pending` por `mockup:questions_pending` si aparece
- `README.md`: verificar que las descripciones de estado sean consistentes con la máquina de estados actual
- `docs/implementation_plans/*`: declarar como históricos — no actualizar excepto si contienen instrucciones operativas activas

### 10. `templates/plan-templates/preguntas.md` — Agregar campo `assets`

Si el template de `preguntas.md` solo refleja los 6 campos originales, agregar sección para `Assets / Recursos externos` como campo opcional, consistente con el séptimo campo de `decisions.json`.

### 11. `tests/plan.test.js` — Tests unitarios

- **Test FIELD_REGISTRY consistency**: Iterar `FIELD_REGISTRY`, verificar que cada `id` es aceptado por `answer()`, y que `questions()` output length matches registry size.
- **Test questions vacío**: plan nuevo → `requiredPendingCount === 6`, `optionalPendingCount === 1`, `filledCount === 0`, primer campo tiene `id === "vertical"`.
- **Test questions parcial**: llenar 2 campos requeridos con `plan answer` → `requiredPendingCount === 4`, campos llenos aparecen en `filled`.
- **Test questions completo**: llenar los 6 campos requeridos → `requiredPendingCount === 0`, `optionalPendingCount === 1` (solo `assets` queda), `requiredFieldsComplete === true`.
- **Test questions con assets lleno**: llenar los 7 campos → `requiredPendingCount === 0`, `optionalPendingCount === 0`, `allQuestionsAnswered === true`.
- **Test questions con assets declinado**: `plan answer --field assets --value ""` → `optionalPendingCount === 0`, `allQuestionsAnswered === true`, assets aparece en `filled`.
- **Test questions read-only ready_for_html**: plan en `ready_for_html` → retorna `readOnly: true`, `filled` con todos los campos, `pending: []`.
- **Test questions read-only pending_approval**: plan en `pending_approval` → retorna `readOnly: true`.
- **Test questions plan inexistente**: `--id 999` → error `GSDC_PLAN_NOT_FOUND` (exit 24).
- **Test questions decisions corrupto**: JSON inválido → error `GSDC_JSON_PARSE_ERROR` (exit 15).
- **Test questions decisions faltante**: carpeta existe sin `decisions.json` → error `GSDC_PLAN_ARTIFACT_MISSING` (exit 25).
- **Test answer campo inválido**: `--field noexiste` → error `GSDC_INVALID_FIELD` (exit 22).
- **Test answer estado incorrecto**: plan en `mockup:ready_for_html` → error `GSDC_INVALID_STATE` (exit 13).
- **Test answer post-confirmación**: `confirm-decisions` + `plan answer` → error `GSDC_DECISIONS_LOCKED` (exit 23).
- **Test answer retorna flags**: `plan answer` retorno incluye `requiredFieldsComplete` y `allQuestionsAnswered`.
- **Test reset-confirmation**: confirmar, reset → `confirmed === false`, `decisionsHash === ""`, `hashAlgorithm === ""`, `optionalAnswered === {}`.
- **Test reset-confirmation history**: reset → `plan.json` history contiene entry con `action: 'reset-confirmation'`.
- **Test reset-confirmation desbloquea answer**: reset → `plan answer` funciona.
- **Test reset-confirmation desde ready_for_html**: confirmar + resolver, crear mockup falso, reset → `questions_pending`, mockup stale, answer funciona.
- **Test reset-confirmation desde pending_approval**: estado `pending_approval` + mockup, reset → `questions_pending`, mockup stale.
- **Test reset-confirmation partial recovery**: Confirmar plan, setear estado a `questions_pending` manualmente dejando `confirmed === true`, ejecutar `resetConfirmation()` → limpia confirmation (no es no-op porque `confirmed === true`).
- **Test reset-confirmation mockup stale recovery**: Simular fallo después de paso 4 (plan.json escrito) pero antes de paso 6 (mockup rename). Re-ejecutar `resetConfirmation()` → mockup se renombra.
- **Test reset-confirmation limpia optionalAnswered**: Llenar todo, declinar assets, confirmar, reset → `optionalPendingCount === 1` en `questions()`.
- **Test reset-confirmation no-op**: plan en `questions_pending`, `confirmed === false`, sin mockup → retorna éxito sin cambios.
- **Test mockup stale bloquea submit**: resetear, confirmar + resolver de nuevo, `submit-mockup` → falla porque `mockup.html` no existe.
- **Test helper compartido**: llenar campo con `"TBD"` → `questions()` lo reporta como pending, `confirmDecisions` falla. Llenar con `"Nodo"` → NO se reporta como pending (exact match).
- **Test hash incluye assets**: modificar `assets` después de confirmar → `resolve-questions` falla con hash mismatch.
- **Test hash migración v1**: fixture con `hashAlgorithm: "sha256-decisions-v1"` y 6-field hash → `resolve-questions` pasa, `submit-mockup` pasa.
- **Test hash migración v2**: plan nuevo confirmado → `hashAlgorithm === "sha256-decisions-v2"`.
- **Test resolve-questions sin confirmación**: 6 requeridos, `resolve-questions` sin `confirm-decisions` → falla.
- **Test answer no plan.json update**: `answer()` no modifica `plan.json` timestamps.
- **Test findPlanDir migración**: `plan status --id 999` → exit 24, no exit 15.
- **Test Otro en JSON**: `questions()` para campo choice tiene última opción con `value: ""` y `customFollowUp`.
- **Test placeholder exact match**: `"Nodo"` no es placeholder, `"TODO"` sí, `"TBD"` sí.

### Tests de contrato CLI (`child_process`)

- Usar `process.execPath` con ruta absoluta a `bin/gsd-canva.js`, no `gsd-canva` global.
- Cada test captura `planId` desde `plan create --json`.
- **Test CLI questions JSON**: `plan questions --json` → `parsed.ok === true`, `parsed.data.requiredPendingCount === 6`, no hay `parsed.data.data`.
- **Test CLI questions humano**: `plan questions` (sin `--json`) → stdout incluye `1.`, `vertical`, opción numerada, marcador assets opcional, contadores.
- **Test CLI questions Otro**: output JSON para campo choice incluye entrada "Otro (personalizado)" con `value: ""`.
- **Test CLI answer flags**: `plan answer --json` retorno tiene `requiredFieldsComplete`.
- **Test CLI lock release**: `questions()` completa → lock file no existe después.

---

## Tabla de errores

| Código | Exit Code | Descripción | Origen |
|---|---|---|---|
| `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` | `21` | Decisiones modificadas después de confirmación. Usar `reset-confirmation`. | Existente |
| `GSDC_INVALID_FIELD` | `22` | Campo no reconocido en `decisions.json`. | Nuevo |
| `GSDC_DECISIONS_LOCKED` | `23` | No se puede modificar después de `confirm-decisions`. Usar `reset-confirmation`. | Nuevo |
| `GSDC_PLAN_NOT_FOUND` | `24` | Directorio del plan no existe. | Nuevo (migra `findPlanDir()` de exit 15) |
| `GSDC_PLAN_ARTIFACT_MISSING` | `25` | Archivo requerido falta dentro del plan (ej: `decisions.json`). Distinto de `GSDC_ARTIFACT_MISSING` (20) usado por `submitMockup`. | Nuevo |

---

## Verificación

1. `npm test` — todos los tests pasan (existentes + nuevos).
2. `gsd-canva plan questions --id $planId --json` → `requiredPendingCount: 6`, `optionalPendingCount: 1`.
3. `gsd-canva plan answer --id $planId --field vertical --value "SaaS / Producto Digital" --json` → `requiredPendingCount: 5`, `requiredFieldsComplete: false`.
4. Llenar 6 requeridos → `requiredPendingCount === 0`, `requiredFieldsComplete === true`.
5. `confirm-decisions` → `hashAlgorithm === "sha256-decisions-v2"`.
6. `plan answer` después de confirmar → `GSDC_DECISIONS_LOCKED` (exit 23).
7. `reset-confirmation` → desbloquea, `plan answer` funciona.
8. `plan questions` en `ready_for_html` → `readOnly: true`, no error.
9. Confirmar + resolver → `reset-confirmation` → `questions_pending`, mockup stale.
10. `canva-mockup.md` sección 2 sin escritura directa en `decisions.json`.
11. Modificar `assets` después de confirmar → `resolve-questions` falla.
12. Plan v1.1 fixture → `resolve-questions` + `submit-mockup` pasan con hash v1.
13. `plan questions --json` no tiene double-wrap: `parsed.data.data` no existe.
14. `plan status --id 999` → exit 24, no exit 15.
15. Assets declinado → `optionalPendingCount === 0`, `allQuestionsAnswered === true`.
16. Reset después de decline → `optionalPendingCount === 1` (se re-pregunta).
17. `plan questions` JSON para campo choice incluye "Otro (personalizado)" con `value: ""` y `customFollowUp`.
18. Llenar campo con `"Nodo"` → no es placeholder. `"TODO"` → sí es placeholder.

---

## Notas

- Los `value` en el JSON son siempre texto final legible. No hay códigos internos.
- `assets` es opcional: no bloquea el Yield Gate. `requiredFieldsComplete` es `true` cuando los 6 requeridos están llenos.
- `FIELD_REGISTRY` es la única fuente de verdad para definiciones de campos — `questions()`, `answer()` y `getEmptyFields()` derivan de ella.
- `plan answer` escribe atómicamente y valida campo + estado + confirmación — el agente nunca toca `decisions.json` directamente.
- `answer()` no actualiza `plan.json` por diseño — el audit trail está en `decisions.json`.
- `create()` inicializa `assets: ""`, `optionalAnswered: {}`, `hashAlgorithm: "sha256-decisions-v2"`.
- `plan questions` en estados `ready_for_html`/`pending_approval` retorna read-only snapshot — el agente puede inspeccionar sin modificar. Para editar, usar `reset-confirmation`.
- `reset-confirmation` limpia `optionalAnswered` — todas las preguntas opcionales se re-preguntan.
- `reset-confirmation` agrega history entry — auditabilidad completa.
- `reset-confirmation` advierte al usuario si existe `mockup.html` que será invalidado.
- `reset-confirmation` idempotency: verifica `state === questions_pending AND confirmed !== true AND mockup no existe` → no-op. Cualquier otra combinación procede con cleanup.
- Hash migración: v1 (6 campos) para planes existentes, v2 (7 campos) para nuevos. `confirmDecisions()` migra automáticamente.
- `submitMockup()` usa mismo dispatch v1/v2.
- Placeholder detection usa exact match (`===`), no `includes()` — "Nodo" no se confunde con "TODO".
- "Otro (personalizado)" viene del JSON con `value: ""` y `customFollowUp` — el agente no lo hardcodea.
- Confirmación usa trigger exacto `"confirmo"` (case-insensitive, trimmed) — elimina ambigüedad entre agentes.
- `answer()` retorna `requiredFieldsComplete` y `allQuestionsAnswered` — el agente no necesita re-llamar `questions()`.
- `GSDC_PLAN_ARTIFACT_MISSING` (25) es distinto de `GSDC_ARTIFACT_MISSING` (20) — sin colisión de nombres.
- Error table incluye `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (21) con recovery via `reset-confirmation`.
- Manager retorna raw data — CLI envuelve via `handleSuccess()`. No double-wrap.
- `phase` y `status` como campos separados en `questions()` — consistente con `plan status`.
- Context extraction: tabla de ejemplos define qué guardar y qué no. Solo campos explícitamente provistos.
- Tests de lock: verificar release, no concurrencia real — lock manager garantiza serialización.
- Breaking change: `findPlanDir()` migra de exit 15 a exit 24 — documentado en sección propia.
