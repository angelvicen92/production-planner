# A3-ORCH-REAL-004 — certificado causal del frontier 121

Base exacta: `66f8c2b5b8b82a10fc9d1e400eb476e9c5a4819d` (A3-ORCH-REAL-003). Se ejecutó el runner canónico Full A2 con diagnóstico causal ON a 5.000 y 10.000 ramas; cada ejecución hizo además su replay OFF. El JSON canónico grande se restauró y no se versiona.

## Comparación 5k / 10k

| medida | 5k | 10k | delta |
|---|---:|---:|---:|
| status | `BRANCH_BUDGET_EXHAUSTED` | `BRANCH_BUDGET_EXHAUSTED` | — |
| ramas totales | 5.000 | 10.000 | +5.000 |
| CORE / STANDALONE | 1.599 / 3.401 | 1.599 / 8.401 | 0 / +5.000 |
| frontier macro standalone | 121 | 121 | 0 |
| fingerprint del frontier | `d3a35f0f…d861fb3a` | `d3a35f0f…d861fb3a` | idéntico |
| macros seleccionadas / orden registrado | 84 / 84 | 84 / 84 | 0 / 0 |
| ramas / starts / candidatos de SETUP_GROUP | 122 / 31 / 56 | 122 / 31 / 56 | 0 / 0 / 0 |
| ramas de macros RESOURCE_TASK | 2.939 | 7.939 | +5.000 |
| prunes por llegada pendiente | 1.311 | 2.787 | +1.476 |
| prunes por comida operacional | 1.547 | 4.696 | +3.149 |
| prunes por capacidad colectiva | 66 | 216 | +150 |
| candidatos que pasan ambas puertas y descienden | — | — | +225 |

`exactMatch=true` en los cuatro resultados ON/OFF: coinciden status, ramas totales y por fase, hojas CORE, invocaciones y profundidad ordinaria standalone, backtracks, fase de agotamiento y fingerprints. El prefijo compartido también es determinista: ambos runs tienen las mismas 84 entradas de `macroSelectionOrder`, el mismo frontier y el mismo siguiente selector (`RESOURCE_TASK resource:task:10209`, dominio exacto 22).

## Secuencia desde SETUP_GROUP hasta 121

El prefijo anterior a setup es el ya certificado en A3-ORCH-REAL-003: tres RESOURCE_TASK, Totales, seis RESOURCE_TASK y la cadena técnica `task:10268`. `SETUP_GROUP setup:space:3009` entra con frontier 31 y 1.951 ramas consumidas. Tras 31 starts y 122 ramas, el primer descendiente exitoso es el bloque compacto `690–785`, Estrellas→Sillón, `matchingRepairIndex=0`; sale con 2.073 ramas consumidas y 48 tareas colocadas.

Desde ese descendiente, los dos runs registran exactamente esta secuencia macro (los rangos son sólo compactación editorial de una secuencia idéntica, no conjuntos reordenables):

| tramo | secuencia | efecto estructural |
|---|---|---|
| 12–14 | RESOURCE_TASK `10001`, `10008`, `10012` | 48 → 51 |
| 15–16 | JOINT `alfombra-roja.C06-C10`, `totales-post.C06-C10` | abre el siguiente tramo conjunto |
| 17–43 | RESOURCE_TASK `10071, 10055, 10146, 10101, 10130, 10160, 10115, 10042, 10016, 10255, 10030, 10242, 10087, 10228, 10217, 10202, 10174, 10189, 10100, 10070, 10054, 10114, 10145, 10062, 10159, 10107, 10029` | progreso monotónico del mismo descendiente |
| 44–69 | RESOURCE_TASK `10122, 10254, 10167, 10015, 10111, 10216, 10023, 10079, 10241, 10137, 10152, 10140, 10086, 10036, 10082, 10125, 10049, 10155, 10170, 10025, 10038, 10051, 10188, 10201, 10094, 10096` | continúa el mismo sufijo |
| 70–82 | RESOURCE_TASK `10223, 10225, 10235, 10238, 10248, 10250, 10261, 10264, 10182, 10184, 10196, 10198, 10209` | alcanza por última vez el frontier 121 |
| 83 | RESOURCE_TASK `10209` de nuevo | primera selección cuyo dominio completo se cierra sin superar 121 |

