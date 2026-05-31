# Guía de Usuario: Gesso / Lienzo en Blanco

**Fase 0 de Sinopia · Preparando la superficie creativa**

---

## ¿Qué es Gesso / Lienzo en Blanco?

En el mundo de la pintura, el **gesso** es la capa de preparación que se aplica sobre el lienzo antes de pintar. Alisa la superficie, sella las fibras del tejido, y asegura que las capas posteriores de pintura se adhieran correctamente.

En **Sinopia**, Gesso cumple el mismo rol para el diseño asistido por IA: es la fase exploratoria donde tú y el asistente **Francesco** dialogan para transformar tu intuición creativa en un **contrato conceptual determinista**. No se tocan colores, ni layouts, ni código de Canva. Solo se define **qué querés comunicar, para quién, y con qué tono**.

Al finalizar, producís un documento `gesso.md` aprobado digitalmente que servirá como brief inmutable para la Fase 1 (Abbozzo / Mockup).

---

## ¿Cuándo usar `/lienzo-en-blanco`?

Usá Gesso cuando:

- Tenés una **idea difusa** y querés refinarla antes de pedir un mockup.
- Querés **dejar registro auditable** de por qué se tomó cada dirección creativa.
- Trabajás en equipo y necesitás que el brief esté **firmado criptográficamente** antes de avanzar.
- Querés usar metodologías de conversación estructuradas (Socrática, Creative Brief, JTBD, Design Thinking, 5W+1H).

**No uses Gesso** si:

- Ya tenés un brief claro y solo necesitás iterar sobre un mockup existente.
- Preferís ir directo a `/canva-mockup` con una idea bien definida.
- Estás en un flujo rápido de prototipado donde no necesitás trazabilidad.

---

## Aliases de Invocación

Gesso es un único skill conceptual con **5 aliases** multilingües que disparan exactamente el mismo comportamiento:

| Alias | Idioma |
| :--- | :--- |
| `/lienzo-en-blanco` | Español (recomendado) |
| `/blank-canvas` | Inglés |
| `/tela-bianca` | Italiano |
| `/gesso` | Italiano / Universal |
| `/canva-blank-canvas` | Compatibilidad legacy |

**Importante**: No importa cuál alias uses, el sistema subyacente es el mismo. Los 5 convergen en el comando `gsd-canva gesso`.

---

## ¿En qué se diferencia de `/canva-mockup`?

| Aspecto | Gesso (`/lienzo-en-blanco`) | Mockup (`/canva-mockup`) |
| :--- | :--- | :--- |
| **Fase** | Fase 0 (Preparación conceptual) | Fase 1 (Estructura espacial) |
| **Asistente** | Francesco (metódico, analítico) | Giulio (estructural, geométrico) |
| **Output** | `gesso.md` + `lienzo.json` + `sesion.json` | `mockup.html` + `decisions.json` |
| **Contenido** | Brief narrativo, tono, audiencia, mensaje | Layout, bloques, proporciones, CTA |
| **Es obligatorio** | No, es opcional | Sí, para generar diseño |
| **¿Puede usarse solo?** | Sí, como brief independiente | Sí, sin Gesso previo |

**En resumen**: Gesso responde *qué y por qué*. Mockup responde *dónde y cómo*. Podés usar mockup sin Gesso si ya tenés claridad creativa; o podés usar Gesso para refinar tu visión antes de comprometerte con un layout.

---

## Archivos Producidos

Cuando creás un lienzo, se genera esta estructura en `lienzos/lienzo_<ID>_<slug>/`:

```
lienzos/
└── lienzo_001_mi-cafe/
    ├── lienzo.json    ← Metadata, máquina de estados, hash de confirmación
    ├── gesso.md       ← Documento narrativo del brief creativo
    └── sesion.json    ← Registro cronológico de la conversación
```

### `lienzo.json`
Contiene el estado del lienzo (`en_blanco`, `gesso_listo`, `con_mockup`, `archivado`), metodología usada, idioma, timestamps, y el hash criptográfico de confirmación.

### `gesso.md`
El brief creativo en formato Markdown con 11 secciones obligatorias: nombre, metodología, resumen narrativo, intención visual, audiencia, mensaje central, estructura de layout propuesta, elementos obligatorios, riesgos, exploraciones descartadas, y recomendaciones para Abbozzo.

### `sesion.json`
Registro auditable de cada turno de la conversación (rol, contenido, tags) más notas de trabajo estructuradas (idea, audiencia, tono, layout, restricciones, etc.).

---

## Metodologías de Conversación

Francesco puede guiar la exploración usando una de 5 metodologías:

| Metodología | Ideal para... | Estilo |
| :--- | :--- | :--- |
| `socratic` | Refinar ideas mediante preguntas y respuestas | Diálogo reflexivo |
| `creative_brief` | Briefs formales de agencia | Estructurado, profesional |
| `jobs_to_be_done` | Productos y funcionalidades | Enfoque en tareas del usuario |
| `design_thinking` | Problemas complejos con enfoque humano | Iterativo, empático |
| `5w1h` | Exploración exhaustiva (What, Why, Who, Where, When, How) | Periodístico, completo |

Elegí la metodología que mejor se adapte a tu estilo de pensamiento. Francesco adapta su conversación en consecuencia.

---

## Cómo Funciona la Conversación

1. **Invocás** con `/lienzo-en-blanco` (o cualquiera de sus aliases).
2. **Francesco** te pregunta sobre tu idea, una pregunta a la vez, según la metodología elegida.
3. **Respondés** naturalmente. Francesco registra cada turno en `sesion.json`.
4. **Francesco actualiza** las notas de trabajo (`workingNotes`) a medida que la conversación avanza.
5. Cuando Francesco considera que la exploración es suficiente, te presenta un **resumen**.
6. **Revisás** el resumen. Podés pedir ajustes (la conversación sigue en `en_blanco`).
7. Cuando estás satisfecho, Francesco escribe `gesso.md` y te pide **aprobación explícita**.
8. **Aprobás** el Gesso. Francesco ejecuta `gesso confirm`, que congela el documento con un hash criptográfico.

