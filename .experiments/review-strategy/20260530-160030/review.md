# Review Consolidado: docs/PROPOSAL_v1.2_interactive_questions.md

## Meta

- Target: docs/PROPOSAL_v1.2_interactive_questions.md
- Estrategia: 2 — Default recomendado
- Reviewers: pragmatic, operator, modeler, agent-ux
- Fecha: 20260530-160030

## Summary

- Verdict: approve_with_changes
- Top risk: `resetConfirmation()` crash between plan.json (step 4) and decisions.json (step 5) produces a state where `questions()` returns `suggestedAction: "retry_resolve"`, causing the agent to silently undo the user's reset via a successful `resolveQuestions()`.
- Confidence: high

## Findings

### CF-01: `ensureV2Fields()` no hace deep-merge del skeleton `confirmation` para planes v1.1

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:98
- Claim: `ensureV2Fields()` usa `decisions.confirmation = decisions.confirmation || { skeleton }` que es all-or-nothing. Para planes v1.1 donde `confirmation` ya existe (con 4 campos), el `||` cortocircuita y `confirmedBy` y `source` quedan como `undefined` en vez de `null`/`"chat"`.
- Evidence: El skeleton v2 tiene 6 campos (`confirmed`, `confirmedAt`, `confirmedBy`, `source`, `decisionsHash`, `hashAlgorithm`). El objeto v1.1 tiene 4 campos (repo-context.md:70-76). Un objeto truthy con 4 campos no dispara el fallback `||`. Tres reviewers independientes confirman que `confirmedBy` queda `undefined` y `source` queda `undefined`. `resetConfirmation()` (target.md:310) después escribe `confirmedBy = null`, creando inconsistencia `undefined` vs `null` antes/después de primer reset.
- Impact: Cualquier código que compare `confirmation.confirmedBy !== null` evalúa `true` para `undefined !== null`. JSON serialization omite keys `undefined`, produciendo output inconsistente entre planes nuevos y migrados. La garantía "skeleton completo" es falsa para v1.1.
- Recommendation: Reemplazar el `||` por per-field patching con nullish coalescing: `decisions.confirmation = decisions.confirmation || {};` seguido de `decisions.confirmation.confirmedBy = decisions.confirmation.confirmedBy ?? null; decisions.confirmation.source = decisions.confirmation.source ?? "chat";` para cada campo del skeleton.
- Suggested test: Fixture v1.1 con `confirmation: { confirmed: false, hashAlgorithm: "sha256-decisions-v1" }` → `answer('vertical', 'test')` → leer decisions.json de disco → assert `confirmation.confirmedBy === null` y `confirmation.source === "chat"`.
- Dedup key: ensurev2fields-partial-confirmation-merge
- Sources: pragmatic:P2-02, operator:OP-02, modeler:F1

### CF-02: `resetConfirmation()` crash recovery produce `suggestedAction` incorrecto que deshace el reset

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:240-244, 306-314
- Claim: Si `resetConfirmation()` crashea entre paso 4 (escribir plan.json → `questions_pending`) y paso 5 (escribir decisions.json → `confirmed=false`), el estado es `questions_pending + confirmed === true` con hash válido. `questions()` retorna `suggestedAction: "retry_resolve"`. El agente ejecuta `resolveQuestions()` que verifica estado (`questions_pending` válido), confirmación (`true`), hash (match) — y **tiene éxito**, revirtiendo a `ready_for_html`. El reset del usuario se deshace silenciosamente.
- Evidence: Target §4 define write order: plan.json antes que decisions.json. Target §2 mapea `questions_pending + confirmed === true → suggestedAction: "retry_resolve"`. Template §6 dice "ejecutar resolve-questions. Si falla, entonces reset-confirmation." `resolveQuestions()` no falla en este escenario porque decisions.json no fue modificado (hash sigue matcheando). El agente nunca alcanza el fallback.
- Impact: El agente revierte el reset explícito del usuario sin error ni warning. Las decisiones originales se restauran y el mockup no se stalea. La intención del usuario se pierde.
- Recommendation: `questions()` debe inspeccionar el último entry de `history` — si es `{ action: 'reset-confirmation', ... }`, retornar `suggestedAction: "suggest_reset"` en vez de `"retry_resolve"`. Esto mantiene la decisión en la API sin cambiar el template.
- Suggested test: Fixture: plan.json con `status: "questions_pending"` e history terminando en `{ action: "reset-confirmation", from: "ready_for_html", to: "questions_pending" }`; decisions.json con `confirmed: true` y hash válido. Llamar `questions()`. Assert `suggestedAction === "suggest_reset"` (no `"retry_resolve"`).
- Dedup key: reset-crash-suggested-action
- Sources: pragmatic:P2-01

