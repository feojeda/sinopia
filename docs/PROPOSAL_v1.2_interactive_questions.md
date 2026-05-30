# Plan: Preguntas Interactivas en `/canva-mockup` (Rev. 2)

**Fecha**: 2026-05-30
**Estado**: Pendiente de aprobación
**Dependencias**: v1.1 architectural fixes (commit `7d571b6`) commiteado y verificado

---

## Problema

Cuando el agente ejecuta `/canva-mockup test2`, detecta que faltan campos y responde con un bloque de texto plano con 7 preguntas numeradas. No hay estructura, no hay opciones predefinidas, y el agente improvisa las preguntas cada vez.

## Solución

Dos nuevos comandos CLI:
1. `gsd-canva plan questions` — genera JSON estructurado con preguntas y opciones
2. `gsd-canva plan answer` — escribe respuestas individualmente con validación atómica

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

### 1. `lib/plan-manager.js` — Agregar función `questions(planId)`

Leer `decisions.json` del plan, filtrar campos vacíos/placeholders, y retornar:

```json
{
  "planId": "001",
  "planState": "mockup:questions_pending",
  "totalFields": 7,
  "filledCount": 0,
  "pendingCount": 7,
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
- Plan no está en `mockup:questions_pending` → retorna `pendingCount: 0` con warning
- Todos los campos ya llenos → retorna `pendingCount: 0`, `filled` con los valores actuales

### 2. `lib/plan-manager.js` — Agregar función `answer(planId, field, value)`

Escribe una respuesta individual en `decisions.json` con validación:

```bash
gsd-canva plan answer --id 001 --field vertical --value "SaaS / Producto Digital"
```

Comportamiento:
- Valida que el `field` sea uno de los campos conocidos (`vertical`, `formato`, `audiencia`, `paleta`, `copy`, `cta`, `assets`)
- Valida que el plan exista y esté en estado `mockup:questions_pending`
- Escribe atómicamente (`.tmp` + rename) el valor en `decisions.json`
- No valida placeholders ni completitud — eso lo hace `confirm-decisions`
- Retorna el estado actualizado del campo

```json
{
  "ok": true,
  "data": {
    "planId": "001",
    "field": "vertical",
    "value": "SaaS / Producto Digital",
    "remaining": 5
  }
}
```

Errores:
- `field` no reconocido → `GSDC_INVALID_FIELD` (exit 22)
- Plan no existe → `GSDC_JSON_PARSE_ERROR` (exit 15)
- Estado incorrecto → `GSDC_INVALID_STATE` (exit 13)

### 3. `bin/gsd-canva.js` — Agregar subcomandos

```
gsd-canva plan questions --id <ID> [--json]
gsd-canva plan answer --id <ID> --field <campo> --value <valor> [--json]
```

En modo `--json`: retorna JSON en stdout.
En modo humano: imprime preguntas numeradas con opciones / confirmación de respuesta guardada.

### 4. `templates/commands/canva-mockup.md` — Reemplazar sección "Parada Obligatoria"

Texto completo que reemplaza la subsección "Parada Obligatoria (Roadblock)" dentro de la sección 2:

```markdown
*   **Preguntas Interactivas Obligatorias**:
    *   Ejecuta el comando para obtener las preguntas estructuradas:
        ```bash
        gsd-canva plan questions --id <ID_DE_TRES_DÍGITOS> --json
        ```
    *   **Renderizado de preguntas (first-class: chat numerado)**:
        *   Presenta cada pregunta pendiente al usuario de forma clara y numerada.
        *   Para campos tipo `choice`: muestra las opciones numeradas + opción "Otro" para valor personalizado.
        *   Para campos tipo `text`: muestra el placeholder como guía.
        *   Espera la respuesta del usuario antes de pasar a la siguiente pregunta.
    *   **Si tu entorno ofrece UI interactiva nativa** (herramientas de questions, choices, formularios):
        *   Puedes usarla como alternativa al chat numerado para mejorar la experiencia.
        *   Pero el flujo y las preguntas deben venir del JSON de `plan questions`, no improvisadas.
    *   **Guardado de respuestas**:
        *   Por cada respuesta del usuario, ejecuta:
            ```bash
            gsd-canva plan answer --id <ID_DE_TRES_DÍGITOS> --field <campo> --value "<respuesta>"
            ```
        *   ⚠️ **PROHIBIDO** escribir directamente en `decisions.json` sin usar el comando `plan answer`.
        *   ⚠️ **PROHIBIDO** registrar respuestas tentativas o sugeridas sin confirmación del usuario.
