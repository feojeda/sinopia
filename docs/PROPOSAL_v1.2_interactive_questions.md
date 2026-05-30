# Plan: Preguntas Interactivas en `/canva-mockup` (Rev. 5)

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

### 1. `lib/plan-manager.js` — Helper compartido `getEmptyFields(decisions)`

Extraer la lógica de detección de campos vacíos/placeholders que actualmente está duplicada en `confirmDecisions()` (línea 183) y se necesitará en `questions()`. Un solo helper:

```js
function getEmptyFields(decisions, fieldList) {
  const placeholders = ['TODO', 'TBD', 'N/A', 'PENDIENTE', 'POR DEFINIR'];
  return fieldList.filter(field => {
    const val = String(decisions[field] || '').trim();
    const isPlaceholder = placeholders.some(p => val.toUpperCase().includes(p)) || (val.startsWith('[') && val.endsWith(']'));
    return !val || isPlaceholder;
  });
}
```

`confirmDecisions()` reutiliza este helper en vez de su lógica inline. `resolveQuestions()` (línea 275) también tiene validación duplicada y debe usar el mismo helper. `questions()` lo usa para determinar `filled` vs `pending`. Esto garantiza que los tres siempre coinciden — si `questions()` dice "todo listo", `confirm-decisions` y `resolve-questions` no pueden fallar.

### 2. `lib/plan-manager.js` — Agregar función `questions(planId)`

Leer `decisions.json` del plan, filtrar campos vacíos/placeholders usando el helper compartido, y retornar:

```json
{
  "planId": "001",
  "planState": "mockup:questions_pending",
  "totalFields": 7,
  "filledCount": 0,
  "requiredPendingCount": 6,
  "optionalPendingCount": 1,
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
- Plan no existe → `GSDC_JSON_PARSE_ERROR` (exit 15)
- `decisions.json` corrupto → `GSDC_JSON_PARSE_ERROR` (exit 15)
- Plan no está en `mockup:questions_pending` → **ERROR** `GSDC_INVALID_STATE` (exit 13). Un agente no debe interpretar "sin preguntas" como permiso para avanzar.
- Todos los campos requeridos ya llenos → retorna `requiredPendingCount: 0`, `optionalPendingCount` según corresponda, `filled` con los valores actuales.

### 3. `lib/plan-manager.js` — Agregar función `answer(planId, field, value)`

Escribe una respuesta individual en `decisions.json` con validación:

```bash
gsd-canva plan answer --id 001 --field vertical --value "SaaS / Producto Digital"
```

Comportamiento:
- Valida que el `field` sea uno de los campos conocidos (`vertical`, `formato`, `audiencia`, `paleta`, `copy`, `cta`, `assets`)
- **Orden de operaciones**: acquire lock → leer `decisions.json` → validar estado `mockup:questions_pending` → validar `confirmation.confirmed !== true` → escribir atómicamente → release lock en `finally`
- Las validaciones ocurren **dentro** del lock para evitar race conditions con `confirm-decisions` o `resolve-questions` concurrentes
- No valida placeholders ni completitud — eso lo hace `confirm-decisions`
- Retorna los mismos contadores que `questions()`:

```json
{
  "ok": true,
  "data": {
    "planId": "001",
    "field": "vertical",
    "value": "SaaS / Producto Digital",
    "requiredPendingCount": 5,
    "optionalPendingCount": 1
  }
}
```

Errores:
- `field` no reconocido → `GSDC_INVALID_FIELD` (exit 22)
- Plan no existe → `GSDC_JSON_PARSE_ERROR` (exit 15)
- Estado incorrecto → `GSDC_INVALID_STATE` (exit 13)
- Ya confirmado → `GSDC_DECISIONS_LOCKED` (exit 23)

### 4. `lib/plan-manager.js` — Agregar función `resetConfirmation(planId)`

Comando explícito para desbloquear decisiones confirmadas:

```bash
gsd-canva plan reset-confirmation --id <ID>
```

Comportamiento:
- Valida que el plan exista
- Acepta estados `mockup:questions_pending` o `mockup:ready_for_html`
- Si el estado es `ready_for_html`, revierte a `mockup:questions_pending` (actualiza `plan.json` + agrega evento al history)
- Si existe `mockup.html` en la carpeta del plan, lo renombra a `mockup.html.stale.<timestamp>` para invalidarlo — `submitMockup()` solo acepta `mockup.html`, no `.stale`
- Pone `confirmation.confirmed = false`, `confirmation.confirmedAt = null`, `confirmation.decisionsHash = ""`
- Orden de operaciones: acquire lock → leer archivos → validar estado → renombrar mockup stale → escribir decisions.json → escribir plan.json → release lock en `finally`
- Retorna confirmación del reset + nuevo estado

Errores:
- Plan no existe → `GSDC_JSON_PARSE_ERROR` (exit 15)
- Estado incorrecto → `GSDC_INVALID_STATE` (exit 13)

Esto elimina la contradicción: el flujo de corrección usa un comando CLI, no edición directa de `decisions.json`. Además, funciona incluso después de `resolve-questions` (estado `ready_for_html`), revirtiendo el plan a `questions_pending` para permitir edición completa.

### 5. `bin/gsd-canva.js` — Agregar subcomandos

```
gsd-canva plan questions --id <ID> [--json]
gsd-canva plan answer --id <ID> --field <campo> --value <valor> [--json]
gsd-canva plan reset-confirmation --id <ID> [--json]
```

En modo `--json`: retorna JSON en stdout.
En modo humano:
- `plan questions`: imprime preguntas numeradas con opciones
- `plan answer`: imprime confirmación de respuesta guardada + contadores restantes
- `plan reset-confirmation`: imprime confirmación de desbloqueo

### 6. `templates/commands/canva-mockup.md` — Reemplazar SECCIÓN 2 COMPLETA

**IMPORTANTE**: No reemplazar solo el roadblock. Reemplazar **toda la sección 2** (desde `### 2.` hasta el final de esa sección) para eliminar todas las instrucciones de escritura directa en `decisions.json`.

