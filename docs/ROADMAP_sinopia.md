# Roadmap General de Sinopia

**Fecha**: 2026-05-31  
**Estado**: Guia estrategica, no aprobacion de implementacion  
**Proposito**: Ordenar la vision completa de Sinopia en hitos tecnicos despues del fork desde `gsd-canva`.

---

## Norte del Proyecto

Sinopia debe convertir el flujo actual de diseno asistido por IA en un proceso creativo guiado por contratos verificables.

La vision completa no es solo cambiar nombres. Es asegurar que cada fase tenga:

- una responsabilidad creativa clara;
- un artefacto persistente;
- una aprobacion humana explicita;
- una frontera verificable contra desviaciones del agente;
- compatibilidad gradual con los comandos legacy.

El objetivo operativo es:

```text
Gesso -> Abbozzo -> Studi -> Opere
```

Donde:

- **Gesso** prepara la intencion.
- **Abbozzo** fija la estructura.
- **Studi** explora variaciones esteticas.
- **Opere** finaliza entregables.

---

## Estado Actual

El repo conserva la arquitectura original de `gsd-canva`:

- CLI principal: `gsd-canva`.
- Estado tecnico: `canva-plans/`.
- Fase inicial activa: `/canva-mockup`.
- Fases posteriores: `/canva-draft`, `/canva-refine`, `/canva-deliver`.
- Adapters de agente: Antigravity, Codex, OpenCode.
- Yield gate criptografico sobre `decisions.json`.

La vision Sinopia ya esta expresada conceptualmente en:

- `README.md`
- `README.es.md`
- `docs/VISION_lenguaje_artistico.md`
- `docs/PROPOSAL_v1.5_lienzo_en_blanco.md`

Lo que falta es convertir esa vision en una secuencia tecnica.

---

## Hito 1: Gesso / Lienzo en Blanco

**Objetivo**: implementar la Fase 0 como capa previa opcional al mockup.

Documento rector:

- `docs/PROPOSAL_v1.5_gesso_lienzo_en_blanco_implementation_plan.md`

Resultado esperado:

```text
lienzos/
└── lienzo_001_mi-cafe/
    ├── lienzo.json
    ├── gesso.md
    └── sesion.json
```

Capacidades:

- `/lienzo-en-blanco`
- `/blank-canvas`
- `/tela-bianca`
- `/gesso`
- `/canva-blank-canvas`

Contrato:

- El usuario explora una idea.
- Francesco guia la conversacion.
- El sistema produce y confirma `gesso.md`.
- El Gesso aprobado puede vincularse a un plan de mockup.

No resuelve todavia:

- Rehacer el mockup como Abbozzo completo.
- Validar automaticamente que el wireframe respeta el Gesso.
- Crear Studi u Opere.

---

## Hito 2: Abbozzo / Boceto Estructural

**Objetivo**: adaptar la Fase 1 existente para que el mockup sea formalmente el Abbozzo de Sinopia.

Estado de partida:

- `/canva-mockup` ya existe.
- `mockup.html` ya existe como artefacto de wireframe.
- `decisions.json` ya tiene yield gate.

Trabajo requerido:

- Agregar aliases: `/boceto`, `/sketch`, `/wireframe`, `/abbozzo`; mantener `/canva-mockup`.
- Crear o adaptar skill conceptual `abbozzo`.
- Introducir a Giulio como asistente estructural.
- Usar `gesso.md` como input cuando exista `sourceLienzoId`.
- Definir contrato Abbozzo: layout, jerarquia visual, bloques de contenido, proporcion espacial y restricciones que no pueden cambiar en Studi.
- Decidir si `mockup.html` sigue siendo el nombre fisico o si se agrega metadata `abbozzo`.

Validaciones futuras:

- El Abbozzo no puede contradecir el layout aprobado en Gesso.
- El Abbozzo debe registrar que fuente uso: Gesso vinculado o decisiones directas.
- Cambios post-aprobacion deben resetear el gate correspondiente.

Documento futuro sugerido:

```text
docs/PROPOSAL_v1.6_abbozzo_mockup_integration.md
```

---

## Hito 3: Studi / Estudios Visuales

**Objetivo**: convertir la fase de draft en una exploracion controlada de variaciones esteticas.

Estado de partida:

- `/canva-draft` existe como fase para crear borradores/templates en Canva.

Trabajo requerido:

- Agregar aliases: `/estudios`, `/studies`, `/studi`; mantener `/canva-draft`.
- Crear o adaptar skill conceptual `studi`.
- Introducir a Salai como asistente creativo, pero limitado por Gesso y Abbozzo.
- Definir cuantas variantes se generan por defecto.
- Definir que puede variar: paleta, tipografia, estilo visual, tratamiento de imagen, densidad decorativa y energia de composicion.
- Definir que no puede variar: intencion del Gesso, layout estructural del Abbozzo, restricciones aprobadas y mensajes obligatorios.

Artefactos posibles:

```text
canva-plans/plan_001_mi-cafe/
├── studi/
│   ├── studio_001.json
│   ├── studio_002.json
│   └── studio_003.json
└── selected_studio.json
```

Validaciones futuras:

- Cada Studio debe declarar que cambios esteticos propone.
- Cada Studio debe referenciar el Abbozzo aprobado.
- La seleccion del usuario debe quedar registrada antes de pasar a Opere.

Documento futuro sugerido:

```text
docs/PROPOSAL_v1.7_studi_visual_variations.md
```

---

## Hito 4: Opere / Obras Finales

