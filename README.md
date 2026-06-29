# Production Planner

Proyecto conectado a GitHub y gestionado con Codex.

## Cómo actualizar Replit desde GitHub

Después de hacer merge en GitHub, hay que ejecutar `git pull` en Replit para traer los cambios más recientes.

## i18n (preparación)

La app inicializa i18n en `client/src/i18n/index.ts` con español (`es`) por defecto y fallback a inglés (`en`).

Para probar un cambio de idioma manualmente desde consola del navegador (sin selector UI todavía):

```js
import('/src/i18n/language.ts').then(({ setLanguage }) => setLanguage('en'))
```

## Historial de cambios Codex

- ID 001 — 2026-05-26 18:33 — Auditoría base, tests y trazabilidad del proyecto
- ID 002 — 2026-05-26 18:46 — Auditoría y cierre integral de RLS en tablas públicas Supabase
- ID 003 — 2026-05-30 16:21 — Auditoría profunda del motor V3, rutas reales y falsos negativos
- ID 004 — 2026-05-30 18:05 — Benchmark operativo del motor V3 y escenarios críticos de planificación
- ID 005 — 2026-05-30 19:20 — Backtracking limitado para evitar falsos negativos greedy en Motor V3
- ID 006 — 2026-05-30 20:05 — Diagnóstico estructurado de blockers y activación real de backtracking en Motor V3
- ID 007 — 2026-05-30 20:45 — Evaluación comparativa de ramas y selección de mejor solución operativa en Motor V3
- ID 008 — 2026-05-30 21:25 — Dataset operativo sintético realista y stress benchmark del Motor V3
- ID 009 — 2026-05-30 22:10 — Priorización operativa de talents restrictivos y continuidad de coaches/feeders en Motor V3
- ID 010 — 2026-05-30 23:05 — Vecindarios operativos acotados para mejorar planes completos en Motor V3
- ID 011 — 2026-05-30 23:40 — Alineación de scoring y métricas para validar mejoras reales del Motor V3
- ID 012 — 2026-05-30 23:55 — Escenario realista anonimizado tipo La Voz para validar inteligencia operativa del Motor V3
- ID 013 — 2026-05-30 23:59 — Vecindarios feeder-aware para Main Stage, coaches y talents restrictivos en Motor V3
- ID 014 — 2026-05-30 23:59 — Búsqueda local de profundidad 2 para encadenar vecindarios feeder-aware en Motor V3
- ID 015 — 2026-05-30 23:59 — CP-SAT pilot para subproblema Main Stage + feeders en Motor V3
- ID 016 — 2026-05-30 23:59 — Segmentación CP-SAT por bloques críticos de Main Stage en Motor V3
- ID 017 — 2026-05-30 23:59 — Diagnóstico operativo de recursos compuestos en Motor V3 sin cambios DB
- ID 018 — 2026-05-30 23:59 — Modelo DB aditivo de resource bundles y componentes
- ID 019 — 2026-05-30 23:59 — Resource bundles como señal soft no vinculante en Motor V3
- ID 020 — 2026-05-31 00:20 — Validador de resource bundles y contrato de fiabilidad para scoring soft
- ID 021 — 2026-05-31 00:40 — Motor Run Diagnostics API y persistencia ligera de metadata
- ID 022 — 2026-05-31 01:05 — Panel Admin de diagnóstico del motor por plan
- ID 023 — 2026-05-31 01:25 — Export/copy de diagnóstico del motor para revisión externa
- ID 024 — 2026-05-31 01:45 — Guía de validación real del motor y checklist de prueba en app
- ID 025 — 2026-05-31 02:05 — Optimización de scripts rápidos/completos de tests y benchmarks del Motor V3



- ID 139 — 2026-06-27 14:52 — ORC Search Space Selection Engine v1
- ID 151 — 2026-06-27 18:54 — ORC Production Objective Evaluator v1
- ID 152 — 2026-06-27 19:05 — ORC Evaluation-Guided Search v1
- ID 153 — 2026-06-27 19:50 — ORC Online Search Learning v1
- ID 154 — 2026-06-27 20:03 — ORC State Equivalence & Transposition Table v1
- ID 155 — 2026-06-27 20:23 — ORC Dominance Pruning v1
- ID 156 — 2026-06-27 20:41 — ORC Operational Criticality Model v1
- ID 157 — 2026-06-27 20:54 — ORC Criticality-Driven Reasoning Budget v1

