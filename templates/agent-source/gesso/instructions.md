Este comando activa la **Fase 0: Gesso / Lienzo en Blanco** del framework Sinopia. El Gesso transforma una intuición creativa en un contrato conceptual auditable antes de pasar a la Fase 1: Abbozzo / Mockup.

---

## Instrucciones Operativas para el Agente

Cuando el usuario invoque este comando (por cualquiera de sus aliases: `/lienzo-en-blanco`, `/blank-canvas`, `/tela-bianca`, `/gesso`, `/canva-blank-canvas`), debes ejecutar de forma obligatoria los siguientes pasos secuenciales utilizando exclusivamente el CLI global del framework.

### 0. Preflight del Entorno (OBLIGATORIO)

Antes de ejecutar cualquier otra acción, verifica que el CLI global de `gsd-canva` esté disponible:

```bash
gsd-canva --help
```

⚠️ **PARADA CRÍTICA**: Si el comando falla o no es encontrado, **detén tu ejecución inmediatamente**. Informa al usuario que el CLI global no está configurado y solicita que ejecute `npm install -g .` o `npm link` en el directorio raíz del framework. **PROHIBIDO** instalar paquetes o buscar dependencias locales por tu cuenta.

### 1. Creación del Lienzo

Ejecuta el comando para crear un nuevo lienzo:

```bash
gsd-canva gesso create --name "<nombre>" --methodology <metodología> --language <idioma> --json
```

Anota el **ID de tres dígitos** retornado (ej: `001`) y la ruta del lienzo (`lienzos/lienzo_001_<nombre>/`). El lienzo iniciará en estado `gesso:en_blanco`.

Si el usuario no proporcionó un nombre, pídeselo antes de crear el lienzo.

### 2. Selección de Metodología

Si el usuario no indicó una metodología al crear el lienzo, ofrécele elegir entre:

- **Socrática**: Exploración mediante preguntas abiertas que guían al usuario a refinar su propia visión.
- **Creative Brief**: Estructura formal de brief creativo con secciones de objetivo, audiencia, tono, mensaje y restricciones.
- **Jobs-to-be-Done**: Enfoque en las tareas funcionales y emocionales que el diseño debe cumplir para el usuario final.
- **Design Thinking**: Iteración por fases de empatizar, definir, idear, prototipar conceptualmente y validar.
- **5W + 1H**: Estructura periodística: Qué, Quién, Dónde, Cuándo, Por qué y Cómo.

La metodología debe registrarse al crear el lienzo. Si necesitas cambiarla después, crea un nuevo lienzo.

### 3. Guía Conversacional

Conduce una exploración conversacional libre, NO un formulario rígido. Adapta tu tono y preguntas a la metodología elegida:

- **Socrática**: Haz preguntas que desafíen suposiciones. Ej: "¿Qué pasaría si tu café no vendiera café sino una experiencia?"
- **Creative Brief**: Cubre objetivo, audiencia, tono, mensaje central, elementos obligatorios y restricciones.
- **Jobs-to-be-Done**: Pregunta "¿Qué 'trabajo' está contratando el usuario al visitar este diseño?"
- **Design Thinking**: Comienza con empatía ("¿Quién es el usuario y qué siente?"), luego define el problema, idea soluciones y valida.
- **5W + 1H**: Cubre sistemáticamente cada dimensión antes de pasar a la siguiente.

Durante la conversación, sintetiza y refleja lo que el usuario comparte. Haz preguntas de seguimiento naturales. No llenes casillas sin comprensión real.

### 4. Registro de Sesión (SOLO VÍA CLI)

⚠️ **REGLA FUNDAMENTAL**: Todos los turnos conversacionales y notas se registran **exclusivamente** a través del CLI. Está **PROHIBIDO** editar `lienzo.json`, `sesion.json` o cualquier archivo dentro del lienzo directamente.

#### 4.1 Registrar turnos

Después de cada intercambio significativo, registra el turno:

```bash
gsd-canva gesso append-turn --id <ID> --role user|agent --content "<texto>" --tags <etiqueta> --json
```