### CF-03: Notación de estado `mockup:questions_pending` es ambigua contra el formato almacenado

- Severity: P2
- Category: docs
- Status: valid
- File: target.md
- Lines: target.md:236-244, 268, 299-300
- Claim: El target usa `mockup:questions_pending` como identificador de estado a lo largo de todo el documento, pero `plan.json` almacena `phase` y `status` como campos separados. Nunca se aclara si `mockup:questions_pending` es un string literal o shorthand de dos campos.
- Evidence: Repo-context.md confirma `{ "phase": "mockup", "status": "questions_pending" }`. Target §3 dice "validar estado mockup:questions_pending (de plan.json)". Un implementador podría codificar `status === 'mockup:questions_pending'` (literal) o `phase === 'mockup' && status === 'questions_pending'` (split). Ambas interpretaciones son razonables.
- Impact: Si un implementador usa el string literal para `status`, todos los checks de estado fallan silenciosamente y todas las operaciones rechazan con `GSDC_INVALID_STATE`. El flujo completo se rompe.
- Recommendation: Agregar nota explícita al inicio de §Changes: "State identifiers usan notación `phase:status`. Implementación debe verificar `plan.phase === 'mockup' && plan.status === '<status>'`, no `plan.status === 'mockup:<status>'`." Mostrar un ejemplo del check real.
- Suggested test: No testable como document review — los tests existentes lo cubren implícitamente si pasan, pero la ambigüedad puede causar un false-start de implementación.
- Dedup key: state-notation-ambiguity
- Sources: pragmatic:P2-03

### CF-04: Tabla de errores de `resetConfirmation()` omite rechazo de fases non-mockup

- Severity: P2
- Category: docs
- Status: valid
- File: target.md
- Lines: 244, 317-319
- Claim: La sección de errores de `resetConfirmation()` lista solo dos condiciones: `GSDC_PLAN_NOT_FOUND` (24) y `GSDC_INVALID_STATE` (13) para "Estado approved o posterior." La línea 244 explícitamente dice que non-mockup phases retornan `GSDC_INVALID_STATE` (exit 13), pero la tabla canónica no lo incluye.
- Evidence: Línea 244: "Non-mockup phases (draft, refine, deliver) → resetConfirmation() retorna GSDC_INVALID_STATE (exit 13)." Líneas 317-319 solo listan "Estado approved o posterior." Un implementador que lea solo la tabla de errores no agregaría el guard para non-mockup. "Approved o posterior" se lee como estados mockup posteriores, no como fases diferentes.
- Impact: `resetConfirmation()` en un plan `draft:questions_pending` podría producir exit code inesperado o fallthrough a lógica no intencionada.
- Recommendation: Agregar fila a la tabla de errores: "Non-mockup phase (draft, refine, deliver) → GSDC_INVALID_STATE (exit 13)." O rephrasear "Estado approved o posterior" → "Cualquier estado no aceptado (approved, non-mockup phases, etc.) → exit 13."
- Suggested test: `resetConfirmation()` en plan con `phase: "draft"`, `status: "questions_pending"` → exit 13.
- Dedup key: reset-confirmation-error-table-non-mockup
- Sources: operator:OP-01

### CF-05: `allQuestionsAnswered` confunde completitud de interacción con completitud de valores

- Severity: P2
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:124-125
- Claim: `allQuestionsAnswered` es `true` cuando ambos contadores son 0, pero la nota dice "Tracks question-presentation completion, not value presence. Puede ser true cuando assets === '' (declinado)." El nombre "answered" implica respuesta sustantiva, pero el flag refleja que la pregunta fue presentada/procesada. `requiredFieldsComplete` es value-based. Los dos contadores usan estándares diferentes pero sus nombres no lo distinguen.
- Evidence: Target.md:125 explicita la semántica. Un implementador que gatea confirmación en `allQuestionsAnswered` asume que todos los campos tienen valores, cuando `assets === ""` lo hace `true`. El nombre activamente engaña a pesar de la nota aclaratoria.
- Impact: Agente podría gatear confirmación incorrectamente, o skippear preguntar assets asumiendo que un valor vacío no flipa el flag. La nota aclara pero el nombre contradice.
- Recommendation: Renombrar a `allQuestionsAddressed` o `interactionComplete` para señalar que la pregunta fue manejada (no necesariamente respondida con valor). Si se mantiene el nombre, agregar un `_comment` o renombrar `requiredFieldsComplete` a `requiredFieldsFilled` por simetría.
- Suggested test: `answer(assets, "")` → `allQuestionsAnswered === true` y `assets === ""`. Verifica que el contrato semántico se mantiene independientemente del nombre.
- Dedup key: allQuestionsAnswered-naming-vs-semantics
- Sources: modeler:F2