- ID 173 — 2026-06-28 11:14 CEST — ORC Improvement-Driven Search Calibration v1
- ID 174 — 2026-06-28 12:05 CEST — ORC Evidence-Driven Optimization Cycle v1
- ID 175 — 2026-06-28 12:20 CEST — ORC Evidence-Gated Development Workflow v1
- ID 176 — 2026-06-28 12:39 CEST — ORC Benchmark CLI Operational Evidence v1
- ID 177 — 2026-06-28 13:58 CEST — ORC Opportunity Cost Estimator v1
- ID 179 — 2026-06-28 15:18 CEST — ORC Recovery Potential Estimator v1
- ID 180 — 2026-06-28 15:27 CEST — ORC Operational Reasoning Score v1
- ID 183 — 2026-06-28 17:15 CEST — ORC Operational Trade-off Analyzer v1
- ID 181 — 2026-06-28 15:56 CEST — ORC Goal-Oriented Search v1
- ID 182 — 2026-06-28 16:19 CEST — ORC Progressive Commitment Strategy v1
- ID 186 — 2026-06-28 20:11 CEST — ORC Active V4 Bridge v1


### ORC Benchmark CLI Operational Evidence (ID 176)

`npm run benchmark:orc` is the official ORC operational evidence entry point. It runs the Production Scenario Benchmark Suite, Evidence Optimization Cycle, Evidence Gate, and prints a stable JSON report with scenario summary, operational delta summary, authorization counts, `planningInfluence: "none"`, and the next action recommendation only when Evidence Gate authorization exists.

Use `npm run benchmark:orc:legacy` to execute the previous shadow search benchmark entry point. The operational benchmark is read-only and does not write files or persist results.


### ORC Progressive Commitment Strategy (ID 182)

The ORC SEE now computes deterministic Progressive Commitment Scores from existing ORS, Dependency Chain Flow, Operational Goal, Opportunity Cost, and Recovery Potential signals. Stable decisions are used only to organize exploration, rank search effort, and estimate avoided reconsiderations; every decision remains reversible until the Commit Engine. Commitment scores, contributing factors, stability reasons, and no-planning-influence metadata are recorded as Evidence. The operational benchmark report exposes tracking flags for decision stability, reconsiderations avoided, computational cost impact, and final-solution correlation while keeping `planningInfluence: "none"`.

### ORC Goal-Oriented Search (ID 181)

The ORC SEE now builds deterministic Operational Goals from existing ORS and Dependency Chain Flow signals, associates opportunities with coherent goal groups, and records generated goals, associated opportunities, aggregate ORS, and prioritization explanations as Evidence. Strategy candidate generation can order search spaces by goal coherence and annotates candidates with goal metadata without changing the Decision Engine, official planning, persistence, API, UI, or V4 behavior. The operational benchmark report exposes tracking flags for goal count, strategy coherence, useful diversity, Operational Value correlation, order stability, and computational cost while keeping `planningInfluence: "none"`.

### ORC Operational Trade-off Analyzer (ID 183)

The ORC SEE now detects deterministic operational trade-offs for candidates by comparing existing Operational Reasoning Score, Opportunity Cost, and Recovery Potential signals. Trade-off Evidence records favored dimensions, penalized dimensions, intensity, and a full explanation for reconstruction; this information is informational/read-only, supports explanations and near-tie context only, and does not change the Decision Engine, Commit Engine, official planning, persistence, API, UI, or V4 behavior. The operational benchmark report exposes tracking flags for detected trade-offs, final-solution correlation, explanation stability, and Operational Value correlation while keeping `planningInfluence: "none"`.

### ORC Operational Reasoning Score (ID 180)

The ORC SEE now consolidates Operational Criticality, Opportunity Propagation, Dynamic Bottleneck, Future Impact, Opportunity Cost, Dependency Chain Flow, and Recovery Potential into a single deterministic Operational Reasoning Score. Each score records normalized component values, individual contributions, and a full explanation as Evidence so exploration ordering, reasoning-budget allocation, and candidate preselection can be reconstructed without changing the Decision Engine, official planning, persistence, API, UI, or V4 behavior. The operational benchmark report exposes tracking flags for ORS correlation with final Operational Value, exploration-order stability, computational cost, avoided simulations, and reduction of contradictory decisions while keeping `planningInfluence: "none"`.

