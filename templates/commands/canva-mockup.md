# Slash Command: /canva-mockup <nombre_diseño>

Este comando activa la **Fase 1: Prototipado e Iteración Visual** del framework `gsd-canva` utilizando Spec-Driven Development con un Yield Gate auditable criptográficamente.

---

## Instrucciones Operativas para el Agente

Cuando el usuario invoque este comando, debes ejecutar de forma obligatoria los siguientes pasos secuenciales utilizando el CLI local de Node:

### 1. Creación del Plan
*   Ejecuta el comando local del CLI para crear la estructura secuencial del plan de forma aislada en el proyecto:
    ```bash
    gsd-canva plan create --name "<nombre_diseño>"
    ```
*   Anota el **ID de tres dígitos** retornado (ej: `001`) y la ruta del plan (`canva-plans/plan_001_<nombre_diseño>/`). Toda tu actividad se restringirá estrictamente a esta carpeta. El plan iniciará en el estado `mockup:questions_pending`.

### 2. Levantamiento de Requisitos, Investigación y Confirmación (YIELD GATE OBLIGATORIO)
*   **Análisis Inteligente**: Analiza la instrucción inicial del usuario.
    *   Si el usuario ya proveyó detalles (ej: formato, textos, paleta), **pobla de inmediato esos campos en `decisions.json`** y deja la sección `Pendientes` de `preguntas.md` vacía para esos temas.
    *   Si hay dudas, escríbelas en la sección `Pendientes` de `preguntas.md` y deja vacíos los campos correspondientes en `decisions.json`.
*   Abre `requerimientos.md` e `investigacion.md` y completa los datos de dimensiones, paleta HSL propuesta y tipografías.
*   **Parada Obligatoria (Roadblock)**:
    1. Presenta un resumen estético en el chat con las decisiones propuestas (Vertical, Audiencia, Formato, Paleta, Copy, CTA) y las preguntas pendientes.
    2. Pide confirmación explícita al usuario para congelar el diseño.
    3. ⚠️ **DETÉN tu generación en el chat inmediatamente**. **PROHIBIDO** generar `mockup.html` o ejecutar comandos de transición de forma autónoma.
*   **Confirmación de Alineación**:
    *   Una vez que el usuario responda de conformidad en el chat, actualiza `decisions.json` y `preguntas.md`.
    *   Ejecuta el comando de firma de integridad en el CLI:
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
