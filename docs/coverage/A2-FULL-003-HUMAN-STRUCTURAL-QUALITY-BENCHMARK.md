# A2-FULL-003 — Human structural quality benchmark and OptiPlan target

## Purpose

This checkpoint makes the human A2 reference usable as a **structural production-quality benchmark** in addition to the existing KPI baseline.

It does not copy human hours into Planner Next and does not turn the human plan into a seed, lock, hard order or fixed block count. The human plan is a quality reference. OptiPlan must first produce a complete hard-valid day under the current canonical rules and then aim to **match or improve the human production geometry** with fewer avoidable blocks, moves, reentries, waits and participant presence.

No weighted aggregate score is introduced. Formal claims of `PARETO_BETTER` remain governed by `A2-FULL-002` and its versioned comparison/tolerance contract.

## Authority for reconstructing the human drawing

When human source documents differ, use the official precedence from the A2 Interpretation Master:

1. explicit operational clarifications;
2. `ENSAYO_A2_LV.pdf` — plan by spaces;
3. `ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf` — plan by participants;
4. visual inference only when non-contradictory.

Therefore resource/space geometry such as CAM1 and CAM2 block structure must be reconstructed from the **spaces plan**. The normalized participant reference remains authoritative for task identity/coverage and already certified KPI values, but participant timings must not override the spaces plan when counting physical resource blocks.

## Existing certified human KPI baseline

From `A2-FULL-001-HUMAN-REFERENCE-BASELINE.md`:

- 269 canonical productive obligations: 266 participant-linked + 3 technical;
- 18 explicit preparation occupations;
- 95 preparation minutes: 10 setup + 85 Totales round preparation;
- first canonical obligation: 09:00;
- last canonical obligation: 18:35;
- makespan: **575 minutes**;
- Estudio 7: first 11:15, last end 17:15, 285 productive minutes;
- Estudio 7 unauthorized gap: **0 minutes / 0 gaps**;
- Estudio 7 continuity ratio: **1.0**;
- aggregate participant presence: **7,585 minutes**;
- mean participant presence: **399.21 minutes**;
- median: **385 minutes**;
- P90: **515 minutes**;
- maximum: **545 minutes**;
- main-flow blocks: **4 total**, 2 Lucía + 2 José María;
- Sillón/Estrellas: **1 block per family**, 1 setup switch, 0 setup reentries;
- 3/3 anchored Reality Plató operations preserve adjacency;
- 2/2 joint groups synchronized;
- 1/1 technical chain contiguous;
- 9 paired Totales rounds plus one residual Totales 1 round.

P04/P05/P06/P08/P10 remain formally blocked where configuration/semantics required by the comparison contract are incomplete. The structural metrics below are therefore an **iteration and drawing benchmark**, not a shortcut around the formal quality contract.

## Human production geometry

### Estudio 7 and Vocal Coaches

The human main flow uses four Estudio 7 blocks: two Lucía and two José María. Each main block has a feeder cohort in the corresponding Caracola.

Per coach the human location pattern is approximately:

`Caracola → Estudio 7 → Caracola → Estudio 7`

That means:

- 4 location blocks per coach;
- 3 location changes;
- 2 reentries;
- the configured Caracola→Estudio 7 transition/preparation must be respected;
- Estudio 7 remains continuous outside authorized meal interruption.

This is a benchmark, not a formula. The official objective is the **minimum number of feasible blocks**. If OptiPlan can complete the whole day with one Caracola cohort followed by one Estudio 7 cohort per coach, that is structurally better than the human pattern.

### Plató 14 / CAM1

The spaces plan shows the physical CAM1 pattern:

`Recursos → Pasillo → Recursos`

Approximate human bands:

- Recursos: 10:00–12:00;
- Pasillo: 12:00–13:35;
- Recursos resumes from about 14:00, including the authorized operational meal gap without creating a new logical block, and finishes around 16:20.

Human CAM1 geometry:

- **3 physical blocks**;
- **2 location changes**;
- **1 reentry**;
- Pasillo: **1 compact block**;
- Recursos: **2 blocks**;
- Giratuto: **1 block**, independent of CAM1.

Corner Influencer, Corner Music, Corner Influencer + Music and Redes all belong to the same `P14-Recursos` operational state for this purpose. They must not be split into separate blocks merely by subtype because no setup change exists between them.

The preferred OptiPlan first alternative is even more compact: one Recursos band and one Pasillo band — **2 blocks / 1 move / 0 reentries** — whenever global hard viability and Future Feasibility permit it.

### Plató 15 / CAM2

The spaces plan shows:

`Croma → Estrellas/Sillón`

Approximate human bands:

- Croma: 09:30–13:20;
- CAM2 moves once to Estrellas/Sillón;
- one Sillón family block;
- 10-minute setup preparation;
- one Estrellas family block;
- no return to Croma.

