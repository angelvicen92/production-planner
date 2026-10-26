# P0-U00v — ámbito operativo de actividades independientes

Base autorizada y `main` contrastado: `b1895fa90f52018abbdefab1c224cb7387f54a39` (U00u integrado). La autoría diaria permite elegir una actividad real, su agenda, herencia de recursos, ocupación física y, opcionalmente, una unidad nominal diaria. Los recursos directos se conservan como declaraciones, separados de los integrantes materializados. Las dos jornadas nuevas completan UI → propuesta → Draft → validación → Stage en PostgreSQL 17, Auth, PostgREST y Chromium descartables. No se importa A2 para construirlas.

## Hipótesis y gate anterior al productor

**X:** no hay un editor diario de los tres ámbitos para tareas independientes. **Y:** `applyNewDayPlannerConfiguration` produce roles y dependencias desde snapshots; `taskOperationScope.ts` y el consumidor ya tienen los ámbitos, pero falta una autoridad diaria editable. **Z:** Producción no puede expresar agenda itinerante y recursos propios conservando la exclusividad física. **W:** producir únicamente esa declaración por tarea real mediante la operación diaria versionada. **M:** dos jornadas nuevas hasta Stage, con capacidad efectiva distinta del mismo día sin declaración.

`causal/stack/receipts.json.gz` contiene EngineInput, filas SQL, revisión/replay, S0, asignaciones, preflight, adapter, scope, problema, decisiones de colocación, resultados y validación. Se crean Corner y Hall, CAM1 fija de Corner, unidad A con cámara/sonido, kit directo, cuatro participantes y disponibilidades reales. No hay placements, semillas ni locks suministrados al constructor.

Sobre una copia **en memoria del mismo EngineInput**, sólo Reality recibe `ITINERANT_UNIT`, `OPERATION_ONLY`, `blocksSpace=true`; conserva su unidad nominal auténtica y el kit. El input original permanece idéntico y el experimento no escribe Draft ni Stage. Ordinario: Reality 09:40–10:00, CAM1 en Hall 09:20–09:40. Contrafactual: ambas 09:20–09:40. Ambas ejecuciones completan 4/4, HARD válidas, con **5 ramas standalone**, cero ramas core/matching estructural y presupuesto original de 10.000. El futuro registra una comprobación y una materialización, sin poda imposible.

La primera frontera está en el productor, antes de preflight. El consumidor conserva el lugar y rechaza Corner simultáneo, otro trabajo de la misma unidad y el kit directo compartido; permite CAM1 en otro espacio. `*-physical-probes.json` identifica la primera causa canónica de cada rechazo. Agenda, herencia y ocupación permanecen ortogonales. No se modifica solver, heurística, ordering, matching, Future Feasibility, budgets ni timeouts.

## Autoridad mínima y persistencia

```mermaid
flowchart LR
 UI[Actividad real y selects] --> API[PUT day-configuration autenticado]
 API --> CAS[Revisión/CAS y bloqueo del plan]
 CAS --> A[plans.daily_task_operation_scopes]
 A --> R[Revisión y replay inmutables]
 A --> I[EngineInput: perfil + composición + ámbitos]
 I --> P[Preflight y adapter]
 P --> S[Solver y validador canónicos]
 S --> D[Propuesta y Draft]
 D --> V[Validación material SQL]
 V --> ST[Stage aceptado]
 ST --> SQL[daily_tasks: directos y selección materializada]
 SQL --> UI2[Timeline / Lista / agenda y ocupación física]
 R --> UI2
```

Se reutiliza `PUT /api/plans/:id/day-configuration`, `apply_day_config_operation_v5`, revisión, identidad/replay, captura de fuentes y transición de sesión. La migración incremental **117** añade una columna nullable y guards privados invoker; no crea otro sistema de configuración ni persiste EngineInput. 001–116 y el contrato histórico 088 permanecen literales. Ausencia conserva los defaults y fingerprints anteriores; ningún día adopta la declaración por despliegue.

