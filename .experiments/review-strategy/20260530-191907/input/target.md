# Plan: Interactive Questions for Agent Adapters (v1.4)

**Fecha**: 2026-05-30  
**Estado**: Draft pendiente de review/aprobacion  
**Supersedes**: `docs/PROPOSAL_v1.2_antigravity_questions.md` como guia activa  
**Depends on**: v1.3 agent adapters, manifest v2, and legacy deprecation docs  

---

## Objetivo

Implementar el flujo de preguntas interactivas de `/canva-mockup` sobre la arquitectura actual de `gsd-canva`, donde:

- Agent skills/commands are the operational frontend.
- `gsd-canva` CLI is the deterministic backend.
- `canva-plans/` is the auditable state.

El plan v1.2 sigue siendo util como fuente historica de reglas funcionales, pero no como guia directa de implementacion. La implementacion nueva debe operar desde `templates/agent-source/` y renderizarse mediante adapters a:

| Agent | Output | Status |
|---|---|---|
| Antigravity 2.0 | `.agents/skills/<id>/SKILL.md` | Primary |
| Codex | `.codex/commands/<id>.md` | Supported |
| OpenCode | `.opencode/commands/<id>.md` | Experimental until format is verified |
| Antigravity legacy | `.antigravity/commands/<id>.md` | Deprecated compatibility only |

---

## Problema

El comando `/canva-mockup` todavia depende de instrucciones que piden al agente recopilar campos faltantes en texto libre y luego escribir `decisions.json` directamente. Eso tiene cuatro problemas:

- El agente improvisa preguntas y opciones.
- No existe una interfaz CLI estructurada para responder campos uno por uno.
- La confirmacion criptografica puede ocurrir sin distinguir claramente campos requeridos, opcionales y declinados.
- Las instrucciones nuevas deben llegar a Antigravity, Codex y OpenCode desde la fuente neutral de capabilities, no desde templates legacy.

---

## Solucion

Agregar una API CLI de preguntas estructuradas y actualizar la capability neutral `canva-mockup` para que todos los adapters hereden el mismo flujo.

Nuevos comandos:

```bash
gsd-canva plan questions --id <ID> [--json]
gsd-canva plan answer --id <ID> --field <campo> --value <valor> [--json]
gsd-canva plan reset-confirmation --id <ID> [--json]
```

Regla central:

> El agente nunca escribe directamente en `decisions.json`. Toda respuesta entra por `gsd-canva plan answer`, y toda confirmacion entra por `gsd-canva plan confirm-decisions`.

---

## Alcance

Implementar:

- `FIELD_REGISTRY` como fuente unica de campos, preguntas, opciones y metadatos.
- `questions()`, `answer()` y `resetConfirmation()` en `lib/plan-manager.js`.
- Comandos CLI correspondientes en `bin/gsd-canva.js`.
- Migracion segura de `decisions.json` existentes hacia el nuevo shape.
- Actualizacion de `templates/agent-source/canva-mockup/instructions.md`.
- Render correcto para Antigravity, Codex y OpenCode via adapters existentes.
- Tests de unidad/flujo para CLI, state machine, hash, locks, errores y adapters.
- Documentacion de usuario en `README.md` si cambia la superficie publica.

No implementar:

- Nuevos adapters.
- Cambios de manifest v2 no relacionados con esta capability.
- Eliminacion de `.antigravity/commands/`.
- Dependencia hardcoded de Antigravity dentro de `lib/plan-manager.js`.

---

## Modelo De Campos

Agregar en `lib/plan-manager.js` una fuente de verdad exportable/testeable:

