# GSD Canva (Spec-Driven Canva Lifecycle Framework)

`gsd-canva` es un framework de grado empresarial y herramienta CLI diseñada para guiar el ciclo de vida de creación de elementos en Canva de forma estructurada a través de **Spec-Driven Development (SDD)**.

Inspirado en GSD (Goal-Seeking Development), establece una división de responsabilidades robusta, aislante y atómica para evitar alucinaciones visuales y pérdidas de precisión en la IA mediante un flujo interactivo de dos fases:

*   **Fase 1: Prototipado e Iteración Visual** (Maquetación HTML local e inicialización de borradores).
*   **Fase 2: Ajuste Fino Determinista** (Edición matemática pixel-perfect en Canva mediante transacciones MCP sin adivinaciones).

---

## 🛠 Arquitectura del Workspace

El framework organiza tu proyecto destino estructurando limpiamente los archivos del sistema, datos de usuario y salidas:

```text
.gsd-canva/
  ├── manifest.json              <-- Hashes sha256, mappings y schemaVersion: 1 (Sistema)
  ├── config.json                <-- Configuración portable (Commiteado)
  ├── config.local.example.json  <-- Plantilla de configuración local
  ├── commands/                  <-- Plantillas de comandos slash markdown
  ├── workflows/                 <-- Especificaciones y guías de flujos
  └── .lock                      <-- Lockfile de concurrencia temporal (Gitignored/Temporal)

.antigravity/
  └── commands/                  <-- Comandos markdown copiados e indexados por el IDE

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
gsd-canva init
```
*Si deseas forzar la sobrescritura segura de las plantillas controladas por el manifest en caso de actualizaciones, corre: `gsd-canva init --force-all`.*
*Si deseas adoptar archivos preexistentes conocidos sin sobreescribir contenido, corre: `gsd-canva init --adopt`.*

### 3. Diagnóstico de Salud
Verifica la salud del espacio de trabajo y compatibilidad estructural con tu IDE (como Antigravity):
```bash
gsd-canva doctor --agent antigravity
```

---

## 📋 Comandos Slash e Interfaces del Agente

Los comandos slash se copian a `.antigravity/commands/` para ser descubiertos e indexados por tu agente de IA de forma nativa:

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
| `GSDC_AGENT_UNSUPPORTED` | `17` | El agente o IDE de IA solicitado a través de `--agent` no es compatible. |
| `GSDC_AGENT_DISCOVERY_FAILED` | `18` | Validación estructural fallida en la ruta de prompts del IDE solicitado. |
