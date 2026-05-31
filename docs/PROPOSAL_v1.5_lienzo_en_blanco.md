# Propuesta: Fase 0 — Lienzo en Blanco

**Fecha**: 2026-05-30  
**Estado**: Borrador de visión  
**Propósito**: Definir el concepto, alcance y dirección de una fase exploratoria previa al mockup

---

## Visión

El proceso creativo no comienza con especificaciones técnicas. Comienza con una idea vaga, una sensación, una necesidad. El framework `gsd-canva` actual salta directamente a la fase de mockup con preguntas estructuradas sobre formato, paleta y CTA — datos necesarios, pero que presuponen que el usuario ya sabe qué quiere.

**Lienzo en Blanco** es la fase que antecede al mockup. Es el espacio donde el usuario explora libremente qué quiere representar, para quién, cómo lo quiere representar, y cómo se imagina la estructura del diseño — antes de comprometerse con dimensiones, colores hexadecimales o tipografías.

La metáfora es intencional: el usuario recibe un lienzo en blanco, no un formulario.

---

## El Problema que Resuelve

Hoy, cuando un usuario dice *"quiero algo para mi restaurante"*, el agente debe improvisar entre:
- Asumir un layout genérico que puede no representar lo que el usuario imagina
- Hacer preguntas técnicas ("¿qué formato?") antes de entender la intención
- Perderse en propuestas estéticas sin una dirección conceptual clara

Esto genera:
- Mockups que no capturan la visión del usuario
- Iteraciones costosas porque la dirección creativa se definió implicitamente, no explícitamente
- Frustración del usuario porque sabe lo que quiere pero el framework no le da espacio para expresarlo

**Lienzo en Blanco resuelve esto dándole al usuario un espacio estructurado pero flexible para definir su visión antes de tocar una sola decisión técnica.**

---

## Qué es un Lienzo

Un **lienzo** es la unidad de trabajo creativa del framework. Representa una idea desde su concepción hasta su entrega final.

Un lienzo atraviesa 4 fases:

```
┌─────────────────┐     ┌──────────────┐     ┌────────────────┐     ┌─────────────────┐
│  Fase 0         │     │  Fase 1      │     │  Fase 2        │     │  Fase 3         │
│  Lienzo en      │ ──▶ │  Mockup      │ ──▶ │  Draft         │ ──▶ │  Refine         │
│  Blanco         │     │  (wireframe) │     │  (templates    │     │  (obras finales)│
│                 │     │              │     │   de Canva)    │     │                 │
└─────────────────┘     └──────────────┘     └────────────────┘     └─────────────────┘
```

- **Fase 0**: Exploración creativa. Output: un brief que captura la idea, la intención visual y la estructura propuesta.
- **Fase 1**: Un único wireframe HTML basado en el brief.
- **Fase 2**: Múltiples templates de Canva generados desde el wireframe.
- **Fase 3**: Múltiples obras finales, cada una ajustando uno de los templates.

El usuario puede iniciar el proceso desde cualquier fase, pero recomendamos empezar por Fase 0 para ideas nuevas.

---

## Las 5 Metodologías de Exploración

Al iniciar `/lienzo-en-blanco`, el usuario elige cómo quiere ser guiado. Cada metodología es un estilo de conversación distinto — no se fusionan, no se combinan.

### 1. Socrático

El agente hace preguntas abiertas que guían al usuario a descubrir su propia visión. No impone estructura. Si el usuario dice *"quiero algo para mi café"*, el agente pregunta *"¿qué sensación querés que transmita? ¿un lugar de paso rápido o de encuentro?"* y deja que el usuario defina el camino.

**Ideal para**: usuarios que tienen una intuición pero no la han articulado.

### 2. Creative Brief

Estructura clásica de agencia publicitaria. El agente guía al usuario a completar: objetivo, target, mensaje central, tono, elementos obligatorios (logo, disclaimers), y contexto de uso.

**Ideal para**: usuarios que ya tienen claro el propósito comercial y necesitan organizar sus ideas.

### 3. Jobs-to-be-Done

En lugar de preguntar *"¿qué diseño querés?"*, el agente pregunta *"¿qué trabajo contrata este diseño para hacer?"*. Enfocado en la función y el resultado, no en la estética.

**Ideal para**: usuarios orientados a resultados y conversiones.

### 4. Design Thinking

El agente guía un proceso de empatizar → definir → idear → seleccionar. Usa el formato *"¿Cómo podríamos...?"* para generar direcciones creativas antes de comprometerse con una.

**Ideal para**: usuarios que quieren explorar múltiples direcciones antes de decidir.

### 5. 5W + 1H

Framework periodístico aplicado al diseño: Who, What, When, Where, Why, How. Cobertura exhaustiva que asegura que no se pase por alto ninguna dimensión relevante.

**Ideal para**: usuarios que prefieren una checklist completa y no dejar nada al azar.

---

## El Flujo de Fase 0

### Inicio