### CF-06: Template carece de guard `readOnly` explícito antes del loop de `answer()`

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:373-398
- Claim: El template dice verificar `readOnly` primero (renderizado), pero el bloque "Guardado y transición" salta directamente a `plan answer` por campo sin repetir el guard `readOnly`. Un agente que procesa el JSON top-down y entra al answer loop basado en `pending.length > 0` sin re-checkear `readOnly` llama `answer()` en un plan bloqueado.
- Evidence: Target líneas 239-243 definen cuatro estados `readOnly: true` donde `pending` contiene datos reales. Target línea 622 confirma que `questions()` siempre retorna valores reales para pending independientemente de readOnly. El template salta de "Renderizado (si hay pending)" a "Guardado: Por cada respuesta: plan answer" sin gate visible entre ellos.
- Impact: Agente llama `answer()` en plan confirmado/approved. Usuario ve "decisions locked" y prompts de recovery innecesarios. Confuso, especialmente para `suggestedAction: "retry_resolve"` donde el agente debería resolver, no re-answers.
- Recommendation: Agregar guard explícito entre "Renderizado" y "Guardado": `if (readOnly === true) → follow suggestedAction, do NOT enter answer loop.` Bullet point al mismo nivel de indentación que "Renderizado de preguntas" para que sea estructuralmente imposible de ignorar.
- Suggested test: Simulación manual: plan en `ready_for_html` + `confirmed: true`. Ejecutar `questions()`. Verificar que el agente sigue `suggestedAction: "suggest_reset"` y NO llama `answer()`.
- Dedup key: readonly-gate-before-answer-loop
- Sources: agent-ux:AU-01

### CF-07: Flujo post-reset omite llamada explícita a `questions()`

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:432-435
- Claim: Las instrucciones post-reset dicen `reset-confirmation` → informar usuario → `plan answer` → nueva confirmación. No hay instrucción de re-ejecutar `questions()` después del reset para ver qué campos están ahora pending. El agente no tiene lista autoritativa de campos pendientes post-reset (requeridos preservados, opcionales limpiados, `optionalAnswered` reseteado).
- Evidence: Target líneas 303-304: reset limpia `optionalAnswered = {}` y opcional values. Target línea 434: "Campos requeridos preservados. Opcionales (assets) limpiados." El flujo salta de reset a `plan answer` sin `questions()` para establecer el nuevo pending set.
- Impact: Agente puede skippear la pregunta de assets (recordando que ya fue respondida antes del reset), o re-preguntar todo incluyendo requeridos que siguen llenos. Lo primero es peor — `optionalPendingCount === 1` pero `allQuestionsAnswered === false`, creando confusión sobre si proceder con confirmación.
- Recommendation: Insertar paso explícito post-reset: `gsd-canva plan questions --id <ID> --json` → verificar contadores → seguir flujo normal. Hace el path post-reset idéntico al path inicial.
- Suggested test: Integración: llenar todo → confirmar → reset → agente llama `questions()` → verificar `requiredPendingCount === 0`, `optionalPendingCount === 1`, `optionalAnsweredStatus.assets === false`.
- Dedup key: post-reset-missing-questions-call
- Sources: agent-ux:AU-02