El punto exacto que aumenta por última vez el frontier es el descendiente que fija `resource:task:10198`; deja como siguiente unidad `resource:task:10209`. En ese estado, sus 22 alternativas hard-valid reales son exactamente: siete starts `540–570` cerrados por `PENDING_ARRIVAL_DEADLINE`, catorce starts `885–950` cerrados por `OPERATIONAL_MEAL` (`break:plato-14-operations`) y el start `1115` cerrado por capacidad colectiva. Esta distribución 7/14/1 y el fingerprint son idénticos a 5k y 10k.

## Accounting de las 5.000 ramas adicionales

Las 5.000 ramas adicionales son íntegramente candidatos RESOURCE_TASK y cada una pasa primero por la autoridad de prerequisitos pendientes:

| salida de la rama adicional | ramas | porcentaje |
|---|---:|---:|
| `PENDING_ARRIVAL_DEADLINE` | 1.476 | 29,52% |
| capacidad colectiva de prerequisitos (`task:10018`) | 150 | 3,00% |
| pasa prerequisitos y falla `OPERATIONAL_MEAL` de Plato 14 | 3.149 | 62,98% |
| pasa ambas puertas y abre un descendiente del sufijo | 225 | 4,50% |
| **total** | **5.000** | **100,00%** |

Así, `OPERATIONAL_MEAL` + `PENDING_ARRIVAL_DEADLINE` explican exactamente **4.625 / 5.000 = 92,50%**. Las comprobaciones de prerequisitos crecen en 5.000; 1.626 podan allí (1.476 deadline + 150 capacidad), las 3.374 restantes alcanzan la reserva de comida y 3.149 son podadas. Esto evita doble conteo.

La hipótesis de «aproximadamente 13 alternativas reales del mismo sufijo» no queda confirmada por la Evidence: el estado profundo certificado tiene **22** starts reales (7/14/1), y las ramas extra no repiten sólo un prefijo equivalente. Los prunes de prerequisitos adicionales proceden de seis unidades causantes distintas (`10182` +8, `10184` +62, `10196` +480, `10198` +295, `10209` +485 y `10211` +296) y se reparten por siete profundidades 77–83. Las 225 ramas que atraviesan ambas puertas demuestran descenso entre variantes, pero ninguna produce un estado más profundo. Lo común es el prefijo determinista hasta SETUP_GROUP y la reconvergencia en el mismo frontier 121, no una única alternativa repetida 5.000 veces.

## Clasificación, relación causal y siguiente intervención

Clasificación principal: **B**. Existen candidatos hard-valid y se exploran alternativas distintas, pero las autoridades canónicas los cierran antes de crear progreso estructural. No es A (hay 22 alternativas reales en el frontier), C puro (hay seis unidades causantes y siete profundidades en el delta) ni D (dos autoridades explican por sí solas 92,50%).

Las autoridades son **blockers independientes sobre alternativas temporales distintas**, no una cadena causal. La comprobación `PENDING_ARRIVAL_DEADLINE` precede operacionalmente a la de comida; por eso una misma rama nunca se contabiliza en ambas. Pero el deadline no provoca la falta de comida ni la comida provoca el deadline: starts tempranos de `task:10209` fallan llegada, starts intermedios fallan la ventana de `break:plato-14-operations`, y el start tardío falla capacidad colectiva. Ambas son consecuencias del mismo prefijo macro que termina en `resource:task:10198` y de seleccionar después `resource:task:10209`.

**Punto recomendado para la siguiente intervención (no implementada):** la frontera entre el descendiente aceptado de `resource:task:10198` y la enumeración del dominio exacto de `resource:task:10209`. El siguiente experimento debe razonar conjuntamente —sin suavizarlas ni alterar su precedencia— sobre la reserva hard de comida de Plato 14 y los deadlines de llegada, antes de multiplicar el mismo sufijo. Debe conservar ordering, matching, dominios, Future Feasibility, constraints y budgets, y demostrar neutralidad contra ambas autoridades canónicas.
