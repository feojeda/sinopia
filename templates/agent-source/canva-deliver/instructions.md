Este comando realiza el cierre de la **Fase 2: Exportación y Entrega Física** de assets de Canva en el espacio de trabajo local utilizando Spec-Driven Development.

---

## Instrucciones Operativas para el Agente

Cuando el usuario invoque este comando, debes ejecutar de forma obligatoria los siguientes pasos secuenciales utilizando el CLI global del framework:

### 0. Preflight del Entorno (OBLIGATORIO)
*   Antes de ejecutar cualquier otra acción, verifica que el CLI global de `gsd-canva` esté disponible en tu `PATH`:
    ```bash
    gsd-canva --help
    ```
    *(Alternativamente, puedes verificar con `command -v gsd-canva`)*.
*   ⚠️ **PARADA CRÍTICA**: Si el comando falla o no es encontrado, **detén tu ejecución inmediatamente**. Informa al usuario que el CLI global no está configurado o enlazado en su sistema y solicita que ejecute `npm install -g .` o `npm link` en el directorio raíz del framework antes de volver a intentar. **PROHIBIDO** instalar paquetes o buscar dependencias locales por su cuenta.

1. **Validación del ID**:
   * Si el usuario no proporciona un ID, ejecuta:
     ```bash
     gsd-canva plan list --phase deliver --json
     ```
   * Muestra la lista, solicita interactivamente al usuario seleccionar el plan pendiente y **detén la ejecución hasta confirmarlo**.
   * Una vez verificado el ID (ej: `001`), comprueba que el estado del plan local sea `deliver:ready` mediante:
     ```bash
     gsd-canva plan status --id <ID_DE_TRES_DÍGITOS>
     ```

2. **Exportación y Descarga de Canva (MCP)**:
   * **Responsabilidad del Agente**: Realizarás la llamada de red y exportación a través de tu entorno:
     * Llama a `canva/export-design` enviando el `designId` del plan y configurando el formato solicitado por el usuario (ej: PNG o PDF).
     * Realiza consultas de estado periódicas (polling) sobre la exportación hasta obtener la URL de descarga final.
     * Descarga el archivo de alta calidad en tu entorno local.
     * Crea la carpeta física `delivery/plan_<ID_DE_TRES_DÍGITOS>/` en la raíz del proyecto.
     * Guarda el archivo descargado físicamente en esa carpeta (ej: `delivery/plan_001/flyer_evento.png`).

3. **Verificación Física y Cierre del Plan (CLI)**:
   * Una vez que hayas terminado de guardar las descargas de forma local, invoca al CLI para que realice la **verificación física e independiente de los entregables**:
     ```bash
     gsd-canva plan deliver --id <ID_DE_TRES_DÍGITOS>
     ```
   * **Lógica del CLI**: El CLI inspeccionará el directorio `delivery/plan_<ID>/` para corroborar que:
     * Contenga al menos un archivo con extensión `.png` o `.pdf`.
     * El tamaño en disco de los archivos sea mayor a cero bytes.
   * Si el CLI da su visto bueno, bloqueará el estado del plan como **`delivered`** (Finalizado con éxito).
   * Muestra los archivos listos al usuario en el chat y felicítalo por la entrega.
