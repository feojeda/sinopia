# Review Consolidado: docs/PROPOSAL_v1.2_interactive_questions.md

## Meta

- Target: docs/PROPOSAL_v1.2_interactive_questions.md
- Estrategia: 2 — Default recomendado
- Reviewers: pragmatic, operator, modeler, agent-ux
- Fecha: 20260530-152234

## Summary

- Verdict: reject_until_fixed
- Top risk: `questions()` returns `pending: []` when `confirmed === true`, hiding real field incompleteness — any consumer checking only `pending.length` will misinterpret the state and break the interactive flow
- Confidence: high

## Findings

### F-01: questions() masks pending when confirmed, breaking the CLI contract

- Severity: P1
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `questions()`)
- Lines: 232-233, 487, 585
- Claim: When `confirmed === true` and state is `questions_pending` (between confirm and resolve), `questions()` returns `pending: []` regardless of how many fields are actually empty. The full response shape (counters, filled, completeness flags) is undefined for this intermediate state.
- Evidence: Line 232 states `pending: []` for confirmed+unresolved. Line 585 notes this is intentional. Test at line 487 only asserts `pending.length === 0 AND confirmed === true AND readOnly === true` — counters are untested. Four reviewers independently identified this as a footgun: an agent checking `pending.length === 0` without gating on `confirmed` will see "nothing to ask" and skip prompting or advance to the next phase. No runtime guard prevents misuse.
- Impact: Any agent that interprets `pending: []` as "all fields answered" without first checking `confirmed` will break the interactive flow. This includes skipping prompts for unfilled fields or attempting phase transitions without resolve. The template checks `confirmed` at line 360 but the JSON contract itself offers no structural protection.
- Recommendation: Either (a) add a `"pendingMasked": true` flag when `pending` is overridden to `[]`, giving consumers a machine-readable signal, or (b) do not mask `pending` — return real values with `readOnly: true`. Additionally, explicitly define the full response shape for the confirmed intermediate state: specify whether `requiredPendingCount`, `optionalPendingCount`, `filledCount`, `filled`, `requiredFieldsComplete`, and `allQuestionsAnswered` reflect truth or are also masked.
- Suggested test: Create fixture: `confirmed: true`, state=`questions_pending`, 5/6 required fields filled. Call `questions()`. Assert exact values of `requiredPendingCount`, `optionalPendingCount`, `requiredFieldsComplete`, `allQuestionsAnswered`, `filled.length`, and `filledCount`. Assert `pendingMasked === true` if option (a) is chosen.
- Dedup key: questions-confirmed-pending-masking
- Sources: agent-ux:UX-01, pragmatic:P2-04, operator:OP-01, modeler:M-01

### F-02: CLI handleError fallback migration scope is under-specified

- Severity: P2
- Category: cli-contract
- Status: valid
- File: bin/gsd-canva.js
- Lines: 228, 247, 263, 279, 295, 312, 327, 344, 359, 375, 414, 451, 489
- Claim: The proposal says "Cambiar todos los `err.exitCode || 15` y `err.exitCode || 19` a `err.exitCode || 1`" but the CLI has 10+ distinct fallback codes (`|| 10`, `|| 13`, `|| 14`, `|| 16`, `|| 18`, `|| 20`) that are not mentioned.
- Evidence: Target §5 (line 316) and §Breaking Changes (line 44) only call out `|| 15` and `|| 19`. The blanket "cualquier error sin exitCode explícito usa 1" contradicts the narrow instruction to only change 15 and 19. Other stale fallbacks remain.
- Impact: Implementer either changes only `|| 15`/`|| 19` (inconsistent — other stale fallbacks remain) or changes everything (losing diagnostic signal for init, upgrade, doctor, deliver).
- Recommendation: Explicitly list every CLI action handler and its intended fallback. Decide: (a) change only plan-related commands' fallbacks to `|| 1`, or (b) change all commands. Document the decision with a complete before/after table.
- Suggested test: After implementation, `grep -n 'exitCode ||' bin/gsd-canva.js` should produce exactly the expected set of fallbacks.
- Dedup key: cli-handleerror-fallback-scope
- Sources: pragmatic:P2-01

