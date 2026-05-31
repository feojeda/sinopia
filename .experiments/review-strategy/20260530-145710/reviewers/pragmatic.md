# Review: pragmatic

## Summary

- Verdict: approve_with_changes
- Top risk: FIELD_REGISTRY definition omits `allowCustom` property, creating a contract gap between `questions()` output and `answer()` validation that an implementer must bridge without explicit guidance.
- Confidence: high

## Findings

### P2-01: FIELD_REGISTRY definition missing `allowCustom` for choice fields

- Severity: P2
- Category: cli-contract
- Status: valid
- File: target.md (Section 1, FIELD_REGISTRY)
- Lines: 54-91
- Claim: The FIELD_REGISTRY code snippet defines three `type: 'choice'` fields (`vertical`, `formato`, `cta`) without an `allowCustom` property.
- Evidence: The snippet at lines 54-87 shows `{ id: 'vertical', type: 'choice', options: [...] }` with no `allowCustom`. Yet `answer()` validation at line 253 reads "Si value no coincide con ninguna opción (case-insensitive) y el campo tiene allowCustom: true → aceptar (valor custom)." The `questions()` output at lines 155-158 includes `"allowCustom": true` for these fields. `answer()` must read `allowCustom` from FIELD_REGISTRY to enforce this rule.
- Impact: An implementer copying the FIELD_REGISTRY snippet verbatim would produce a registry without `allowCustom`. `answer()` would then reject all custom values for choice fields (exit 26), breaking the entire "Otro (personalizado)" flow. The agent would be unable to submit custom verticals, formats, or CTAs.
- Recommendation: Add `allowCustom: true` to the FIELD_REGISTRY entries for `vertical`, `formato`, and `cta` in the code snippet. Alternatively, add a note stating the property must be added and specifying which fields require it.
- Suggested test: `answer(planId, 'vertical', 'Restaurante Gourmet')` on a fresh plan — must succeed (custom value accepted via allowCustom), not exit 26.
- Dedup key: field-registry-missing-allow-custom

### P2-02: Template readOnly instructions don't cover `questions_pending` + `confirmed=true` crash recovery

- Severity: P2
- Category: ux
- Status: valid
- File: target.md (Section 6, canva-mockup.md replacement)
- Lines: 359-361
- Claim: The template's `readOnly` handling instructions only suggest actions for `ready_for_html`/`pending_approval` + confirmed, and for `approved` or later. The intermediate state `questions_pending` + `confirmed=true` (between confirm-decisions and resolve-questions) is not covered.
- Evidence: Line 359: "Si confirmed: true y estado es ready_for_html/pending_approval, sugiere reset-confirmation." Line 360: "Si approved o posterior, sugiere plan nuevo." Neither covers `status: "questions_pending"` with `confirmed: true`. The `questions()` contract at line 230 explicitly returns this combination (`readOnly: true, confirmed: true`).
- Impact: If a session crashes between `confirm-decisions` and `resolve-questions` (which the template calls together at step 6 line 404-405), the agent restarts, calls `plan questions`, sees `readOnly: true` + `confirmed: true` + `status: "questions_pending"`, and has no instruction for what to suggest. The user is stuck — the agent shows a summary but no actionable path.
- Recommendation: Add a clause to the template's readOnly handling: "Si confirmed: true y estado es questions_pending → sugerir ejecutar resolve-questions para completar la transición, o reset-confirmation para re-editar."
- Suggested test: Fixture with `questions_pending` + `confirmed=true` → call `plan questions --json` → verify agent template produces an actionable suggestion (not just a summary).
- Dedup key: template-read-only-questions-pending-confirmed

### P2-03: Existing test 2 (`'TODO: definir'` placeholder) will break with new exact-match semantics