**NOTA sobre sección 3**: La sección 3 vigente ("Propuesta Visual / Wireframing") ordena crear `mockup.html` y ejecutar `submit-mockup`. Esto NO es contradictorio — esa sección se ejecuta **después** de que `resolve-questions` transicione el plan a `ready_for_html`. La prohibición en la sección 2 es "no generar mockup.html durante el yield gate". No requiere cambios en la sección 3.

Texto completo que reemplaza **toda la sección 2** del template actual:

```markdown
### 2. Levantamiento de Requisitos, Investigación y Confirmación (YIELD GATE OBLIGATORIO)
*   **Análisis del Contexto del Usuario**:
    *   Analiza la instrucción inicial del usuario cuidadosamente y clasifica el nivel de contexto recibido:
        *   **Contexto Completo**: El usuario proveyó vertical, audiencia, formato, paleta, copy y CTA → Guarda esos campos inmediatamente usando `gsd-canva plan answer`.
        *   **Contexto Parcial**: El usuario proveyó algunos datos pero no todos → Guarda los campos conocidos usando `gsd-canva plan answer` y deja los demás vacíos.
        *   **Sin Contexto**: El usuario solo proveyó un nombre genérico (ej: `test2`) → No guardes nada, pasa directo a preguntas.
    *   💡 **REGLA DE SUGERENCIAS**: Puedes diseñar y proponer opciones estéticas o creativas sugeridas al usuario en el chat, marcándolas **explícitamente como propuestas tentativas no confirmadas**. Sin embargo, está **PROHIBIDO** registrarlas en `decisions.json` o darlas por definitivas en `requerimientos.md` o `investigacion.md` sin el consentimiento explícito del usuario.
*   **Preguntas Interactivas Obligatorias**:
    *   Ejecuta el comando para obtener las preguntas estructuradas:
        ```bash
        gsd-canva plan questions --id <ID_DE_TRES_DÍGITOS> --json
        ```
    *   **Renderizado de preguntas (first-class: chat numerado)**:
        *   Presenta cada pregunta pendiente (`requiredPendingCount > 0`) al usuario de forma clara y numerada.
        *   Para campos tipo `choice`: muestra las opciones numeradas + opción "Otro" para valor personalizado.
        *   Para campos tipo `text`: muestra el placeholder como guía.
        *   Espera la respuesta del usuario antes de pasar a la siguiente pregunta.
    *   **Si tu entorno ofrece UI interactiva nativa** (herramientas de questions, choices, formularios):
        *   Puedes usarla como alternativa al chat numerado para mejorar la experiencia.
        *   Pero el flujo y las preguntas deben venir del JSON de `plan questions`, no improvisadas.
    *   **Pregunta opcional de assets**: Si `optionalPendingCount > 0`, pregunta si el usuario quiere proveer assets. Si dice que no, ejecuta `gsd-canva plan answer --id <ID> --field assets --value "Sin assets externos"` para marcarlo como respondido y reducir `optionalPendingCount` a 0.
    *   **Guardado de respuestas**:
        *   Por cada respuesta del usuario, ejecuta:
            ```bash
            gsd-canva plan answer --id <ID_DE_TRES_DÍGITOS> --field <campo> --value "<respuesta>"
            ```
        *   ⚠️ **PROHIBIDO** escribir directamente en `decisions.json` sin usar el comando `plan answer`.
        *   ⚠️ **PROHIBIDO** registrar respuestas tentativas o sugeridas sin confirmación del usuario.
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
    5. Solo después de confirmación explícita del usuario:
        - Ejecuta `gsd-canva plan confirm-decisions --id <ID_DE_TRES_DÍGITOS>`.
        - Ejecuta `gsd-canva plan resolve-questions --id <ID_DE_TRES_DÍGITOS>`.
    6. ⚠️ **PROHIBIDO** ejecutar `confirm-decisions` o `resolve-questions` sin confirmación explícita del usuario.
    7. ⚠️ **PROHIBIDO** generar `mockup.html` o ejecutar comandos de transición de fase de forma autónoma. Los comandos `confirm-decisions` y `resolve-questions` son la **excepción** permitida **solo** después de la confirmación explícita del paso 5.
*   **Corrección de decisiones ya confirmadas**:
    *   Si el usuario quiere corregir después de confirmar, ejecuta:
        ```bash
        gsd-canva plan reset-confirmation --id <ID_DE_TRES_DÍGITOS>
        ```
    *   Luego usa `plan answer` para modificar campos y repite la confirmación.
    *   ⚠️ **PROHIBIDO** editar `decisions.json` directamente para resetear la confirmación.
```

