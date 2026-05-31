# Estrategias de Review con Subagentes

Este documento define configuraciones reutilizables para revisar propuestas técnicas con subagentes de contexto limpio.

La recomendación actual, basada en el experimento de `.experiments/review-archetypes`, es usar 4 arquetipos por defecto: `pragmatic`, `operator`, `modeler` y `agent-ux`.

## Principios

- Cada subagente debe partir con contexto limpio.
- Cada subagente debe recibir el mismo documento congelado y el mismo contexto mínimo del repo.
- Los subagentes no deben leer outputs de otros subagentes.
- Los reviews deben escribirse en archivos separados.
- Un evaluador independiente debe consolidar, deduplicar y puntuar los resultados.
- La comparación debe priorizar hallazgos válidos únicos y score por agente, no cantidad bruta de comentarios.
- El resultado principal debe ser un review consolidado accionable del target. La evaluación de calidad de los reviewers es secundaria.
- Los subagentes reviewers deben ejecutarse siempre en modo low reasoning/low-cost por defecto. No usar agentes caros salvo petición explícita del usuario.

## Slash Command

La fuente versionable del comando corto está en `docs/commands/review-strategy.md`.

Para Antigravity 2.0 / Antigravity CLI, la forma correcta es un workspace skill en `.agents/skills/review-strategy/SKILL.md`; los skills se exponen como slash commands. En Codex local de este repo se mantiene una copia activa en `.codex/commands/review-strategy.md`.

Uso:

```text
/review-strategy 2 docs/PROPOSAL_v1.2_interactive_questions.md
/review-strategy 3 current-pr
```

## Arquetipos

### Pragmatic

Enfoque: viabilidad de implementación, compatibilidad con el código actual, comportamiento CLI, migración y tests.

Útil para detectar:

- Contratos ambiguos entre manager y CLI.
- Cambios que rompen comportamiento existente.
- Tests poco aislados o difíciles de mantener.
- Instrucciones demasiado amplias que invitan a refactors accidentales.

### Operator

Enfoque: estados, locks, idempotencia, fallos parciales, recuperación y orden de operaciones.

Útil para detectar:

- Transiciones incompletas.
- Estados intermedios inconsistentes.
- Recuperación incorrecta después de fallos.
- Riesgos por operaciones no atómicas.

### Modeler

Enfoque: invariantes, semántica, nombres, contratos y consistencia conceptual.

Útil para detectar:

- Campos o flags que prometen más de lo que prueban.
- Nombres que inducen interpretación incorrecta.
- Estados o conceptos superpuestos.
- Invariantes que no cubren todos los casos reales.

### Agent UX

Enfoque: cómo un agente o usuario puede malinterpretar el flujo, ergonomía de preguntas, instrucciones interactivas y recuperación.

Útil para detectar:

- Ambigüedad en prompts o templates.
- Flujos interactivos donde el usuario responde de forma natural pero el sistema guarda algo incorrecto.
- Preguntas opcionales que se repiten por falta de estado durable.
- Mensajes de error correctos técnicamente pero pobres para recuperación.

### Security Integrity

Enfoque: integridad de artefactos, hashes, trust boundaries, tampering y permisos.

Útil para planes con:

- Artefactos generados que se aprueban o publican.
- Hashes, checksums o firmas.
- Inputs externos o archivos editables por agentes.
- Estados donde una aprobación tiene consecuencias irreversibles.

### QA Verification

Enfoque: criterios de aceptación, reproducibilidad, CI, pruebas de contrato y cobertura de negativos.

Útil para planes con:

- Cambios de CLI.
- Contratos stdout/stderr/exit code.
- Workflows largos con varios estados.
- Riesgo de tests frágiles por fixtures compartidos.

## Configuraciones

### Escenario 1: Review eficiente

Agentes:

- `pragmatic`
- `operator`
- `modeler`

Usar cuando:

- La propuesta es pequeña o de bajo riesgo.
- Se busca feedback rápido.
- El foco es implementación y consistencia técnica.

Resultado esperado:

- Buen score por agente.
- Menos cobertura de UX e interacción.

### Escenario 2: Default recomendado

Agentes:

- `pragmatic`
- `operator`
- `modeler`
- `agent-ux`

Usar cuando:

- La propuesta modifica workflows de agentes o usuarios.
- Hay comandos interactivos, prompts, templates o preguntas.
- Se quiere buen balance calidad/costo.

Resultado esperado:

- Mejor balance entre hallazgos técnicos y riesgos de uso.
- Menos duplicación que configuraciones más grandes.

### Escenario 3: Review ampliado

Agentes:

- `pragmatic`
- `operator`
- `modeler`
- `agent-ux`
- `security-integrity`
- `qa-verification`

Usar cuando:

- La propuesta toca seguridad, integridad, approvals o artefactos persistidos.
- Cambia contratos CLI o comportamiento de CI.
- El costo adicional está justificado por el riesgo.

Resultado esperado:

- Mayor cobertura total.
- Más duplicación.
- Menor score por agente.

## Procedimiento Recomendado

1. Congelar el documento bajo review en un archivo de input.
2. Crear un snapshot mínimo del repo con rutas importantes, contratos actuales y hechos relevantes.
3. Crear un prompt por arquetipo.
4. Ejecutar cada agente en contexto limpio, idealmente con sandbox read-only.
5. Guardar cada review en un archivo separado.
6. Ejecutar un evaluador independiente con acceso a todos los reviews.
7. Pedir al evaluador que clasifique cada hallazgo como:
   - `valid`
   - `duplicate`
   - `weak/speculative`
   - `false_positive`
   - `already_covered`