### F-03: Hardcoded field arrays in existing functions not explicitly replaced

- Severity: P2
- Category: integrity
- Status: valid
- File: lib/plan-manager.js
- Lines: 185, 277
- Claim: `FIELD_REGISTRY` and `REQUIRED_FIELDS` are introduced as the single source of truth, but no instruction says to replace the hardcoded `const fields = ['vertical', 'audiencia', ...]` in `confirmDecisions()` (line 185) and `resolveQuestions()` (line 277).
- Evidence: Target §1 defines `REQUIRED_FIELDS` from `FIELD_REGISTRY`. Target §8 discusses hash changes. No section instructs replacing the hardcoded arrays. An implementer focused on hash migration could leave them untouched.
- Impact: If `FIELD_REGISTRY` is later modified, validation arrays would not update, creating silent inconsistency.
- Recommendation: Add explicit instruction: "In `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`: replace all hardcoded `fields` arrays with `REQUIRED_FIELDS`."
- Suggested test: After implementation, `rg "vertical.*audiencia.*formato.*paleta.*copy.*cta" lib/plan-manager.js` returns 0 hits.
- Dedup key: hardcoded-fields-not-replaced
- Sources: pragmatic:P2-02

### F-04: resetConfirmation() non-atomic two-file write leaves inconsistent state without diagnostic support

- Severity: P2
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `resetConfirmation()`)
- Lines: 293-301
- Claim: Steps 4 (write `decisions.json`) and 5 (write `plan.json`) are separate non-atomic writes. A crash between them leaves `confirmed: false` in decisions but `ready_for_html`/`pending_approval` in plan state. `status()` only reads `plan.json` and cannot reveal the inconsistency.
- Evidence: Line 293-300 specifies sequential steps. Line 301 documents recovery but requires recognizing the inconsistency. Current `status()` (plan-manager.js:658-682) reads only `plan.json`, not `decisions.json`. `questions()` would show `status: "ready_for_html"` with `confirmed: false` and `readOnly: true` — a combination with no documented template handling.
- Impact: During the recovery window, an agent calling `plan status` sees `ready_for_html` and may conclude no reset is needed. Recovery depends on blindly re-running `resetConfirmation()`.
- Recommendation: Either (a) extend `status()` output to include `confirmation.confirmed`, or (b) reverse write order — write `plan.json` first (set `questions_pending`), then `decisions.json` — so crash leaves `questions_pending` + `confirmed: true`, which `resetConfirmation()` handles cleanly, or (c) add a note in the agent template that `readOnly: true` + `confirmed: false` signals a partial reset needing re-execution of `reset-confirmation`.
- Suggested test: Mock `writeAtomicJson` to fail on the second call. Verify re-running `resetConfirmation()` completes successfully and both files are consistent.
- Dedup key: reset-confirmation-non-atomic-two-file-write
- Sources: pragmatic:P2-03, modeler:M-02

### F-05: confirm→resolve two-step gap lacks explicit recovery path in template

- Severity: P2
- Category: state
- Status: valid
- File: templates/commands/canva-mockup.md (proposed section 2)
- Lines: 406-409
- Claim: The template shows `confirm-decisions` followed by `resolve-questions` as sequential steps but does not document what the agent should do if `confirm-decisions` succeeds and `resolve-questions` fails.
- Evidence: Lines 406-409 show only the happy path. The error table (lines 386-397) covers individual error codes but no combined scenario. After confirm succeeds, the plan is in `confirmed=true, state=questions_pending` — `answer()` is blocked (exit 23) and `questions()` returns readOnly. Neither retry nor reset is explicitly recommended for this failure sequence.
- Impact: An agent falls through to "Cualquier otro código → Detener flujo", abandoning a recoverable plan. The user said "confirmo" but nothing happened.
- Recommendation: Add explicit error handling after the confirm→resolve sequence: "If `confirm-decisions` succeeds but `resolve-questions` fails, retry `resolve-questions` once. If still fails, run `reset-confirmation` and inform the user that confirmation was reset."
- Suggested test: Integration test: confirm succeeds → resolve throws error → retry resolve → success. Also: confirm succeeds → resolve fails persistently → reset-confirmation → state is `questions_pending`, `confirmed=false`.
- Dedup key: confirm-resolve-gap-recovery-missing
- Sources: operator:OP-02