Cada policy contiene identidad diaria de tarea, los tres ámbitos independientes, unidad diaria fija opcional y recursos directos capturados antes de materializar. `null` conserva el requisito de plantilla; un dominio elegible continúa sin selección. No se escoge el primer equipo del catálogo. La UI muestra nombres, valor efectivo, origen/revisión, recursos directos y motivos de bloqueo; permite editar y retirar antes de protección. ADMIN y PRODUCTION escriben con CAS. Los demás actores y Data API no obtienen autoridad de escritura.

El escritor reconstruye el delta permitido y sus fingerprints, contrasta tarea/plantilla/ubicación/unidad/miembros/recursos diarios y conserva provenance. El trigger universal de revisión y el lector de EngineInput contrastan materialmente la declaración y su proyección. Recalcular hashes no autoriza inventar una policy, omitir su proyección ni cambiar agenda, herencia, ocupación, unidad o recursos directos. Las referencias tienen protección de vida y la materialización usa los escritores Assisted existentes.

SQL distingue **consumo físico derivado** de **asignaciones persistidas**. Una tarea ordinaria puede tener `assignedResourceIds=[]` y consumir CAM1 por su ubicación. El guard deriva esa cámara de las tablas diarias al comprobar conflictos; no exige convertirla en recurso directo ni permite ocultarla borrando el array. `OPERATION_ONLY` conserva directos, locks y miembros. El primer borrador del guard confundía ambos canales y rechazó una propuesta válida; el recibo del intento nativo 3 conserva ese fallo. Se corrigió la comprobación nueva, sin alterar la proyección productiva anterior ni relajar su validación canónica.

## Dos jornadas hasta aceptación

`native/receipts.json.gz` indexa los JSON originales por nombre; `manifest.json.gz` y `harness.json.gz` vinculan el código ejecutado. `ui-receipts.json` conserva las operaciones disparadas en Chromium y `api-receipts.json` las operaciones de preparación/negativos. Los únicos SQL de preparación son plataforma, ledger y roles Auth; los ataques usan transacciones revertidas.

| Jornada | Resultado aceptado | Capacidad y continuación |
|---|---|---|
| A | 4/4, S1 | Reality Corner 09:00–09:20 con cámara/sonido móviles y kit; CAM1 en Hall simultánea; ordinaria de Corner y segunda consumidora de unidad esperan hasta 09:20. |
| B | 6/6, S1→S2 | Otros participantes, espacios, recursos, unidad, ventanas y duraciones. Reality Atrium 10:00–10:15; cámara fija en Garden simultánea; segundo Reality 10:20–10:35 respeta la transición de unidad de 5 min. La obligación de Gallery consume el kit directo y espera hasta 10:15. |

B acepta primero sólo Reality y cámara fija. El witness de la segunda consumidora sigue siendo contexto analítico (`B-future-witness.json`, 24 inicios admisibles); no tiene placement en el primer Draft/Stage. S2 conserva literalmente todas las tareas aceptadas en S1. Ambos días comprueban rollback a S0, denegación de cambios sobre decisiones históricas y redo exacto. Las tareas permanecen pendientes de ejecución y no se crean locks para guiar al constructor.

`*-ordinary-input.json` y `*-ordinary-result.json` conservan los mismos días antes de la declaración. El cambio de herencia modifica el conflicto efectivo con CAM1, y la unidad seleccionada añade su demanda física. El gate causal anterior a implementación aísla los ámbitos sobre un input con la misma unidad ya fija.

Timeline y Lista muestran exactamente **una tarjeta visible** por obligación en la unidad diaria apropiada, con ubicación real conservada. La consulta separada de ocupación física refleja Corner/Atrium sin crear otra obligación. Los paneles retenidos ocultos del workspace no son tarjetas visibles adicionales. Capturas `*-Timeline.png`, `*-Lista.png` y `*-occupancy.png`.

