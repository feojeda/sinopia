# GSD Canva (Spec-Driven Canva Lifecycle Framework)

`gsd-canva` es un framework de grado empresarial y herramienta CLI diseñada para guiar el ciclo de vida de creación de elementos en Canva de forma estructurada a través de **Spec-Driven Development (SDD)**.

Inspirado en GSD (Goal-Seeking Development), establece una división de responsabilidades robusta, aislante y atómica para evitar alucinaciones visuales y pérdidas de precisión en la IA mediante un flujo interactivo de dos fases:

*   **Fase 1: Prototipado e Iteración Visual** (Maquetación HTML local e inicialización de borradores).
*   **Fase 2: Ajuste Fino Determinista** (Edición matemática pixel-perfect en Canva mediante transacciones MCP sin adivinaciones).

---

## Modelo Conceptual

```text
Agent skills/commands are the operational frontend.
gsd-canva CLI is the deterministic backend.
canva-plans/ is the auditable state.
```

---

## 🛠 Arquitectura del Workspace

El framework organiza tu proyecto destino estructurando limpiamente los archivos del sistema, datos de usuario y salidas:

```text
.gsd-canva/
  ├── manifest.json              <-- Hashes sha256, mappings y schemaVersion: 2 (Sistema)
  ├── config.json                <-- Configuración portable (Commiteado)
  ├── config.local.example.json  <-- Plantilla de configuración local
  ├── commands/                  <-- Plantillas de comandos slash markdown
  ├── workflows/                 <-- Especificaciones y guías de flujos
  └── .lock                      <-- Lockfile de concurrencia temporal (Gitignored/Temporal)

.agents/
  └── skills/                    <-- Antigravity 2.0 workspace skills (Primary)
      ├── canva-mockup/SKILL.md
      ├── canva-draft/SKILL.md
      ├── canva-refine/SKILL.md
      └── canva-deliver/SKILL.md

.codex/
  └── commands/                  <-- Codex slash commands (Supported)
      ├── canva-mockup.md
      ├── canva-draft.md
      ├── canva-refine.md
      └── canva-deliver.md

.opencode/
  └── commands/                  <-- OpenCode commands (Experimental)
      ├── canva-mockup.md
      ├── canva-draft.md
      ├── canva-refine.md
      └── canva-deliver.md

.antigravity/
  └── commands/                  <-- Legacy (Deprecated — compatibility only)

canva-plans/                     <-- Carpeta de planes secuenciales (Commiteado)
  ├── plan_001_[nombre]/
  │     ├── plan.json            <-- Máquina de estados detallada y atómica
  │     ├── requerimientos.md    <-- Dimensiones, copy y assets
  │     ├── investigacion.md     <-- Paletas HSL, fuentes y análisis visual
  │     ├── preguntas.md         <-- Dudas conceptuales y alineación del usuario
  │     ├── plan_ejecucion.md    <-- Boceto conceptual y rejilla cartesiana
  │     └── roadmap_progreso.md  <-- Checklist interactivo de hitos de la fase
  └── plan_002_[nombre]/

system_templates.json            <-- Catálogo técnico de placeholders (Commiteado)
delivery/                        <-- Assets PNG/PDF descargados y listos (Gitignored)
```

---

## 🤖 Agent Adapters

`gsd-canva` soporta múltiples runtimes de agente mediante adapters independientes. Cada adapter genera artifacts en el formato nativo del agente desde una fuente neutral compartida (`templates/agent-source/`).

| Agent | Output Path | Status |
| :--- | :--- | :--- |
| **Antigravity 2.0** | `.agents/skills/<id>/SKILL.md` | **Primary** |
| **Codex** | `.codex/commands/<id>.md` | Supported |
| **OpenCode** | `.opencode/commands/<id>.md` | Experimental |
| Antigravity legacy | `.antigravity/commands/<id>.md` | Deprecated (compatibility only) |

### Manifest v2

El archivo `.gsd-canva/manifest.json` registra los artifacts generados por adapter con `schemaVersion: 2`:

