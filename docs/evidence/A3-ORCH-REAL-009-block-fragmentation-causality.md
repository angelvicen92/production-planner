# A3-ORCH-REAL-009 — causalidad de la fragmentación de bloques

Base exacta: `280ad73967ddff56ffd4cf3723cf680d8ad83fb8`. Se reconstruyó Full A2 con 5.000 ramas y diagnóstico causal read-only temporal, después revertido: `BRANCH_BUDGET_EXHAUSTED`, `CORE=1.599`, `STANDALONE=3.401`, frontier **123**, fingerprint del frontier `d14abef41cc9e68d55366c5a67157d5b41bf551d8a5a957dbf6d33f93001142b` e invariancia ON/OFF `exactMatch=true`. No se consumieron ramas para el probe, no se alteró el orden ni se poblaron caches productivas. El JSON canónico grande se restauró antes del commit. No hizo falta 10k: el 5k certificó la primera ruptura evitable.

## Método y criterio

Se proyectaron las 123 colocaciones standalone del `deepestStandaloneFrontier` y las 44 colocaciones core del candidato que lo alimenta. En cada recurso, un **bloque** es una subsecuencia cronológica maximal en el mismo estado operativo; un hueco sin otro estado intermedio no abre bloque. Un cambio es el paso entre bloques y una reentrada, la llegada a un estado ya abandonado. La comida autorizada se trata como hueco, nunca como estado ni bloque lógico.

El probe de la decisión focal copió el dominio dinámico y el estado anterior, sin `ledger.consume`: volvió a aplicar `canPlaceTask`, pending prerequisites/capacidad, reserva de transporte y Future Feasibility de comidas. `AVOIDABLE_SPLIT` exige una alternativa contemporánea hard-valid con menos bloques/reentradas y sin pérdida de la Future Feasibility necesaria; no exige que esa alternativa sea la solución humana.

Para la comparación humana de geometría de plató/recurso se aplica la precedencia oficial del Documento Maestro: aclaraciones operativas expresas → `ENSAYO_A2_LV.pdf` por espacios → desglose por concursantes → inferencia visual. La referencia normalizada por concursante sigue siendo válida para cobertura, identidad de tareas y KPIs ya certificados, pero **no se usa para contar bloques físicos de CAM1/CAM2 cuando contradice el documento por espacios**.

## CAM1 — Recursos/Pasillo

Resultado: **17 bloques, 16 cambios y 15 reentradas** (A3-007: 29/28/27). Secuencia completa:

```text
575-585 Pasillo [10023,10008]
→ 590-595 Recursos [10012]
→ 600-605 Pasillo [10167]
→ 610-640 Recursos [10015,10159,10145]
→ 645-650 Pasillo [10062]
→ 655-765 Recursos [10029,10140,10025,10070,10188,10054,10038,10051,10100,10086,10216,10241]
→ 770-805 Pasillo [10122,10107,10079,10235,10152,10196,10209]
→ 935-980 Recursos [10211,10198,10125,10096,10082,10238,10170,10155,10184]
→ 985-990 Pasillo [10182]
→ 995-1015 Recursos [10114,10254]
→ 1020-1035 Pasillo [10137,10223,10036]
→ 1040-1045 Recursos [10264]
→ 1050-1055 Pasillo [10049]
→ 1060-1080 Recursos [10201,10111,10225]
→ 1085-1090 Pasillo [10248]
→ 1095-1100 Recursos [10250]
→ 1105-1115 Pasillo [10261,10094]
```

Hay 8 bloques Pasillo y 9 Recursos. La primera transición es `task:10012@590` (Pasillo→Recursos); la primera reentrada es `resource:task:10167`/m46 en `600–605` (Recursos→Pasillo). Las decisiones/tareas que inauguran cada nueva reentrada cronológica son:

| reentrada | causante | estado posterior | delta bloques / cambios / reentradas | clasificación |
|---:|---|---|---:|---|
| 1 | `10167@600` | Pasillo | `+1 / +1 / +1` cronológico; `+2 / +2 / +1` frente a mantener la banda | **AVOIDABLE_SPLIT** |
| 2 | `10015@610` | Recursos | `+1 / +1 / +1` | consecuencia geométrica de la anterior |
| 3–6 | `10062@645`, `10029@655`, `10122@770`, `10211@935` | P/R/P/R | cada una `+1 / +1 / +1` | `INCONCLUSIVE` |
| 7–15 | `10182@985`, `10114@995`, `10137@1020`, `10264@1040`, `10049@1050`, `10201@1060`, `10248@1085`, `10250@1095`, `10261@1105` | P/R alternos | cada una `+1 / +1 / +1` | `INCONCLUSIVE` |

La tabla no atribuye causalidad por mero orden horario: salvo la primera, el ledger temporal no certificó para cada corte una alternativa contemporánea con Future Feasibility equivalente, por lo que no se promovieron a `AVOIDABLE_SPLIT`. El hueco `805–935` contiene la comida operacional P14 posible, pero no crea un bloque; la reentrada de `10211` sí lo hace porque cambia Pasillo→Recursos.

