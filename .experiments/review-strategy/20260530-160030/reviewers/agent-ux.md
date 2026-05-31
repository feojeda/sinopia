# Review: agent-ux

## Summary

- Verdict: approve_with_changes
- Top risk: An agent that checks `pending.length > 0` without first checking `readOnly` will attempt to answer locked questions, producing confusing error cascades for the user.
- Confidence: high

## Findings

### AU-01: `readOnly: true` ignored by agent that drives off `pending` array alone

- Severity: P2
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (proposed section 2)
- Lines: 373-398 (renderizado de preguntas / guardado y transición)
- Claim: The template tells the agent to check `readOnly` first (line ~373) and then describes rendering pending questions (line ~379). However, the "Guardado y transición" block (line ~396) describes calling `plan answer` per field with no `readOnly` guard repeated. An agent that processes the JSON top-down and enters the answer loop based on `pending.length > 0` without re-checking `readOnly` will call `answer()` on a locked plan, hit `GSDC_DECISIONS_LOCKED` (exit 23), and then enter the error-recovery table — an unnecessary round-trip for the user.
- Evidence: Target lines 239-243 define four `readOnly: true` states where `pending` still contains real data. Target line 622 confirms "questions() retorna siempre valores reales para pending, filled … independientemente de readOnly." Template line ~396 jumps from "Renderizado de preguntas (si hay pending)" directly into "Guardado y transición: Por cada respuesta: gsd-canva plan answer" with no visible `readOnly` gate between rendering instructions and the answer loop.
- Impact: Agent calls `answer()` on confirmed/approved plans. User sees "decisions locked" errors and recovery prompts for a plan they expected to be editable. Frustrating and confusing, especially for the `confirmed: true + suggestedAction: "retry_resolve"` case where the agent should be resolving, not re-answering.
- Recommendation: Add an explicit guard in the template between "Renderizado" and "Guardado": `if (readOnly === true) → follow suggestedAction, do NOT enter answer loop.` Make it a bullet point at the same indentation as "Renderizado de preguntas" so it's structurally unmissable.
- Suggested test: Manual agent simulation: set plan to `ready_for_html` + `confirmed: true`. Run `questions()`. Verify agent follows `suggestedAction: "suggest_reset"` and does NOT call `answer()` for any `pending` field.
- Dedup key: readonly-gate-before-answer-loop

### AU-02: Post-reset flow omits explicit `questions()` call, agent may skip re-checking pending fields

- Severity: P2
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (proposed section 2, "Corrección post-confirmación")
- Lines: 432-435
- Claim: The post-reset instructions say `reset-confirmation` → inform user → `plan answer` → nueva confirmación. But there is no instruction to re-run `questions()` after reset to see what is now pending. An agent that proceeds directly to `plan answer` has no authoritative list of which fields are pending after reset (required are preserved, optional are cleared, `optionalAnswered` is reset).
- Evidence: Target lines 303-304 define that reset clears `optionalAnswered = {}` and iterates `OPTIONAL_FIELDS` setting each to `""`. Required fields are preserved. Target line 434 says "Campos requeridos preservados. Opcionales (assets) limpiados. Para cambiar requeridos, usa `plan answer`." The flow jumps from reset directly to `plan answer` without `questions()` to establish the new pending set.
- Impact: Agent may skip the assets question entirely (since it was already answered before reset and the agent remembers that), or may re-ask all questions including required ones that are still filled. Both degrade user experience. The former is worse — assets would remain empty and the agent proceeds to confirmation with `optionalPendingCount === 1` but `allQuestionsAnswered === false`, creating confusion about whether confirmation should proceed.
- Recommendation: Insert an explicit step after reset: `gsd-canva plan questions --id <ID> --json` → check `requiredPendingCount` and `optionalPendingCount` → follow normal flow from there. This makes the post-reset path identical to the initial path and removes the need for the agent to reason about what reset preserved.
- Suggested test: Integration test: fill all fields → confirm → reset → agent calls `questions()` → verify `requiredPendingCount === 0`, `optionalPendingCount === 1`, `optionalAnsweredStatus.assets === false`.
- Dedup key: post-reset-missing-questions-call

### AU-03: "confirmo" regex accepts contradictory intent ("confirmo pero quiero cambiar")

