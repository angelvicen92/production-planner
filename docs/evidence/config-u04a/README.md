# U04a — composición física y mappings diarios

El catálogo permite crear y editar composiciones con recursos físicos existentes, disponibilidad explícita opcional, transición (incluido 0) y estado activo. Muestra los miembros compartidos y sus posibles conflictos. Código e ID permanecen estables. Guardado y reemplazo de miembros son una única transacción con revisión esperada; un conflicto no conserva cambios parciales.

## Contrato y autoridades

| Autoridad | Identidad y consumidor |
| --- | --- |
| `itinerant_teams` + `itinerant_team_members` | Identidad global, revisión y miembros `resource_items.id`; un miembro puede participar en varias composiciones. No representa responsables de personal, bundles ni `resource_item_components`. |
| `plans.itinerant_composition_version=1` | Opt-in exclusivo de nuevas jornadas creadas por la aplicación. No hay backfill. La marca no se puede cambiar posteriormente. |
| `plan_itinerant_unit_snapshots` | `source_team_id → id` es el mapping explícito global→diario. `members` conserva cada par `{resourceItemId, planResourceItemId}` contra la FK real del recurso diario. Se guarda nombre/código, revisión de origen, ventanas y transición. |
| Snapshots de plantillas | Conservan requisito y alternativas globales. `buildEngineInput` exige y valida sus mappings antes de publicar IDs locales. No hay fallback por nombre, prefijo, orden ni coincidencia numérica. |
| EngineInput → adapter → materialización | `itinerantTeamAvailability` publica unidades locales y miembros locales. La elección une sólo los miembros elegidos a los recursos independientes; no crea un recurso hard adicional para el equipo. |
| Revisión y replay | La autoridad `plan_workday` incorpora el snapshot completo de composición para las nuevas jornadas, incluso cuando no existe una configuración general Next. Las jornadas antiguas conservan su semántica anterior. |

La falta de una ventana de composición añade únicamente el límite de jornada; las ventanas explícitas se intersectan con ella y los recursos conservan su disponibilidad individual. Transición, comidas, concentración de presencia, continuidad y setups mantienen sus autoridades separadas. La configuración efectiva muestra composición, miembros compartidos y el significado de una política de concentración cuando existe.

Los requisitos físicos `byItem` independientes de una tarea itinerante se reconcilian mediante la FK del recurso diario. Los requisitos genéricos que el adapter no representa siguen siendo rechazados por su preflight; la composición no los sustituye ni los silencia.

`snapshot_plan_itinerant_units` comprueba el actor y crea las correspondencias atómicamente al crear el día. Las plantillas no utilizadas pueden permanecer en el catálogo; una tarea que realmente use un equipo sin mapping produce un error de configuración. La lectura y sincronización de comidas de un día nuevo utilizan sus equipos congelados, sin incorporar equipos creados después.

Los snapshots no admiten UPDATE ni DELETE independiente; la eliminación de una jornada puede ejecutar su cascada normal. No se eliminan equipos referenciados por plantillas, snapshots, responsables o comidas. ADMIN gobierna el catálogo, incluyendo las variantes de casing de Express; las RPC no son ejecutables por `anon` ni `authenticated`. Las nuevas tablas tienen RLS y grants explícitos mínimos para `service_role`.

## Límite material de cierre

**Esta entrega no certifica todavía el objetivo productivo completo U04a.** El creador general de jornadas no materializa las autoridades generales de Planner Next: clasificación de operaciones, flujo principal, políticas de comidas y otras autoridades de `planner_next_configuration`. No existe en la base autorizada un camino de UI que configure todas ellas para un día genérico. U04a no inventa esas políticas ni abre escritura al JSON protegido.

