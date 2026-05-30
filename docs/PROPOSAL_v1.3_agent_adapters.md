# Plan: Agent Adapters para Antigravity 2.0, Codex y OpenCode (v1.3)

**Fecha**: 2026-05-30  
**Estado**: Pendiente de aprobación  
**Objetivo**: Hacer que `gsd-canva` instale la interfaz del agente en formatos compatibles con distintos runtimes, especialmente Antigravity 2.0, sin duplicar la lógica operativa de los comandos.

---

## Problema

`gsd-canva` fue diseñado para copiar comandos markdown a `.antigravity/commands/`. Ese modelo parece corresponder al flujo legacy de Antigravity/Gemini CLI, pero el objetivo actual del proyecto es operar dentro de Antigravity 2.0.

En Antigravity 2.0, la interfaz correcta para capacidades invocables por el agente debe tratarse como **workspace skills** bajo `.agents/skills/<skill>/SKILL.md`. Por lo tanto, seguir instalando solo `.antigravity/commands/*.md` puede producir una instalación aparentemente exitosa, pero no necesariamente comandos descubiertos o invocables por el agente.

Además, queremos que el framework sea portable a otros agentes:

- Antigravity 2.0: skills en `.agents/skills/`
- Codex: comandos o skills locales en `.codex/`
- OpenCode: comandos en `.opencode/commands/`

El riesgo principal es intentar mantener un único formato markdown para todos los agentes. Eso crea acoplamiento accidental y obliga al framework a depender del mínimo común denominador.

---

## Solución

Separar el sistema en dos capas:

1. **Fuente neutral de capacidades**: una representación propia de `gsd-canva`, independiente del agente.
2. **Adapters por agente**: renderizadores que convierten la fuente neutral al formato esperado por Antigravity, Codex, OpenCode u otros.

El CLI `gsd-canva` sigue siendo el backend determinista: estado, locks, manifest, hashes, verificación física y transiciones.

Los artifacts del agente son solo la interfaz operativa: instrucciones que le dicen al agente cómo usar el CLI y las herramientas del entorno.

---

## Arquitectura Propuesta

### Fuente neutral

Agregar:

```text
templates/agent-source/
  canva-mockup/
    capability.json
    instructions.md
  canva-draft/
    capability.json
    instructions.md
  canva-refine/
    capability.json
    instructions.md
  canva-deliver/
    capability.json
    instructions.md
```

`capability.json` define metadata común:

```json
{
  "id": "canva-mockup",
  "title": "Canva Mockup",
  "invocation": "/canva-mockup <nombre_diseño>",
  "description": "Create the mockup phase using the gsd-canva lifecycle.",
  "triggers": ["/canva-mockup"],
  "category": "gsd-canva",
  "supportedAgents": ["antigravity", "codex", "opencode"]
}
```

`instructions.md` contiene el flujo operativo común de la fase.

### Adapters

Agregar:

```text
lib/agent-adapters/
  index.js
  antigravity-skill.js
  codex-command.js
  opencode-command.js
```

Cada adapter expone:

```js
{
  id: 'antigravity',
  targetType: 'skill',
  getTargets(capability),
  render(capability, instructions)
}
```

Tabla inicial:

```js
const AGENT_ADAPTERS = {
  antigravity: {
    targetType: 'skill',
    targetRoot: '.agents/skills',
    renderer: renderAntigravitySkill
  },
  codex: {
    targetType: 'command',
    targetRoot: '.codex/commands',
    renderer: renderCodexCommand
  },
  opencode: {
    targetType: 'command',
    targetRoot: '.opencode/commands',
    renderer: renderOpenCodeCommand
  }
};
```

---

## Render Targets

### Antigravity 2.0

Renderizar a:

```text
.agents/skills/canva-mockup/SKILL.md
.agents/skills/canva-draft/SKILL.md
.agents/skills/canva-refine/SKILL.md
.agents/skills/canva-deliver/SKILL.md
```

Formato:

```md
---
name: canva-mockup
description: Use when the user invokes /canva-mockup or asks to create a Canva mockup with the gsd-canva lifecycle.
---

# Canva Mockup

<instructions.md renderizado>
```

Reglas:

- `name` debe coincidir con el ID estable de la capacidad.
- `description` debe mencionar triggers y uso.
- El cuerpo debe conservar las reglas operativas del flujo.
- No instalar estos skills en `templates/commands/`.

### Codex

Renderizar a:

```text
.codex/commands/canva-mockup.md
.codex/commands/canva-draft.md
.codex/commands/canva-refine.md
.codex/commands/canva-deliver.md
```

Formato:

```md
# Slash Command: /canva-mockup <nombre_diseño>

<instructions.md renderizado>
```