### ORC Recovery Potential Estimator (ID 179)

The ORC SEE now estimates deterministic, read-only Recovery Potential for each candidate before simulation. The estimate considers residual slack, remaining alternative diversity, future resource pressure, reordering capacity, and dependency-chain resilience. It is recorded as Evidence and can influence only exploration ordering, candidate preselection, and reasoning-budget allocation; it never invalidates candidates and does not change the Decision Engine, official planning, persistence, API, UI, or V4 behavior. The operational benchmark report exposes tracking flags for Recovery Potential correlation, avoided simulations, planning stability, and calculation-time evidence while keeping `planningInfluence: "none"`.

### ORC Opportunity Cost Estimator (ID 177)

The ORC SEE now computes a deterministic, read-only Opportunity Cost estimate before simulation. The estimate is recorded as Evidence and can influence only exploration ordering, candidate preselection, and budget reasoning; it does not change the Decision Engine, official planning, persistence, API, UI, or V4 behavior. The operational benchmark report exposes tracking flags for correlation, avoided simulations, correctly discarded candidates, and calculation-time evidence while keeping `planningInfluence: "none"`.

## Verificación básica

```bash
npm run check
npm run test:engine:quick
npm run benchmark:engine:quick
npm run test:engine:full
npm run benchmark:engine:full
```

Los aliases históricos `npm run test:engine` y `npm run benchmark:engine` conservan la validación completa. Para iteración local rápida se usan los comandos `:quick`; antes de mergear cambios del motor deben ejecutarse las suites `:full`.

- ID 026 — 2026-06-07 11:50 — Hard validation gate y detalle de hard violations en Motor V3
- ID 027 — 2026-06-07 12:08 — Corrección de semántica de comida flexible vs bloqueo hard global
- ID 028 — 2026-06-07 13:39 — Concurrencia/capacidad de espacios y diagnóstico humano de SPACE_OVERLAP
- ID 029 — 2026-06-07 14:45 — Uso de capacidad de furgoneta existente para concurrencia del espacio Transporte

- ID 030 — 2026-06-07 15:24 — Export de calidad operativa del planning para evaluación real del motor
- ID 031 — 2026-06-07 16:21 — Compactación de jornadas e idle time para calidad operativa real

- ID 032 — 2026-06-07 16:47 — Alineación de detección de coaches en scoring y compactación operativa
- ID 033 — 2026-06-07 19:19 — Cancelación/desbloqueo seguro de generación atascada desde el modal
- ID 034 — 2026-06-07 21:08 — Coach compaction real con trazabilidad de rechazos
- ID 035 — 2026-06-08 08:25 — Fix metadata null de coach compaction
- ID 036 — 2026-06-08 11:24 — Generador concreto para reducir gap de coach
- ID 037 — 2026-06-08 12:54 — Coach bundle compaction para reducir gaps grandes de coach
- ID 038 — 2026-06-08 14:32 — Coach wave ordering para reducir jornadas partidas de vocal coaches
- ID 039 — 2026-06-08 14:51 — Pipeline coach-wave candidate completo y diagnóstico obligatorio
- ID 040 — 2026-06-08 15:20 — Phase C Pipeline Builder por Main Stage y coach waves
- ID 041 — 2026-06-08 17:33 — Pipeline Builder observable y parcial para coach waves reales
- ID 042 — 2026-06-08 20:15 — Pipeline Builder repair pass para conflictos de recursos/espacios
- ID 043 — 2026-06-09 05:18 — Pipeline segment repair por cadena de talent y conflict details obligatorio
- ID 044 — 2026-06-09 07:25 — Trazabilidad end-to-end de Pipeline Segment Repair

- ID 045 — 2026-06-09 15:27 — Robustez de planificación y resource-lane intelligence para Pipeline Builder

- ID 046 — 2026-06-09 19:34 — Lane-only sequential repair y split de segmento para Pipeline Builder

- ID 047 — 2026-06-09 20:35 — Progreso vivo de planificación y slack-aware lane repair

- ID 048 — 2026-06-09 21:05 — Meal window scheduler flexible y progreso real por fases
- ID 049 — 2026-06-09 22:00 — Hotfix defensivo para progreso y meal scheduler tras Internal Server Error

