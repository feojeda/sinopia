# Propuesta v1.5: Plan de Implementacion de Gesso / Lienzo en Blanco

**Fecha**: 2026-05-31  
**Estado**: Pendiente de aprobacion  
**Branch sugerido**: `codex/v1.5-gesso-lienzo-en-blanco`  
**Base branch**: `main` actualizado  
**PR target**: `main`  
**Documentos fuente**:
- `docs/PROPOSAL_v1.5_lienzo_en_blanco.md`
- `docs/VISION_lenguaje_artistico.md`
- `docs/ROADMAP_sinopia.md`
- `README.md`

---

## Objetivo

Implementar la Fase 0 de Sinopia: **Gesso / Lienzo en Blanco**.

Esta fase agrega una capa conversacional anterior al mockup para transformar una intuicion creativa del usuario en un contrato conceptual auditable. El resultado de la fase debe ser persistente, verificable y utilizable como input directo para la Fase 1: **Abbozzo / Mockup**.

La implementacion debe mantener intacto el flujo actual de `canva-plans/`, `decisions.json`, yield gates criptograficos y comandos legacy `/canva-*`. Gesso se agrega como una fase previa opcional, no como reemplazo del sistema existente.

---

## Principios de Implementacion

1. **No romper compatibilidad legacy**
   - `gsd-canva plan *` debe seguir funcionando igual.
   - `/canva-mockup` debe seguir funcionando sin requerir Gesso.
   - Las carpetas existentes `canva-plans/` y `.gsd-canva/` no cambian de significado.

2. **Un solo skill conceptual, multiples aliases**
   - Skill/capability conceptual: `gesso`.
   - Aliases publicos: `/lienzo-en-blanco`, `/blank-canvas`, `/tela-bianca`, `/gesso`, `/canva-blank-canvas`.
   - No duplicar logica por idioma.

3. **Conversacional por fuera, deterministico por dentro**
   - El agente guia una conversacion libre.
   - El CLI persiste estado, valida artefactos y controla transiciones.
   - La aprobacion del usuario congela el Gesso con hash de integridad.

4. **Gesso alimenta Abbozzo, no lo sustituye**
   - `lienzo.json` captura metadata, estado, vinculos y confirmacion.
   - `gesso.md` captura la especificacion conceptual legible y narrativa.
   - Al crear un plan de mockup desde un lienzo, el plan conserva su propio `decisions.json` y yield gate.

5. **Documentar antes de implementar**
   - Este documento define la propuesta de alto nivel.
   - Cada fase tecnica debe tener su propio documento en `docs/implementation_plans/` antes de tocar codigo.

---

## Alcance

### Incluido

- Nuevo dominio persistente `lienzos/`.
- Nuevo modulo backend para administrar lienzos.
- Nuevos comandos CLI bajo `gsd-canva gesso`.
- Skill/capability de agente para Gesso y aliases multidioma.
- Instalacion y doctor support para el nuevo artifact de agente.
- Vinculo opcional entre un lienzo y un plan existente o nuevo.
- Tests unitarios e integracion CLI para estado, validaciones y compatibilidad.
- Documentacion operativa para developers y usuarios.

### Excluido

- Renombrar el paquete npm de `gsd-canva` a `sinopia`.
- Reemplazar `canva-plans/` por otra estructura.
- Cambiar el flujo actual de Fase 1 si el usuario invoca `/canva-mockup` directamente.
- Implementar Studi/Opere o aliases completos de fases 1-3.
- Crear UI grafica propia fuera de los mecanismos de skills/comandos existentes.

---

## Modelo de Artefactos

Cada lienzo vive en `lienzos/lienzo_<ID>_<slug>/`.

```text
lienzos/
└── lienzo_001_mi-cafe/
    ├── lienzo.json
    ├── gesso.md
    └── sesion.json
```

### `lienzo.json`

Metadata y maquina de estados del lienzo.