### CF-08: Mapeo semántico multi-campo está sub-especificado para implementación de agente

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:385-391
- Claim: Las instrucciones multi-campo dicen "Mapear por semántica (contenido → campo)" sin definir qué "semántica" significa para cada campo. Los ejemplos cubren tres casos pero no establecen una estrategia de mapeo general. Además, el ejemplo "banner" contiene un error de razonamiento: dice "'banner' no es substring único de ninguna opción" cuando en realidad no es substring de NINGUNA opción.
- Evidence: Target línea 391: "'banner para mi negocio' → no guardar formato ('banner' no es substring único de ninguna opción)." "banner" no es substring de opción alguna — el razonamiento debería decir "no es substring de ninguna opción." Diferentes agentes podrían mapear "landing page" a `formato` o a `vertical` legítimamente.
- Impact: Comportamiento inconsistente del agente entre sesiones o cambios de modelo. Usuarios ven diferentes asignaciones de campo para inputs similares. La safety net ("si incierto → no guardar") mitiga corrupción pero degrada UX con preguntas redundantes.
- Recommendation: Agregar tabla de mapeo campo→keywords al template o metadata de `FIELD_REGISTRY`. Ej: `vertical` keywords: industrias/tipos. `formato` keywords: plataformas + dimensiones. `paleta` keywords: colores. `copy` keywords: texto citado, slogans. `cta` keywords: verbos de acción. También corregir el ejemplo "banner" a "no es substring de ninguna opción."
- Suggested test: Simulación: input "LinkedIn banner azul para mi SaaS, CTA: Regístrate" → verificar LinkedIn Banner → formato, azul → paleta, SaaS → vertical, Regístrate → cta. Verificar "banner para mi negocio" → no mapea formato (cero matches).
- Dedup key: multi-field-semantic-mapping-specificity
- Sources: agent-ux:AU-04

### CF-09: Campo `warning` ausente del JSON de respuesta documentado de `answer()`

- Severity: P2
- Category: docs
- Status: valid
- File: lib/plan-manager.js, bin/gsd-canva.js
- Lines: target.md:273-283
- Claim: El JSON de respuesta de `answer()` muestra `{ planId, field, value, requiredPendingCount, optionalPendingCount, requiredFieldsComplete, allQuestionsAnswered }` pero no incluye `warning`. El template (línea ~400) manda "Verificar siempre el campo `warning` en la respuesta." No hay ejemplo JSON que muestre el campo warning.
- Evidence: Target líneas 273-283 muestran la response shape sin `warning`. Target línea 262 define la condición de warning (`empty_value_for_required_choice`). Target línea ~400 manda verificarlo. El contrato de respuesta no documenta un campo que el template asume que existe.
- Impact: Implementador omite `warning` de la respuesta, o lo anida incorrectamente. Agente nunca ve el warning, procede past empty required fields, y eventualmente hittea `GSDC_QUESTIONS_UNRESOLVED` (exit 19) en `confirm-decisions`. El error aparece lejos de la causa real.
- Recommendation: Agregar segundo ejemplo JSON para el caso de warning: `{ "planId": "001", "field": "cta", "value": "", "warning": "empty_value_for_required_choice", "requiredPendingCount": 1, ... }`. Marcar `warning` como campo opcional en la descripción del contrato.
- Suggested test: `answer(planId, 'cta', '')` en campo choice requerido → respuesta incluye `"warning": "empty_value_for_required_choice"`. Verificar warning está en top level del response data.
- Dedup key: answer-warning-field-missing-from-response-doc
- Sources: agent-ux:AU-05

### CF-10: `staleRenameFailed: true` deja mockup.html huérfano sin guard contra reuso stale

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:311-313
- Claim: Cuando `resetConfirmation()` falla al renombrar `mockup.html` a `.stale.<timestamp>`, retorna `staleRenameFailed: true` y documenta cleanup manual. Ningún guard previene que el stale `mockup.html` sea usado por `submitMockup()` posterior. El hash mismatch es la safety net, pero el archivo huérfano confunde al usuario y ensucia el directorio.
- Impact: Probabilidad baja pero confusión alta. El usuario podría ver `mockup.html` y asumir que su mockup está listo. El archivo huérfano permanece sin mecanismo de cleanup. Hash mismatch protege contra aceptación silenciosa pero no contra confusión del usuario.
- Recommendation: Agregar check en `resolveQuestions()` o `submitMockup()`: si `mockup.html` existe y su mtime predates `confirmedAt`, incluir `staleMockupDetected: true` en la respuesta. Alternativamente, `resetConfirmation()` escribir un `.reset-timestamp` marker que `submitMockup()` verifica.
- Suggested test: reset con `staleRenameFailed: true` → confirm → resolve → submit con mockup stale → verificar exit 21 (hash mismatch) y no aceptación silenciosa.
- Dedup key: stale-mockup-orphan-after-rename-failure
- Sources: agent-ux:AU-07

### CF-11: Respuesta de `answer()` no incluye status de campos opcionales

