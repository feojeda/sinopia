# Consolidated Review: docs/PROPOSAL_v1.2_antigravity_questions.md

## Verdict

reject_until_fixed

## Priority Findings

### P1-001: Custom choice handling is contradictory across Antigravity, CLI, and tests

- Category: contract_consistency
- Source reviewers: pragmatic, modeler, agent-ux
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: The proposal says Antigravity provides free text automatically and manual "Otro" / "Opcion personalizada" options must never be added, but the CLI human output example renders `Otro (personalizado)`, notes mention `customFollowUp`, and tests require `"Opcion personalizada"` to be rejected even though all choice fields have `allowCustom: true`.
- Evidence: Antigravity instructions forbid manual custom options; CLI human-mode example includes a custom option; `answer()` accepts non-option values when `allowCustom` is true; tests expect `"Opcion personalizada"` to fail.
- Impact: Implementers cannot satisfy all requirements. Agents may pass sentinel labels as real values, JSON and human CLI behavior may diverge, and tests can encode opposing contracts.
- Required change: Define one contract. Recommended: JSON options never include custom labels; Antigravity uses only JSON registry options plus its native free-text field; human CLI either removes "Otro" or explicitly treats it as fallback UI that prompts for final text and never passes the sentinel to `answer()`. Add reserved UI-label rejection before the `allowCustom` branch if sentinels must be rejected.
- Suggested test: Assert `plan questions --json` contains no "Otro", "Opcion personalizada", or empty custom sentinels. Add tests that real custom values succeed and reserved UI labels fail with a distinct reason such as `reserved_ui_label`.
- Dedup key: custom-choice-sentinel-contract

### P1-002: Durable confirmation can skip optional questions

- Category: state_contract
- Source reviewers: modeler, agent-ux
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: The user-facing flow requires asking `assets` before confirmation, and `allQuestionsAddressed` means required plus optional pending counts are zero. But `confirmDecisions()` validates only `REQUIRED_FIELDS`, so direct API/CLI callers can confirm before `optionalAnswered.assets === true`.
- Evidence: `confirmDecisions()` runs `getEmptyFields(decisions, REQUIRED_FIELDS)` before hashing; optional fields are only enforced by template instructions.
- Impact: A plan can be confirmed without the optional question ever being presented. `allQuestionsAddressed` becomes advisory while confirmation implies the decision set is complete.
- Required change: Either enforce optional-addressed checks in `confirmDecisions()` or explicitly redefine confirmation as requiring only required fields and weaken the template invariant. Recommended: reject confirmation while any optional field lacks `optionalAnswered[field] === true`, with a clear unresolved-optional error.
- Suggested test: Fill all six required fields, leave `assets === ""` and no `optionalAnswered.assets`, then call `confirmDecisions()`. Assert the chosen behavior explicitly.
- Dedup key: confirm-skips-optional-addressed

### P1-003: Reset and multi-file transitions lack a recovery protocol

- Category: operational_integrity
- Source reviewers: operator, pragmatic, modeler
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: The proposal describes multi-file updates as atomic, but commands update `plan.json`, `decisions.json`, and sometimes `mockup.html` separately. `resetConfirmation()` intentionally writes `plan.json` before `decisions.json`, creating a documented partial state of `questions_pending` plus `confirmed=true`.
- Evidence: Reset order writes plan, then decisions, then renames mockup. Recovery guidance depends on the last history entry being `reset-confirmation`.
- Impact: Crashes or I/O failures can strand locked decisions in an apparently editable state. If history is missing, duplicated, or reordered, `questions()` can suggest the wrong recovery path.
- Required change: Define cross-file recovery invariants for each transition. Make recovery independent of history: `phase=mockup`, `status=questions_pending`, and `confirmation.confirmed=true` should be recognized as a partial reset state and `resetConfirmation()` should continue idempotently. Avoid claiming cross-file atomicity unless a transaction marker/protocol is implemented.
- Suggested test: Fault-inject failure after each file write in `resetConfirmation()`, `confirmDecisions()`, `resolveQuestions()`, and `submitMockup()`. Re-run the command and verify it converges or returns a deterministic recovery action.
- Dedup key: cross-file-transition-recovery

### P1-004: Stale mockup detection is non-blocking

- Category: artifact_integrity
- Source reviewers: pragmatic, operator
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: If `resetConfirmation()` cannot rename `mockup.html`, the old file remains at the canonical path. `submitMockup()` only returns `staleMockupDetected: true` when mtime predates confirmation and does not fail.
- Evidence: The plan says rename failure does not throw and stale submit detection is "no error - hash mismatch is the safety net final".
- Impact: If required decisions are unchanged after reset/reconfirm, the old mockup can still correspond to the new hash context and advance toward approval despite being generated before the latest confirmation.
- Required change: Make stale mockup detection a blocking error, or persist a stale-artifact flag that blocks submit until a fresh mockup with mtime after `confirmedAt` exists. Stronger option: embed `decisionsHash` in generated mockup metadata and require it to match on submit.
- Suggested test: Simulate reset rename failure, reconfirm with unchanged required fields, and assert `submitMockup()` fails until a fresh `mockup.html` is written.
- Dedup key: stale-mockup-nonblocking