*   **Revisión Final y Confirmación Explícita (OBLIGATORIO antes de congelar)**:
    1. Presenta un resumen completo de todas las respuestas registradas.
    2. Destaca qué es dato confirmado vs qué es sugerencia tentativa (si hubo alguna).
    3. Pide confirmación explícita al usuario: "¿Estás de acuerdo con estas decisiones?".
    4. ⚠️ **DETÉN la ejecución** hasta que el usuario confirme explícitamente.
    5. Solo después de confirmación explícita del usuario:
        - Ejecuta `gsd-canva plan confirm-decisions --id <ID_DE_TRES_DÍGITOS>`.
        - Ejecuta `gsd-canva plan resolve-questions --id <ID_DE_TRES_DÍGITOS>`.
    6. ⚠️ **PROHIBIDO** ejecutar `confirm-decisions` o `resolve-questions` sin confirmación explícita del usuario.
    7. ⚠️ **PROHIBIDO** generar `mockup.html` o ejecutar comandos de transición de forma autónoma.
```

### 5. `templates/commands/canva-mockup.md` — Campo `assets` fuera del Yield Gate

El campo `assets` (índice 7) tiene `required: false`. Esto significa:
- `confirm-decisions` NO lo requiere para pasar — no aparece en la lista de `missing`.
- El agente puede preguntarlo pero no debe bloquear si el usuario no lo llena.
- Si el usuario lo provee, se guarda via `plan answer` como cualquier otro campo.

**Requiere cambio en `lib/plan-manager.js`**: La función `confirmDecisions()` actualmente valida los 6 campos fijos (`vertical`, `audiencia`, `formato`, `paleta`, `copy`, `cta`). `assets` debe quedar excluido de esa validación. No requiere cambio — ya no está en la lista.

### 6. `tests/plan.test.js` — Agregar tests

- **Test questions vacío**: plan nuevo → `pendingCount === 7`, `filledCount === 0`, primer campo tiene `id === "vertical"`.
- **Test questions parcial**: llenar 2 campos con `plan answer` → `pendingCount === 5`, campos llenos aparecen en `filled`.
- **Test questions completo**: llenar los 6 campos requeridos → `pendingCount === 1` (solo `assets` queda), todos los requeridos en `filled`.
- **Test answer campo inválido**: `--field noexiste` → error `GSDC_INVALID_FIELD` (exit 22).
- **Test answer estado incorrecto**: plan en `mockup:ready_for_html` → error `GSDC_INVALID_STATE` (exit 13).

---

## Tabla de errores nuevos

| Código | Exit Code | Descripción |
|---|---|---|
| `GSDC_INVALID_FIELD` | `22` | El campo especificado no es un campo conocido de `decisions.json`. |

---

## Verificación

1. `npm test` — todos los tests pasan (existentes + 5 nuevos).
2. `gsd-canva plan create --name "test" && gsd-canva plan questions --id 001 --json` → retorna esquema con 7 preguntas.
3. `gsd-canva plan answer --id 001 --field vertical --value "SaaS / Producto Digital"` → guarda correctamente.
4. `gsd-canva plan questions --id 001 --json` → `pendingCount` disminuye en 1.
5. Llenar los 6 campos requeridos → `pendingCount === 1` (solo `assets`).
6. `gsd-canva plan confirm-decisions --id 001` → pasa (solo requiere los 6, no `assets`).
7. Ejecutar `/canva-mockup test3` con un agente → el agente usa `plan questions`, renderiza, guarda con `plan answer`, presenta resumen, pide confirmación, solo entonces congelar.

---

## Notas

- Los `value` en el JSON son siempre texto final legible — lo que el usuario selecciona es lo que se guarda en `decisions.json`. No hay códigos internos.
- `assets` es opcional: no bloquea el Yield Gate pero se almacena si el usuario lo provee.
- El fallback a chat numerado es first-class, no un afterthought. La UI nativa es opcional.
- `plan answer` escribe atómicamente y valida campo + estado — el agente nunca toca `decisions.json` directamente.
- La parada de revisión final es obligatoria antes de `confirm-decisions`: el usuario debe ver un resumen y confirmar explícitamente.