El usuario invoca `/lienzo-en-blanco` (o `/blank-canvas` en inglés). Si no proporciona un nombre, el agente sugiere uno basado en el contexto de la conversación. El usuario puede aceptar o modificar.

### Selección de Metodología

El agente presenta las 5 opciones con una descripción breve. El usuario elige una.

### Brainstorming Guiado

Según la metodología elegida, el agente guía una conversación orientada. Las preguntas cubren dimensiones como:
- **Qué se quiere representar**: la idea central, el mensaje, la historia
- **Para quién**: el público, el contexto de consumo
- **Cómo se quiere representar**: el tono, la sensación, la estructura visual propuesta
- **Dónde y cuándo**: el canal, el momento de consumo, el medio (digital, impreso, pantalla)

El agente no impone respuestas. Sugiere, reformula, profundiza. El usuario puede explorar libremente.

### Definición del Layout

Durante la conversación, el agente ayuda al usuario a definir la estructura visual del lienzo:
- ¿Cuántas secciones?
- ¿Qué va en cada sección? (hero, grid, columna, footer)
- ¿Qué elemento es el protagonista? (imagen, texto, logo)
- ¿Qué tamaño y orientación? (basado en el contexto de uso, no en presets rígidos)

### Cierre de la Sesión

La sesión termina cuando el usuario:
1. **Acepta el resumen de ideas** que el agente presenta
2. **Aprueba el layout propuesto** (estructura de secciones)
3. **Confirma el nombre del lienzo**

En ese momento, el agente genera un **brief** — un documento que captura toda la exploración en un formato legible y estructurado. Este brief es el artefacto fundamental de Fase 0 y alimenta todo el proceso posterior.

### Transición a Fase 1

Con el brief aprobado, el usuario puede pasar a Fase 1 (mockup). El agente usa el brief como input para:
- Sugerir campos técnicos (formato, paleta, copy, CTA) basados en la intención del usuario
- Generar un wireframe HTML que respete la estructura acordada en el layout
- Reducir drásticamente las iteraciones porque la dirección creativa ya está definida

---

## Artefactos de Fase 0

### `brief.md`

Documento persistente generado al cerrar la sesión. Contiene:
- Resumen narrativo de la idea
- Intención visual y tonal
- Estructura de layout acordada
- Contexto de uso (canal, medio, audiencia)
- Elementos obligatorios (logo, disclaimers, recursos)
- Notas y exploraciones descartadas (para referencia futura)

Este archivo es la fuente de verdad conceptual del lienzo. Todos los artefactos posteriores (mockup, templates, obras) deben alinearse con él.

### `sesion.json`

Registro de la conversación. Útil para:
- Auditar qué se acordó y cuándo
- Recuperar contexto si el agente pierde memoria
- Analizar patrones de cómo los usuarios exploran ideas

### `lienzo.json`

Metadata del lienzo: ID, nombre, metodología usada, estado, fecha de creación, y vínculo con el plan/mockup de Fase 1.

---

## Estados del Lienzo

```
        ┌──────────────┐
        │  en_blanco   │  ← brainstorming activo
        └──────┬───────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌───────┐  ┌────────┐  ┌──────────┐
│brief   │  │brief   │  │archivado │
│listo   │  │listo   │  │          │
│        │  │+ mockup│  │          │
│        │  │listo   │  │          │
└───┬───┘  └───┬────┘  └──────────┘
    │          │
    ▼          ▼
┌──────────────┐
│  con_mockup  │  ← tiene plan/mockup asociado
└──────────────┘
```

- **en_blanco**: Sesión de brainstorming activa. Se pueden agregar intercambios.
- **brief_listo**: El brief está completo pero no se ha pasado a mockup. Se puede retomar o archivar.
- **con_mockup**: El lienzo tiene un mockup asociado. El brief es de solo lectura.
- **archivado**: El usuario decidió no continuar. Se preserva para referencia.

---

## Relación con el Sistema Existente

### No reemplaza, complementa

El sistema actual de planes, preguntas estructuradas, confirmación criptográfica y máquina de estados **se mantiene intacto**. Fase 0 es una capa anterior que alimenta el sistema existente.

- El `FIELD_REGISTRY` actual no cambia
- Los comandos `gsd-canva plan *` existentes no cambian
- El flujo de `/canva-mockup` no cambia
- Fase 0 produce un brief que el agente usa como contexto para el flujo normal de mockup

### Integración

Un lienzo en `canva-lienzos/` puede vincularse a un plan en `canva-plans/`:

```
canva-lienzos/lienzo_001_mi-cafe/
├── lienzo.json          # { status: "con_mockup", linkedPlanId: "001" }
├── brief.md             # Fase 0: exploración creativa
└── sesion.json          # Registro de conversación

canva-plans/plan_001_mi-cafe/
├── plan.json            # Fase 1+: máquina de estados técnica
├── decisions.json       # Campos técnicos (formato, paleta, etc.)
└── mockup.html          # Wireframe generado
```

