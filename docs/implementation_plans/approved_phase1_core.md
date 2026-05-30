# Plan de Implementación Consolidado - GSD Canva (Arquitectura CLI Global - Rev. 12)

`gsd-canva` es un framework de desarrollo basado en especificaciones (Spec-Driven Development) de grado empresarial diseñado para guiar y estructurar el ciclo de vida de creación de elementos de Canva en dos fases:
*   **Fase 1: Prototipado e Iteración Visual**
*   **Fase 2: Ajuste Fino Determinista (Pixel-Perfect con MCP)**

Este documento representa la especificación de arquitectura definitiva, absoluta y congelada para la Fase 1. Se enfoca en una **arquitectura de CLI global (`npm install -g` o `npm link`)**, donde todas las operaciones se ejecutan a través del binario global `gsd-canva` sin copiar runtime al proyecto destino.

---

## Precisiones Arquitectónicas Definitivas (Congeladas)

### 1. Arquitectura de CLI Global (Global CLI Architecture)
El framework se instala como un paquete global de Node.js (`npm install -g` o `npm link`). Todas las operaciones se ejecutan a través del binario global `gsd-canva`, sin copiar runtime al proyecto destino:

*   El framework de desarrollo (`/Users/franciscoojeda/gsd-canva`) actuará como el **paquete global**.
*   Al inicializar un proyecto destino (usando `gsd-canva init`), el instalador copiará **únicamente plantillas y configuración** — nunca código ejecutable:
    *   `.gsd-canva/commands/` (Slash commands markdown).
    *   `.gsd-canva/workflows/` (Guías de flujo).
    *   `.gsd-canva/plan-templates/` (Plantillas de documentos).
    *   `.gsd-canva/manifest.json`, `config.json`, `config.local.example.json`.
*   **Ejecución Global**: Todas las operaciones subsecuentes del agente y del usuario se ejecutarán usando el binario global:
    ```bash
    gsd-canva plan create --name "MiCampaña"
    ```
*   `bin/` y `lib/` siguen siendo parte del paquete global del framework (listados en `package.json` → `files`) para distribución NPM — pero **no se copian al proyecto destino**.

### 2. Descubrimiento y Verificación de Prompts (Antigravity IDE)
*   **Encapsulación en `doctor`**: La verificación de compatibilidad con el IDE destino se delegará al comando global `gsd-canva doctor --agent <nombre>`.
*   **Verificación Estructural**: El comando realizará una comprobación estructural en el espacio de trabajo local:
    *   Validará la existencia y los permisos de acceso al directorio de comandos del IDE (por defecto `.antigravity/commands/`).
    *   Comprobará la validez sintáctica de las plantillas markdown del framework.
    *   Si se requiere una prueba activa en preflight, el CLI escribirá un archivo temporal transitorio (ej: `.antigravity/commands/.gsd-test-temp.md`) y lo **eliminará inmediatamente** tras confirmar los permisos de escritura del sistema de archivos, sin alterar permanentemente el workspace.

### 3. Alcance Restringido y Seguro de `--force-all`
Para evitar cualquier pérdida accidental de datos de campañas del usuario, la bandera `--force-all` tendrá un **alcance de borrado estrictamente limitado**:
*   **Archivos que SÍ puede sobrescribir/limpiar**:
    *   Directorio `.gsd-canva/` (manifest, config portable, workflows, plantillas).
    *   Específicamente los comandos markdown gestionados por el framework dentro de `.antigravity/commands/` (registrados en el manifest).
*   **Ausencia de manifiesto**: Si el manifiesto no existe en un proyecto preexistente y se ejecuta `--force-all`, el CLI local o del andamio utilizará una **allowlist fija e inmutable** que corresponde exactamente con los comandos oficiales del framework (`canva-mockup.md`, `canva-draft.md`, `canva-refine.md`, `canva-deliver.md`) para limpiar únicamente esos archivos del directorio `.antigravity/commands/`, evitando tocar cualquier comando ajeno o creado manualmente por el usuario.
*   **Archivos que JAMÁS tocará ni borrará**:
    *   La carpeta de historial y roadmaps de usuario `canva-plans/`.
    *   El catálogo técnico `system_templates.json`.
    *   El directorio de entregables descargados `delivery/`.
    *   Cualquier otra carpeta o archivo dentro de `.antigravity/` que no sea un comando gestionado por `gsd-canva`.