- Severity: P3
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js, bin/gsd-canva.js
- Lines: target.md:273-283
- Claim: `questions()` retorna `optionalAnsweredStatus` pero `answer()` no. Después de responder el último campo requerido, el agente ve `optionalPendingCount: 1` pero no puede distinguir si assets fue preguntado y declinado (`optionalAnsweredStatus.assets === true, assets === ""`) o nunca preguntado (`false`). Para campos opcionales, `answer()` setea `optionalAnswered[field] = true` internamente pero no lo expone en la respuesta.
- Evidence: Target §3 muestra response JSON sin `optionalAnsweredStatus`. Target §2 muestra que `questions()` lo incluye. Después de un reset+re-answer cycle, el agente no puede distinguir "declinado de nuevo" de "nunca re-preguntado" sin llamar `questions()`.
- Impact: UX degradado menor — agente puede re-preguntar campo opcional ya declinado después de reset. Workaround: llamar `questions()` después de cada `answer()` que setea `requiredFieldsComplete === true`.
- Recommendation: Agregar `optionalAnsweredStatus` al response JSON de `answer()`. Ya está computado internamente (answer lee y escribe `optionalAnswered`). Alternativamente, agregar `"optionalAnswered": true` boolean para el campo respondido.
- Suggested test: Responder todos los requeridos, luego `answer(assets, "")` → assert `optionalAnsweredStatus.assets === true` en la respuesta de `answer()`.
- Dedup key: answer-missing-optional-status
- Sources: pragmatic:P3-01, modeler:F5

### CF-12: Output human-readable no especificado para estados `readOnly`

- Severity: P3
- Category: ux
- Status: valid
- File: bin/gsd-canva.js
- Lines: target.md:333-348
- Claim: Target §5 muestra output human-readable para `plan questions` en flujo normal (lista numerada). No hay formato especificado para estados `readOnly: true`, display de `suggestedAction`, o escenarios `confirmed: true` en modo humano.
- Impact: Implementador debe improvisar output para edge states. UX inconsistente entre estados o información faltante (e.g., no mostrar `suggestedAction` en modo humano).
- Recommendation: Agregar un ejemplo para output `readOnly: true` en humano: `"Plan 001 is locked (confirmed). Suggestion: run 'gsd-canva plan reset-confirmation --id 001' to edit."`
- Suggested test: CLI test: `plan questions --id 001` después de confirm → output humano contiene "locked" o "confirmed" y menciona "reset-confirmation".
- Dedup key: human-readable-read-only-format
- Sources: pragmatic:P3-02

### CF-13: `resetConfirmation()` no-op carece de señal distinguible

- Severity: P3
- Category: testing
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:301
- Claim: `resetConfirmation()` tiene path no-op: `questions_pending + confirmed !== true + !mockupExists → no-op`. Retorna éxito sin distinguir "nada que resetear" de "reset exitoso". No pushea history entry en no-op (correcto pero no documentado).
- Impact: Un agente llamando `resetConfirmation` dos veces no puede distinguir si la segunda fue no-op. Para debugging es confuso.
- Recommendation: Incluir `"wasNoOp": true` en el return cuando el path no-op se toma. Documentar que no se pushea history entry en no-op.
- Suggested test: `resetConfirmation()` en plan ya reseteado → assert `wasNoOp === true` en return. Assert history length sin cambio.
- Dedup key: reset-no-op-signal
- Sources: pragmatic:P3-03

### CF-14: `questions()` no especifica comportamiento para sub-estados mockup no reconocidos

- Severity: P3
- Category: state
- Status: uncertain
- File: lib/plan-manager.js
- Lines: target.md:235-245
- Claim: `questions()` especifica comportamiento para 6 categorías de estados pero no para sub-estados mockup no reconocidos (e.g., `mockup:corrupted`, `mockup:unknown`). La línea 245 dice "`questions()` nunca lanza `GSDC_INVALID_STATE`", así que la función debe retornar data para cualquier estado sin fallback explícito.
- Impact: Bajo. Estados no reconocidos no deberían ocurrir en operación normal. Si ocurren, el implementador probablemente defaulta a `readOnly: true` que es seguro, pero un catch-all explícito eliminaría ambigüedad.
- Recommendation: Agregar catch-all: "Cualquier otro estado → `readOnly: true`, `suggestedAction: "suggest_new_plan"`. Status refleja el valor real de `plan.json`."
- Suggested test: `plan.json` con `status: "mockup:unknown_state"` → `questions()` → assert `readOnly: true` y sin error.
- Dedup key: questions-unrecognized-mockup-state-fallback
- Sources: operator:OP-03

### CF-15: Orden de validación de campo en `answer()` (exit 22) no especificado vs state/confirmation checks