```json
{
  "id": "001",
  "name": "Mi Cafe",
  "slug": "mi-cafe",
  "phase": "gesso",
  "status": "en_blanco",
  "methodology": "socratic",
  "language": "es",
  "linkedPlanId": null,
  "timestamps": {
    "created": "2026-05-31T00:00:00.000Z",
    "updated": "2026-05-31T00:00:00.000Z",
    "approved": null
  },
  "confirmation": {
    "confirmed": false,
    "confirmedAt": null,
    "confirmedBy": null,
    "source": "chat",
    "hashAlgorithm": "sha256-gesso-v1",
    "gessoHash": ""
  },
  "history": []
}
```

Estados permitidos:

| Estado | Significado |
| --- | --- |
| `en_blanco` | Brainstorming activo, editable. |
| `gesso_listo` | Gesso aprobado y congelado. |
| `con_mockup` | Lienzo vinculado a un plan de mockup. Gesso de solo lectura. |
| `archivado` | Lienzo preservado sin continuar. |

### `gesso.md`

Documento legible que resume la base conceptual aprobada.

Secciones requeridas:

- Nombre del lienzo.
- Metodologia usada.
- Resumen narrativo de la idea.
- Intencion visual y tonal.
- Audiencia y contexto de uso.
- Mensaje central.
- Estructura de layout propuesta.
- Elementos obligatorios.
- Riesgos o restricciones.
- Exploraciones descartadas.
- Recomendaciones para Abbozzo.

### `sesion.json`

Registro auditable de la conversacion guiada.

```json
{
  "lienzoId": "001",
  "methodology": "socratic",
  "language": "es",
  "turns": [
    {
      "timestamp": "2026-05-31T00:00:00.000Z",
      "role": "user",
      "content": "Quiero algo para mi cafe",
      "tags": ["initial_prompt"]
    }
  ],
  "workingNotes": {
    "idea": "",
    "audience": "",
    "tone": "",
    "layout": "",
    "constraints": ""
  }
}
```

---

## CLI Propuesto

Agregar un nuevo grupo:

```bash
gsd-canva gesso <command>
```

### `gesso create`

Crea un lienzo.

```bash
gsd-canva gesso create --name "Mi Cafe" --methodology socratic --language es --json
```

Responsabilidades:

- Crear `lienzos/` si no existe.
- Asignar ID secuencial de tres digitos independiente de `canva-plans/`.
- Crear `lienzo.json`, `gesso.md` vacio con plantilla y `sesion.json`.
- Estado inicial: `gesso:en_blanco`.

### `gesso append-turn`

Registra un turno conversacional sin editar a mano `sesion.json`.

```bash
gsd-canva gesso append-turn --id 001 --role user --content "..." --tags initial_prompt --json
```

Responsabilidades:

- Validar que el lienzo este editable.
- Escribir de forma atomica.
- Actualizar `timestamps.updated`.

### `gesso update-notes`

Actualiza notas estructuradas de trabajo durante la conversacion.

```bash
gsd-canva gesso update-notes --id 001 --field tone --value "calido, cercano, artesanal" --json
```

Campos iniciales sugeridos:

- `idea`
- `audience`
- `tone`
- `layout`
- `context`
- `constraints`
- `mandatoryElements`
- `discardedDirections`

### `gesso write`

Escribe o reemplaza `gesso.md` desde el resumen aprobado por el agente.

```bash
gsd-canva gesso write --id 001 --file /tmp/gesso.md --json
```

Responsabilidades:

- Validar que el archivo no este vacio.
- Validar secciones requeridas.
- Mantener el lienzo en `en_blanco`; escribir no equivale a aprobar.

### `gesso confirm`

Congela el Gesso despues de aprobacion explicita del usuario.

```bash
gsd-canva gesso confirm --id 001 --by user --json
```

Responsabilidades:

