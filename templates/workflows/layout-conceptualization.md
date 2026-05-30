# Guía de Workflow: Conceptualización de Layouts y Wireframes

Este documento técnico de flujo de trabajo guía al agente sobre cómo conceptualizar la estructura visual y distribución de un diseño antes de interactuar con Canva.

---

## Directrices de Diseño Premium y Visuales

Como especialista en diseño visual, nunca crees maquetas visuales genéricas. Utiliza el siguiente conjunto de reglas de diseño premium:

### 1. Paleta Cromática Armoniosa (HSL)
*   **Colores de Marca**: Define siempre colores primarios, secundarios y de acento en formato HSL para facilitar variaciones de luminosidad y saturación.
    *   *Ejemplo*: Primario HSL(210, 80%, 20%) (Azul profundo premium), Acento HSL(340, 90%, 60%) (Rosa vibrante).
*   **Modo Oscuro / Cristal (Glassmorphic)**: Usa fondos semitransparentes en contenedores principales (`rgba(255, 255, 255, 0.05)`) con filtros de desenfoque (`backdrop-filter: blur(10px)`) para acabados premium.

### 2. Tipografía Moderna
*   Utiliza fuentes limpias e impactantes de Google Fonts como **Outfit**, **Inter**, **Outfit** o **Cabinet Grotesk**. Evita las fuentes por defecto del navegador.
*   Carga la fuente al inicio de tu maquetación HTML:
    ```html
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@400;500&display=swap" rel="stylesheet">
    ```

### 3. Coordenadas y Distribución de Placeholders
En Spec-Driven Development, los placeholders de contenido deben representarse de forma explícita.
*   **Cajas de Texto**: Delimítalas visualmente con líneas punteadas y etiquetas descriptivas.
*   **Placeholders de Imagen**: Usa rectángulos con una relación de aspecto limpia (p. ej: `aspect-ratio: 16 / 9` o `aspect-ratio: 1 / 1`) con bordes redondeados y un fondo sutil que represente visualmente la imagen.
*   Define las posiciones utilizando CSS Grid o Flexbox para garantizar un posicionamiento consistente que pueda mapearse matemáticamente a la cuadrícula cartesiana de Canva.

---

## Proceso de Creación del Mockup HTML

1. **Abre `plan_ejecucion.md`** y describe textualmente la estructura del layout propuesto (ej: "Sección superior: Logotipo (centrado); Sección media: Imagen Hero (1000px ancho) con título superpuesto; Sección inferior: Texto de campaña y botón de llamada a la acción").
2. **Genera el archivo `mockup.html`** en la carpeta secuencial del plan (`canva-plans/plan_XXX/`). Escribe un código HTML completo, premium, responsive y autoportante (todo el CSS embebido en `<style>`).
3. **Incluye animaciones sutiles** (p. ej., hover transitions de `transform: translateY(-4px)` y `box-shadow`) para dar dinamismo a la maqueta interactiva.
4. **Muestra el resultado** al usuario en el chat. Pídele que abra el archivo `mockup.html` en su navegador o previsualízalo si dispones de herramientas de renderizado en tiempo real.
5. **Itera los cambios** sobre `mockup.html` según las peticiones de ajuste del usuario.
