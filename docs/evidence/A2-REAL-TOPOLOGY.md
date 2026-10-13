# A2 real: topología, recuperación y evidencia del producto

Base verificada: `612e47ea3a4c6c6fc4918b6814dcda8681f89c71`. Rama única:
`codex/a2-existing-topology-reconciliation`. Los resultados medidos y hashes
están en [A2-REAL-TOPOLOGY.json](A2-REAL-TOPOLOGY.json). Esta Evidence es
descriptiva; las Fuentes oficiales 00–07 conservan la autoridad.

## Diagnóstico causal

Se revisaron los PR [1113](https://github.com/angelvicen92/production-planner/pull/1113),
[1114](https://github.com/angelvicen92/production-planner/pull/1114),
[1115](https://github.com/angelvicen92/production-planner/pull/1115) y
[1116](https://github.com/angelvicen92/production-planner/pull/1116), sus Evidence
y CI verde. Se conservan sus contratos de recursos efectivos, UI Assisted,
reinicio, import seguro y protección frente al Reset Legacy.

La cadena comprobada fue Fuente 06 → manifest/expansión → importador →
identidades/padres y snapshots del día → `buildEngineInput` → adapter → scope →
geometría/matching/Future Feasibility → validación → propuesta/Draft → Stage →
SQL → UI. El modelo anterior situaba Redes en Recursos de P14 y le proyectaba
CAM1: una asignación espacial errónea se convertía en exclusividad HARD. El
modelo corregido sitúa sus 18 obligaciones en Maqui/Pelu, sin CAM1 ni descanso
P14, y conserva cualquier requisito explícito distinto.

La corrección admite simultaneidad Redes/Pasillo y Redes/Corner entre
participantes distintos, conservando dependencias, capacidad 1 de cada espacio
y exclusividad CAM1 entre Corner/Pasillo. El control anterior no presentaba
solapamientos Redes/Pasillo; el control corregido sí. No se convierte una
diferencia de fingerprint en regresión ni se afirma reducción global de estancia.

La selección efectiva también cambia: la unidad A/B pasa de 10 a 8 obligaciones
al reconciliar dos operaciones Reality con Corner; P14 pasa de 58 a 42
(`58 - 18 Redes + 2 Reality en Corner`), y Redes aparece como un scope propio
de 18. El resto del conteo se conserva: 266 obligaciones en once aceptaciones,
frente a diez en el modelo anterior. CAM1 pasa de 51 a 35 tareas efectivas:
retira las 18 Redes y añade las dos operaciones Reality del mismo Corner.

Además apareció un agotamiento de búsqueda al usar las identidades reales de
Totales: el orden numérico 33/34 invertía los ejes de las dos salas respecto de
los IDs source. Con 100.000 branches no había propuesta; un control isomorfo
que cambiaba sólo space IDs encontraba solución en 49.137. El ajuste mínimo
ordena lanes por demanda estructural y desempate estable de tareas, conservando
las identidades físicas, sincronización y validadores: el mismo caso real pasó
en 55.625 branches. Estos controles se midieron antes de restaurar CAM5/CAM6;
el ensayo final certifica también esos recursos. No se aumentó ningún budget.
El experimento de cambiar hashes de perfiles empeoró el resultado y se retiró.

## Reconciliación física

Se evoluciona `script/demo/a2SpatialTopology.ts`, sin crear otro catálogo
operativo. El manifest v2 conserva las 23 identidades source originales y
añade explícitamente Redes. Los alias son provenance, nunca capacidades nuevas.

| Familia/source | Destino efectivo del ensayo | Autoridad conservada |
|---|---|---|
| Estudio 7 | 48 / zona 1 | Ensayo 15 min; coach y Reality efectivos |
| Caracolas | José María 41, Lucía 35 / zona 13 | coaches y transición |
| P14 | Corner 31, Pasillo 3, Giratutto 32 / zona 3 | CAM1 en Corner/Pasillo; padres históricos |
| Reality Hall / Influencer / Corner Music | 4 / 31 / 31 | Hall distinto de Pasillo; alias de Corner comparten capacidad |
| Redes | 39 Maqui/Pelu / zona 14 | independiente; sin CAM1 |
| P15 | Croma 43, combinado 103030 / zona 2, padre 42 | CAM2 explícita en ambos; setup 10; una capacidad del set; no reentrada |
| Estilismo entrada/salida | 40 Vestu / zona 14 | capacidad conjunta 1, continuidad NONE, sin comida espacial |
| Exterior | Alfombra 25, Manzano 26, Buggy 28, Control 46 / zona 11 | unidades A/B/C y EVA; capacidad real |
| Totales | Coreo 33 + CAM6, Totales 1 34 + CAM5 / zona 12 | rondas y preparación/comida configuradas |
| Totales Post | 103032 / zona 14 | conjunto C06/C10; independiente, reasignable por configuración |
| Reality acompañamiento | 103031 virtual / zona 14 | no ocupa capacidad física; conserva participante/equipo |
| Sodexo | sin espacio físico | comida del participante |
| IN/OUT | 49 / zona 14 | transporte agrupado; sin serialización espacial artificial |

Las tres identidades nuevas dependen del namespace elegido; 103030–103032
son las del ensayo con offset 100000. Se reutilizan once activos originales,
incluidas CAM1–CAM6, coaches, EVA y SON1/SON2. No se crean recursos, tipos ni
zonas globales. El manifest generado enumera las 24 filas, sus decisiones,
recursos efectivos, tareas, dependencias, unidades elegibles y comidas.

`blocksSpace=false` se transporta como configuración explícita hasta búsqueda,
validación y warnings UI. Sólo elimina la exclusividad física de esa tarea;
mantiene todos los conflictos de participante, recursos e itinerancia.
La ordenación de lanes y esta proyección son genéricas, sin IDs A2 en el motor.

## Reality compuesta

Se reutiliza `anchoredAccompaniments`: before 15 → anchor 15 → after 15.
Participante y equipo están ocupados 45 minutos; el Estudio sólo 15. La
proyección genérica y sus tests agrupan los tres IDs en una operación lógica,
validan adyacencia y no fabrican 45 minutos si falta un segmento. La UI real
verifica tres operaciones continuas de 45 minutos con Ensayo incluido de 15.
Se conservan las 266 obligaciones técnicas. El timeline editable conserva las
tarjetas técnicas; la edición agrupada completa queda como límite de presentación.

## Ensayo descartable y reversibilidad

La vía B crea el día 27002 vacío, preservando literalmente 27001 y sus once
Stages, 333 tareas ajenas y el catálogo/defaults. La fixture anterior es pública,
derivada del baseline y normalizada al import agrupado de #1115: no es un backup
ni una copia del historial privado conectado. El import real ejecuta transacción,
locks, comprobaciones de identidad/drift/colisiones y comparación de filas
previas. El replay histórico usa sus propias autoridades efectivas congeladas, no la topología del nuevo día. El test SQL ejercita drift, duplicado, rollback sin aprobación y rechazo
de rollback sobre una jornada ya planificada, además de reversión positiva.

El [procedimiento de implantación](A2-REAL-TOPOLOGY-DEPLOYMENT.md) incluye
preflight read-only, auditoría de schema/RPC/RLS, backup restaurable, manifest,
import transaccional, postchecks y rollback limitado. La generación no conecta
ni escribe; `readyForDeployment=false`. No se ejecuta sobre Supabase/Replit real.

## Resultados y comparación

La certificación final usa el ledger nativo completo, PostgreSQL/Auth/PostgREST
descartables y Chromium. El producto recibe una jornada sin horas, ejecuta
propuestas reales, aplica, valida, acepta y recarga desde SQL. También comprueba
roles/RLS, rechazo de escritura directa Stage/Draft, jerarquía de scope,
vista por concursante/espacio/recurso, undo/redo, historial y reinicio.

**74 comprobaciones reales PASS**. Assisted: 19/38/46/65/73/109/151/189/191/209/266 obligaciones; cero HARD/REQUIRED y cero excepciones nuevas. Autopilot completa desde el checkpoint lógico S5, repite el mismo fingerprint, y después de Reiniciar Asistida pasa de 266 → S0 exacto 0 → 266. Las dos variaciones de aceptación repetidas también quedan completas y deterministas. Se conservan literalmente las filas históricas, once Stages anteriores, las 333 tareas ajenas y catálogo/defaults.

Las vistas reales conservan 266 tareas por concursante y espacio, y 141 tareas con recursos efectivos, con paridad Legacy y cero mutaciones. Scope P15: 36, o 17 al retirar Croma; P14: 44 con Hall, sin Redes; Maqui/Pelu: 18; Caracolas: 19. Las tres proyecciones Reality muestran 45 min con Ensayo 15 incluido. El snapshot SQL final tiene fingerprint `c0cc8bf4e1c466a9640b7ce765e0dceeb5772204a8f387f50e1af12d844ec703` y coincide con el baseline completo capturado; la CSV/JSON del paquete contienen sus 266 placements aceptados.

| KPI (minutos, salvo conteos) | Modelo anterior | A2 real final | Humano sin alterar |
|---|---:|---:|---:|
| Obligaciones | 266 | 266 | 266 |
| Estancia total | 9180 | 9180 | 7585 |
| Cierre | 19:00 | 19:00 | 18:35 |
| IN→Entrada, suma de intervalos | 1130 | 1225 | 485 |
| Última obligación→Salida | 640 | 615 | 185 |
| Salida→OUT | 285 | 285 | 150 |
| Tiempo sin ocupación dentro de estancia | 5790 | 5790 | 4195 |
| Disponibilidad residual, suma | 480 | 480 | 2115 |
| Estilismo: unión de ocupación / span | 285 / 540 | 285 / 535 | 260 / 555, con conflictos |
| CAM1: unión de ocupación / span | 335 / 420 | 305 / 390 | 270 / 380, con conflictos |
| CAM2: unión de ocupación / span | 275 / 360 | 275 / 360 | 275 / 335 |
| Redes/Pasillo: pares simultáneos válidos | 0 | 2 | 16 descriptivos |

El final real demuestra **2 coincidencias Redes/Pasillo de 5 min** y **7 Redes/Corner de 5 min**. CAM1 conserva exclusividad Corner/Pasillo, libera el requisito falso de Redes y consume también las dos operaciones Reality en Corner: 35 tareas y 305 min productivos (42,36% de 720 min), frente a 51/335 (46,53%). CAM2 permanece en 36/275 (38,19%). CAM5/CAM6: 10/300 y 9/270, con rondas/preparaciones validadas. Las once ocupaciones de activos, incluidos coaches y unidades concretas, se calculan desde el archivo SQL cuyo fingerprint coincide con el final Autopilot.

Estilismo conserva una capacidad 1 sin solapamientos: 285 min productivos, 39,58% de 720 min; sus dos huecos internos finales son 130 y 120 min, ambos **NOT_PROVEN** evitables. La estancia/cierre no mejoran; IN→Entrada aumenta 95 min y última obligación→Salida baja 25 min. Esto no acredita superioridad global. La referencia humana contiene además 305 min de trabajo conocido CAM1 sobre una unión de 270: 35 min de trabajo sobrepuesto bajo la nueva asignación explícita.

S1 consume **55.625 / 100.000 branches** y tarda **155,254 s** en generación real SQL; solicitud→aceptación 158,085 s. Cumple el techo de 5 min y excede el SLO preferido de 2 min. No se aumenta el budget ni se suprime un validador para obtener el resultado.

Gates locales: **2866/2866 tests productivos PASS**, cero fallos/skip; check TypeScript, integración TypeScript, build, secuencia de migraciones, tests UI, SQL seguro, topología y proyección PASS. El benchmark canónico genera artefactos byte-idénticos en dos ejecuciones. El discovery/exclusiones son los del gate de PR existente; los dos diagnósticos históricos sólo se ejecutan en workflow_dispatch y no se reinterpretan como el Autopilot productivo certificado aquí.

La métrica de recursos mide unión de intervalos de tareas efectivas; no suma
dos veces tareas simultáneas ni incluye preparaciones/comidas en minutos
productivos. Las preparaciones y ocho comidas operativas se validan por separado.
Los huecos IN→Entrada, última obligación→Salida, Salida→OUT, estancia, tiempo
sin ocupación y disponibilidad residual están desglosados para los 19
participantes en JSON. No se califican como evitables sin una alternativa sound.

El horario humano conserva literalmente sus tiempos/fingerprint. Presenta
cinco pares de solapamiento de Estilismo de 5 min bajo la capacidad actual 1.
Su menor estancia o cierre más temprano son datos descriptivos, no un
certificado de calidad hard-válida. El comparador oficial queda bloqueado;
no se declara PARETO ni superioridad global. La
[siguiente unidad](A2-REAL-TOPOLOGY-NEXT-UNIT.md) separa continuidad
NONE/PREFERRED/REQUIRED de preferencia EARLIEST/LATEST, sin implementar una
búsqueda nueva ni penalizar huecos de Estilismo.

## Reproducción y límites

```sh
npm ci
npm run check
npx --no-install tsc -p script/demo/tsconfig.integration.json
npm run build
npm run check:migrations
node --import tsx --test script/demo/a2RealTopology.spec.ts script/demo/a2RealImportSQL.spec.ts shared/anchoredOperationProjection.test.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run demo:a2:smoke -- work/a2-real --historical-topology --full --stage-order --autopilot
```

La integración requiere Docker y Chromium, conserva hashes de runtime y limpia
sólo sus contenedores. `app-private.log` y credenciales locales no son entregables.
Los screenshots reproducibles están en [A2-REAL-TOPOLOGY-UI](A2-REAL-TOPOLOGY-UI/). El [reporte completo comprimido](A2-REAL-TOPOLOGY-full.json.gz) conserva la evidencia original con SHA256 en JSON, sin credenciales ni logs privados. La selección de ubicaciones inicial y tras aceptar también pasa su integración dedicada de CI, con cero mutaciones.
No se han probado despliegue conectado, Replit publicado ni transporte Realtime;
son pasos posteriores de implantación, no condiciones ocultas de la demo local.
La latencia inicial sigue siendo una limitación cuantificada, sin cambios de
budget para ocultarla. No se ha hecho merge.
