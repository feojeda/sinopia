# Sinopia

<p align="center">
  <img src="docs/images/sinopia_logo.png" alt="Sinopia Logo" width="300" />
</p>

**Spec-driven creative workflow for human-led AI design.**

Sinopia is an early-stage framework for making AI-assisted design less chaotic, more auditable, and more human-directed.

It started from a practical frustration: when a human asks an AI agent to create something in Canva through the Canva MCP, there may be two AI systems involved. One AI interprets the human's intent, then another AI interprets what the first AI asked Canva to do. That chain can be powerful, but it also multiplies ambiguity.

Sinopia exists to reduce that ambiguity.

The agent may hallucinate. The process should not.

---

## Why Sinopia Exists

AI design tools are good at generating. They are less reliable at preserving intent.

For a human trying to create real design work, the frustrating parts are familiar:

- The agent makes assumptions before understanding the creative direction.
- The output looks plausible but does not match the user's vision.
- Design decisions happen implicitly instead of being agreed explicitly.
- The user has to correct the same intent over and over.
- The system moves forward without a clear artifact trail.
- When another AI system is involved, the creative process becomes even harder to control.

Sinopia approaches this as a software engineering problem and a creative workflow problem at the same time.

From software engineering, it borrows the discipline of spec-driven development: explicit phases, durable artifacts, state, validation, confirmations, and reproducible handoffs.

From art and design, it borrows the language of the studio: blank canvas, preparation, sketch, studies, and final works.

The goal is not to make the agent the artist.

The goal is to give the human artist a reliable assistant.

---

## The Core Idea

Sinopia is a deterministic creative workshop around AI-assisted design.

The human owns the vision.

The agent acts as a studio assistant:

- asks clarifying questions,
- preserves context,
- prepares structured artifacts,
- proposes next steps,
- executes bounded tasks,
- records decisions,
- and avoids moving beyond what the user approved.

The framework cannot fully control what an external AI, such as Canva's AI layer, will do. But it can control the process used by the user's own agent before, during, and after that interaction.

That process is the product.

---

## What "Sinopia" Means

A **sinopia** is the preparatory underdrawing beneath a fresco.

It is not the final painting. It is the hidden structure that guides the visible work.

That metaphor fits the project:

- the specification is the underdrawing,
- the deterministic workflow is the structure beneath the creative output,
- the final design remains a human-led work,
- and the agent helps trace, preserve, and follow that structure.

---

## Creative Phases

Sinopia frames the design process as the creation of a work of art.

| Phase | Software concept | Artistic term | Role |
| --- | --- | --- | --- |
| 0 | Brief / initial configuration | **Gesso** | Prepares the creative surface: intent, audience, tone, context, constraints, and metadata. |
| 1 | Mockup / wireframe | **Abbozzo** | Creates the structural sketch: composition, layout, hierarchy, and content blocks. |
| 2 | Templates / design options | **Studi** | Explores visual studies: multiple aesthetic directions from one structure. |
| 3 | Output files / deliverables | **Opere** | Produces final works: polished, personalized pieces ready for use. |

The artistic language is not meant to obscure the system. It gives the workflow identity while the underlying mechanics stay explicit and auditable.

---

## Multilingual Invocation

Sinopia is designed around one conceptual skill per phase, with multiple aliases rather than duplicated logic.

| Phase | Conceptual skill | Spanish | English | Italian | Compatibility |
| --- | --- | --- | --- | --- | --- |
| 0 | Gesso | `/lienzo-en-blanco` | `/blank-canvas` | `/tela-bianca`, `/gesso` | `/canva-blank-canvas` |
| 1 | Abbozzo | `/boceto` | `/sketch`, `/wireframe` | `/abbozzo` | `/canva-mockup` |
| 2 | Studi | `/estudios` | `/studies` | `/studi` | `/canva-draft` |
| 3 | Opere | `/obras` | `/works` | `/opere` | `/canva-deliver`, `/canva-refine` |

The `canva-*` names preserve continuity with the original project. The artistic names express the direction of the new framework.

---

## Design Principles

**Human-led**

The user is the artist. The agent is an assistant, not the source of creative authority.

**Spec-driven**

Creative intent should become durable artifacts before production begins.

**Deterministic where it matters**

The system should use explicit state, files, confirmations, and validations to reduce ambiguity.

**Conversational, not form-driven**

The user should be able to explore freely, while the agent quietly turns that exploration into structured context.

**Auditable**

Every important creative decision should be recoverable later: what was agreed, why it mattered, and what artifact used it.

**Compatible**

The framework can still support existing agent surfaces and Canva-oriented commands while moving toward the Sinopia language.

---

## Current Status

Sinopia is a public fork and vision-stage evolution of `gsd-canva`.

The current codebase still contains the original `gsd-canva` CLI, adapters, plans, and Canva workflow artifacts. The new Sinopia vision is being shaped in documentation first before the implementation is renamed or restructured.

Important vision documents:

- [`docs/VISION_lenguaje_artistico.md`](docs/VISION_lenguaje_artistico.md)
- [`docs/PROPOSAL_v1.5_lienzo_en_blanco.md`](docs/PROPOSAL_v1.5_lienzo_en_blanco.md)

---

## Project Direction

Sinopia will evolve toward a framework where:

- the blank canvas phase captures creative intent before technical decisions,
- `gesso.md` replaces cold administrative naming like `brief.md`,
- agent skills are presented through clear multilingual aliases,
- artistic phase names guide the experience without hiding the mechanics,
- the agent behaves as a disciplined studio assistant,
- and the process remains deterministic even when AI-generated outputs are uncertain.

In short:

> AI can generate the image. Sinopia protects the intent.

