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

## Verificación básica

```bash
npm run check
npm run test:engine
```
