# Counter-Arguments for Disputed P1s

This document provides the author's defense of two P1 findings from a previous review that were NOT fixed in Rev. 17. Reviewers should evaluate whether these arguments are valid.

---

## P1-002: confirmDecisions should validate optional fields

**Previous reviewer's claim**: `confirmDecisions()` should reject if optional fields were not addressed. The proposal's `confirmDecisions()` only validates required fields, allowing confirmation with optional fields unanswered.

**Author's arguments for keeping current design**:

1. **Separation of layers**: The CLI is a generic API. Whether optionals are mandatory for confirmation is a **UX policy**, not a data invariant. The template enforces it; the API should not couple to a specific UI policy.

2. **`allQuestionsAddressed` is advisory by design**: The field exists for the template to use as a gate. If `confirmDecisions()` also validates it, the field becomes redundant with the API guard.

3. **Legitimate use case**: An automated script that fills required fields and confirms without asking about assets is a valid API usage. Forcing optional addressing in the CLI breaks this flexibility.

4. **The template already protects**: The flow says "if `requiredFieldsComplete === true` AND `optionalPendingCount > 0` → ask about assets". If the agent follows the template, the case never occurs. If it doesn't, it's an agent bug, not an API bug.

5. **Analogy with `answer()`**: `answer()` accepts empty required with warning (not error). The philosophy is "accept what comes, warn if something seems off". Adding optional validation to `confirmDecisions()` changes the API philosophy.

**Counter-proposal**: Add `warning: "optional_fields_not_addressed"` in `confirmDecisions()` when `optionalAnswered` doesn't cover all optionals. Same pattern as `answer()` with empty values — advisory, not blocking.

---

## P1-005: "claro que no, confirmo" accepted as confirmation

**Previous reviewer's claim**: `"claro que no, confirmo"` should be rejected because "no" expresses negation.

**Author's arguments for keeping current design**:

1. **Spanish semantics**: "Claro que no, confirmo" is an **affirmation**. The "no" negates an implicit prior clause ("¿no vas a confirmar?"), not the confirmation itself. It's equivalent to "of course I confirm". Rejecting it would be a false negative that confuses Spanish-speaking users.

2. **Real usage examples**:
   - "¿No vas a confirmar?" → "claro que no, confirmo" = YES I confirm
   - "¿Estás seguro?" → "no, confirmo" = YES I confirm (no = I'm not doubting)
   - "¿Todavía no confirmas?" → "no, ya confirmo" = YES I confirm

3. **Explicit trade-off**: The proposal already documented that "confirmo pero quiero cambiar" passes as an accepted trade-off. The same principle applies: the regex detects the **confirmation word**, not sentiment. The complexity of NLP to distinguish "no" as negation of confirmation vs "no" as another clause is not justified for a CLI tool.

4. **Escape hatch exists**: If user confirms by error, `reset-confirmation` undoes everything. It's not irreversible.

5. **Precedent**: Systems like `git commit` accept any commit message. `npm publish` requires `--yes` flag but doesn't analyze context. A CLI shouldn't need NLP.

**Counter-proposal**: Keep current regex. Add explicit note: "Parsing detects presence of 'confirmo/confirmado' word, not context semantics. To undo a confirmation, use reset-confirmation."
