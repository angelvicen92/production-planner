# A3-ORCH-REAL-001 — resource scarcity evidence

Base: `af69e4301c8cb584281385dbb7cc6f57b86eb40e`. Both 5k measurements used the canonical Full A2 runner with causal diagnostics and `PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000`.

| Signal | Baseline | Bottleneck availability |
| --- | --- | --- |
| Outcome / branches | `BRANCH_BUDGET_EXHAUSTED` / 5,000 | `BRANCH_BUDGET_EXHAUSTED` / 5,000 |
| First macro decision | setup group | resource task |
| Recorded macro decisions | 1 | 12 (10 resource/round/chain decisions before setup) |
| Deepest core / partial tasks | 19 / 44 | 19 / 44 |
| Deepest standalone frontier | 0 | 31 |
| Critical depth / rejection count | 19 / 159 | 19 / 159 |
| Structural rejections | feeder capacity 168; resource window 273; transition capacity 17; feeder prerequisite prefix capacity 2; prerequisite window 42 | unchanged |

The changed signal therefore passes the 5k causal gate: it reaches high-pressure, multi-resource macro decisions before setup and advances the standalone frontier from depth 0 to 31 without increasing the branch budget or worsening the measured rejection counts. An identical second 5k run produced byte-identical JSON Evidence.

The required 20k canonical run was started after the gate passed, but did not finish after 90 minutes of continuous CPU execution and was stopped to avoid an unbounded environment run. It produced no artifact and no 20k outcome is claimed. The canonical large JSON was restored after every completed benchmark and is intentionally not committed.