Los negativos incluyen unidad desconocida/ajena/vacía/incompatible, espacio inexistente, recursos ausentes/omitidos/duplicados, ejecución `done/in_progress`, locks, propuesta pendiente, CAS obsoleto y carrera 200/409, falsificación con hashes coherentes, escritura directa, conflicto físico, unidad/ventana incompatible y conflicto HARD del kit directo. Los guards de validación y Stage reconstruyen las autoridades físicas de los competidores. La inyección transaccional verifica que la autoridad ya se escribió antes de fallar, y después comprueba rollback íntegro de plan, revisiones y sesión.

## Regresiones y límites

`validation.json` separa gates finales, intentos fallidos y límites; `regressions/` conserva los recorridos reutilizados. El ensayo poblado 116→117 compara todas las filas originales, snapshots, revisiones, lectores y políticas, verifica permisos efectivos y cuerpos completos de las funciones nuevas. Mantiene las dos autoridades de seguridad históricas de U00t; no modifica ni presenta como resuelta la política de lectura del ledger anterior.

A2 completo, dos procesos Node 20 nuevos: **266/266, 11 Stages, 27.049 ramas**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. Reports íntegros iguales salvo `iterations[].durationMs`; snapshots/certificados exactos y **22 certificados revalidados**. Las duraciones no se presentan como mejora ni regresión de CPU.

Las dos jornadas certificadas usan STANDALONE_ONLY; las regresiones Main/Vocal conservan sus contratos previos y no certifican todas las combinaciones. Contrato certificado: actividades auxiliares ordinarias independientes, unidades nominales, recursos concretos, espacios reales y perfiles nativos sin estructuras combinadas. El editor conserva un dominio elegible sin convertirlo en selección; esto no certifica elección automática de una operación compuesta. Montajes, transporte estructural, rondas, cadenas, operaciones conjuntas/ancladas y comidas coordinadas mantienen sus propios contratos y rechazos explícitos. No hay adopción histórica, nuevo solver, horarios humanos prefijados, despliegue ni cambios en Supabase real o jornadas publicadas.

La siguiente única brecha recomendada es **elección A/B de operaciones ancladas completas**, incluyendo las tres declaraciones A2. Fuente 03 exige cerrar el eje Main/feeder antes de rellenar standalone y Fuente 06 prohíbe fijar A/B por copiar el horario humano. El canon contiene tres acompañamientos; U00u sólo certifica uno nominal por día. Esta es una frontera anterior a poder construir íntegramente ese eje desde UI. Operaciones conjuntas, comidas/coaches y atributos como `requiresBand` siguen abiertos y no se implementan aquí. El [inventario U00u](../p0-u00u/a2-ui-inventory.md) mantiene P0 general abierto.

## Reproducción

Node 20 y dependencias exactas del lockfile, Docker local y Chromium. Los runners eliminan credenciales heredadas y restringen sus conexiones a loopback; destruyen exclusivamente sus servicios.

```sh
npm ci
npm run check && npm run check:migrations && npm run build
npx --no-install tsc -p docs/evidence/p0-u00v/tsconfig.json
npx --no-install tsx --test engine/planner-next/integration/nativeTaskOperationScopes.spec.ts
node --import tsx docs/evidence/p0-u00v/upgrade117.ts /tmp/u00v-upgrade
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00v/run.ts /tmp/u00v-native --native
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00v/regressions.ts /tmp/u00v-anchored anchored
python3 docs/evidence/p0-u00t/a2.py /tmp/u00v-a2 --node /ruta/a/node20
```

El diagnóstico original se repite archivando la base exacta y copiando sólo `run.ts`/`journey.ts`; ejecutar sin `--native`. El manifiesto registra el único cambio de dispatch en el archivo descartable. No se aplica el contrafactual a producto.