- Severity: P2
- Category: testing
- Status: valid
- File: tests/plan.test.js (current code), target.md (Section 11)
- Lines: tests/plan.test.js:62-73, target.md:42
- Claim: The placeholder detection change from `includes()` to `===` (exact match) is a documented breaking change, but the plan does not call out that the existing test at `tests/plan.test.js:62` must be modified.
- Evidence: Current code at `tests/plan.test.js:62`: `decisions.paleta = 'TODO: definir';` followed by `confirmDecisions()` which is expected to throw `GSDC_QUESTIONS_UNRESOLVED` (line 72). The current `includes()` logic detects "TODO: definir" as a placeholder. The new `getEmptyFields()` at target.md:111 uses `upper === p` (exact match), so "TODO: DEFINIR" would NOT match "TODO". Verification step 18 (target.md:549) confirms: `"TODO: definir colores" → no placeholder.` The plan's test section lists new test cases but never states "update existing test 2 to use a plain 'TODO' value."
- Impact: An implementer who implements `getEmptyFields()` with `===` matching and runs existing tests will get a failing test at line 72 (`GSDC_QUESTIONS_UNRESOLVED` expected but confirmDecisions succeeds). They must diagnose that the placeholder value in the test needs to change. This is diagnosaable but wastes time and could be mistaken for an implementation error.
- Recommendation: Add an explicit note in Section 11 or the Breaking Changes section: "Update existing test 2 (plan.test.js:62) to use `'TODO'` instead of `'TODO: definir'` to match new exact-match placeholder semantics."
- Suggested test: After implementation, `npm test` passes with the modified test value.
- Dedup key: test-2-placeholder-includes-to-exact-break

### P3-01: `ensureV2Fields()` persistence for `status()` unspecified

- Severity: P3
- Category: docs
- Status: valid
- File: target.md (Section 1, Notes)
- Lines: 94, 561
- Claim: The notes say "ensureV2Fields() no persiste en questions() (read-only) — se persiste en primera mutación" but do not specify whether `status()` (also read-only) should persist.
- Evidence: Line 94 lists `status()` among functions that call `ensureV2Fields()`. Line 561 only exempts `questions()`. `status()` at `plan-manager.js:658-682` is read-only — it reads `plan.json` but does not read `decisions.json` directly. However, after this change, `status()` would presumably also display decisions data (since `questions()` returns decisions-aware info). If `status()` gains decisions reading, it would call `ensureV2Fields()`.
- Impact: An implementer must decide whether `status()` persists the v2 migration. If it does, calling `plan status` on a v1 plan silently modifies `decisions.json` on disk. If it doesn't, the behavior is consistent with `questions()` but undocumented. Either choice is defensible, but the ambiguity could lead to inconsistent implementations.
- Recommendation: Add `status()` to the explicit read-only non-persistence note alongside `questions()`: "`ensureV2Fields()` no persiste en `questions()` ni `status()` (read-only)."
- Suggested test: Fixture v1.1 (no `optionalAnswered`) → call `status()` → verify disk still lacks `optionalAnswered`.
- Dedup key: ensure-v2-fields-status-persistence-ambiguous

### P3-02: `optionalAnswered` scope should explicitly exclude required fields

- Severity: P3
- Category: state
- Status: valid
- File: target.md (Section 3, answer() behavior)
- Lines: 256
- Claim: The plan says "Campos opcionales: optionalAnswered[field] = true para toda respuesta" but does not explicitly state that this flag must only be set for fields in `OPTIONAL_FIELDS`.
- Evidence: Line 256 in the context of `answer()` behavior. If an implementer interprets "para toda respuesta" as "for every answer call regardless of field type," they would set `optionalAnswered['vertical'] = true` when answering a required field. `getEmptyFields()` at line 108 checks `if (optionalAnswered[field]) return false` before evaluating emptiness, which would then mask an empty required field.
- Impact: In practice, `getEmptyFields()` is called with `REQUIRED_FIELDS` or `OPTIONAL_FIELDS` as the `fieldList`. Required fields should never have `optionalAnswered` set, so the check passes through. But if the implementation is sloppy (setting the flag for all fields), an empty required field after `answer()` could be hidden from pending counts, allowing premature `requiredFieldsComplete: true`.
- Recommendation: Add an explicit guard: "Only set `optionalAnswered[field] = true` when `OPTIONAL_FIELDS.includes(field)`."
- Suggested test: `answer(planId, 'vertical', '')` on a fresh plan → verify `optionalAnswered` does NOT contain `vertical` key.
- Dedup key: optional-answered-scope-required-fields

### P3-03: Incomplete list of affected functions for exit code migration