### 4. Sincronización Rigurosa en la Entrega (`plan deliver`)
Manteniendo una frontera limpia y estricta entre el CLI local y el MCP:
1.  **El Agente (MCP)**: Solicita la exportación a Canva, descarga los archivos de alta calidad PNG/PDF y los escribe físicamente en el directorio local `delivery/plan_[ID]/`.
2.  **El CLI Global (`gsd-canva plan deliver --id <id>`)**: Es invocado por el agente una vez finalizada la descarga.
    *   El CLI local **no realiza llamadas de red ni interactúa con Canva**.
    *   **Criterio de "Entregable Válido"**: El CLI local valida que el directorio `delivery/plan_[ID]/` exista físicamente, y contenga **al menos un archivo con extensión `.png` o `.pdf` cuyo tamaño en disco sea mayor a cero bytes**.
    *   Si la verificación es exitosa, transiciona el estado del plan de `deliver:ready` a `delivered`. Si los entregables no cumplen las condiciones, arroja un error estructurado bloqueando la transición.

### 5. Semántica Conservadora del Comando `--adopt`
Al ejecutar `init --adopt` sobre una carpeta `.gsd-canva/` preexistente sin manifiesto:
*   El CLI **únicamente adoptará y registrará** los archivos que correspondan estrictamente a rutas y nombres conocidos del framework.
*   Calculará sus firmas `sha256` y los registrará como controlados.
*   Cualquier otro archivo extraño o personalizado dentro de las carpetas será completamente ignorado o listado como "unmanaged", evitando asumir control de archivos arbitrarios del usuario.

### 6. Control de Esquemas en el Manifiesto (`schemaVersion`)
El archivo de control de auditoría `.gsd-canva/manifest.json` incluirá un número de versión del esquema para permitir migraciones seguras en el futuro sin romper proyectos heredados:
```json
{
  "schemaVersion": 1,
  "frameworkVersion": "1.0.0",
  "installedAt": "2026-05-30T05:50:00Z",
  "files": []
}
```

### 7. Instalador Transaccional (Fase Preflight)
Para evitar instalaciones corruptas o parciales:
*   Tanto la inicialización como la actualización local ejecutarán una **fase de preflight completa** antes de escribir un solo byte en el disco.
*   Se verificarán todos los permisos de escritura de las rutas de destino y se chequeará la presencia de conflictos no registrados en `.antigravity/commands/` y `.gsd-canva/`.
*   **Integración de `.gitignore`**: El preflight incluirá también la verificación de la existencia de `.gitignore` y sus permisos de escritura. Si el archivo no existe, se validará la viabilidad de su creación.
*   Si se detecta un solo conflicto bloqueante en la fase de preflight, **el instalador abortará de inmediato** sin realizar ninguna modificación, manteniendo el espacio de trabajo limpio e íntegro.

### 8. Configuración Local y Git-Safety Idempotente Delimitada
*   **config.local.json**: El archivo de configuración de máquina local se considera puramente opcional y no se creará por defecto físicamente para evitar archivos basura:
    *   `.gsd-canva/config.local.json` (Opcional, Gitignored, no creado por defecto).
*   **Marcadores de Bloque en `.gitignore`**: Cuando el instalador añada las reglas de exclusión a `.gitignore`, lo hará delimitando la sección con marcadores de bloque específicos de la herramienta:
    ```gitignore
    # >>> gsd-canva >>>
    delivery/
    .gsd-canva/config.local.json
    .gsd-canva/.lock
    # <<< gsd-canva <<<
    ```
    El CLI local verificará la existencia previa de este bloque completo y sus reglas de forma idempotente, evitando duplicar contenido o sobreescribir configuraciones manuales fuera del bloque.

