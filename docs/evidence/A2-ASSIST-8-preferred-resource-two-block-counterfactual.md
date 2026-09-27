# A2 ASSIST-8 — two-block preferred-resource counterfactual

- Base: `7402ccde734fc79a8e1529c18050fc872c9c56b9` (`#1049`).
- Command: `npm run benchmark:planner-next:a2-assist-8`.
- Result: **STOP / inconclusive counterfactual**. The benchmark remained at 65/266 and produced no P15 proposal.

## Attempted counterfactual

A local, general prototype kept one-block geometries first and added a second tier containing exactly two anonymous, non-overlapping resource-task blocks. It built temporal slots before nominal matching, retained the existing future/meal-aware bipartite matching, enabled the tier only for `presencePreference=PREFERRED`, and ordered it by block count, presence span, idle, then canonical temporal signature. Focal tests covered the two-block-only witness, one-block precedence, no relaxation of `REQUIRED`, and input-order invariance.

## Causal result

The representative run never entered the two-block tier:

| blockCount | complete candidates attempted | terminal result |
|---:|---:|---|
| 1 | 91 | `PRUNE` |
| 2 | 0 | `NOT_CHECKED` |

Consequently there is no first two-block candidate, no two-block intervals, and no C01 nominal position to report. This is not evidence that two blocks are infeasible; it is evidence that strict exhaustive ordering of all one-block continuations prevents the requested counterfactual from being observed within the unchanged execution envelope. The first exact cause remains `MACRO_CANDIDATES_EXHAUSTED` at macro depth 0 for the preferred-resource unit, after 19 core and 28,072 standalone branches in this instrumented run.

Per the gate, the prototype was discarded: no N-block generalization, budget increase, or product-rule change is retained. The authoritative A2 Evidence file remains unchanged.