- Severity: P3
- Category: docs
- Status: valid
- File: target.md (Breaking Changes section)
- Lines: 36
- Claim: The plan lists affected functions as "findPlanDir(), status(), confirmDecisions(), resolveQuestions(), submitMockup(), approveMockup()" but omits `transitionState()` and `deliver()`, which also call `findPlanDir()` and throw `GSDC_JSON_PARSE_ERROR` (exit 15).
- Evidence: `plan-manager.js:426` shows `transitionState()` calls `findPlanDir(planId)`. `plan-manager.js:430-433` throws `GSDC_JSON_PARSE_ERROR` exit 15 for missing plan.json. `plan-manager.js:541` shows `deliver()` calls `findPlanDir(planId)`. `plan-manager.js:544-548` throws exit 15. The grep audit would catch these, but the list is inaccurate. Additionally, `approveMockup()` is listed but does not exist as a standalone function — it's an action within `transitionState()`.
- Impact: The pre-implementation grep audit (`rg "exit.*15|..."`) acts as a safety net and would catch the real references. However, the misleading list could cause an implementer to focus on the wrong functions and miss the broader scope during initial code reading.
- Recommendation: Correct the list to: "findPlanDir(), status(), confirmDecisions(), resolveQuestions(), submitMockup(), transitionState(), deliver()". Remove `approveMockup()` (it's an action, not a function).
- Suggested test: After migration, `plan status --id 999` → exit 24 (not 15). `transitionState('999', 'approve-mockup')` → exit 24.
- Dedup key: affected-functions-list-incomplete-migration

### P3-04: handleError fallback migration scope limited to codes 15 and 19

- Severity: P3
- Category: cli-contract
- Status: valid
- File: target.md (Section 5)
- Lines: 314
- Claim: The plan says "Cambiar todos los err.exitCode || 15 y err.exitCode || 19 a err.exitCode || 1" but does not address other stale fallbacks in `bin/gsd-canva.js`.
- Evidence: `bin/gsd-canva.js:413` has `err.exitCode || 15` for `plan list`, `bin/gsd-canva.js:451` has `err.exitCode || 15` for `plan status`, `bin/gsd-canva.js:489` has `err.exitCode || 15` for `template register`. These are not mentioned in the plan but would also need changing to `|| 1`. The general principle stated is "Cualquier error sin exitCode explícito usa 1, no un code viejo," which implies all fallbacks should be `|| 1`, yet the explicit instruction only covers 15 and 19.
- Impact: An implementer who does a targeted find-replace of `|| 15` and `|| 19` would catch these. But the template register fallback at line 489 (`|| 15`) is not in a plan command — it could be overlooked if the implementer focuses only on the plan command group.
- Recommendation: Either (a) state "All `handleError` calls with `err.exitCode || <code>` should change to `err.exitCode || 1`" as a blanket rule, or (b) list every file:line to change.
- Suggested test: Inject an error without `exitCode` into each CLI command handler → verify exit code is 1 (not the old fallback).
- Dedup key: handle-error-fallback-scope-incomplete

### P3-05: `questions()` JSON contract doesn't show `filled` field object structure

- Severity: P3
- Category: docs
- Status: valid
- File: target.md (Section 2, questions() return)
- Lines: 127-222
- Claim: The questions() return JSON example shows the full `pending` array with field objects, but only shows `"filled": []` (empty). The structure of a filled field object is never specified.
- Evidence: Line 141 shows `"filled": []`. For a partially filled plan, some fields would move to `filled`. The implementer must infer what properties a filled field object has — likely `id`, `question`, `type`, `value`, and `required` — but this is not documented.
- Impact: An implementer might return different field shapes for `filled` vs `pending`, causing inconsistent rendering by the agent. For example, if `filled` objects lack `type`, the agent can't distinguish choice vs text for display.
- Recommendation: Add a filled field example to the JSON contract, e.g., `{"id": "vertical", "question": "...", "type": "choice", "value": "SaaS / Producto Digital", "required": true}`.
- Suggested test: Answer one field → call `questions()` → verify `filled[0]` has `id`, `question`, `type`, `value`, `required`.
- Dedup key: questions-filled-object-structure-unspecified

### P3-06: `resetConfirmation()` history dedup only inspects last entry

- Severity: P3
- Category: state
- Status: valid
- File: target.md (Section 4, resetConfirmation step 5)
- Lines: 296
- Claim: The dedup rule "Si último entry ya tiene action: 'reset-confirmation' con mismo from → no duplicar" only checks the last history entry.
- Evidence: Line 296. If the history is `[...entries, { action: 'reset-confirmation', from: 'ready_for_html' }, { action: 'answer', ... }, { action: 'reset-confirmation', from: 'pending_approval' }]`, and a crash-retry occurs, the check would compare against the last entry (`from: 'pending_approval'`), which is correct. But if the last entry is `{ action: 'resolve-questions' }` after a crash between steps 5 and 6, re-running reset would add a new `reset-confirmation` entry even though one exists earlier in history for the same `from` state. This creates duplicate entries in history.
- Impact: Minor — history would have redundant `reset-confirmation` entries after crash recovery. Does not affect state correctness. The plan.json history is append-only and informational.
- Recommendation: Accept as-is, or change dedup to "if any entry with action 'reset-confirmation' and same 'from' exists in the last N entries, skip." Current approach is pragmatically sufficient for a CLI tool.
- Suggested test: Create history with interleaved reset-confirmation entries → re-run reset → verify no duplicate for the same `from` in last position.
- Dedup key: reset-history-dedup-last-entry-only

## Non-Issues Checked

- **Hash migration v1→v2 atomicity**: `confirmDecisions()` always writes v2 label and v2 hash together (target.md:448). `resolveQuestions()` and `submitMockup()` dispatch on stored `hashAlgorithm`. Legacy v1 plans retain v1 hash until next confirm. Verified against `plan-manager.js:205-214` (current 6-field hash) — migration is correct.
- **Normalize function identity**: `NORMALIZE_V1` and `NORMALIZE_V2` are both NFC case-sensitive (target.md:433-434). Current code at `plan-manager.js:205,297,368` uses identical normalize. No hash breakage.
- **`questions()` never throws GSDC_INVALID_STATE**: Confirmed at target.md:233. All states return valid output (possibly `readOnly`). Error table at target.md:391 correctly notes this.
- **`resetConfirmation()` crash recovery**: Steps 4-5-6 ordering is documented (target.md:291-298). Recovery via re-execution is described (target.md:299). The intermediate state (decisions.json updated, plan.json not) is diagnosaable — `resetConfirmation()` re-runs successfully because the accepted states include the pre-crash state.
- **Exit code 20 rename**: `GSDC_ARTIFACT_MISSING` → `GSDC_MOCKUP_MISSING` at same exit code 20 (target.md:100,526). No collision. `submitMockup()` at `plan-manager.js:388-392` is the only caller.
- **Lock acquisition for `questions()`**: Read operation acquires exclusive lock (target.md:236). Acceptable for a single-user CLI tool. Lock released in `finally`.
- **`optionalAnswered` semantics for asset decline**: Setting the flag on empty-value answer is correct — `getEmptyFields()` at target.md:108 skips fields with `optionalAnswered[field] === true`, so `allQuestionsAnswered` becomes true after explicit decline.
- **"Otro (personalizado)" rejection**: `answer()` explicitly rejects the literal string "Otro (personalizado)" (target.md:251) before checking `allowCustom`. This prevents the UI affordance from leaking as a stored value.
- **`create()` hashAlgorithm**: New plans start with `sha256-decisions-v2` (target.md:428). Current code at `plan-manager.js:112` uses `sha256-decisions-v1`. Migration is clean — only legacy plans keep v1.
- **`ensureV2Fields()` lazy migration**: Only persists on first mutation (`answer()`, `resetConfirmation()`, `confirmDecisions()`), not on read-only calls. This is consistent — `questions()` at target.md:234 and implied for `status()`.

## Residual Risks

- **Test suite rewrite scope**: The plan adds ~30+ new test cases (target.md:461-512) to a file currently with 6 tests (198 lines). The existing tests use manual `fs.writeFileSync` to manipulate decisions.json (e.g., `tests/plan.test.js:65`), bypassing `answer()`. The new tests should use `answer()` instead. The plan doesn't specify whether existing tests 1-6 are kept, modified, or replaced. An implementer must decide the test migration strategy.
- **Agent template behavioral testing**: The "confirmo" parsing logic (target.md:402) and multi-field mapping rules (target.md:365-369) are agent behavior specified in a Markdown template. These are not CLI-testable — they depend on the AI agent correctly following the instructions. Verification step 19 (`"confirmo."` → accepted) can only be tested manually through agent interaction.
- **`status()` function enhancement scope**: The current `status()` at `plan-manager.js:658-682` does not read `decisions.json`. The plan says `ensureV2Fields()` is called at the start of `status()` (target.md:94), which implies `status()` gains decisions.json reading. This is a behavioral expansion not explicitly called out as a change to `status()`.