### F-06: confirmo rejection message uses the rejected word "confirmar"

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: 405
- Claim: The regex `/\bconfirmo\b/i` rejects "confirmar" (infinitive). The fallback message is "Para confirmar, responde con una frase que incluya 'confirmo'." — using "confirmar" (rejected word) to instruct the user.
- Evidence: Line 405: "'confirmar' → rechazar (no es 'confirmo'). Si no match → 'Para confirmar, responde con una frase que incluya confirmo.'" The system tells the user to "confirmar" but rejects it when they try.
- Impact: A Spanish-speaking user naturally writes "confirmar" and gets rejected. The rejection message itself uses the rejected word, creating cognitive mismatch and repeated failed attempts.
- Recommendation: Either accept both "confirmo" and "confirmar" in the regex, or change the prompt to use only the accepted form: "Responde con una frase que incluya 'confirmo' (ej: 'sí, confirmo')." Consider also accepting "confirmado." At minimum, the rejection message must not contain a word that is itself rejected.
- Suggested test: User says "confirmar" → rejected with message that does NOT contain the word "confirmar" as instruction. Or "confirmar" is accepted.
- Dedup key: confirmo-rejects-confirmar-but-message-uses-confirmar
- Sources: agent-ux:UX-02

### F-07: Multi-field answer discards all valid inputs when count mismatches pending fields

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: 367-372
- Claim: Rule step 2 says "Si cantidad no coincide con campos pendientes → no guardar nada, pedir aclaración." If the user provides 3 valid answers for 4 pending fields, all 3 valid answers are discarded.
- Evidence: Line 369: "Si cantidad no coincide con campos pendientes → no guardar nada, pedir aclaración."
- Impact: User loses all valid answers. Agent asks again from scratch, wasting effort. Users learn not to batch answers, defeating the multi-field feature.
- Recommendation: Change to: "If quantity exceeds pending count → no guardar nada. If quantity is less than pending count → guardar los mapeos exitosos, preguntar por los restantes."
- Suggested test: Agent simulation: 4 pending fields, user provides 3 valid answers → agent saves 3, asks for remaining 1.
- Dedup key: multi-field-discard-all-on-count-mismatch
- Sources: agent-ux:UX-03

### F-08: answer() empty-value warning is a response body field — agents can miss it

- Severity: P2
- Category: ux
- Status: valid
- File: target.md
- Lines: 251, 380
- Claim: When empty value is submitted for a required choice, `answer()` succeeds (exit 0) with `"warning": "empty_value_for_required_choice"` in the JSON body. Agents that only check exit codes will miss it.
- Evidence: Line 251: "aceptar pero incluir warning." Line 380: "Si la respuesta contiene warning → re-preguntar." An agent checking only exit code and `requiredFieldsComplete` sees success + false, proceeds to next question — field was recorded empty, user never re-prompted.
- Impact: Empty required choice field silently accepted. Recovery depends on agent eventually calling `questions()` again, which is not guaranteed.
- Recommendation: Either return a non-zero exit code for "accepted with warning" OR elevate to a top-level `"status": "accepted_with_warning"` field. Alternatively, make the template instruction a hard rule: "After every `answer()`, check for `warning` field before proceeding."
- Suggested test: Agent simulation: `answer(vertical, "")` → agent detects warning → re-prompts user for vertical.
- Dedup key: answer-empty-required-choice-warning-not-exit-code
- Sources: agent-ux:UX-04

### F-09: Exit code 26 covers three distinct failure modes without subcode

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md
- Lines: 252-255, 533-540
- Claim: Exit 26 is used for: (1) numeric-only values, (2) literal "Otro (personalizado)", (3) values not matching any option for non-custom fields. Each has a different recovery path but the same exit code.
- Evidence: Lines 252-255 map three conditions to exit 26. Line 393: single error table row "Valor no válido para campo choice. Ver opciones." — misleading for numeric input (should say "use text label") or "Otro" literal (should say "provide custom value").
- Impact: Agents must parse human-readable error messages to determine recovery. Showing "opciones válidas" for all three cases gives misleading guidance.
- Recommendation: Add a `subcode` or `reason` field: `"subcode": "numeric_value"` | `"otro_literal"` | `"not_in_options"`.
- Suggested test: `answer(vertical, "3")` → error JSON contains `subcode: "numeric_value"`. `answer(vertical, "Otro (personalizado)")` → `subcode: "otro_literal"`.
- Dedup key: exit-26-three-failure-modes-no-subcode
- Sources: agent-ux:UX-05

