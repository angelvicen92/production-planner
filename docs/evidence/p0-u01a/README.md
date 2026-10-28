# P0-U01a — Gate de Auditoría Causal de composición REQUIRED

**Resultado: BLOCKED para autoría/Stage de fases; consumidor de búsqueda reutilizable demostrado en memoria.** Base exacta `main @ 8d521a3c8356e311609467f70d312b5f44aef6df` (#1204 y migración 121 integrados). Rama `codex/p0-u01a-required-phase-composition-gate`. Sólo Evidence: cero cambios de producto, migraciones, presupuestos o algoritmos; sin merge/despliegue.

El primer fallo auténtico es **HTTP 400 `Unrecognized key(s) in object: 'phases'`**, en `dailyTechnicalChainPolicySchema.strict()` → `dayConfigEditSchema` → parse del PUT `/api/plans/:id/day-configuration` (`server/routes.ts`). Ocurre antes de `applyDayConfigurationOperation`, preflight y solver. El contrato diario sólo representa una cadena lineal técnica sin participante. Quitar `phases` produce **422 `UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION`** en `technicalChainCombinationSupported`, invocado por `validateDailyTechnicalChains`. No prueba inviabilidad.

Se recrea y amplía el perfil lógico U00y/U00z mediante API real, creación del día y consulta con Chromium: tres participantes, 15 obligaciones, operación conjunta de dos miembros, cinco espacios, equipo nominal compartido, preparaciones/cierres competidores y descanso físico explícito. Las fases solicitadas contienen **3, 2 y 2 operaciones**, con ambas obligaciones conjuntas conservadas. Dos bases descartables PostgreSQL 17.11/Auth/PostgREST/Chromium reproducen los rechazos y, **sin la autoridad de fases**, alcanzan S1 parcial/S2 completo auténticos: 15/15, cero HARD/REQUIRED configurados, protección, snapshot SQL y determinismo exactos. El Stage existente intercala A/B/C: no satisface por accidente el contrato que falta. [Perfil y obligaciones](profile.md).

Con la autoridad de fases añadida **únicamente a una copia en memoria del EngineInput auténtico**, adapter/preflight aceptan el contrato existente. Assisted conserva todas las obligaciones y produce un witness global válido en 81 ramas, sin backtracking ni agotamiento. Cambiar la enumeración interna de cualquiera de las tres fases permite otro orden válido; un scope de miembro cierra ocho obligaciones individuales; el scope independiente conserva todo el futuro y su continuación mantiene la decisión. El descanso desplazado dentro del antiguo bloque obliga a otro bloque completo válido. **Nada de esto es un Stage de fases.** [Contrafactuales y límites](memory.md).

Hay una pérdida real posterior: `certifyDailyTechnicalChain` pasa sólo tareas a `validatePlan`, omitiendo el descanso que sí contiene el witness global. Devuelve `INVALID / OPERATIONAL_MEAL_VIOLATION`; la misma realización sin exigir ese canal devuelve `WITNESS`. Además SQL rechaza el contrato por fases y su consumidor 115 recorre el orden lineal/prefijo, no el orden realizado dentro de fases. No se retiró ningún guard ni se escribieron contratos o Stages ficticios para saltar estas barreras. [Ruta y clasificación](causal-path.md).

El negativo material conserva autorías conjuntas/descanso soportadas y reduce por API la disponibilidad del equipo a 40 minutos: exige 55 de trabajo físico más 15 de descanso, por lo que es imposible. Preflight admite la configuración; la API devuelve `NO_PROPOSAL` en seis ramas, sin `BUDGET_EXHAUSTED` ni Stage nuevo. La misma unidad con fases en memoria tampoco obtiene propuesta.

**Decisión:** extender la autoridad diaria y certificación existentes de cadenas a fases de operaciones, reutilizando joint groups y el witness físico completo. No hay evidencia para otro motor, reglas, heurística ni presupuesto. Es un único delta de composición que necesita contrato/API/UI y certificación TS/SQL coherentes; cambiar sólo un booleano deja el producto bloqueado. [Delta mínimo, coste y aceptación](next-delta.md). La [matriz antes/después](composition-matrix.md) no eleva ninguna capacidad por esta auditoría.

## Evidence y reproducción

- `native/receipts.json.gz` y `repeat/receipts.json.gz`: peticiones/respuestas completas, inputs, revisiones/replay, S0, rechazo, igualdad de estado tras rechazo, propuesta/Draft/validación/Stage/SQL y negativo. Los PNG muestran la configuración real. Manifiestos enlazan fuentes e imágenes fijadas por digest.
- `memory/receipts.json.gz`: inputs proyectados, scopes, propuestas, todos los canales del witness, validación global, explorador, ejecución exacta con accounting, certificado rechazado y alternativas. `memory/manifest.json` declara las únicas intervenciones.
- `validation.json`, `verification.json`, `source-binding.json`, `attempts.json`, `checks/`: validación, límites, fuentes y errores de harness separados de producto.

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01a/run.ts work/u01a-native
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01a/run.ts work/u01a-repeat
node --import tsx docs/evidence/p0-u01a/memory.ts work/u01a-native/native work/u01a-memory
python docs/evidence/p0-u01a/verify.py work/u01a-native/native work/u01a-repeat/native work/u01a-memory work/u01a-verification.json
npx --no-install tsc -p docs/evidence/p0-u01a/tsconfig.json
node --import tsx --test --test-concurrency=1 engine/planner-next/technicalChains.spec.ts engine/planner-next/operationContinuity.spec.ts server/technicalChainStructure.spec.ts server/operationContinuity.spec.ts
```

Los runners exigen salida nueva, eliminan variables Supabase heredadas y sólo conectan a loopback. Se aplica el ledger existente completo hasta 121 (124 archivos), sin editarlo. El archivo descartable de ejecución sólo cambia el dispatch del harness y cacheDir Vite; no cambia funciones productivas. Ningún fixture ni placement importa el A2. No se ejecutaron suites globales, A2 Full, migraciones reales, Replit ni publicación. Node observado: 24.19.0; la CI habitual Node 20 no fue simulada. La certificación futura requerirá su gate propio.