**Objetivo**: convertir refine/deliver en una fase final deterministica y trazable.

Estado de partida:

- `/canva-refine` y `/canva-deliver` existen.
- Hay verificacion fisica de entregables en `delivery/plan_<ID>/`.

Trabajo requerido:

- Agregar aliases: `/obras`, `/works`, `/opere`; mantener `/canva-refine` y `/canva-deliver`.
- Definir si Opere agrupa refine + deliver o si son subestados separados.
- Introducir a Marco como asistente ejecutor.
- Formalizar inyeccion final de copy/assets.
- Formalizar exportacion y verificacion fisica.
- Generar manifest final de entrega.

Artefactos posibles:

```text
delivery/plan_001/
├── opere.json
├── obra_001.png
├── obra_001.pdf
└── verification.json
```

Contrato:

- Marco no toma decisiones creativas nuevas.
- Solo aplica el Studio elegido y completa detalles finales.
- Cualquier cambio de intencion vuelve a fases previas.

Documento futuro sugerido:

```text
docs/PROPOSAL_v1.8_opere_final_delivery.md
```

---

## Hito 5: Contratos Entre Fases

**Objetivo**: endurecer la tesis central: el agente puede alucinar, el proceso no.

Trabajo requerido:

- Hash de Gesso aprobado.
- Hash de Abbozzo aprobado.
- Hash o manifest del Studio elegido.
- Manifest final de Opere.
- Validadores de transicion: Gesso -> Abbozzo, Abbozzo -> Studi, Studi -> Opere.

Ejemplo de cadena verificable:

```json
{
  "gessoHash": "sha256:...",
  "abbozzoHash": "sha256:...",
  "selectedStudioHash": "sha256:...",
  "opereManifestHash": "sha256:..."
}
```

Documento futuro sugerido:

```text
docs/PROPOSAL_v1.9_phase_contracts.md
```

---

## Hito 6: Migracion de Marca y CLI Sinopia

**Objetivo**: mover gradualmente el proyecto desde `gsd-canva` hacia Sinopia sin romper compatibilidad.

Trabajo requerido:

- Mantener `gsd-canva` como binario legacy.
- Agregar binario `sinopia`.
- Decidir si `.gsd-canva/` se mantiene, se duplica o migra a `.sinopia/`.
- Decidir si `canva-plans/` se mantiene para compatibilidad o si se introduce una carpeta nueva.
- Actualizar mensajes del CLI para hablar de Sinopia.
- Mantener comandos `/canva-*` como aliases legacy.

Regla:

- Ningun proyecto existente debe quedar inutilizable por una migracion de naming.

Documento futuro sugerido:

```text
docs/PROPOSAL_v2.0_sinopia_cli_migration.md
```

---

## Hito 7: Experiencia de Usuario Completa

**Objetivo**: que el usuario pueda recorrer la obra completa sin conocer los detalles internos.

Flujo ideal:

```text
/lienzo-en-blanco "Cafe de barrio"
-> Gesso aprobado

/boceto
-> Abbozzo aprobado

/estudios
-> 3 Studi generados
-> usuario elige uno

/obras
-> entregables finales verificados
```

Trabajo requerido:

- Walkthrough end-to-end.
- Docs para usuario no tecnico.
- Docs para developer.
- Fixtures de ejemplo.
- Tests e2e por flujo completo.
- Verificacion de que los aliases legacy siguen operando.

Documento futuro sugerido:

```text
docs/PROPOSAL_v2.1_full_workflow_experience.md
```

---

## Orden Recomendado

1. **v1.5 Gesso**: crear la base conceptual y auditable.
2. **v1.6 Abbozzo**: adaptar el mockup existente al contrato de Sinopia.
3. **v1.7 Studi**: convertir draft en variaciones esteticas controladas.
4. **v1.8 Opere**: consolidar refine/deliver como entrega final.
5. **v1.9 Phase Contracts**: endurecer verificaciones entre fases.
6. **v2.0 Sinopia CLI Migration**: migrar naming y binario sin romper legacy.
7. **v2.1 Full Workflow Experience**: pulir experiencia completa, docs y ejemplos.

---

## Decisiones Pendientes Globales

1. **Raiz del workspace creativo**
   - Decision actual para Gesso: `lienzos/`.
   - Pendiente: decidir si planes futuros siguen en `canva-plans/` o migran gradualmente.

2. **Nombre fisico de artefactos**
   - `gesso.md` parece estable.
   - `mockup.html` puede seguir como nombre fisico legacy del Abbozzo.
   - Studi y Opere necesitan contratos nuevos.

3. **Nivel de validacion automatica**
   - Minimo: hashes y estados.
   - Medio: validadores de estructura por JSON.
   - Alto: comparacion semantica entre Gesso, Abbozzo y Studi.

4. **Profundidad de asistentes historicos**
   - Los nombres Francesco, Giulio, Salai y Marco pueden vivir solo en instrucciones internas.
   - No deben convertirse en friccion para el usuario.

5. **Compatibilidad con Canva**
   - Sinopia debe seguir pudiendo controlar Canva.
   - Pero la identidad del proyecto no debe depender de que todo artefacto se llame `canva-*`.

---

## Regla de Gobierno

Cada hito de este roadmap requiere:

1. Propuesta en `docs/PROPOSAL_*.md`.
2. Planes tecnicos en `docs/implementation_plans/`.
3. Branch separado desde `main`.
4. Aprobacion explicita antes de implementar.
5. PR al finalizar.
6. Sin merge directo.
