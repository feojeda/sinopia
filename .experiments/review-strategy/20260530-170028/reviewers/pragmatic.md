# Pragmatic Review

## Findings

### P0 - Proposal has conflicting instructions for custom choice handling

**Evidence:** The plan says Antigravity provides free text automatically and the agent must never add manual "Otro"/"Opción personalizada" options. Later, CLI human output includes `9) Otro (personalizado)`, and Notes say `FIELD_REGISTRY` includes `customFollowUp` plus "Template Otro: detectar por label", while the shown registry has no `customFollowUp`.

**Impact:** Implementers can build incompatible behavior: one path rejects `"Opción personalizada"` with exit 26, another path expects the template to detect that label and follow up. This will produce flaky CLI/template behavior and tests that encode opposite requirements.

**Required change:** Remove or explicitly scope all manual "Otro"/`customFollowUp` language. If it is only for human CLI display, state that the human renderer maps "Otro" to a prompt and never passes that literal to `answer()`. Keep Antigravity template instructions free of manual custom options.

**Suggested test:** Add a CLI human-mode test that selecting/custom-entering a value stores the final custom text, and a JSON/template contract test asserting `questions().pending[].options` never contains "Otro", "Opción personalizada", or empty custom sentinel values.

### P0 - `confirmDecisions()` v2 migration conflicts with v1 fixture compatibility

**Evidence:** The plan states `confirmDecisions()` always computes v2 over 7 fields including `assets`, but also says v1.1 fixtures without `optionalAnswered`/`assets` migrate in `confirmDecisions()` and `resolve + submit` still pass for v1 hashes. Current code hashes only 6 fields and current tests mutate `decisions.json` directly.

**Impact:** A v1 plan confirmed before this change must keep resolving with the old 6-field hash, while a v1 plan newly confirmed after this change must persist `assets: ""`, `optionalAnswered: {}`, `hashAlgorithm: sha256-decisions-v2`, and a 7-field hash. Without a precise fixture matrix, migration will either break existing confirmed plans or silently leave mislabeled hashes.

**Required change:** Split the migration requirements into two explicit paths: already-confirmed v1 plans are read/verified with v1 dispatch and not rewritten by read-only commands; unconfirmed or re-confirmed legacy plans are normalized and written as v2 by mutating commands. Specify whether `status()` is read-only like `questions()` or persists migration.

**Suggested test:** Create two fixtures: confirmed v1 with 6-field hash resolves/submits unchanged, and unconfirmed v1 confirmed after upgrade writes `assets`, `optionalAnswered`, v2 label, and a matching 7-field hash.

### P1 - Exit-code fallback migration is too broad for current CLI compatibility

**Evidence:** The plan requires every `err.exitCode || <code>` in `bin/gsd-canva.js` to become `err.exitCode || 1`. Current CLI has command-specific fallback codes for init/upgrade/doctor/create/plan/list/status/template paths. The existing code uses these fallbacks when library errors do not set `exitCode`.

**Impact:** Existing external callers may rely on command-level defaults such as lock timeout 10, invalid state 13, delivery missing 14, JSON parse 15, or permission 16. A blanket fallback to 1 removes useful machine behavior unless every library path is guaranteed to set `exitCode`, which is not established by the proposal.

**Required change:** Either narrow the fallback change to the new interactive commands or add a precondition that every thrown domain error across `lib/installer`, `lib/plan-manager`, `lib/template-catalog`, and delivery paths carries `code` and `exitCode`. Document compatibility impact in Breaking Changes.

**Suggested test:** For each CLI command group, force an error without `exitCode` and assert the intended exit behavior. Also add a positive audit test that known domain errors still preserve their specific exit codes after the fallback change.

### P1 - `resetConfirmation()` operation order can leave stale `mockup.html` reusable

**Evidence:** The plan writes `plan.json`, then `decisions.json`, then renames `mockup.html`; if rename fails, it returns `staleRenameFailed: true` and does not throw. It also says `submitMockup()` only returns `staleMockupDetected: true` if mtime predates `confirmedAt`, not an error.

**Impact:** After a failed rename, an old `mockup.html` can remain at the canonical path. Because `submitMockup()` treats stale detection as non-fatal and relies on hash mismatch as the final safety net, a user can reset, keep required fields unchanged, reconfirm, and accidentally submit the old mockup with a matching new hash context.

