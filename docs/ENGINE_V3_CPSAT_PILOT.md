# ENGINE V3 CP-SAT PILOT — ID 015

## Por qué ahora

ID 014 demostró que los vecindarios depth 2 pueden preparar y completar movimientos feeder-aware, pero la mejora en L fue modesta: `restrictiveTalentAverageStartOffset` bajó de 106 a 105, mientras `mainStageGapMinutes=10` y `coachSwitchCount=16` permanecieron. Seguir sumando movimientos manuales específicos aumentaría el riesgo de convertir el motor en una colección de parches. El piloto introduce optimización matemática únicamente sobre un subproblema seguro y mantiene Phase A, backtracking y neighborhoods como generadores existentes.

## Alcance del subproblema

El selector parte de las actuaciones de `optimizerMainZoneId`, incorpora sus dependencias directas (feeders), detecta talents cuya disponibilidad es menor que la jornada y conserva las asignaciones de coach/recurso ya resueltas por Phase A. Solo se incluyen tareas presentes en el warm start, con duración, espacio y zona válidos y recursos ya asignados cuando existe un requisito `anyOf`.

Quedan fuera `done`, `in_progress`, `cancelled`, bloques manuales, locks de tiempo/full, tareas no relacionadas, filas sin warm start, tareas con datos insuficientes y requisitos de recursos que todavía necesitarían decidir una asignación. Todo lo excluido permanece como intervalo fijo del entorno.

## Constraints modeladas

- duración y límites de jornada en grid determinista de cinco minutos;
- no solape por talent, espacio y recurso asignado (incluidos coaches);
- disponibilidad de talent;
- bloque global de comida: cada tarea movible queda antes o después del bloque;
- dependencias feeder → Main Stage, también contra intervalos fijos;
- `done`, `in_progress`, locks y tareas fuera del scope como intervalos no movibles;
- conservación de las filas protegidas fuera del payload candidato;
- validación TS posterior de hard constraints antes de comparar;
- aceptación exclusivamente mediante `compareCandidateSolutions`.

El modelo no elige todavía componentes de kits, operadores, cámaras/sonido alternativos ni recursos compuestos. Una tarea que necesite esa decisión queda excluida.

## Activación y límites

El piloto se activa solamente si hay un Main Stage configurado con huecos, feeders directos, al menos un talent restrictivo vinculado y entre 1 y 30 tareas modelables. El límite del solver es dos segundos, con un único conjunto movible explícito; el resto del plan queda fijado al warm start.

Si OR-Tools no está instalado, se usa un seam/fallback determinista y acotado que adelanta feeders y después actuaciones sobre el mismo grid, valida cada propuesta con las hard constraints existentes y entrega igualmente solo un candidato al comparador. No hay aleatoriedad ni aceptación automática. La metadata distingue intento, aceptación, tamaño, runtime y motivo.

## Resultado O

El escenario O contiene tres actuaciones de Main Stage, dos feeders directos, un talent restrictivo y dos coaches exclusivos. El warm start es hard-válido pero deja 20 minutos de hueco. El piloto selecciona cinco tareas y produce un candidato con:

- `cpSatPilotAttempted=true`;
- `cpSatPilotAccepted=true`;
- `cpSatPilotTaskCount=5`;
- `solutionSource=cp_sat_pilot`;
- `mainStageGapMinutes: 20 → 0`;
- `hardConstraintViolations=0`;
- `selectedCandidateMetricsConsistent=true`.

## Resultado L

L conserva el resultado honesto de ID 014: 99 tareas planificadas, hueco de Main Stage de 10 minutos, offset restrictivo 105, 16 cambios de coach y cero hard violations. El selector encuentra 52 tareas relacionadas, por encima del límite seguro de 30, por lo que no ejecuta el solver:

- `cpSatPilotAttempted=false`;
- `cpSatPilotAccepted=false`;
- `cpSatPilotTaskCount=52`;
- `cpSatPilotReason=task_limit_exceeded`;
- `solutionSource=operational_neighborhood`;
- `selectedCandidateMetricsConsistent=true`.

No se fuerza una aceptación ni se amplía silenciosamente el presupuesto.

## Riesgos residuales

- No es un solver global y no sustituye Phase A.
- El piloto depende de asignaciones de recursos ya resueltas; recursos complejos pueden quedar fuera.
- El fallback determinista permite CI sin binario externo, pero no equivale a la búsqueda CP-SAT de OR-Tools.
- El límite de 30 deja fuera jornadas densas como L hasta mejorar la descomposición.
- El runtime debe medirse con OR-Tools instalado y con datasets reales anonimizados.

## Recomendación para ID 016

Priorizar una **descomposición por ventana crítica de Main Stage** para reducir L de 52 a menos de 30 tareas sin relajar hard constraints. En paralelo, preparar un dataset real anonimizado y modelar explícitamente kits de cámara/sonido antes de ampliar el piloto a recursos alternativos. No se recomienda aún un CP-SAT global ni exponer controles nuevos en UI.
