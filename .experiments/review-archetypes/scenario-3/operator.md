# Review: Operator

## Findings

- Severity: High
- File: `.experiments/review-archetypes/input/target.md`
- Line: 213
- Claim: The proposal says a `ready_for_html`/`pending_approval` plan with `mockup.html` renamed stale is still consistent because the missing valid mockup is detectable by `submitMockup()`.
- Evidence: In the current repo, `submitMockup()` only runs from `mockup:ready_for_html` and rejects any other state (`lib/plan-manager.js:357`). A plan left in `mockup:pending_approval` after `mockup.html` is renamed cannot be checked by `submitMockup()`. Worse, `approve-mockup` only validates state and does not verify `mockup.html` exists (`lib/plan-manager.js:445`), so the workflow can advance to `mockup:approved` with no valid mockup artifact.
- Recommendation: For `pending_approval`, make `reset-confirmation` transition back to `mockup:questions_pending` in the same recovery path, or add artifact validation to `approve-mockup`. The partial-failure story should not rely on `submitMockup()` for states where it cannot execute.
- Confidence: High

- Severity: High
- File: `.experiments/review-archetypes/input/target.md`
- Line: 208
- Claim: `reset-confirmation` accepts `mockup:pending_approval` and unlocks decisions for editing.
- Evidence: The proposal only specifies a state rollback for `ready_for_html` (`target.md:209`), not for `pending_approval`. But `answer()` is specified to reject any state other than `mockup:questions_pending` (`target.md:174`, `target.md:195`). Current state transitions put submitted mockups into `mockup:pending_approval` (`lib/plan-manager.js:395`), and the only existing transition out is approval (`lib/plan-manager.js:445`). If `reset-confirmation` leaves a `pending_approval` plan in place, decisions become unconfirmed but still uneditable through the new CLI.
- Recommendation: Define `reset-confirmation` to revert both `mockup:ready_for_html` and `mockup:pending_approval` to `mockup:questions_pending`, with a history event. Add a test for reset from `pending_approval` followed by `plan answer`.
- Confidence: High