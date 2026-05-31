# Repo Context Snapshot

Generated for the review-archetypes experiment.

## Target

- Frozen target: `.experiments/review-archetypes/input/target.md`
- Source target: `docs/PROPOSAL_v1.2_interactive_questions.md`
- SHA-256 at freeze time: `3a7affbb0478c1512de768c711c350ecba7981343f67a29a2935e68b16cd62f2`
- Target title at freeze time: `Plan: Preguntas Interactivas en /canva-mockup (Rev. 6)`

## Important Repo Files

- `bin/gsd-canva.js`: Commander CLI entrypoint. Existing `plan` subcommands include `create`, `confirm-decisions`, `resolve-questions`, `submit-mockup`, and lifecycle transitions.
- `lib/plan-manager.js`: Plan state machine, `decisions.json` initialization, confirmation hash, resolve/submit logic, and exported plan functions.
- `lib/lock-manager.js`: Existing lock implementation used by mutating plan operations.
- `templates/commands/canva-mockup.md`: Slash command template currently containing the older direct-`decisions.json` flow.
- `templates/plan-templates/preguntas.md`: Current questions/decisions template with the original six decision fields.
- `templates/plan-templates/roadmap_progreso.md`: Current roadmap template; contains an old `mockup:pending` reference.
- `README.md`: Public docs; contains old state references.
- `tests/plan.test.js`: Current plan lifecycle tests; many tests use fixed plan id `001`.

## Relevant Current Code Facts

- `create()` initializes `decisions.json` with six fields: `vertical`, `audiencia`, `formato`, `paleta`, `copy`, `cta`, plus `confirmation`.
- `confirmDecisions()` and `resolveQuestions()` validate the same six required fields and detect placeholders including `TODO`, `TBD`, `N/A`, `PENDIENTE`, `POR DEFINIR`, and bracket placeholders.
- The current hash payload covers only the six required fields.
- `resolveQuestions()` transitions from `mockup:questions_pending` to `mockup:ready_for_html`.
- `submitMockup()` requires `mockup:ready_for_html`, verifies `mockup.html` exists and has minimum size, rechecks the decisions hash, then transitions to `mockup:pending_approval`.
- Approval expects `mockup:pending_approval`.
- Existing JSON parsing in plan-manager uses direct `JSON.parse(fs.readFileSync(...))` in several functions.
- Existing mutating plan functions use the global lock through `lockManager.acquire()` and release in `finally`.
- `module.exports` from `lib/plan-manager.js` currently exports public plan functions, not internal helpers.

## Relevant Current Text Matches

- `README.md` contains `mockup:pending`.
- `templates/plan-templates/roadmap_progreso.md` contains `mockup:pending`.
- `docs/implementation_plans/approved_phase1_core.md` contains an old state chain with `mockup:pending`.
- `docs/implementation_plans/yield_gate_improvement.md` contains older direct-edit guidance for `decisions.json`.
- `docs/implementation_plans/walkthrough_yield_gate.md` documents the six-field `decisions.json` model.
- `templates/commands/canva-mockup.md` currently contains direct-edit instructions for `decisions.json`; the proposal intends to replace Section 2 completely.

## Experiment Constraints

- Reviewers must not edit repo files.
- Reviewers should treat `input/target.md` as the frozen proposal under review.
- Reviewers may inspect the repo to verify line references and compatibility claims.
- Findings should include file and line references, severity, evidence, recommendation, and confidence.