### F-10: readOnly + confirmed:false state has no explicit agent guidance

- Severity: P2
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: 232-233, 360-361
- Claim: The template covers `readOnly: true` + `confirmed: true` (suggest reset) and `approved` (suggest new plan). But `readOnly: true` + `confirmed: false` is possible after a partial reset or crash and has no prescribed agent action.
- Evidence: Line 232: post-questions_pending states return `readOnly: true` with actual `confirmed` value. Lines 360-361: template only covers `confirmed: true` and `approved` paths.
- Impact: Agent encountering `readOnly: true, confirmed: false` has no prescribed action — may attempt `reset-confirmation` (could fail on state), tell user nothing can be done, or get stuck.
- Recommendation: Add explicit row: `readOnly: true + confirmed: false` → suggest `plan status` for diagnosis + `reset-confirmation` if state allows it.
- Suggested test: Agent simulation: plan in `ready_for_html` with `confirmed: false` → agent shows status and suggests recovery.
- Dedup key: readonly-true-confirmed-false-no-agent-guidance
- Sources: agent-ux:UX-06

### F-11: "Otro (personalizado)" option has value="" — agent must match by label but instruction says "número → value"

- Severity: P2
- Category: ux
- Status: valid
- File: target.md
- Lines: 157, 365-366, 372
- Claim: The "Otro" option has `value: ""`. The template says "Mapeo numérico: número → value de opción." An agent following this literally will pass `""` to `plan answer`, triggering the empty-required-choice warning.
- Evidence: Line 157: `"Otro (personalizado)", "value": ""`. Line 365: "número → value de opción. --value siempre texto final." Line 372 says "PROHIBIDO guardar 'Otro (personalizado)'" but doesn't explain how to detect it via the empty `value`.
- Impact: User selects "Otro" → agent maps to `value: ""` → `answer()` accepts with warning → field recorded empty instead of triggering custom follow-up.
- Recommendation: Add explicit instruction: "For 'Otro (personalizado)', match by `label` (value is empty). When detected, trigger `customFollowUp` and use custom text as `--value`." Consider using `value: "__custom__"` sentinel instead of empty string.
- Suggested test: Agent simulation: user selects option 9 (Otro) → agent detects via label, prompts customFollowUp, passes custom text to `plan answer`.
- Dedup key: otro-option-empty-value-label-matching-ambiguity
- Sources: agent-ux:UX-07

### F-12: confirmDecisions() must explicitly validate empty required choice fields at API level

- Severity: P2
- Category: state
- Status: valid
- File: target.md
- Lines: 250-251, 119-121
- Claim: `answer()` allows empty string for required choice fields (with warning), so `decisions.vertical` can be `""` after a successful answer. The plan does not specify whether `confirmDecisions()` re-runs `getEmptyFields()` or relies on the template to prevent calling confirm when `requiredFieldsComplete === false`.
- Evidence: Line 250-251: empty value accepted with warning. Line 383: template gates on `requiredFieldsComplete === true`. But if someone calls `confirmDecisions()` directly without the template, empty required choices could be confirmed. The guard is at template level, not API level.
- Impact: Bypassing the template (direct CLI call, external script) could confirm a plan with empty required fields.
- Recommendation: Add explicit invariant: "`confirmDecisions()` MUST reject (exit 19 `GSDC_QUESTIONS_UNRESOLVED`) if any required field is empty or a placeholder, using `getEmptyFields(decisions, REQUIRED_FIELDS)`."
- Suggested test: Answer all 6 required fields, one with empty string (gets warning). Call `confirmDecisions()`. Assert exit 19.
- Dedup key: confirm-decisions-empty-required-choice-validation
- Sources: modeler:M-06

### F-13: confirmo negation check is narrow — misses indirect negations

