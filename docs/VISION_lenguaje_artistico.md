# Vision: Lenguaje Artistico del Proceso Creativo

**Fecha**: 2026-05-31  
**Estado**: Borrador de vision  
**Proposito**: Dar forma a una capa narrativa y artistica para las fases de `gsd-canva`, sin convertirla todavia en especificacion tecnica.

---

## Idea Central

`gsd-canva` no deberia sentirse solamente como un flujo de configuracion, validacion y entrega de archivos. Aunque esas partes tecnicas son necesarias, el usuario esta atravesando un proceso creativo: empieza con una intuicion, prepara una idea, boceta una estructura, explora variaciones y termina produciendo piezas finales.

La vision es que cada fase evoque la creacion de una obra de arte.

El usuario no completa un formulario: prepara un lienzo.  
No genera un wireframe generico: crea un boceto.  
No elige entre outputs frios: revisa estudios visuales.  
No descarga simples archivos: recibe obras finales.

La metafora no debe reemplazar la claridad operativa. Debe darle identidad al proceso.

---

## Capas de Lenguaje

Para evitar que la metafora se vuelva confusa, el sistema puede separar tres capas:

1. **Comandos claros**

   Los comandos y skills deben ser faciles de invocar y entender. Pueden existir en varios idiomas, usando nombres descriptivos.

2. **Narrativa del agente**

   El agente puede explicar lo que esta creando con lenguaje artistico. Esta capa ayuda a que el usuario entienda el sentido creativo del paso actual.

3. **Artefactos con identidad**

   Algunos archivos o carpetas pueden usar nombres artisticos, especialmente cuando el nombre tecnico suena frio o administrativo.

Esta separacion permite que el usuario no necesite conocer terminos italianos para operar el sistema, pero que el proceso tenga una identidad memorable.

---

## Fase 0: Lienzo en Blanco

La primera aplicacion de esta vision es la fase exploratoria previa al mockup.

El concepto publico de la fase es:

- Espanol: **Lienzo en Blanco**
- Ingles: **Blank Canvas**
- Italiano: **Tela Bianca**

La capacidad conceptual es una sola. Los distintos idiomas son aliases, no skills separados con logica duplicada.

Ejemplo de aliases:

```text
/lienzo-en-blanco
/blank-canvas
/tela-bianca
```

La funcion de esta fase es ayudar al usuario a explorar una idea antes de pedirle decisiones tecnicas. El resultado no deberia llamarse necesariamente `brief.md`, porque ese nombre evoca un proceso administrativo o de agencia. Dentro de esta vision, el artefacto puede llamarse:

```text
gesso.md
```

## Gesso

El **gesso** es la preparacion del soporte antes de pintar. En esta metafora, representa la capa base conceptual de la obra: la idea, la intencion, el tono, la audiencia, el contexto y la estructura inicial.

No es todavia el boceto. No es todavia el diseno. Es aquello que prepara el lienzo para que el primer boceto tenga direccion.

Ejemplo de cierre de fase por parte del agente:

> Tus ideas han sido guardadas como el **gesso** de este lienzo: la capa base que prepara la obra antes del primer boceto.

---

## Mapa Artistico de Fases

Esta tabla captura la direccion conceptual, no una decision final de implementacion.

| Fase | Concepto de software | Termino artistico | Funcion narrativa |
| --- | --- | --- | --- |
| 0 | Brief / configuracion inicial | **Gesso** | Preparacion del soporte creativo y metadatos de la idea. |
| 1 | Mockup / wireframe | **Abbozzo** | Boceto estructural, composicion espacial y bloques de contenido. |
| 2 | Templates / opciones de diseno | **Studi** | Estudios visuales y variaciones esteticas automatizadas. |
| 3 | Archivos de salida / entregables | **Opere** | Obras finales personalizadas y listas para uso. |

---

## Principio de Alias Multidioma

Los nombres publicos de los comandos pueden existir en espanol, ingles e italiano para que el sistema sea accesible y para que la capa artistica tenga sentido.

El principio es:

- Un solo skill conceptual.
- Varios aliases de invocacion.
- Una sola logica operativa.
- Narrativa adaptada al idioma del usuario cuando sea posible.

