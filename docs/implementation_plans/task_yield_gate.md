# Lista de Tareas: Yield Gate Criptográfico y Transaccional (Fase 1 Mockup)

- `[x]` **Paso 1: Actualizar `plan-manager.js`**
  - `[x]` Cambiar estado inicial a `mockup:questions_pending`
  - `[x]` Implementar inicialización de `decisions.json` por defecto en `create`
  - `[x]` Implementar método `confirmDecisions(planId, options)` con hash SHA-256 canónico estricto (sensible a mayúsculas y NFC normalized)
  - `[x]` Implementar método `resolveQuestions(planId)` con validación de placeholders, confirmación y hash
  - `[x]` Implementar método `submitMockup(planId)` con validación de existencia de `mockup.html` y re-verificación de hash
  - `[x]` Adaptar transiciones de estado en `transitionState` para soportar las nuevas acciones

- `[x]` **Paso 2: Actualizar `bin/gsd-canva.js`**
  - `[x]` Registrar comando `plan confirm-decisions`
  - `[x]` Registrar comando `plan resolve-questions`
  - `[x]` Registrar comando `plan submit-mockup`
  - `[x]` Incorporar códigos de error `GSDC_QUESTIONS_UNRESOLVED` (19), `GSDC_ARTIFACT_MISSING` (20), y `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` (21)

- `[x]` **Paso 3: Actualizar Plantillas y Workflows**
  - `[x]` Actualizar `preguntas.md` con la estructura visual fija
  - `[x]` Modificar `canva-mockup.md` para plasmar el Yield Gate criptográfico con comandos `gsd-canva` globales

- `[x]` **Paso 4: Actualizar la Suite de Tests**
  - `[x]` Actualizar `tests/plan.test.js` para dar cobertura a la nueva máquina de estados de mockup
  - `[x]` Agregar tests específicos para detección de placeholders en `decisions.json`
  - `[x]` Agregar tests para detectar cambios no autorizados (`GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION`) antes y después de `resolve-questions`
  - `[x]` Agregar tests para `GSDC_ARTIFACT_MISSING` cuando falte `mockup.html`

- `[x]` **Paso 5: Ejecución y Validación de Tests**
  - `[x]` Correr `npm test` para asegurar que el 100% de los tests pasen exitosamente