### 7. `lib/plan-manager.js` — `create()` inicializa `assets: ""`

`decisions.json` generado por `create()` debe incluir `assets: ""` explícitamente para que el campo exista siempre.

### 8. `lib/plan-manager.js` — `assets` incluido en el payload del hash criptográfico

Actualmente `confirmDecisions()` (línea 206), `resolveQuestions()` (línea 298) y `submitMockup()` (línea 369) calculan el hash sobre solo 6 campos. `assets` debe agregarse al payload canónico para que cambios post-confirmación en assets sean detectados:

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

Esto aplica en las 3 funciones. El hash protege integridad de **todos** los campos editables, no solo los requeridos.

### 10. Referencias cruzadas — Verificar y actualizar archivos colaterales

Verificar con `rg "mockup:pending" templates/ docs/ README.md` y actualizar referencias obsoletas:
- `templates/plan-templates/roadmap_progreso.md`: reemplazar `mockup:pending` por `mockup:questions_pending` si aparece
- `README.md`: verificar que las descripciones de estado sean consistentes con la máquina de estados actual

### 11. `templates/plan-templates/preguntas.md` — Agregar campo `assets`

Si el template de `preguntas.md` solo refleja los 6 campos originales, agregar sección para `Assets / Recursos externos` como campo opcional, consistente con el séptimo campo de `decisions.json`.

