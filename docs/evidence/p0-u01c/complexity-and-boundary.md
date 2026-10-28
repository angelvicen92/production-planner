# Comparación, coste y límite de Evidence

| Medida | U01a diagnóstico | U01b integrado | U01c diagnóstico |
| --- | --- | --- | --- |
| Perfil integrado representado | 15 obligaciones; fases sólo en memoria. | 15/15 y otra topología 11/11; fases nativas. | 17/17 con fases comunes; 17/17 mixtas **sin fases**; 17 sólo en memoria con fases mixtas. |
| Stages reales relevantes | Control sin fases S1/S2; cero con fases. | Dos Stages por positivo; 12 en dos descartables/3 positivos. | 8 totales en dos descartables: 4 comunes REQUIRED, 4 mixtos sin cadena. **0 mixtos REQUIRED.** |
| Primera barrera | 400 `phases` no reconocido; después guards y pérdidas de certificado. | Fases aceptadas, nominal común requerido en toda la unidad. | ∅ común: 400 API y SQL `INVALID_PHASES`; lista falsa: `RESOURCE_NOT_REQUIRED`. |
| Coste scope independiente / continuación | Control sin fases 21/20; memoria fases 81. | Integrado 81/80; segunda topología 46/45. | Común 17: **83/82**; mixto sin fases **20/19**; memoria fases mixtas **83/82**. |
| Negativo físico | 70/40 en control; 6 ramas. | 70/40, 6 ramas. | Mixto 55/40: **23** producto sin fases; **4.278** memoria con fases; ninguno agota 10.000. |
| Certificado por fases | INVALID por pérdida de descanso. | WITNESS con canal completo; 0 ramas extra. | WITNESS nominal mixto en memoria; 0 ramas extra. |
| Futuro / libertad | Testigos de capacidad y continuación en memoria. | S1 preserva futuro de 15 y S2 lo respeta. | S1 común: una decisión/17 futuras; mixto REQUIRED: lo mismo sólo en memoria. A queda físicamente libre en fase 3; no hay hold inventado. |

Son comparaciones descriptivas, **no un benchmark controlado de aceleración**: cambian recursos y número/independencia de participantes. U01a/U01b se citan desde su Evidence histórica, no se vuelven a ejecutar. U01c usa Node 24.19.0 y la misma cota 10.000 del perfil; ninguna intervención aumenta presupuesto, bestK, patrones ni backtracks.

Dos descartables finales reproducen propuestas, work, witnesses y fingerprints SQL **exactos sin normalizar IDs/horas**. También coinciden full/partial/continuation mixtos e itinerante en memoria. `verification.json` comprueba física deduplicando conjuntas, precedencias, disponibilidad de personas/recursos, descanso, adyacencia/fases, proyección de Stages y preservación de S1. Los manifiestos confirman `checkoutDelta: []` y hashes de fuentes ejecutadas. Los tiempos de pared de ensayos en memoria y del stack están en receipts, separados de ramas; variarán con concurrencia/caché del entorno y no se presentan como SLA.

El negativo tiene una prueba independiente de capacidad: A consume 25 minutos de las dos fases iniciales + 15 de su competidora + 15 de descanso = **55 > 40**. La conjunta B no consume A, ni C lo consume. La configuración sin fases se guarda correctamente y la búsqueda real falla. Con fases en memoria también falla, en 4.278 ramas, sin exhaustion: ese coste mayor existe y se registra; no se añade una poda ni se oculta con otra cota. No se extrapola de este negativo una prueba completa de inviabilidad para otras familias.

## Reutilización y validaciones

Reutilizables sin otro productor de soluciones: cierre de scope, representación de fases, explorer reanudable, `canPlaceTask`, operaciones conjuntas, proyección de recursos efectivos, ledger standalone, `physicalFutureIds/collectiveCoreProjection`, witness global, `validatePlan`, certificado técnico por fases, `assertNominalProposalWitness`, writer/CAS/replay y consumidores Stage de 115/120/121/122.

El requisito común se comprueba en editor, schema, servicio, explorer, validador y SQL. No todas esas repeticiones son redundantes: API, consumidor y SQL son fronteras de confianza distintas. Lo simplificable es **la equiparación semántica entre continuidad temporal y existencia obligatoria de un nominal común**, no la revalidación material ni la autenticidad del witness. La exclusión global de snapshots itinerantes es una frontera conservadora conocida, más amplia que una causa física; el control no acredita su retirada general.

No hay evidencia de agotamiento ni necesidad de matching nuevo en los positivos. Los contadores Main/feeder/bundles/rondas están en cero porque no se ejecutan, no porque este diagnóstico certifique sus garantías. No se evalúa optimalidad ni se enumera todo el dominio futuro.

## Límites y coste neto

- Cero cambios de motor, heurísticas, matching, presupuestos, guards, schema de producto o SQL; 001–122 y A2 histórico intactos. Sólo se añade Evidence y su reproducción.
- Dos stacks finales completos; dos ensayos previos y uno intermedio se usaron para corregir el harness y acotar participantes/control itinerante. El primero terminó por payload de creación de día incompleto en el harness; no fue un rechazo causal de fases. Ninguno modificó runtime ni se usa como recibo final. El run intermedio positivo confirmó los experimentos antes de la repetición final; no se mezcla su conteo con el definitivo.
- 94 tests en ocho archivos focales existentes PASS; typecheck del harness PASS. Sin suite global, build ni A2 Full: no hay delta funcional que los justifique. La CI remota y el estado del PR se consultan aparte.
- Los Stages mixtos sin fases no prueban la secuencia requerida aunque alguna realización sea contigua por casualidad. Los contrafactuales ni cambian revisión ni producen Stage.
- Itinerante: sólo unidad fija con transición configurada cero, tres tareas sin conjunta, sin alternativas ni recomposición interna. El experimento reduce la barrera para localizarla; no sustituye el integrado de 17.
- No se ensayan todos los recursos heredados, locks, disponibilidad fragmentada, cambios de familia, excepciones aceptadas ni combinaciones Main/Vocal. Sus invariantes no se retiran ni se declaran certificadas por transitividad.

La única siguiente unidad recomendada es la descrita en [alternativas y aceptación](alternatives-and-next-delta.md). Esta auditoría no habilita composición nueva y no propone una sucesión de guards como progreso productivo.
