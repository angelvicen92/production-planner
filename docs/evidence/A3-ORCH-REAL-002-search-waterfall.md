# A3-ORCH-REAL-002 — cascada causal de búsqueda

Base: `9336b0dc233245855bb6cfe7e487ef1f1bc32ea7`. Se ejecutó dos veces el runner canónico Full A2 con `PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000` y diagnóstico causal activo. El propio runner repitió cada ejecución con el diagnóstico desactivado. Los dos JSON diagnósticos fueron byte-idénticos y el JSON canónico grande se restauró; no se versiona en este cambio.

## Certificado compacto

- Resultado: `BRANCH_BUDGET_EXHAUSTED`, 5.000 ramas: 1.599 CORE y 3.401 STANDALONE. El frontier standalone más profundo tiene 31 tareas y fingerprint `d40695af9550709504d21dc3bc6fa081b6704d82b8ba06e42bb17f2f63473866`.
- Antes de entrar en la cascada macro ya se habían consumido 1.777 ramas (1.599 CORE + 178 de `STANDALONE_FORWARD`). Las 3.223 restantes se distribuyen así: RESOURCE_TASK 12 (0,37%), JOINT 0, ROUND_SYNCHRONIZATION 102 (3,16%), TECHNICAL_CHAIN 60 (1,86%) y SETUP_GROUP 3.049 (94,60% de la cascada macro; 89,65% de STANDALONE; 60,98% del presupuesto total).
- `SETUP_GROUP:setup:space:3009` entra con 1.951 ramas consumidas y frontier 31. Su explorer genera 3.045 candidatos completos mediante 3.049 ramas (6 intentos iniciales de matching, 3.043 reparaciones y 3.049 éxitos de matching), pero ninguno entra en un macro descendiente.
- Los 3.044 candidatos con orden Estrellas→Sillón son rechazados inmediatamente y al 100% por `MACRO_PENDING_PREREQUISITE:PENDING_ARRIVAL_DEADLINE`, bloqueando `task:10233` / `participant:217`; el único candidato Sillón→Estrellas recibe el mismo rechazo sobre `task:10246` / `participant:218`. La profundidad 48 que muestran esos certificados incluye las 17 tareas provisionales del setup; no es progreso descendente: el hijo se rechaza antes de invocar la siguiente selección.
- La última macro que permite descender es `TECHNICAL_CHAIN:technical-chain:task:10268`: consume 60 ramas, entrega un candidato completo de tres tareas y lleva el frontier de 28 a 31. La primera macro tras la que ya no existe descenso es el setup. No se alcanza selección ordinaria (`standaloneMaximumDepth=0`).

## Secuencia observada

Todas las decisiones registran reason `mixed-domain-semantic-policy` y 720 minutos de disponibilidad hard. `in` es el presupuesto consumido al entrar, reconstruido exactamente de la contabilidad por explorer; `try` es el número de candidatos sometidos al chequeo macro. Los dominios marcados `~` son cotas conservadoras (`domainExact=false`).

| # | in | frontier | kind / id | dominio | try | resultado |
|---:|---:|---:|---|---:|---:|---|
| 0 | 1.777 | 0 | RESOURCE_TASK `resource:task:10169` | 54 | 4 | 3 rechazos; el cuarto desciende |
| 1 | 1.781 | 1 | RESOURCE_TASK `resource:task:10154` | 47 | 1 | desciende |
| 2 | 1.782 | 2 | RESOURCE_TASK `resource:task:10081` | 45 | 1 | desciende |
| 3 | 1.783 | 3 | ROUND_SYNCHRONIZATION `round:round-synchronization:a2-totales-rounds` | ~684 | 102 | 101 rechazos; uno desciende con 19 tareas |
| 4 | 1.885 | 22 | RESOURCE_TASK `resource:task:10263` | 33 | 1 | desciende |
| 5 | 1.886 | 23 | RESOURCE_TASK `resource:task:10041` | 32 | 1 | desciende |
| 6 | 1.887 | 24 | RESOURCE_TASK `resource:task:10124` | 33 | 1 | desciende |
| 7 | 1.888 | 25 | RESOURCE_TASK `resource:task:10173` | 36 | 1 | desciende |
| 8 | 1.889 | 26 | RESOURCE_TASK `resource:task:10139` | 40 | 1 | desciende |
| 9 | 1.890 | 27 | RESOURCE_TASK `resource:task:10237` | 41 | 1 | desciende |
| 10 | 1.891 | 28 | TECHNICAL_CHAIN `technical-chain:task:10268` | 55 | 1 | 60 ramas del explorer; desciende a 31 |
| 11 | 1.951 | 31 | SETUP_GROUP `setup:space:3009` | ~177 | 3.045 | 3.045 rechazos inmediatos; agota en 5.000 |

La Evidence también registra 3.149 prunes de prerequisitos macro: 3 causados por `resource:task:10169`, 101 por Totales y 3.045 por setup. Por tanto, la concentración aparece inequívocamente al entrar en setup: hasta entonces se usan 174 ramas macro para obtener 31 colocaciones; después una sola geometría compacta de setup repite miles de matchings sin abrir un nuevo nivel.

## Clasificación causal y siguiente intervención

La clasificación principal es **B**: existen candidatos del explorer, pero la autoridad de deadline de llegada rechaza sistemáticamente el 100% antes de generar descendientes. Existe además un mecanismo **C** subordinado: 3.044 reparaciones repiten la misma geometría, prefijo macro y firma de rechazo. No es **A** puro porque el explorer sí entrega 3.045 candidatos, ni **D** porque setup concentra 94,60% del coste macro con una firma causal única.

Siguiente punto de intervención recomendado (no implementado aquí): investigar una poda/certificado read-only-equivalente en la frontera de `SETUP_GROUP` que reconozca, antes de enumerar reparaciones de matching equivalentes, que la geometría `540–635` preserva el mismo `PENDING_ARRIVAL_DEADLINE`. Cualquier cambio posterior debe demostrar que la poda es sound para la autoridad canónica y que no altera ordering, matching ni constraints por aproximación.

## Neutralidad y determinismo

En ambas ejecuciones, ON y OFF coinciden exactamente en status, 5.000 ramas, partición 1.599/3.401, una hoja CORE, un intento de frontier, profundidad CORE 19, profundidad standalone ordinaria 0, fase final STANDALONE y fingerprints CORE/full `null`. La segunda Evidence diagnóstica fue byte-idéntica a la primera. El cuello queda identificado a 5k; por contrato no se ejecutaron 10k ni 20k.