- **Test questions vacío**: plan nuevo → `requiredPendingCount === 6`, `optionalPendingCount === 1`, `filledCount === 0`, primer campo tiene `id === "vertical"`.
- **Test questions parcial**: llenar 2 campos requeridos con `plan answer` → `requiredPendingCount === 4`, campos llenos aparecen en `filled`.
- **Test questions completo**: llenar los 6 campos requeridos → `requiredPendingCount === 0`, `optionalPendingCount === 1` (solo `assets` queda), todos los requeridos en `filled`.
- **Test questions con assets lleno**: llenar los 7 campos → `requiredPendingCount === 0`, `optionalPendingCount === 0`.
- **Test answer campo inválido**: `--field noexiste` → error `GSDC_INVALID_FIELD` (exit 22).
- **Test answer estado incorrecto**: plan en `mockup:ready_for_html` → error `GSDC_INVALID_STATE` (exit 13).
- **Test answer post-confirmación**: ejecutar `confirm-decisions` y luego `plan answer` → error `GSDC_DECISIONS_LOCKED` (exit 23).
- **Test questions estado incorrecto**: plan en `mockup:ready_for_html` → error `GSDC_INVALID_STATE` (exit 13).
- **Test questions plan inexistente**: `--id 999` → error `GSDC_JSON_PARSE_ERROR` (exit 15).
- **Test questions decisions corrupto**: escribir JSON inválido en `decisions.json` → error `GSDC_JSON_PARSE_ERROR` (exit 15).
- **Test reset-confirmation**: confirmar, ejecutar `reset-confirmation`, verificar que `confirmed === false` y `decisionsHash === ""`.
- **Test reset-confirmation desbloquea answer**: reset → `plan answer` funciona de nuevo.
- **Test reset-confirmation desde ready_for_html**: confirmar + resolver (estado `ready_for_html`), crear `mockup.html` falso, ejecutar `reset-confirmation` → estado vuelve a `questions_pending`, `mockup.html` renombrado a `.stale`, `plan answer` funciona.
- **Test mockup stale bloquea submit**: resetear desde `ready_for_html` con mockup stale, confirmar + resolver de nuevo, ejecutar `submit-mockup` → falla porque `mockup.html` no existe (fue renombrado).
- **Test helper compartido**: probar indirectamente — llenar un campo con placeholder conocido (ej: `"TBD"`), verificar que `questions()` lo reporta como pending Y que `confirmDecisions` falla con el campo en `missing`. No requiere exportar `getEmptyFields`.
- **Test hash incluye assets**: modificar `assets` después de confirmar → `resolve-questions` falla con hash mismatch.
- **Test assets omitido explícito**: `plan answer --field assets --value "Sin assets externos"` → `optionalPendingCount === 0`.

### Tests de contrato CLI (`child_process`)

Agregar sección separada en `tests/plan.test.js` que ejecute los subcomandos reales via `child_process.execSync` en un workspace temporal limpio:

- **CLI questions --json**: verificar stdout es JSON válido con `ok: true`, stderr vacío, exit code 0.
- **CLI answer --json**: verificar stdout JSON con campo `requiredPendingCount`, stderr vacío.
- **CLI answer campo inválido --json**: verificar stderr JSON con `code: "GSDC_INVALID_FIELD"`, exit code 22.
- **CLI reset-confirmation --json desde ready_for_html**: verificar stdout JSON con nuevo estado `questions_pending`.
- Cada test captura `planId` desde `plan create --json` en vez de hardcodear `001`.

---

## Tabla de errores nuevos

| Código | Exit Code | Descripción |
|---|---|---|
| `GSDC_INVALID_FIELD` | `22` | El campo especificado no es un campo conocido de `decisions.json`. |
| `GSDC_DECISIONS_LOCKED` | `23` | No se puede modificar `decisions.json` después de `confirm-decisions`. Usar `reset-confirmation` primero. |

---

## Verificación