- Severity: P3
- Category: ux
- Status: valid
- File: templates/commands/canva-mockup.md
- Lines: 405
- Claim: The negation check only catches literal `"no confirmo"` but misses `"no lo confirmo"`, `"no quiero confirmo"`, etc.
- Evidence: Line 405: "Si el input contiene 'no confirmo' → rechazar." The regex `/\bconfirmo\b/i` matches these phrases, and the negation check misses the indirect forms. Line 589: "acepta frases naturales" sets expectation that partial negations would be caught.
- Impact: Low probability in practice, but contradicts the "frases naturales" promise.
- Recommendation: Expand negation check to `/\bno\s+.*\bconfirmo\b/i` or: if input contains "no" and matches `confirmo`, reject.
- Suggested test: Assert `"no lo confirmo"` → rejected. Assert `"claro que confirmo"` → accepted.
- Dedup key: confirmo-negation-narrow
- Sources: pragmatic:P3-02

### F-14: create() schema omits confirmedBy and source present in confirmDecisions()

- Severity: P3
- Category: docs
- Status: valid
- File: lib/plan-manager.js
- Lines: 100-115 (current create), target §7 lines 428-434
- Claim: Target §7 shows `create()` initializing `confirmation` without `confirmedBy` and `source`. Current `create()` (line 110-111) includes `confirmedBy: null` and `source: "chat"`. `confirmDecisions()` (line 219-220) writes these fields.
- Evidence: The proposal does not state whether to remove or keep these fields. They are absent at creation but appear after confirmation.
- Impact: Minor schema inconsistency. No functional break.
- Recommendation: Either keep `confirmedBy: null` and `source: "chat"` for consistency, or document their removal as a breaking change.
- Suggested test: After `create()`, read `decisions.json` and assert `confirmation` schema matches documentation.
- Dedup key: create-confirmation-schema-fields
- Sources: pragmatic:P3-01

### F-15: Lock inconsistency — questions() acquires lock but status() does not

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js
- Lines: 658-682 (current status), target §2 line 238
- Claim: `questions()` acquires lock before reading (line 238). Current `status()` does not acquire a lock. Both are read-only operations.
- Evidence: Both read plan files. `status()` only reads `plan.json` (atomic write), but the inconsistency confuses future maintainers about when locks are needed.
- Impact: Low risk — `plan.json` is written atomically. But the inconsistency could lead to incorrect lock policies in future code.
- Recommendation: Document lock policy: "All new functions acquire locks. Existing `status()` and `list()` are grandfathered. Future refactor should add locks uniformly."
- Suggested test: Not testable without concurrent access simulation. Document as known limitation.
- Dedup key: lock-inconsistency-questions-status
- Sources: pragmatic:P3-03

### F-16: Pre-implementation grep audit is manual and unmetered

- Severity: P3
- Category: integrity
- Status: valid
- File: (cross-cutting)
- Lines: target §Breaking Changes line 36
- Claim: The pre-implementation grep audit is a manual step with no verification in the test plan.
- Evidence: Line 36 requires `rg "exit.*15|GSDC_JSON_PARSE_ERROR|exitCode.*15|code.*15"` before coding. If forgotten, old references remain. No test or checklist entry validates completion.
- Impact: Stale references to exit code 15 could remain in templates or docs.
- Recommendation: Add verification step to the checklist: "After implementation, `rg 'GSDC_JSON_PARSE_ERROR' bin/` returns 0 hits for `findPlanDir`-related usage." Add as step 22 in verification.
- Suggested test: `rg "exitCode.*15" bin/gsd-canva.js` returns 0 hits after migration (except genuine JSON parse errors using retained exit 15).
- Dedup key: pre-impl-grep-audit-unmetered
- Sources: pragmatic:P3-04

### F-17: Section 9 cross-reference instruction is vague