La prueba nativa crea recursos, equipos, plantillas y una jornada mediante la aplicación y verifica sus snapshots y el EngineInput real. El control de simultaneidad del motor utiliza esa composición persistida **bajo autoridades no itinerantes sintéticas explícitas**; no debe presentarse como certificación de solver/Draft/Stage de esa jornada nueva. El cierre de ese último recorrido y la aceptación/replay de elecciones nuevas en Assisted siguen pendientes. La edición de composición en jornadas existentes también queda fuera: no se habilita un editor sin una operación versionada autorizada.

Las identidades A2 históricas, sus JSON Next, snapshots y Stages no se reconciliaron ni modificaron. No se cambia búsqueda, geometría, continuidad, budgets, timeouts ni optimizaciones.

## Reproducción

```sh
npm run check:migrations
npm run check
npm run build
npx --no-install tsc -p script/demo/tsconfig.integration.json
node --import tsx --test server/itinerantComposition.spec.ts server/atomicTaskTemplate.spec.ts server/apiAuthorization.spec.ts engine/planner-next/integration/engineInputAdapter.spec.ts engine/planner-next/itinerantUnitMeals.spec.ts engine/planner-next/exactItinerantPlan.spec.ts server/taskTemplateSnapshot.spec.ts engine/buildInput.taskTemplateSnapshot.spec.ts server/effectivePlanConfigRevision.spec.ts
npm run demo:a2:smoke -- work/u04a/native --restricted-data-api --historical-topology --itinerant-composition --production-runtime
```

El modo `--production-runtime` compila y arranca el bundle real contra el gateway/Auth de localhost creado por el propio ensayo; no utiliza las credenciales `VITE_*` heredadas. Evita compartir HMR entre ensayos. El workflow dedicado conserva los artefactos sanitizados; los logs privados y los bundles con credenciales descartables no se versionan.

La migración 104 sólo se aplica a PostgreSQL descartable en estos ensayos. No se aplican migraciones productivas, no se publica Replit y no se hace merge.

## Resultados y Evidence del candidato

- **168 tests focales: PASS**, incluyendo determinismo por orden de filas, ventanas de miembros/unidad, comidas, transición, recursos independientes, IDs inexistentes y autorización con casing de Express. TypeScript, tipado del harness, build y secuencia de migraciones pasan.
- **Ensayo nativo: PASS**, con PostgreSQL, Auth, PostgREST, Data API restrictiva y Chromium. La UI crea CAM_A/CAM_B/SON_1, A/B/C y las plantillas; edita transición 0, guarda/recarga y crea jornadas. Las unidades globales 1/2/3 se resuelven explícitamente a unidades diarias 4/5/6; CAM_A conserva el mismo recurso diario en A y C. Dos guardados concurrentes producen 200/409; un fallo tardío revierte revisión y miembros. No hay escritura remota. [native.json](native.json), [itinerant-composition.json](itinerant-composition.json), [catálogo](u04a-catalog.png), [plantillas](u04a-templates.png), [día](u04a-day.png).
- **Benchmark final del motor A2: PASS**, 266/266, 11 Stages, 0 HARD, 0 REQUIRED y placements protegidos conservados. [Resumen](a2-final.json) y [Evidence completa comprimida](a2-final-full.json.gz); el resumen incluye SHA-256 del JSON original y fingerprints por Stage. Es una ejecución completa final; no se declara una segunda ejecución completa de determinismo.
- **Comparación UI con baseline:** tanto `49d826c` como el ensayo del candidato intermedio completan 266/266 y 11 Stages con validación canónica, sesiones persistidas y rollback/redo. Ambos fallan después en el mismo control histórico `Orden por tarea`. No se registra ese harness completo como PASS ni se corrige otra superficie en U04a. [Comparación](a2-ui-comparison.json).

[validation.json](validation.json) enumera resultados, límites y hashes de fuentes. Los intentos previos fallidos permanecen en `work/u04a`: se corrigieron selectores del ensayo y carga de catálogo; el ensayo nativo final se ejecutó sin cambiar fuentes durante su duración.
