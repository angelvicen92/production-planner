# Primer rechazo de la base y resultado del candidato

`before/manifest.json.gz` identifica la base exacta y su tree. El runner `before.ts` no aplica overlay productivo. Sólo añade dispatch del harness U01e al bootstrap descartable. Los recibos de `before/receipts.json.gz` incluyen payload, respuesta, revisiones, estado previo/posterior y SELECT del consumidor SQL.

| Solicitud sobre jornada A-fixed | Base 123 | Candidato 124 |
| --- | --- | --- |
| Guardar conjunta, ajena al consumo itinerante de I/II | 422 `UNSUPPORTED_JOINT_COMBINATION` | 200, recarga auténtica |
| SELECT `assert_daily_joint_groups` | P0001 mismo rechazo | Acepta fuentes auténticas |
| Guardar fases REQUIRED 3/2/2, común explícito [] | 422 `UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION` | 200, editor y rebuild |
| SELECT `assert_daily_technical_chains` | P0001 mismo rechazo | Acepta fuentes auténticas |
| Catálogo itinerante sin consumidores | Conjunta 200, fases 422 | Ambas 200, S1/S2 SQL |
| `joint_task_resources` en tarea sólo itinerante | Omite miembros | Igual al resolver efectivo |
| Propuesta/Draft/Stage itinerante | No alcanzado | S1/S2 SQL, continuación exacta |

Si se solicitan las fases antes de la conjunta, el primer guard cambia; la causa física/contractual es la misma. La Evidence no presenta el anterior witness en memoria como aceptación SQL. Los límites mantenidos son temporales y precisos: unidades específicas fijas, mapping diario único, transición explícita cero y perfil standalone nominal; las demás combinaciones conservan UNSUPPORTED.