8. Puntuar por hallazgos válidos únicos, duplicación y ruido.
9. Decidir qué configuración usar en futuros reviews según score total y score por agente.

## Rubrica de Evaluación

```text
High valid finding: +3
Medium valid finding: +2
Low valid finding: +1
Useful unique finding: +2
False positive: -2
Weak or speculative finding: -1
Excess duplicate: -1
```

Métricas a reportar:

- `score`
- `score_per_agent`
- `valid_high`
- `valid_medium`
- `valid_low`
- `unique_valid_findings`
- `duplicates`
- `weak_findings`
- `false_positives`
- `best_unique_finding`
- `noise_summary`

## Resultado del Experimento Inicial

El experimento comparó 3 escenarios sobre `docs/PROPOSAL_v1.2_interactive_questions.md`.

| Escenario | Agentes | Score | Score/agente | Lectura |
|---|---:|---:|---:|---|
| Escenario 1 | 3 | 23 | 7.67 | Muy eficiente, pero pierde hallazgos UX |
| Escenario 2 | 4 | 30 | 7.50 | Mejor balance calidad/costo |
| Escenario 3 | 6 | 33 | 5.50 | Más cobertura, demasiada duplicación |

Conclusión:

- Usar Escenario 2 como default.
- Usar Escenario 1 para revisiones rápidas o de bajo riesgo.
- Usar Escenario 3 solo cuando el riesgo técnico justifique más costo y consolidación.

## Template Estándar de Review

Todos los subagentes deben usar el mismo formato de salida. Esto reduce costo de consolidación, facilita deduplicar hallazgos equivalentes y permite comparar escenarios de forma consistente.

```md
# Review: <archetype>

## Summary

- Verdict: approve | approve_with_changes | reject_until_fixed
- Top risk:
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

## Non-Issues Checked

- <thing checked and considered OK>

## Residual Risks

- <anything not fully verified>
```

### Severidad

- `P1`: bloquea aprobación. Puede romper flujo principal, integridad, estado, datos, seguridad o contrato público.
- `P2`: debe corregirse antes o durante implementación. Riesgo real, pero no necesariamente bloquea todo el plan.
- `P3`: mejora de claridad, UX, documentación o test coverage. Válida, pero no crítica.

### Categorías

- `state`: máquina de estados, transiciones, locks, idempotencia, recuperación.
- `cli-contract`: stdout, stderr, exit codes, shape JSON, compatibilidad CLI.
- `ux`: interacción humano/agente, preguntas, prompts, errores recuperables.
- `testing`: cobertura, aislamiento, reproducibilidad, CI.
- `integrity`: hashes, artefactos, aprobaciones, tampering, trust boundaries.
- `docs`: instrucciones ambiguas, referencias obsoletas, ejemplos inconsistentes.
- `other`: usar solo si ninguna categoría aplica.

### Reglas para Findings

- Cada finding debe ser atómico: un problema, un impacto, una recomendación.
- Si dos problemas comparten causa pero tienen impactos o tests distintos, separarlos.
- No reportar estilo o wording salvo que cree riesgo real de implementación o uso.
- `Evidence` debe citar el documento bajo review y, cuando aplique, el código actual.
- `Impact` debe explicar qué se rompe o qué decisión incorrecta tomaría un implementador/agente.
- `Suggested test` debe ser concreto cuando el finding afecte comportamiento verificable.
- `Dedup key` debe ser estable y semántico, por ejemplo `reset-confirmation-pending-approval-state`.

### Ejemplo de Finding

```md
### P1-001: reset-confirmation does not define pending_approval rollback

- Severity: P1
- Category: state
- Status: valid
- File: docs/PROPOSAL_v1.2_interactive_questions.md
- Lines: 208-213
- Claim: reset-confirmation accepts mockup:pending_approval and unlocks decisions for editing.
- Evidence: The proposal accepts pending_approval but only says ready_for_html reverts to questions_pending. plan answer requires mockup:questions_pending.
- Impact: A submitted mockup can remain uneditable after reset, and stale approval paths may remain open.
- Recommendation: Define reset from both ready_for_html and pending_approval to mockup:questions_pending, invalidate mockup.html, clear confirmation, and add history.
- Suggested test: Confirm, resolve, submit mockup, reset-confirmation, then assert state is questions_pending and plan answer succeeds.
- Dedup key: reset-confirmation-pending-approval-state
```

## Prompt Base para Reviewers

```text
You are a clean-context reviewer for a technical proposal.

Do not edit files.
Do not read other reviewers' outputs.
Review the frozen target document and the repo context.

Focus area: <archetype focus>.

Use this exact Markdown output format:

# Review: <archetype>

## Summary

- Verdict: approve | approve_with_changes | reject_until_fixed
- Top risk:
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

## Non-Issues Checked

- <thing checked and considered OK>

## Residual Risks

- <anything not fully verified>
```

## Prompt Base para Evaluador

```text
You are a clean-context evaluator of a multi-agent review experiment.

Read:
- the frozen target document
- repo context
- raw review files for each scenario

Deduplicate equivalent findings.
Classify each finding as valid, duplicate, weak/speculative, false_positive, or already_covered.
Score each scenario using the agreed rubric.
Identify which larger-scenario-only findings justified added agents.
Recommend the best default configuration.
```