- Validar que `gesso.md` existe y contiene las secciones requeridas.
- Calcular `sha256-gesso-v1` sobre contenido canonico.
- Guardar hash en `lienzo.json`.
- Transicionar a `gesso:gesso_listo`.

### `gesso link-plan`

Vincula el lienzo aprobado con un plan de mockup.

```bash
gsd-canva gesso link-plan --id 001 --plan 003 --json
```

Responsabilidades:

- Rechazar si el lienzo no esta en `gesso_listo`.
- Verificar que el plan existe.
- Revalidar hash de `gesso.md`.
- Escribir `linkedPlanId` y transicionar a `con_mockup`.
- Opcionalmente agregar `sourceLienzoId` al `plan.json` del plan.

### `gesso status`, `gesso list`, `gesso archive`

Comandos de inspeccion y mantenimiento equivalentes al patron actual de `plan status/list`.

---

## Integracion con Fase 1

La primera version debe usar una integracion explicita y conservadora:

1. El usuario completa `/lienzo-en-blanco`.
2. El agente obtiene un `lienzoId` en estado `gesso_listo`.
3. El usuario invoca `/canva-mockup` o el agente propone pasar a Abbozzo.
4. El agente ejecuta `gsd-canva plan create --name "<nombre>"`.
5. El agente ejecuta `gsd-canva gesso link-plan --id <lienzoId> --plan <planId>`.
6. El agente usa `gesso.md` como contexto para responder o sugerir campos de `decisions.json`, pero cada campo sigue registrandose con `plan answer`.

No se debe autopoblar `decisions.json` sin confirmacion. El Gesso puede sugerir valores; el usuario sigue aprobando las decisiones tecnicas de Fase 1 mediante el yield gate existente.

---

## Skill / Capability del Agente

Agregar nueva fuente neutral:

```text
templates/agent-source/gesso/
├── capability.json
└── instructions.md
```

`capability.json` debe declarar:

```json
{
  "id": "gesso",
  "name": "Gesso / Lienzo en Blanco",
  "invocation": "/lienzo-en-blanco <nombre opcional>",
  "description": "Guide Phase 0 creative exploration and produce an approved Gesso for Sinopia.",
  "triggers": ["/lienzo-en-blanco", "/blank-canvas", "/tela-bianca", "/gesso", "/canva-blank-canvas"],
  "category": "sinopia"
}
```

`instructions.md` debe definir:

- Preflight CLI.
- Seleccion de metodologia.
- Guia conversacional por metodologia.
- Reglas para registrar turnos y notas usando CLI.
- Reglas de cierre: resumen, layout, nombre, aprobacion explicita.
- Prohibicion de pasar a mockup antes de `gesso confirm`.
- Transicion sugerida a `/canva-mockup` solo despues de aprobacion.

---

## Cambios por Componente

### Backend CLI

Archivos esperados:

- `lib/gesso-manager.js`
- `bin/gsd-canva.js`
- `tests/gesso.test.js`

Responsabilidades:

- Implementar creacion, busqueda, escritura atomica, validacion de estados, hash canonico y vinculo con plan.
- Reutilizar patrones existentes de `plan-manager.js` sin mezclar ambos dominios.
- Exportar helpers solo cuando sean necesarios para tests.

### Installer / Adapters

Archivos esperados:

- `lib/installer.js`
- `lib/agent-adapters/*` si el catalogo requiere cambios.
- `templates/agent-source/gesso/*`
- `templates/commands/gesso.md` o command artifacts equivalentes segun adapter.

Responsabilidades:

- Instalar el nuevo skill/capability junto a los existentes.
- Preservar upgrades idempotentes y `--adopt`.
- Doctor debe contar `gesso` como artifact oficial esperado cuando el agente correspondiente lo soporte.

### Documentacion

Archivos esperados:

- `README.md`
- `README.es.md`
- `docs/commands/gesso.md`
- `docs/implementation_plans/v1.5_phase_*.md`