- Severity: P3
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (proposed section 2, "Revisión Final y Confirmación")
- Lines: 426-427
- Claim: The confirmation regex `/\b(confirmo|confirmado)\b/i` accepts any phrase containing "confirmo" or "confirmado" as long as the negation check `/\bno\s+.*\b(confirmo|confirmado)\b/i` doesn't fire. A user saying "confirmo pero quiero cambiar la paleta" would pass confirmation despite expressing intent to edit. The negation check only catches `no ... confirmo` patterns, not `confirmo ... pero` hedging.
- Evidence: Target line 426 defines the two regexes. "confirmo pero quiero cambiar" matches `\bconfirmo\b` (positive) and does NOT match `\bno\s+.*confirmo` (negation). Result: accepted. The template then calls `confirm-decisions` + `resolve-questions`, locking the decisions the user just said they want to change.
- Impact: User's intent to edit is overridden by confirmation. They must then discover and use the post-confirm correction flow (reset-confirmation), which is more disruptive than editing before confirm. Not a data integrity issue (reset exists) but a friction multiplier.
- Recommendation: Add a hedging check: if the input matches `/\bconfirmo\b.*\b(cambiar|editar|modificar|espera|no\b)/i` → treat as ambiguous, ask "¿Confirmas las decisiones actuales? Responde 'confirmo' para confirmar o describe qué quieres cambiar." This keeps the natural-language acceptance but catches obvious hedging. Alternatively, accept this as a design trade-off and document it in the Notes section so implementers are aware.
- Suggested test: Unit test: `"confirmo pero quiero cambiar"` → rejected or flagged as ambiguous (depending on chosen fix). `"confirmo, todo bien"` → accepted.
- Dedup key: confirmo-regex-hedging-acceptance

### AU-04: Multi-field semantic mapping is under-specified for agent implementation

- Severity: P2
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (proposed section 2, "Multi-campo")
- Lines: 385-391
- Claim: The multi-field instructions rely on "Mapear por semántica (contenido → campo)" without defining what "semántica" means for each field. The examples cover three cases but don't establish a general mapping strategy. Different agents could legitimately map "landing page" to `formato` (because landing page is a format) or to `vertical` (because it describes the type of design).
- Evidence: Target line 391 example: "'banner para mi negocio' → no guardar formato ('banner' no es substring único de ninguna opción)." The reasoning "no es substring único" is incorrect — "banner" is not a substring of ANY option, not just non-unique. This mischaracterization could lead an implementer to think the rule is "reject if ambiguous" rather than "reject if zero matches OR multiple matches."
- Evidence: Target line 391 first example: "'Instagram post azul para restaurante' → guardar formato, paleta, vertical." This works because "Instagram post" uniquely matches a formato option, "azul" is clearly paleta, and "restaurante" uniquely matches a vertical option. But what about "azul para Instagram"? Is "azul" paleta or copy? Context suggests paleta, but an agent with less context might store it differently.
- Impact: Inconsistent agent behavior across sessions or model changes. Users may see different field assignments for similar inputs. The safety net ("si incierto → no guardar") mitigates data corruption but creates a degraded UX where the agent asks redundant questions after the user already provided the information.
- Recommendation: Add a field-to-keyword mapping table to the template or to `FIELD_REGISTRY` metadata. Example: `vertical` keywords: industry/type words. `formato` keywords: platform names + dimensions. `paleta` keywords: color words. `copy` keywords: quoted text, slogans. `cta` keywords: action verbs, button text. This gives agents a deterministic first-pass mapping before falling back to "don't save if uncertain." Also fix the "banner" example reasoning to say "no es substring de ninguna opción" instead of "no es substring único."
- Suggested test: Simulation: given input "LinkedIn banner azul para mi SaaS, CTA: Regístrate", verify the agent maps LinkedIn Banner → formato, azul → paleta, SaaS → vertical, Regístrate → cta. Verify "banner para mi negocio" maps nothing to formato (zero matches, not ambiguous).
- Dedup key: multi-field-semantic-mapping-specificity

### AU-05: `warning` field absent from documented `answer()` response shape

