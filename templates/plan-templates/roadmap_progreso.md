# Roadmap de Progreso del Plan de Diseño

Este documento sirve como el panel de control interactivo para rastrear el progreso secuencial del ciclo de vida de este diseño en Canva.

---

## 🚀 Estado General del Plan: `[ ] Pendiente`

*   **ID del Plan**: [ID de tres dígitos, ej: 001]
*   **Diseño**: [Nombre descriptivo]
*   **Fase Actual**: `[ ] mockup:pending`

---

## 📋 Lista de Hitos del Ciclo de Vida

### 🎨 Fase 1: Prototipado e Iteración Visual (`mockup`)
- `[ ]` **Paso 1.1**: Crear estructura de carpetas secuenciales (`plan create`).
- `[ ]` **Paso 1.2**: Completar el levantamiento en `requerimientos.md`.
- `[ ]` **Paso 1.3**: Realizar investigación visual en `investigacion.md`.
- `[ ]` **Paso 1.4**: Diseñar la maqueta interactiva HTML `mockup.html`.
- `[ ]` **Paso 1.5**: Obtener la aprobación del mockup del usuario.
- `[ ]` **Paso 1.6**: Ejecutar transición de aprobación (`plan approve-mockup`).

### 📦 Fase 2: Creación de Borradores y Catalogación (`draft`)
- `[ ]` **Paso 2.1**: Inicializar la fase de borradores en Canva (`plan start-draft`).
- `[ ]` **Paso 2.2**: Subir assets al MCP de Canva y generar variantes del diseño.
- `[ ]` **Paso 2.3**: Exponer enlaces editables y miniaturas en el chat.
- `[ ]` **Paso 2.4**: Iterar bucle de feedback y ajustes hasta aprobar variante final.
- `[ ]` **Paso 2.5**: Escanear elementos y registrar plantilla en `system_templates.json` (`template register`).
- `[ ]` **Paso 2.6**: Ejecutar transición de aprobación (`plan approve-draft`).

### 🛠 Fase 3: Ajuste Fino Determinista (`refine`)
- `[ ]` **Paso 3.1**: Inicializar la fase de refinamiento determinista (`plan start-refine`).
- `[ ]` **Paso 3.2**: Completar los requerimientos de edición en `plan_edicion.md`.
- `[ ]` **Paso 3.3**: Ejecutar transacciones matemáticas exactas en Canva MCP.
- `[ ]` **Paso 3.4**: Solicitar miniatura y verificar visualmente con el usuario.
- `[ ]` **Paso 3.5**: Ejecutar aprobación final de refinamiento (`plan approve-refine`), transicionando directamente a `deliver:ready`.

### 🚚 Fase 4: Exportación y Entrega (`deliver`)
- `[ ]` **Paso 4.1**: Solicitar exportación PNG/PDF de alta resolución vía Canva MCP.
- `[ ]` **Paso 4.2**: Descargar físicamente los entregables bajo `delivery/plan_[ID]/`.
- `[ ]` **Paso 4.3**: Ejecutar verificación física final en el CLI (`plan deliver`), bloqueando el estado como `delivered`.
