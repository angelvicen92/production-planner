# A3-ORCH-REAL-006 — cambios de ubicación de recursos en frontier 121

Base exacta: `b178a411728c947f434974e36a2455cb653fcc86`. Se regeneró el Full A2 causal con 5.000 ramas, sin usar horas ni orden humano como seed: `BRANCH_BUDGET_EXHAUSTED`, `CORE=1.599`, `STANDALONE=3.401`, frontier 121 y fingerprint `d3a35f0f5a77cecb617d8cf1e503dbb3a2cb8cffbb727328a7f23578d861fb3a`. El replay diagnóstico ON/OFF dio `exactMatch=true`. El JSON grande regenerado fue restaurado antes del commit.

## Método y semántica

Se ordenaron por `{start,end,taskId}` las 121 colocaciones del `deepestStandaloneFrontier` y se proyectaron los recursos requeridos explícitamente o por asignación de espacio. Un **bloque** es una subsecuencia maximal de tareas consecutivas del recurso en el mismo espacio; un hueco temporal no crea por sí solo otro bloque. Un **cambio** es el paso entre dos bloques y una **reentrada** es la entrada a un espacio ya abandonado. Por tanto el conteo mide movimiento operativo, no minutos: `transitionMinutes=0` no vuelve equivalentes dos secuencias con distinto movimiento, mientras cualquier transición configurada `>0` continúa siendo hard.

La cronología de los coaches pertenece al core, no a las 121 colocaciones standalone serializadas. Se auditó separadamente con los certificados de feeder: la única ruta especial configurada es Caracola propia → Estudio 7, 30 minutos, y sigue siendo hard; no se inventó una transición inversa ni entre otras ubicaciones.

## Inventario de recursos físicos compartidos

| recurso | bloques / secuencia cronológica | cambios | reentradas |
|---|---|---:|---:|
| CAM1 (`plan-resource:4002`) | 29 bloques, alternancia `p14-pasillo → p14-recursos → … → p14-pasillo` | **28** | **27** |
| CAM2 (`plan-resource:4003`) | `p15-croma → p15-estrellas-sillon → p15-croma` | **2** | **1** |
| CAM3 (`4004`) | `reality-control → reality-buggy → reality-hall-p14 → alfombra-roja → reality-corner-music → reality-influencer → reality-control → technical-transfer → totales-post` | 8 | 1 |
| CAM4 (`4005`) | `reality-control → reality-buggy → reality-hall-p14 → alfombra-roja → reality-manzano → reality-hall-p14 → reality-control → technical-transfer → totales-post` | 8 | 2 |
| CAM5 (`4006`) | `totales-1` | 0 | 0 |
| CAM6 (`4007`) | `totales-coreo` | 0 | 0 |
| EVA (`4010`) | `reality-control → alfombra-roja → reality-control → technical-transfer → totales-post` | 4 | 1 |
| SON1 (`4011`) | misma secuencia que CAM3 | 8 | 1 |
| SON2 (`4012`) | `reality-manzano → reality-hall-p14` | 1 | 0 |
| Vocal Coach Lucía / José María (`4009` / `4008`) | Caracola propia → Estudio 7 por cada cadena vocal/main; la Evidence acotada no serializa una timeline completa de core por coach | no calculable honestamente | no calculable honestamente |

Los certificados del core sí distinguen las transiciones hard: en profundidad crítica 19 hubo 83 rechazos `TRANSITION_COACH` y 76 `OVERLAP_COACH`; no deben mezclarse con la preferencia genérica de movimiento ni relajarse.

## CAM1 — bloques y tareas que disparan cada transición

La tabla comprime cada bloque como `inicio-fin espacio [taskIds]` (minutos desde medianoche):

```text
575-585 pasillo [10023,10008] → 590-615 recursos [10012,10159,10015]
→ 620-625 pasillo [10167] → 630-640 recursos [10145]
→ 645-650 pasillo [10062] → 655-735 recursos [10029,10140,10155,10070,10082,10170,10054,10025,10038,10100]
→ 740-745 pasillo [10107] → 750-765 recursos [10254,10111]
→ 770-775 pasillo [10122] → 780-790 recursos [10114]
→ 795-805 pasillo [10137,10079] → 810-830 recursos [10216,10241]
→ 835-840 pasillo [10152] → 845-855 recursos [10086]
→ 860-865 pasillo [10036] → 870-875 recursos [10125]
→ 880-885 pasillo [10049] → 960-985 recursos [10051,10188,10201]
→ 990-995 pasillo [10094] → 1000-1005 recursos [10096]
→ 1010-1015 pasillo [10223] → 1020-1025 recursos [10225]
→ 1030-1035 pasillo [10235] → 1040-1045 recursos [10238]
→ 1050-1055 pasillo [10248] → 1060-1065 recursos [10250]
→ 1070-1075 pasillo [10261] → 1080-1100 recursos [10264,10184,10198,10211]
→ 1105-1115 pasillo [10182,10196]
```

