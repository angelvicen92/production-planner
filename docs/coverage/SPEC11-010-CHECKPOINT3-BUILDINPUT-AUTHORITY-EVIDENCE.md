# SPEC11-010 — Checkpoint 3: Evidence de autoridad diaria en `buildEngineInput`

**Estado:** Evidence incremental de implementación  
**Clasificación:** DB Safe Merge  
**PR:** #646  
**Base funcional:** `main@9b1b851445cfdc90feec61090a5b624c60e5a059`  
**Commit de producto validado por merge gate:** `4b1fb53b472f64fb35535874a1ea416c26e46b47`  
**Head limpio tras retirar bootstrap, validado por Baseline CI:** `2a4a55c63b487352590fc4d81a5435f210c3ca3f`

---

## 1. Objetivo demostrado

Esta Evidence cubre únicamente la transición definida por SPEC11-010 Checkpoint 3:

```text
buildEngineInput(planId)
        deja de leer
storage.getOptimizerSettings()

        y pasa a consumir como autoridad hard

storage.getPlanOptimizerSnapshot(planId)
```

No demuestra ni activa una nueva heurística, un nuevo solver, Planner Next, ORC ni cambios de scoring.

---

## 2. Relación con la Evidence histórica de SPEC11-009

`docs/coverage/engine-input-source-criticality.json` permanece deliberadamente inmutable como inventario histórico auditado sobre `main@873803296db243026e267eb6f371f31ed2f9d388`.

Por tanto, su entrada `EIS-020` sigue describiendo el estado observado en aquel baseline (`FUTURE_REQUIRED_INPUT / NOT_IMPLEMENTED`). Esta Evidence incremental registra la transición posterior sin reescribir el pasado.

Estado efectivo demostrado por este checkpoint:

| Fuente | Estado histórico auditado | Estado tras Checkpoint 3 | Política efectiva |
| --- | --- | --- | --- |
| `EIS-009` — `storage.getOptimizerSettings()` | lectura global prohibida objetivo | **ausente de `buildEngineInput`** | `NOT_ALLOWED` |
| `EIS-020` — `storage.getPlanOptimizerSnapshot(planId)` | futura / no implementada | **fuente hard implementada** | `ABORT_BUILD` |

Reason code efectivo para `EIS-020`:

```text
ENGINE_INPUT_OPTIMIZER_SNAPSHOT_UNAVAILABLE
```

Un fallo de carga se materializa como `EngineInputSourceLoadError`; no existe fallback a configuración global.

---

## 3. Autoridad y compatibilidad

El snapshot diario se proyecta mediante:

```text
engine/planOptimizerSnapshotLegacyAdapter.ts
```

El adapter es puro y no consulta almacenamiento. Proyecta la forma canónica `PlanOptimizerSnapshotV1` a los campos legacy que todavía consumen V3/V4.

La identidad de transporte se resuelve mediante la relación diaria:

```text
plan_optimizer_snapshots
  -> plan_task_template_snapshots.id
  -> source_template_id / template_name del mismo día
```

No se vuelve a resolver IN/OUT mediante nombres de `optimizer_settings`.

`plan_task_template_snapshots.id` se expone como `planTemplateSnapshotId` únicamente como identidad relacional. El `sourceFingerprint` de cada snapshot de plantilla y el fingerprint de catálogo siguen derivados exclusivamente de los campos operativos/versionados; el surrogate físico no participa en ellos.

---

## 4. No activación accidental de capacidades

`CONTESTANT_TOTAL_SPAN` existe en el contrato del snapshot pero el `buildEngineInput` productivo previo lo mantenía neutralizado con peso `0`.

Checkpoint 3 conserva esa semántica:

```text
optimizerWeights.contestantTotalSpan = 0
```

Si el snapshot diario contiene esa heurística activa, el adapter publica:

```text
optimizerIgnoredActiveHeuristics = ["CONTESTANT_TOTAL_SPAN"]
OPTIMIZER_ACTIVE_HEURISTIC_NOT_PROJECTED
```

Su activación requiere una unidad funcional posterior con Evidence y benchmark propios.

---

## 5. Evidence expuesta en `EngineInput`

El input resultante conserva trazabilidad de la política diaria mediante:

- `optimizerSnapshotContractVersion`;
- `optimizerSnapshotSource`;
- `optimizerSnapshotEditingMode`;
- `optimizerSnapshotFingerprint`;
- `optimizerLegacyAdapterVersion`;
- `optimizerCompatibilityWarnings`;
- `optimizerIgnoredActiveHeuristics`.

Esto permite demostrar qué configuración efectiva consumió el motor sin releer defaults globales.

---

## 6. Validación ejecutada

El merge gate de PR #646 ejecutó sobre el delta funcional que produjo `4b1fb53b472f64fb35535874a1ea416c26e46b47`:

```text
focales SPEC11-010 / buildInput              PASS
npm run check:migrations                     PASS
npm run check                                PASS
npm test                                     PASS
npm run build                                PASS
npm run benchmark:engine:quick               PASS
git diff --check                             PASS
```

Los focales incluyen:

- contrato y persistencia del snapshot del optimizador;
- adapter legacy BASIC/ADVANCED;
- identidad diaria de transporte;
- rechazo de referencia diaria ausente o duplicada;
- neutralización explícita de `CONTESTANT_TOTAL_SPAN`;
- ausencia de lectura a `getOptimizerSettings()` en `buildEngineInput`;
- error hard tipado `EIS-020`;
- compatibilidad con SPEC11-002;
- criticidad de fuentes existente.

Tras retirar únicamente los artefactos temporales de bootstrap, Baseline CI ejecutó sobre `2a4a55c63b487352590fc4d81a5435f210c3ca3f` y pasó:

```text
TypeScript check                            PASS
Migration sequence check                    PASS
Production build                            PASS
```

El Focal A2 de Planner Next no se utiliza como evidencia principal de este checkpoint porque esta unidad no modifica Planner Next ni su búsqueda; la regresión de motor relevante se cubre con la suite completa y `benchmark:engine:quick`.

---

## 7. Limitaciones explícitas

Este checkpoint no afirma:

- que la migración 075 haya sido aplicada o validada contra la instancia Supabase real;
- que `CONTESTANT_TOTAL_SPAN` esté productivamente activado;
- que V3/V4 hayan cambiado de scoring;
- que Planner Next esté activado en producto;
- que exista actualización automática del snapshot diario;
- que se haya modificado SPEC10-021.

La limitación de despliegue real de la migración 075 permanece separada y no se oculta mediante fallback.
