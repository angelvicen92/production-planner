# P0-U00w — varias operaciones ancladas y elección física A/B

Base autorizada: `25aaa056970e86f0fd13e90570fa1fcf5582a97c`, merge #1200, migración 117. Rama: `codex/p0-u00w-anchored-multi-unit-choice`. Un único PR contra main, sin merge ni despliegue. Todas las bases, Auth, PostgREST y sesiones Chromium son descartables y locales; cero escrituras remotas de aplicación.

**Resultado acotado:** autoría UI de tres operaciones reales anterior → Main → posterior, unidad fija o dominio explícito, selección común durante los 45 minutos, propuesta auténtica, Draft, validación y Stages SQL. El Stage parcial conserva cuatro decisiones y un witness físico completo de las otras operaciones; la continuación completa 17/17. Esto cierra la brecha concreta U00u/U00v de declaraciones múltiples y elección del equipo, no P0 ni A2 íntegramente introducido desde UI.

## Primer bloqueo y decisión causal

La [auditoría previa](authority-audit.md) y `diagnostic/before.json.gz` separan dos defectos. El productor v1 rechaza más de una declaración y el dominio A/B **antes del solver**. En el contrafactual exclusivamente en memoria, el consumidor acepta el dominio pero enumera sólo alternativas nominales de recurso: termina falsamente completo sin unidad seleccionada en ninguno de los tres segmentos. No es inviabilidad física ni agotamiento de presupuesto.

| Mismo día diagnóstico, sin placements ni seeds | Antes | Contrafactual reparado en memoria |
| --- | --- | --- |
| Una operación, A fijo, obligación externa A de 60 min | No completa, 20 ramas | Control físico negativo conservado |
| Una operación, B fijo | 5/5 HARD, 19 ramas | Control positivo conservado |
| Una operación, dominio A/B | Falso 5/5, ninguna unidad, 19 ramas | B común, 5/5 HARD, 27 ramas |
| Tres operaciones, dominio A/B | Falso 17/17, ninguna selección, 88 ramas | Tres selecciones completas, 17/17 HARD, 135 ramas |

Las ocho asignaciones fijas del segundo diagnóstico contienen cuatro positivos y cuatro negativos. Por tanto, existe solución física sin convertir la secuencia humana ni la unidad del PDF en una exigencia. `diagnostic/memory-after.json.gz` conserva los cinco cuerpos transformados mediante esbuild `write:false`, sus hashes y los resultados anteriores al delta productivo. Los 135 del prototipo no se comparan como mejora con las 511 ramas del recorrido nativo final: son contratos/recorridos distintos; cada comparación causal mantiene modelo, configuración y presupuesto idénticos.

Dos pérdidas adicionales se aislaron antes de sus correcciones: la lista geométrica omitía el inicio de una ventana estrecha de unidad (09:20–10:05), y el preflight de continuación comparaba la unidad materializada con el `undefined` de un dominio aún no fijado. `diagnostic/unit-window.json.gz` y `diagnostic/continuation.json.gz` contienen inputs, antes/después e intervención literal. La clave de matching ahora conserva una única decisión de equipo bajo la raíz del anclaje tanto cuando recibe el anchor como cuando recibe la tripleta; `diagnostic/edge-key-red.txt.gz` conserva el test rojo. `diagnostic/edge-identity.json.gz` muestra que esa corrección de identidad no cambia el resultado ni el trabajo del caso nativo concreto: no se atribuye una ganancia inexistente.

## Camino completo hasta Stage