- Severity: P3
- Category: cli-contract
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:268
- Claim: El orden de operaciones lista state validation (exit 13), confirmation validation (exit 23), choice validation (exit 26). Field membership validation ("Valida que field esté en ALL_FIELDS") no tiene posición en esta secuencia. Un implementador que pone field validation después de state check retorna exit 13 para campo inválido en estado incorrecto. Otro que lo pone primero retorna exit 22.
- Evidence: Target.md:260 menciona validación de campo pero no la posiciona en la secuencia de target.md:268. No hay test que cubra la intersección (campo inválido + estado incorrecto). Template dispatching en exit code (target.md:407-417) — exit 13 vs 22 triggerea recovery diferente.
- Impact: Exit codes inconsistentes entre implementaciones. Agent error handling dispatching en código incorrecto puede triggear recovery equivocado.
- Recommendation: Posicionar field validation como primer check después de lock+read: `acquire lock → read → validate field ∈ ALL_FIELDS (exit 22) → validate state (exit 13) → validate !confirmed (exit 23) → validate choice (exit 26) → write`. Agregar test: `answer(planInReadyForHtml, 'nonexistent_field', 'value')` → exit 22.
- Suggested test: `answer(planInReadyForHtml, 'nonexistent_field', 'value')` → exit 22 (no exit 13).
- Dedup key: answer-field-validation-order-unspecified
- Sources: modeler:F3

### CF-16: Estructura de respuesta de `questions()` sub-especificada para fases non-mockup

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:244
- Claim: Para non-mockup phases, el target dice "`readOnly: true`, status refleja fase real, `suggestedAction: 'suggest_new_plan'`" pero no especifica los valores de `phase`, `status`, `pending`, `filled`, o los contadores. El JSON de ejemplo muestra `"phase": "mockup"`. Un implementador podría hardcodear `mockup`.
- Impact: Bajo — `suggestedAction: "suggest_new_plan"` previene que el agente intente answers. Pero tooling de diagnóstico produciría output no confiable.
- Recommendation: Especificar que para non-mockup phases, `phase` y `status` reflejan `plan.json`, contadores se computan de `decisions.json` como normal, y el response shape es idéntico al de mockup pero con `readOnly: true`.
- Suggested test: Plan en `draft` phase → `questions()` → assert `phase === "draft"` (no `"mockup"`) y `readOnly === true`.
- Dedup key: questions-non-mockup-phase-response-unspecified
- Sources: modeler:F4

### CF-17: Agente no puede saber qué campos específicos quedan pending después de `answer()` sin tracking propio

- Severity: P3
- Category: ux
- Status: valid
- File: lib/plan-manager.js
- Lines: target.md:273-283
- Claim: `answer()` retorna contadores agregados (`requiredPendingCount`, `optionalPendingCount`) pero no la lista de field IDs pending. El agente debe trackear en memoria desde `questions()` o re-llamar `questions()`. Option (a) es fragil ante context resets; option (b) es costosa.
- Impact: Si el agente pierde contexto mid-flow, no puede recuperar qué campos faltan sin re-llamar `questions()`. En el peor caso, re-pregunta campos ya respondidos.
- Recommendation: Agregar `pendingFields: ["paleta", "copy"]` array al response de `answer()`, o documentar la estrategia recomendada: "After context reset, call `questions()` to recover pending state." Lo segundo es lower-cost.
- Suggested test: Integración: answer 3/6 requeridos → `requiredPendingCount === 3` → simular context reset → `questions()` → `pending` contiene exactamente los 3 sin responder.
- Dedup key: answer-response-missing-pending-field-ids
- Sources: agent-ux:AU-06

### CF-18: Regex "confirmo" acepta intención contradictoria ("confirmo pero quiero cambiar")

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:426-427
- Claim: El regex `/\b(confirmo|confirmado)\b/i` acepta cualquier frase conteniendo "confirmo" mientras el negation check `/\bno\s+.*\b(confirmo|confirmado)\b/i` no fire. "confirmo pero quiero cambiar la paleta" pasa la confirmación a pesar de expresar intent de editar. El negation check solo catchea `no ... confirmo`, no `confirmo ... pero` hedging.
- Impact: La intención de editar se overridea por confirmación. El usuario debe descubrir y usar el flow post-confirm correction (reset-confirmation), que es más disruptivo. No es issue de integridad de datos (reset existe) pero multiplica fricción.
- Recommendation: Agregar hedging check: si input matchea `/\bconfirmo\b.*\b(cambiar|editar|modificar|espera|no\b)/i` → tratar como ambiguo, pedir "¿Confirmas las decisiones actuales? Responde 'confirmo' para confirmar o describe qué quieres cambiar." Alternativamente, aceptar como trade-off de diseño y documentarlo.
- Suggested test: `"confirmo pero quiero cambiar"` → rejected o flagged como ambiguo. `"confirmo, todo bien"` → accepted.
- Dedup key: confirmo-regex-hedging-acceptance
- Sources: agent-ux:AU-03

