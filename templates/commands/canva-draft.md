# Slash Command: /canva-draft [ID]

Este comando inicializa la **Fase 1: Creación de Borradores y Registro de Plantillas** en Canva utilizando Spec-Driven Development.

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

1. **Validación del ID**:
   * Si el usuario no proporciona un ID (ej: `/canva-draft` a secas), ejecuta:
     ```bash
     gsd-canva plan list --phase mockup --json
     ```
   * Presenta al usuario la lista de planes en fase `mockup` aprobada, solicita interactivamente cuál desea procesar y **detén la ejecución hasta que defina el ID**.
   * Una vez definido el ID (ej: `001`), ejecuta la transición de estado:
     ```bash
     gsd-canva plan start-draft --id <ID_DE_TRES_DÍGITOS>
     ```

2. **Creación de Borradores en Canva (MCP)**:
   * Lee la propuesta aprobada en `plan_ejecucion.md` y los requisitos.
   * Llama a las herramientas MCP de Canva:
     * Sube las imágenes y logos especificados en los requisitos mediante `canva/upload-asset-from-url`.
     * Crea una o dos variantes del diseño en Canva usando `canva/generate-design` o creando copias de plantillas de marca con `canva/create-design-from-brand-template`.
     * Obtén los enlaces de edición editables resolviendo las direcciones con `canva/resolve-shortlink`.
     * Obtén las vistas previas de cada variante con `canva/get-design-thumbnail`.

3. **Galería de Revisión y Bucle de Feedback**:
   * Presenta las variantes en el chat utilizando una galería estructurada (o carrusel markdown) con sus respectivas imágenes embebidas.
   * Proporciona los enlaces de edición directos de Canva resueltos de forma clara:
     `[👉 Abrir y Editar Variante A en Canva](url_resuelto)`
   * Pregunta al usuario qué variantes le gustan y desea promover como plantillas oficiales de su sistema.
   * **Bucle de Ajustes**: Si el usuario no aprueba ninguna variante y solicita cambios manuales directos en Canva:
     * Pregúntale qué ajustes conceptuales o visuales desea.
     * Aplica las modificaciones de diseño sobre las variantes en Canva utilizando las herramientas del MCP.
     * Vuelve a generar las miniaturas y enlaces, y preséntalos de nuevo hasta obtener su aprobación formal.

4. **Catalogación y Aprobación de la Plantilla**:
   * Para la variante aprobada final por el usuario:
     * Llama a `canva/get-design-content` para mapear los elementos del diseño. Extrae los IDs únicos (`elementId`) de las cajas de texto y placeholders de imágenes.
     * Ejecuta el comando de registro en el catálogo del sistema:
       ```bash
       gsd-canva template register --id <CANVA_DESIGN_ID> --name "<Nombre_Plantilla_Sistema>" --plan <ID_DE_TRES_DÍGITOS>
       ```
     * Ejecuta la transición para aprobar la fase de borrador en el plan local:
       ```bash
       gsd-canva plan approve-draft --id <ID_DE_TRES_DÍGITOS>
       ```
     * Esto dejará el plan listo para la fase de refinamiento determinista (`draft:approved` -> listo para `/canva-refine`).
