# Slash Command: /canva-mockup <nombre_diseño>

Este comando activa la **Fase 1: Prototipado e Iteración Visual** del framework `gsd-canva` utilizando Spec-Driven Development con un Yield Gate auditable criptográficamente.

---

## Instrucciones Operativas para el Agente

Cuando el usuario invoque este comando, debes ejecutar de forma obligatoria los siguientes pasos secuenciales utilizando el CLI global del framework:

### 0. Preflight del Entorno (OBLIGATORIO)
*   Antes de ejecutar cualquier otra acción, verifica que el CLI global de `gsd-canva` esté disponible en tu `PATH`:
    ```bash
    gsd-canva --help
    ```
    *(Alternativamente, puedes verificar con `command -v gsd-canva`)*.
*   ⚠️ **PARADA CRÍTICA**: Si el comando falla o no es encontrado, **detén tu ejecución inmediatamente**. Informa al usuario que el CLI global no está configurado o enlazado en su sistema y solicita que ejecute `npm install -g .` o `npm link` en el directorio raíz del framework antes de volver a intentar. **PROHIBIDO** instalar paquetes o buscar dependencias locales por tu cuenta.

### 1. Creación del Plan
*   Ejecuta el comando local del CLI para crear la estructura secuencial del plan de forma aislada en el proyecto:
    ```bash
    gsd-canva plan create --name "<nombre_diseño>"
    ```
*   Anota el **ID de tres dígitos** retornado (ej: `001`) y la ruta del plan (`canva-plans/plan_001_<nombre_diseño>/`). Toda tu actividad se restringirá estrictamente a esta carpeta. El plan iniciará en el estado `mockup:questions_pending`.

### 2. Levantamiento de Requisitos, Investigación y Confirmación (YIELD GATE OBLIGATORIO)
*   **Análisis del Contexto del Usuario**:
    *   Analiza la instrucción inicial del usuario cuidadosamente y clasifica el nivel de contexto recibido:
        *   **Contexto Completo**: El usuario proveyó vertical, audiencia, formato, paleta, copy y CTA → Pobla esos campos en `decisions.json` de inmediato.
        *   **Contexto Parcial**: El usuario proveyó algunos datos pero no todos → Pobla los campos conocidos en `decisions.json` y deja los demás como strings vacíos (`""`).
        *   **Sin Contexto**: El usuario solo proveyó un nombre genérico (ej: `test2`) → Deja TODOS los campos de `decisions.json` como strings vacíos (`""`).
    *   💡 **REGLA DE SUGERENCIAS**: Puedes diseñar y proponer opciones estéticas o creativas sugeridas al usuario en el chat, marcándolas **explícitamente como propuestas tentativas no confirmadas**. Sin embargo, está **PROHIBIDO** registrarlas en `decisions.json` o darlas por definitivas en `requerimientos.md` o `investigacion.md` sin el consentimiento explícito del usuario. Los campos desconocidos en los archivos se dejan con los placeholders originales del template hasta que sean validados.
*   **Poblado Obligatorio de Archivos (decisions.json primero)**:
    *   Escribe **SIEMPRE** en `decisions.json` primero. Este archivo es la fuente de verdad para el Yield Gate criptográfico. Los archivos Markdown (`requerimientos.md`, `investigacion.md`) se actualizan como espejo de lo que ya está en `decisions.json`.
    *   Los campos desconocidos en `decisions.json` se dejan como strings vacíos (`""`).
    *   Los campos desconocidos en los Markdown se dejan con los placeholders originales del template.
    *   ⚠️ **PROHIBIDO** editar `requerimientos.md` o `investigacion.md` con datos que no estén primero en `decisions.json`.
    *   Escribe las preguntas faltantes en la sección `Pendientes` de `preguntas.md`.
*   **Parada Obligatoria (Roadblock)**:
    1. Presenta en el chat un resumen de: (a) lo que sabes con certeza, (b) opciones tentativas que sugieres, y (c) lo que falta por definir.
    2. Formula preguntas específicas por cada campo vacío en `decisions.json`.
    3. Pide confirmación explícita al usuario para congelar el diseño.
    4. ⚠️ **DETÉN tu generación en el chat inmediatamente**. **PROHIBIDO** generar `mockup.html` o ejecutar comandos de transición de forma autónoma.
*   **Confirmación de Alineación**:
    *   Una vez que el usuario responda de conformidad en el chat, actualiza `decisions.json` y `preguntas.md`.
    *   Ejecuta el comando para registrar la confirmación y calcular el hash de integridad en el CLI:
        ```bash
        gsd-canva plan confirm-decisions --id <ID_DE_TRES_DÍGITOS>
        ```
    *   Transiciona el estado del plan ejecutando:
        ```bash
        gsd-canva plan resolve-questions --id <ID_DE_TRES_DÍGITOS>
        ```
    *   El plan avanzará al estado `mockup:ready_for_html`.

### 3. Propuesta Visual (Wireframing)
*   Sigue la guía del flujo de trabajo en `.gsd-canva/workflows/layout-conceptualization.md`.
*   Diseña la maqueta visual estructurando placeholders y CSS premium. Escríbela en el archivo `mockup.html` en la carpeta del plan.
*   **Envío del Boceto**:
    *   Una vez generado `mockup.html`, ejecuta el comando de entrega en el CLI:
        ```bash
        gsd-canva plan submit-mockup --id <ID_DE_TRES_DÍGITOS>
        ```
    *   El plan avanzará al estado `mockup:pending_approval`.
*   Presenta la propuesta visual y el concepto estético al usuario en el chat.

### 4. Aprobación del Boceto
*   Si el usuario solicita ajustes al mockup, edita el archivo HTML e itera.
*   Una vez aprobado el concepto final por el usuario, ejecuta el comando de aprobación del mockup:
    ```bash
    gsd-canva plan approve-mockup --id <ID_DE_TRES_DÍGITOS>
    ```
*   Esto moverá el plan al estado `mockup:approved`. Para comenzar la creación del borrador en Canva, el usuario o tú deberán invocar el comando `/canva-draft`.