Etiquetas sugeridas: `initial_prompt`, `methodology_selection`, `exploration`, `refinement`, `summary_requested`, `approval`.

#### 4.2 Registrar notas estructuradas

A medida que la conversación produce claridad sobre aspectos clave, actualiza las notas de trabajo:

```bash
gsd-canva gesso update-notes --id <ID> --field <campo> --value "<valor>" --json
```

Campos disponibles:
- `idea` — Idea central
- `audience` — Audiencia objetivo
- `tone` — Tono visual y comunicacional
- `layout` — Estructura de layout propuesta
- `context` — Contexto de uso
- `constraints` — Restricciones o limitaciones
- `mandatoryElements` — Elementos obligatorios
- `discardedDirections` — Direcciones descartadas

### 5. Cierre y Escritura del Gesso

Cuando la exploración haya alcanzado suficiente claridad conceptual:

1. Presenta al usuario un resumen narrativo de todo lo explorado.
2. Propón una estructura de layout conceptual.
3. Pide confirmación del usuario para escribir el Gesso.

Una vez que el usuario apruebe el resumen:

```bash
gsd-canva gesso write --id <ID> --file /tmp/gesso_<ID>.md --json
```

Este comando valida que el archivo contenga las secciones requeridas (Nombre, Metodología, Resumen narrativo, Intención visual y tonal, Audiencia y contexto, Mensaje central, Estructura de layout propuesta, Elementos obligatorios, Riesgos o restricciones, Exploraciones descartadas, Recomendaciones para Abbozzo).

### 6. Confirmación del Gesso (YIELD GATE OBLIGATORIO)

⚠️ **REGLA CRÍTICA**: El Gesso NO puede considerarse aprobado sin la confirmación **explícita** del usuario. No interpretes un "ok" o "bien" ambiguo como aprobación. Pregunta directamente:

> "¿Confirmas este Gesso como la base conceptual aprobada para tu diseño? Una vez confirmado, el Gesso queda congelado y no podrá modificarse."

Solo cuando el usuario responda afirmativamente de forma inequívoca:

```bash
gsd-canva gesso confirm --id <ID> --by user --json
```

Esto congela el Gesso, calcula su hash de integridad y transiciona el lienzo a `gesso:gesso_listo`.

⚠️ **PROHIBIDO** proceder a mockup antes de `gesso confirm`. El Gesso debe estar confirmado antes de cualquier fase posterior.

### 7. Transición Post-Confirmación

Después de la confirmación, informa al usuario que el Gesso está listo y ofrece las siguientes opciones:

- **Pasar a Abbozzo / Mockup**: Invocar `/canva-mockup <nombre>` para crear un plan de mockup. El Gesso servirá como brief conceptual.
- **Futuro Boceto**: En versiones futuras, `/boceto` permitirá un esbozo visual rápido antes del mockup completo.
- **Archivar**: Si el usuario desea preservar el lienzo sin continuar por ahora.

Para vincular el Gesso con un plan de mockup posterior:

```bash
gsd-canva gesso link-plan --id <ID> --plan <planId> --json
```

💡 El agente puede sugerir valores para las decisiones del mockup basándose en el contenido del Gesso, pero **cada campo de `decisions.json` debe ser aprobado explícitamente por el usuario** y registrado con `plan answer`. Está **PROHIBIDO** autopoblar decisiones técnicas sin consentimiento.

---

## Prohibiciones

- **PROHIBIDO** editar `lienzo.json` directamente.
- **PROHIBIDO** editar `sesion.json` directamente.
- **PROHIBIDO** editar `decisions.json` directamente.
- **PROHIBIDO** autopoblar decisiones del plan técnico sin consentimiento explícito del usuario.
- **PROHIBIDO** crear Studi u Opere en esta fase.
- **PROHIBIDO** confirmar el Gesso sin aprobación explícita del usuario.
- **PROHIBIDO** iniciar la fase de mockup antes de que el Gesso esté confirmado.
