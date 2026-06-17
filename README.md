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
