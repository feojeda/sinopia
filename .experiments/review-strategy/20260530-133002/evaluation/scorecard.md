# Scorecard

## Overall Summary

| Metric | Value |
|--------|-------|
| Total raw findings | 32 |
| Deduplicated findings | 23 |
| Duplicates removed | 9 |
| Valid high | 5 |
| Valid medium | 10 |
| Valid low | 7 |
| Weak/speculative | 1 |
| False positives | 0 |

## Per-Reviewer Scores

### pragmatic

| Metric | Value |
|--------|-------|
| **Score** | **15** |
| Score/finding | 2.14 |
| Valid high | 0 |
| Valid medium | 4 (D1, D2, D3, D6) |
| Valid low | 3 (D4, D5, D7) |
| Unique valid | 2 (D2, D4) |
| Duplicates | 0 |
| Weak | 0 |
| False positives | 0 |
| Best unique finding | D2: resetConfirmation() missing plan.json history entry |

### operator

| Metric | Value |
|--------|-------|
| **Score** | **16** |
| Score/finding | 2.29 |
| Valid high | 1 (D9) |
| Valid medium | 3 (D1, D8, D10) |
| Valid low | 3 (D7, D11, D12) |
| Unique valid | 3 (D8, D11, D12) |
| Duplicates | 2 (D1, D7) |
| Weak | 0 |
| False positives | 0 |
| Best unique finding | D8: resetConfirmation() idempotency guard ambiguity |

### modeler

| Metric | Value |
|--------|-------|
| **Score** | **19** |
| Score/finding | 1.90 |
| Valid high | 2 (D9, D13) |
| Valid medium | 4 (D3, D6, D10, D16) |
| Valid low | 3 (D5, D14, D15) |
| Unique valid | 4 (D13, D14, D15, D16) |
| Duplicates | 5 (D3, D5, D6, D9, D10) |
| Weak | 1 (D17) |
| False positives | 0 |
| Best unique finding | D13: submitMockup() hash v1→v2 migration gap |

### agent-ux

| Metric | Value |
|--------|-------|
| **Score** | **26** |
| Score/finding | 3.25 |
| Valid high | 2 (D19, D21) |
| Valid medium | 4 (D18, D20, D22, D23) |
| Valid low | 1 (D5) |
| Unique valid | 6 (D18, D19, D20, D21, D22, D23) |
| Duplicates | 1 (D5) |
| Weak | 0 |
| False positives | 0 |
| Best unique finding | D21: reset-confirmation destroys mockup without user warning |

## Rankings

| Rank | Reviewer | Score | Efficiency | Unique | Noise |
|------|----------|-------|------------|--------|-------|
| 1 | agent-ux | 26 | 3.25 | 6 | 12.5% |
| 2 | modeler | 19 | 1.90 | 4 | 60.0% |
| 3 | operator | 16 | 2.29 | 3 | 28.6% |
| 4 | pragmatic | 15 | 2.14 | 2 | 0.0% |

## Noise Summary

| Reviewer | Duplicates | Weak | False Pos | Noise % |
|----------|-----------|------|-----------|---------|
| pragmatic | 0 | 0 | 0 | 0.0% |
| operator | 2 | 0 | 0 | 28.6% |
| modeler | 5 | 1 | 0 | 60.0% |
| agent-ux | 1 | 0 | 0 | 12.5% |

## Coverage Analysis

| Finding | pragmatic | operator | modeler | agent-ux |
|---------|-----------|----------|---------|----------|
| D1 (exit code collision) | **yes** | yes | — | — |
| D2 (missing history) | **yes** | — | — | — |
| D3 (no field registry) | **yes** | — | yes | — |
| D4 (hashAlgorithm omission) | **yes** | — | — | — |
| D5 (section numbering) | **yes** | — | yes | yes |
| D6 (breaking change exit 15→24) | **yes** | — | yes | — |
| D7 (concurrent test fragile) | **yes** | yes | — | — |
| D8 (idempotency guard) | — | **yes** | — | — |
| D9 (optionalAnswered not cleared) | — | **yes** | yes | — |
| D10 (questions rejects non-pending) | — | **yes** | yes | yes |
| D11 (create v1 marker) | — | **yes** | — | — |
| D12 (answer no timestamp) | — | **yes** | — | — |
| D13 (submitMockup hash migration) | — | — | **yes** | — |
| D14 (mockup rename failure) | — | — | **yes** | — |
| D15 (planState format) | — | — | **yes** | — |
| D16 (placeholder substring) | — | — | **yes** | — |
| D17 (answer accepts placeholders) | — | — | weak | — |
| D18 (Otro missing from JSON) | — | — | — | **yes** |
| D19 (confirmation parsing vague) | — | — | — | **yes** |
| D20 (exit 21 missing from table) | — | — | — | **yes** |
| D21 (mockup destroyed no warning) | — | — | — | **yes** |
| D22 (answer omits requiredFieldsComplete) | — | — | — | **yes** |
| D23 (context extraction ambiguous) | — | — | — | **yes** |

**Coverage stats**: 10/23 findings found by exactly 1 reviewer. 5/23 found by 2+. 0 false positives across all reviewers.
