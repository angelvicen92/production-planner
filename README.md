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


- ID 121 — 2026-06-26 23:40 — ORC Readiness Index Framework v1
- ID 121 — 2026-06-26 23:55 — ORC Advisory Integration Layer v1

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
