# Accuracy evaluation

Dataset: `eval/dataset.json`: 59 posts, 64 planted errors, 8 clean posts. Fact dates evaluated as of 2026-11-19.

| Mode | Posts | Expected | Actual | TP | FP | FN | Precision | Recall | Grounding-filter rejection |
|---|---|---|---|---|---|---|---|---|---|
| Rule checks only | 59 | 64 | 45 | 45 | 0 | 19 | 100.0% | 70.3% | n/a |
| Rules + AI | not executed: GEMINI_API_KEY is not set in this environment | | | | | | | | |

## Rule checks only: by category

| Category | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|
| accessibility | 5 | 0 | 0 | 100.0% | 100.0% |
| claims | 12 | 0 | 0 | 100.0% | 100.0% |
| facts_prices | 0 | 0 | 10 | — | 0.0% |
| outdated_fact | 0 | 0 | 3 | — | 0.0% |
| product_name | 9 | 0 | 0 | 100.0% | 100.0% |
| terminology | 9 | 0 | 0 | 100.0% | 100.0% |
| tone | 10 | 0 | 2 | 100.0% | 83.3% |
| unreleased | 0 | 0 | 4 | — | 0.0% |

Generated 2026-11-19T03:57:07.802Z by `npm run eval`.
