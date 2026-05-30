# Plan: Preguntas Interactivas en `/canva-mockup` (Rev. 8)

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

## Cambios

### 1. `lib/plan-manager.js` — Helper compartido `findPlanDirOrThrow()`, `readJsonOrThrow()` y `getEmptyFields()`

**`findPlanDirOrThrow(planId, cwd)`**: Extraer la lógica de `findPlanDir()` a un helper dedicado que lanza `GSDC_PLAN_NOT_FOUND` (exit 24) cuando el directorio del plan no existe. Las funciones nuevas (`questions()`, `answer()`, `resetConfirmation()`) deben usar este helper en vez de `findPlanDir()` directo. Actualizar `findPlanDir()` existente para usar el mismo helper, migrando el error de `GSDC_JSON_PARSE_ERROR` a `GSDC_PLAN_NOT_FOUND`. Esto aplica a **todas** las funciones existentes — `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`, etc. — para que el contrato de error sea consistente.

**`readJsonOrThrow(filePath)`**: Helper para parsing de JSON. Si el archivo no existe → `GSDC_ARTIFACT_MISSING` (exit 25). Si JSON es corrupto → `GSDC_JSON_PARSE_ERROR` (exit 15). Usar en todas las funciones que leen artefactos requeridos dentro de un plan existente. **No aplica** a `list()`, que es tolerante a planes individuales corruptos y los omite silenciosamente.

**Distinción de errores**: `findPlanDirOrThrow()` es para "directorio del plan no encontrado" (GSDC_PLAN_NOT_FOUND). `readJsonOrThrow()` es para "artefacto requerido faltante o corrupto dentro de un plan existente" (GSDC_ARTIFACT_MISSING / GSDC_JSON_PARSE_ERROR). Un plan puede existir pero tener `decisions.json` faltante (mal inicializado) — ese caso es `GSDC_ARTIFACT_MISSING`, no `GSDC_PLAN_NOT_FOUND`.

**`getEmptyFields(decisions, fieldList, optionalAnswered)`**: Extraer la lógica de detección de campos vacíos/placeholders que actualmente está duplicada en `confirmDecisions()` (línea 183) y se necesitará en `questions()`. Un solo helper:

```js
function getEmptyFields(decisions, fieldList, optionalAnswered = {}) {
  const placeholders = ['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR'];
  return fieldList.filter(field => {
    if (optionalAnswered[field]) return false;
    const val = String(decisions[field] || '').trim();
    const isPlaceholder = placeholders.some(p => val.toUpperCase().includes(p)) || (val.startsWith('[') && val.endsWith(']'));
    return !val || isPlaceholder;
  });
}
```

`confirmDecisions()` reutiliza este helper en vez de su lógica inline. `resolveQuestions()` (línea 275) también tiene validación duplicada y debe usar el mismo helper. `questions()` lo usa para determinar `filled` vs `pending`. Esto garantiza que los tres siempre coinciden — si `questions()` reporta `requiredFieldsComplete: true`, `confirm-decisions` no falla por campos faltantes (nota: `resolve-questions` requiere además `confirmed === true` + hash vigente, por lo que sí puede fallar si el usuario no confirmó o modificó después).

**Semántica de contadores**:
- `requiredFieldsComplete`: `true` cuando `requiredPendingCount === 0`. Significa "los 6 campos requeridos tienen valor — el agente **debe presentar el resumen y pedir confirmación explícita**". NO es permiso para auto-confirmar ni garantiza que `resolve-questions` vaya a pasar (requiere confirmación + hash vigente).
- `allQuestionsAnswered`: `true` cuando `requiredPendingCount === 0 && optionalPendingCount === 0`. Todas las preguntas fueron respondidas o explícitamente declinadas.
- El agente puede avanzar al paso de confirmación cuando `requiredFieldsComplete === true`, sin importar `optionalPendingCount`.

**`optionalAnswered` en `decisions.json`**: Campo nuevo en `decisions.json` — objeto `optionalAnswered: {}` que rastrea qué campos opcionales fueron explícitamente respondidos o declinados. Cuando el usuario responde `assets` (con valor o declinando), se set `optionalAnswered.assets = true`. `getEmptyFields()` recibe `optionalAnswered` como tercer parámetro — campos con `optionalAnswered[field] === true` se excluyen de la lista de pendientes, independientemente de su valor. Esto distingue "no preguntado" de "usuario confirmó que no hay assets".