```js
const FIELD_REGISTRY = [
  {
    id: 'vertical',
    question: '¿Qué tipo de diseño quieres crear?',
    type: 'choice',
    required: true,
    allowCustom: true,
    options: [
      { label: 'SaaS / Producto Digital', value: 'SaaS / Producto Digital' },
      { label: 'E-Commerce / Retail', value: 'E-Commerce / Retail' },
      { label: 'Evento / Workshop', value: 'Evento / Workshop' },
      { label: 'Restaurante / Alimentos', value: 'Restaurante / Alimentos' },
      { label: 'Educación / Curso', value: 'Educación / Curso' },
      { label: 'Salud / Bienestar', value: 'Salud / Bienestar' },
      { label: 'Inmobiliaria', value: 'Inmobiliaria' },
      { label: 'Personal Brand / Portafolio', value: 'Personal Brand / Portafolio' }
    ]
  },
  {
    id: 'formato',
    question: '¿Qué formato y dimensiones necesitas?',
    type: 'choice',
    required: true,
    allowCustom: true,
    options: [
      { label: 'Instagram Post (1080x1080)', value: 'Instagram Post (1080x1080)' },
      { label: 'Instagram Story (1080x1920)', value: 'Instagram Story (1080x1920)' },
      { label: 'Facebook Post (1200x630)', value: 'Facebook Post (1200x630)' },
      { label: 'LinkedIn Banner (1584x396)', value: 'LinkedIn Banner (1584x396)' },
      { label: 'YouTube Thumbnail (1280x720)', value: 'YouTube Thumbnail (1280x720)' },
      { label: 'A4 Flyer (2480x3508)', value: 'A4 Flyer (2480x3508)' },
      { label: 'Pinterest Pin (1000x1500)', value: 'Pinterest Pin (1000x1500)' }
    ]
  },
  {
    id: 'audiencia',
    question: '¿A qué público objetivo nos dirigimos?',
    type: 'text',
    required: true,
    placeholder: 'Ej: Desarrolladores jóvenes, Mujeres 25-40, Profesionales creativos...'
  },
  {
    id: 'paleta',
    question: '¿Qué colores o paleta cromática prefieres?',
    type: 'text',
    required: true,
    placeholder: 'Ej: Azul corporativo + blanco, Tonos tierra, Neón oscuro...'
  },
  {
    id: 'copy',
    question: '¿Cuál será el texto principal o eslogan?',
    type: 'text',
    required: true,
    placeholder: "Ej: '50% de descuento', 'Lanzamiento oficial 2026'..."
  },
  {
    id: 'cta',
    question: '¿Qué texto llevará el botón de acción?',
    type: 'choice',
    required: true,
    allowCustom: true,
    options: [
      { label: 'Comprar Ahora', value: 'Comprar Ahora' },
      { label: 'Registrarse Gratis', value: 'Registrarse Gratis' },
      { label: 'Saber Más', value: 'Saber Más' },
      { label: 'Reservar Cupo', value: 'Reservar Cupo' },
      { label: 'Descargar', value: 'Descargar' },
      { label: 'Ver Colección', value: 'Ver Colección' }
    ]
  },
  {
    id: 'assets',
    question: '¿Hay tipografías específicas, logos o recursos visuales externos?',
    type: 'text',
    required: false,
    placeholder: 'Ej: Logo en PNG, fuente Montserrat, imagen de fondo...'
  }
];

const REQUIRED_FIELDS = FIELD_REGISTRY.filter(f => f.required).map(f => f.id);
const OPTIONAL_FIELDS = FIELD_REGISTRY.filter(f => !f.required).map(f => f.id);
const ALL_FIELDS = FIELD_REGISTRY.map(f => f.id);
```

`FIELD_REGISTRY` reemplaza arrays hardcodeados de campos en `confirmDecisions()`, `resolveQuestions()` y `submitMockup()`.

---

## Shape De Decisions

`plan create` debe inicializar:

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

Agregar `ensureQuestionFields(decisions)`:

- Agrega `assets` si falta.
- Agrega `optionalAnswered` si falta.
- Completa `confirmation` sin sobrescribir valores existentes.
- Se ejecuta al inicio de toda funcion que lee `decisions.json`: `status`, `questions`, `answer`, `resetConfirmation`, `confirmDecisions`, `resolveQuestions`, `submitMockup`.
- `questions()` y `status()` no persisten la migracion; la primera mutacion si la persiste.

---

## API: plan questions

