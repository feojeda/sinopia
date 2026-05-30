# Slash Command: /canva-refine [ID]

Este comando activa la **Fase 2: Ajuste Fino Determinista (Pixel-Perfect)** en Canva utilizando Spec-Driven Development.

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
   * Si el usuario no proporciona un ID, ejecuta:
     ```bash
     gsd-canva plan list --phase draft --json
     ```
   * Muestra los planes listos, solicita la selección del ID y **bloquea el avance** hasta que se defina.
   * Una vez definido el ID (ej: `001`), ejecuta la transición de estado local:
     ```bash
     gsd-canva plan start-refine --id <ID_DE_TRES_DÍGITOS>
     ```

2. **Mapeo de Placeholders y Plan de Edición**:
   * Abre `plan_edicion.md` en la carpeta del plan (créalo si no existe).
   * Carga los placeholders registrados para este diseño desde `system_templates.json`.
   * Pide al usuario que especifique los ajustes exactos de contenido y diseño que desea (ej: *"Cambiar el título a 'Nueva Oferta especial!', subir el tamaño de letra a 24px, y mover el logo 30 píxeles a la derecha"*).
   * Documenta de forma matemática los cambios requeridos en `plan_edicion.md` vinculando los IDs únicos de los elementos de Canva.

3. **Ejecución Transaccional Determinista (Canva MCP)**:
   * **Frontera de Seguridad**: Ejecutarás modificaciones matemáticas exactas en lugar de generaciones semánticas o alucinadas por la IA:
     * Inicia una transacción llamando a `canva/start-editing-transaction`.
     * Ejecuta las operaciones exactas llamando a `canva/perform-editing-operations`. Esto incluye:
       * Actualización de propiedades de texto (cambiar el valor de texto, `fontSize`, alineación, tipografía).
       * Transformaciones geométricas (modificar coordenadas `x`, `y`, ancho `w`, alto `h` sumando o restando distancias exactas).
       * Reemplazo de imágenes en placeholders de imagen.
     * Completa el envío de la transacción. Si hay un error, cancela y avisa al usuario.
   * Llama a `canva/get-design-thumbnail` para obtener la miniatura del diseño recién modificado.

4. **Verificación y Transición Directa**:
   * Muestra la miniatura actualizada en el chat para validación visual inmediata.
   * Si el usuario requiere más ajustes deterministas, itera en el paso 3.
   * Una vez que el usuario dé su aprobación total a los ajustes visuales, ejecuta el comando de aprobación final:
     ```bash
     gsd-canva plan approve-refine --id <ID_DE_TRES_DÍGITOS>
     ```
   * **Transición Directa**: Este comando moverá el estado del plan local directamente a `deliver:ready` (listo para entrega física), archivando la aprobación en el historial.
