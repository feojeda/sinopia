# Plan de Alineación Arquitectónica: CLI Global y Espacio de Trabajo Limpio (Rev. 17)

Este plan de alineación resuelve la discrepancia de diseño señalada por tu segundo agente, retornando a una **arquitectura de CLI global y limpia** que evita la duplicación de runtime y la necesidad de instalar dependencias como `commander` o `chalk` en las carpetas destino de tus campañas.

---

## 1. Ajustes y Alineaciones Arquitectónicas

### A. Eliminación del Runtime Copiado (Zero Code Duplication)
*   **El Problema**: El instalador (`init` y `upgrade` en `lib/installer.js`) copiaba físicamente las carpetas `bin/` y `lib/` del framework dentro de `.gsd-canva/bin` y `.gsd-canva/lib` en el proyecto de tu campaña. Esto provocaba que al ejecutar `node .gsd-canva/bin/gsd-canva.js` en una carpeta vacía, fallara por falta de `commander` y `chalk`, obligando a correr `npm install` en el destino.
*   **La Solución**: 
    1.  **Modificar `lib/installer.js`** para que **NO copie** las carpetas `bin/` ni `lib/` al proyecto destino. La carpeta `.gsd-canva` en el destino de tus campañas **únicamente contendrá plantillas y archivos de configuración** (`commands/`, `workflows/`, `plan-templates/`, `manifest.json`, `config.json`).
    2.  Todas las ejecuciones de comandos en las plantillas markdown y flujos de trabajo del agente se realizarán utilizando el binario global del framework:
        ```bash
        gsd-canva plan ...
        ```
    3.  Dado que `gsd-canva` se ejecuta a través del binario del framework global (`/Users/franciscoojeda/gsd-canva`), **las dependencias (`commander`, `chalk`) se resolverán directamente en el entorno global del framework**, eliminando por completo la necesidad de ensuciar tus carpetas de campaña con `node_modules`.

### B. Protocolo Riguroso de Actualización de `decisions.json`
*   **El Problema**: En la prueba, el agente leyó `decisions.json`, pero luego solo editó los archivos Markdown (`requerimientos.md`, `investigacion.md` y `preguntas.md`), dejando `decisions.json` vacío.
*   **La Solución**:
    *   Refinar el prompt en [canva-mockup.md](file:///Users/franciscoojeda/gsd-canva/templates/commands/canva-mockup.md) para indicar de manera explícita que **el archivo `decisions.json` debe ser editado físicamente antes de cualquier confirmación**.
    *   El agente debe poblar las decisiones directamente en el JSON antes de solicitar la confirmación en el chat.

### C. Mitigación del Sesgo Creativo (Invención Controlada)
*   **El Problema**: Ante el prompt vacío `test2`, el agente inventó por su cuenta una marca muy específica ("Urban Coffee Roasters").
*   **La Solución**:
    *   Modificar las directrices en `canva-mockup.md` para instruir al agente a que, si el prompt inicial no provee vertical ni contexto, proponga **placeholders conceptuales limpios** o una terna de opciones generales al usuario, en lugar de forzar una identidad de campaña altamente específica.
    *   Asegurar que el lenguaje técnico sea exacto: referirse siempre a *"registrar la confirmación y calcular el hash criptográfico de integridad"*, evitando el término impreciso "firmar".

---

## Proposed Changes

### Componente: Instalador e Inicialización (Scaffolding)

#### [MODIFY] [lib/installer.js](file:///Users/franciscoojeda/gsd-canva/lib/installer.js)
*   Remover la copia recursiva de `frameworkBinDir` y `frameworkLibDir` hacia el destino.
*   Actualizar la fase de preflight para que no valide conflictos sobre `bin/` y `lib/` locales inexistentes.
*   Actualizar el manifiesto para registrar únicamente los archivos bajo `.gsd-canva` que correspondan a plantillas o configuraciones.

### Componente: Plantillas y Comandos

#### [MODIFY] [canva-mockup.md](file:///Users/franciscoojeda/gsd-canva/templates/commands/canva-mockup.md)
*   Asegurar que todas las instrucciones operativas llamen a `gsd-canva` en lugar de `node .gsd-canva/bin/gsd-canva.js`.
*   Dar instrucciones explícitas de no auto-completar decisiones de forma sesgada si no hay contexto.
*   Establecer la obligatoriedad de escribir físicamente en `decisions.json` antes de pedir la confirmación.

#### [MODIFY] [canva-draft.md](file:///Users/franciscoojeda/gsd-canva/templates/commands/canva-draft.md)
*   Actualizar llamadas de CLI de `node .gsd-canva/bin/...` a `gsd-canva`.

#### [MODIFY] [canva-refine.md](file:///Users/franciscoojeda/gsd-canva/templates/commands/canva-refine.md)
*   Actualizar llamadas de CLI a `gsd-canva`.

#### [MODIFY] [canva-deliver.md](file:///Users/franciscoojeda/gsd-canva/templates/commands/canva-deliver.md)
*   Actualizar llamadas de CLI a `gsd-canva`.

---

## Plan de Verificación

### Automated Tests
#### [MODIFY] [tests/installer.test.js](file:///Users/franciscoojeda/gsd-canva/tests/installer.test.js)
*   Actualizar assertions para validar que `bin/` y `lib/` **no se copian** en la carpeta del proyecto destino durante `init`.
*   Verificar que `manifest.json` no registre archivos de `bin/` ni `lib/`.

#### [MODIFY] [tests/plan.test.js](file:///Users/franciscoojeda/gsd-canva/tests/plan.test.js)
*   Asegurar que la simulación de tests corra de forma consistente sin requerir dependencias locales en el proyecto destino.