Human CAM2 geometry:

- **2 physical blocks**;
- **1 location change**;
- **0 reentries**;
- Croma: **1 block**;
- Sillón: **1 family block**;
- Estrellas: **1 family block**;
- setup reentries: **0**.

This is the preferred structural target. A Croma→setup→Croma return is acceptable only when global feasibility actually requires it.

### Totales

The human plan behaves as a round-based production unit:

- 9 paired rounds where Totales 1 and Totales Coreo start together while both lanes remain active;
- 1 residual Totales 1 round after Coreo is exhausted;
- 17 explicit microphone-change preparations × 5 minutes;
- no interpretation of preparation gaps as extra productive task duration.

OptiPlan should preserve this round structure and avoid unnecessary exits/reentries around it.

### Meals and logical blocks

An authorized operational meal does **not** create a new logical block. Block counts must ignore authorized meal interruptions when the same operational state resumes afterwards.

## Constructive quality principle

For every homogeneous operational state, family or itinerant-resource location, the first constructive alternative should be the **most compact feasible one**:

1. attempt one logical block when the contract permits it;
2. minimize internal idle while preserving hard viability;
3. minimize location changes;
4. minimize reentries into an abandoned state;
5. split only when a hard authority or Future Feasibility requires the split;
6. never remove split alternatives merely because the compact alternative is preferred.

This principle is generic. It must not hardcode CAM1, CAM2, coach names, A2 task IDs or human hours.

## Structural comparison targets

| structure | human A2 | preferred OptiPlan target |
|---|---:|---:|
| Estudio 7 unauthorized gaps | 0 | **0** |
| Estudio 7 main blocks | 4 | **minimum feasible**, ≤4 when demonstrably viable |
| coach location blocks, each | 4 | **minimum feasible**, ideal 2 |
| coach location changes, each | 3 | ideal **1** |
| CAM1 blocks | **3** | ideal **2** |
| CAM1 moves | **2** | ideal **1** |
| CAM1 reentries | **1** | ideal **0** |
| Pasillo blocks | **1** | **1** |
| Giratuto blocks | **1** | **1** |
| CAM2 blocks | **2** | **2** |
| CAM2 moves | **1** | **1** |
| CAM2 reentries | **0** | **0** |
| Croma blocks | **1** | **1** if feasible |
| Sillón blocks | **1** | **1** |
| Estrellas blocks | **1** | **1** |
| setup reentries | **0** | **0** |
| makespan | 575 min | `<575` after complete hard-valid parity |
| participant aggregate presence | 7,585 min | `<7,585` after complete hard-valid parity |
| participant mean presence | 399.21 min | `<399.21` after complete hard-valid parity |
| participant P90 presence | 515 min | `<515` after complete hard-valid parity |
| participant max presence | 545 min | `<545` after complete hard-valid parity |

The ideal values are **search preferences, not universal hard constraints**. A split is legitimate when the complete-day proof requires it.

## Iteration drawing gate

Every structural Planner Next iteration should report, at minimum:

- complete/hard-valid status or deepest frontier while incomplete;
- CAM1 blocks / moves / reentries;
- CAM2 blocks / moves / reentries;
- block count per setup family;
- coach Caracola/Estudio 7 blocks / moves / reentries;
- Estudio 7 continuity and unauthorized gaps;
- operational meal viability;
- relevant participant presence/wait deltas when comparable;
- the first newly introduced or removed avoidable split;
- comparison against both the previous engine result and the human benchmark.

A higher frontier alone is not enough to call an iteration structurally better. If the frontier grows while avoidable fragmentation materially worsens, the regression must be causally justified or the change reconsidered.

## Human-reference caveats

The human reference is not a perfect hard-valid oracle under today's canonical configuration. Known ambiguities remain, including:

- simultaneous styling-out intervals where authoritative styling capacity is not fully resolved;
- a Plató 14 Recursos overlap between participant and spaces references.

These ambiguities must not be silently repaired. They are another reason to use the human plan as a benchmark of production quality, not as planner input or absolute hard truth.

## End objective

The Full A2 milestone is not merely to schedule 269 obligations. It is to produce a complete, deterministic, hard-valid plan whose production geometry is at least as coherent as the human A2 reference and, once the formal comparison contract is fully configured, to reach **Pareto improvement** rather than a weighted tradeoff: no material regression in a primary quality signal and at least one material improvement.

In practical terms, OptiPlan should complete the day while tending toward fewer blocks, fewer resource movements, fewer reentries, lower participant presence/wait and shorter makespan than the human plan — without sacrificing the hard rules, main-flow continuity, meals, transport, dependencies, setups or Future Feasibility that make the plan executable.