Responsabilidades:

- Explicar Gesso como fase 0.
- Documentar aliases multidioma.
- Documentar el flujo Gesso -> Abbozzo.
- Mantener compatibilidad visible con `/canva-mockup`.

---

## Plan de Fases para Developers

### Fase 1: Modelo Persistente y CLI Base

Objetivo: crear el dominio `gesso` sin tocar agents ni mockup.

Implementar:

- `lib/gesso-manager.js`.
- `gesso create`, `status`, `list`, `append-turn`, `update-notes`.
- Escrituras atomicas y lock compartido `.gsd-canva/.lock`.
- Tests de ID secuencial, estructura de carpetas, estados iniciales y errores.

No implementar:

- Skill del agente.
- Confirmacion/hash.
- Vinculo con planes.

Criterio de aceptacion:

- `npm test` pasa.
- Los comandos base funcionan con `--json`.
- No cambia ningun test existente de planes.

### Fase 2: Gesso Aprobado y Hash de Integridad

Objetivo: convertir el resumen creativo en contrato aprobado.

Implementar:

- `gesso write`.
- Validacion de secciones requeridas.
- `gesso confirm`.
- Recalculo y verificacion de `sha256-gesso-v1`.
- Rechazo de mutaciones despues de `gesso_listo`.

Tests:

- No se confirma sin `gesso.md`.
- No se confirma si faltan secciones requeridas.
- Cambiar `gesso.md` despues de confirmar produce error al verificar.
- `append-turn` y `update-notes` fallan en estado no editable.

### Fase 3: Vinculo Gesso -> Plan

Objetivo: conectar Fase 0 con Fase 1 sin romper el yield gate actual.

Implementar:

- `gesso link-plan`.
- Campo `sourceLienzoId` opcional en `plan.json`.
- Validacion de plan existente.
- Validacion de hash antes del link.
- Estado `con_mockup`.

Tests:

- No se vincula un lienzo `en_blanco`.
- No se vincula a plan inexistente.
- Link exitoso escribe ambos lados.
- Link falla si `gesso.md` fue alterado despues de `confirm`.

### Fase 4: Skill del Agente y Aliases

Objetivo: hacer invocable la fase por usuarios.

Implementar:

- `templates/agent-source/gesso/capability.json`.
- `templates/agent-source/gesso/instructions.md`.
- Artifacts para Codex/OpenCode/Antigravity mediante adapters existentes.
- Instalacion y upgrade del nuevo artifact.

Tests:

- Installer instala `gesso`.
- Doctor valida `gesso`.
- Adapters generan artifacts con aliases esperados.
- No se remueven artifacts legacy `canva-*`.

### Fase 5: Documentacion y Flujo End-to-End

Objetivo: dejar el flujo completo reproducible.

Implementar:

- Docs de usuario.
- Docs de developer.
- Ejemplo de flujo completo:
  - crear lienzo,
  - registrar sesion,
  - escribir y confirmar gesso,
  - crear plan,
  - vincular plan,
  - continuar con preguntas de mockup.

Tests:

- Test e2e CLI en carpeta temporal.
- Verificar que `/canva-mockup` directo sigue funcionando sin Gesso.
- Verificar que un plan vinculado conserva su maquina de estados normal.

---

## Contrato de Errores Propuesto

Agregar codigos especificos para no reutilizar errores de plan cuando el problema es de lienzo:

| Codigo | Exit | Uso |
| --- | ---: | --- |
| `GSDC_GESSO_NOT_FOUND` | 31 | No existe el lienzo solicitado. |
| `GSDC_GESSO_INVALID_STATE` | 32 | Transicion ilegal de estado. |
| `GSDC_GESSO_ARTIFACT_MISSING` | 33 | Falta `gesso.md` o esta vacio. |
| `GSDC_GESSO_INVALID_ARTIFACT` | 34 | `gesso.md` no cumple contrato minimo. |
| `GSDC_GESSO_CHANGED_AFTER_CONFIRMATION` | 35 | Hash de Gesso no coincide. |
| `GSDC_GESSO_LINK_FAILED` | 36 | No se pudo vincular con un plan. |