```json
{
  "schemaVersion": 2,
  "frameworkVersion": "1.0.0",
  "files": [],
  "agents": {
    "antigravity": {
      "adapter": "antigravity-skill-v1",
      "files": [{ "target": ".agents/skills/canva-mockup/SKILL.md", "sha256": "...", "managed": true }]
    },
    "codex": { "adapter": "codex-command-v1", "files": [] },
    "opencode": { "adapter": "opencode-command-v1", "files": [] }
  }
}
```

---

## 🚀 Instalación e Inicialización

### 1. Registro Global Local
Para registrar el comando en la terminal global de tu Mac desde el directorio de desarrollo:
```bash
npm install -g .
# o también
npm link
```

### 2. Inicialización en un Proyecto Destino
Ubícate en la raíz del proyecto donde deseas crear diseños estructurados en Canva y ejecuta:

```bash
# Antigravity 2.0 (Primary)
gsd-canva init --agent antigravity

# Codex
gsd-canva init --agent codex

# OpenCode (Experimental)
gsd-canva init --agent opencode

# Todos los adapters soportados
gsd-canva init --agent all

# Sin adapter (solo infraestructura base)
gsd-canva init
```

Opciones adicionales:

*   `--force-all`: Fuerza la regeneración de artifacts oficiales, con backup automático de archivos modificados localmente.
*   `--adopt`: Registra artifacts existentes en el manifest sin sobrescribir contenido del usuario.

### 3. Diagnóstico de Salud
Verifica la salud del espacio de trabajo y la integridad de los artifacts del agente:

```bash
gsd-canva doctor --agent antigravity
gsd-canva doctor --agent codex
gsd-canva doctor --agent opencode
gsd-canva doctor --agent all
```

### 4. Actualización

```bash
gsd-canva upgrade
```

Regenera los artifacts gestionados por adapter desde la fuente neutral. Si un archivo managed fue modificado localmente, se crea un backup `.bak.YYYYMMDDHHMMSS` antes de sobrescribir.

*   `upgrade --adopt`: Preserva el contenido del usuario para archivos modificados, solo actualiza el hash en el manifest.
*   `upgrade --force-all`: Regenera también artifacts oficiales no gestionados que existan en disco.

---

## 📋 Comandos Slash e Interfaces del Agente

Los comandos slash son generados por los adapters y descubiertos por cada agente en su formato nativo. Antigravity 2.0 los consume como **workspace skills** en `.agents/skills/<id>/SKILL.md`.

### 1. `/canva-mockup <nombre_diseño>`
*   **Fase**: `mockup:pending`
*   **Acción**: Crea la carpeta secuencial `canva-plans/plan_XXX` con lock atómico. Invita a completar el levantamiento conceptual, la investigación cromática y tipográfica, y redactar una maqueta HTML interactiva premium (`mockup.html`) antes de tocar Canva.
*   **Transición**: Al aprobarse la propuesta por el usuario, el agente corre `gsd-canva plan approve-mockup --id <id>` (Estado: `mockup:approved`).

### 2. `/canva-draft [ID]`
*   **Fase**: `draft:pending` -> `draft:approved`
*   **Acción**: Genera borradores en la API de Canva subiendo assets con el MCP. Expone los enlaces directos editables y un carrusel de vistas previas en el chat.
*   **Bucle de Feedback**: Si el usuario no aprueba ninguna variante, solicita cambios, los aplica directamente en Canva y expone nuevas miniaturas.
*   **Registro**: Al aprobarse, escanea los elementos (`canva/get-design-content`) y registra placeholders en `system_templates.json` vía `gsd-canva template register`.
*   **Transición**: El agente corre `gsd-canva plan approve-draft --id <id>` (Estado: `draft:approved`).

### 3. `/canva-refine [ID]`
*   **Fase**: `refine:pending` -> `deliver:ready`
*   **Acción**: Aplica modificaciones matemáticas pixel-perfect (e.g. mover texto 20px arriba, cambiar tamaño a 24px) llamando a `canva/start-editing-transaction` y `canva/perform-editing-operations` sobre los placeholders registrados.
*   **Transición**: Al aprobarse, el agente corre `gsd-canva plan approve-refine --id <id>` y transiciona directamente a `deliver:ready`.

