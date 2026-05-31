# Review Archetypes Experiment Scorecard

| Scenario | Agents | Valid High | Valid Medium | Valid Low | Unique Valid | Duplicates | Weak | False Positives | Score | Score/Agent |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Scenario 1 | 3 | 2 | 4 | 0 | 6 | 3 | 0 | 0 | 23 | 7.67 |
| Scenario 2 | 4 | 1 | 6 | 1 | 8 | 2 | 0 | 0 | 30 | 7.50 |
| Scenario 3 | 6 | 2 | 6 | 2 | 10 | 7 | 0 | 0 | 33 | 5.50 |

## Recommendation

Use Scenario 2 as the default configuration: pragmatic, operator, modeler, and agent-ux.

Scenario 2 produced the best quality/cost balance. Scenario 3 had the highest raw score, but its score per agent dropped because the added agents mostly duplicated the same `reset-confirmation` / `pending_approval` defect.
