# Sinopia

<p align="center">
  <img src="docs/images/sinopia_logo.png" alt="Sinopia Logo" width="300" />
</p>

<p align="center">
  <a href="README.md">English</a> | <b>Español</b>
</p>

**El trazo determinista bajo el diseño asistido por IA.**

> *"La inteligencia artificial puede alucinar el trazo. Sinopia asegura la intención."*

---

## El Manifiesto: ¿Por qué existe Sinopia?

El diseño moderno asistido por IA padece de un problema invisible pero devastador: **la acumulación de caos probabilístico en sistemas multi-agente.**

Cuando usas herramientas como el MCP de Canva, te enfrentas a un "teléfono descompuesto" de inteligencias artificiales:
1. **El Humano** expresa una idea al Agente Local.
2. **El Agente Local** interpreta la idea y le pide al Agente del MCP de Canva que actúe.
3. **El Agente de Canva** reinterpreta esa petición y la traduce en llamadas a la API de Canva.
4. **La API de Canva** renderiza el resultado final.

Con dos o más capas de inteligencia artificial tomando decisiones estocásticas intermedias, la ambigüedad no se suma: se multiplica exponencialmente. El resultado suele ser la frustración del usuario: propuestas genéricas, pérdida absoluta de la dirección creativa, alucinaciones técnicas y la sensación de que la IA ha tomado el control del lienzo, relegándote a ser un mero espectador de su caos.

**Sinopia nace para devolver el control al artista humano.**

Como ingenieros de software, sabemos que no podemos controlar la aleatoriedad de los modelos de lenguaje externos, ni el comportamiento del agente de Canva. **Pero sí podemos controlar el proceso.** 

Nuestra tesis es simple: **El agente puede alucinar; el proceso creativo no.**

---

## La Genealogía del Control: De SDD a SDAD

Para domar el desorden inherente de la inteligencia artificial generativa, Sinopia no inventa un método de la nada; hereda una genealogía de disciplina técnica nacida en la ingeniería de software y la adapta al arte:

```
┌──────────────────────────────────────────┐
│   Spec-Driven Development (SWE)          │  <- Rigor del código: Contratos, schemas y
│   - Contratos de código y APIs           │     validaciones deterministas antes de programar.
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│   Spec-Driven Design (Product/UI)        │  <- Rigor del producto: Jerarquías de datos y
│   - Wireframes y arquitecturas de datos  │     bloques de contenido antes de pintar píxeles.
└────────────────────┬─────────────────────┘
                     ▼
┌──────────────────────────────────────────┐
│   Spec-Driven Artist Design (SDAD)       │  <- Rigor creativo: El bastidor conceptual y
│   - El Gesso y el Abbozzo de Sinopia     │     estructural que doma y encauza a la IA.
└──────────────────────────────────────────┘
```

1.  **Spec-Driven Development (SWE):** En la ingeniería de software tradicional, programar sin una especificación clara (APIs, schemas de datos, contratos) lleva al desastre. El desarrollo guiado por especificaciones garantiza que el código sea predecible, verificable y libre de desviaciones indeseadas (*scope creep*).
2.  **Spec-Driven Design (Product):** En el diseño de producto, pintar píxeles o elegir colores sin definir la arquitectura de la información y los flujos de usuario genera interfaces confusas. Definir la especificación funcional primero mantiene el diseño alinear con el propósito.
3.  **Spec-Driven Artist Design (SDAD):** Creado por Sinopia, es la evolución natural de esta cadena aplicada a la era de la inteligencia artificial. Consiste en definir un **contrato creativo inmutable y determinista (el *Gesso* y el *Abbozzo*)** antes de que el agente de IA empiece a experimentar en el lienzo de Canva.

---

## El Arte de Domar al Asistente Caótico

Los agentes de IA son seres fascinantes: **tienen una creatividad desbordante y una velocidad de ejecución sobrehumana, pero son intrínsecamente desordenados, distraídos y propensos a alucinar.** Si los dejas sueltos frente a un lienzo en blanco con un simple prompt de texto, ignorarán tus reglas, decidirán el diseño a tus espaldas y arruinarán tu visión.

**El Spec-Driven Artist Design (SDAD) es el bastidor de madera y el mapa con el que el artista humano doma a la bestia creativa de la IA.**