- Severity: P2
- Category: docs
- Status: valid
- File: target.md (section 3, answer() response JSON)
- Lines: 273-283
- Claim: The `answer()` response JSON example shows `{ planId, field, value, requiredPendingCount, optionalPendingCount, requiredFieldsComplete, allQuestionsAnswered }` but does not include `warning`. The template instruction at line ~400 says "Verificar siempre el campo `warning` en la respuesta antes de proceder." An implementer writing the `answer()` return logic has no example of the warning field in the response contract, making it easy to forget or misformat.
- Evidence: Target lines 273-283 show the response shape without `warning`. Target line 262 defines the warning condition (`empty_value_for_required_choice`). Target line ~400 mandates checking for it. No JSON example exists that shows the warning field.
- Impact: Implementer omits `warning` from the response, or places it in the wrong nesting level. Agent never sees the warning, proceeds past empty required fields, and eventually hits `GSDC_QUESTIONS_UNRESOLVED` (exit 19) at `confirm-decisions`. The error appears far from the actual cause (empty value entered multiple steps ago).
- Recommendation: Add a second JSON example for the warning case: `{ "planId": "001", "field": "cta", "value": "", "warning": "empty_value_for_required_choice", "requiredPendingCount": 1, ... }`. Mark `warning` as an optional field in the contract description.
- Suggested test: Unit test: `answer(planId, 'cta', '')` on required choice field → response includes `"warning": "empty_value_for_required_choice"`. Verify warning is at top level of response data, not nested.
- Dedup key: answer-warning-field-missing-from-response-doc

### AU-06: Agent has no way to know WHICH fields remain pending after `answer()` without tracking state

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (section 3, answer() response)
- Lines: 273-283
- Claim: `answer()` returns aggregate counters (`requiredPendingCount`, `optionalPendingCount`) but not the list of pending field IDs. The agent must either (a) track answered fields in its own memory from the initial `questions()` call, or (b) re-call `questions()` after each `answer()`. Option (a) is fragile across context resets; option (b) is wasteful.
- Evidence: Target lines 273-283 show the response shape with only counters, no pending list. Target lines 379-395 show the template flow: call `questions()` once, then iterate through answers. After each answer, the template checks counters but never re-fetches the pending list.
- Impact: If the agent's context is reset mid-flow (common in long conversations), it loses track of which specific fields are pending. The agent would need to re-call `questions()` to recover, adding latency. In the worst case, an agent with stale context might re-ask an already-answered question, confusing the user.
- Recommendation: Consider adding a `pendingFields: ["paleta", "copy"]` array to the `answer()` response, or at minimum document the recommended agent strategy: "After context reset, call `questions()` to recover pending state." The latter is lower-cost to implement and doesn't change the API contract.
- Suggested test: Integration test: answer 3 of 6 required fields → verify `requiredPendingCount === 3` → simulate context reset → call `questions()` → verify `pending` contains exactly the 3 unanswered fields.
- Dedup key: answer-response-missing-pending-field-ids

### AU-07: `staleRenameFailed: true` leaves orphan mockup.html with no guard against stale reuse

- Severity: P2
- Category: state
- Status: valid
- File: target.md (section 4, resetConfirmation)
- Lines: 311-313
- Claim: When `resetConfirmation()` fails to rename `mockup.html` to `.stale.<timestamp>`, it returns `staleRenameFailed: true` and instructs the template to inform the user about manual cleanup. However, no guard prevents the stale `mockup.html` from being picked up by a later `submitMockup()` call. The hash validation in `submitMockup()` would catch a hash mismatch — but only if the agent regenerates the mockup. If the agent accidentally calls `submitMockup()` without regenerating, the stale file passes the filename check and fails only on hash.
- Evidence: Target lines 311-313 document the `staleRenameFailed` flag and message. Target line 303 defines that reset reverts state to `questions_pending`. `submitMockup()` is gated on `ready_for_html` state, which requires `resolveQuestions()` first, which requires `confirmDecisions()` first. So the stale file cannot be submitted without going through the full confirm → resolve flow. Hash mismatch is the safety net.
- Impact: Low probability but high confusion. If the stale `mockup.html` hash coincidentally matches the new confirmation hash (astronomically unlikely with SHA-256), stale content would be submitted. More realistically, the orphan file clutters the plan directory and the "manual cleanup" instruction is easy to miss in a chat flow. The user might see `mockup.html` and assume their mockup is ready, not realizing it's stale.
- Recommendation: Add a check in `resolveQuestions()` or `submitMockup()`: if `mockup.html` exists and its modification time predates the current `confirmedAt`, log a warning or include a `staleMockupDetected: true` flag in the response. Alternatively, `resetConfirmation()` could write a `.reset-timestamp` marker file that `submitMockup()` checks to verify the mockup was created after the most recent reset.
- Suggested test: Unit test: reset with `staleRenameFailed: true` → confirm → resolve → submit with stale mockup → verify exit 21 (hash mismatch) and not silent acceptance.
- Dedup key: stale-mockup-orphan-after-rename-failure

