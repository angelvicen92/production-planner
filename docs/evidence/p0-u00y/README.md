# P0-U00y — operaciones conjuntas nativas

Base `e0403c90866b5cd54986d68a59b76062e9ac47bc` (#1202, 119 integrada). Una unidad y un PR contra main, sin merge ni despliegue. PostgreSQL 17, GoTrue, PostgREST y Chromium exclusivamente descartables. No se aplican 119/120 a Supabase real ni se modifican jornadas publicadas.

**Resultado acotado: PRODUCTIVE** para grupos explícitos de auxiliares físicas con recursos concretos, en jornadas standalone o junto a Main/Vocal, con pausa global. La familia global sigue **PARTIAL**: no certifica su composición con comidas flexibles/coordinadas, rondas, cadenas, setups, transporte, anclajes, scopes Reality o recursos genéricos. A2 manual completo sigue abierto.

El [gate causal anterior al producto](authority-audit.md) demuestra el 400 auténtico y, sólo en memoria, el consumidor físico correcto más dos pérdidas: sibling oculto al filtrar la propuesta y ausencia del witness físico futuro completo. El contrafactual mínimo pasa antes del delta. No se cambian algoritmos, heurísticas, budgets, timeouts, históricos ni el canon A2.

La UI permite seleccionar tareas reales, consultar duración/espacio/recursos/dependencias, guardar, editar y retirar la declaración con revisión/CAS y consultar origen. Cada tarea conserva identidad y obligaciones individuales. El grupo tiene una decisión temporal y una ocupación física; su excepción interior no se extiende a otros grupos. El contrato admite más de dos miembros y el test focal certifica tres, sin ampliar por ello el gate UI de la pareja exigida por A2.

`plans.daily_joint_groups` utiliza el writer diario existente, replay, fingerprints y transición de sesión. SQL 120 añade guards privados de autoridad, fuentes y Stage; reutiliza el consumidor físico de 118, condicionado por la nueva autoridad explícita. Los grupos parcialmente materializados o protegidos se rechazan. No crea otro solver, tabla de tareas compartidas ni arquitectura de configuración.

## Jornadas auténticas

| Jornada | Autoría y competencia | Stages |
| --- | --- | --- |
| A | Dos participantes, preparación individual, operación conjunta de 10 min, sucesores individuales, kit nominal y competidora por espacio/recurso; ventanas distintas con intersección | S1 completa 7/7 |
| B | Otros dos participantes, Main/Vocal, dos grupos distintos de 10 y 5 min en espacios configurables, dependencias individuales entre ambos, cierres y competidora física | S1 parcial, S2 completa 11/11 preservando S1 literalmente |

Los IDs diarios y las identidades opacas de grupo son propios de cada base. Los grupos no se asignan por nombres o plantillas. Los positivos no contienen inyecciones SQL de configuración, horarios, locks, seeds ni placements. A guarda, edita miembros, retira y vuelve a declarar mediante controles reales; la carrera ADMIN/PRODUCTION se prueba por API auténtica. B constituye el control de integración viable con Main/Vocal.

El witness de S1 incluye todas las obligaciones pendientes y ambos miembros de cada grupo futuro, sin convertirlos en placements aceptados. La aceptación usa propuesta real → Draft → validación → Stage SQL. Rollback/redo conserva decisiones, revisiones y autoridad; retirar una declaración que tocó un Stage histórico queda bloqueado incluso tras rollback a S0.

## Evidencia y validación

- `diagnostic/before.json.gz`, `diagnostic/memory-after.json.gz`: contrato previo, controles A–D, cierre, poda, branches y contrafactual esbuild `write:false`.
- `native/` y `repeat/`: recibos públicos UI/API/SQL, controles de permisos/CAS, ataques, Stages y continuación; manifiestos por hash de las fuentes ejecutadas.
- `physical.json`: ocupación reconstruida desde snapshots SQL, autoridad diaria y witness. Una reserva física por grupo; todos los participantes y recursos preservados.
- `determinism.json`: snapshots de Stage exactos entre dos bases y replay exacto de cada autoridad en proceso nuevo. Los UUID de grupo difieren entre bases; los fingerprints de búsqueda se comparan contra su propia autoridad, no se finge que sean configuraciones idénticas.
- `upgrade/`: 119 poblada → 120; filas originales, 599 tareas, 11 Stages históricos, snapshots, fuentes, lectores y RLS exactos. Nuevos helpers invoker, `search_path=''`, sin EXECUTE para clientes; los triggers tampoco tienen grant directo de servidor.
- `regressions/`, `checks/`, `validation.json`: resultados y límites reales de regresiones, suite, TypeScript/build, hashes históricos y CI.
- `a2/`: dos ejecuciones aisladas desde S0, **266/266, 11 Stages, 27.049 ramas**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`, snapshots/certificados exactos, 22 certificados revalidados. Única exclusión del informe completo: `iterations[].durationMs`. No equivale a autoría UI del A2.

Los ataques recalculan hashes de resultado/Draft/witness y comprueban autoridad incompleta, miembros inexistentes/ajenos, duración/espacio/recursos/persona, dependencias, ausencia de intersección, doble pertenencia, medio grupo, competencia, selección protegida, ejecución y locks, Data API, permisos, CAS concurrente y rollback atómico. Se registra el **primer** rechazo realmente ejecutado: un `RUN_RESULT_INVALID` o `STALE_OBLIGATION_SOURCES` no se atribuye a un guard físico posterior. El control material separado de medio grupo alcanza el guard conjunto. Los Stages aceptados también rechazan modificación directa con fingerprint coherente.

**Suite amplia:** 3.283 pass, cero fallos y cero exclusiones nuevas. El primer pase conservó un fallo de registro del nuevo consumidor read-only en el gate de aislamiento; la entrada concreta y la metadata de pruebas se corrigieron sin relajar sus assertions.

**Corrección de CI:** el primer head rechazaba días con envelope `configuration:null`, porque confundía ausencia de autoridad con operaciones vacías. `checks/unconfigured-day-causal.json` conserva el 500/201 y el error SQL real. 120 conserva ahora esa ausencia neutral; el ensayo de continuidad original vuelve a pasar, incluidos alta de día y RESTORE protegido. Se conservan los tres rechazos remotos iniciales del mismo camino. La CI del head vigente del [PR #1203](https://github.com/angelvicen92/production-planner/pull/1203) es la autoridad de cierre, sin merge automático.

`checks/attempts.json` conserva los fallos corregidos de harness y las interrupciones de Chromium por `ERR_NETWORK_CHANGED` al ejecutar redes Docker concurrentes. Los ensayos finales con navegador se serializan; no se amplían timeouts ni se cambian assertions para resolver el entorno.

## Reproducción

Node 20, dependencias exactas del lockfile, Docker local y Chromium. Directorios nuevos. Serializar los stacks Docker con navegador en una misma máquina.

```sh
npm run check
npm run check:migrations
npm run build
npx --no-install tsc -p docs/evidence/p0-u00y/tsconfig.json
node --import tsx --test --test-concurrency=1 engine/planner-next/integration/nativeJointGroups.spec.ts engine/planner-next/jointTasks.spec.ts script/demo/assistedSQLContracts.spec.ts script/demo/a2Preflight.spec.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00y/run.ts work/u00y-native --native
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00y/run.ts work/u00y-repeat --native
node --import tsx docs/evidence/p0-u00y/verify.ts work/u00y-native work/u00y-repeat work/u00y-determinism.json
node --import tsx docs/evidence/p0-u00y/physical.ts work/u00y-native work/u00y-physical.json
node --import tsx docs/evidence/p0-u00y/upgrade120.ts work/u00y-upgrade
node docs/evidence/p0-u00x/product-suite.mjs
python3 docs/evidence/p0-u00t/a2.py work/u00y-a2 --node /ruta/a/node20
```

`reproduce-before.ts` reconstruye el contrato previo sobre un `git archive` de la base autorizada y copia sólo el harness diagnóstico. `memory-probe.ts` requiere los módulos productivos de esa base literal: sus assertions de fragmentos impiden presentar una ejecución sobre el consumidor ya corregido como diagnóstico previo. Su entrada es el bundle `diagnostic/before.json.gz` extraído por nombre. Ningún experimento en memoria constituye un Stage.

El [inventario A2 desde UI](a2-ui-inventory.md) y `next-gap.json` delimitan la siguiente frontera: comprobar composición de los grupos con la estructura REQUIRED de Alfombra; comidas coordinadas y transiciones de coach siguen sin productor nativo completo. No se implementan aquí.