*   **El Agente no es el Artista:** El agente local es tu ayudante de taller. Su desorden creativo es bienvenido, pero **solo se le permite pintar dentro de las líneas de la especificación técnica** que tú has aprobado.
*   **La Especificación es un Contrato Executable:** El *Gesso* (el brief conceptual) y el *Abbozzo* (el wireframe estructural) se guardan como archivos JSON estrictos. El sistema determinista de Sinopia actúa como un validador (un linter de diseño). Si el agente caótico intenta cambiar la estructura o el tono acordado, el sistema rechaza su acción de inmediato.
*   **Canalización del Caos:** No reprimimos la creatividad de la IA; la canalizamos. Al definir rígidamente dónde va el contenido (*Abbozzo*), liberamos al agente para que haga lo que mejor sabe hacer en la fase de *Studi* (variaciones de color, estilos, combinaciones estéticas), sabiendo que nunca podrá destruir la estructura fundamental.
*   **Fases Estancas (Yield Gates):** El agente no puede saltar a pintar sin antes haber completado y firmado digitalmente el gesso con el humano. Esto detiene en seco la alucinación del agente de "asumir lo que quieres" antes de que lo digas.

---

## La Anatomía del Taller (Las Fases de SDAD)

El taller determinista de Sinopia organiza el flujo en 4 fases estancas donde el software valida cada paso de los agentes:

```text
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │                                        SINOPIA                                         │
  │                     (El Bastidor Determinista / Máquina de Estados)                    │
  └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                              │
       ┌───────────────────────┬──────────────┴──────────────┬───────────────────────┐
       ▼                       ▼                             ▼                       ▼
  Fase 0: GESSO           Fase 1: ABBOZZO               Fase 2: STUDI           Fase 3: OPERE
 (La Capa Base / Brief)  (El Boceto Espacial)          (Las Variaciones)       (Las Obras Finales)
       │                       │                             │                       │
       ▼                       ▼                             ▼                       ▼
 👤 FRANCESCO            👤 GIULIO                     👤 SALAI                ⚙️ MARCO
 (El Asistente           (El Asistente                 (El Asistente           (El Asistente
  Metódico)               Estructurador)                Explorador/Caótico)     Ejecutor)
```

| Fase | Concepto de Software | Término Artístico | Rol de SDAD |
| :--- | :--- | :--- | :--- |
| **0** | Brief / Configuración Inicial | **Gesso** | **La preparación del soporte.** Francesco destila tu idea pura en una especificación conceptual (`gesso.md` y `gesso.json`). Es el contrato de intención que el agente de Canva debe respetar. |
| **1** | Mockup / Wireframe | **Abbozzo** | **El boceto estructural.** Giulio maqueta el layout en bloques de contenido y proporciones espaciales estrictas 1:1 (`mockup.html`). Fija la estructura física inmutable. |
| **2** | Templates / Opciones de Diseño | **Studi** | **Los estudios estéticos.** Salai explora libremente variaciones visuales y de estilo en Canva ($1:N$), pero atado a los límites exactos del Abbozzo. |
| **3** | Entregables / Obras Finales | **Opere** | **Las obras terminadas.** Marco aplica la automatización silenciosa para inyectar copys reales, imágenes, firmar criptográficamente y exportar el entregable final. |

---

## Elenco de la Bottega: Los Asistentes Históricos

Para asegurar el rigor del proceso, cada una de las fases de Sinopia está asignada a un asistente virtual con directrices muy estrictas de comportamiento, inspiradas en figuras reales del arte renacentista:

### 👤 [Francesco](https://es.wikipedia.org/wiki/Francesco_Melzi) (El Asistente Metódico)
*   *Francesco Melzi fue el discípulo predilecto de Leonardo da Vinci, famoso por su carácter refinado y ordenado, y por haber custodiado y catalogado meticulosamente todo el legado escrito y científico del maestro tras su muerte.*
*   **En Sinopia (Fase 0 - Gesso):** Francesco es paciente y analítico. Conduce la fase exploratoria sin presionar al usuario con tecnicismos, traduciendo tus intenciones creativas en el documento base determinista (`gesso.md`). Es el guardián de tus ideas.

### 👤 [Giulio](https://es.wikipedia.org/wiki/Giulio_Romano) (El Asistente Estructurador)
*   *Giulio Romano fue el alumno más brillante de Rafael Sanzio, celebrado por su dominio absoluto de la arquitectura de layouts y la composición espacial matemática. Era tan fiel a las directrices de su maestro que fue encargado de finalizar las obras monumentales de Rafael tras su muerte.*
*   **En Sinopia (Fase 1 - Abbozzo):** Giulio toma la especificación de Francesco y la transforma en una maqueta espacial rígida (`mockup.html`). Es un geómetra obsesionado con la jerarquía visual y la distribución equilibrada de bloques de contenido.

### 👤 [Salai](https://es.wikipedia.org/wiki/Gian_Giacomo_Caprotti) (El Asistente Explorador)
*   *Gian Giacomo Caprotti (apodado Salaì o "pequeño diablo") fue el rebelde y caótico ayudante de Leonardo, famoso por sus travesuras en el taller, pero dotado de un talento visual innato y una audacia que lo convirtió en modelo y colaborador de Leonardo durante más de 25 años.*
*   **En Sinopia (Fase 2 - Studi):** Salai es la creatividad estocástica de la IA. Toma el wireframe estricto de Giulio y experimenta libremente con colores, estilos tipográficos y variantes estéticas en las plantillas de Canva. Su caos está domesticado por las compuertas del sistema.

