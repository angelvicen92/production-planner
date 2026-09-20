# Auditoría de configurabilidad de producto — Fuente 04 v2.4

**Base reauditada:** PR #968. La autoridad canónica machine-readable es
`shared/configurability.ts`; `shared/configurability.test.ts` deriva los conteos, aplica
los gates semánticos y comprueba que cada path de test declarado existe.

## Resultado derivado del registry

| Estado | Cantidad |
|---|---:|
| PRODUCTIVE | 3 |
| PARTIAL | 13 |
| MISSING | 5 |
| BLOCKED | 5 |
| NOT_APPLICABLE | 1 |

Total: **27 capabilities**. El descenso de PRODUCTIVE es intencional: disponer de un
valor efectivo en UI, DB y `EngineInput` no demuestra por sí solo provenance auditable
ni una restauración de herencia correcta.

## Reauditoría de provenance y Restore inherited

| Capability | Valor efectivo / motor | Provenance demostrable | Restore inherited | Estado |
|---|---|---|---|---|
| `WORKDAY_WINDOW` | Sí; `plans.work_start/work_end` → `workDay` | Baseline diario y origen explícitos | Sí; restaura el baseline almacenado | PRODUCTIVE |
| `GLOBAL_MEAL_BREAK` | Sí; campos de comida de `plans` → `meal/mealMode` | Baseline diario y origen explícitos | Sí; restaura el baseline almacenado | PRODUCTIVE |
| `OPTIMIZATION` | Sí; snapshot versionado → configuración del motor | Effective y baseline diario separados; origen explícito | Sí; restaura exactamente el baseline almacenado | PRODUCTIVE |

En los dos primeros casos la vista efectiva sigue mostrando el valor actual y su
validación diaria como válida, pero presenta origen desconocido. Esa falta de
provenance es deuda de **product coverage**, no una razón causal para convertir el
readiness del día en `INCOMPLETE`.

## Clasificación de las 27 capabilities

- **PARTIAL (13):** `TIME_GRID`, `OPERATIONAL_MEAL_POLICIES`, `ITINERANT_UNITS`,
  `TRANSPORT_TARGET_GROUP_SIZE`, `TRANSPORT_MAXIMUM_GROUP_SIZE`, `MAIN_FLOW`,
  `SETUPS`, `ANCHORED_OPERATIONS`, `JOINT_OPERATIONS`, `SYNCHRONIZED_ROUNDS`,
  `TECHNICAL_CHAINS`, `SEARCH_POLICY_BUDGET` y
  `EFFECTIVE_CONFIG_REVIEW`.
- **MISSING (5):** `SPACE_CAPACITY`, `TRANSPORT_VEHICLE_CAPACITY`, `TRANSITIONS`,
  `BLOCK_COUNT_POLICY` y `ASSISTED_PROPOSAL_TIME_LIMIT`.
- **BLOCKED (5):** `PARTICIPANTS`, `TASKS_DEPENDENCIES`,
  `SPATIAL_AVAILABILITY`, `RESOURCE_CATALOG` y `PLAN_RESOURCE_ASSIGNMENTS`, por
  las barreras RLS registradas en el registry.
- **NOT_APPLICABLE (1):** `PROTECTED_STATE_LOCKS`, porque `done`, `in_progress` y
  locks son invariantes hard, no preferencias configurables.
- **PRODUCTIVE (3):** `WORKDAY_WINDOW`, `GLOBAL_MEAL_BREAK` y `OPTIMIZATION`.

Para las capabilities no proyectadas por la vista efectiva no se atribuye provenance:
su autoridad y gap concreto permanecen descritos por el registry. `DAY_SNAPSHOT`
significa únicamente «valor materializado del día» y nunca prueba herencia.

## Slice completado

`OPTIMIZATION` conserva ahora baseline y effective por separado: EDIT mantiene el
baseline, REFRESH explícito lo actualiza sin borrar un override local y Restore usa
exactamente ese baseline. `LEGACY_BACKFILL` permanece explícito y sin baseline inventado.
