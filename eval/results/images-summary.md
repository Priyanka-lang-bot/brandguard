# Image accuracy evaluation

Test set: `eval/images/`: 24 images, 20 with planted problems (46 problems), 4 clean. Target from the Round 2 commitment: catch ≥ 85%.

| Mode | Planted | Caught | Missed | False positives | Catch rate | Precision | ≥ 85%? |
|---|---|---|---|---|---|---|---|
| Measurement (positions from the image design) | 46 | 46 | 0 | 0 | 100.0% | 100.0% | yes |
| Vision | not executed: GEMINI_API_KEY is not set in this environment | | | | | | |

## measurement: by problem type

| Problem | Caught | Missed | False positives |
|---|---|---|---|
| alt_text | 9 | 0 | 0 |
| contrast | 7 | 0 | 0 |
| image_text | 9 | 0 | 0 |
| logo_missing | 4 | 0 | 0 |
| logo_recoloured | 3 | 0 | 0 |
| logo_retired | 3 | 0 | 0 |
| logo_stretched | 3 | 0 | 0 |
| palette | 8 | 0 | 0 |

Generated 2026-11-20T06:25:39.811Z by `npm run eval:images`.