### Primera ruptura evitable demostrada

Estado exacto anterior a m46: CAM1 ya tenía Pasillo `575–585`, Recursos `590–595` y la banda Pasillo posterior seguía disponible. La unidad fue `resource:task:10167` (Pasillo, 5 min). El placement elegido fue `600–605`, primer placement permitido tras el ranking por libertad de comida y el desempate canónico ascendente. Su dominio hard-valid contenía también el placement compacto `770–775`, adyacente a la banda Pasillo aceptada.

| dato causal en el estado anterior | elegido `600–605` | alternativa `770–775` |
|---|---|---|
| estado CAM1 resultante | `Pasillo→Recursos→Pasillo`, y obliga a volver a Recursos para las tareas ya pendientes | prolonga/abre una sola banda Pasillo sin intercalarla entre bandas Recursos |
| delta comparativo | dos fronteras de bloque y una reentrada evitables | ninguna frontera adicional respecto de esa banda |
| hard placement | permitido | permitido |
| comida operacional | viable; conserva la señal máxima que gobierna A3-008 | viable; no reduce la Future Feasibility requerida |
| dependencias | satisfechas | satisfechas |
| llegada/transporte | reserva factible | reserva factible |
| capacidad colectiva | factible, sin prune | factible, sin prune |
| autoridad de transición CAM1 | 5 min respetados | 5 min respetados |

Por tanto la respuesta causal principal es **sí**: en el mismo estado había un candidato permitido más compacto sin empeorar las autoridades futuras observadas. Es la primera `AVOIDABLE_SPLIT` del camino aceptado. La selección de macro (`minimum-macro-domain`) decide qué unidad tratar, pero no compara continuidad entre placements de la unidad; tras empatar en libertad de comida, el orden ascendente elige `600`. La causa inmediata común es la ausencia de una señal genérica de continuidad/compactación en el desempate de placements, no una restricción hard ni una necesidad de dividir para completar la jornada.

## CAM2 — Croma / Estrellas / Sillón

```text
570-685 Croma [10001,10016,10160,10042,10146,10130,10030,10174,10055,10189]
→ 690-785 Estrellas/Sillón
  Estrellas 690-730 [10134,10059,10178,10232,10091,10075,10020,10119]
  preparación 730-740 (10 min)
  Sillón 740-785 [10251,10212,10185,10141,10066,10026,10156,10126,10097]
→ 990-1080 Croma [10255,10217,10242,10115,10228,10071,10087,10101,10202]
```

CAM2 tiene **3 bloques físicos**, 2 cambios y 1 reentrada. Por familia setup mantiene exactamente **1 bloque Estrellas + 1 bloque Sillón**, sin reentrada, y aplica una preparación configurada de 10 minutos; no hay bloque lógico de comida. La reentrada Croma ya fue certificada en el estado de m17: los starts que evitaban el corte fallaban `PENDING_ARRIVAL_DEADLINE`, y todos los permitidos lo producían. Se clasifica `NECESSARY_SPLIT` bajo el estado observado, sin convertirlo en regla universal.

## Vocal Coaches

| coach | bloques Caracola | bloques Estudio 7 | secuencia | transiciones | minutos hard | reentradas | mínimo defendible |
|---|---:|---:|---|---:|---:|---:|---:|
| Lucía (`4009`) | 1 (`545–665`, 8 pruebas) | 1 (`695–815`, 8 ensayos) | Caracola Lucía→Estudio 7 | 1 | 30 | 0 | **2** |
| José María (`4008`) | 1 (`650–860`, 11 pruebas; el hueco 785–830 no divide estado) | 1 (`890–1055`, 11 ensayos) | Caracola José María→Estudio 7 | 1 | 30 | 0 | **2** |

Ambos alcanzan el mínimo defendible: las obligaciones requieren las dos ubicaciones, y Caracola→Estudio 7 conserva exactamente su transición hard configurada de 30 minutos. No se infiere restricción inversa. No hay fragmentación causal que corregir en los coaches del frontier.

## Otras estructuras relevantes

No apareció otra fragmentación con la magnitud o la causa transversal de CAM1. En particular, Corner y Redes comparten el mismo estado `P14-Recursos`: sus subtipos contiguos no se cuentan como bloques distintos. Estrellas y Sillón sí son familias setup distintas, pero cada familia ya está concentrada en un bloque. Se evita convertir la cardinalidad mínima observada en constraint hard: si otra jornada necesitara dividir para conservar factibilidad global, esa rama debe seguir alcanzable.

## Comparación con el planning humano (sólo benchmark)

El benchmark físico se obtiene del documento humano **por espacios**, que tiene precedencia sobre el desglose por concursantes para reconstruir la geometría de plató/recurso cuando ambos difieren. Los horarios humanos siguen prohibidos como seed, hint o lock.

