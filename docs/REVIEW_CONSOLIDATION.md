# Procedimiento de Consolidación de Reviews

Este documento define cómo consolidar los outputs de múltiples reviewers en un solo documento de review accionable, siguiendo el template estándar.

## Propósito

Cuando se ejecuta `/review-strategy`, los subagentes producen reviews independientes. Este procedimiento define cómo un consolidador independiente fusiona esos outputs en un solo review final, deduplicando hallazgos y resolviendo conflictos.

El resultado es **un documento de review consolidado**, no una evaluación de los reviewers.

## Flujo de Tokens

El agente principal (quien ejecuta `/review-strategy`) **no debe leer el contenido de los subagentes**. El flujo es:

1. **Agente principal**: prepara el directorio, congela target + contexto, lanza subagentes reviewers en paralelo.
2. **Cada reviewer**: lee target + contexto desde disco, escribe su review a `<dir>/reviewers/<archetype>.md`, retorna solo confirmación de completion.
3. **Agente principal**: confirma que todos los reviewers terminaron, lanza el consolidador.
4. **Consolidador**: lee los archivos de reviewers desde disco, escribe el review consolidado a `<dir>/review.md`, retorna solo confirmación con verdict + count.
5. **Agente principal**: presenta el resumen final al usuario.

Esto minimiza el consumo de tokens del agente principal — nunca carga el contenido completo de los reviews en su contexto.

## Procedimiento

### 1. Leer inputs

El consolidador debe leer:

- El documento target congelado (`.experiments/review-strategy/<ts>/input/target.md`)
- El contexto del repo (`.experiments/review-strategy/<ts>/input/repo-context.md`)
- Todos los reviews crudos de los reviewers activos según la estrategia

El consolidador **no** lee outputs de otros reviewers durante su fase de review — esto aplica solo al consolidador, que opera después de que todos los reviewers terminaron.

### 2. Deduplicar hallazgos

Para cada hallazgo en cada review crudo:

1. **Agrupar por dedup key**: hallazgos con el mismo dedup key son el mismo hallazgo.
2. **Si un hallazgo no tiene dedup key pero coincide en lines + claim**: tratar como duplicado.
3. **Clasificar cada hallazgo único** como:
   - `valid`: problema real con evidencia concreta
   - `duplicate`: ya cubierto por otro reviewer ( registrar quién lo encontró primero)
   - `weak`: especulativo, sin evidencia concreta, o el propio reviewer lo descartó
   - `false_positive`: la evidencia contradice el claim o el problema no existe

### 3. Resolver conflictos

Cuando reviewers discrepan sobre el mismo hallazgo:

| Conflicto | Regla |
|---|---|
| Severidad diferente | Tomar la **más alta** (P1 > P2 > P3) |
| Status: `valid` vs `uncertain` | Marcar como `valid` si al menos un reviewer aporta evidencia concreta |
| Un reviewer dice P1 y otro dice non-issue | Incluir como hallazgo con la severidad más alta, anotar la discrepancia |
| Categoría diferente | Usar la categoría del reviewer con mayor evidencia |

### 4. Producir el review consolidado

Usar el template estándar de review definido en `docs/REVIEW_STRATEGIES.md`:

```md
# Review Consolidado: <target>

## Meta

- Target: <archivo o descripción>
- Estrategia: <1|2|3> — <nombre>
- Reviewers: <lista de arquetipos activos>
- Fecha: <timestamp>

## Summary

- Verdict: approve | approve_with_changes | reject_until_fixed
- Top risk: <hallazgo de mayor riesgo>
- Confidence: high | medium | low

## Findings

### <FINDING_ID>: <short title>

- Severity: P1 | P2 | P3
- Category: state | cli-contract | ux | testing | integrity | docs | other
- Status: valid | uncertain
- File:
- Lines:
- Claim:
- Evidence:
- Impact:
- Recommendation:
- Suggested test:
- Dedup key:
- Sources: <reviewer:finding-id, reviewer:finding-id>

## Non-Issues Checked

- <cosas verificadas y consideradas OK por los reviewers>

## Residual Risks

- <riesgos no completamente verificados>
```