`gsd-canva plan questions --id <ID> --json` retorna datos crudos envueltos por `handleSuccess()`:

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
  "pending": []
}
```

`pending` contiene objetos derivados de `FIELD_REGISTRY`:

```json
{
  "id": "vertical",
  "question": "¿Qué tipo de diseño quieres crear?",
  "type": "choice",
  "required": true,
  "allowCustom": true,
  "options": [
    { "label": "SaaS / Producto Digital", "value": "SaaS / Producto Digital" }
  ]
}
```

Estados:

- `mockup:questions_pending` + `confirmed === false`: editable, `suggestedAction: "ask_questions"`.
- `mockup:questions_pending` + `confirmed === true`: read-only, `suggestedAction: "retry_resolve"`.
- Estados posteriores: read-only, `suggestedAction: "suggest_reset"` o `"suggest_new_plan"` segun aplique.
- `questions()` no debe lanzar `GSDC_INVALID_STATE`; devuelve diagnostico read-only.

Contadores:

- `requiredFieldsComplete`: true si no quedan requeridos pendientes.
- `allQuestionsAddressed`: true si requeridos completos y opcionales preguntados/declinados.
- `optionalAnsweredStatus.assets`: distingue "declinado" de "nunca preguntado".

---

## API: plan answer

`gsd-canva plan answer --id <ID> --field <campo> --value <valor> --json`

Orden de validacion:

1. Acquire lock.
2. Leer `plan.json` y `decisions.json`.
3. Validar `field in ALL_FIELDS`.
4. Validar estado editable `mockup:questions_pending`.
5. Ejecutar `ensureQuestionFields()`.
6. Validar `confirmation.confirmed !== true`.
7. Validar choice value.
8. Escribir `decisions.json` atomico.
9. Release lock en `finally`.

Reglas:

- Choice value numerico puro, como `"3"`: error `GSDC_INVALID_CHOICE_VALUE`, `reason: "numeric_value"`.
- Choice value exacto case-insensitive de una opcion: guardar valor canonico.
- Choice custom permitido solo si `allowCustom === true`.
- Placeholder exacto (`TODO`, `TBD`, `N/A`, `PENDIENTE`, `POR DEFINIR`) o bracket-wrapped (`[pendiente]`): error `reason: "placeholder_value"`.
- Requerido vacio: guardar pero retornar `warning: "empty_value_for_required_field"` para obligar re-pregunta.
- Opcional vacio: guardar `""` y marcar `optionalAnswered.assets = true`.
- `optionalAnswered` nunca cuenta para campos requeridos.

Respuesta debe incluir contadores actualizados y flags `requiredFieldsComplete` / `allQuestionsAddressed`.

---

## API: reset-confirmation

`gsd-canva plan reset-confirmation --id <ID> --json`

Uso:

- Permite corregir decisiones despues de confirmacion.
- Si existe `mockup.html`, renombrar a `mockup.html.stale.<timestamp>` o reportar `staleRenameFailed: true` si no se pudo.
- Limpia confirmacion y hash.
- Limpia valores opcionales y `optionalAnswered`.
- Preserva campos requeridos.
- Vuelve a `mockup:questions_pending` si estaba en `ready_for_html` o `pending_approval`.
- Es idempotente para crash recovery.

No permitir reset desde estados finales aprobados si eso rompe la maquina de estados; retornar `GSDC_INVALID_STATE`.

---

## Hash Y Confirmacion

Agregar hash v2 con 7 campos:

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

Reglas:

- `confirmDecisions()` siempre escribe `hashAlgorithm: "sha256-decisions-v2"`.
- `resolveQuestions()` y `submitMockup()` verifican segun `hashAlgorithm` almacenado.
- `sha256-decisions-v1` sigue siendo valido para planes legacy ya confirmados.
- Valor vacio o undefined se trata como v2.
- Version futura desconocida que empiece con `sha256-decisions-`: error `GSDC_INVALID_STATE` con `reason: "unknown_hash_version"`.
- `confirmDecisions()` falla con `GSDC_QUESTIONS_UNRESOLVED` si falta algun requerido.
- Si opcionales no fueron preguntados, `confirmDecisions()` puede pasar pero retorna `warning: "optional_fields_not_addressed"`.

---

## Agent-Source Y Adapters

Actualizar solo la fuente neutral:

```text
templates/agent-source/canva-mockup/instructions.md
```

No editar directamente los outputs generados:

```text
.agents/skills/*
.codex/commands/*
.opencode/commands/*
```

El instalador/renderers deben propagar la nueva instruccion a cada agente mediante `init`, `upgrade`, `--adopt` y `--force-all` segun las reglas de v1.3/v1.4.

### Reglas comunes para todos los agentes

- Ejecutar `gsd-canva plan questions --id <ID> --json`.
- Usar una interfaz interactiva nativa si el agente dispone de ella.
- Si no hay UI interactiva, hacer fallback textual estructurado.
- Guardar cada respuesta con `gsd-canva plan answer`.
- Nunca escribir `decisions.json` directamente.
- Nunca confirmar sin una respuesta explicita que incluya `confirmo` o `confirmado` y no contenga negacion directa (`no confirmo`, `no lo confirmo`).

### Antigravity 2.0

En el skill renderizado a `.agents/skills/canva-mockup/SKILL.md`, instruir:

- Usar la interfaz nativa de preguntas interactivas del entorno cuando este disponible.
- Para choice fields: presentar las opciones de `plan questions`.
- No agregar manualmente "Otro" u "Opcion personalizada"; usar el texto libre nativo del entorno si existe.
- Si el entorno no expone la UI interactiva, usar fallback textual.

No referirse a `.antigravity/commands/` como superficie primaria.

### Codex

En `.codex/commands/canva-mockup.md`, instruir:

- Si el entorno provee preguntas interactivas, usarlas.
- En un entorno sin esa herramienta, renderizar preguntas en texto estructurado, una por turno cuando sea necesario.
- Convertir indices numericos a valores de opcion antes de llamar `plan answer`.

### OpenCode

En `.opencode/commands/canva-mockup.md`, instruir lo mismo que Codex y mantener el status experimental hasta validar el formato exacto.

---

## CLI Errores Nuevos

Agregar al catalogo:

| Codigo | Exit | Descripcion |
|---|---:|---|
| `GSDC_INVALID_FIELD` | 22 | Campo no reconocido. |
| `GSDC_DECISIONS_LOCKED` | 23 | Decisiones confirmadas; usar reset-confirmation. |
| `GSDC_PLAN_NOT_FOUND` | 24 | Directorio del plan no existe. |
| `GSDC_PLAN_ARTIFACT_MISSING` | 25 | Falta archivo requerido dentro del plan. |
| `GSDC_INVALID_CHOICE_VALUE` | 26 | Valor invalido para campo choice. |
| `GSDC_STALE_MOCKUP` | 27 | `mockup.html` predates confirmation; regenerar. |

Mantener:

- `GSDC_QUESTIONS_UNRESOLVED` para confirmacion con requeridos pendientes.
- `GSDC_ARTIFACT_MISSING` o migrar a `GSDC_MOCKUP_MISSING` solo si se hace de forma consistente en codigo, tests y docs.

Evitar cambios masivos de codigos si no son necesarios para entregar preguntas interactivas. Si se renombra un codigo, debe ser un sub-plan explicito.

---

## Cambios En Templates De Plan

Actualizar `templates/plan-templates/preguntas.md` para incluir `assets` y reflejar que `decisions.json` es la fuente de verdad.

Actualizar cualquier template que liste campos requeridos hardcodeados.

---

## Tests Requeridos

Agregar tests en `tests/plan.test.js` o archivo dedicado.

### FIELD_REGISTRY

- Todos los ids de `FIELD_REGISTRY` son aceptados por `answer()`.
- `questions().pending` deriva de registry.
- No hay opcion manual "Otro" en choice fields.
- `REQUIRED_FIELDS`, `OPTIONAL_FIELDS`, `ALL_FIELDS` consistentes.

### questions()

- Plan nuevo: `requiredPendingCount === 6`, `optionalPendingCount === 1`.
- Parcial: filled/pending correctos.
- Requeridos completos + assets no preguntado: `requiredFieldsComplete === true`, `allQuestionsAddressed === false`.
- Assets declinado con `answer --field assets --value ""`: `allQuestionsAddressed === true`.
- Confirmado en `questions_pending`: read-only + `suggestedAction: "retry_resolve"`.
- Estado posterior: read-only.
- No persiste migracion read-only.
- Libera lock en errores.

### answer()

- Campo invalido: exit 22.
- Estado incorrecto: exit 13.
- Confirmado: exit 23.
- Choice numerico: exit 26 `numeric_value`.
- Choice custom permitido si `allowCustom`.
- Choice no permitido si `allowCustom === false`.
- Placeholder exacto rechazado.
- `"TODO: definir colores"` no es placeholder exacto.
- Requerido vacio retorna warning.
- Opcional vacio marca `optionalAnswered`.

### reset-confirmation

- Limpia confirmation/hash.
- Preserva requeridos.
- Limpia opcionales.
- Renombra mockup stale.
- Es idempotente.
- Crash recovery basico.

### Hash

- Plan nuevo confirma con `sha256-decisions-v2`.
- Fixture v1 confirmado verifica con 6 campos.
- Re-confirmacion sin cambios es idempotente.
- Modificacion post-confirmacion falla.
- Unknown hash version falla con `reason: "unknown_hash_version"`.

### Adapter/source

- `templates/agent-source/canva-mockup/instructions.md` contiene `plan questions`, `plan answer`, `reset-confirmation`.
- Render Antigravity conserva instrucciones en `SKILL.md`.
- Render Codex/OpenCode conserva instrucciones.
- Legacy `.antigravity/commands/` no es la superficie primaria documentada.

### CLI

- `plan questions --json` retorna `{ ok: true, data: ... }`.
- `plan answer --json` no double-wrap.
- `plan reset-confirmation --json` no double-wrap.
- `handleError` conserva `err.exitCode`.

---

## Verificacion

Ejecutar:

```bash
npm test
rg "plan questions|plan answer|reset-confirmation" templates/agent-source README.md docs/
rg "decisions\\.json" templates/agent-source/canva-mockup/instructions.md
rg "\\.antigravity/commands" templates/agent-source README.md docs/
```

Esperado:

- Las instrucciones activas de `canva-mockup` mencionan la API nueva.
- Las instrucciones activas prohiben escribir directamente `decisions.json`.
- `.agents/skills` sigue siendo Antigravity 2.0 primary.
- `.antigravity/commands` aparece solo como legacy/deprecated o en docs historicos.

---

## Migracion Y Compatibilidad

- Planes existentes sin `assets`, `optionalAnswered` o `confirmation.hashAlgorithm` deben seguir abriendo.
- `questions()` debe ser seguro para inspeccion de planes legacy.
- La primera mutacion (`answer`, `reset-confirmation`, `confirm-decisions`) persiste el shape nuevo.
- Manifest v2 no necesita migracion adicional para esta fase.
- `upgrade` debe regenerar artifacts de adapters instalados con la nueva instruction source.

---

## Riesgos

### Riesgo 1: Dependencia de UI interactiva especifica

Mitigacion: las instrucciones hablan de "usar UI interactiva nativa si existe" y definen fallback textual. Solo la seccion Antigravity menciona su comportamiento especifico.

### Riesgo 2: Cambios de errores demasiado amplios

Mitigacion: limitar nuevos codigos a lo necesario. Cualquier rename global debe tener tests y documentacion.

### Riesgo 3: Agente guarda inferencias no confirmadas

Mitigacion: `plan answer` solo se usa para datos explicitos del usuario. Las sugerencias del agente se etiquetan como tentativas y no se guardan sin consentimiento.

### Riesgo 4: Confirmacion salta assets

Mitigacion: `requiredFieldsComplete` no equivale a permiso para confirmar. El agente debe preguntar/declinar opcionales antes del resumen final.

---

## Criterios De Aceptacion

- `/canva-mockup` ya no solicita 7 preguntas improvisadas en texto plano cuando el entorno soporta UI interactiva.
- El CLI expone preguntas estructuradas y acepta respuestas atomicas.
- El agente no edita `decisions.json` directamente.
- Antigravity 2.0 recibe el flujo desde `.agents/skills`.
- Codex y OpenCode reciben instrucciones equivalentes desde adapters.
- Planes legacy siguen funcionando.
- Tests cubren estado, hashes, errores, adapters y CLI JSON.
- `npm test` pasa.

