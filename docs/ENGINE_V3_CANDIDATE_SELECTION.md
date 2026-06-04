# ENGINE V3 CANDIDATE SELECTION — ID 007

## Problema

ID 005/006 demostró que el backtracking limitado podía rescatar una solución cuando el greedy inicial fallaba. Eso no era suficiente para operar bien: si varias ramas de Phase A/backtracking son factibles, aceptar la primera solución completa puede conservar huecos evitables, retrasar talentos restrictivos o escoger una secuencia menos compacta aunque no viole hard constraints.

## Estrategia

ID 007 añade un comparador puro y determinista de soluciones candidatas. El motor sigue usando Phase A como base y conserva CP-SAT como Fase B parcial, pero el backtracking limitado ahora evalúa las ramas exploradas dentro de presupuesto y conserva la mejor según una comparación lexicográfica documentada.

La política sigue siendo limitada y segura: se exploran las ramas generadas hasta `maxBacktrackAttempts`, profundidad máxima actual y `maxSearchMs`; no se convierte en solver global ni se relajan reglas hard.

## Criterios de comparación

El orden de selección es lexicográfico, sin pesos opacos para decidir entre candidatos:

1. Menos `hardConstraintViolations` gana siempre.
2. Más `plannedTasks` gana.
3. Menos `contestantWindowViolations` gana.
4. Menos `mainStageGapCount` gana.
5. Menos `mainStageGapMinutes` gana.
6. Menor `restrictiveTalentLatenessPenalty` gana.
7. Menor `dependencyFeederPenalty` gana.
8. Menor `coachSwitchPenalty` gana.
9. Menor `makespan` gana.
10. Si todo empata, el resultado es determinista y no se introduce aleatoriedad; el fallback seguro conserva la solución base salvo mejora operativa medible.

## Metadata

La metadata V3 incorpora campos opcionales compatibles con consumidores existentes:

- `candidateSolutionsEvaluated`
- `bestCandidateSource`
- `bestCandidateScore`
- `greedyCandidateScore`
- `backtrackingBestScore`
- `candidateSelectionReason`
- `candidateComparisonSummary`

Ejemplos de resumen:

- `phaseA_backtracking selected: rescued 1 planned task(s)`
- `phaseA_backtracking selected: fewer main-stage gaps`
- `phaseA_greedy selected: lower makespan`
- `no alternative candidate improved greedy`

## Escenario H

El benchmark añade **H — Elegir mejor entre dos soluciones válidas**. El escenario fuerza de forma determinista un greedy completo con un hueco evitable en el plató principal y permite que la búsqueda comparativa genere una alternativa compacta. El resultado esperado es completo, sin violaciones hard, con `candidateSolutionsEvaluated >= 2` y `candidateSelectionReason` explicando que se eligió la rama con menos huecos de plató principal.

## Riesgos residuales

- El backtracking sigue siendo limitado; no explora exhaustivamente todas las permutaciones.
- CP-SAT continúa siendo una Fase B parcial y no un solver global completo.
- Las penalizaciones de feeders, coaches y disponibilidad restrictiva son métricas operativas iniciales, suficientes para ranking observable pero no un modelo matemático completo.
- La activación comparativa se mantiene acotada a señales de riesgo operativo para no penalizar masivamente el rendimiento.

## Recomendación para ID 008

La siguiente iteración recomendada es convertir CP-SAT en un solver global real o ampliar la búsqueda comparativa con un dataset real anonimizado. La opción de mayor impacto sería usar los criterios de ID 007 como función objetivo auditable para CP-SAT, manteniendo Phase A como fallback rápido y explicable.