1. Los catálogos y tareas se crean mediante APIs de producto; Chromium crea cada jornada y declara sus operaciones mediante selectores reales. `journey.ts` no importa el fixture A2 ni el PDF. Las únicas preparaciones SQL positivas son plataforma/roles Auth; los horarios proceden del constructor.
2. El writer diario existente aplica CAS, revisión, fuente auténtica y replay. El contrato v1 permanece literal; una selección de dominio o segunda operación adopta explícitamente v2. Fijo, dominio y selección materializada son autoridades diferentes.
3. `buildEngineInput` → `applyDailyAnchoredAccompaniments` reconstruye tareas, unidades, composición física, recursos directos, herencia y revisión. El adapter emite `nativeAnchoredAccompanimentsVersion:2` exclusivamente desde esa autoridad. Las jornadas históricas no adoptan el nuevo comportamiento.
4. Preflight valida identidades, dependencias, dominios equivalentes entre miembros, recursos continuos y selección protegida. `resolveAssistedScope`/`expandVisiblePrerequisites` cierra tripleta y Vocal; `buildAssistedProblem` separa tareas visibles, supporting y contexto protegido.
5. El mismo core Main/feeder enumera `mainOperationVariants`, que reutiliza `materializeItinerantUnitAssignment`. Cada variante elige una unidad para la tripleta completa. `materializeAnchoredOperation` consume esa variante en los tres miembros. No se introduce un segundo planificador.
6. Geometría utiliza los límites inferiores existentes y añade eventos de inicio de disponibilidad de unidad/miembros, desplazados por el segmento anterior. No recorre una rejilla nueva ni entrega horas humanas como seed.
7. Matching residual, equivalencia y reparación usan identidad de variante bajo el anchor. Los descartes físicos de A no eliminan B. `consumer.ts` registra las elecciones ordenadas y el waterfall causal del core; `*-consumer.json` conserva adapter, scope, problema efectivo, geometría/diagnóstico, matching y contadores.
8. Assisted reutiliza la proyección colectiva y el witness físico existentes. La Future Feasibility incluye todas las operaciones pendientes con una elección íntegra, no tres huecos independientes. El witness no se copia al Stage parcial.
9. `validatePlan` exige unidad elegible común, composición física auténtica, continuidad y ocupaciones. `assistedProposalService` revalida el witness y preserva unidades/recursos anteriores antes de materializar el Draft.
10. SQL 118 reconstruye las mismas autoridades desde tablas y revisión, verifica la propuesta exitosa auténtica y su hash, las identidades/tareas, dominio, unidad común, recursos directos/byItem/espacio/zona/locks, disponibilidad y conflictos físicos, participante/coach, dependencias, adyacencia y continuidad Main. Combina recursos explícitos y coach implícito al comparar consumo físico. El writer, validación canónica y aceptación existentes realizan la transición a Stage; no se inserta un Stage para cubrir una assertion.
11. `*-S*-sql-selection.json` vuelve a leer `assisted_planning_stages.snapshot_json` y `plan_itinerant_unit_snapshots` y reconstruye la unidad común y sus miembros. No se inventa una columna de equipo en `daily_tasks`: allí se verifican los recursos físicos persistidos. La UI reconstruye la selección desde Draft/Stage y la muestra después de recargar.

El primer descarte irreversible original está entre 5 y 7: nunca se generaba la variante de unidad. La pérdida de continuación ocurría antes de volver a buscar. Un rechazo SQL posterior por un peer virtual se conserva en `diagnostic/virtual-main-sql-red.json.gz`: el helper antiguo trataba todo peer en Main como físico. Sólo el nuevo helper 118 consulta `blocksSpace` auténtico de la revisión; 116 permanece literal.

## Gate nativo

`native/receipts.json.gz` y `repeat/receipts.json.gz` contienen los recibos públicos completos. `determinism.json` acredita igualdad de tres snapshots y fingerprints/trabajo entre las dos bases y seis replays en procesos fríos.

| Jornada nueva | Autoría y presión física | Resultado real |
| --- | --- | --- |
| Día 1, plan 1, 5 obligaciones | Main/Vocal + tripleta 15/15/15; A/B con cámara/sonido propios; externa A de 60 min; participante externo disponible sólo 09:00–10:15; B disponible hasta 10:05 | A fijo: conflicto/no propuesta sin agotar presupuesto. B fijo: 5/5. Dominio: elige B con exactamente los mismos placements/recursos que B fijo; S1, HARD/REQUIRED válido; 27 ramas |
| Día 2, plan 2, 17 obligaciones | Tres participantes anclados, dos participantes Main ordinarios, cinco Vocal, dos unidades y una externa A de 30 min. Los seis segmentos virtuales usan el propio espacio Main; un recurso fijo auténtico pertenece sólo a los cinco Main físicos | S1 coloca 4 obligaciones, protege la primera operación y conserva witness de 17. S2 añade 13 y completa 17/17. Una unidad por cada tripleta; 511 y 121 ramas respectivamente |
| Control de capacidad compartida, otra base | A y B comparten cámara física; externa A presiona el mismo intervalo | No propuesta, sin agotamiento; S0 intacto y ningún Stage fabricado; `shared/receipts.json.gz` |