- ID 050 — 2026-06-10 13:33 — Cancelación transaccional y meal diagnostics end-to-end
- ID 051 — 2026-06-10 14:25 — Meal-aware Pipeline Builder y diagnostics reales de lane repair

- ID 052 — 2026-06-10 14:54 — Segment solver real para cuello de botella y export JSON latest-run seguro

- ID 053 — 2026-06-10 19:42 — Microsegment solver quirúrgico para gaps de coach

- ID 054 — 2026-06-10 20:40 — Segment solver con blockers concretos y reparación incremental
- ID 055 — 2026-06-15 05:36 — Repair chain controlado para segment solver y diagnostics completos
- ID 056 — 2026-06-15 06:15 — Post-success UI robusto y full-validation diagnostics del segment solver
- ID 057 — 2026-06-15 14:41 — Planning ready gate y full-validation underlying failures
- ID 058 — 2026-06-15 15:00 — Ready gate OUT completo y guard de overlap fijo en Main Stage

- ID 059 — 2026-06-15 16:00 — Production Wave Builder candidate-first y Main Stage guard efectivo
- ID 060 — 2026-06-15 17:00 — Activación real Production Wave y guard Main Stage efectivo

- ID 061 — 2026-06-15 21:48 — Contrato runtime Production Wave y poda Main Stage pre-validation
- ID 062 — 2026-06-17 00:00 — Infraestructura paralela Motor V4 con resultados y diagnosis separados

- ID 063 — 2026-06-17 00:00 — V4 Strategic Analysis Layer
- ID 064 — 2026-06-17 00:00 — V4 Main Flow Sequence Builder
- ID 065 — 2026-06-17 00:00 — V4 Guided Input Ordering

- ID 066 — 2026-06-17 00:00 — V4 Post-Plan Quality Evaluator
- ID 067 — 2026-06-17 00:00 — V4 Main Flow Continuity Improvement Pass
- ID 068 — 2026-06-17 00:00 — V4 Multi-Strategy Candidate Runner
- ID 069 — 2026-06-17 00:00 — V4 Main Flow First Scheduler

- ID 070 — 2026-06-18 00:00 — V4 Production Wave Scheduler V1

- ID 071 — 2026-06-18 00:00 — V4 Hierarchical Post-Optimizer V1
- ID 072 — 2026-06-18 15:14 — V4 Production Wave V2 and V3/V4 Comparison Gate

- ID 073 — 2026-06-18 00:00 — V4 Native Remainder Scheduler V1

- ID 074 — 2026-06-18 15:50 — V4 Native Critical Core with V3 Fill

- ID 075 — 2026-06-18 16:03 — V4 Pro Orchestrator and Quality Gate

- ID 076 — 2026-06-18 18:07 — V4 Strategic Block Repacker V1

- ID 077 — 2026-06-18 19:23 — V4 Hierarchical Improvement Engine V1

- ID 078 — 2026-06-18 19:39 — V4 Main Flow Sequence Search V1

- ID 079 — 2026-06-18 00:00 — V4/V3 Benchmark Harness and Regression Gate

- ID 080 — 2026-06-19 00:00 — V4 Performance Budget and Benchmark Stabilization
- ID 081 — 2026-06-19 00:00 — V4 Strategy Portfolio Calibration

- ID 082 — 2026-06-19 12:04 — V4 Benchmark Evidence Report and Loss Diagnosis
- ID 083 — 2026-06-24 00:00 — V4 Representative Benchmark and Simple Scenario Early Exit
- ID 084 — 2026-06-24 00:00 — V4 Benchmark Trustworthiness and Latest Result Hygiene

- ID 085 — 2026-06-24 10:16 — V4 Native Core Failure Diagnosis and Runtime Short-Circuit
- ID 086 — 2026-06-24 13:36 — V4 Main Flow Gap Targeting for Native Critical Core
- ID 087 — 2026-06-24 00:00 — V4 Actual Main Flow Gap Closure V1

- ID 088 — 2026-06-24 14:14 — V4 Gap Closure Safety and Benchmark Proof

- ID 089 — 2026-06-24 18:33 — V4 Gap Closure Bugfix and Flow Order Targeting

- ID 090 — 2026-06-24 19:23 — V4 Resource Validation Audit and Safe Resource Move Support

- ID 091 — 2026-06-24 20:49 — V4 AnyOf Resource Resolution for Gap Moves