### Reglas para el consolidador

- Cada finding consolidado debe incluir el campo `Sources` indicando qué reviewers lo encontraron.
- Si solo un reviewer encontró un hallazgo pero la evidencia es concreta, incluirlo como `valid`.
- Si un hallazgo es `weak` pero otro reviewer lo confirmó con evidencia, subir a `valid`.
- Los `Non-Issues Checked` se fusionan: si todos los reviewers verificaron algo, incluirlo una vez.
- Las `Residual Risks` se fusionan y deduplican por tema.
- El `Verdict` se determina por el hallazgo de mayor severidad: si hay al menos un P1 → `reject_until_fixed`; si hay P2 → `approve_with_changes`; si solo P3 → `approve_with_changes` o `approve`.

### 5. Preservar reviewers crudos

Los archivos individuales de cada reviewer se mantienen en `reviewers/` para auditoría y referencia, pero **no son el deliverable**. El deliverable es el review consolidado.

## Estructura de Directorio

```text
.experiments/review-strategy/YYYYMMDD-HHMMSS/
  input/
    target.md | diff.patch
    repo-context.md
  reviewers/
    pragmatic.md
    operator.md
    modeler.md
    agent-ux.md
    security-integrity.md
    qa-verification.md
  review.md
```

Solo crear los archivos necesarios según la estrategia seleccionada.

## Prompt Base para Revisores

Cada subagente reviewer debe recibir estas instrucciones:

```text
You are a clean-context reviewer for a technical proposal.

Do not edit the review target or source files.
Do not read other reviewers' outputs.
Review the frozen target document and the repo context.

Focus area: <archetype focus — ver docs/REVIEW_STRATEGIES.md sección Arquetipos>.

Read the target document at <path-to-target> and repo context at <path-to-repo-context>.
Write your complete review to <path-to-output-file> using the Write tool.

Use the exact Markdown output format defined in docs/REVIEW_STRATEGIES.md (Template Estándar de Review).
Follow the severity, category, and finding rules defined there.

IMPORTANT: Write the review file directly. Return only a brief confirmation that the review is complete.
```

## Prompt Base para el Consolidador

El consolidador es un subagente independiente que lee los archivos desde disco:

El agente principal construye el prompt del consolidador listando las rutas exactas de los archivos que debe leer. El agente principal conoce la estrategia y el timestamp, así que solo pasa strings — no lee el contenido.

Ejemplo de prompt para estrategia 2 con timestamp `20260530-133002`:

```text
You are a clean-context consolidator of a multi-agent review.

Read these exact files from disk using the Read tool:
- <base>/input/target.md
- <base>/input/repo-context.md
- <base>/reviewers/pragmatic.md
- <base>/reviewers/operator.md
- <base>/reviewers/modeler.md
- <base>/reviewers/agent-ux.md

Where <base> = .experiments/review-strategy/20260530-133002

Do NOT rely on any context provided in this prompt. Read the files yourself.

Deduplicate equivalent findings by dedup key.
Resolve conflicts using highest severity.
Classify each unique finding as valid, duplicate, weak, or false_positive.
Produce a SINGLE consolidated review document.

Follow the consolidation rules in docs/REVIEW_CONSOLIDATION.md:
- Highest severity wins on conflicts
- Include Sources field listing which reviewers contributed to each finding
- Verdict: P1 present → reject_until_fixed; P2 present → approve_with_changes; only P3 → approve_with_changes

The output must be one actionable review of the target — not an evaluation of the reviewers.

Write the consolidated review to <base>/review.md using the Write tool.

IMPORTANT: Write the file directly. Return only a brief confirmation with the verdict and finding count.
```

### Template dinámico

El agente principal construye la lista de reviewers según la estrategia:

| Estrategia | Archivos de reviewer |
|---|---|
| 1 | pragmatic.md, operator.md, modeler.md |
| 2 | pragmatic.md, operator.md, modeler.md, agent-ux.md |
| 3 | pragmatic.md, operator.md, modeler.md, agent-ux.md, security-integrity.md, qa-verification.md |