- Severity: P3
- Category: docs
- Status: valid
- File: (cross-cutting)
- Lines: target §9 line 463
- Claim: `rg "mockup:pending" templates/ docs/ README.md → actualizar.` — the instruction "actualizar" is ambiguous. No state named `mockup:pending` exists (only `mockup:pending_approval` as substring match).
- Evidence: Valid states are `questions_pending`, `ready_for_html`, `pending_approval`, `approved`. The grep pattern may match `pending_approval` as substring. "Actualizar" doesn't say what to change to.
- Impact: Implementer may skip or make incorrect substitutions.
- Recommendation: Replace with: "Search for `mockup:pending` references and verify they reflect the current state machine. No state rename needed — verification step only." Or remove if not applicable.
- Suggested test: `rg "mockup:pending[^_]" templates/ docs/` returns 0 hits after implementation.
- Dedup key: section9-crossref-vague
- Sources: pragmatic:P3-05

### F-18: No lock timeout or stale lock cleanup mechanism documented

- Severity: P3
- Category: state
- Status: valid
- File: lib/lock-manager.js, lib/plan-manager.js
- Lines: 238, 256, 294
- Claim: Lock acquisition required for `questions()`, `answer()`, `resetConfirmation()` but no lock TTL, staleness detection, or crash cleanup documented.
- Evidence: Lines 238, 256, 294 specify lock acquire/release but no timeout. If process crashes (SIGKILL, OOM) while holding lock, all subsequent operations on that plan are blocked indefinitely.
- Impact: Stale lock files can make plans unrecoverable without manual intervention.
- Recommendation: Document lock manager's staleness policy. If `lock-manager.js` implements it, reference in proposal. If not, add as pre-condition.
- Suggested test: Acquire lock, simulate crash (no finally), call `answer()` — should succeed within reasonable time, not hang.
- Dedup key: lock-stale-cleanup-undocumented
- Sources: operator:OP-03

### F-19: resetConfirmation() crash between steps 4-5 leaves stale lock

- Severity: P3
- Category: state
- Status: valid
- File: lib/plan-manager.js (proposed `resetConfirmation()`)
- Lines: 293-301
- Claim: Recovery path assumes lock is not held. A crash between steps 4 and 5 means `finally` never runs → lock file remains → re-execution at step 1 (acquire lock) blocks.
- Evidence: Line 301: "Re-ejecutar procede desde paso 5." Step 7 is "Release lock en finally." Crash before step 7 = orphaned lock. This is a compound failure: inconsistent state + held lock.
- Impact: Plan unrecoverable without manual lock file deletion.
- Recommendation: Downstream of F-18. If lock manager implements stale lock cleanup with TTL, recovery works as documented. At minimum, document that manual lock deletion may be required.
- Suggested test: Simulate crash between steps 4-5 (lock left behind) → verify subsequent `resetConfirmation()` auto-recovers or provides clear error indicating manual cleanup.
- Dedup key: reset-confirmation-crash-lock-orphan
- Sources: operator:OP-04

### F-20: optionalAnswered naming conflates "prompted" with "answered with value"

- Severity: P3
- Category: docs
- Status: valid
- File: target.md
- Lines: 123, 258
- Claim: `optionalAnswered` suggests a non-empty answer, but semantics are "user was prompted and responded, including empty." `optionalAnswered.assets === true` does not mean assets has a value.
- Evidence: Line 123: "optionalAnswered[field] = true para toda respuesta a campo opcional (vacío o no)." An implementer reading the flag might assume a non-empty value exists.
- Impact: Misleading for maintainers. No functional break — `getEmptyFields` correctly skips flagged fields. But could cause confusion when extending the code.
- Recommendation: Rename to `optionalPrompted` or `optionalResolved` to convey "addressed, not necessarily filled." Update all references.
- Suggested test: After rename, all existing tests pass unchanged.
- Dedup key: optionalAnswered-naming-semantics
- Sources: operator:OP-05, modeler:M-03

### F-21: resetConfirmation() history dedup only checks last entry

- Severity: P3
- Category: state
- Status: uncertain
- File: lib/plan-manager.js (proposed `resetConfirmation()`)
- Lines: 298
- Claim: History dedup checks only the last entry for matching `action` + `from`. If a different action occurs between two identical reset-confirmation calls, the second is not deduped.
- Evidence: Line 298: "Si último entry ya tiene action: 'reset-confirmation' con mismo from → no duplicar." If history is `[..., {action:'reset-confirmation', from:'ready_for_html'}, {action:'submit-mockup'}, {action:'reset-confirmation', from:'ready_for_html'}]`, the second reset is NOT deduped.
- Impact: Minor — cosmetic history duplication. Doesn't affect state or correctness.
- Recommendation: Document that dedup is best-effort (last-entry only) and duplicates are possible, or scan backwards for matching action+from.
- Suggested test: Reset → submit (fails) → reset again → verify two reset-confirmation entries exist (confirming behavior is understood).
- Dedup key: reset-history-dedup-last-entry-only
- Sources: operator:OP-06