### CF-19: Tabla de errores del template no guía recovery de crash parcial de `resetConfirmation()`

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:407-418
- Claim: La tabla de errores cubre exit codes específicos pero no tiene guida para el scenario donde `resetConfirmation()` crashea entre steps 4-5. Target línea 314 documenta: "state es `questions_pending` en plan.json pero `confirmed=true` en decisions.json → `answer()` falla con `GSDC_DECISIONS_LOCKED`." La nota "reset-confirmation es idempotente — si falla, reintentar una vez" está en el catch-all pero no en la fila de `GSDC_DECISIONS_LOCKED`.
- Impact: Usuario ve "decisions locked" después de pedir reset con error/crash. Confuso. El recovery path (re-run reset) está en Notes pero no se surfacea como recomendación inmediata.
- Recommendation: Agregar nota a la fila `GSDC_DECISIONS_LOCKED` (23): "Si acabas de ejecutar `reset-confirmation`, reintentar. Si no, preguntar si ejecutar `reset-confirmation`."
- Suggested test: Integración: simular crash entre plan.json y decisions.json → agente llama `answer()` → exit 23 → agente retries `resetConfirmation()` → éxito → `answer()` → éxito.
- Dedup key: partial-reset-crash-recovery-guidance
- Sources: agent-ux:AU-08

### CF-20: `ensureV2Fields()` no-persistencia en read-only es desconocida para consumidores del template

- Severity: P3
- Category: docs
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:247
- Claim: `questions()` llama `ensureV2Fields()` que normaliza en memoria pero no persiste. El plan lo documenta en Notes (línea 615) y en questions() spec (línea 247), pero el template no tiene awareness de esto. Si el template lee `decisions.json` directamente para poblar markdown, ve la estructura pre-migración sin `assets`, `optionalAnswered`, y skeleton completo.
- Impact: Agente popula markdown desde stale on-disk `decisions.json`, perdiendo campo `assets`. No es issue de integridad (próximo `answer()` persiste la migración) pero es inconsistencia de display.
- Recommendation: Agregar al template: "Para poblar Markdown, usar datos retornados por `plan questions` o `plan status` (CLI), no leer `decisions.json` directamente. El archivo en disco puede estar una versión atrás hasta la primera mutación."
- Suggested test: Integración: plan v1.1 → `questions()` → leer `decisions.json` de disco → verificar `assets` ausente → `answer(assets, "")` → leer `decisions.json` → verificar `assets` presente y `optionalAnswered` existe.
- Dedup key: ensurev2fields-read-only-non-persistence-template-gap
- Sources: agent-ux:AU-09

### CF-21: "Otro" substring matching puede falsear trigger en texto libre del usuario

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: target.md:384, 392
- Claim: La regla de matching dice "si el texto es case-insensitive substring de exactamente una opción, mostrar esa opción." "Otro (personalizado)" contiene la palabra común "otro". Si el usuario dice "quiero otro color" para paleta, "otro" es substring único de "Otro (personalizado)" y el agente presenta el custom follow-up en vez de tratarlo como valor de paleta.
- Impact: Routing falso a custom follow-up. Confusión leve, fácilmente recoverable (usuario escribe su respuesta real), pero degrada el flujo smooth que la proposal busca crear.
- Recommendation: (a) Cambiar label a "Opción personalizada" o "Valor personalizado" para reducir false substring matches. (b) Excluir "Otro (personalizado)" de substring matching — solo matchear si el texto es exact o near-exact al label completo. Opción (b) es más robusta pero agrega complejidad al template.
- Suggested test: Simulación: "quiero otro color" → verificar agente NO matchea a "Otro (personalizado)" (si fix aplicado).
- Dedup key: otro-substring-false-match
- Sources: agent-ux:AU-10

## Non-Issues Checked

