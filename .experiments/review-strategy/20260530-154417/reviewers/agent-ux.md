# Review: agent-ux

## Summary

- Verdict: approve_with_changes
- Top risk: Confirmed+questions_pending state has no resolve-retry path — template only suggests reset, forcing unnecessary discard of user confirmation
- Confidence: high

## Findings

### AU-01: No resolve-retry path for confirmed+questions_pending state

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6, `readOnly: true` handling)
- Lines: 365
- Claim: When `questions()` returns `confirmed: true, readOnly: true, status: questions_pending`, the template only suggests `reset-confirmation`. But this state means confirm succeeded and resolve hasn't run yet — the agent could simply retry `resolve-questions` instead.
- Evidence: Section 6 says: "Si `confirmed: true` y estado es `questions_pending` (entre confirm y resolve), sugiere `reset-confirmation` — el usuario puede editar y re-confirmar." This is the only prescribed action. No mention of retrying resolve. The reset path discards the user's "confirmo" and requires a full re-confirmation cycle.
- Impact: If a session crashes between `confirm-decisions` and `resolve-questions`, the next session will suggest reset instead of retrying resolve. The user's explicit confirmation is lost unnecessarily. An implementer following the template will never attempt the simpler recovery.
- Recommendation: Add an explicit step: "Si `confirmed: true` y estado es `questions_pending` → primero intentar `resolve-questions`. Si falla, entonces sugerir `reset-confirmation`." This preserves user intent when the state is simply incomplete.
- Suggested test: Create plan, fill fields, confirm-decisions succeeds, do NOT call resolve-questions. New session calls `questions()` → sees confirmed+questions_pending → retries resolve-questions → succeeds. Verify no reset needed.
- Dedup key: confirmed-pending-no-resolve-retry

### AU-02: confirm→resolve failure discards confirmation with no user-facing guidance

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6, step 6)
- Lines: 416
- Claim: When confirm succeeds but resolve fails twice, the agent runs `reset-confirmation` and informs the user "la confirmación fue revertida." But the template provides no guidance on explaining why or what happens next.
- Evidence: "Si `confirm-decisions` exitosa pero `resolve-questions` falla: reintentar `resolve-questions` una vez. Si persiste, ejecutar `reset-confirmation` e informar al usuario que la confirmación fue revertida." That's the entire instruction. No guidance on: what to tell the user about the failure cause, whether to show the error details, or that the user will need to re-confirm from scratch.
- Impact: The user said "confirmo" and their intent is silently discarded. A naive agent might say "your confirmation was reverted" with no further context, leaving the user confused about what went wrong and what to do. The user has no way to distinguish "system error" from "you did something wrong."
- Recommendation: Add template guidance: "Informar al usuario: 'Error técnico al procesar la confirmación. Tus decisiones se preservaron pero necesitas confirmar de nuevo.' Mostrar error técnico si el usuario pregunta. Reanudar flujo desde resumen (no desde cero — campos están completos)."
- Suggested test: Simulate confirm success + resolve failure. Agent should: (1) retry resolve once, (2) run reset, (3) inform user with reason, (4) re-present summary for re-confirmation without re-asking all fields.
- Dedup key: confirm-resolve-failure-ux-gap

### AU-03: readOnly state decision tree is complex and error-prone for agents

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6, `readOnly: true` handling)
- Lines: 365
- Claim: The `readOnly: true` handling has 4 distinct sub-cases based on `confirmed` + `status` combinations, each with different suggested actions. This is a branching decision tree embedded in prose that an agent must parse and follow correctly.
- Evidence: The template lists: (1) confirmed+ready_for_html/pending_approval → suggest reset, (2) confirmed+questions_pending → suggest reset, (3) unconfirmed+not questions_pending → run status + suggest reset if applicable, (4) approved+ → suggest new plan. Cases 1 and 2 both suggest reset but for different reasons (reset for re-editing vs reset for resolving a stuck state). An agent could conflate these and give misleading explanations.
- Impact: Agents may incorrectly advise users. For example, suggesting "create a new plan" when reset-confirmation is available, or suggesting reset when the user is in an approved state where reset is forbidden (exit 13). The template doesn't guard against the agent suggesting reset for approved plans — it only says "Si `approved` o posterior, sugiere plan nuevo" but the previous cases all suggest reset, and a less careful agent could reach for reset by pattern-matching.
- Recommendation: Either (a) add a `suggestedAction` field to the `questions()` response that returns one of `["ask_questions", "retry_resolve", "suggest_reset", "suggest_new_plan"]` so the agent doesn't need to branch, or (b) add a decision table in the template (like the error table) with explicit state → action mapping that's easier for an agent to follow mechanically.
- Suggested test: For each readOnly state combination, verify an agent following the template produces the correct advice. Specifically test: approved state → agent must NOT suggest reset (only new plan).
- Dedup key: readonly-state-agent-decision-tree