### F-22: ensureV2Fields() mutates in-memory in read-only paths — API view diverges from disk

- Severity: P3
- Category: state
- Status: valid
- File: target.md
- Lines: 96, 236
- Claim: `questions()` and `status()` call `ensureV2Fields()` which adds `optionalAnswered: {}` and `assets: ""` to the in-memory object but doesn't persist. JSON response includes fields not on disk.
- Evidence: Line 96: "Se llama al inicio de todas las funciones." Line 236: "modifica en memoria pero no escribe a disco." A consumer reading `decisions.json` from disk after calling `questions()` sees a different shape.
- Impact: Conceptual inconsistency between API view and disk view. Mitigated by "PROHIBIDO escribir directamente" rule. Risk is for future maintainers.
- Recommendation: Add a `_migratedFields` array to the response when migration occurred, or add a code comment at `ensureV2Fields()` call site.
- Suggested test: Load v1 fixture → `questions()` → response includes `optionalAnswered` and `assets` → disk file unchanged.
- Dedup key: ensurev2fields-read-path-mutation
- Sources: modeler:M-04

### F-23: Asymmetric reset behavior — optional cleared, required preserved — with no user-facing explanation

- Severity: P3
- Category: ux
- Status: valid
- File: target.md
- Lines: 292, 504
- Claim: `resetConfirmation()` preserves required field values but clears optional values and `optionalAnswered`. The template does not instruct the agent to inform the user about this asymmetry.
- Evidence: Line 292: "Campos requeridos se preservan." Line 412: "reset-confirmation → plan answer → nueva confirmación" — no mention of informing user. User might assume everything was preserved or everything was cleared.
- Impact: User confusion about what needs re-entry after reset.
- Recommendation: Add to template: after reset, inform user "Required answers preserved. Optional answers (assets) cleared. To change required fields, use `plan answer`."
- Suggested test: Agent simulation: all fields filled + confirmed → reset → agent message mentions optional answers were cleared.
- Dedup key: asymmetric-reset-no-user-explanation
- Sources: modeler:M-05, agent-ux:UX-09

### F-24: optionalAnswered not exposed in questions() output — agent cannot distinguish "declined" from "never asked"

- Severity: P3
- Category: ux
- Status: valid
- File: target.md
- Lines: 123, 218-223
- Claim: `questions()` returns `optionalPendingCount` but not which optional fields have `optionalAnswered[field] = true`. After `answer(assets, "")`, agent sees `optionalPendingCount: 0` but can't confirm assets was explicitly declined.
- Evidence: Line 123 defines `optionalAnswered` semantics. Lines 129-224 show `questions()` JSON output without any per-field answered status.
- Impact: If agent context resets and it re-enters the flow, it can't tell the user "you previously declined assets." Minor — count is correct, but prevents informative re-entry messaging.
- Recommendation: Add `"optionalAnsweredStatus": {"assets": true}` or `"answeredDeclined": ["assets"]` to `questions()` output.
- Suggested test: After `answer(assets, "")`, call `questions()` → output indicates assets was explicitly answered.
- Dedup key: optional-answered-not-exposed-in-questions-output
- Sources: agent-ux:UX-08

## Non-Issues Checked