### OpenCode

Renderizar a:

```text
.opencode/commands/canva-mockup.md
.opencode/commands/canva-draft.md
.opencode/commands/canva-refine.md
.opencode/commands/canva-deliver.md
```

Formato inicial:

```md
---
description: Create the mockup phase using the gsd-canva lifecycle.
---

# /canva-mockup <nombre_diseño>

<instructions.md renderizado>
```

La forma exacta debe verificarse contra la documentación vigente de OpenCode antes de implementar.

---

## Cambios

### 1. Nueva fuente neutral de capacidades

Crear `templates/agent-source/*` y mover ahí el contenido operativo actual de:

- `templates/commands/canva-mockup.md`
- `templates/commands/canva-draft.md`
- `templates/commands/canva-refine.md`
- `templates/commands/canva-deliver.md`

No eliminar todavía `templates/commands/`; mantenerlo como compatibilidad legacy durante la transición.

### 2. Adapter Antigravity 2.0

Implementar renderer que genere `SKILL.md` con frontmatter YAML.

Precondiciones:

- `capability.id` es slug estable.
- `capability.description` existe.
- `instructions.md` no está vacío.

Salida:

```text
.agents/skills/<id>/SKILL.md
```

### 3. Adapter Codex

Implementar renderer que genere comandos markdown para `.codex/commands/`.

Salida:

```text
.codex/commands/<id>.md
```

### 4. Adapter OpenCode

Implementar renderer inicial para `.opencode/commands/`.

Salida:

```text
.opencode/commands/<id>.md
```

Antes de marcarlo estable, verificar el formato exacto esperado por OpenCode.

### 5. CLI `init`

Extender:

```bash
gsd-canva init --agent antigravity
gsd-canva init --agent codex
gsd-canva init --agent opencode
gsd-canva init --agent all
```

Semántica:

- `--agent antigravity`: instala skills Antigravity 2.0.
- `--agent codex`: instala comandos Codex.
- `--agent opencode`: instala comandos OpenCode.
- `--agent all`: instala todos los adapters soportados.
- Sin `--agent`: mantener comportamiento actual por compatibilidad, pero emitir advertencia si el target parece Antigravity 2.0 y solo se instalan comandos legacy.

### 6. CLI `upgrade`

`upgrade()` debe:

- Regenerar artifacts por adapter registrado en manifest.
- Respetar conflictos locales por archivo.
- No sobrescribir archivos no gestionados.
- Crear backups de artifacts modificados antes de reemplazar.

### 7. CLI `doctor`

Extender:

```bash
gsd-canva doctor --agent antigravity
gsd-canva doctor --agent codex
gsd-canva doctor --agent opencode
gsd-canva doctor --agent all
```

Validaciones por agente:

Antigravity:

- Existe `.agents/skills/`.
- Cada skill oficial tiene `SKILL.md`.
- Cada `SKILL.md` tiene frontmatter con `name` y `description`.
- Los nombres esperados son `canva-mockup`, `canva-draft`, `canva-refine`, `canva-deliver`.

Codex:

- Existe `.codex/commands/`.
- Cada comando oficial tiene `<id>.md`.

OpenCode:

- Existe `.opencode/commands/`.
- Cada comando oficial tiene `<id>.md`.

Legacy Antigravity:

- Si existe `.antigravity/commands/`, reportar como legacy.
- No fallar por su presencia.
- Advertir si solo existe legacy y no `.agents/skills/`.

### 8. Manifest v2

Extender `.gsd-canva/manifest.json`:

```json
{
  "schemaVersion": 2,
  "agents": {
    "antigravity": {
      "adapter": "antigravity-skill-v1",
      "files": [
        {
          "source": "templates/agent-source/canva-mockup",
          "target": ".agents/skills/canva-mockup/SKILL.md",
          "sha256": "...",
          "managed": true
        }
      ]
    },
    "codex": {
      "adapter": "codex-command-v1",
      "files": []
    },
    "opencode": {
      "adapter": "opencode-command-v1",
      "files": []
    }
  }
}
```

Mantener `files` plano para compatibilidad con schema v1 durante una versión, o agregar migración explícita.

### 9. Compatibilidad legacy

Durante v1.3:

- Mantener `templates/commands/*.md`.
- Mantener instalación legacy en `.antigravity/commands/` solo si:
  - el usuario usa `--agent antigravity-legacy`, o
  - se conserva el comportamiento default por compatibilidad temporal.
- Documentar `.antigravity/commands/` como deprecated para Antigravity 2.0.

En una versión posterior:

- Cambiar default de `--agent antigravity` a skills.
- Considerar remover legacy como default.

### 10. Documentación

Actualizar:

