# ENGINE V3 BACKTRACKING — ID 005

## Problema

Phase A sigue siendo la fuente primaria de factibilidad de Engine V3. Su ruta principal construye el plan de forma secuencial: elige una tarea lista, calcula el primer hueco factible en espacio/concursante/recurso/comida y reserva ese intervalo. Esta estrategia puede producir un falso negativo greedy cuando una tarea flexible ocupa primero una ventana que otra tarea posterior, más restrictiva, necesitaba para poder entrar.

## Solución implementada

Se implementa una búsqueda alternativa limitada de tipo **retry de candidatos alternativos** sobre Phase A.

La estrategia no sustituye Phase A ni CP-SAT. Cuando un intento greedy deja tareas sin planificar o devuelve resultado parcial/infeasible, el orquestador V3 inspecciona los diagnósticos de `unplanned`, identifica blockers replanificables en `details.blockingTasks` y lanza ramas deterministas donde esos blockers se fuerzan a empezar después de la ventana restrictiva bloqueada o en el inicio sugerido por el propio diagnóstico.

Cada rama vuelve a ejecutar `solve_v3_phaseA_attempt` con las mismas hard constraints y un mapa interno `forcedTaskStarts`. Ese mapa solo actúa como cota inferior de inicio para tareas pending replanificables; no mueve tareas `done`, `in_progress`, locks ni bloques manuales.

## Por qué esta estrategia

Se eligió retry de candidatos alternativos porque es la opción de menor refactor y menor riesgo para el código actual:

- reutiliza el cálculo de huecos, validación y reserva existente en Phase A;
- no duplica reglas hard;
- no elimina CP-SAT ni cambia su papel de Fase B;
- se apoya en diagnósticos reales de `SPACE_BUSY`/ventanas en vez de inventar un solver nuevo;
- mantiene determinismo porque las ramas se derivan y recorren en orden estable.

## Condición de activación

El backtracking limitado se intenta cuando Phase A greedy no obtiene un plan completo y existe alguna señal de bloqueo relevante:

- hay elementos en `output.unplanned`;
- el intento declara `hardFeasible === false`;
- el input incluye disponibilidad restrictiva de concursantes.

No se ejecuta si Phase A ya encuentra solución completa. Así se evita encarecer los casos que el scoring actual ya resuelve sin warnings críticos.

## Límites

Los límites son internos y configurables desde `EngineV3Options` o campos homónimos del input para pruebas/control operativo:

- `enableLimitedBacktracking`: activado por defecto; `false` lo desactiva.
- `maxBacktrackAttempts`: máximo 50; valor por defecto 50.
- `maxBacktrackDepth`: máximo 2; valor por defecto 2.
- `maxSearchMs`: máximo 1000 ms; valor por defecto 150 ms.

Si el presupuesto se agota, el motor conserva la mejor salida conocida o vuelve al fallback greedy previo. El agotamiento se reporta en metadata con `backtrackingFallbackReason: "budget_exhausted"`.

## Metadata

Se amplía `v3Meta` con campos opcionales compatibles hacia atrás:

- `backtrackingAttempted`
- `backtrackingAccepted`
- `backtrackingAttempts`
- `backtrackingBranchesExplored`
- `backtrackingTimeMs`
- `backtrackingFallbackReason`
- `greedyFailedBeforeBacktracking`
- `solutionSource`

Valores de `solutionSource` usados:

- `phaseA_greedy`
- `phaseA_backtracking`
- `cp_sat`
- `fallback`
- `infeasible`

## Tests

Se añade `engine/v3/limitedBacktracking.spec.ts` con cobertura específica para:

1. falso negativo greedy reproducible a nivel Phase A y recuperación mediante alternativa determinista;
2. determinismo del output relevante y `solutionSource`;
3. conservación de hard constraints con backtracking habilitado;
4. presupuesto bajo sin bucles ni excepciones.

Además, la suite de benchmarks A-F sigue cubierta por `engine/v3/benchmarks/scenarios.spec.ts` y por `npm run benchmark:engine`.

## Impacto en benchmarks

Desde ID 005 el runner de benchmark imprime metadata de backtracking cuando existe: `backtrackingAttempted`, `backtrackingAccepted`, `backtrackingAttempts`, `backtrackingBranchesExplored` y `solutionSource`.

En la ejecución de referencia de ID 005 los escenarios A-F siguen pasando sin violaciones hard. El escenario B sigue quedando resuelto por el scoring greedy actual, por lo que no necesita aceptar backtracking; la mejora añade una red de seguridad para variantes compuestas donde el primer intento sí deje una tarea restrictiva sin planificar.

## Riesgos residuales

- No es un solver global completo: solo explora ramas derivadas de blockers diagnosticados.
- Si Phase A no produce `blockingTasks` útiles, puede no encontrar una alternativa aunque exista.
- La continuidad matemática global del plató principal sigue sin garantía absoluta.
- CP-SAT continúa siendo Fase B parcial y no un solver global de factibilidad.

## Recomendación para ID 006

Recomendación: **convertir CP-SAT en un solver global real o, como paso intermedio, ampliar el diagnóstico estructurado de blockers de Phase A**.

La ruta más sólida a largo plazo es un CP-SAT global que modele ventanas, espacios, concursantes, recursos exclusivos, comidas, dependencias, locks y tareas en ejecución desde cero. Si se prefiere una evolución incremental, el siguiente paso debería mejorar los diagnósticos de blockers para recursos/coaches/feeders, de modo que el backtracking limitado pueda generar ramas alternativas más completas sin relajar hard constraints.
