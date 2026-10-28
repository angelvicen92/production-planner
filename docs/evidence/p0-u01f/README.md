# P0-U01f — unidades fijas × fases REQUIRED × conjunta × pausa

Base exacta: `main @ f5d56eeb477e86e1c3b960e3ac37db37d3046c84`. Rama única: `codex/p0-u01f-fixed-itinerant-required-phase-composition`.

Este directorio certifica el recorrido de autoría UI/API → reconstrucción → propuesta → Draft → validación → **Stage SQL** → continuación protegida. Los resultados cuantitativos finales están en `verification.json` y `validation.json`; los recibos públicos comprimidos son reproducibles con `verify.py`.

- [Antes, primer rechazo y delta causal](causal-path.md).
- [Composición, jornadas y obligaciones](composition-matrix.md).
- [Negativos materiales, protección y continuación](negatives-and-protection.md).
- [Gates, determinismo y límites](validation.md).

Se reutilizan los harnesses U01d/U01e y el stack PostgreSQL 17.11/Auth/PostgREST descartable. Todas las altas y autoridades positivas se crean mediante las APIs reales; el editor existente se recarga y edita en Chromium. Ningún EngineInput manual se usa para autorizar o aceptar un Stage. Los ataques modifican copias de propuestas auténticas dentro de transacciones revertidas y recalculan fingerprints; no se cuentan como Stages aceptados.

La migración incremental **124** extiende `joint_task_resources` con los miembros del snapshot diario de una unidad específica, y acota los guards existentes a unidades físicas fijas con transición explícita cero. Conserva 001–123, owners, grants privados, RLS, invoker security, writers y consumidores de futuro global. No cambia búsqueda, presupuestos, timeouts ni certificados.

## Reproducción

Dependencias instaladas, Docker local y Chromium. Los runners eliminan las credenciales heredadas y sólo generan credenciales locales; no conectan a Supabase remoto.

```sh
npm run check
npm run check:migrations
npm run build
npm test
npx --no-install tsc -p docs/evidence/p0-u01f/tsconfig.json
node --import tsx docs/evidence/p0-u01f/before.ts work/u01f-before
node --import tsx docs/evidence/p0-u01f/upgrade124.ts work/u01f-upgrade
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01f/run.ts work/u01f-native
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01f/run.ts work/u01f-repeat
python3 docs/evidence/p0-u01f/verify.py work/u01f-native/native work/u01f-repeat/native work/u01f-verification.json
node --import tsx docs/evidence/p0-u01f/supporting.ts work/u01f-native/native work/u01f-supporting.json
node --import tsx docs/evidence/p0-u00n/a2.ts work/u01f-a2
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01d/run.ts work/u01f-u01d
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01b/run.ts work/u01f-u01b
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00s/run.ts work/u01f-linear
```

A2 se ejecuta **como regresión histórica importada separada**: 266 obligaciones y 11 Stages. No acredita autoría completa del A2 desde UI. Sin Supabase real, Replit, publicación ni merge.