- `README.md`
- `docs/implementation_plans/*` si contienen instrucciones operativas activas.
- `docs/PROPOSAL_v1.1_architectural_fixes.md` solo como histórico, sin editar si se decide conservarlo como snapshot.

Nuevo texto conceptual:

```text
Skills/comandos del agente son el frontend operativo.
gsd-canva CLI es el backend determinista.
canva-plans/ es el estado auditable.
```

---

## Tests

### Unit tests de renderers

- `renderAntigravitySkill()` genera YAML frontmatter válido.
- `renderAntigravitySkill()` incluye `name` y `description`.
- `renderCodexCommand()` conserva encabezado slash command.
- `renderOpenCodeCommand()` conserva description frontmatter.
- Renderers rechazan capability sin `id` o `description`.

### Tests de init

- `init --agent antigravity` crea `.agents/skills/canva-mockup/SKILL.md` y no requiere `.antigravity/commands/`.
- `init --agent codex` crea `.codex/commands/canva-mockup.md`.
- `init --agent opencode` crea `.opencode/commands/canva-mockup.md`.
- `init --agent all` crea artifacts para los tres adapters.
- Manifest registra files por agente.

### Tests de upgrade

- `upgrade` actualiza artifacts gestionados.
- `upgrade` no sobrescribe artifacts modificados sin backup/conflict handling.
- `upgrade` conserva artifacts de agentes no instalados.

### Tests de doctor

- `doctor --agent antigravity` pasa cuando existen skills válidos.
- `doctor --agent antigravity` falla si falta `SKILL.md`.
- `doctor --agent antigravity` falla si falta frontmatter requerido.
- `doctor --agent antigravity` advierte si solo existe `.antigravity/commands/`.
- `doctor --agent all` valida todos los adapters instalados.

### Tests de compatibilidad

- Proyectos con manifest v1 siguen instalando/actualizando sin romperse.
- `--adopt` puede adoptar artifacts existentes de `.agents/skills`.
- `--force-all` solo borra/regenera artifacts oficiales gestionados.

---

## Verificación Manual

1. Ejecutar:

   ```bash
   gsd-canva init --agent antigravity
   ```

2. Verificar:

   ```text
   .agents/skills/canva-mockup/SKILL.md
   .agents/skills/canva-draft/SKILL.md
   .agents/skills/canva-refine/SKILL.md
   .agents/skills/canva-deliver/SKILL.md
   ```

3. Revisar que cada `SKILL.md` tenga:

   ```yaml
   ---
   name: ...
   description: ...
   ---
   ```

4. Ejecutar:

   ```bash
   gsd-canva doctor --agent antigravity
   ```

5. En Antigravity 2.0, verificar que el agente puede invocar:

   ```text
   /canva-mockup test
   ```

6. Ejecutar:

   ```bash
   gsd-canva init --agent codex
   gsd-canva init --agent opencode
   ```

7. Verificar que los artifacts esperados se crean en `.codex/commands/` y `.opencode/commands/`.

---

## Riesgos

### Riesgo 1: Formato exacto de OpenCode

El formato de `.opencode/commands` debe verificarse antes de declarar soporte estable.

Mitigación:

- Marcar adapter OpenCode como experimental hasta validar con documentación o prueba real.

### Riesgo 2: Cambiar default rompe usuarios legacy

Usuarios actuales pueden depender de `.antigravity/commands/`.

Mitigación:

- Mantener legacy durante v1.3.
- Agregar warning claro.
- Documentar migración.

### Riesgo 3: Duplicación temporal de artifacts

Durante migración pueden coexistir `.antigravity/commands`, `.agents/skills`, `.codex/commands` y `.opencode/commands`.

Mitigación:

- Manifest v2 registra por adapter.
- `doctor` explica qué superficie está activa.
- `upgrade` solo toca artifacts gestionados.

---

## Criterios de Aceptación

- Antigravity 2.0 usa `.agents/skills/*/SKILL.md` como output principal.
- `gsd-canva init --agent antigravity` no depende de `.antigravity/commands/`.
- `doctor --agent antigravity` valida skills, no comandos legacy.
- Codex y OpenCode se soportan mediante adapters independientes.
- El contenido operativo de las fases vive una sola vez en `templates/agent-source`.
- Los renderers producen artifacts específicos por agente.
- Manifest registra artifacts por adapter.
- Legacy `.antigravity/commands` queda documentado como deprecated o compatibilidad temporal.

---

## Fuentes de Contexto

- Antigravity GCLI migration: https://antigravity.google/docs/gcli-migration
- Antigravity CLI reference: https://antigravity.google/docs/cli-reference
- Revisión local de `lib/installer.js`, `README.md` y `templates/commands/*.md`.