Los codigos deben documentarse en los implementation plans antes de implementarse.

---

## Decisiones Abiertas

1. **Nombre de carpeta**
   - Recomendado: usar `lienzos/`. Es simple, habla el idioma del usuario y separa la vision de Sinopia del naming legacy de Canva.
   - Alternativas artisticas consideradas: `atelier/`, `estudio/`, `bastidores/`, `cartella/`, `archivio/`.
   - Decision: no usar `canva-lienzos/` porque sugiere que la Fase 0 pertenece a Canva, cuando en Sinopia el lienzo es el soporte conceptual propio del usuario.

2. **Comando CLI publico**
   - Recomendado v1.5: `gsd-canva gesso`.
   - Alternativa futura: alias binario `sinopia gesso`.

3. **Formato de `gesso.md`**
   - Recomendado: validar encabezados requeridos por texto normalizado.
   - Alternativa mas estricta: frontmatter + markdown schema.

4. **Autopoblado de `decisions.json`**
   - Recomendado: no autopoblar en v1.5; el agente puede sugerir y registrar solo con aprobacion.
   - Alternativa futura: comando `gesso suggest-decisions`.

---

## Criterios de Aceptacion Globales

- `npm test` pasa.
- El nuevo flujo no modifica comportamiento de planes existentes.
- `/canva-mockup` puede ejecutarse sin Gesso.
- `/lienzo-en-blanco`, `/blank-canvas`, `/tela-bianca`, `/gesso` y `/canva-blank-canvas` apuntan a la misma capacidad.
- Un lienzo aprobado produce `gesso.md`, `lienzo.json` y `sesion.json`.
- Un Gesso confirmado no puede alterarse silenciosamente sin disparar error de hash.
- Un lienzo aprobado puede vincularse a un plan y quedar trazable desde ambos lados.
- La documentacion explica claramente que Gesso prepara la obra y Abbozzo fija la estructura espacial.

---

## Protocolo de Trabajo

Para implementar esta propuesta:

1. Actualizar `main` local antes de crear la rama de implementacion.
2. Seguir obligatoriamente `docs/implementation_plans/v1.5_execution_review_protocol.md`.
3. Implementar cada fase con un subagente de implementacion dedicado.
4. Crear un PR por fase.
5. Pedir peer review a un subagente distinto, que debe dejar sus comentarios en el mismo PR.
6. Si el peer review pide cambios, iterar entre fixes del subagente de implementacion y nuevo peer review hasta recibir `APPROVED`.
7. Mergear el PR solo despues de `APPROVED`.
8. Continuar con la siguiente fase de v1.5 solo despues del merge de la fase anterior.

---

## Input Esperado para Documentos de Implementacion

Cada documento en `docs/implementation_plans/` debe incluir:

- Objetivo de la fase.
- Archivos a crear/modificar.
- Cambios de API/CLI exactos.
- Estados y transiciones afectadas.
- Casos de error.
- Tests requeridos.
- Comandos de verificacion.
- Criterios de aceptacion.
- Riesgos de compatibilidad.

Los documentos de implementacion aprobados para v1.5 son:

```text
docs/implementation_plans/v1.5_execution_review_protocol.md
docs/implementation_plans/v1.5_phase_1_gesso_model_cli.md
docs/implementation_plans/v1.5_phase_2_gesso_confirmation_hash.md
docs/implementation_plans/v1.5_phase_3_gesso_plan_link.md
docs/implementation_plans/v1.5_phase_4_gesso_agent_skill_aliases.md
docs/implementation_plans/v1.5_phase_5_gesso_docs_e2e.md
```