### P1-005: Confirmation parsing accepts contradictory or edit-intent responses

- Category: agent_ux
- Source reviewers: agent-ux
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: The proposal explicitly accepts `"claro que no, confirmo"` and likely accepts `"confirmo pero quiero cambiar"`, because only direct `"no confirmo"` / `"no lo confirmo"` is rejected.
- Evidence: Verification cases mark `"claro que no, confirmo"` as accepted; notes accept the trade-off that "confirmo pero quiero cambiar" passes.
- Impact: Users can express negation, hesitation, or change intent and still trigger confirmation/resolve.
- Required change: Treat `no` before confirmation in the same clause, and any edit/change intent in the same response, as non-confirmation requiring clarification. Do not run confirmation commands on contradictory input.
- Suggested test: Add negative cases for `"claro que no, confirmo"`, `"no, espera, confirmo luego"`, and `"confirmo pero quiero cambiar el CTA"`.
- Dedup key: contradictory-confirmation-parsing

### P1-006: Hash migration semantics need an explicit fixture matrix

- Category: migration_compatibility
- Source reviewers: pragmatic, modeler
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: The plan mixes support for already-confirmed v1 hashes with `confirmDecisions()` always writing v2, while `hashAlgorithm` is initialized to v2 on create, cleared on reset, and treated as fallback-v2 when empty.
- Evidence: Already-confirmed v1 plans must resolve with six fields; re-confirmed legacy plans must write seven-field v2 hashes; unconfirmed plans can have non-empty `hashAlgorithm` without a hash.
- Impact: Implementers may rewrite read-only legacy state, mislabel hashes, or treat an unconfirmed default algorithm as proof of a valid confirmation hash.
- Required change: Split migration paths: already-confirmed v1 plans are verified with v1 dispatch and not rewritten by read-only commands; unconfirmed or re-confirmed legacy plans are normalized and written as v2 by mutating commands. Define whether `hashAlgorithm` means "active stored hash algorithm" or "default future algorithm", then keep create/reset/confirm consistent.
- Suggested test: Add fixtures for confirmed v1 resolve/submit unchanged, unconfirmed v1 confirm-to-v2, create unconfirmed invariant, reset invariant, and confirmed v2 invariant.
- Dedup key: hash-v1-v2-migration-contract

## Secondary Findings

### P2-001: CLI exit fallback migration is too broad

- Category: cli_compatibility
- Source reviewers: pragmatic
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: The blanket requirement to change every `err.exitCode || <code>` to `err.exitCode || 1` can remove useful command-level fallback exit codes unless every domain error is guaranteed to carry `exitCode`.
- Evidence: Existing command groups may rely on fallback codes for lock timeout, invalid state, delivery missing, JSON parse, or permission failures.
- Impact: External callers can lose machine-readable behavior for legacy commands unrelated to this feature.
- Required change: Narrow the fallback change to new interactive commands, or audit every throw path and require domain errors to carry `code` and `exitCode`.
- Suggested test: Force errors without `exitCode` per command group and assert intended behavior.
- Dedup key: broad-cli-exit-fallback

### P2-002: `ensureV2Fields()` ordering is ambiguous

- Category: migration_ordering
- Source reviewers: modeler
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: The proposal says `ensureV2Fields()` runs after state validation, but `questions()` must not invalid-state throw and must inspect `decisions.confirmation.*` to classify read-only behavior.
- Evidence: Legacy plans can lack `confirmation`, so `questions()` needs the skeleton before confirmation access.
- Impact: Implementers may place migration too late and crash on legacy fixtures.
- Required change: State: read files, call `ensureV2Fields()` before any access to `decisions.confirmation.*`, then perform state validation or response classification.
- Suggested test: Legacy fixture without `confirmation` returns `confirmed:false`, `readOnly:false` from `questions()`.
- Dedup key: ensure-v2-before-confirmation-access

### P2-003: Post-reset UX cannot edit preserved required fields