Los identificadores de unidades son diarios; el segundo día no reutiliza los IDs del primero. El orden de declaración no impone orden HARD entre operaciones: el test focal fuerza otro orden mediante disponibilidades y lo resuelve. Cada búsqueda conserva 10.000 ramas, 50 backtracks, 20 patterns, bestK 3. Los contadores completos registran matching, reparaciones, patrones, arquitectura y profundidad; no se comparan tiempos de CPU como progreso causal.

## Negativos, seguridad y persistencia

Cada base nativa certifica 39 falsificaciones coherentes de resultado/Draft/witness (12 + 14 + 13), recalculando fingerprint del witness, Draft y hash SQL de resultado: ausencia/unidad no elegible, split anterior/posterior, todas las operaciones forzadas a A con solapamiento físico, omisión de composición/directos, disponibilidad, interrupción, dependencia, identidad, Main virtual falso, dominio falso, witness futuro incompleto/split y cambio de selección protegida. Todos se rechazan y revierten. Además, `*-immutable-stage-forgery.json` comprueba que `service_role` no puede actualizar directamente el Stage, incluso recalculando el fingerprint.

Los negativos de configuración cubren unidad sin miembros, referencias inexistentes, dominio vacío/duplicado/ambiguo, tarea compartida, miembros repetidos/ausentes, roles viewer/aux/sin rol/anon, CAS stale y carrera real 200/409. Hay edición/retirada/restauración legal antes de protección, fallo atómico después de autoridad con rollback, rechazo de retirada protegida, rollback/redo y rechazo 409 de la propuesta anterior obsoleta.

Los ataques de estado `done`/`in_progress`/time-lock cambian la fuente en transacciones que se revierten: la primera barrera observada es `STALE_OBLIGATION_SOURCES`. No se atribuye ese rechazo a un guard posterior que no llegó a ejecutarse. Los tests de engine y guards existentes protegen esos estados; no se relaja ninguna condición HARD/REQUIRED.

118 no agrega tablas ni políticas RLS. Los cuatro helpers nuevos son `SECURITY INVOKER`, `search_path=''`, sin EXECUTE para PUBLIC/anon/authenticated, con EXECUTE sólo para service_role. `upgrade/` conserva antes/después de 117 poblada → 118: todas las filas originales, 599 tareas, 11 Stages históricos, fuentes, snapshots, lectores y políticas permanecen exactos. Los gates auditados comparan cuerpos y grants reales, no sólo presencia de firmas. Las migraciones 001–117 y el histórico 088 no cambian.

## Regresión y límites

`regressions/` conserva U00u (dos jornadas, tres Stages y agendas), U00v (dos jornadas 4/4 y 6/6, tres Stages, agenda/herencia independientes, rollback/redo), recursos nominales U00l (11/11 y 6/6), comidas individuales (6/6 y 12/12, 19 ataques SQL), transporte Main/standalone, rondas, cadenas REQUIRED y altas posteriores a Stage. Cada ejecución declara sus hashes; algunas etiquetas `base` de runners reutilizados son históricas, no identifican el checkout real. El manifiesto U00w y los hashes permiten comprobarlo.

