# A2 — corrección CAM1 y límite de completitud

**Resultado B: CORRECTED_BUT_BLOCKED.** CAM1 está representada correctamente;
el antiguo falso positivo queda eliminado. Dos replays automáticos vacíos agotan
100.000 ramas en S1: **0/266 aceptadas, sin ScopeProposal ni S10**. Existe una
contraprueba completa, validada con CAM1, que demuestra viabilidad del problema;
no procede de un Stage nuevo y nunca se usa como seed del benchmark.

Mismo [PR #1104](https://github.com/angelvicen92/production-planner/pull/1104), draft,
sin merge. Partida `581f05e06ead47214285fcbd6954f00b9c204bc9`; delta productivo
`94593e1164741d0b269741eba40c61f17a6f835e`; base
`5e46168daa35d755bcb9a2573ed81647d8b466a2`.
Datos reproducibles, configuración, resultados completos de ambos runs, contexto
del primer rechazo y contraprueba: [JSON](A2-CAM1-CORRECTION.json).

## X/Y/Z/W/M y autoridad

- **X:** el anterior A2 declara 266/266 con 16 solapes Recursos/Pasillo,
  80 minutos, incompatibles con Fuente 06 v2.7 §7.5.
- **Y:** `CANONICAL_RESOURCES` omitía CAM1 y el constructor no asignaba ese
  recurso a ambos espacios. Adaptador, dominios y validator recibían un grafo
  incompleto; su PASS sólo describía esa configuración.
- **Z:** la exclusividad propia de cada espacio permitía conflictos cruzados;
  ni la propuesta ni el certificado podían observar la autoridad omitida.
- **W:** añadir CAM1 al manifest y asignarla mediante
  `spaceResourceAssignments` a Recursos/Pasillo, usando el contrato genérico
  existente de CAM2. Giratuto conserva independencia.
- **M:** las 51 tareas consumidoras reciben CAM1, el futuro conserva el requisito
  y el calendario viejo falla la validación. El replay corregido queda bloqueado
  por búsqueda; la contraprueba completa pasa HARD/REQUIRED y la revalidación
  `JOINT_COMPLETION`, sin convertirse en propuesta o aceptación automática.

Fuente 00 establece la autoridad especializada de 06 para A2; 01/02 prohíben
presentar un conflicto físico como candidato válido; 03/04 preservan el scope y
los placements futuros efímeros; 05 exige completitud real y distingue comparación
descriptiva; 07 §4.4 exige falsar la causa antes de ampliar el solver. Los hashes
de las Fuentes oficiales aportadas constan en el JSON.

## Delta y prueba antes/después

Código de configuración: `full-day/manifest.ts` y
`canonicalFullA2EngineInput.ts`. No cambia ningún archivo de búsqueda, adaptador
o validador productivo. `exactItinerantPlan.ts` conserva el blob
`c699e8c12ab1ef72b72b61d83afcd67cae01886c`.

| Autoridad | Sin asignación compartida | Con CAM1 |
|---|---|---|
| Recursos consigo mismo | Exclusividad del espacio | Igual |
| Pasillo consigo mismo | Exclusividad del espacio | Igual |
| Recursos frente a Pasillo | Solape admitido | `OVERLAP_REQUIRED_RESOURCE`; HARD |
| Giratuto frente a cualquiera de ambos | Paralelismo permitido | Igual |

Contraprueba focal: C01 Redes y C12 Pasillo en **13:05–13:10**. El control sin
asignación admite el placement, conserva ese inicio en el dominio exacto y no
registra conflicto de recurso. La misma configuración con recurso compartido
rechaza el placement, elimina ese inicio y emite `RESOURCE_OVERLAP_VIOLATION`.
Se aíslan dependencias en esta prueba de capacidad; no se afirma que sus dos
tareas constituyan un día completo.

Antes del cambio: 3/5 tests focales PASS, dos FAIL por ausencia de CAM1.
Después: seis tests PASS, incluidos el guard del fixture, propagación futura,
invisibilidad/no protección, exclusividad propia, Giratuto y unidad Assisted.
El guard comprueba **todas** las tareas de los dos espacios y la ausencia del
recurso en cualquier otro espacio. P14 continúa como una sola unidad de 58
obligaciones: 51 consumidoras de CAM1 + siete Giratuto.

Añadir un recurso a la expansión ordenada cambia los ordinales técnicos de
recursos. Se comparan y revalidan por identidad canónica, nunca reutilizando sus
números antiguos. El test de replay que dependía de ordinales ahora deriva
Coach Lucía y los miembros de Reality A desde la configuración; conserva sus
expectativas de identidad y consumo. No se introduce ningún ID numérico en el
motor.

Las 266 identidades de tareas permanecen iguales. La comparación completa del
`EngineInput` anterior/actual, normalizando identidad de recurso y `planId`, es
idéntica tras excluir únicamente CAM1 y sus dos bindings. Duraciones,
disponibilidades, márgenes, transporte, comidas, setups, descansos, presupuesto
y timeouts no cambian. El descanso P14 sigue siendo el mismo intervalo/policy
común a los tres espacios; el consumo CAM1 no obliga a serializar Giratuto.

## Call path del recurso y primer impedimento

`manifest → expand (registro ordenado de recursos) → canonicalFullA2EngineInput`
`→ resolveEffectiveTaskResourceAssignments (unión directa/espacio/zona)`
`→ resolveProjectedPlannerNextTaskResources → engineInputAdapter.requiredResourceIds`
`→ buildAssistedProblem/analyticalFutureCollectiveContinuation`
`→ exactTaskStaticStartDomain/exactTaskDynamicStartDomain/canPlaceTask`
`→ matching/materialización → validatePlan → revalidateJointCompletionWitness`.

No hace falta modificar `expand.ts`: la expansión ya conserva el nuevo registro;
el consumo efectivo pertenece al binding del espacio. No se infieren recursos
por nombres dentro del motor. Las autoridades genéricas de matching,
reservas de prerequisites y validación leen los mismos `requiredResourceIds`.

El replay sigue el flujo real request/run/apply → validate → accept desde un
snapshot vacío. S1 solicita los 19 Main por SPACE. La continuación dispone de
247 tareas y 19 Sodexo; no incorpora las tareas futuras al scope visible.

Se alcanzan tres core leaves hard-válidas de 82 tareas provisionales. Sus Main
empiezan en 11:50/11:55/12:00 y las comidas Main en 14:05/14:10/14:15. Se exploran
cadena C/EVA, agendas, post conjunto, P15 y Totales. El primer contexto capturado
con dominio Totales vacío contiene 132 placements; **ninguno consume CAM1**.
Incluye las 36 operaciones P15 provisionales, no aceptadas ni protegidas.

La decisión concreta es ese matching de P15, tratado correctamente como contexto
fijo **de esa rama** al consultar `probeExactRoundSynchronizationMacroDomain`:
353 formas temporales, cero matchings completos. C01 Croma está en 13:20–13:30,
pero no se atribuye el fallo sólo a esa tarea: nueve swaps Croma legales tampoco
recuperan un matching de Totales.

| Contraste sobre el mismo contexto | Formas | Matchings completos |
|---|---:|---:|
| Con CAM1 | 353 | 0 |
| Quitando sólo CAM1 | 353 | 0 |
| Liberando los 36 placements P15 futuros; CAM1 vigente | 353 | 41 |

Este contraste prueba un bloqueo **condicional** de geometría P15. Los 41
matchings son una autoridad parcial de Totales, no un certificado global.
El solver conserva alternativas: intenta 13 matchings P15, 4.305 matchings
Totales y 81.014 traversals de matching antes de agotar el ledger. No hay decisión
de un Stage anterior que deba desprotegerse: siguen existiendo cero Stages
aceptados. No se ha demostrado una poda incorrecta, un supporting protegido
indebidamente o un defecto general del solver directamente causado por CAM1.

Por ello se conserva **únicamente el delta de configuración**. No se añade
poda, cache, DFS, matching, preferencia humana ni la optimización Hall candidata
de S1. No se encadena otra expansión sobre Totales/P15.

## Contraprueba completa y límites

Se toma exclusivamente el anterior S10 de OptiPlan como **contexto diagnóstico**;
no el horario humano. Se mantienen literalmente 196 tareas que no consumen CAM1,
las 19 Sodexo, 18 preparaciones y ocho comidas operativas. Se liberan las 51
tareas de Recursos/Pasillo y se recolocan usando los dominios y placement
genéricos vigentes: 39 cambian de hora y 12 conservan su intervalo.

La realización contiene 247 tareas + 19 Sodexo = **266 obligaciones**.
`validatePlan` devuelve `hardValid:true`, todos sus contadores a cero,
`violations:[]`, `reasonCodes:[]` y ningún REQUIRED incumplido. No hay solape
CAM1; seis pares Giratuto/CAM1 funcionan simultáneamente de forma válida.
Las tareas conservan la identidad materializada por la autoridad existente de
unidad itinerante.

El witness completo pasa `revalidateJointCompletionWitness` bajo el canon
actual y con los 196 placements como contexto protegido del experimento;
se cobran sus 292 vértices/decisiones. Fingerprint:
`91987a5174e77a980b976edccca5eaf835b03214937c25514601c0ae63ae761b`.
Material:
`e898b7ae91a1979e39bd46f1a77c9abdb215cb38ed29f2050541a517dbbd7e39`.

**Esta existencia no constituye A2-ASSIST-8 PASS.** No se inyecta su material al
replay, no hay aceptación humana nueva ni snapshot S10 nuevo. También demuestra
que el agotamiento automático no autoriza a declarar inviabilidad global.

## Runs, accounting y comparación por Stage

Dos procesos independientes, sin `initialSnapshot`, seed ni witness anterior.
La única captura del snapshot ocurre después de terminar el benchmark. Otro
run observado conserva exactamente material, blocker y todos los contadores.

| S1 corregido | Run 1 | Run 2 | Observado |
|---|---:|---:|---:|
| Duración de la petición, ms | 155.861 | 237.616 | 173.967 |
| Core | 3.642 | 3.642 | 3.642 |
| Continuación | 96.358 | 96.358 | 96.358 |
| Ledger compartido | 100.000 | 100.000 | 100.000 |
| Obligaciones aceptadas / pendientes | 0 / 266 | 0 / 266 | 0 / 266 |
| ScopeProposal / certificado global automático | No / No | No / No | No / No |

Digest material determinista de ambos runs:
`c62b90875904fe551949c31c95e74eaf8b95176b06463f9290b0ecb926a17126`.
Fingerprint del snapshot **S0** intacto:
`92541a8396180e9d9130e33c7050c9c72d41ba4a5e5009a27943f90b02805556`.
El objetivo de 120 s falla; el techo de 300 s se cumple. No se aumenta ninguno.

| Stage | Canon anterior: acumulado / ramas / ms | CAM1 vigente |
|---|---|---|
| S1 | 19 / 80.835 / 268.555 | 0 / 100.000 / 155.861–237.616; bloqueado |
| S2 | 38 / 293 / 331 | No alcanzado |
| S3 | 46 / 293 / 145 | No alcanzado |
| S4 | 65 / 293 / 416 | No alcanzado |
| S5 | 75 / 13.241 / 20.784 | No alcanzado |
| S6 | 111 / 293 / 205 | No alcanzado |
| S7 | 169 / 1.884 / 7.045 | No alcanzado |
| S8 | 207 / 293 / 111 | No alcanzado |
| S9 | 209 / 293 / 109 | No alcanzado |
| S10 | 266 / 293 / 128 | No alcanzado |

El baseline de la tabla es el run OFF de la auditoría anterior, sobre el mismo
código de búsqueda. Su material tenía conflictos CAM1. Hay **cambio de
configuración, cero cambio productivo de búsqueda**. Los contadores reflejan
ese cambio de problema y sus decisiones nominales; los tiempos variables de
un run que termina en agotamiento no demuestran aceleración ni ahorro hasta
solución. El segundo run comparte brevemente el host con contrastes read-only;
no se usa para una atribución causal de rendimiento.

## Calidad, gates y entrega

No existe un S10 nuevo aceptado sobre el que recalcular calidad. Se mantienen
sólo los descriptivos históricos: Main 2 bloques frente a 4 humanos, final
25 minutos posterior y permanencia media 83,947 minutos superior. No se presentan
los KPIs de la contraprueba como calidad del producto. A2-ASSIST-9 continúa
bloqueado por homologación HARD humana, datos y tolerancias incompletas.

| Validación | Resultado |
|---|---|
| Tests focales: canon, adapter/preflight, recursos, futuro, protección, scopes | 336/336 |
| Suite proporcional: rondas, P15, reservas, comidas y calidad | 81/81 |
| Replay después de derivar IDs semánticos | 3/3; repetición focal |
| Transporte, candidato y checkout separado `581f05e` | Ambos 19 PASS / 2 FAIL |
| `npm run check`; build; secuencia y test de migraciones | PASS |
| CI del delta productivo `94593e1` | [PASS](https://github.com/angelvicen92/production-planner/actions/runs/37969696973) |
| Completitud automática A2 con CAM1 | BLOCKED, no PASS |
| ASST-010 canónico completo | OPEN; no se reinterpreta ni se demuestra en esta unidad |
| AcceptedException, refresh 10→20, rollback/redo/divergencia canónicos | Gate independiente pendiente |
| Merge | NO; #1104 draft |

Total proporcional único: **436 PASS / dos FAIL heredados; cero nuevos fallos**.
Los fallos son `exact continuation constructs IN, work, ESTILISMO_SALIDA, then
dependent OUT immutably and order-invariantly` y `terminal IN materialization
finds the backward-propagated witness`. El código productivo de esos casos no
cambia. No se ejecuta otra ronda del gate canónico ASST-010 ni se aumenta su
budget heredado.

CI del delta productivo y comandos exactos de pruebas constan en el JSON;
los checks del HEAD final se consultan en el mismo PR. Los informes anteriores
conservan sus resultados históricos, ahora calificados como configuración sin
CAM1. Ninguna expectativa del benchmark cambia.

Reproducción focal: `npx tsx --test
engine/planner-next/benchmarks/canonicalFullA2EngineInput.spec.ts`.
Replay automático: `runA2Assist8Evidence({reportIterationDurations:true})`, con
sus defaults oficiales. El witness diagnóstico del JSON puede revalidarse con
`revalidateJointCompletionWitness` y el `adapter.problem` de
`buildCanonicalA2AssistedStage1Fixture(100000,711)`; el contexto protegido se
obtiene filtrando sus tareas que no consumen CAM1. Nunca debe usarse como seed
del benchmark.

Handoff: **B, configuración correcta; completitud automática pendiente**. El SHA
del delta es `94593e1`; el HEAD de entrega está en #1104. Primera unidad siguiente
recomendada: diagnosticar la enumeración conjunta P15/Totales dentro del ledger,
contrastando con la realización completa válida aquí registrada, antes de
proponer otro cambio del solver. ASST-010 sigue abierto. Fin de esta iteración.