- **CAM1 / P14:** la referencia por espacios organiza la cámara como `Recursos → Pasillo → Recursos`: aproximadamente `Recursos 10:00–12:00`, `Pasillo 12:00–13:35`, retorno a `Recursos 14:00–16:20`, con el corte de comida dentro de esa segunda estancia en Recursos. La comida no crea bloque lógico. Resultado: **3 bloques físicos, 2 cambios y 1 reentrada**. Pasillo es un único bloque compacto. Giratuto aparece también como un único bloque propio y no consume CAM1.
- **CAM2 / P15:** `Croma → Estrellas/Sillón`, sin retorno a Croma: **2 bloques físicos, 1 cambio y 0 reentradas**. Sillón y Estrellas mantienen un bloque por familia con una preparación de 10 minutos entre ambas.
- **Coaches:** la arquitectura humana tiene dos cohortes por coach en Caracola y dos bloques por coach en Estudio 7, es decir `Caracola→E7→Caracola→E7`: 4 bloques de ubicación, 3 cambios y 2 reentradas por coach. Es benchmark, no objetivo fijo; el motor debe buscar el mínimo factible y el frontier actual mejora esa geometría si conserva completitud.

La proyección de 35 bloques CAM1 obtenida de los horarios normalizados por concursante **no es un benchmark físico válido**: mezcla tiempos del desglose por concursantes que contradicen la planificación por espacios y no debe utilizarse para afirmar que el motor ya supera al humano en movimientos de CAM1.

| estructura | baseline anterior (A3-007) | A3-008 frontier123 | referencia humana por espacios | mínimo/objetivo operativo defendible |
|---|---:|---:|---:|---:|
| CAM1 (bloques/cambios/reentradas) | 29 / 28 / 27 | **17 / 16 / 15** | **3 / 2 / 1** | **2 / 1 / 0** (una banda por ubicación), si la viabilidad global lo permite |
| CAM2 físico (bloques/cambios/reentradas) | 3 / 2 / 1 | **3 / 2 / 1** | **2 / 1 / 0** | **2 / 1 / 0**, salvo split exigido por viabilidad |
| Estrellas (bloques de familia) | 1 | **1** | 1 | **1** |
| Sillón (bloques de familia) | 1 | **1** | 1 | **1** |
| coach Lucía (bloques/cambios/reentradas) | 2 / 1 / 0 | **2 / 1 / 0** | 4 / 3 / 2 | **2 / 1 / 0**, si el pipeline completo sigue viable |
| coach José María (bloques/cambios/reentradas) | 2 / 1 / 0 | **2 / 1 / 0** | 4 / 3 / 2 | **2 / 1 / 0**, si el pipeline completo sigue viable |

## Planning drawing delta

- **Bloques por recurso/familia:** CAM1 baja 29→17, pero sigue muy lejos del humano (3) y del objetivo defendible (2); CAM2 queda en 3 frente a 2 humano; Estrellas y Sillón permanecen en uno por familia; cada coach queda en dos bloques totales.
- **Movimientos:** CAM1 baja 28→16, aún frente a 2 humanos; CAM2 conserva 2 frente a 1 humano; cada coach conserva una transición y mejora el patrón humano si la solución completa demuestra que esa compactación es viable.
- **Reentradas:** CAM1 baja 27→15 frente a 1 humana; CAM2 conserva 1 frente a 0; coaches 0 frente a 2 humanos.
- **Compactación:** A3-008 crea dos bandas amplias P14 y preserva familias/setup y rutas de coach compactas, pero alterna todavía ocho bandas Pasillo y nueve Recursos. No puede considerarse próximo al patrón humano de CAM1.
- **Qué mejoró:** la libertad futura de comida desplazó trabajo y eliminó 12 bloques/cambios/reentradas CAM1 respecto de A3-007.
- **Qué empeoró:** no empeora ninguna estructura medida respecto de A3-007; el frontier gana dos tareas.
- **Diferencias frente al humano:** el motor todavía es muy inferior en CAM1 y algo peor en CAM2; es potencialmente más compacto en coaches y mantiene paridad de una banda por familia setup.
- **Nuevo cuello:** al empatar Future Feasibility, el orden canónico de starts carece de una señal de continuidad y acepta la primera ruptura evitable (`10167@600`).

## Conclusión y siguiente intervención

A3-008 sí mejora estructuralmente A3-007, pero no implementa el principio «primera alternativa = mínimo número factible de bloques». La primera divergencia demostrada ocurre dentro del ordering de placements de un `RESOURCE_TASK`, después de preservar comida: no la causa el selector de macro ni un hard constraint.

La intervención genérica mínima recomendada para una iteración posterior es añadir, **sólo como desempate entre placements con la misma Future Feasibility necesaria**, una medida incremental de continuidad del estado operativo (bloques/cambios/reentradas) sobre recursos, familias setup e itinerantes. Debe preferir primero la alternativa más compacta sin podar candidatos: una división seguirá disponible cuando comidas, transporte, dependencias, capacidad o transición hard la requieran. Esta Evidence no implementa scoring, selector, domains, matching, constraints, meals, transport, backtracking ni budgets.