### AU-08: Template error-recovery table has no guidance for partial `resetConfirmation` crash

- Severity: P3
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (proposed section 2, error table)
- Lines: 407-418
- Claim: The error table covers specific exit codes but has no row for the scenario where `resetConfirmation()` crashes between writing `plan.json` (step 4) and `decisions.json` (step 5). Target line 314 documents this: "state is `questions_pending` in plan.json but `confirmed=true` in decisions.json → `answer()` fails with `GSDC_DECISIONS_LOCKED`." The catch-all row ("Cualquier otro código → Detener flujo") would handle the immediate error, but doesn't tell the agent that re-running `resetConfirmation()` fixes it.
- Evidence: Target line 314: "Re-ejecutar `resetConfirmation()` re-ejecuta todos los pasos idempotentemente." Target line 418: "Nota: reset-confirmation es idempotente — si falla, reintentar una vez." The note is attached to the catch-all row but doesn't appear in any specific error row. An agent encountering `GSDC_DECISIONS_LOCKED` after a failed reset would follow the table → ask user → run reset again. This works, but the user sees "decisions locked" which is confusing when they just asked for a reset.
- Impact: User confusion when they requested a reset, got an error (or crash), and then see "decisions locked" on the next interaction. The recovery path (re-run reset) is documented in the Notes but not surfaced as the immediate recommendation when `GSDC_DECISIONS_LOCKED` appears after a reset attempt.
- Recommendation: Add a note to the `GSDC_DECISIONS_LOCKED` (23) row: "Si acabas de ejecutar `reset-confirmation`, reintentar. Si no, preguntar si ejecutar `reset-confirmation`." Alternatively, add a new row for the specific scenario: "GSDC_DECISIONS_LOCKED after reset attempt → re-run reset-confirmation."
- Suggested test: Integration test: simulate crash between plan.json and decisions.json writes → agent calls `answer()` → gets exit 23 → agent retries `resetConfirmation()` → success → agent calls `answer()` → success.
- Dedup key: partial-reset-crash-recovery-guidance

### AU-09: `ensureV2Fields()` read-only non-persistence is undocumented for template consumers

- Severity: P3
- Category: docs
- Status: valid
- File: target.md (section 2, questions() behavior)
- Lines: 247
- Claim: `questions()` calls `ensureV2Fields()` which normalizes the skeleton in memory but does not persist. The plan documents this in the Notes section (line 615) and in the questions() spec (line 247), but the template (`canva-mockup.md`) has no awareness of this. If the template or a downstream consumer reads `decisions.json` directly (e.g., to populate markdown files), they'd see the pre-migration structure missing `optionalAnswered`, `assets`, and the full `confirmation` skeleton.
- Evidence: Target line 247: "`questions()` no persiste migración: `ensureV2Fields()` modifica en memoria pero no escribe a disco (es read-only)." Target line 419-420: "Poblado de archivos Markdown: Actualizar como espejo de `decisions.json`." The template says to mirror `decisions.json` but doesn't warn that the file on disk may not match what `questions()` returned until a mutation occurs.
- Evidence: Target line 420: "PROHIBIDO editar Markdown con datos que no estén primero en `decisions.json`." If the agent reads `decisions.json` directly for markdown population after `questions()` on a v1.1 plan, it won't find `assets` or `optionalAnswered`. The template doesn't say "always use the CLI output, never read decisions.json directly for display."
- Impact: Agent populates markdown from stale on-disk `decisions.json`, missing the `assets` field. User sees incomplete markdown. Not a data integrity issue (next `answer()` call persists the migration) but a display inconsistency.
- Recommendation: Add to the template: "Para poblar Markdown, usar los datos retornados por `plan questions` o `plan status` (CLI), no leer `decisions.json` directamente. El archivo en disco puede estar una versión atrás hasta la primera mutación." Or simplify: add "PROHIBIDO leer `decisions.json` directamente" alongside the existing write prohibition.
- Suggested test: Integration test: v1.1 plan → `questions()` → read `decisions.json` from disk → verify `assets` is absent → `answer(assets, "")` → read `decisions.json` → verify `assets` is present and `optionalAnswered` exists.
- Dedup key: ensurev2fields-read-only-non-persistence-template-gap