- ID 092 — 2026-06-25 00:00 — ORC State Contracts Baseline
- ID 093 — 2026-06-25 13:57 — ORC SEE Read-Only Opportunity Detection Baseline
- ID 094 — 2026-06-25 15:03 — ORC SEE Shadow Mode Evidence
- ID 095 — 2026-06-25 15:28 — ORC SEE Read-Only Search Space Baseline

- ID 096 — 2026-06-25 15:35 — ORC SEE Candidate Generation Baseline (Read-Only)

- ID 097 — 2026-06-25 15:44 — ORC Transformation Engine Baseline (Read-Only)
- ID 098 — 2026-06-25 15:53 — ORC Simulation Engine Baseline (Read-Only)

- ID 099 — 2026-06-25 16:06 — ORC Validation Engine Baseline (Read-Only)

- ID 100 — 2026-06-25 16:16 — ORC Operational Evaluator Baseline (Read-Only)
- ID 101 — 2026-06-25 16:24 — ORC Commit Engine Baseline (Shadow Mode)
- ID 102 — 2026-06-25 17:10 — ORC Cognitive State & Session Memory Baseline
- ID 103 — 2026-06-25 19:45 — ORC Reasoning Budget Baseline
- ID 104 — 2026-06-25 22:27 — ORC SEE Cognitive Feedback Loop Baseline
- ID 105 — 2026-06-25 06:38 — ORC Cognitive Pruning Baseline
- ID 106 — 2026-06-26 06:46 — ORC Decision Engine Ranking Baseline

- ID 107 — 2026-06-26 06:58 — ORC Operational Evaluator v1 (Real Multi-Criteria Evaluation)

- ID 108 — 2026-06-26 14:38 — ORC Session Learning Baseline

- ID 109 — 2026-06-26 14:48 — ORC Adaptive Opportunity Prioritization v1
- ID 110 — 2026-06-26 14:55 — ORC Adaptive Search Space Builder v1
- ID 111 — 2026-06-26 15:34 — ORC Strategy-Based Candidate Builder v1
- ID 112 — 2026-06-26 16:17 — ORC Opportunity Diagnosis Engine v1


- ID 113 — 2026-06-26 16:52 — ORC Benchmark Harness v1 (SPEC-05)
- ID 114 — 2026-06-26 17:09 — ORC Golden Benchmark Suite v1
- ID 115 — 2026-06-26 18:20 — ORC Baseline Report Generator v1
- ID 116 — 2026-06-26 18:29 — ORC Calibration Framework v1
- ID 117 — 2026-06-26 22:35 — ORC Real-Scenario Validation Framework v1
- ID 118 — 2026-06-26 22:59 — ORC Advisory Decision Interface v1
- ID 119 — 2026-06-26 23:11 — ORC Advisory Evaluation Framework v1
- ID 120 — 2026-06-26 23:19 — ORC Recommendation Calibration Suite v1
- ID 121 — 2026-06-26 23:40 — ORC Readiness Index Framework v1
- ID 121 — 2026-06-26 23:55 — ORC Advisory Integration Layer v1
- ID 121 — 2026-06-27 02:05 — ORC Feature Flag & Integration Modes
- ID 122 — 2026-06-27 02:20 — ORC Execution Evidence Recorder v1
- ID 122 — 2026-06-27 02:27 — ORC Production Replay Engine v1
- ID 122 — 2026-06-27 02:33 — ORC Real Production Scenario Suite v1
- ID 123 — 2026-06-27 02:44 — ORC Operational State Analyzer v1
- ID 124 — 2026-06-27 03:01 — ORC Opportunity Classification Engine v1
- ID 125 — 2026-06-27 03:40 — ORC Opportunity Prioritization Engine v2
- ID 126 — 2026-06-27 03:47 — ORC Search Space Builder Decoupling v2
- ID 127 — 2026-06-27 03:57 — ORC Candidate Builder Decoupling v2
- ID 128 — 2026-06-27 04:08 — ORC Decision Engine Input Contract v1

- ID 129 — 2026-06-27 10:11 — ORC Decision Pipeline Orchestrator v1
- ID 130 — 2026-06-27 10:25 — ORC Decision Trace Builder v1
- ID 131 — 2026-06-27 10:37 — ORC Critical Bottleneck Analyzer v1