`a2/` conserva dos ejecuciones desde S0: **266/266, 11 Stages, 27.049 ramas**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`, snapshots exactos y 22 certificados revalidados HARD/REQUIRED. La única exclusión al comparar el informe completo es `iterations[].durationMs`. Es benchmark de motor, no importación UI ni nuevo Stage SQL. `a2/execution-manifest.json.gz` distingue la base autorizada de la etiqueta histórica literal del runner reutilizado.

La primera integración activaba el witness nuevo por número de anclajes y alcanzó el límite original en el histórico A2. Se corrigió mediante adopción explícita v2; no se incrementó el presupuesto ni cambió el fixture. [validation.json](validation.json) registra los checks locales; la CI del PR certifica el head publicado.

Limitaciones explícitas:

- Un segmento anterior y uno posterior por declaración; el consumidor general histórico no constituye una ampliación automática de ese contrato nativo.
- El writer conserva el bloqueo de edición/retirada de la autoridad completa cuando hay decisiones protegidas. No se certifica editar otra operación pendiente después de un Stage; sí continuarla con la elección protegida anterior.
- Gate nuevo certificado con pausa global. La combinación v2 con comidas individuales flexibles/políticas operativas y otras estructuras no está certificada por estos días. El witness SQL exige todas las tareas diarias no canceladas en su canal de tareas; no se presenta como soporte de fuentes de comida transformadas a otros canales. Los gates existentes de comidas y las jornadas v1 permanecen aprobados. No hay excepciones HARD ocultas para hacer pasar esa combinación.
- Se conservan los rechazos existentes de combinación con scopes independientes, setups, rondas, cadenas, joints, transporte y comidas operativas. No se eleva toda la familia Reality ni la coordinación A2 a PRODUCTIVE.

La siguiente brecha comprobada es **componer en una jornada nativa Main/Vocal + anclajes A/B + Reality independiente con ámbitos operativos propios**. [next-gap.json](next-gap.json) aplica en memoria una declaración a una tarea auténtica del segundo día: `withDailyTaskOperationScopes` rechaza con 422 `UNSUPPORTED_TASK_SCOPE_COMBINATION` antes de preflight. `anchoredCombinationSupported` impone la frontera recíproca. No se afirma inviabilidad física ni que el productor de scopes exija siempre STANDALONE_ONLY. Operaciones conjuntas, comidas coordinadas, transiciones de coach y requiresBand siguen pendientes por separado.

## Reproducción

Requisitos: Node 20, `npm ci`, Docker, Chromium y ningún dato de producción. Seleccionar `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` si se usa el navegador del sistema. Los runners eliminan las variables Supabase heredadas y sólo crean servicios en loopback.

```sh
npm run check && npm run check:migrations && npm run build
npx --no-install tsc -p docs/evidence/p0-u00w/tsconfig.json
npx --no-install tsx --test --test-concurrency=1 engine/planner-next/integration/nativeAnchoredChoice.spec.ts engine/planner-next/integration/nativeAnchoredAccompaniment.spec.ts script/demo/assistedSQLContracts.spec.ts script/demo/a2Preflight.spec.ts
node --import tsx docs/evidence/p0-u00w/upgrade118.ts work/u00w-upgrade
node --import tsx docs/evidence/p0-u00w/run.ts work/u00w-native --native
node --import tsx docs/evidence/p0-u00w/run.ts work/u00w-repeat --native
node --import tsx docs/evidence/p0-u00w/verify.ts work/u00w-native work/u00w-repeat work/u00w-determinism.json
node --import tsx docs/evidence/p0-u00w/run.ts work/u00w-shared --native --shared-negative
node --import tsx docs/evidence/p0-u00w/next-gap.ts work/u00w-native/native/multi-input.json work/u00w-next-gap.json
python3 docs/evidence/p0-u00t/a2.py work/u00w-a2 --node /absolute/path/to/node20
```

Todos los directorios de salida deben ser nuevos. `.github/workflows/p0-u00w-anchored-unit-choices.yml` reproduce migración, gates, dos bases, reconstrucción fría y capacidad compartida; sólo publica recibos JSON/PNG permitidos. Los logs privados de servidor/JWT/storage no se empaquetan.

Los scripts `memory-probe.ts`/`memory-delta.ts` pertenecen al experimento **anterior**: ejecutar sobre un archive de la base exacta con ese harness copiado y los JSON originales de `diagnostic/before.json.gz` extraídos. Sus assertions de fragmentos impiden aplicar el delta sobre un consumidor ya reparado. `window-probe.ts` y `continuation-probe.ts` documentan las intervenciones incrementales históricas y sus rutas de trabajo originales; no son comandos del gate final ni se presentan como replay directo del head actual. Los cuerpos y resultados literales están archivados; la reproducción fría del producto final es `verify.ts`.