La **primera transición** es a `p14-recursos`, provocada por `task:10012` a 09:50 (macro m14). La **primera reentrada** es a `p14-pasillo`, provocada por `task:10167` a 10:20 (macro m46). En m46 la unidad fue elegida por `minimum-macro-domain` y tenía dominio exacto de **64** placements hard-valid. La Evidence histórica guarda el tamaño pero no los starts/outcomes ni la secuencia CAM1 antes/después de cada candidato; por ello no demuestra si uno de esos 64 placements evitaba aumentar cambios en ese mismo estado.

## CAM2 — bloques y tareas que disparan cada transición

```text
570-685 p15-croma
  [10001,10160,10016,10042,10146,10130,10030,10174,10055,10202]
→ 690-785 p15-estrellas-sillon
  [10134,10059,10178,10232,10091,10075,10020,10119,10251,10212,10185,10141,10066,10026,10156,10126,10097]
→ 790-885 p15-croma
  [10071,10101,10115,10255,10087,10242,10228,10217,10189]
```

La **primera transición** la provoca el bloque de setup `setup:space:3009`, cuyo primer task es `task:10134` a 11:30 (macro m11). La **primera reentrada** la provoca `task:10071` a 13:10 (macro m17), elegida por `minimum-macro-domain`, con dominio exacto de **66** placements hard-valid. Igual que para CAM1, no se conservan los starts/outcomes de m17 y no puede certificarse una alternativa contemporánea sin incremento.

## Cruce causal con A3-ORCH-REAL-005

CAM1 presenta fragmentación muy superior a CAM2 (28 frente a 2 cambios), pero correlación no es causalidad. Las reentradas que ocupan la ventana de comida de Plato 14 son `10114@780`, `10137/10079@795`, `10216/10241@810`, `10152@835`, `10086@845`, `10036@860`, `10125@870`, `10049@880` y `10051/10188/10201@960`. Esto coincide con la pérdida progresiva de witnesses: `task:10114` inicia el consumo observable, `task:10051` deja un único witness 14:45–16:00 y los 14 starts terminales 14:45–15:50 de `task:10209` lo destruyen. Sin embargo, la alternancia comienza a las 09:50 y la primera reentrada a las 10:20, mucho antes de la ventana; la Evidence no enlaza una de esas decisiones tempranas con la preservación de un witness futuro.

El ledger causal existente sí registra para el estado terminal los 22 starts y outcomes de `10209`, pero no para m17/m46 ni para m38/m65. Se ejecutó la instrumentación causal read-only ya disponible en modo ON y OFF; añadir un segundo ledger temporal sin conservarlo no cambia esta carencia histórica. La instrumentación mínima que falta para resolverla en otra ejecución es exactamente, por candidato aceptado/rechazado en esas decisiones: `candidateStart`, secuencia del recurso antes/después, `deltaResourceLocationChanges` y outcome/rejection existente. No se modificó código productivo y no quedó instrumentación en el commit.

## Benchmark humano (sólo comparación)

El cuadro fuente conserva el orden humano **por concursante**, no una timeline global de CAM1/CAM2. Permite observar secuencias individuales entre Croma, Redes/Pasillo y Sillón/Estrellas, pero entrelazarlas para contar cambios del recurso exigiría horas no serializadas. Por tanto el benchmark honesto es: motor CAM1 `28` cambios y CAM2 `2`; planificación humana, **número y secuencia global no recuperables del artefacto textual actual**. No se usó el orden humano como seed, hint ni regla.

## Respuesta y recomendación

**INCONCLUSIVE.** No está demostrado que una preferencia genérica por menos cambios hubiera discriminado, antes del encierro del prefix, un candidato hard-valid que preservara más futuro. Sí está demostrado que CAM1 queda extremadamente fragmentada y que una métrica de movimiento distinguiría secuencias completas; falta el ledger contemporáneo de starts/outcomes para probar que esa distinción existía en la decisión y que preservaba witnesses de comida o starts de `10209`. No se recomienda todavía scoring ni ordering nuevo.
