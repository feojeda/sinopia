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

⚠️ **REGLA FUNDAMENTAL**: Todas las respuestas del usuario se registran **exclusivamente** a través del CLI. Está **PROHIBIDO** escribir `decisions.json` directamente. El agente nunca edita ese archivo a mano.

#### 2.1 Obtener estado de preguntas

Después de crear el plan, ejecuta inmediatamente:

```bash
gsd-canva plan questions --id <ID> --json
```

Esto retorna un JSON estructurado con:
- `pending`: lista de campos que faltan por responder (cada uno con `id`, `question`, `type`, `options`, `allowCustom`, `required`, `placeholder`).
- `filled`: lista de campos ya respondidos.
- `requiredPendingCount`, `optionalPendingCount`, `allQuestionsAddressed`, `confirmed`, `readOnly`, `suggestedAction`.

Si `suggestedAction` es `retry_resolve`, el plan ya fue confirmado y solo falta ejecutar `resolve-questions`.

#### 2.2 Pre-poblado desde contexto del usuario

Analiza la instrucción inicial del usuario y clasifica el nivel de contexto recibido:

- **Contexto Completo**: El usuario proveyó vertical, audiencia, formato, paleta, copy y CTA → Registra cada campo vía `plan answer`.
- **Contexto Parcial**: El usuario proveyó algunos datos → Registra los campos conocidos vía `plan answer` y deja los demás pendientes.
- **Sin Contexto**: El usuario solo proveyó un nombre genérico → No registres nada; procede al flujo de preguntas.

Para cada campo conocido, ejecuta:

```bash
gsd-canva plan answer --id <ID> --field <campo> --value "<valor>"
```

💡 **REGLA DE SUGERENCIAS**: Puedes proponer opciones estéticas o creativas en el chat, marcándolas **explícitamente como propuestas tentativas no confirmadas**. Sin embargo, está **PROHIBIDO** registrar propuestas en el plan sin el consentimiento explícito del usuario.

#### 2.3 Flujo interactivo de preguntas

Vuelve a ejecutar `plan questions --id <ID> --json` para ver qué campos quedan pendientes.

**Si el entorno soporta UI interactiva nativa (Antigravity):**
- Presenta las preguntas pendientes usando la interfaz nativa del entorno.
- Cada respuesta del usuario se guarda con `plan answer`.

**Si el entorno NO soporta UI interactiva nativa (fallback textual):**
- Presenta las preguntas pendientes **de una en una** o en un bloque agrupado, según prefieras.
- Para campos `type: "choice"` con opciones, lista las opciones numeradas.
- Para campos `type: "choice"` con `allowCustom: true`, indica explícitamente que el usuario puede escribir una opción personalizada además de las listadas.
- Para campos `type: "text"`, muestra el placeholder como guía.
- Cada respuesta del usuario se guarda con `plan answer`.

Repite hasta que `requiredPendingCount` sea `0`.

#### 2.4 Pregunta opcional de assets

Una vez que todos los campos requeridos estén respondidos, pregunta explícitamente al usuario:

> "¿Tienes assets (logo, imágenes, íconos) que quieras incluir? Puedes indicarlos o decir 'no' para omitir."

Registra la respuesta con `plan answer --id <ID> --field assets --value "<valor>"` (usar `""` para omitir).

Esto marca `allQuestionsAddressed` como `true`.

#### 2.5 Resumen y confirmación final

Presenta al usuario un resumen de todas las decisiones registradas y pide su aprobación explícita para congelar el diseño.

⚠️ **REGLAS DE CONFIRMACIÓN**:
- La confirmación se parsea **únicamente** del último mensaje del usuario en el turno de aprobación final.
- **PROHIBIDO** usar las palabras "confirmo" o "confirmado" en tus mensajes de estado o relleno antes del paso de confirmación final. Usa alternativas como: "registrado", "anotado", "listo para revisar", "guardado".
- ⚠️ **DETÉN tu generación en el chat inmediatamente**. **PROHIBIDO** generar `mockup.html` o ejecutar comandos de transición de forma autónoma sin confirmación.

Una vez que el usuario confirme explícitamente:

```bash
gsd-canva plan confirm-decisions --id <ID>
```

Luego transiciona el estado:

```bash
gsd-canva plan resolve-questions --id <ID>
```

El plan avanzará al estado `mockup:ready_for_html`.

#### 2.6 Cambios post-confirmación

Si el usuario solicita cambios **después** de haber confirmado, ejecuta:

```bash
gsd-canva plan reset-confirmation --id <ID>
```

Esto revierte la confirmación, limpia el hash de integridad y devuelve el plan a `mockup:questions_pending`, permitiendo responder campos nuevamente con `plan answer`. Los campos requeridos se preservan; los opcionales se limpian. Luego repite el flujo desde 2.3.

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