### 9. Centralización Dinámica de Versiones y Empaquetamiento
*   **Centralización**: Para evitar la duplicación innecesaria de cadenas de texto y riesgos de desincronización, la propiedad `frameworkVersion` dentro del manifiesto y la salida de `gsd-canva version` **se leerán dinámicamente desde el archivo `package.json` principal del framework en tiempo de ejecución**, manteniéndola como la única fuente de verdad (Single Source of Truth).
*   **Rutas de Instalación Relativas**: El CLI resolverá todas las rutas a las carpetas `templates/` y al archivo `package.json` de forma **relativa al directorio de instalación del paquete** (usando `__dirname` o `path.resolve`), garantizando su correcto funcionamiento al ejecutarse globalmente o como módulo distribuido de Node, independientemente del `cwd` del usuario.
*   **Configuración del Paquete (NPM files)**: La propiedad `files` de `package.json` incluirá explícitamente los directorios `bin/`, `lib/` y `templates/` para garantizar que todos los recursos se distribuyan en el empaquetado y se probará localmente mediante el comando `npm pack`.

### 10. Lockfile Enriquecido (Exclusión Mutua Tolerante a macOS)
Para mitigar el reciclaje de PIDs en macOS y evitar bloqueos huérfanos, el archivo de concurrencia `.gsd-canva/.lock` contendrá un JSON estructurado:
```json
{
  "pid": 12345,
  "hostname": "macbook-pro.local",
  "cwd": "/Users/franciscoojeda/gsd-canva",
  "createdAt": "2026-05-30T05:50:00.000Z"
}
```
*   **Algoritmo de Verificación**: El Lock se considerará liberable si el `hostname` y el `cwd` coinciden y el `PID` indicado ya no existe en el sistema activo (validado mediante `process.kill(pid, 0)`), o si ha transcurrido un timeout estricto.
*   **Timeout Configurable**: El timeout por defecto de liberación es de 10,000 ms (10 segundos), pero el CLI dará soporte para ser sobreescrito mediante la variable de entorno `GSD_CANVA_LOCK_TIMEOUT_MS` (ej. `GSD_CANVA_LOCK_TIMEOUT_MS=30000`), ideal para entornos con hardware lento o sistemas CI/CD.

---

## Máquina de Estados de la Planificación

El ciclo de vida operativo de cada plan creado bajo `canva-plans/` está gobernado por una secuencia transaccional estricta e intuitiva, eliminando estados redundantes. La máquina de estados se escribe en disco de forma atómica (escribiendo cambios en un archivo `.tmp` antes de renombrarlo a `plan.json`):

```text
mockup:pending -> mockup:approved -> draft:pending -> draft:approved -> refine:pending -> deliver:ready -> delivered
```

*   **Transición a `deliver:ready`**: El comando global `gsd-canva plan approve-refine --id <id>` marcará la aprobación de refinamientos, moviendo el plan **directamente** a `deliver:ready`.

---

## Contrato de Interfaces en Modo `--json`

Para garantizar un parsing perfecto y evitar la rotura de pipelines de automatización controlados por agentes de IA, definimos una separación absoluta y libre de ruido en sus canales:

### 1. Salida de Éxito en `stdout`
Contendrá **única y exclusivamente datos JSON parseables** en formato unificado ante ejecuciones exitosas:
```json
{
  "ok": true,
  "data": {}
}
```
*   La propiedad `data` será completada por cada comando específico (ej: `plan create` retornará el `planId` y el nombre asignado en `data`).
*   Cuando la operación sea exitosa en modo `--json`, el flujo **`stderr` permanecerá en completo silencio** (sin logs de progreso ni mensajes informativos) para evitar cualquier tipo de ruido en la lectura de la máquina.

### 2. Salida de Error en `stderr`
En caso de fallos, `stdout` permanecerá en completo silencio y la salida estructurada del error **se canalizará a `stderr` en formato JSON puro**, garantizando que un agente pueda parsear el flujo de error de forma aislada y sin mezclar logs informativos de texto humano.
*   Los logs humanos, warnings o textos decorativos generales **solo se imprimirán cuando NO esté activa la bandera `--json`**, o cuando el usuario especifique explícitamente la bandera `--verbose` para depuración humana.

#### Esquema del Error JSON en `stderr`
```json
{
  "ok": false,
  "code": "GSDC_CODIGO_ERROR",
  "message": "Mensaje descriptivo claro y detallado del error.",
  "details": {}
}
```