Ejemplo para Fase 0:

| Idioma | Alias | Nombre conceptual |
| --- | --- | --- |
| Espanol | `/lienzo-en-blanco` | Lienzo en Blanco |
| Ingles | `/blank-canvas` | Blank Canvas |
| Italiano | `/tela-bianca` | Tela Bianca |

El artefacto `gesso.md` puede mantenerse igual en todos los idiomas, porque funciona como termino artistico propio del sistema.

---

## Aliases por Fase

Cada fase puede tener un solo skill conceptual y varios aliases de entrada. Esto permite que el usuario invoque la fase desde el idioma que le resulte mas natural, sin duplicar la logica del sistema.

La intencion es que los nombres actuales de Canva puedan mantenerse como compatibilidad legacy, mientras que los nuevos aliases expresan mejor la vision artistica. Para fases nuevas, puede existir tambien un alias de familia `canva-*` en ingles funcional, aunque no sea legacy historico.

| Fase | Skill conceptual | Espanol | Ingles | Italiano | Familia Canva / Legacy |
| --- | --- | --- | --- | --- | --- |
| 0 | Gesso | `/lienzo-en-blanco` | `/blank-canvas` | `/tela-bianca`, `/gesso` | `/canva-blank-canvas` |
| 1 | Abbozzo | `/boceto` | `/sketch`, `/wireframe` | `/abbozzo` | `/canva-mockup` |
| 2 | Studi | `/estudios` | `/studies` | `/studi` | `/canva-draft` |
| 3 | Opere | `/obras` | `/works` | `/opere` | `/canva-deliver`, `/canva-refine` |

Esta tabla no obliga a que todos los aliases se implementen al mismo tiempo. Su funcion es definir una direccion de naming coherente:

- **Espanol** para usuarios que quieren claridad directa.
- **Ingles** para compatibilidad con entornos y equipos internacionales.
- **Italiano** para la capa artistica y la identidad del framework.
- **Familia Canva / Legacy** para mantener consistencia con el patron historico `/canva-*` y no romper flujos existentes ni memoria muscular.

Los aliases de la familia Canva pueden seguir funcionando aunque ya no sean la forma preferida de explicar la fase.

---

## Lo Que Esta Vision No Intenta Hacer

Esta vision no propone convertir todos los comandos en italiano ni obligar al usuario a aprender vocabulario artistico.

Tampoco intenta reemplazar los conceptos tecnicos internos que ya existen en el sistema. `plan`, `decisions`, `mockup`, estados, confirmaciones y validaciones pueden seguir existiendo donde aportan claridad tecnica.

La capa artistica debe aparecer donde mejora la experiencia:

- Al nombrar artefactos creativos.
- Al explicar el significado de una fase.
- Al cerrar una etapa con una sensacion de avance creativo.
- Al darle coherencia al viaje completo del usuario.

---

## Tono Deseado

El lenguaje debe sentirse artistico sin volverse pretencioso.

Debe ayudar al usuario a sentir que esta creando algo, pero sin esconder lo que el sistema esta haciendo.

Buenos ejemplos:

- "Vamos a preparar el gesso de tu lienzo."
- "Con esta base, ya podemos pasar al primer abbozzo."
- "Voy a generar varios studi para explorar direcciones visuales."
- "Estas son las opere finales listas para revisar."

Ejemplos a evitar:

- Usar terminos italianos sin explicacion.
- Cambiar nombres tecnicos criticos solo por estetica.
- Hacer que el usuario tenga que recordar el vocabulario para avanzar.
- Tratar archivos tecnicos como si fueran parte de la metafora cuando eso reduce claridad.

---

## Direccion General

La vision general es que `gsd-canva` tenga una doble naturaleza:

- Por dentro, un sistema determinista, verificable y auditable.
- Por fuera, una experiencia creativa que acompana la produccion de una obra.

El lenguaje artistico no reemplaza la arquitectura. La humaniza.

---

## Naming del Fork

La nueva vision puede vivir mejor en un fork con nombre propio, separado de `gsd-canva`. El nombre debe comunicar que el proyecto no es solo una herramienta para Canva, sino un taller creativo deterministico donde el humano conserva la direccion artistica y el agente actua como ayudante.