- **Exit code 15 retention for JSON parse errors**: Exit 15 correctly retained for `GSDC_JSON_PARSE_ERROR` (actual corruption) while plan-not-found migrates to 24. Separation is clean.
- **Hash v1→v2 migration**: `NORMALIZE_V1` and `NORMALIZE_V2` are identical (NFC, case-sensitive). `confirmDecisions()` always writes v2. Dispatch in `resolveQuestions()`/`submitMockup()` handles v1 fallback. Migration is atomic. No invariant violation.
- **Placeholder detection `===` vs `includes()` fix**: Fixes pre-existing "Nodo" false positive. Breaking change documented. Test migration correct.
- **`ensureV2Fields()` read-only behavior**: Modifies in-memory only for read functions, persists on first mutation. No side-effect leakage. Intentional and documented.
- **`optionalAnswered` flag isolation**: Constrained to `OPTIONAL_FIELDS` only (line 258). Prevents accidental hiding of empty required fields.
- **`GSDC_MOCKUP_MISSING` rename**: Exit 20 only used by `submitMockup()`. No collision risk.
- **"Otro (personalizado)" handling**: Derived from `allowCustom` flag. `answer()` rejects literal "Otro" and numeric values. Custom values accepted. Template mandates follow-up. Complete.
- **`answer()` state validation order**: Acquire lock → read → validate state → `ensureV2Fields()` → validate confirmation → validate choice → write. Correct ordering.
- **`answer()` choice validation ordering**: Numeric rejection → "Otro" rejection → matching option → custom with allowCustom → non-custom rejection. Unambiguous.
- **`answer()` empty value for required choice**: Accepted with warning (not error). `requiredFieldsComplete` stays false. Agent re-asks. Sound soft-failure design.
- **`resetConfirmation()` idempotency**: No-op condition, history dedup, re-executable for partial failures. Well-designed.
- **Lock release in finally blocks**: `questions()`, `answer()`, `resetConfirmation()` all release in `finally`. Prevents lock leaks on exceptions.
- **`writeAtomicJson` atomicity**: Individual `answer()` calls are atomic. No partial-write risk.
- **`create()` initialization**: New plans get `assets`, `optionalAnswered`, `hashAlgorithm: v2` from creation. No migration needed for new plans.
- **CLI `--json` mode**: `handleSuccess()` wraps consistently. No double-wrap.
- **State machine completeness**: Transitions with `resetConfirmation` reverting to `questions_pending` are well-defined. `approved` is correctly terminal for reset.
- **confirmDecisions intermediate state**: After confirm but before resolve, `confirmed=true` + `state=questions_pending`. `answer()` blocks (exit 23), `questions()` returns readOnly, `resetConfirmation` can undo. Sound.
- **Error table catch-all row**: "Cualquier otro código → Detener flujo. Reportar error completo." Safe default.
- **Test 7 (template registration) compatibility**: Proposal does not modify template system. Unaffected.

## Residual Risks

- **`questions()` pending masking is the highest-impact risk**: Even with documentation, every new agent consumer must discover and handle the confirmed+pending=[] edge case. A runtime sentinel field would be more robust than documentation alone.
- **Lock manager behavior unverified**: Proposal depends on `lock-manager.js` for correctness under concurrent access. Staleness handling and deadlock prevention cannot be fully verified without reviewing its implementation.
- **Concurrent process access**: Lock serializes CLI calls but doesn't prevent two agent sessions against the same plan. Agent template has no awareness of concurrent modifications.
- **Direct file manipulation**: State machine assumes `decisions.json`/`plan.json` only modified through API. Direct editing creates uncovered states. The `pending: []` masking (F-01) makes this worse.
- **resetConfirmation from pending_approval**: Significant backward jump. If approver has seen mockup, resetting invalidates their review. No notification mechanism in the approval workflow.
- **Multi-field semantic mapping quality**: Relies entirely on agent's ability to map user language to field IDs. No structured mapping hints in the API. UX quality depends on agent implementation, not CLI design.
- **Concurrent mockup generation + reset**: If `mockup.html` is being written while `resetConfirmation()` executes, rename could race. Lock protects against CLI concurrency but not external processes.
- **New exit codes 24, 25, 26**: Not used by existing code. External monitoring flagging unrecognized exit codes would see new failure modes. Grep audit scope doesn't cover external tooling.
- **`resetConfirmation()` staleRenameFailed deferred to manual cleanup**: If mockup rename fails, old `mockup.html` remains. Future creation would overwrite, but filesystem space issues possible.
- **`ensureV2Fields()` called in 7 functions**: If a future function is added and the developer misses this convention, v1 plans could behave incorrectly. Maintenance risk.
