# P0-U00z — descansos operativos explícitos

Base exacta: `ade9fd65ccc91059a5a35f2b93b9ed5c0762b0a8`, U00y integrado. Rama `codex/p0-u00z-native-operational-meal-policies`. Un PR contra main; sin merge automático ni cambios en Supabase real, Replit o demo LA VOZ.

Estado del candidato: **EN VALIDACIÓN**. Este archivo se completa con los recibos finales; los ensayos diagnósticos no constituyen Stages.

La autoridad diaria declara una pausa común para listas explícitas de espacios y recursos físicos, con ventana y duración. La unidad diaria es una ayuda de selección de sus miembros concretos, no otra obligación inferida. La severidad del contrato histórico es obligatoria/HARD; retirar la declaración desactiva esa obligación. No se ofrece una preferencia sin consumidor.

El productor reutiliza `operationalMealPolicies`, su preflight/adapter y consumidor, `apply_day_config_operation_v5`, CAS, revisiones/replay, fingerprints, sesiones, Draft y Stage. 121 extiende el writer existente en su lugar. No agrega otro wrapper de escritura ni nuevas tablas; los tres helpers SQL nuevos validan autoridad, certificado material y los triggers de las fronteras existentes. 001–120 permanecen literales.

## Auditoría anterior al producto

`diagnostic/receipts.json.gz` contiene el 400 auténtico de A/B, creadas con API/UI en PostgreSQL17/Auth/PostgREST/Chromium, y las mismas entradas con/sin declaración únicamente en memoria. A tiene dos subespacios y un recurso común; B tiene dos unidades físicas independientes y una tercera que recompone miembros. La pausa A es una sola obligación. B cambia la tarea recompuesta de posición para respetar las dos pausas, sin inferir otra. Ningún experimento altera S0/Draft/filas del día.

`diagnostic/memory-before.json.gz` activa únicamente el productor existente del witness físico para el nuevo contrato explícito. Un scope parcial conserva todas las tareas y todas las pausas pendientes en un mismo witness, sin aceptarlas. La continuación conserva sus decisiones previas. No cambia ordering, geometría, matching, heurísticas ni budgets.

El control adicional Main/Vocal llega a propuesta válida y falla en SQL con `ANCHORED_WITNESS_MAIN_CONTINUITY`; `diagnostic/main-boundary/` conserva el primer rechazo. El consumidor SQL histórico sólo reconocía la pausa global. 121 reconoce el puente de una pausa operacional declarada, cuya ventana/duración/miembros y conflictos se vuelven a comprobar materialmente.

El control de independencia visual localiza otra frontera precisa: `taskConflictsWithPolicy` y su autoridad incremental descontaban una ubicación incluso con `blocksSpace=false`. El contrafactual en memoria conserva los recursos y elimina exclusivamente esa ocupación ficticia. La autoridad nativa adopta expresamente la comprobación física; el contrato 088 mantiene su semántica literal. La UI/API siguen usando los ámbitos diarios existentes, sin un segundo modelo de agenda.

No se confunden rechazo de productor, incompatibilidad representacional, rechazo material del consumidor y búsqueda agotada. Los controles fallidos de harness y las interrupciones de entorno se registran por separado de los fallos de producto.

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
python3 docs/evidence/p0-u00t/a2.py work/u00z-a2 --node /ruta/absoluta/node20
```

`memory-probe.ts` y `scope-probe.ts` son experimentos previos: requieren las fuentes exactas anteriores a sus deltas y las entradas declaradas de la auditoría, no deben ejecutarse sobre el producto final para simular una reproducción previa. Los artefactos conservan la intervención literal.