#### Tabla Oficial de Errores
| Código de Error | Exit Code | Descripción |
| :--- | :---: | :--- |
| `GSDC_LOCK_TIMEOUT` | `10` | No se pudo adquirir el Lockfile de concurrencia después de expirar el timeout configurado. |
| `GSDC_INIT_CONFLICT` | `11` | La fase de preflight de `init` abortó porque existen archivos modificados localmente y no registrados. |
| `GSDC_MANIFEST_MISSING` | `12` | Se encontró la carpeta `.gsd-canva/` pero no el archivo `manifest.json`. Requiere `--adopt` o `--force-all`. |
| `GSDC_INVALID_STATE` | `13` | Intento de transición de estado ilegal en `plan.json` (fase o estatus incorrecto en la máquina de estados). |
| `GSDC_DELIVERY_MISSING` | `14` | `plan deliver` falló porque no se encontró al menos un archivo `.png` o `.pdf` mayor a 0 bytes en `delivery/plan_[ID]/`. |
| `GSDC_JSON_PARSE_ERROR` | `15` | El archivo de estado `plan.json` o `system_templates.json` está corrupto o es ilegible. |
| `GSDC_PERMISSION_DENIED` | `16` | Error de permisos del sistema de archivos al intentar leer/escribir durante el preflight. |
| `GSDC_AGENT_UNSUPPORTED` | `17` | El agente o IDE de IA solicitado (a través de `--agent`) no tiene integración soportada. |
| `GSDC_AGENT_DISCOVERY_FAILED` | `18` | No se pudo validar la ruta, los permisos o la estructura de prompts del agente solicitado durante la validación estructural. |

---

## Organización Definitiva del Workspace

```text
.gsd-canva/
  ├── manifest.json              <-- Hashes sha256, mappings y schemaVersion: 1
  ├── config.json                <-- Configuración portable (Commiteado)
  ├── config.local.example.json  <-- Plantilla de configuración local
  ├── commands/                  <-- Slash commands markdown
  ├── workflows/                 <-- Guías y especificaciones de flujo
  └── plan-templates/            <-- Plantillas de documentos de planificación
  └── .lock                      <-- Lockfile temporal de concurrencia (Gitignored/Temporal)

.antigravity/
  └── commands/                  <-- Copias sincronizadas de comandos markdown (IDE)

canva-plans/                     <-- Historial e información de usuario (Commiteado)
  ├── plan_001_[nombre]/
  │     ├── plan.json            <-- Máquina de estados con transiciones explícitas
  │     ├── requerimientos.md
  │     ├── investigacion.md
  │     ├── preguntas.md
  │     ├── plan_ejecucion.md
  │     └── roadmap_progreso.md
  └── plan_002_[nombre]/

system_templates.json            <-- Catálogo técnico de placeholders (Commiteado)
delivery/                        <-- Entregables binarios finales PNG/PDF (Gitignored)

---

## Fases del Desarrollo (MVP Estrecho)

### Fase 1: Core del CLI y Runtime Local
1.  **Infraestructura CLI**: `package.json` (con declaración de `files`), `bin/gsd-canva.js` con el enrutador, verbos de transición, rutas relativas de resolución y salida estricta de éxito `{ ok: true, data: {} }`.
2.  **Lógica del Instalador Seguro (`lib/installer.js`)**: Fase preflight transaccional, `schemaVersion: 1`, `sha256` hashes, copias directas de comandos a `.antigravity/commands/`, manifest enriquecido, `--adopt` / `--force-all` (con alcance y allowlist restringida), respaldos fechados en `upgrade`, migración de limpieza de runtime legacy, y manipulación de `.gitignore` con marcadores.
3.  **Lógica de Bloqueo e IDs Atómicos (`lib/lock-manager.js`)**: Lockfile con metadatos de PID, hostname, cwd y timestamp para evitar PIDs reciclados en macOS, configurable mediante `GSD_CANVA_LOCK_TIMEOUT_MS`.
4.  **Gestión de Estados (`lib/plan-manager.js`)**: Operaciones atómicas en archivos y control rígido de la máquina de estados con verbos explícitos (y verificación local del entregable en `deliver` según criterios de extensión y tamaño).
5.  **Catálogo de Plantillas (`lib/template-catalog.js`)**: Registro estructurado en `system_templates.json`.
6.  **Plantillas Markdown Iniciales**: Requisitos, workflows y comandos slash (actualizados para ejecutar `gsd-canva` global con preflight obligatorio).
7.  **Suite de Tests y empaquetado**: Pruebas completas de instalación transaccional (incluyendo `.gitignore` y marcadores), transiciones de estados e IDs atómicos, además de validación local de empaquetado con `npm pack`.