- ID 132 — 2026-06-27 10:46 — ORC Bottleneck-Driven Opportunity Detection v1

- ID 133 — 2026-06-27 11:34 — ORC Resource Criticality Analyzer v1

- ID 134 — 2026-06-27 11:40 — ORC Constraint Pressure Analyzer v1
- ID 135 — 2026-06-27 12:34 — ORC Operational Priority Analyzer v1

- ID 136 — 2026-06-27 12:39 — ORC Priority-Guided Search Space Builder v1
- ID 137 — 2026-06-27 12:49 — ORC Priority-Aware Candidate Budget v1

- ID 138 — 2026-06-27 14:22 — ORC Exploration Value Estimator v1
- ID 139 — 2026-06-27 14:52 — ORC Search Space Selection Engine v1
- ID 140 — 2026-06-27 15:46 — ORC Future Constraint Propagation Engine v1
- ID 141 — 2026-06-27 16:46 — ORC Branch Ordering Engine v1
- ID 142 — 2026-06-27 16:58 — ORC Search Backtracking Framework v1
- ID 143 — 2026-06-27 17:06 — ORC Backtracking Search Executor v1
- ID 144 — 2026-06-27 17:28 — ORC Branch Pruning Engine v1
- ID 145 — 2026-06-27 17:36 — ORC Iterative Search Solver v1
- ID 146 — 2026-06-27 17:51 — ORC Solution Pool Framework v1
- ID 147 — 2026-06-27 18:04 — ORC Shadow Multi-Solution Search v1
- ID 148 — 2026-06-27 18:21 — ORC Shadow Search Benchmark Harness v1
- ID 149 — 2026-06-27 18:36 — ORC Incremental Replanning Engine v1
- ID 150 — 2026-06-27 18:46 — ORC Concrete Simulation v1 — Apply Candidate Assignments in Shadow Mode
- ID 151 — 2026-06-27 18:54 — ORC Production Objective Evaluator v1
- ID 152 — 2026-06-27 19:05 — ORC Evaluation-Guided Search v1
- ID 153 — 2026-06-27 19:50 — ORC Online Search Learning v1
- ID 154 — 2026-06-27 20:03 — ORC State Equivalence & Transposition Table v1
- ID 155 — 2026-06-27 20:23 — ORC Dominance Pruning v1
- ID 156 — 2026-06-27 20:41 — ORC Operational Criticality Model v1
- ID 157 — 2026-06-27 20:54 — ORC Criticality-Driven Reasoning Budget v1
- ID 158 — 2026-06-27 22:20 — ORC Opportunity Propagation Analyzer v1
- ID 159 — 2026-06-27 22:34 — ORC Adaptive Search Space Builder v1
- ID 160 — 2026-06-27 22:56 — ORC Strategy-Based Candidate Builder v1
- ID 161 — 2026-06-27 23:10 — ORC Strategy Candidate Assignment Synthesis v1
- ID 162 — 2026-06-27 23:51 — ORC Strategy Variant Generator v1
- ID 163 — 2026-06-28 00:08 — ORC Candidate Preselection Engine v1
- ID 164 — 2026-06-28 00:20 — ORC Partial Plan Composer v1

- ID 165 — 2026-06-28 07:55 — ORC Partial Plan Decision Engine v1
- ID 166 — 2026-06-28 08:18 — ORC Global Solution Assembler v1
- ID 167 — 2026-06-28 08:34 — ORC Iterative Global Optimizer v1
- ID 168 — 2026-06-28 09:01 — ORC Dynamic Bottleneck Reasoning v1
- ID 169 — 2026-06-28 09:35 CEST — ORC Future Impact Analyzer v1
- ID 170 — 2026-06-28 10:02 CEST — ORC Decision Feedback Loop v1

- ID 171 — 2026-06-28 10:14 CEST — ORC Operational Delta Benchmark v1