### AU-04: staleRenameFailed flag has no prescribed agent behavior

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 4, step 6)
- Lines: 304-306
- Claim: `resetConfirmation()` may return `staleRenameFailed: true` when the mockup rename fails, but the template provides no guidance on what the agent should do or tell the user.
- Evidence: "Si rename falla (I/O error): no throw — incluir `staleRenameFailed: true` en return. Documentar cleanup manual." The error table's catch-all row ("Cualquier otro código → Detener flujo") doesn't apply since this isn't an error code — it's a flag in a successful response. The template section on reset-confirmation (Section 6) only says "plan reset-confirmation: confirmación + nuevo estado + 'mockup.html renombrado a .stale.<ts>' si aplica" — it doesn't cover the failure case.
- Impact: An agent that receives `staleRenameFailed: true` has no instruction. It might ignore it (leaving a stale mockup that could cause confusion later) or alarm the user unnecessarily. The "Documentar cleanup manual" is a developer note, not an agent instruction.
- Recommendation: Add a template instruction: "Si reset-confirmation retorna `staleRenameFailed: true`, informar al usuario: 'El mockup anterior no se pudo renombrar pero los datos se reiniciaron. El archivo mockup.html anterior puede ser ignorado o eliminado manualmente del directorio del plan.'"
- Suggested test: Reset with mockup rename failure → agent message includes mention of stale file and manual cleanup option.
- Dedup key: stale-rename-failed-no-agent-guidance

### AU-05: Number-to-value mapping for choices relies on error recovery instead of prevention

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6, Mapeo numérico + choice validation)
- Lines: 370, 257
- Claim: The template says "número → value de opción" but doesn't strongly enforce that the agent must convert before calling `plan answer`. The API catches numeric strings (exit 26, reason "numeric_value"), which triggers an error-recovery loop instead of preventing the error.
- Evidence: The template says "`--value` siempre texto final" and `answer()` rejects `/^\d+$/` with exit 26. The error table maps this to "Usa el texto de la opción, no el número." This creates a poor interaction: user types "3" → agent calls answer with "3" → CLI rejects → agent shows error message to user → user re-answers. The agent should have mapped "3" → option value before calling the API.
- Impact: Degrades user experience with unnecessary error round-trips. An LLM agent following the template literally may not internalize that "número → value" is a mandatory pre-processing step, not a suggestion.
- Recommendation: Strengthen the template instruction to a PROHIBIDO-level rule: "⚠️ **PROHIBIDO** pasar índices numéricos a `plan answer --value`. Siempre convertir número → texto de opción ANTES de llamar."
- Suggested test: Agent receives user input "3" for a choice field → agent converts to option value before calling `plan answer` → no exit 26 triggered.
- Dedup key: number-to-value-requires-pre-mapping

### AU-06: Detener flujo for artifact-missing and parse-error has no recovery path

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6, error table)
- Lines: 399, 402
- Claim: `GSDC_PLAN_ARTIFACT_MISSING` (25) and `GSDC_JSON_PARSE_ERROR` (15) both say "Detener flujo" but provide no actionable recovery steps. The agent must stop but has no way to help the user fix the problem.
- Evidence: Error table: "GSDC_PLAN_ARTIFACT_MISSING (25) → Detener flujo." and "GSDC_JSON_PARSE_ERROR (15) → Detener flujo. Pedir intervención manual." No guidance on what "intervención manual" means or whether the user should recreate the plan, fix the JSON, or something else.
- Impact: Agent hits a dead end with no advice to give the user. For artifact-missing, the likely fix is that `decisions.json` was accidentally deleted — the agent could suggest recreating the plan. For parse errors, the agent could show the malformed line or suggest manual JSON fix. Without guidance, the agent just says "stop" and the user is stranded.
- Recommendation: Add recovery hints: (25) "Sugerir `plan create` con mismo ID o verificar directorio del plan." (15) "Mostrar ruta del archivo corrupto. Sugerir inspección manual o recrear plan."
- Suggested test: Agent encounters exit 25 → suggests plan create or directory check. Agent encounters exit 15 → shows file path and suggests manual inspection.
- Dedup key: fatal-errors-no-recovery-guidance

