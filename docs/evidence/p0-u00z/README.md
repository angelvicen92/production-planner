# P0-U00z — descansos operativos explícitos

Base exacta: `ade9fd65ccc91059a5a35f2b93b9ed5c0762b0a8`, U00y integrado. Rama `codex/p0-u00z-native-operational-meal-policies`. Un PR contra main; sin merge automático ni cambios en Supabase real, Replit o demo LA VOZ.

Estado: **capacidad productiva en las combinaciones certificadas; P0/A2 desde UI sigue abierto**. [PR único #1204](https://github.com/angelvicen92/production-planner/pull/1204), sin merge. `validation.json` fija los recibos locales y sus límites; la CI del PR identifica el head remoto comprobado. Los ensayos diagnósticos no constituyen Stages.

La autoridad diaria declara una pausa común para listas explícitas de espacios y recursos físicos, con ventana y duración. La unidad diaria es una ayuda de selección de sus miembros concretos, no otra obligación inferida. La severidad del contrato histórico es obligatoria/HARD; retirar la declaración desactiva esa obligación. No se ofrece una preferencia sin consumidor.

El productor reutiliza `operationalMealPolicies`, su preflight/adapter y consumidor, `apply_day_config_operation_v5`, CAS, revisiones/replay, fingerprints, sesiones, Draft y Stage. 121 extiende el writer existente en su lugar. No agrega otro wrapper de escritura ni nuevas tablas; los tres helpers SQL nuevos validan autoridad, certificado material y los triggers de las fronteras existentes. 001–120 permanecen literales.

## Auditoría anterior al producto

`diagnostic/receipts.json.gz` contiene el 400 auténtico de A/B, creadas con API/UI en PostgreSQL17/Auth/PostgREST/Chromium, y las mismas entradas con/sin declaración únicamente en memoria. A tiene dos subespacios y un recurso común; B tiene dos unidades físicas independientes y una tercera que recompone miembros. La pausa A es una sola obligación. B cambia la tarea recompuesta de posición para respetar las dos pausas, sin inferir otra. Ningún experimento altera S0/Draft/filas del día.

`diagnostic/memory-before.json.gz` activa únicamente el productor existente del witness físico para el nuevo contrato explícito. Un scope parcial conserva todas las tareas y todas las pausas pendientes en un mismo witness, sin aceptarlas. La continuación conserva sus decisiones previas. No cambia ordering, geometría, matching, heurísticas ni budgets.

El control adicional Main/Vocal llega a propuesta válida y falla en SQL con `ANCHORED_WITNESS_MAIN_CONTINUITY`; `diagnostic/main-boundary/` conserva el primer rechazo. El consumidor SQL histórico sólo reconocía la pausa global. 121 reconoce el puente de una pausa operacional declarada, cuya ventana/duración/miembros y conflictos se vuelven a comprobar materialmente.

El control de independencia visual localiza otra frontera precisa: `taskConflictsWithPolicy` y su autoridad incremental descontaban una ubicación incluso con `blocksSpace=false`. El contrafactual en memoria conserva los recursos y elimina exclusivamente esa ocupación ficticia. La autoridad nativa adopta expresamente la comprobación física; el contrato 088 mantiene su semántica literal. La UI/API siguen usando los ámbitos diarios existentes, sin un segundo modelo de agenda.

La evaluación adicional de comidas individuales encuentra una cuarta frontera causal: el motor produce cuatro tareas, dos comidas individuales y una pausa operacional válidas, pero el lector físico SQL compara las seis obligaciones contra el canal de cuatro tareas. `diagnostic/individual-before/` conserva el rechazo `ANCHORED_FUTURE_STRUCTURAL_WITNESS_REQUIRED` anterior a la reparación. No es agotamiento de búsqueda. El delta de 60 líneas en 121 autentica el canal individual (identidades reales, duración, ventanas, capacidad, locks, materialización y coherencia entre canales) y añade ocupaciones virtuales locales al mismo validador de dependencias/competencia/márgenes. No crea tareas persistidas, nuevas autoridades ni otro solver. `individual/` y `individual-repeat/` demuestran dos Stages auténticos, parcial/completo, en bases distintas. Los ataques con todos los hashes recalculados llegan a rechazo material por capacidad y conflicto real de participante, además de omisión, identidad, ventana, duración, recursos, discrepancia de canales y decisión protegida.

No se confunden rechazo de productor, incompatibilidad representacional, rechazo material del consumidor y búsqueda agotada. Los controles fallidos de harness y las interrupciones de entorno se registran por separado de los fallos de producto.

## Gate de producto y alcance

| Jornada | Resultado auténtico |
| --- | --- |
| A: unidad de plató con dos espacios y cámara compartida | 3/3 tareas, una pausa común elegida dentro de ventana; una actividad ajena conserva paralelismo. |
| B: dos unidades itinerantes y una tercera recomposición física | 4/4 tareas, dos pausas independientes; S1 conserva la segunda pendiente en witness y S2 conserva literalmente lo aceptado. No se infiere tercera comida. |
| D: ocupación física independiente de agenda/herencia | 4/4 tareas; pausa de ubicación explícita puede coincidir con tarea que no ocupa ese espacio; los miembros físicos mantienen sus propias indisponibilidades. |
| C: Main/Vocal y recurso declarado sin tareas consumidoras | 4/4 tareas; pausa común puentea continuidad Main, feeder paralelo y segunda pausa explícita materializada aunque no tenga tarea consumidora. |
| Operaciones conjuntas U00y + pausa explícita | 7/7 standalone y 11/11 Main/Vocal; una ocupación física conserva dos obligaciones y continuación protegida. |
| E: comidas individuales + pausa de recurso/espacio | 6/6 obligaciones; S1 acepta una preparación y conserva un witness global con ambos canales pendientes; S2 completa sin moverla. Capacidad individual 1. |

`native/` y `repeat/` contienen configuración mediante UI/API, revisión/origen, edición/retirada antes de Stage, propuestas/Draft/validación/Stage, consumo físico SQL, pantalla de pausas materializadas, rollback/redo y negativos. `determinism.json` reproduce exactamente revisión, replay, witness, contadores de trabajo y fingerprint dentro de cada autoridad (10 replays). Entre bases sólo normaliza los IDs opacos de políticas mediante sus miembros/ventana/duración; ninguna hora o asignación. `individual-determinism.json` añade cuatro replays exactos del caso E. `physical.json` comprueba recursos nominales y miembros de unidades contra los certificados y filas persistidas, incluyendo paralelismo y ubicación no ocupada.

Los negativos cubren referencias ajenas, ventanas/duración incoherentes, miembros duplicados, unidad vacía, permisos, Data API directa, CAS obsoleto, carrera real admin/producción 200/409 y fallo inyectado después de escribir autoridad con rollback completo. Los certificados operacionales falsificados se rechazan tanto en el consumidor privado como en el RPC público de validación (`public-rpc/`), con hash del resultado, tareas y Draft recalculados. Las pruebas conservan la primera barrera real: no atribuyen al validador físico lo que rechaza antes otro guard. También rechazan retirar pausas tras Stage, cambiar ocupaciones/recursos/duración protegidos o falsificar un Stage. E añade falsificaciones del canal individual con fingerprints recalculados. No se relajan protecciones ni se aceptan Stages manuales.

La actualización 120 → 121 sobre PostgreSQL 17.11 con 599 tareas y 11 Stages históricos mantiene exactamente las filas originales, snapshots, lectores, RLS, catálogo de cuerpos y grants privados (`upgrade/`). No adopta el histórico 088. El A2 importado se ejecuta dos veces: **266/266, 11 Stages, 27.049 ramas**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`; 22 certificados revalidados, snapshots exactos y reportes iguales salvo duración de ejecución (`a2/comparison.json`). No cambia budgets, timeouts ni assertions existentes.

La primera revisión publicada pasó sus 28 workflows, incluidas regresiones Main/Vocal, Reality anclado/independiente/A-B, U00y, U00g, rondas, cadenas, transporte, recursos nominales y altas posteriores a Stage (`checks/initial-head-ci.json`). El focal final de motor/servicio/contratos SQL/preflight pasa 45/45. La suite local amplia inicial tuvo 3289 aciertos y dos discrepancias de metadatos de catálogo; se corrigió el registro global a PARTIAL y se verificaron sus 26 pruebas afectadas. Se conservan los logs originales, sin ocultar esos fallos; la CI global posterior pasó. La composición individual amplía el gate del mismo PR, sin cambiar el tiempo máximo del workflow.

El control adicional de sustitución de una tarea pendiente por una comida en el canal ordinario es rechazado por `ANCHORED_WITNESS_AVAILABILITY_OR_LOCK`: el consumidor ordinario exige espacio real y la comida individual nativa tiene espacio nulo. Se conserva esa primera barrera existente, sin añadir otra excepción SQL ni atribuir el rechazo al nuevo chequeo de capacidad. Los focales intermedios también conservan el ajuste de aislamiento de imports y la versión 120 del fixture histórico de preflight; el focal final y la comparación de cuerpos reales 121 comprueban sus correcciones.

## Reutilización y límites

`reuse-cost.json`: 468 líneas añadidas / 30 retiradas en producto frente a la base exacta (líneas físicas del diff; excluye tests, harness y documentación), de ellas 299 en 121. Una columna JSONB, tres helpers SQL invoker privados, **cero tablas, cero nuevos writers y cero solvers**. Se extienden el writer v5, los lectores de transición/replay y el consumidor físico ya existentes; no se duplica el flujo de configuración. La UI resuelve una unidad en miembros explícitos y usa el mismo CAS y origen que el resto del día.

Las restricciones que permanecen son composición con anclajes, rondas, cadenas, setup, transporte y continuidad estructural diaria. No se amplían mediante un guard genérico: requieren evaluar sus consumidores y certificados reales. El contrato no admite dos obligaciones de pausa distintas para el mismo recurso físico; una recomposición comparte la indisponibilidad de sus miembros. Los nombres no gobiernan ninguna pausa. La severidad es HARD/REQUIRED o retirada; no existe modo soft certificado. La [matriz global](a2-ui-inventory.md) y `next-gap.json` priorizan la composición REQUIRED de Alfombra y su alimentación/recursos, después transiciones de coach y coordinación de estructuras. No proclaman un día A2 completo creado desde UI.

## Reproducción

Node 20, dependencias del lockfile, Docker local y Chromium. Los stacks de navegador se serializan. Los runners eliminan las variables Supabase heredadas y usan exclusivamente servicios descartables en loopback. Los manifiestos declaran las fuentes ejecutadas y las intervenciones de dispatch del harness.

```sh
npm run check
npm run check:migrations
npm run build
npx --no-install tsc -p docs/evidence/p0-u00z/tsconfig.json
node --import tsx --test --test-concurrency=1 engine/planner-next/integration/nativeOperationalMeals.spec.ts server/assistedProposalService.spec.ts script/demo/assistedSQLContracts.spec.ts script/demo/a2Preflight.spec.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00z/run.ts work/u00z-native --native
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00z/run.ts work/u00z-repeat --native
node --import tsx docs/evidence/p0-u00z/upgrade121.ts work/u00z-upgrade
node --import tsx docs/evidence/p0-u00z/run.ts work/u00z-individual --individual-diagnostic --individual-success
node --import tsx docs/evidence/p0-u00z/run.ts work/u00z-individual-repeat --individual-diagnostic --individual-success --public-negatives
node --import tsx docs/evidence/p0-u00z/verify.ts work/u00z-individual work/u00z-individual-repeat work/u00z-individual-determinism.json --individual
python3 docs/evidence/p0-u00t/a2.py work/u00z-a2 --node /ruta/absoluta/node20
```

`memory-probe.ts` y `scope-probe.ts` son experimentos previos: requieren las fuentes exactas anteriores a sus deltas y las entradas declaradas de la auditoría, no deben ejecutarse sobre el producto final para simular una reproducción previa. Los artefactos conservan la intervención literal.
