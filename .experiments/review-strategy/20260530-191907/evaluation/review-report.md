# Consolidated Review: docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md

## Verdict

approve_with_changes

## Priority Findings

None. No blocking P1 issues were identified in this review.

## Secondary Findings

### P2-001: Exit code inconsistency for plan not found error

- **Category**: cli-contract
- **Source reviewers**: pragmatic
- **File**: [lib/plan-manager.js](file:///Users/franciscoojeda/gsd-canva/lib/plan-manager.js)
- **Lines**: 27-31, 399
- **Problem**: The proposal introduces `GSDC_PLAN_NOT_FOUND` (exit 24) for missing plans, but the existing codebase uses `GSDC_JSON_PARSE_ERROR` (exit 15).
- **Evidence**: `findPlanDir` currently throws `GSDC_JSON_PARSE_ERROR` with exitCode `15` when a plan directory is not found on disk.
- **Impact**: Mismatched error codes and exit values in CLI commands during lookups.
- **Required change**: Update `findPlanDir` in `lib/plan-manager.js` to throw `GSDC_PLAN_NOT_FOUND` with exit code `24`.
- **Suggested test**: Execute any plan command with a non-existent plan ID and verify it exits with code 24.
- **Dedup key**: plan-not-found-exit-code-alignment

### P2-002: Graceful error handling for stale mockup renaming in resetConfirmation

- **Category**: state
- **Source reviewers**: operator
- **File**: [lib/plan-manager.js](file:///Users/franciscoojeda/gsd-canva/lib/plan-manager.js)
- **Lines**: 295-308
- **Problem**: Rename operations on stale mockups can throw unhandled exceptions if the file is locked, in use, or has restricted permissions.
- **Evidence**: The proposal states `staleRenameFailed: true si no se pudo` but does not detail wrapping `fs.renameSync` in a try-catch.
- **Impact**: Filesystem errors could completely abort the `resetConfirmation` transaction, leaving the state machine stuck.
- **Required change**: Wrap the file rename inside `resetConfirmation` in a `try-catch`. If it fails, set `staleRenameFailed: true` and proceed.
- **Suggested test**: Mock a file write/rename failure and verify `reset-confirmation` succeeds and reports `staleRenameFailed: true`.
- **Dedup key**: reset-confirmation-rename-try-catch

### P2-003: optionalAnswered flag not set on non-empty optional answers

- **Category**: state
- **Source reviewers**: modeler
- **File**: [docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md](file:///Users/franciscoojeda/gsd-canva/docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md)
- **Lines**: 285-288, 257-260
- **Problem**: `optionalAnswered.assets` is only explicitly defined as setting to `true` when answered with an empty string (declined).
- **Evidence**: "Opcional vacio: guardar `""` y marcar `optionalAnswered.assets = true`."
- **Impact**: If a user answers with a non-empty string, `optionalAnswered.assets` remains `false`/`undefined`, causing `allQuestionsAddressed` to remain `false` and raising false alerts.
- **Required change**: Mark `optionalAnswered.assets = true` whenever the field is answered, regardless of whether the input is empty or non-empty.
- **Suggested test**: Set a valid resource on `assets`, verify `optionalAnsweredStatus.assets` is `true`, and ensure `allQuestionsAddressed` becomes `true`.
- **Dedup key**: optional-answered-non-empty-handling

### P2-004: Conversational filler trigger risk for confirmation parsing

- **Category**: ux
- **Source reviewers**: agent-ux
- **File**: [docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md](file:///Users/franciscoojeda/gsd-canva/docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md)
- **Lines**: 357-365
- **Problem**: The confirmation regex parses any occurrence of "confirmo/confirmado" without conversational context, creating a risk for accidental self-confirmations by the agent.
- **Evidence**: The regex `/\b(confirmo|confirmado)\b/i` will match positive statements even if the agent is just outputting filler text.
- **Impact**: Agents saying *"Le confirmo que procedo a guardar..."* will accidentally lock the plan decisions without user approval.
- **Required change**: Explicitly instruct the agent in `instructions.md` never to use the words "confirmo" or "confirmado" in any status or filler message, reserving them solely for the final approval action.
- **Suggested test**: Assert that agents do not use these keywords during standard questionnaire interactions.
- **Dedup key**: conversational-filler-confirmation-lock

### P2-005: Lack of custom option visibility in textual fallback questionnaires

- **Category**: ux
- **Source reviewers**: agent-ux
- **File**: [docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md](file:///Users/franciscoojeda/gsd-canva/docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md)
- **Lines**: 366-388
- **Problem**: Users are not informed that custom options are allowed for fields in the textual questionnaire format.
- **Evidence**: Predefined choices are rendered without an indication that `allowCustom` is enabled.
- **Impact**: Users will assume they are limited strictly to the list options, ignoring the customization feature of the registry.
- **Required change**: Instruct the agent in fallback instructions to explicitly append a notice like *"o escribe tu propia opción personalizada"* for choice fields that allow custom inputs.
- **Suggested test**: Verify the rendered templates include instructions for announcing custom choice support.
- **Dedup key**: custom-option-visibility-text-fallback

### P3-001: Redundant choice validation logic when all choices allow custom values

- **Category**: cli-contract
- **Source reviewers**: pragmatic
- **File**: [docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md](file:///Users/franciscoojeda/gsd-canva/docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md)
- **Lines**: 85-162, 281-286
- **Problem**: `allowCustom` is set to `true` on all choice fields, leaving choice validation logic unexercised.
- **Evidence**: `vertical`, `formato`, and `cta` all have `allowCustom: true`.
- **Impact**: Custom choice validation pathways are not strictly verified in production unless there are fields with `allowCustom: false`.
- **Required change**: Ensure tests cover both `allowCustom: true` and `allowCustom: false` paths.
- **Suggested test**: Add a unit test verifying that setting `allowCustom: false` on a dummy field blocks unlisted values.
- **Dedup key**: choice-validation-allow-custom

### P3-002: Lock release coverage in read-only questions() API

- **Category**: state
- **Source reviewers**: operator
- **File**: [lib/plan-manager.js](file:///Users/franciscoojeda/gsd-canva/lib/plan-manager.js)
- **Lines**: 208-261
- **Problem**: Even read-only APIs must be completely safe from lock-leaks.
- **Evidence**: `questions()` acquires a lock but does not write to the file.
- **Impact**: If JSON parsing fails during read, failing to release the lock will freeze the workspace.
- **Required change**: Ensure `try-finally` is strictly used in `questions()` to release the lock in all error cases.
- **Suggested test**: Throw an error inside `questions()` and assert the lock is still released.
- **Dedup key**: questions-lock-release-finally

### P3-003: Typo in hash dispatch version fallback description

- **Category**: docs
- **Source reviewers**: modeler
- **File**: [docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md](file:///Users/franciscoojeda/gsd-canva/docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md)
- **Lines**: 327-333
- **Problem**: Potential confusion between "v2" and "vacío/undefined" fallbacks.
- **Evidence**: Multiple sections describe fallback behavior slightly differently.
- **Impact**: Implementation confusion regarding the default hash version.
- **Required change**: Document clearly that an empty/undefined stored version fallback to v2 schema (7 fields) for checks, but all new confirmations write the string `"sha256-decisions-v2"`.
- **Suggested test**: N/A (Documentation/Clarity only).
- **Dedup key**: hash-algorithm-fallback-clarity

## Non-Issues Confirmed

- The read-only behavior of `ensureQuestionFields()` in `questions()` and `status()` is a highly robust solution that prevents unwanted disk writes during simple read requests.
- Unicode normalization (NFC) correctly prevents hash mismatches due to minor formatting discrepancies.

## Implementation Checklist

- [ ] Align `findPlanDir`'s exception with the new `GSDC_PLAN_NOT_FOUND` (exit code 24).
- [ ] Add `try-catch` wrapper around `fs.renameSync` inside `resetConfirmation`.
- [ ] Set `optionalAnswered.assets = true` for both empty and non-empty answers to the `assets` question.
- [ ] Instruct the agent in `instructions.md` to avoid using conversational filler words like "confirmo/confirmado".
- [ ] Instruct the agent in textual fallbacks to announce custom options when `allowCustom` is enabled.
- [ ] Ensure that `questions()` API implements a strict `try-finally` lock release pattern.

## Residual Risks

- None.