### AU-07: Multi-field semantic mapping uncertainty threshold is undefined

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (Section 6, Multi-campo rules)
- Lines: 373-377
- Claim: The multi-field rules say "si algún mapeo es incierto → no guardar ese campo", but "incierto" is subjective and depends on agent judgment. Different LLMs may have different certainty thresholds.
- Evidence: Rule 4: "Si algún mapeo es incierto → no guardar ese campo, preguntar." For example, "banner azul para restaurante" — is "banner" a formato match? It could map to any banner format. One agent might map it confidently to "LinkedIn Banner", another might consider it uncertain. The spec provides no examples of uncertain vs certain mappings beyond the tabla de ejemplos (which only covers single-field cases).
- Impact: Inconsistent behavior across agents/sessions. One agent saves "banner" as a formato, another asks. One saves "restaurante" as vertical, another isn't sure. Users get unpredictable experiences.
- Recommendation: Add 2-3 multi-field examples to the tabla de ejemplos showing the boundary: "Input: 'Instagram post azul para restaurante' → guardar formato, paleta, vertical (all clear). Input: 'banner para mi negocio' → no guardar formato ('banner' matches multiple), guardar vertical si 'negocio' is too vague then skip too." This gives agents a calibration anchor.
- Suggested test: Two different agents process the same multi-field input → both make the same save/skip decisions based on documented examples.
- Dedup key: multi-field-semantic-mapping-undefined-threshold

## Non-Issues Checked

- **"Otro (personalizado)" detection by label**: Template correctly instructs agents to detect by label (not value). Substring matching in template works — "otro" matches only one option. API-level rejection of "Otro (personalizado)" literal (reason "otro_literal") is a safety net, not the primary flow.
- **"confirmo" regex edge cases**: Negation check `/\bno\s+.*\b(confirmo|confirmado)\b/i` correctly handles "no confirmo", "no lo confirmo". Word boundary prevents false positives. "confirmar" correctly rejected. Tested edge cases (bilingual, typos) — reasonable behavior.
- **`optionalAnsweredStatus` for session resume**: Agent can re-call `questions()` to get full state including `optionalAnsweredStatus` after a session break. The data is durable in `decisions.json`.
- **`requiredFieldsComplete` + warning flow**: Template correctly says to re-ask on `warning: "empty_value_for_required_choice"`. Agent knows which field triggered it (the one it just answered). Flow is recoverable.
- **Reset re-opening optional questions**: Template's "Corrección post-confirmación" section says "Opcionales (assets) limpiados" — user is informed that assets will be re-asked. Intentional and communicated.
- **`ensureV2Fields()` not persisting in read-only functions**: Documented explicitly. First mutation (answer/reset/confirm) persists the migration. No state inconsistency possible.
- **Hash v1→v2 migration at confirm time**: Atomic — hash and label always match after confirm. No ambiguous intermediate state.
- **Idempotency of reset-confirmation**: Documented with no-op case and dedup history. Re-execution is safe.

## Residual Risks

- The `readOnly` decision tree (AU-03) could be further simplified by adding API-level `suggestedAction`, but the prose version is workable if implemented carefully. The risk is in agent compliance, not system correctness.
- The confirm→resolve→reset chain (AU-02) creates a narrow window where the user's confirmation is lost. Adding resolve-retry for AU-01 would reduce but not eliminate this — if resolve has a genuine bug, the user still loses their confirmation. The plan doesn't address whether confirm state could be preserved across a resolve failure (e.g., keep confirmed=true and only reset if user explicitly requests it).
- Multi-field mapping (AU-07) is inherently subjective. Even with more examples, different agents may behave differently. The fallback ("don't save if uncertain") is safe but may lead to more round-trips than necessary with conservative agents.
