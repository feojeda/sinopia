# Review: agent-ux

## Summary

- Verdict: approve_with_changes
- Top risk: "confirmo" parsing rejects virtually all natural user responses, creating an adversarial confirmation loop that will confuse both users and agents
- Confidence: high

## Findings

### AU-01: "confirmo" parsing rejects all natural conversational responses

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (lines 402-403)
- Lines: 402-403
- Claim: The confirmation gate requires an exact match of the single word "confirmo" (after stripping trailing `.!`,`), rejecting any conversational preamble or suffix.
- Evidence: Target line 402: "Strip trailing `.`, `!`, `,` del input. Luego comparar con `"confirmo"` (case-insensitive, trimmed). Si no coincide → 'Para confirmar, responde únicamente "confirmo".'" Verification step 19 confirms `"confirmo, gracias"` is rejected. This means "sí confirmo", "lo confirmo", "ok confirmo", "confirmo gracias" are all rejected.
- Impact: In a chat/agent interaction, users almost never respond with a bare single word. Every user who naturally qualifies their confirmation will be rejected and told to respond "únicamente 'confirmo'". This creates an adversarial, robotic loop that erodes trust. The agent has no discretion — the template is a hard prohibition (line 406: "PROHIBIDO ejecutar sin 'confirmo'"). At minimum 3-5 extra turns per session for users who don't follow the exact single-word format.
- Recommendation: Allow confirmation when "confirmo" appears as a standalone word (word-boundary match) within the user's response, e.g., `/\bconfirmo\b/i.test(userInput.trim())`. Reject only when "confirmo" is absent entirely. Keep the rejection message for truly absent cases. Alternatively, accept "sí", "confirmo", "confirmo." and a small explicit allowlist — but the word-boundary approach is simpler and less brittle.
- Suggested test: Integration test: user sends "sí, confirmo" → agent parses as confirmed. User sends "confirmo gracias" → confirmed. User sends "no confirmo" → rejected (word boundary before "confirmo" but "no" negates — decide explicitly). User sends "confirmar" → rejected (different word).
- Dedup key: confirmo-exact-match-rejects-natural-input

### AU-02: Empty required-choice warning has no agent instruction

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (lines 249, 378-380)
- Lines: 249, 378-380
- Claim: `answer()` accepts an empty string for a required choice field and returns `warning: "empty_value_for_required_choice"`, but the agent template provides no instruction on how to handle this warning.
- Evidence: Target line 249: "Si value es '' y campo es required: true → aceptar pero incluir warning." Lines 378-380 show the agent's decision tree after each `plan answer`, which checks `requiredFieldsComplete` and `optionalPendingCount` but never mentions the warning field. The error handling table (lines 383-394) covers exit codes, not in-band warnings.
- Impact: An agent that doesn't check for the warning will silently proceed with an empty required field. `requiredFieldsComplete` will be `false`, so the flow won't auto-advance to confirmation, but the agent will keep asking the next pending question without telling the user that their previous answer was empty. The user may not realize a required field is still unfilled, leading to a confusing loop where the agent keeps asking questions the user thought they answered.
- Recommendation: Add an explicit instruction in the template: "If `plan answer` response contains `warning`, re-prompt the user for that field immediately before proceeding." Also add this to the error handling table as a warning-level entry (not an exit code, but a response field to check).
- Suggested test: Send `answer(vertical, "")` for a required choice → verify response includes warning → agent re-prompts. Verification step could be: "answer with empty required choice → warning present → agent does not advance past this field."
- Dedup key: empty-required-choice-warning-no-agent-handling

### AU-03: readOnly + confirmed in questions_pending state lacks recovery guidance

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (lines 230-231, 358)
- Lines: 230-231, 358
- Claim: When `questions()` returns `readOnly: true, confirmed: true, status: "questions_pending"` (the state between confirm and resolve), the agent template's readOnly handling only suggests `reset-confirmation` for `ready_for_html`/`pending_approval` states, not for `questions_pending`.
- Evidence: Target line 230 defines this state: "mockup:questions_pending + confirmed === true → readOnly: true, confirmed: true, pending: []. El agente informa 'confirmado, esperando transición'." Line 358: "Si readOnly: true: Decisiones bloqueadas. Muestra resumen. Si confirmed: true y estado es ready_for_html/pending_approval, sugiere reset-confirmation." The `questions_pending` state is not listed in the reset-confirmation suggestion conditions.
- Impact: If `resolveQuestions()` fails after confirmation (e.g., hash mismatch from concurrent modification), the plan is stuck in `questions_pending + confirmed=true`. The agent tells the user "confirmado, esperando transición" but offers no escape hatch. The user cannot answer questions, cannot re-confirm, and the agent doesn't suggest `reset-confirmation` because the template only suggests it for other states. This is a dead-end.
- Recommendation: Add `questions_pending` to the readOnly recovery guidance: "Si confirmed: true → sugiere reset-confirmation sin importar el estado (excepto approved o posterior)." Or simply: "Si confirmed: true y readOnly: true → siempre sugerir reset-confirmation."
- Suggested test: Create fixture with `questions_pending + confirmed=true` → agent calls `questions()` → receives `readOnly: true, confirmed: true` → agent suggests `reset-confirmation`. Verification step: "questions() returns confirmed + readOnly in questions_pending state → template instructs reset-confirmation suggestion."
- Dedup key: questions-pending-confirmed-read-only-no-recovery

### AU-04: Multi-field semantic mapping is under-specified for reliable agent execution

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (lines 365-370)
- Lines: 365-370
- Claim: The instruction "Mapear por semántica (contenido → campo), no por posición" is too vague for deterministic agent behavior across different LLM implementations.
- Evidence: Target line 366: "Mapear por semántica (contenido → campo), no por posición". If a user says "quiero colores azul y rojo, el texto es 'compra ya'", different agents may disagree on whether "azul y rojo" maps to `paleta` or `copy` (since "compra ya" is also a kind of text). The fallback (line 368: "Si algún mapeo es incierto → no guardar ese campo, preguntar") mitigates worst cases but doesn't define what "incierto" means.
- Impact: Non-deterministic behavior across agent implementations. One agent might map correctly, another might ask unnecessary clarification. The safe behavior (always ask when uncertain) may result in the agent asking the user to re-state information they already provided, which is frustrating.
- Recommendation: Add concrete examples in the template for ambiguous cases. E.g., "Si el usuario menciona colores → paleta. Si menciona texto entre comillas → copy. Si menciona un formato con dimensiones → formato." This gives the agent heuristic anchors. Also consider: if the user provides more values than pending fields, always ask — the current rule says "Si cantidad no coincide → no guardar nada" which is good but the threshold for "no coincide" needs to account for optional fields.
- Suggested test: Template review: given example inputs ["azul, compra ya, instagram post", "SaaS, 1080x1080, jóvenes"], verify each maps deterministically. Add these as examples in the template.
- Dedup key: multi-field-semantic-mapping-vague

### AU-05: GSDC_PLAN_ARTIFACT_MISSING (exit 25) has zero recovery path

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (lines 389, 523)
- Lines: 389, 523
- Claim: Error 25 (`GSDC_PLAN_ARTIFACT_MISSING`) tells the agent to "Detener flujo" with no suggested recovery action, unlike every other error in the table.
- Evidence: Target line 389: "| GSDC_PLAN_ARTIFACT_MISSING (25) | Detener flujo. |" — no secondary suggestion. Compare with exit 24 (suggests `plan create`), exit 23 (asks about `reset-confirmation`), exit 13 (suggests `plan status`).
- Impact: The agent stops and tells the user something went wrong but offers no path forward. The user has no idea what to do. This error occurs when a plan directory exists but `decisions.json` is missing — a rare but recoverable state (the file could be recreated by `plan create` in a new plan, or by manual intervention).
- Recommendation: Change recovery to: "Detener flujo. Sugerir `plan create` para plan nuevo, o intervención manual si se necesita recuperar datos del plan existente." At minimum, suggest something so the user isn't stuck.
- Suggested test: Verify error table entry for exit 25 includes a recovery suggestion that gives the user a next action.
- Dedup key: artifact-missing-no-recovery-suggestion

### AU-06: requiredFieldsComplete flag name invites agent misinterpretation

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (lines 118-119, 378-380)
- Lines: 118-119, 378-380
- Claim: The flag `requiredFieldsComplete: true` suggests the flow is "complete" when only required fields are done, potentially causing agents to skip the optional assets question and jump to confirmation.
- Evidence: Target line 118: "requiredFieldsComplete: true cuando requiredPendingCount === 0. El agente debe preguntar assets (si pending) y luego presentar resumen. No es permiso para auto-confirmar ni para saltar opcionales." Despite this note, the name "complete" is semantically loaded. Lines 378-380 show the decision tree correctly handles this, but the flag name works against the instruction.
- Impact: A hasty agent implementer (or a different LLM reading the CLI output) sees `requiredFieldsComplete: true` and concludes "all questions are complete, proceed to confirmation." The template's decision tree (lines 378-380) is correct, but if an agent shortcuts by checking only `requiredFieldsComplete` without reading the template carefully, it will skip the assets question.
- Recommendation: Rename to `requiredFieldsSatisfied` or `allRequiredAnswered` — a name that conveys "required part is done" without implying the entire flow is complete. Alternatively, add a top-level `flowComplete: true` that combines both required and optional, so agents have an unambiguous "done" signal. Cost is low (rename in one response schema + template references).
- Suggested test: After renaming, grep all references to ensure consistency. Verification step: `requiredFieldsSatisfied: true, optionalPendingCount: 1` → agent asks assets question (not skip to confirm).
- Dedup key: required-fields-complete-name-misleading

### AU-07: Choice substring matching direction may confuse implementers

- Severity: P3
- Category: ux
- Status: valid
- File: target.md (line 364)
- Lines: 364
- Claim: The instruction "Si el texto del usuario es case-insensitive substring de exactamente una opción" uses the substring relation in one direction (user ⊆ option), which is correct but easy to implement in reverse (option ⊆ user).
- Evidence: Target line 364: "Si el texto del usuario es case-insensitive substring de exactamente una opción, mostrar esa opción para confirmar." If an implementer reads this as "if the option is a substring of the user text" (the natural direction for fuzzy matching), then a user saying "quiero Instagram Post (1080x1080) para mi negocio" would match "Instagram Post (1080x1080)" correctly. But the actual spec means: user text "Instagram" is a substring of option "Instagram Post (1080x1080)". Both directions produce the same result for this example. However, for user text "me gusta el azul para mi SaaS", the correct direction (user ⊆ option) would match nothing (the full sentence isn't in any option), while the reversed direction would find "SaaS" as a substring within the user text. The reversed direction is actually more useful for NLP, but the spec says user ⊆ option.
- Impact: An agent implementing the "wrong" direction would be more permissive (more matches → more confirmation prompts, fewer "show full list" cases). This isn't catastrophic but creates inconsistent behavior. More importantly, the spec direction (user ⊆ option) means users who provide verbose natural responses like "quiero algo para SaaS" will get zero matches and see the full list every time — defeating the purpose of fuzzy matching.
- Recommendation: Clarify the direction explicitly: `option.value.toLowerCase().includes(userText.toLowerCase())`. Consider whether the reversed direction (`userText.toLowerCase().includes(option.value.toLowerCase())`) is actually the intended behavior for natural language input — it would provide better UX. Add a concrete example: 'User: "SaaS" → matches "SaaS / Producto Digital" (SaaS is substring of option). User: "quiero SaaS" → 0 matches (full sentence is not substring of any option).'
- Suggested test: Unit test: assert that `matchChoices("SaaS", options)` returns 1 match. Assert `matchChoices("quiero SaaS", options)` returns 0 matches (per spec). Document this expected behavior so implementers see the boundary.
- Dedup key: choice-substring-matching-direction-ambiguous

## Non-Issues Checked

- **"Otro (personalizado)" double guard**: Both CLI (exit 26) and template (PROHIBIDO) reject this value. Redundant but not harmful — defense in depth is appropriate for a trap option.
- **Assets question loop risk**: After answering assets (even with ""), `optionalPendingCount` drops to 0, preventing re-asking. `resetConfirmation()` correctly clears `optionalAnswered` to re-enable the question. Flow is sound.
- **Error catch-all row**: Line 393 covers unexpected exit codes with "Detener flujo. Reportar error completo. Sugerir plan status." — adequate recovery.
- **resetConfirmation idempotency**: Line 287 defines no-op case. Line 394 notes idempotence. Line 299 defines recovery for partial failures. Well-covered.
- **ensureV2Fields read-only behavior**: Line 234 explicitly states `questions()` doesn't persist migration. Prevents side-effects from a read operation.
- **History deduplication on reset**: Line 296 prevents duplicate history entries on re-execution.
- **Placeholder detection exact match**: Breaking change is documented (line 42). `===` is intentional and avoids false positives like "Nodo" matching "TODO".
- **State validation order in answer()**: Line 254 specifies: acquire lock → read → validate state → ensureV2 → validate confirmed → validate choice → write → release. Order is correct and prevents TOCTOU.
- **CLI handleError fallback to exit 1**: Line 314 changes all `err.exitCode || 15/19` to `err.exitCode || 1`. Generic fallback is safer than accidentally matching a specific error code.

## Residual Risks

- **Agent variance in semantic multi-field mapping** (AU-04): Even with better examples, different LLMs will interpret "semántica" differently. The "when in doubt, ask" fallback mitigates but doesn't eliminate variance. No test can fully cover this without constraining the agent's NLU.
- **"confirmo" word-boundary fix** (AU-01): If changed to word-boundary matching, "no confirmo" would match. The spec needs to explicitly decide whether negation is handled and how. Current spec doesn't address negation at all.
- **Choice matching UX for verbose users** (AU-07): The spec direction (user ⊆ option) means any user who doesn't respond with a near-exact option substring will always see the full list. This limits the fuzzy matching to very short inputs, which may not match real user behavior in a chat setting.