- ID 172 — 2026-06-28 10:43 CEST — ORC Improvement Opportunity Analyzer v1
- ID 173 — 2026-06-28 11:14 CEST — ORC Improvement-Driven Search Calibration v1
- ID 174 — 2026-06-28 12:05 CEST — ORC Evidence-Driven Optimization Cycle v1
- ID 175 — 2026-06-28 12:20 CEST — ORC Evidence-Gated Development Workflow v1
- ID 176 — 2026-06-28 12:39 CEST — ORC Benchmark CLI Operational Evidence v1
- ID 177 — 2026-06-28 13:58 CEST — ORC Opportunity Cost Estimator v1
- ID 178 — 2026-06-28 14:52 CEST — ORC Dependency Chain Flow Optimizer v1
- ID 179 — 2026-06-28 15:18 CEST — ORC Recovery Potential Estimator v1
- ID 180 — 2026-06-28 15:27 CEST — ORC Operational Reasoning Score v1
- ID 181 — 2026-06-28 15:56 CEST — ORC Goal-Oriented Search v1
- ID 182 — 2026-06-28 16:19 CEST — ORC Progressive Commitment Strategy v1
- ID 186 — 2026-06-28 20:11 CEST — ORC Active V4 Bridge v1

### Operational Planning Quality Metrics (ID 183)

- ID 183 — 2026-06-28 17:52 CEST — Operational Planning Quality Metrics v1

The ORC benchmark now records Operational Planning Quality Metrics (OPQM) as read-only evidence for resource active span, effective work, idle time, fragmentation, talent active span, talent idle time, operational compactness, main-flow continuity quality, and dynamically detected critical-resource spread. These metrics are compared in Operational Delta Benchmark reports for ORC vs V4 and can be consumed by the Improvement Opportunity Analyzer without changing ORC, V4, the official planning, persistence, API, or UI behavior.
- ID 184 — 2026-06-28 18:28 CEST — Real Production Benchmark Scenario v1
- ID 185 — 2026-06-28 18:57 CEST — Operational Quality Root Cause Analyzer v1

### ORC Active V4 Bridge v1 (ID 186)

El botón Generar V4 ejecuta ahora un puente activo ORC controlado: primero calcula V4 como baseline seguro, después evalúa ORC, convierte sólo simulaciones válidas a `EngineOutput`, aplica gates de seguridad y cae automáticamente a V4 cuando ORC no es aplicable. Los diagnostics incluyen `orcActiveBridge`, `usedEngine`, `fallbackReason`, gates y comparación OPQM sin modificar schema ni aplicar tareas al plan oficial.

- ID 187 — 2026-06-29 UTC — P1.1 — Mi Día operativo

### P1.1 — Mi Día operativo (ID 187)

Se añade la ruta protegida `/my-day` como primera iteración UI/operativa de “Mi Día”: una pantalla mobile-first para responder qué debe hacer ahora cada usuario operativo, dónde debe estar, qué viene después, y qué avisos requieren atención inmediata.

- Nueva navegación “Mi Día” con acceso a `/my-day`.
- Reutiliza datos existentes de planes, detalle operativo del plan, tareas, locks, asignaciones de staff, scopes de zona/espacio, vínculo operativo del usuario y reloj de producción (`usePlans`, `useDefaultPlanId`, `usePlanOpsData`, `useMeLinks`, `useProductionClock`).
- Filtra el ámbito del usuario vinculado a staff por zona/espacio y el recurso de cámara por tareas que requieren cámaras; si no hay vínculo operativo, muestra una vista general marcada con aviso humano.
- Incluye tarjetas “Ahora” y “Siguiente”, agenda agrupada, avisos operativos y acciones rápidas Start/Finish/Interrupt/Cancel contra el endpoint existente `PATCH /api/tasks/:id/status`.
- No modifica base de datos, migraciones, RLS, modelos Drizzle, policies Supabase, motor V3, motor V4, ORC, locks, endpoints ni lógica backend de planificación.

Validación manual recomendada:

1. Abrir `/my-day` con sesión autenticada.
2. Comprobar selector de plan cuando hay varios planes y estados vacíos cuando no hay planes/tareas.
3. Validar usuario con staff vinculado y scopes por zona/espacio, recurso cámara vinculado y usuario sin vínculo operativo.
4. Confirmar que “Ahora” prioriza tareas `in_progress` y que “Siguiente” muestra la próxima pendiente.
5. Ejecutar Start/Finish/Interrupt/Cancel y verificar refresco de tareas/locks/detalle del plan.

Limitaciones conocidas:

- No implementa reset desde `interrupted` para evitar duplicar reglas de permisos en cliente.
- Los avisos son derivados en cliente y no crean incidencias persistidas.
- La detección de recurso cámara depende de la metadata existente de recurso/tipo devuelta por `/api/resource-types-with-items`.
