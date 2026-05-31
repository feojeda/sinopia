# Review: agent-ux

## Summary

- Verdict: approve_with_changes
- Top risk: Agents self-confirming accidentally by using conversational filler containing the words "confirmo" or "confirmado" before the user has given explicit consent, locking the state machine.
- Confidence: high

## Findings

### P2-001: Conversational filler trigger risk for confirmation parsing

- Severity: P2
- Category: ux
- Status: valid
- File: docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md
- Lines: 357-365
- Claim: The system uses regex `/\b(confirmo|confirmado)\b/i` with direct negation checks to detect user confirmation.
- Evidence: The espanol grammar note details: "expresiones como 'claro que no, confirmo' son afirmaciones... trade-offs aceptados: 'confirmo pero quiero cambiar' pasa".
- Impact: If an agent outputs standard conversational status messages like *"Entiendo su solicitud. Le confirmo que estoy procesando la información..."* or *"Confirmo que he recibido los datos, procedo a validar..."*, the parser will register this as a positive confirmation and freeze the state machine, even if the user never approved the questions.
- Recommendation: Add a strict rule in `templates/agent-source/canva-mockup/instructions.md` instructing the agent to NEVER use the words "confirmo" or "confirmado" in any conversational response, status update, or explanation. The agent must reserve these exact words ONLY for the final confirmation prompt where they explicitly forward the user's consent.
- Suggested test: Run the mockup template through a mock conversation where the agent outputs filler text like "Confirmo que leí el ID", and verify it is NOT accidentally parsed as a confirmation lock.
- Dedup key: conversational-filler-confirmation-lock

### P2-002: Lack of custom option visibility in textual fallback questionnaires

- Severity: P2
- Category: ux
- Status: valid
- File: docs/PROPOSAL_v1.4_interactive_questions_agent_adapters.md
- Lines: 366-388
- Claim: For Codex, OpenCode, and Antigravity fallback, agents present the predefined choices from `FIELD_REGISTRY`.
- Evidence: The proposal mentions presenting the options of `plan questions` and converting numeric indices, but does not specify how the user is made aware that custom values are allowed.
- Impact: Since `vertical`, `formato`, and `cta` all allow custom values (`allowCustom: true`), if the agent only renders the enumerated list without mentioning that custom text is supported, users will believe they are strictly limited to the listed choices, severely restricting the utility of the framework.
- Recommendation: In the agent instructions for textual fallbacks, explicitly state that when presenting a choice list where `allowCustom` is true, the agent must append an advisory note like *"o escribe tu propia opción personalizada"*.
- Suggested test: Verify that the generated adapter files for Codex and OpenCode include instructions to notify the user about custom value support.
- Dedup key: custom-option-visibility-text-fallback

## Non-Issues Checked

- "One question at a time" flow in textual environments prevents cognitive overload and keeps the interaction clean and structured.
- Explaining the reset-confirmation procedure to the user in case of changes is clear and ergonomic.

## Residual Risks

- None.
