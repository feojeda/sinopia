# Propuesta de Mejora: Confirmación vía UI Interactiva

**Fecha**: 2026-05-30
**Estado**: Pendiente de aprobación
**Problema reportado por**: Usuario en prueba con Antigravity

---

## Problema

El agente de Antigravity dejó de usar preguntas interactivas (modales) a mitad del flujo de `/canva-mockup`. La causa son las instrucciones en `templates/agent-source/canva-mockup/instructions.md` sección 2.5:

> "La confirmación se parsea **únicamente** del último mensaje del usuario en el turno de aprobación final."

El agente interpretó esta regla como: "la confirmación debe ser por chat, entonces dejo de usar UI interactiva para todo". Esto invalida el propósito de tener UI interactiva en Antigravity.

Adicionalmente, la propuesta original `docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md` refuerza esta restricción en dos lugares:

- Línea 375: "Nunca confirmar sin una respuesta explicita que incluya `confirmo` o `confirmado`"
- Línea 376: "Confirmacion solo puede derivarse del ultimo mensaje del usuario en el paso final de aprobacion"

---

## Propuesta

Cambiar la regla de "confirmación solo por chat" a "confirmación por acción explícita del usuario, sea por UI interactiva o chat".

La preocupación original era que el agente confirmara por accidente. Ese riesgo se mitiga diciendo "acción explícita del usuario", sin restringir el canal.

---

## Archivos a modificar

### 1. `templates/agent-source/canva-mockup/instructions.md`

Sección 2.5, reemplazar:

```
- La confirmación se parsea **únicamente** del último mensaje del usuario en el turno de aprobación final.
```

Por:

```
- La confirmación debe ser una **acción explícita del usuario**. Puede ser por UI interactiva nativa (modal, botón) o por mensaje de chat, según lo que el entorno soporte. El agente no debe asumir confirmación por texto generado por sí mismo.
```

### 2. `docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md`

Líneas 375-376, reemplazar:

```
- Nunca confirmar sin una respuesta explicita que incluya `confirmo` o `confirmado` y no contenga negacion directa (`no confirmo`, `no lo confirmo`).
- Confirmacion solo puede derivarse del ultimo mensaje del usuario en el paso final de aprobacion. El agente no debe interpretar su propio texto como confirmacion.
```

Por:

```
- La confirmación debe ser una acción explícita del usuario, ya sea por UI interactiva nativa o por mensaje de chat. El agente no debe interpretar su propio texto como confirmación.
```

### 3. `tests/phase4-agent-source-interactive.test.js`

Línea 48-52, actualizar el test para que verifique la nueva regla en vez de buscar "último mensaje del usuario".

---

## No se modifica

- Código en `lib/plan-manager.js` — no hay cambios de backend
- Código en `bin/gsd-canva.js` — no hay cambios de CLI
- Tests de Phase 1, 2, 3, 5 — no dependen de esta regla
- Archivos en `.experiments/` — son artifacts de review, no operativos
- `templates/commands/canva-mockup.md` — es legacy, se mantiene como está

---

## Verificación

Después de implementar:

```bash
npm test
```

Los tests de Phase 4 deben pasar con la nueva regla.