---

## Cómo Aprobar el Gesso

La aprobación del Gesso **requiere confirmación explícita tuya**. Francesco no puede aprobar el Gesso por su cuenta.

El flujo de aprobación:

1. Francesco te presenta el resumen final y pregunta: *"¿Damos por aprobado este Gesso?"*
2. Vos respondés explícitamente que sí (ej: *"Sí, aprobado"*, *"Confirmado"*, *"Dale para adelante"*).
3. Francesco ejecuta `gesso confirm --by user`, que:
   - Valida que `gesso.md` tenga todas las secciones requeridas.
   - Calcula el hash `sha256-gesso-v1` sobre el contenido.
   - Transiciona el estado a `gesso_listo`.
   - Congela `gesso.md` (cualquier modificación posterior será detectada).
4. Francesco verifica la integridad con `gesso verify`.

**Después de la aprobación**, `gesso.md` es inmutable. Si alguien lo modifica, `gesso verify` fallará con error 35 (`GSDC_GESSO_CHANGED_AFTER_CONFIRMATION`).

---

## De Gesso a Mockup (Flujo Gesso → Plan)

Una vez que el Gesso está aprobado, podés continuar a la Fase 1:

1. Francesco (o vos) invocan `/canva-mockup` para crear un plan.
2. Giulio crea el plan y comienza las preguntas de `decisions.json`.
3. Francesco ejecuta `gesso link-plan` para vincular el lienzo al plan.
4. El vínculo queda registrado en ambos lados:
   - `lienzo.json` → `linkedPlanId: "001"`
   - `plan.json` → `sourceLienzoId: "001"`
5. Giulio usa `gesso.md` como contexto para guiar las decisiones del mockup, pero **cada campo de `decisions.json` debe responderse explícitamente**.

**Importante**: Gesso no autopobla `decisions.json`. Francesco y Giulio pueden sugerir valores basados en el brief, pero vos debés aprobar cada decisión técnica.

---

## Gesso es Opcional

El flujo de mockup (`/canva-mockup`) **sigue funcionando de forma independiente** sin necesidad de Gesso. Podés:

- Usar solo `/canva-mockup` como siempre (Fase 1 directa).
- Usar `/lienzo-en-blanco` y luego `/canva-mockup` (Fase 0 → Fase 1).
- Usar `/lienzo-en-blanco` como brief independiente sin llegar a mockup.

Ambos flujos son compatibles y no se interfieren.

---

## Gesso No Autopobla `decisions.json`

Por diseño, Gesso no escribe automáticamente en `decisions.json`. Esto es intencional:

- **Separación de fases**: Gesso define *intención creativa*. Mockup define *decisiones técnicas*.
- **Soberanía humana**: Cada campo de `decisions.json` requiere tu aprobación explícita.
- **Yield gates**: El sistema de compuertas de Sinopia asegura que ninguna fase se saltee la validación humana.

Francesco puede **sugerir** valores para `decisions.json` basados en el `gesso.md`, pero Giulio debe registrarlos con `plan answer` y obtener tu confirmación.

---

## Resumen del Flujo

```text
Invocación                      Fase 0: Gesso                    Fase 1: Abbozzo
───────────                     ─────────────                    ────────────────
/lienzo-en-blanco               gesso create                     (independiente)
       │                              │                                │
       ▼                              ▼                                │
Francesco guía                append-turn                      /canva-mockup
la conversación               update-notes                          │
       │                              │                                ▼
       ▼                              ▼                          plan create
Resumen y revisión             gesso write                      plan questions
       │                              │                                │
       ▼                              ▼                                ▼
Aprobación explícita           gesso confirm                   plan answer × N
       │                              │                                │
       ▼                              ▼                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        gesso link-plan                                    │
│                  (vincula lienzo aprobado al plan)                        │
└──────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                                  plan confirm-decisions
                                  plan resolve-questions
                                  plan submit-mockup
                                        │
                                        ▼
                                  mockup.html listo
```

---

## Preguntas Frecuentes

### ¿Puedo tener varios lienzos en paralelo?
Sí. Cada lienzo tiene su propio ID y carpeta independiente. Podés listarlos con `gsd-canva gesso list`.

### ¿Puedo archivar un lienzo sin vincularlo a un plan?
Sí. Ejecutá `gsd-canva gesso archive --id <ID>`. El lienzo pasa a estado `archivado` y queda preservado.

### ¿Qué pasa si modifico `gesso.md` después de confirmarlo?
Cualquier modificación será detectada por `gesso verify` (error 35). Para modificar un Gesso confirmado, necesitás reiniciar el flujo desde un nuevo lienzo.

### ¿Los alias `/blank-canvas` y `/lienzo-en-blanco` son comandos diferentes?
No. Son el mismo comando subyacente. La diferencia es solo el idioma del alias para comodidad del usuario.

### ¿Puedo usar `/canva-mockup` sin haber pasado por Gesso?
Sí. El flujo de mockup es completamente independiente. Gesso es una fase previa opcional, no un prerrequisito.

---

## Véase También

- [Referencia de comandos CLI: gesso](../commands/gesso.md)
- [Modelo de estados para developers](../developer/gesso_state_model.md)
- [Propuesta de implementación v1.5](../PROPOSAL_v1.5_gesso_lienzo_en_blanco_implementation_plan.md)
- [README en Español](../../README.es.md)