- **Hash v1→v2 migration**: `confirmDecisions()` siempre computa v2 (7 campos), `resolveQuestions()`/`submitMockup()` dispatch en stored label. Migración atómica. Sound design.
- **Exit code migration (15→24/25)**: Pre-implementation grep + post-impl verification. Separación clara: 24=directorio, 25=archivo dentro de plan.
- **Placeholder detection `includes()` → `===`**: Breaking change documentado. Bug preexistente "Nodo"→"TODO" corregido. Test plan cubre edge cases.
- **`answer()` validation order (state before confirmation)**: Especificado y testeado. `ready_for_html + confirmed=true → exit 13` (no 23). Consistente.
- **`FIELD_REGISTRY` como single source of truth**: Campos, opciones, follow-ups todos derivados de una constante. `resetConfirmation()` itera `OPTIONAL_FIELDS`.
- **Lock semantics**: `questions()`, `answer()`, `resetConfirmation()` adquieren lock antes de read, liberan en `finally`. Consistente.
- **`confirmDecisions()` rechaza empty required**: `getEmptyFields()` antes de hash. Exit 19. Guard a nivel API.
- **`answer()` choice validation**: Rechaza numéricos, "Otro (personalizado)" literal, y non-matching values. Normaliza case-insensitive a forma canónica. 3 reason codes.
- **`resetConfirmation()` write ordering**: plan.json antes de decisions.json. Crash deja estado re-ejecutable. Recovery documentado.
- **"confirmo" parsing regex**: Word-boundary con negation check. Tests cubren "sí confirmo", "no confirmo", "confirmar" (rejected). "no, confirmo" → accepted (correcto en español: "no wait, I confirm").
- **Template multi-field matching rules**: Mapeo semántico, no posicional. Guardrails para over-count y under-count. Uncertain mappings skipped.
- **`questions()` retorna valores reales siempre**: `readOnly` es guard contra edición, no masking de datos. Correcto.
- **`GSDC_MOCKUP_MISSING` rename**: Sin colisión con códigos existentes (20 era `GSDC_ARTIFACT_MISSING`). Pre/post grep especificado.
- **CLI handleError fallback → `err.exitCode || 1`**: Blanket rule para todos los handlers.
- **`optionalAnswered` guard en `getEmptyFields()`**: `OPTIONAL_FIELDS.includes(field)` previene flag espurio en requeridos.
- **`answer()` idempotency**: Llamar dos veces con mismos args sobreescribe con mismo valor. Sin side effects.
- **`resetConfirmation()` no-op condition**: Correctamente guarda `questions_pending + not confirmed + no mockup`. Still acquires lock. Correcto.
- **`questions()` no persiste migration en read-only**: Intencional. Migra en primera mutación. Sin riesgo de partial writes.
- **`staleRenameFailed` non-fatal**: Rename failure no throw. Hash mismatch protege contra reuso. Manual cleanup documentado.
- **Choice value normalization**: Case-insensitive exact match → canonical form. NFC case-sensitive para hash. Determinista.
- **History deduplication en `resetConfirmation()`**: Solo checkea último entry para mismo `from`. Tradeoff documentado.
- **`answer()` permissive + `confirmDecisions()` strict**: Defensa en capas. `answer()` acepta vacíos con warning, `confirmDecisions()` rechaza.

## Residual Risks

- **Lock manager stale lock handling**: `lib/lock-manager.js` no revisado. Crash mientras se tiene lock podría causar deadlock sin timeout/cleanup. No introducido por esta proposal.
- **Concurrent access no testeado en unit tests**: Test plan no incluye llamadas `answer()` concurrentes. Lock serialization depende de lock manager. Requiere integration testing.
- **History accumulation en crash recovery**: Aceptado explícitamente. Entry extra con `from: questions_pending → questions_pending` podría confundir audit readers.
- **`writeAtomicJson()` crash safety**: Se asume temp-file + rename. Si la implementación es diferente, writes individuales pueden no ser atómicos.
- **`approveMockup()` no listado en consumers de `ensureV2Fields()`**: Si accede `confirmation.confirmedBy` sin `ensureV2Fields()`, planes v1.1 podrían exponer `undefined`. No verificado porque la función no está en la proposal.
- **Agent context loss mid-flow**: Sin mecanismo de recovery explícito en template más que re-llamar `questions()`. CLI es stateless e idempotente, mitigando el riesgo.
- **Future optional fields**: Template acopla concepto "optional" a campo "assets" en múltiples lugares. Si se agregan más opcionales, el template necesita actualización.
- **"confirmo" regex language dependency**: Español-specific. Internacionalización requeriría per-language patterns.
- **`NORMALIZE` solo NFC**: No strip whitespace interno. `"SaaS  / Producto Digital"` (double space) causaría hash mismatch. By design pero puede sorprender.