### AU-10: "Otro" substring matching can false-trigger on user free-text containing "otro"

- Severity: P3
- Category: ux
- Status: valid
- File: `templates/commands/canva-mockup.md` (proposed section 2, matching rules)
- Lines: 384, 392
- Claim: The template matching rule (line 384) says "Si el texto del usuario es case-insensitive substring de exactamente una opción, mostrar esa opción para confirmar." The "Otro (personalizado)" option label contains the common Spanish word "otro" (meaning "other"). If a user says "quiero otro color" intending to specify a different palette, the substring "otro" matches "Otro (personalizado)" as a unique match. The agent would present the "Otro" option for confirmation, potentially leading to the custom follow-up flow instead of treating it as a palette value.
- Evidence: Target line 384: matching rule. Target line 166: option `{ "label": "Otro (personalizado)", "value": "" }`. "otro" is a substring of "Otro (personalizado)" and not a substring of any other option label. So "quiero otro color" → unique match → agent presents "Otro (personalizado)" for confirmation.
- Impact: False routing to custom follow-up. User says "quiero otro color" meaning "a different color" and gets asked "Escribe tu opción personalizada:" for the field. Mild confusion, easily recoverable (user just types their actual answer), but degrades the smooth flow the proposal aims to create.
- Recommendation: Two options: (a) Change "Otro (personalizado)" to a less common label like "Opción personalizada" or "Valor personalizado" to reduce false substring matches. (b) In the matching rule, exclude "Otro (personalizado)" from substring matching — only match it if the user's text is an exact or near-exact match to the full label. Option (b) is more robust but adds complexity to the template.
- Suggested test: Simulation: user says "quiero otro color" → verify agent does NOT match to "Otro (personalizado)" (if fix applied) or that the confirmation prompt makes it clear they're selecting a custom option (if not fixed).
- Dedup key: otro-substring-false-match

## Non-Issues Checked

- **"confirmo" negation check for "no, confirmo"**: The negation regex `/\bno\s+.*\b(confirmo|confirmado)\b/i` requires `\s+` after "no". "no, confirmo" has a comma, not whitespace, after "no". However, "no, confirmo" → the positive regex matches `confirmo` → accepted. This is actually correct behavior: "no, confirmo" in Spanish is a valid confirmation (like "no wait, I confirm"). The negation check targets "no confirmo" (I don't confirm), not "no, confirmo" (no, I do confirm).

- **Parallel `answer()` calls**: The template says "Guardar campos exitosos uno por uno con `plan answer`" which implies sequential execution. Locking in `plan-manager.js` serializes concurrent calls. No data corruption risk even if an agent fires calls in parallel. Mild performance concern only.

- **`confirmDecisions()` rejecting empty required fields**: The plan adds `GSDC_QUESTIONS_UNRESOLVED` (exit 19) when required fields are empty at confirm time. The template also checks `requiredFieldsComplete` before reaching confirm. Double protection — no UX issue.

- **Lock release in `finally`**: Both `questions()` and `answer()` use `finally` for lock release. No stale lock risk from exceptions.

- **History deduplication in `resetConfirmation()`**: If the last history entry already has `action: 'reset-confirmation'` with same `from`, it's not duplicated. Clean history.

- **`allQuestionsAnswered` vs `requiredFieldsComplete` semantics**: The plan clearly distinguishes these (line 123-125). `allQuestionsAnswered` tracks question-presentation, not value presence. An agent using `requiredFieldsComplete` as the gate for confirmation is correct.

## Residual Risks

- **Agent context loss mid-flow**: If the agent loses context between `questions()` and the last `answer()`, it has no mechanism to resume besides re-calling `questions()`. This is documented implicitly (the agent can always call `questions()`) but no explicit recovery instruction exists in the template. Low severity because the CLI is stateless and idempotent.

- **Future optional fields**: `resetConfirmation()` correctly iterates `OPTIONAL_FIELDS` instead of hardcoding `assets`. If a future version adds more optional fields, the template's assets-specific instructions ("preguntar assets") would need updating. The template couples the general "optional" concept to the specific "assets" field in multiple places. Not a current issue but a maintenance risk.

- **"confirmo" regex language dependency**: The regex is Spanish-specific (`confirmo|confirmado`). If the template is ever internationalized, the confirmation parsing would need per-language patterns. Not actionable now but worth noting for future-proofing.
