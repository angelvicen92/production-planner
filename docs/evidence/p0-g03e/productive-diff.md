# Diff productivo mínimo

| Archivo | Delta causal |
|---|---|
| `server/jointGroupStructure.ts` | Admite comida flexible sólo con fases diarias REQUIRED compatibles. Conserva recursos concretos, unidades fijas y todos los guards previos; cierra las familias adicionales no certificadas. |
| `server/technicalChainStructure.ts` | Retira la exclusión global de peers en fases con comidas válidas; exige conservar las fases de una conjunta flexible y mantiene cerradas las intersecciones adicionales. |
| `client/src/components/joint-groups-editor.tsx` | Explica fases → conjunta. La identidad nueva depende de los miembros ordenados y evita colisiones; editar conserva la identidad existente. |
| `supabase/migrations/130_joint_required_phases_flexible_meals.sql` | Modifica únicamente `assert_daily_joint_groups` y `assert_daily_technical_chains`, con predecesor comprobado y sin cambiar sus firmas, owner, ACL, invoker o search_path. |

No cambian archivos de `engine/`, geometría, matching, presupuestos, heurísticas, poda, Future Feasibility, scheduler, resolver, certificado, writers, revisiones, tablas o Stages. SQL físico, comidas, disponibilidad y protección permanecen literales. `source-binding.json`, el upgrade poblado y el test de contratos comprueban esas afirmaciones.

Dependencias reales de verificación: el lector de cuerpos efectivos y preflight incorporan 130; el control U02d compara estrictamente la versión instalada. G03b actualiza sólo la expectativa de admisión que este PR cambia, conservando todos sus asserts físicos y de Stage. Las pruebas nuevas se añaden al módulo de integración de comidas/fases ya autorizado por el aislamiento.

El harness archiva el código, utiliza Chromium y el build local con Auth/PostgREST/PostgreSQL descartables, conserva hashes del código ejecutado y comprueba que no hubo delta del checkout. La corrección del verificador independiente une las autoridades separadas `resources` y `coaches` al comprobar disponibilidad; no modifica entradas ni decisiones.
