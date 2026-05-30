# Guía de Workflow: Ajuste Fino Determinista (Pixel-Perfect)

Este documento técnico de flujo de trabajo guía al agente sobre cómo realizar modificaciones milimétricas y precisas sobre el Canvas de Canva mediante transacciones deterministas del MCP, eliminando la aleatoriedad de la IA.

---

## El Protocolo de Edición Determinista

Cuando el usuario solicite un ajuste sobre una plantilla registrada (ej: *"mueve el título 20 píxeles arriba y cambia su tamaño a 22px"*), debes seguir estrictamente este protocolo matemático:

### 1. Lectura del Catálogo y Mapeo
*   Abre `system_templates.json` y busca el `designId` del plan actual.
*   Carga la lista de `placeholders`. Cada elemento tendrá un `elementId` único asignado por Canva (ej: `text_box_title_01`) y sus propiedades geométricas registradas (coordenadas `x`, `y`, ancho `w`, alto `h`).

### 2. Cálculo Geométrico Cartesiano
*   Nunca adivines las nuevas posiciones. Realiza cálculos matemáticos directos basándote en la petición del usuario:
    *   *Mover arriba*: Resta al eje `y` (ej: `nuevoY = y - 20`).
    *   *Mover abajo*: Suma al eje `y` (ej: `nuevoY = y + 20`).
    *   *Mover derecha*: Suma al eje `x` (ej: `nuevoX = x + 30`).
    *   *Mover izquierda*: Resta al eje `x` (ej: `nuevoX = x - 30`).
*   Registra estos nuevos valores calculados en `plan_edicion.md` antes de aplicarlos.

### 3. Ejecución de la Transacción en Canva MCP
Para garantizar que las ediciones se apliquen en bloque de forma segura y consistente, utilizarás el mecanismo de transacciones del MCP de Canva:

1.  **Iniciar Transacción**:
    *   Llama al tool `canva/start-editing-transaction` enviando el `designId`.
    *   Guarda el identificador de la transacción devuelto.
2.  **Agregar Operaciones de Edición**:
    *   Llama a `canva/perform-editing-operations` enviando el ID de la transacción y el lote de operaciones de edición exactas.
    *   *Operación de Texto*:
        ```json
        {
          "type": "update-text",
          "elementId": "text_box_title_01",
          "text": "¡Nuevo Título!",
          "fontSize": 24,
          "color": "#FF0055"
        }
        ```
    *   *Operación Geométrica*:
        ```json
        {
          "type": "update-geometry",
          "elementId": "logo_image_01",
          "x": 150,
          "y": 80,
          "w": 120,
          "h": 120
        }
        ```
    *   *Operación de Imagen*:
        ```json
        {
          "type": "update-image",
          "elementId": "image_placeholder_01",
          "assetId": "ASSET_ID_CARGADO"
        }
        ```
3.  **Confirmar Transacción**:
    *   Si todas las operaciones fueron exitosas, confirma los cambios llamando a `canva/commit-editing-transaction`.
    *   Si alguna operación falló, cancela inmediatamente llamando a `canva/cancel-editing-transaction` para restaurar el diseño original de forma segura y reporta el error.

### 4. Inspección Visual y Cierre de Ajustes
*   Llama al tool `canva/get-design-thumbnail` para solicitar una miniatura actualizada del diseño.
*   Presenta la miniatura en el chat para validación humana.
*   Actualiza el historial y el archivo `plan_edicion.md` del plan local indicando los cambios aplicados con éxito.