El brief del lienzo informa las decisiones técnicas del plan, pero no las reemplaza. El plan sigue teniendo su propio yield gate de confirmación.

---

## Escenarios de Uso

### Escenario A: Idea nueva, usuario inexperto

> Usuario: "Quiero algo para mi cafetería"
> 
> Agente: "Perfecto, vamos a explorar eso. ¿Cómo querés que te guíe?"
> 
> [Usuario elige metodología Socrática]
> 
> [Conversación de 10-15 intercambios]
> 
> Agente: "Basado en lo que me contaste, propongo este brief y este layout..."
> 
> Usuario: "Sí, me gusta. Pasemos al mockup."

### Escenario B: Usuario con idea clara

> Usuario: "Necesito un flyer para un workshop de yoga. Va a ser A4, impreso, tono tranquilo, foto de una persona meditando como hero, título arriba, detalles abajo."
> 
> Agente: "Tenés la idea muy clara. ¿Querés que la organicemos con un Creative Brief para asegurarnos de no omitir nada?"
> 
> [Usuario elige Creative Brief, conversación de 5-8 intercambios]
> 
> [Brief validado, transición directa a mockup]

### Escenario C: Exploración sin compromiso

> Usuario: "Estoy jugando con una idea para un podcast pero no sé si la voy a hacer"
> 
> Agente: "Podemos explorarla sin compromiso. Si después decidís no seguir, archivamos el lienzo y queda para referencia."
> 
> [Brainstorming con metodología Design Thinking]
> 
> Usuario: "Me doy cuenta de que la idea no está madura. La dejo para más adelante."
> 
> Agente: "Lienzo archivado. Podés retomarlo cuando quieras invocando /lienzo-en-blanco con el mismo nombre."

---

## Beneficios Esperados

1. **Mockups más alineados**: Al definir la dirección creativa antes de las decisiones técnicas, el wireframe refleja la visión del usuario, no una plantilla genérica.

2. **Menos iteraciones**: Cuando la intención visual y la estructura están claras desde el brief, el mockup suele requerir menos ajustes.

3. **Espacio para explorar**: El usuario puede jugar con ideas sin la presión de "completar un formulario". Puede archivar sin penalización.

4. **Auditoría creativa**: El brief.md permite revisitar por qué se tomaron ciertas decisiones meses después.

5. **Reutilización**: Un brief puede alimentar múltiples planes/mockups (mismo concepto, diferentes formatos).

---

## Principios de Diseño

1. **Exploración antes de especificación**: La creatividad no se puede formularizar desde el minuto cero. Se necesita espacio para descubrir.

2. **Conversación, no formulario**: Las metodologías guían, no encorsetan. El agente adapta las preguntas al contexto.

3. **Persistencia del contexto**: El brief es un artefacto real, no una conversación efímera. Puede ser releído, auditado, retomado.

4. **Separación de concerns**: La fase exploratoria (creativa, subjetiva) es independiente de la fase técnica (estructurada, auditable). No se mezclan.

5. **Opcionalidad**: El usuario puede ir directo a `/canva-mockup` si ya sabe lo que quiere. Fase 0 no es obligatoria.

---

## Alcance de esta Propuesta

**Incluye**:
- Concepto y visión de Fase 0
- Las 5 metodologías de brainstorming
- El flujo de usuario desde invocación hasta brief aprobado
- Los artefactos generados (brief.md, sesion.json, lienzo.json)
- Los estados del lienzo
- La relación con el sistema existente (planes)

**No incluye** (se deja para fases de análisis posterior):
- Especificación técnica del CLI (`gsd-canva lienzo *`)
- Schemas exactos de JSON
- Códigos de error
- Implementación del módulo `lienzo-manager.js`
- Tests específicos
- Decisión sobre rename completo de "plan" a "lienzo"
- Decisión sobre si el mockup vive dentro del directorio del lienzo o en `canva-plans/`

---

## Preguntas Abiertas para Análisis Posterior

1. ¿El brief debe tener un formato estructurado (secciones fijas) o libre (párrafo narrativo)?
2. ¿Cómo se valida que un mockup respete el layout acordado en el brief?
3. ¿Un mismo brief puede generar múltiples mockups (diferentes formatos para la misma idea)?
4. ¿Qué pasa si el usuario quiere modificar el brief después de tener mockup?
5. ¿Se necesita un mecanismo de versionado para el brief?
6. ¿Cómo se maneja la autoría/colaboración en un lienzo (múltiples usuarios)?
7. ¿Qué metadatos del brief son útiles para búsqueda y organización?

---

## Notas

- El nombre "lienzo" es intencionalmente visual. Refuerza la metáfora del espacio creativo.
- El comando `/lienzo-en-blanco` tiene equivalente en inglés: `/blank-canvas`.
- Esta propuesta asume que el sistema actual de planes (v1.4) está estable y operativo.
- La fase de análisis posterior definirá la implementación técnica, los schemas, y la integración exacta con `plan-manager.js`.