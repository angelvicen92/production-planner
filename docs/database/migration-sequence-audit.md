# Auditoría de secuencia de migraciones posterior a 070

- **Fecha:** 2026-08-02 (UTC).
- **`main` local auditado:** `368f9d9088b7452bf7cf1fd9d6ed2407dab2d996`.
- **Estado remoto:** el checkout no expone ningún remote Git; no fue posible verificar si el SHA remoto de `main` o el head publicado de PR #611 habían avanzado. La rama parte directamente del `main` local indicado.
- **Frontera autoritativa:** `070_engine_v4_parallel_results.sql`, incorporada por `cc4fb627967cb9dfbe6d3b616a45e87478a23b97` el `2026-06-17T19:27:37+02:00`.
- **Fuente:** historial Git local, consultado para todos los `.sql` con `git log --follow --diff-filter=A`.

Se inspeccionaron los 70 archivos SQL presentes antes de los renombrados. Los únicos prefijos repetidos eran `034`, `044`, `064`, `066`, `067` y `069`; no apareció otro prefijo duplicado. La tabla registra todos sus archivos:

| Prefijo | Archivo auditado | Primer commit | Fecha | Clasificación |
|---|---|---|---|---|
| 034 | `034_2_task_templates_itinerant_team_requirement.sql` | `e8a6cd7cb2272ae075508149545e92eac2fc91c6` | 2026-02-15T20:28:11+00:00 | HISTÓRICA, NO RENOMBRAR |
| 034 | `034_staff_scope_check_itinerant_team.sql` | `e8a6cd7cb2272ae075508149545e92eac2fc91c6` | 2026-02-15T20:28:11+00:00 | HISTÓRICA, NO RENOMBRAR |
| 044 | `044_add_is_active_resource_types.sql` | `dfb6657314c9340ebbc5f4b4b2c99a436407a5c6` | 2026-02-18T07:07:05+01:00 | HISTÓRICA, NO RENOMBRAR |
| 044 | `044_grouping_scope_config.sql` | `422eeb5ddfcd50e5e73f4b2d6536dc17e495703b` | 2026-02-24T09:16:46+01:00 | HISTÓRICA, NO RENOMBRAR |
| 064 | `064_planning_runs_engine_v3.sql` | `8f3af3a31ca876e9404527b66f74fc7ba5a1666f` | 2026-02-28T22:46:18+01:00 | HISTÓRICA, NO RENOMBRAR |
| 064 | `064_optimizer_near_hard_breaks_max.sql` | `cad83ea28b87dfc78a0d75abc06fceb67b81fd5f` | 2026-02-28T23:43:56+01:00 | HISTÓRICA, NO RENOMBRAR |
| 066 | `066_resource_bundles.sql` | `218db513c37e25937fdcad78e98009ff2ed305ad` | 2026-06-06T22:31:26+02:00 | HISTÓRICA, NO RENOMBRAR |
| 066 | `066_resource_availability_snapshots.sql` → `072_resource_availability_snapshots.sql` | `18fad66790741d833eb61b175f442936f906a84a` | 2026-08-02T17:43:07+02:00 | POST-070, RENUMERAR |
| 067 | `067_planning_run_diagnostics.sql` | `d24b6fdf6cde62f29633560b73b0c14ba8c346d1` | 2026-06-07T10:20:25+02:00 | HISTÓRICA, NO RENOMBRAR |
| 067 | `067_workday_space_availability_snapshots.sql` → `073_workday_space_availability_snapshots.sql` | `2c629b1d5880bfde376aeb00d914204ccbdd5e28` | 2026-08-02T18:36:56+00:00 | POST-070, RENUMERAR |
| 069 | `069_planning_run_transactional_cancellation.sql` | `02d11a330843f265a089ae2c6fd45ab5500df4b6` | 2026-06-10T15:48:29+02:00 | HISTÓRICA, NO RENOMBRAR |
| 069 | `069_id258_zone_meal_break_minutes.sql` → `071_id258_zone_meal_break_minutes.sql` | `6669b728ec2226037b9994cd909f60e66a0cd490` | 2026-07-10T12:24:53+02:00 | POST-070, RENUMERAR |

La revisión de todos los archivos no encontró otra migración incorporada después de la frontera con prefijo menor o igual a `070`. La secuencia final post-corte es única y continua: `071`, `072`, `073`.

## Integridad de los renombrados

| Origen | Destino | SHA-256 antes y después |
|---|---|---|
| `069_id258_zone_meal_break_minutes.sql` | `071_id258_zone_meal_break_minutes.sql` | `159e9d53605f595fa8ec5e1b9dca1a745ccdea822c9965783d04df08a70c96eb` |
| `066_resource_availability_snapshots.sql` | `072_resource_availability_snapshots.sql` | `261613e4b1105c353077eeb59c1cf18e7a4aa530c60b089107013df996f63a7e` |
| `067_workday_space_availability_snapshots.sql` | `073_workday_space_availability_snapshots.sql` | `76e54bf79c83d92201d583313551438b878bb19cf804bc3c753f394f81dc5559` (rename); current RLS-amended file: `97f2d92821d01a09e96bf9d93fff3ebcee55bd9a90ef1547619b43351ddeb8a1` |

No se ejecutó ninguna migración ni se utilizó `supabase db push`. Tampoco se verificó el historial remoto de Supabase. La única referencia operativa asumida por instrucción es que `070_engine_v4_parallel_results.sql` es el último archivo aplicado. En un entorno con ese estado confirmado deben aplicarse en el futuro únicamente `071`, `072`, `073` y las sucesivas, en orden.