- Category: agent_ux
- Source reviewers: agent-ux, operator
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: Correction flow says reset preserves required fields and tells users to use `plan answer` to change required fields, but `plan questions` will only show optional pending fields after reset.
- Evidence: Reset clears optionals and preserves required values; post-reset flow re-runs `plan questions`.
- Impact: A user asking to change CTA/copy/palette can be pushed back to confirmation without any prompt for the intended edit.
- Required change: Add explicit post-reset edit mode: ask which preserved required fields to change, call `plan answer` for those fields, then re-run `plan questions`. Or add a CLI mechanism to clear selected required fields.
- Suggested test: Confirm all fields, user asks "change CTA", reset, then verify CTA is requested/written before reconfirmation.
- Dedup key: post-reset-required-edit-flow

### P2-004: Text-field and optional decline handling need exact agent rules

- Category: agent_ux
- Source reviewers: agent-ux, pragmatic
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: Text `ask_question` payloads allow `options: []` or a placeholder option, and `assets` decline handling only says "si el usuario dice que no".
- Evidence: Placeholder examples could become selectable; decline phrases and mixed answers are not defined.
- Impact: Agents may save placeholder/example text, literal `"no"`, or leave `assets` pending.
- Required change: Specify the exact Antigravity payload for free-text questions. If empty options are supported, forbid placeholder options. Define decline parsing for optional assets (`no`, `ninguno`, `sin assets`, etc. -> empty string; mixed useful guidance saved).
- Suggested test: Mock text-field responses and assets decline/mixed cases.
- Dedup key: text-question-assets-decline-contract

### P2-005: Lock protocol is unspecified

- Category: concurrency
- Source reviewers: operator
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: Many commands "acquire lock", but the plan does not define lock path, atomic acquisition primitive, timeout, stale lock recovery, owner metadata, or whether existing commands share the same lock.
- Evidence: State guarantees depend on the lock, but lock behavior is not specified.
- Impact: Implementers can create weak check-then-create locks, deadlock after crashes, or leave older commands unprotected.
- Required change: Define a per-plan lock protocol and require all commands that read/write `plan.json`, `decisions.json`, or `mockup.html` to use it.
- Suggested test: Hold a plan lock and assert concurrent writers fail or wait deterministically; simulate stale lock recovery.
- Dedup key: unspecified-plan-lock-protocol

### P2-006: CLI empty-value and quoting behavior needs coverage

- Category: cli_testing
- Source reviewers: pragmatic
- File: docs/PROPOSAL_v1.2_antigravity_questions.md
- Lines: n/a
- Problem: Library behavior supports `--value ""`, spaces, quotes, and Unicode, but CLI parsing can regress these cases.
- Evidence: `assets` decline depends on empty string reaching `answer()` through the CLI.
- Impact: The intended optional-decline and required-empty warning flows can break at the CLI boundary.
- Required change: Add CLI-level tests for empty string, spaces, quotes, numeric strings, and accents.
- Suggested test: `plan answer --field assets --value "" --json` succeeds and sets `optionalAnsweredStatus.assets === true`; required empty value returns the warning.
- Dedup key: cli-value-quoting-empty-tests

## Non-Issues Confirmed

- The proposal correctly separates `GSDC_PLAN_NOT_FOUND` from missing artifacts inside an existing plan.
- The plan includes useful read-only response fields (`readOnly`, `editable`, `suggestedAction`) and avoids throwing `GSDC_INVALID_STATE` from `questions()`.
- Replacing hardcoded required-field arrays with `FIELD_REGISTRY` / `REQUIRED_FIELDS` is the right direction.
- Exact-match placeholder detection is documented as a breaking change and has test coverage listed.
- The plan includes a broad verification list and pre-implementation grep audits.

## Implementation Checklist

- [ ] Resolve the custom choice contract and remove or scope all manual "Otro" / custom sentinel language.
- [ ] Decide whether confirmation requires optional fields to be addressed, then enforce or document that contract consistently.
- [ ] Add explicit cross-file recovery rules for partial writes and remove unsupported "atomic" wording.
- [ ] Make stale mockup submission blocking or bind mockup artifacts to `decisionsHash`.
- [ ] Tighten confirmation parsing to reject contradiction and edit intent.
- [ ] Define v1/v2 hash migration paths and `hashAlgorithm` meaning with fixture-backed invariants.
- [ ] Narrow or justify the CLI exit fallback migration.
- [ ] Specify `ensureV2Fields()` ordering before any `confirmation.*` access.
- [ ] Add post-reset edit flow for preserved required fields.
- [ ] Specify free-text `ask_question` payloads and optional decline parsing.
- [ ] Specify the plan lock protocol.
- [ ] Add CLI tests for empty values, quoting, numeric strings, and Unicode.

## Residual Risks

- The review did not execute current tests or inspect implementation code in depth; it reviewed the proposal contract.
- Some findings depend on exact current CLI behavior and should be verified against `bin/gsd-canva.js` before implementation.
- Antigravity `ask_question` exact payload support is assumed from the proposal; the plan should be checked against the real tool schema before approval.