La tesis del proyecto:

- La creacion con agentes de IA puede volverse caotica, especialmente cuando una IA interpreta lo que pide otra IA sobre lo que pidio un humano.
- No se puede controlar completamente lo que hace la IA de Canva.
- Si se puede controlar el marco de trabajo del agente propio.
- El agente puede alucinar, pero el proceso no deberia hacerlo.
- La respuesta es adaptar el espiritu de Spec Driven Development al diseno asistido por IA: un proceso creativo guiado por especificaciones, fases, artefactos y confirmaciones.

En esta vision, el usuario es el artista. El agente es su ayudante de taller: prepara, ordena, registra, ejecuta y reduce distracciones, pero no reemplaza la vision humana.

### Nombre elegido: Sinopia

**Sinopia** es la direccion elegida para el fork.

La sinopia es el dibujo preparatorio que queda debajo de un fresco. Funciona como metafora central porque representa la estructura invisible que guia la obra final. No es la pintura terminada, pero sin ella la obra pierde direccion.

Para este proyecto, Sinopia comunica:

- La especificacion como dibujo preparatorio.
- El proceso deterministico como estructura bajo la obra.
- La creatividad humana como capa visible y final.
- El agente como asistente que ayuda a trazar y preservar esa estructura.

Taglines posibles:

```text
Sinopia
A deterministic underdrawing for AI-assisted design.
```

```text
Sinopia
Spec-driven creative workflow for human-led AI design.
```

```text
Sinopia
The hidden structure behind AI-assisted creative work.
```

### Nombres considerados

Estos nombres quedan anotados como exploracion conceptual:

| Nombre | Lectura |
| --- | --- |
| **Atelier** | Taller o estudio de artista. Claro en ingles, elegante e internacional. |
| **Bottega** | Taller renacentista italiano con maestro, ayudantes y produccion de obra. Muy alineado con la vision, pero ya aparece usado en espacios AI/tech. |
| **Melzi Atelier** | Combina el asistente historico de Leonardo con la idea de taller creativo. |
| **Gesso Studio** | Enfatiza la preparacion conceptual como base de la obra. |
| **Gesso Protocol** | Une la metafora artistica con el marco deterministico del proceso. |
| **Atelier Protocol** | Comunica taller creativo y reglas de proceso. |
| **Spec Atelier** | Conexion directa con Spec Driven Development aplicado a diseno. |
| **Urbino** | Ciudad renacentista y posible referencia a un asistente de Miguel Angel. Sobrio, italiano y usable como marca. |
| **Firenze** | Florencia en italiano. Renacimiento, arte y taller, aunque muy amplio y usado. |
| **Vinci** | Lugar asociado a Leonardo. Corto y potente, pero muy ligado a una sola figura. |
| **Carrara** | Marmol, escultura y materia prima antes de ser obra. Buena metafora de dar forma. |
| **Ravenna** | Mosaicos, color, composicion e historia visual. |
| **Mantova** | Corte renacentista, arte y elegancia discreta. |
| **Siena** | Ciudad artistica, simple y pronunciable. |
| **Arno** | Rio de Florencia. Corto, poetico y menos literal. |
| **Oltrarno** | Barrio artesanal de Florencia. Evoca talleres, oficio y trabajo manual. |
| **San Marco** | Referencia florentina vinculada a arte y espiritualidad visual. |
| **Casa Buonarroti** | Referencia a Miguel Angel y su legado. Muy especifica. |
| **Casa Vasari** | Arte, metodo e historia del arte. |
| **Le Stanze** | Las estancias, asociado a Rafael. Suena como espacio creativo. |
| **Stanza** | Habitacion o estudio. Simple, italiano y usable. |
| **Il Laboratorio** | Taller/laboratorio, aunque puede sonar mas cientifico que artistico. |
| **Lo Studio** | Claro y directo, pero generico. |
| **Tavola** | Tabla o panel de pintura. Simple y material. |
| **Tela** | Lienzo en italiano. Minimalista y visual. |
| **Cartone** | Carton preparatorio renacentista, aunque en espanol puede sonar demasiado comun. |
| **Fresco** | Tecnica y resultado mural. Vivo y artistico, pero palabra muy usada. |
