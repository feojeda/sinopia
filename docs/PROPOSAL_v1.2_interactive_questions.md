# Plan: Preguntas Interactivas en `/canva-mockup`

**Fecha**: 2026-05-30
**Estado**: Pendiente de aprobación
**Dependencias**: v1.1 architectural fixes (Cambio 1-6) ya implementados

---

## Problema

Cuando el agente ejecuta `/canva-mockup test2`, detecta que faltan campos y responde con un bloque de texto plano con 7 preguntas numeradas. No hay estructura, no hay opciones predefinidas, y el agente improvisa las preguntas cada vez.

## Solución

Un nuevo comando CLI `gsd-canva plan questions` que genera un JSON estructurado con las preguntas, opciones y metadatos. El agente renderiza ese JSON con su UI nativa (si tiene) o como fallback en chat.

---

## Cambios

### 1. `lib/plan-manager.js` — Agregar función `questions(planId)`

Leer `decisions.json` del plan, filtrar campos vacíos/placeholders, y retornar:

```json
{
  "planId": "001",
  "totalFields": 6,
  "filledCount": 0,
  "pendingCount": 6,
  "filled": [],
  "pending": [
    {
      "id": "vertical",
      "question": "¿Qué tipo de diseño quieres crear?",
      "type": "choice",
      "options": [
        { "label": "SaaS / Producto Digital", "value": "saas" },
        { "label": "E-commerce / Retail", "value": "ecommerce" },
        { "label": "Evento / Workshop", "value": "evento" },
        { "label": "Restaurante / Alimentos", "value": "restaurante" },
        { "label": "Educación / Curso", "value": "educacion" },
        { "label": "Salud / Bienestar", "value": "salud" },
        { "label": "Inmobiliaria", "value": "inmobiliaria" },
        { "label": "Personal Brand / Portafolio", "value": "personal-brand" }
      ],
      "allowCustom": true,
      "required": true
    },
    {
      "id": "formato",
      "question": "¿Qué formato y dimensiones necesitas?",
      "type": "choice",
      "options": [
        { "label": "Instagram Post (1080x1080)", "value": "instagram-post-1080x1080" },
        { "label": "Instagram Story (1080x1920)", "value": "instagram-story-1080x1920" },
        { "label": "Facebook Post (1200x630)", "value": "facebook-post-1200x630" },
        { "label": "LinkedIn Banner (1584x396)", "value": "linkedin-banner-1584x396" },
        { "label": "YouTube Thumbnail (1280x720)", "value": "youtube-thumb-1280x720" },
        { "label": "A4 Flyer (2480x3508)", "value": "a4-flyer-2480x3508" },
        { "label": "Pinterest Pin (1000x1500)", "value": "pinterest-pin-1000x1500" }
      ],
      "allowCustom": true,
      "required": true
    },
    {
      "id": "audiencia",
      "question": "¿A qué público objetivo nos dirigimos?",
      "type": "text",
      "placeholder": "Ej: Desarrolladores jóvenes, Mujeres 25-40...",
      "required": true
    },
    {
      "id": "paleta",
      "question": "¿Qué colores o paleta cromática prefieres?",
      "type": "text",
      "placeholder": "Ej: Azul corporativo + blanco, Tonos tierra...",
      "required": true
    },
    {
      "id": "copy",
      "question": "¿Cuál será el texto principal o eslogan?",
      "type": "text",
      "placeholder": "Ej: '50% de descuento en toda la tienda'...",
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
    }
  ]
}
```

Campos de tipo `choice` tienen opciones predefinidas + `allowCustom`. Campos de tipo `text` tienen `placeholder`. Todos tienen `required`.

### 2. `bin/gsd-canva.js` — Agregar subcomando `plan questions`

```
gsd-canva plan questions --id <ID> --json
```

En modo `--json`: retorna el esquema arriba en stdout.
En modo humano: imprime preguntas numeradas con opciones.

### 3. `templates/commands/canva-mockup.md` — Agregar sección de preguntas interactivas

Reemplazar la sección "Parada Obligatoria" con instrucciones que digan:

```markdown
*   **Preguntas Interactivas Obligatorias**:
    *   Ejecuta el comando para obtener las preguntas estructuradas:
        ```bash
        gsd-canva plan questions --id <ID_DE_TRES_DÍGITOS> --json
        ```
    *   Renderiza cada pregunta usando tu **interfaz interactiva nativa** cuando esté disponible
        (herramientas de questions, choices, radio buttons, formularios, etc.).
    *   Si tu entorno NO ofrece interfaz interactiva, usa fallback en chat con preguntas numeradas.
    *   Para campos tipo `choice`: presenta las opciones al usuario + opción de escribir valor propio.
    *   Para campos tipo `text`: presenta el placeholder como guía.
    *   Cada respuesta del usuario debe escribirse **inmediatamente** en `decisions.json`.
    *   ⚠️ **PROHIBIDO** registrar respuestas tentativas o sugeridas en `decisions.json` sin confirmación del usuario.
    *   Después de completar todos los campos:
        - Ejecuta `gsd-canva plan confirm-decisions --id <ID>`.
        - Ejecuta `gsd-canva plan resolve-questions --id <ID>`.
    *   ⚠️ **DETÉN la ejecución** hasta que el usuario responda. No generes `mockup.html`.
```

### 4. `tests/plan.test.js` — Agregar test de `questions()`

- Test: plan nuevo con todos los campos vacíos → `pendingCount === 6`, `filledCount === 0`.
- Test: plan con algunos campos llenos → verificar que solo los vacíos aparecen en `pending`.

---

## Verificación

1. `npm test` — todos los tests pasan (existentes + nuevos).
2. `gsd-canva plan create --name "test" && gsd-canva plan questions --id 001 --json` → retorna esquema con 6 preguntas.
3. Llenar un campo en `decisions.json` y re-ejecutar → ese campo ya no aparece en `pending`.
4. Ejecutar `/canva-mockup test3` con un agente → el agente usa `plan questions` y renderiza con UI nativa.

---

## Notas

- Las opciones de `vertical`, `formato` y `cta` son sugerencias, no restricciones — `allowCustom: true` permite al usuario escribir cualquier valor.
- El JSON es generado por el CLI, no por el agente — reduce improvisación y hace las preguntas consistentes entre agentes.
- Limitación: el template puede pedir UI interactiva, pero solo funcionará si el agente/IDE realmente expone ese mecanismo. El fallback a chat numerado garantiza que funcione siempre.