1. `npm test` — todos los tests pasan (existentes + 15 nuevos).
2. En workspace temporal limpio: capturar `planId` desde `gsd-canva plan create --name "test" --json`, luego `gsd-canva plan questions --id $planId --json` → retorna esquema con `requiredPendingCount: 6`, `optionalPendingCount: 1`.
3. `gsd-canva plan answer --id $planId --field vertical --value "SaaS / Producto Digital"` → guarda correctamente, retorna `requiredPendingCount: 5`.
4. `gsd-canva plan questions --id 001 --json` → `requiredPendingCount` disminuye en 1.
5. Llenar los 6 campos requeridos → `requiredPendingCount === 0`, `optionalPendingCount === 1`.
6. `gsd-canva plan confirm-decisions --id 001` → pasa (solo requiere los 6, no `assets`).
7. Intentar `plan answer` después de confirmar → error `GSDC_DECISIONS_LOCKED` (exit 23).
8. `gsd-canva plan reset-confirmation --id 001` → desbloquea, `plan answer` funciona de nuevo.
9. Intentar `plan questions` en plan con estado `mockup:ready_for_html` → error `GSDC_INVALID_STATE` (exit 13).
10. Confirmar + resolver (estado `ready_for_html`), ejecutar `reset-confirmation` → estado vuelve a `questions_pending`, `plan answer` funciona.
11. Verificar que `canva-mockup.md` sección 2 ya no contiene instrucciones de escritura directa en `decisions.json`:
    ```bash
    rg "Pobla.*decisions\.json|escribe.*decisions\.json|actualiza decisions" templates/commands/canva-mockup.md
    ```
    Esperado: cero resultados (solo `plan answer` debe escribir).
12. Modificar `assets` después de confirmar → `resolve-questions` falla con hash mismatch (assets está en el payload).
13. Ejecutar `/canva-mockup test3` con un agente → el agente usa `plan questions`, renderiza, guarda con `plan answer`, presenta resumen, pide confirmación, solo entonces congelar.

---

## Notas

- Los `value` en el JSON son siempre texto final legible — lo que el usuario selecciona es lo que se guarda en `decisions.json`. No hay códigos internos.
- `assets` es opcional: no bloquea el Yield Gate pero se almacena si el usuario lo provee. `requiredPendingCount` y `optionalPendingCount` están separados para que el agente sepa cuándo puede avanzar.
- El fallback a chat numerado es first-class, no un afterthought. La UI nativa es opcional.
- `plan answer` escribe atómicamente y valida campo + estado + confirmación bloqueada — el agente nunca toca `decisions.json` directamente.
- La parada de revisión final es obligatoria antes de `confirm-decisions`: el usuario debe ver un resumen y confirmar explícitamente.
- `create()` inicializa `assets: ""` para que el campo exista siempre en `decisions.json`.
- `plan answer` rechaza escritura si `confirmation.confirmed === true` — protege el hash de integridad post-confirmación.
- `plan questions` falla con error si el plan no está en `mockup:questions_pending` — no hay silencio ante estado incorrecto.
- `reset-confirmation` es el único mecanismo para desbloquear — elimina la contradicción de "editar decisions.json directamente para resetear". Acepta `mockup:ready_for_html` y revierte a `questions_pending`.
- El helper compartido `getEmptyFields()` garantiza que `questions()`, `confirmDecisions()` y `resolveQuestions()` siempre coinciden en qué campos están vacíos.
- `plan answer` retorna `requiredPendingCount` y `optionalPendingCount` (no `remaining` genérico) — consistente con `questions()`.
- La sección 2 completa del template se reemplaza, no solo el roadblock — elimina todas las instrucciones de escritura directa en `decisions.json`. La sección 3 (wireframing) no se toca — se ejecuta después del yield gate.
- `answer()` y `resetConfirmation()` adquieren lock global **antes** de leer y validar — protege contra race conditions con comandos concurrentes.
- `assets` se incluye en el payload del hash criptográfico — cambios en assets post-confirmación son detectados.
- Si el usuario omite assets, se guarda `"Sin assets externos"` para que `optionalPendingCount` llegue a 0 y el agente no siga preguntando.
- `reset-confirmation` desde `ready_for_html` renombra `mockup.html` a `.stale` para invalidarlo — evita submit de HTML generado con decisiones viejas.
- Tests de contrato CLI via `child_process` validan stdout/stderr/exit code reales de los subcomandos.
- `getEmptyFields` se prueba indirectamente, no se exporta — `questions()` y `confirmDecisions()` son la API pública.
- Verificación captura `planId` dinámicamente desde `plan create --json` en workspace temporal limpio.
- Referencias a `mockup:pending` en `roadmap_progreso.md` y `README.md` se verifican y actualizan.
- `preguntas.md` template se actualiza para incluir campo `assets` opcional.