### 4. `/canva-deliver [ID]`
*   **Fase**: `deliver:ready` -> `delivered`
*   **Acción**: El agente exporta a Canva (`canva/export-design`), descarga el asset y lo guarda en `delivery/plan_[ID]/`.
*   **Verificación**: Invoca a `gsd-canva plan deliver --id <id>`. El CLI inspecciona la presencia física de al menos un archivo `.png` o `.pdf` mayor a cero bytes, y bloquea el estado final como **`delivered`**.

---

## 🔄 Migración desde Instalaciones Legacy

Si tu proyecto fue inicializado con una versión anterior de `gsd-canva` que usaba `.antigravity/commands/` como superficie primaria:

1.  Ejecuta `gsd-canva upgrade` para migrar el manifest a v2 y registrar los adapters.
2.  Ejecuta `gsd-canva init --agent antigravity` para instalar los skills de Antigravity 2.0.
3.  Los archivos en `.antigravity/commands/` se mantienen por compatibilidad pero están deprecados.
4.  La superficie primaria para Antigravity 2.0 es ahora `.agents/skills/<id>/SKILL.md`.

> `.antigravity/commands/` es una superficie legacy. No se eliminará automáticamente, pero los comandos slash del agente se descubren desde `.agents/skills/` en Antigravity 2.0.

---

## 🤖 Modo Máquina a Máquina (`--json`)

Para flujos automatizados de agentes, todos los comandos de consulta y transiciones aceptan la bandera `--json`.

*   **Éxito (`stdout` limpia y `stderr` en silencio)**:
    ```json
    {
      "ok": true,
      "data": {
        "planId": "001",
        "planDir": "canva-plans/plan_001_banner-corporativo"
      }
    }
    ```
*   **Error (`stdout` en silencio y error JSON estructurado en `stderr` con exit code no nulo)**:
    ```json
    {
      "ok": false,
      "code": "GSDC_INVALID_STATE",
      "message": "Transición ilegal: Se esperaba phase:status mockup:pending para aprobar mockup. Estado actual: mockup:approved.",
      "details": {}
    }
    ```

### Catálogo Oficial de Errores

| Código de Error | Exit Code | Descripción |
| :--- | :---: | :--- |
| `GSDC_LOCK_TIMEOUT` | `10` | Lockfile ocupado tras expirar timeout (configurable vía `GSD_CANVA_LOCK_TIMEOUT_MS`). |
| `GSDC_INIT_CONFLICT` | `11` | Conflicto detectado en preflight por archivo modificado localmente sin registrar en manifiesto. |
| `GSDC_MANIFEST_MISSING` | `12` | Carpeta `.gsd-canva/` existe pero falta `manifest.json`. Requiere `--adopt` o `--force-all`. |
| `GSDC_INVALID_STATE` | `13` | Transición ilegal en `plan.json` (fase o estatus incorrecto en la máquina de estados). |
| `GSDC_DELIVERY_MISSING` | `14` | Falta de entregable válido: Sin archivos `.png` o `.pdf` mayores a 0 bytes en `delivery/plan_[ID]/`. |
| `GSDC_JSON_PARSE_ERROR` | `15` | Archivo de estado `plan.json` o `system_templates.json` corrupto o ilegible. |
| `GSDC_PERMISSION_DENIED` | `16` | Error de permisos de escritura o lectura en la fase transaccional de preflight. |
| `GSDC_ADAPTER_UNKNOWN` | `17` | El agente solicitado a través de `--agent` no es compatible. |
| `GSDC_AGENT_DISCOVERY_FAILED` | `18` | Validación estructural fallida en la ruta de prompts del agente. |
| `GSDC_AGENT_SKILLS_MISSING` | `19` | Faltan skills o comandos oficiales del agente validado por `doctor`. |
| `GSDC_ARTIFACT_MISSING` | `20` | Artefacto físico requerido (ej: `mockup.html`) no encontrado. |
| `GSDC_DECISIONS_CHANGED_AFTER_CONFIRMATION` | `21` | Tampering detectado: las decisiones fueron alteradas tras la confirmación criptográfica. |