**Required change:** Make stale mockup detection a blocking error in `submitMockup()` or require `resetConfirmation()` to mark a persistent stale flag in `plan.json`/`decisions.json` when rename fails. Clear that flag only after a new `mockup.html` with mtime after `confirmedAt` exists.

**Suggested test:** Simulate rename failure, reconfirm without changing required fields, then run `submitMockup()` against the old `mockup.html`; assert it fails until a fresh file is written.

### P1 - Missing-file and corrupt-JSON migration needs a reusable read helper for all plan artifacts

**Evidence:** The plan introduces `readJsonOrThrow()` with missing-file exit 25 and corrupt JSON exit 15. Current `confirmDecisions()`, `resolveQuestions()`, `submitMockup()`, `transitionState()`, `deliver()`, and `status()` do direct `existsSync`/`JSON.parse`, often mapping missing plan artifacts to `GSDC_JSON_PARSE_ERROR`.

**Impact:** If the helper is only applied to the named functions, behavior will remain inconsistent across existing plan commands. For example, `transitionState()` and `deliver()` still read `plan.json` and can report missing files as JSON parse errors, which undermines the new error taxonomy.

**Required change:** Define exactly which files and commands use `readJsonOrThrow()`: at minimum `plan.json` and `decisions.json` for all plan-specific commands except `list()`. Include `transitionState()` and `deliver()` or explicitly document why they are excluded.

**Suggested test:** For `status`, `confirm-decisions`, `resolve-questions`, `submit-mockup`, `approve-mockup`, and `deliver`, delete `plan.json` or `decisions.json` as applicable and assert exit 25, while corrupt JSON asserts exit 15.

### P2 - `answer()` ordering validates field before plan state but after reading missing artifacts

**Evidence:** The plan requires `answer()` to acquire lock, read `plan.json` + `decisions.json`, then validate `field ∈ ALL_FIELDS`, then validate state. It also requires invalid field on a ready plan to return exit 22 before state exit 13.

**Impact:** This ordering is good for invalid field vs invalid state, but it means invalid field on a malformed/missing-artifact plan returns artifact errors first. That may be acceptable, but it is not specified and can surprise agent recovery logic that expects invalid field to always be 22.

**Required change:** State the precedence clearly: plan existence/artifact readability errors happen before field validation; field validation happens before state and confirmation checks. Add this to the error table.

**Suggested test:** `answer(999, 'bad', 'x')` returns 24; `answer(existingPlanMissingDecisions, 'bad', 'x')` returns 25; `answer(readyForHtml, 'bad', 'x')` returns 22.

### P2 - Tests list is large but lacks CLI quoting and empty-value coverage

**Evidence:** `answer()` supports `--value ""`, required empty answers produce warnings, and optional `assets` can be declined with empty string. Commander currently uses `.requiredOption('--value <valor>')`, and shell/Commander behavior for empty values is easy to regress.

**Impact:** The library may accept empty strings while the CLI rejects, drops, or misparses them. That would break the required assets-decline path and the warning flow for required fields.

**Required change:** Add CLI-level tests, not only `planManager` tests, for `--value ""`, values with spaces/quotes, numeric strings, and Unicode accents. Verify stdout/stderr JSON shape and exit code.

**Suggested test:** Run `node bin/gsd-canva.js plan answer --id 001 --field assets --value "" --json` and assert success with `optionalAnsweredStatus.assets === true`; run required empty value and assert `warning`.

### P2 - `questions()` says it never throws invalid state, but still has hard error cases

**Evidence:** The proposal says `questions()` never throws `GSDC_INVALID_STATE`, while also listing plan-not-found, corrupt JSON, and missing artifact errors. It must read both `plan.json` and `decisions.json` under lock.

**Impact:** Template authors may overgeneralize "never throws" and not handle hard failures from `questions --json`. The included error table covers these, but the behavior section wording is ambiguous.

**Required change:** Reword to: `questions()` never throws `GSDC_INVALID_STATE`; it still throws filesystem/artifact/JSON errors. Ensure template instructions preserve the hard-error handling before inspecting `readOnly`.

**Suggested test:** CLI `plan questions --id 999 --json` exits 24, corrupt `decisions.json` exits 15, missing `decisions.json` exits 25, while weird plan states return `ok: true` with `readOnly: true`.

## Summary

The proposal is implementable against the current codebase, but it needs cleanup before approval. The highest-risk issues are contradictory custom-option instructions, under-specified hash migration, over-broad CLI exit fallback changes, and stale mockup reuse after reset failures. Tightening those points will make the implementation and test suite much more deterministic.