### 2. `lib/plan-manager.js` — Agregar función `questions(planId)`

Leer `decisions.json` del plan, filtrar campos vacíos/placeholders usando el helper compartido, y retornar datos crudos (sin wrapper `{ok, data}` — el CLI se encarga del wrapper via `handleSuccess()`):

```json
{
  "planId": "001",
  "planState": "mockup:questions_pending",
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

**Regla de valores**: `value` siempre contiene el texto final que se escribe tal cual en `decisions.json`. No hay códigos internos. Lo que el usuario selecciona o escribe es lo que se guarda.

**Comportamiento ante estados inválidos**:
- Plan no existe → `GSDC_PLAN_NOT_FOUND` (exit 24)
- `decisions.json` corrupto o faltante → `GSDC_ARTIFACT_MISSING` (exit 25) / `GSDC_JSON_PARSE_ERROR` (exit 15)
- Plan no está en `mockup:questions_pending` → **ERROR** `GSDC_INVALID_STATE` (exit 13). Un agente no debe interpretar "sin preguntas" como permiso para avanzar.
- Todos los campos requeridos ya llenos → retorna `requiredPendingCount: 0`, `optionalPendingCount` según corresponda, `filled` con los valores actuales.

**Lock**: `questions()` adquiere el lock global **antes** de leer `plan.json` y `decisions.json`, y lo libera en `finally`. Esto garantiza un snapshot consistente — sin él, una escritura concurrente de `answer()` o `confirm-decisions` podría hacer que `questions()` observe `plan.json` de un momento y `decisions.json` de otro, retornando contadores inconsistentes.

### 3. `lib/plan-manager.js` — Agregar función `answer(planId, field, value)`

Escribe una respuesta individual en `decisions.json` con validación:

```bash
gsd-canva plan answer --id 001 --field vertical --value "SaaS / Producto Digital"
gsd-canva plan answer --id 001 --field assets --value ""
```

Comportamiento:
- Valida que el `field` sea uno de los campos conocidos (`vertical`, `formato`, `audiencia`, `paleta`, `copy`, `cta`, `assets`)
- **Orden de operaciones**: acquire lock → leer `decisions.json` → validar estado `mockup:questions_pending` → validar `confirmation.confirmed !== true` → escribir atómicamente → release lock en `finally`
- Las validaciones ocurren **dentro** del lock para evitar race conditions con `confirm-decisions` o `resolve-questions` concurrentes
- No valida placeholders ni completitud — eso lo hace `confirm-decisions`
- **Campos opcionales con valor vacío**: Si `field` es un campo opcional (`assets`) y `value` es `""`, marca `optionalAnswered.assets = true` en `decisions.json` sin cambiar el valor del campo. Esto representa "el usuario fue preguntado y declinó". `getEmptyFields()` excluye campos con `optionalAnswered[field] === true` de los pendientes opcionales.
- Retorna los mismos contadores que `questions()` como datos crudos (sin wrapper):

```json
{
  "planId": "001",
  "field": "vertical",
  "value": "SaaS / Producto Digital",
  "requiredPendingCount": 5,
  "optionalPendingCount": 1
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
- Si el estado es `questions_pending` y no hay confirmación previa → no-op, retorna éxito sin cambios (idempotente)
- Si el estado es `ready_for_html` o `pending_approval`, revierte a `mockup:questions_pending`
- Si existe `mockup.html` en la carpeta del plan, lo renombra a `mockup.html.stale.<timestamp>` para invalidarlo — `submitMockup()` solo acepta `mockup.html`, no `.stale`
- Pone `confirmation.confirmed = false`, `confirmation.confirmedAt = null`, `confirmation.decisionsHash = ""`
- **Orden de operaciones** (prioriza seguridad de estado sobre limpieza de artefactos):
  1. Acquire lock
  2. Leer archivos
  3. Validar estado
  4. Escribir `plan.json` con estado `mockup:questions_pending` **primero** — esto garantiza que el plan deja de ser aprobable inmediatamente
  5. Escribir `decisions.json` con `confirmed = false`, `decisionsHash = ""`
  6. Renombrar `mockup.html` a `.stale` si existe
  7. Release lock en `finally`
- **Idempotencia y recuperación**: Si el estado es `questions_pending` sin confirmación previa → no-op. Si falla después de escribir `plan.json` (paso 4), el plan ya está en `questions_pending` — seguro, no puede recibir `approve-mockup`. Los pasos 5 y 6 son cleanup: re-ejecutar `reset-confirmation` completa la limpieza sin efecto adverso. Si falla antes de escribir `plan.json`, el estado original se mantiene y el usuario puede re-ejecutar.
- Retorna confirmación del reset + nuevo estado

Errores:
- Plan no existe → `GSDC_PLAN_NOT_FOUND` (exit 24)
- Estado incorrecto → `GSDC_INVALID_STATE` (exit 13)

Esto elimina la contradicción: el flujo de corrección usa un comando CLI, no edición directa de `decisions.json`. Además, funciona incluso después de `resolve-questions` (estado `ready_for_html`), revirtiendo el plan a `questions_pending` para permitir edición completa.

### 5. `bin/gsd-canva.js` — Agregar subcomandos

```
gsd-canva plan questions --id <ID> [--json]
gsd-canva plan answer --id <ID> --field <campo> --value <valor> [--json]
gsd-canva plan reset-confirmation --id <ID> [--json]
```

En modo `--json`: `handleSuccess()` envuelve el resultado del manager en `{ ok: true, data: <resultado> }`. Las funciones del manager retornan datos crudos — el CLI es responsable del envelope.
En modo humano:
- `plan questions`: imprime preguntas requeridas primero, numeradas con opciones numeradas, assets al final marcado como "(opcional)", y contadores al final: `Requeridos: 3/6 · Opcionales: 0/1`.
- `plan answer`: imprime confirmación de respuesta guardada + contadores restantes.
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
        *   **Contexto Parcial**: El usuario proveyó algunos datos pero no todos → Guarda **solo los campos explícitamente provistos** por el usuario usando `gsd-canva plan answer`. ⚠️ **PROHIBIDO** guardar campos inferidos del contexto (ej: si dice "banner para mi app", no infieras `vertical`, `paleta`, ni `cta` — solo guarda lo que el usuario dijo explícitamente). Los campos no provistos quedan vacíos.
        *   **Sin Contexto**: El usuario solo proveyó un nombre genérico (ej: `test2`) → No guardes nada, pasa directo a preguntas.
    *   💡 **REGLA DE SUGERENCIAS**: Puedes diseñar y proponer opciones estéticas o creativas sugeridas al usuario en el chat, marcándolas **explícitamente como propuestas tentativas no confirmadas**. Sin embargo, está **PROHIBIDO** registrarlas en `decisions.json` o darlas por definitivas en `requerimientos.md` o `investigacion.md` sin el consentimiento explícito del usuario.
*   **Preguntas Interactivas Obligatorias**:
    *   Ejecuta el comando para obtener las preguntas estructuradas:
        ```bash
        gsd-canva plan questions --id <ID_DE_TRES_DÍGITOS> --json
        ```
    *   **Renderizado de preguntas (first-class: chat numerado)**:
        *   Presenta cada pregunta pendiente al usuario de forma clara y numerada. Las preguntas de campos requeridos (`required: true`) se presentan primero. Si `optionalPendingCount > 0` después de responder los requeridos, se presenta la pregunta de assets como pregunta adicional no bloqueante.
        *   Para campos tipo `choice`: muestra las opciones numeradas. La última opción siempre es "Otro (personalizado)" para valor custom.
        *   Para campos tipo `text`: muestra el placeholder como guía.
        *   Espera la respuesta del usuario antes de pasar a la siguiente pregunta.
        *   **Mapeo de entrada numérica**: Si el usuario responde con un número (ej: "1"), el agente debe mapearlo al `value` de la opción correspondiente en el JSON de preguntas. El `--value` pasado a `plan answer` siempre debe ser el texto final del valor, nunca el índice numérico.
        *   **Opción "Otro"**: Si el usuario selecciona "Otro (personalizado)", el agente **debe** hacer una pregunta de seguimiento pidiendo el texto personalizado. Solo el texto que el usuario proporcione se pasa a `plan answer --value`. ⚠️ **PROHIBIDO** guardar `"Otro"`, `"Otro (personalizado)"` o el índice numérico como valor.
    *   **Si tu entorno ofrece UI interactiva nativa** (herramientas de questions, choices, formularios):
        *   Puedes usarla como alternativa al chat numerado para mejorar la experiencia.
        *   Pero el flujo y las preguntas deben venir del JSON de `plan questions`, no improvisadas.
    *   **Pregunta recomendada de assets**: Si `optionalPendingCount > 0`, pregunta si el usuario quiere proveer assets. Es **recomendada** pero **no bloqueante** — el agente puede avanzar a confirmación con `optionalPendingCount > 0`. Si el usuario dice que no o lo omite:
        *   Ejecuta `plan answer --field assets --value ""` para marcar como declinado (`optionalAnswered.assets = true`).
        *   `optionalPendingCount` baja a 0, `assets` aparece en `filled` con estado "declinado".
        *   `requiredFieldsComplete` no se ve afectado.
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
        | `GSDC_DECISIONS_LOCKED` (23) | Preguntar al usuario si desea ejecutar `reset-confirmation`. ⚠️ PROHIBIDO editar `decisions.json` directamente. |
        | `GSDC_INVALID_STATE` (13) | Ejecutar `plan status --id <ID> --json` y explicar al usuario el estado actual del plan. |
        | `GSDC_JSON_PARSE_ERROR` (15) | Detener el flujo y reportar que `decisions.json` está corrupto. Pedir intervención manual. |
        | `GSDC_ARTIFACT_MISSING` (25) | Detener el flujo y reportar que falta un archivo requerido del plan. |
        | `GSDC_INVALID_FIELD` (22) | Re-ejecutar `plan questions` para obtener la lista de campos válidos. |
        | `GSDC_PLAN_NOT_FOUND` (24) | Reportar que el plan no existe. Sugerir `plan create` para crear uno nuevo. |
*   **Poblado de archivos Markdown (espejo de decisions.json)**:
    *   Los archivos Markdown (`requerimientos.md`, `investigacion.md`) se actualizan como espejo de lo que ya está en `decisions.json`.
    *   Los campos desconocidos en los Markdown se dejan con los placeholders originales del template.
    *   ⚠️ **PROHIBIDO** editar `requerimientos.md` o `investigacion.md` con datos que no estén primero en `decisions.json`.
    *   Escribe las preguntas faltantes en la sección `Pendientes` de `preguntas.md`.
*   **Revisión Final y Confirmación Explícita (OBLIGATORIO antes de congelar)**:
    1. Presenta un resumen completo de todas las respuestas registradas.
    2. Destaca qué es dato confirmado vs qué es sugerencia tentativa (si hubo alguna).
    3. Pide confirmación explícita al usuario: "¿Estás de acuerdo con estas decisiones?".
    4. ⚠️ **DETÉN la ejecución** hasta que el usuario confirme explícitamente.
    5. **Parsing de confirmación**: Solo una afirmación sin calificar después del último resumen cuenta como confirmación. Si la respuesta del usuario contiene correcciones, dudas, o adiciones (ej: "sí, pero cambia la paleta a verde"), NO es confirmación — ejecuta `plan answer` para la corrección, presenta un nuevo resumen, y pide confirmación de nuevo.
    6. Solo después de confirmación explícita sin calificaciones:
        - Ejecuta `gsd-canva plan confirm-decisions --id <ID_DE_TRES_DÍGITOS>`.
        - Ejecuta `gsd-canva plan resolve-questions --id <ID_DE_TRES_DÍGITOS>`.
    7. ⚠️ **PROHIBIDO** ejecutar `confirm-decisions` o `resolve-questions` sin confirmación explícita del usuario.
    8. ⚠️ **PROHIBIDO** generar `mockup.html` o ejecutar comandos de transición de fase de forma autónoma. Los comandos `confirm-decisions` y `resolve-questions` son la **excepción** permitida **solo** después de la confirmación explícita del paso 6.
*   **Corrección de decisiones ya confirmadas**:
    *   Si el usuario quiere corregir después de confirmar, ejecuta:
        ```bash
        gsd-canva plan reset-confirmation --id <ID_DE_TRES_DÍGITOS>
        ```
    *   Luego usa `plan answer` para modificar campos y repite la confirmación.
    *   ⚠️ **PROHIBIDO** editar `decisions.json` directamente para resetear la confirmación.
```

### 7. `lib/plan-manager.js` — `create()` inicializa `assets: ""` y `optionalAnswered: {}`

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

### 8. `lib/plan-manager.js` — `assets` incluido en el payload del hash criptográfico + migración

Actualmente `confirmDecisions()` (línea 206), `resolveQuestions()` (línea 298) y `submitMockup()` (línea 369) calculan el hash sobre solo 6 campos con algoritmo `sha256-decisions-v1`. `assets` debe agregarse al payload canónico:

```js
const payload = JSON.stringify({
  vertical: normalize(decisions.vertical),
  audiencia: normalize(decisions.audiencia),
  formato: normalize(decisions.formato),
  paleta: normalize(decisions.paleta),
  copy: normalize(decisions.copy),
  cta: normalize(decisions.cta),
  assets: normalize(decisions.assets || '')
});
```

**Migración para planes v1.1 existentes**: Bump `hashAlgorithm` de `sha256-decisions-v1` a `sha256-decisions-v2`. Las 3 funciones que validan hash deben soportar ambos:
1. Si `decisions.confirmation.hashAlgorithm` es `sha256-decisions-v1` → calcular hash con los 6 campos originales (sin `assets`) y comparar.
2. Si es `sha256-decisions-v2` (o undefined en planes nuevos) → calcular hash con los 7 campos incluyendo `assets`.
3. `confirmDecisions()` siempre escribe `hashAlgorithm: "sha256-decisions-v2"` al confirmar. Esto migra automáticamente cada plan la primera vez que se confirma después del upgrade.
4. `resetConfirmation()` limpia `hashAlgorithm` junto con `decisionsHash`.

Esto garantiza que planes confirmados con v1.1 (6 campos) pasen `resolve-questions` correctamente, mientras que nuevas confirmaciones usan el payload extendido.

### 10. Referencias cruzadas — Verificar y actualizar archivos colaterales

Verificar con `rg "mockup:pending" templates/ docs/ README.md` y actualizar referencias obsoletas:
- `templates/plan-templates/roadmap_progreso.md`: reemplazar `mockup:pending` por `mockup:questions_pending` si aparece
- `README.md`: verificar que las descripciones de estado sean consistentes con la máquina de estados actual
- `docs/implementation_plans/*`: declarar como históricos — no actualizar excepto si contienen instrucciones operativas activas

### 11. `templates/plan-templates/preguntas.md` — Agregar campo `assets`

Si el template de `preguntas.md` solo refleja los 6 campos originales, agregar sección para `Assets / Recursos externos` como campo opcional, consistente con el séptimo campo de `decisions.json`.

### 12. `tests/plan.test.js` — Tests unitarios de funciones

- **Test questions vacío**: plan nuevo → `requiredPendingCount === 6`, `optionalPendingCount === 1`, `filledCount === 0`, primer campo tiene `id === "vertical"`.
- **Test questions parcial**: llenar 2 campos requeridos con `plan answer` → `requiredPendingCount === 4`, campos llenos aparecen en `filled`.
- **Test questions completo**: llenar los 6 campos requeridos → `requiredPendingCount === 0`, `optionalPendingCount === 1` (solo `assets` queda), `requiredFieldsComplete === true`, todos los requeridos en `filled`.
- **Test questions con assets lleno**: llenar los 7 campos → `requiredPendingCount === 0`, `optionalPendingCount === 0`, `allQuestionsAnswered === true`.
- **Test questions con assets declinado**: ejecutar `plan answer --field assets --value ""` → `optionalPendingCount === 0`, `allQuestionsAnswered === true`, assets aparece en `filled`.
- **Test answer campo inválido**: `--field noexiste` → error `GSDC_INVALID_FIELD` (exit 22).
- **Test answer estado incorrecto**: plan en `mockup:ready_for_html` → error `GSDC_INVALID_STATE` (exit 13).
- **Test answer post-confirmación**: ejecutar `confirm-decisions` y luego `plan answer` → error `GSDC_DECISIONS_LOCKED` (exit 23).
- **Test questions estado incorrecto**: plan en `mockup:ready_for_html` → error `GSDC_INVALID_STATE` (exit 13).
- **Test questions plan inexistente**: `--id 999` → error `GSDC_PLAN_NOT_FOUND` (exit 24).
- **Test questions decisions corrupto**: escribir JSON inválido en `decisions.json` → error `GSDC_JSON_PARSE_ERROR` (exit 15).
- **Test questions decisions faltante**: crear carpeta de plan válida, borrar `decisions.json` → error `GSDC_ARTIFACT_MISSING` (exit 25).
- **Test reset-confirmation**: confirmar, ejecutar `reset-confirmation`, verificar que `confirmed === false`, `decisionsHash === ""`, `hashAlgorithm` limpiado.
- **Test reset-confirmation desbloquea answer**: reset → `plan answer` funciona de nuevo.
- **Test reset-confirmation desde ready_for_html**: confirmar + resolver (estado `ready_for_html`), crear `mockup.html` falso, ejecutar `reset-confirmation` → estado vuelve a `questions_pending`, `mockup.html` renombrado a `.stale`, `plan answer` funciona.
- **Test reset-confirmation desde pending_approval**: estado `pending_approval` + `mockup.html`, ejecutar `reset-confirmation` → estado `questions_pending`, mockup stale, `plan answer` funciona. Simular fallo después de escribir `plan.json` (paso 4) → re-ejecutar completa la limpieza.
- **Test reset-confirmation no-op**: plan en `questions_pending` sin confirmación → retorna éxito sin cambios.
- **Test mockup stale bloquea submit**: resetear desde `ready_for_html` con mockup stale, confirmar + resolver de nuevo, ejecutar `submit-mockup` → falla porque `mockup.html` no existe (fue renombrado).
- **Test helper compartido**: probar indirectamente — llenar un campo con placeholder conocido (ej: `"TBD"`), verificar que `questions()` lo reporta como pending Y que `confirmDecisions` falla con el campo en `missing`. No requiere exportar `getEmptyFields`.
- **Test hash incluye assets**: modificar `assets` después de confirmar → `resolve-questions` falla con hash mismatch.
- **Test assets omitido**: no responder assets → `optionalPendingCount` sigue en 1, pero `requiredFieldsComplete === true` (no bloquea).
- **Test hash migración v1**: crear fixture con `hashAlgorithm: "sha256-decisions-v1"` y hash de 6 campos → `resolve-questions` pasa con el hash v1.
- **Test hash migración v2**: confirmar plan nuevo → `hashAlgorithm` es `sha256-decisions-v2`, hash incluye `assets`.
- **Test resolve-questions sin confirmación**: llenar 6 requeridos, ejecutar `resolve-questions` sin `confirm-decisions` → falla (requiere `confirmed === true`).
- **Test questions lock consistente**: verificar que `questions()` retorna snapshot consistente bajo escritura concurrente (no contadores mezclados).
- **Test findPlanDir migración**: `plan status --id 999` retorna `GSDC_PLAN_NOT_FOUND` (exit 24), no `GSDC_JSON_PARSE_ERROR` (exit 15) — verificar que funciones existentes migraron al nuevo error.

### Tests de contrato CLI (`child_process`)

Agregar sección separada en `tests/plan.test.js` que ejecute los subcomandos reales via `child_process.execSync` en un workspace temporal limpio:

- Usar `process.execPath` con ruta absoluta a `bin/gsd-canva.js` como binario, **no** `gsd-canva` global. Ejemplo: `execSync(`${process.execPath} ${path.resolve(__dirname, '../bin/gsd-canva.js')} plan questions --id ${planId} --json`, { cwd: tempDir })`
- Cada test captura `planId` desde `plan create --json` en vez de hardcodear.
- **Test CLI questions JSON**: `plan questions --json` → `parsed.ok === true`, `parsed.data.requiredPendingCount === 6`, no hay `parsed.data.data` (no double-wrap).
- **Test CLI questions humano**: `plan questions` (sin `--json`) → stdout incluye `1.`, `vertical`, al menos una opción numerada, y marcador de assets opcional.

---

## Tabla de errores nuevos

| Código | Exit Code | Descripción |
|---|---|---|
| `GSDC_INVALID_FIELD` | `22` | El campo especificado no es un campo conocido de `decisions.json`. |
| `GSDC_DECISIONS_LOCKED` | `23` | No se puede modificar `decisions.json` después de `confirm-decisions`. Usar `reset-confirmation` primero. |
| `GSDC_PLAN_NOT_FOUND` | `24` | El plan especificado no existe (directorio no encontrado). |
| `GSDC_ARTIFACT_MISSING` | `25` | Un artefacto requerido del plan falta (ej: `decisions.json` o `plan.json` no existen dentro de la carpeta del plan). |

---

## Verificación

1. `npm test` — todos los tests pasan (existentes + tests nuevos listados en secciones 12 y 13).
2. En workspace temporal limpio: capturar `planId` desde `gsd-canva plan create --name "test" --json`, luego `gsd-canva plan questions --id $planId --json` → retorna esquema con `requiredPendingCount: 6`, `optionalPendingCount: 1`.
3. `gsd-canva plan answer --id $planId --field vertical --value "SaaS / Producto Digital"` → guarda correctamente, retorna `requiredPendingCount: 5`.
4. `gsd-canva plan questions --id $planId --json` → `requiredPendingCount` disminuye en 1.
5. Llenar los 6 campos requeridos → `requiredPendingCount === 0`, `optionalPendingCount === 1`.
6. `gsd-canva plan confirm-decisions --id $planId` → pasa (solo requiere los 6, no `assets`), `hashAlgorithm === "sha256-decisions-v2"`.
7. Intentar `plan answer` después de confirmar → error `GSDC_DECISIONS_LOCKED` (exit 23).
8. `gsd-canva plan reset-confirmation --id $planId` → desbloquea, `plan answer` funciona de nuevo.
9. Intentar `plan questions` en plan con estado `mockup:ready_for_html` → error `GSDC_INVALID_STATE` (exit 13).
10. Confirmar + resolver (estado `ready_for_html`), ejecutar `reset-confirmation` → estado vuelve a `questions_pending`, `plan answer` funciona.
11. Verificar que `canva-mockup.md` sección 2 ya no contiene instrucciones de escritura directa en `decisions.json`:
    ```bash
    rg "Pobla.*decisions\.json|escribe.*decisions\.json|actualiza decisions" templates/commands/canva-mockup.md
    ```
    Esperado: cero resultados (solo `plan answer` debe escribir).
12. Modificar `assets` después de confirmar → `resolve-questions` falla con hash mismatch (assets está en el payload).
13. Ejecutar `/canva-mockup test3` con un agente → el agente usa `plan questions`, renderiza, guarda con `plan answer`, presenta resumen, pide confirmación, solo entonces congelar.
14. Verificar plan v1.1 existente: fixture con `hashAlgorithm: "sha256-decisions-v1"` → `resolve-questions` pasa sin error de hash.
15. Verificar que `plan questions --json` no tiene double-wrap: `parsed.ok === true` y `parsed.data.requiredPendingCount` existe, `parsed.data.data` no existe.
16. Verificar que `plan status --id 999` retorna `GSDC_PLAN_NOT_FOUND` (exit 24) — no `GSDC_JSON_PARSE_ERROR`.
17. Verificar assets declinado: `plan answer --field assets --value ""` → `optionalPendingCount === 0`, `allQuestionsAnswered === true`.

---

## Notas

- Los `value` en el JSON son siempre texto final legible — lo que el usuario selecciona es lo que se guarda en `decisions.json`. No hay códigos internos.
- `assets` es opcional: no bloquea el Yield Gate. `requiredFieldsComplete` es `true` cuando los 6 campos requeridos están llenos, independientemente de `assets`. El agente puede avanzar a confirmación con `optionalPendingCount > 0`.
- El fallback a chat numerado es first-class, no un afterthought. La UI nativa es opcional.
- `plan answer` escribe atómicamente y valida campo + estado + confirmación bloqueada — el agente nunca toca `decisions.json` directamente.
- La parada de revisión final es obligatoria antes de `confirm-decisions`: el usuario debe ver un resumen y confirmar explícitamente.
- `create()` inicializa `assets: ""` y `optionalAnswered: {}` para que los campos existan siempre en `decisions.json`.
- `plan answer` rechaza escritura si `confirmation.confirmed === true` — protege el hash de integridad post-confirmación.
- `plan questions` falla con error si el plan no está en `mockup:questions_pending` — no hay silencio ante estado incorrecto.
- `reset-confirmation` es el único mecanismo para desbloquear. Acepta `mockup:ready_for_html` y `mockup:pending_approval` y revierte a `questions_pending`. En `questions_pending` sin confirmación previa es no-op (idempotente).
- El helper compartido `getEmptyFields()` garantiza que `questions()`, `confirmDecisions()` y `resolveQuestions()` siempre coinciden en qué campos están vacíos. Recibe `optionalAnswered` para excluir campos opcionales explícitamente respondidos/declinados.
- `plan answer` retorna `requiredPendingCount` y `optionalPendingCount` (no `remaining` genérico) — consistente con `questions()`.
- La sección 2 completa del template se reemplaza, no solo el roadblock — elimina todas las instrucciones de escritura directa en `decisions.json`. La sección 3 (wireframing) no se toca — se ejecuta después del yield gate.
- `questions()`, `answer()` y `resetConfirmation()` adquieren lock global **antes** de leer y validar — protege contra race conditions con comandos concurrentes. `questions()` es read transaction.
- `assets` se incluye en el payload del hash criptográfico (v2) — cambios en assets post-confirmación son detectados.
- Si el usuario declina assets, `plan answer --field assets --value ""` marca `optionalAnswered.assets = true` — el campo queda vacío pero `optionalPendingCount` baja a 0. No se re-pregunta en llamadas subsecuentes a `plan questions`.
- `reset-confirmation` desde `ready_for_html` o `pending_approval` renombra `mockup.html` a `.stale`. El orden prioriza escribir `plan.json` primero — si falla después, el plan ya está en `questions_pending` y es seguro. Re-ejecutar completa la limpieza.
- Tests CLI via `child_process` usan `process.execPath` + ruta a `bin/gsd-canva.js` — no requieren instalación global.
- `readJsonOrThrow()` helper centraliza parsing de JSON con error consistente (`GSDC_ARTIFACT_MISSING` para archivo faltante, `GSDC_JSON_PARSE_ERROR` para corrupto). No aplica a `list()` que es tolerante.
- `findPlanDirOrThrow()` centraliza lookup de directorio con `GSDC_PLAN_NOT_FOUND`. Reemplaza el comportamiento actual de `findPlanDir()` que usaba `GSDC_JSON_PARSE_ERROR` para planes inexistentes.
- `getEmptyFields` se prueba indirectamente, no se exporta — `questions()` y `confirmDecisions()` son la API pública.
- Verificación captura `planId` dinámicamente desde `plan create --json` en workspace temporal limpio.
- Referencias a `mockup:pending` en `roadmap_progreso.md` y `README.md` se verifican y actualizan.
- `preguntas.md` template se actualiza para incluir campo `assets` opcional.
- `requiredFieldsComplete: true` significa "los 6 requeridos tienen valor — presenta resumen y pide confirmación explícita", no "auto-confirma". `resolve-questions` requiere además `confirmed === true` + hash vigente.
- `GSDC_PLAN_NOT_FOUND` (exit 24) separa "plan no existe" de `GSDC_ARTIFACT_MISSING` (exit 25) para "artefacto faltante dentro de plan existente" y `GSDC_JSON_PARSE_ERROR` (exit 15) para "JSON corrupto".
- Las funciones del manager retornan datos crudos — el CLI envuelve via `handleSuccess()`. No hay double-wrap.
- El renderizado siempre presenta assets si `optionalPendingCount > 0`. El agente mapea entrada numérica al `value` correspondiente — nunca pasa índices. Si el usuario selecciona "Otro", el agente hace pregunta de seguimiento y guarda el texto personalizado.
- La confirmación requiere afirmación sin calificar. Si la respuesta contiene correcciones ("sí, pero cambia X"), se ejecuta `plan answer` para la corrección, se presenta nuevo resumen, y se pide confirmación de nuevo.
- El template incluye tabla de recovery de errores — el agente nunca edita `decisions.json` directamente para recuperarse de errores.
- Context extraction solo guarda campos explícitamente provistos por el usuario — no infiere vertical, paleta, CTA, etc. del nombre del proyecto o contexto ambiguo.
- Hash migración: `sha256-decisions-v1` (6 campos) para planes existentes, `sha256-decisions-v2` (7 campos con assets) para nuevas confirmaciones. `confirmDecisions()` escribe `hashAlgorithm: "sha256-decisions-v2"` al confirmar — migra automáticamente.
- `resetConfirmation()` limpia `hashAlgorithm` junto con `decisionsHash` para que la siguiente confirmación use v2.