### 👤 [Marco](https://es.wikipedia.org/wiki/Marco_d%27Oggiono) (El Asistente Ejecutor / El Renderizador)
*   *Marco d'Oggiono fue un discípulo destacado de Leonardo, célebre por su técnica impecable para reproducir y finalizar con alta fidelidad los bocetos del maestro. Su copia a escala real de "La Última Cena" es tan precisa que sirve como referencia para estudiar los detalles perdidos del fresco original.*
*   **En Sinopia (Fase 3 - Opere):** Marco no alucina ni toma libertades creativas. Es la automatización determinista que compila el diseño elegido, inyecta los copys reales, verifica los formatos de imagen y exporta los archivos entregables de Canva en alta definición y listos para producción.

---

## Invocación Multilingüe y Compatibilidad

Sinopia está diseñada alrededor de **un solo skill conceptual por fase**, pero accesible a través de múltiples aliases e idiomas para ofrecer una interacción fluida y natural, sin duplicar la lógica de software subyacente.

| Fase | Skill Conceptual | Alias en Español | Alias en Inglés | Alias en Italiano | Compatibilidad Legacy (Canva) |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **0** | **Gesso** | `/lienzo-en-blanco` | `/blank-canvas` | `/tela-bianca`, `/gesso` | `/canva-blank-canvas` |
| **1** | **Abbozzo** | `/boceto` | `/sketch`, `/wireframe` | `/abbozzo` | `/canva-mockup` |
| **2** | **Studi** | `/estudios` | `/studies` | `/studi` | `/canva-draft` |
| **3** | **Opere** | `/obras` | `/works` | `/opere` | `/canva-deliver`, `/canva-refine` |

*Nota: Los alias de la familia `canva-*` garantizan la compatibilidad histórica con la memoria muscular de los usuarios del sistema original.*

---

## Principios Fundacionales de Diseño

1.  **Soberanía Humana (Human-Led):** El usuario es el maestro pintor. Los agentes son sus asistentes de confianza. La IA propone y ejecuta bajo estricta delegación, pero el control ejecutivo e intelectual pertenece al humano.
2.  **Especificación como Ley (Spec-Driven):** Ningún diseño se crea en Canva hasta que la especificación conceptual (*Gesso*) y espacial (*Abbozzo*) haya sido validada por el framework y aprobada digitalmente por el usuario.
3.  **Domesticación del Caos (Chaos Taming):** Aislamos la naturaleza probabilística de los modelos de lenguaje. Si un agente intenta salirse de las reglas o del alcance del brief, el sistema determinista de Sinopia bloquea su acción de inmediato en los *yield gates*.
4.  **Trazabilidad Científica (Auditable):** Al igual que un historiador puede analizar los trazos ocultos de un fresco mediante rayos X, en Sinopia puedes reconstruir con precisión matemática cómo se llegó a una decisión visual analizando los archivos históricos (`gesso.json`, `sesion.json`, `decisions.json`).
5.  **Conversacional, no Formulario:** La recolección de requisitos técnicos ocurre orgánicamente a través de un diálogo guiado y reflexivo con Francesco, evitando los rígidos e impersonales formularios administrativos de software.
6.  **Compatibilidad Silenciosa:** El soporte legacy está integrado de forma transparente en la arquitectura del sistema, asegurando que los scripts, comandos y configuraciones previas sigan funcionando en paralelo.

---

## Estado Actual y Dirección

Sinopia es la evolución conceptual y arquitectónica de `gsd-canva`. Actualmente, estamos en una fase de transición activa:
*   Mantenemos compatibilidad completa con los comandos heredados (`/canva-*`).
*   Estamos migrando y renombrando la infraestructura del CLI para operar bajo el comando global `sinopia`.
*   Estamos implementando las skills conversacionales personalizadas de nuestros asistentes: **Francesco**, **Giulio** y **Salai**.

## Documentación

- **[Guía de usuario: Gesso / Lienzo en Blanco](docs/guides/gesso_lienzo_en_blanco.md)** — Cómo usar la Fase 0, metodologías, flujo Gesso → Mockup.
- [Referencia de comandos: gesso](docs/commands/gesso.md) — Referencia CLI completa de `gsd-canva gesso`.
- [Planes de implementación](docs/implementation_plans/) — Documentos de implementación por fase.

---

> "La IA puede pintar el cuadro. Sinopia resguarda tu visión original."
