# A3-ORCH-REAL-021 — Participant boundary pipeline

## Decision

`participantBoundaryRole` is an optional, explicit source identity.  No task name,
template id, space, duration, or observed Full A2 ordering participates in its
classification.  The canonical Full A2 source marks its 19 entry-styling tasks as
`ENTRY_PREREQUISITE` and its 19 exit-styling tasks as `EXIT_PREREQUISITE`.

Boundary tasks remain canonical real tasks.  Exact construction partitions pending
work into `productivePending` and `boundaryPending`; boundary work is absent from
macro units and ordinary DFS.  At a productive leaf the terminal authority schedules
arrival, latest feasible entry tasks, earliest feasible exit tasks, and departure,
then exact coverage and the normal hard validator remain the publication gates.
Historical inputs without the role retain the former terminal-transport path.

## Viability and cost

The existing deferred prerequisite reservation continues to propagate productive
deadlines through the explicit entry dependency chain and reserves/reuses or repairs
the grouped arrival witness.  Boundary materialization uses canonical hard start
domains and `canPlaceTask` for task constraints, explicitly excludes participant-meal
overlaps, and projects materialized operational meals onto each occupied space.
Participant meals are selected with the maintained arrival witness in their occupied
participant geometry; the earlier claim that meals were already fully integrated
into boundary placement was therefore too broad.  It consumes the
shared search ledger per exact boundary candidate; exhaustion is reported as
`BUDGET_EXHAUSTED`, never as infeasibility.  Productive placements are never moved.

## Full A2 5k gate

Baseline A3-020: CORE 1,599 + standalone 3,401 branches, frontier 129, and first
ordinary blocker `task:10044 -> task:10148`.

Candidate (`PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000`): EngineInput preflight and
adapter are `SUPPORTED`; canonical obligation count remains 269; 19 entry and 19 exit
tasks are deferred.  The former `task:10044 -> task:10148` ordinary-DFS phenomenon is
absent.  Productive depth reaches 130 and terminal materialization is attempted 78
times.  The run still ends `BRANCH_BUDGET_EXHAUSTED` at 5,000 branches: each terminal
attempt must repair the arrival witness after participant meals and exhausts the
remaining ledger before the first entry candidate (reported entry/exit branches: 0/0).
Consequently this candidate did **not** reach `COMPLETE + FULL_HARD_VALID`, and the
20k allowance was not used because exhaustion is not isolated to a single terminal
leaf (715 productive reservation prunes are also recorded).  The persisted record is
`docs/evidence/A2-FULL-EXEC-001-first-execution.json`.

This is a material causal shift rather than a claim of completion: boundary depth is
removed from productive DFS, but terminal participant meals invalidate the reusable
arrival witness.  A follow-up must include final meal geometry in the reparable virtual
reservation rather than repeatedly reaching terminal with a stale witness; raising the
budget would hide that causal problem and was deliberately avoided.

## Reserva reparable de presencia (continuación)

La autoridad recursiva ahora conserva una sola reserva de presencia: el witness agrupado
de llegada y sus deadlines, junto con un witness virtual de comidas y un fingerprint
determinista conjunto. La construcción exacta del witness de comidas ocurre una vez;
cada placement posterior valida primero las elecciones existentes sin búsqueda. Las
obligaciones intactas se conservan y sólo las afectadas usan candidatos canónicos para
repair, consumiendo el ledger y distinguiendo agotamiento de ausencia exacta de witness.

Las cuatro capas quedan separadas: la **reserva analítica** descarta únicamente déficits
necessary-only; el **witness virtual** conserva elecciones móviles; el **repair exacto**
se limita a elecciones dañadas; y la **materialización terminal** reutiliza el witness
reservado en vez de reiniciar `MATERIALIZE` global. La validación terminal de llegada es
explícita mediante la autoridad canónica; la mera existencia de grupos ya no prueba su
validez. Los starts de comidas también participan en el deadline terminal de presencia,
por lo que una comida anterior a la primera tarea productiva exige llegada/ENTRY anterior.

En la medición causal 5k posterior al cambio, la búsqueda global de comidas terminales
bajó de 1.493 ramas a cero: se observó 1 build, 89 reuses, 3 repairs y 24 ramas exactas de
repair. Se alcanzó una hoja productiva y la autoridad terminal de presencia, pero el
ledger se agotó antes del primer ENTRY. La única ejecución 20k permitida también terminó
`BRANCH_BUDGET_EXHAUSTED` antes de ENTRY; por tanto no se afirma `FULL_HARD_VALID`, ni
coverage 269 publicada, ni validación hard final. El resultado conserva el diagnóstico
como riesgo pendiente en vez de ocultarlo con un presupuesto mayor.

## Autoridad conjunta y capacidad colectiva (continuación)

La reserva ya no valida llegada con una lista de comidas vacía. Una única autoridad
read-only comprueba conjuntamente la geometría canónica de llegada y cada witness de
comida; además, los dominios exactos de comida reciben el final de la llegada del
participante como límite inferior de presencia. El orden de reparación conserva primero
la llegada e intenta mover únicamente las comidas afectadas; si esa combinación no
existe, la llegada vuelve a buscarse contra los deadlines de las comidas y éstas se
revalidan contra el nuevo witness. `BUDGET_EXHAUSTED` permanece separado de
`NO_WITNESS` y todo candidato exacto consume el ledger compartido.

ENTRY y EXIT comparten ahora un probe necessary-only basado en intervalos. El probe
construye dominios individuales con las autoridades estática y dinámica, certifica
dominios vacíos y aplica una desigualdad conservadora de carga acumulada por espacio y
recurso sobre endpoints de envelopes; no enumera la grid. Cuando el resultado es
inconcluso conserva la rama para el matching implícito en la materialización exacta.
Los checks, prunes colectivos certificados y ramas exactas se propagan a los contadores
`boundaryAnalyticChecks`, `boundaryCollectiveCapacityPrunes` y `boundaryExactRepairs`.

El gate Full A2 de 5k se ejecutó después de esta integración. Preflight y adapter
permanecen `SUPPORTED`, se conservan las 269 obligaciones y se alcanza profundidad
productiva 130, pero el resultado sigue siendo `BRANCH_BUDGET_EXHAUSTED` antes de una
publicación hard-valid. Por la regla del gate no se ejecutó 20k. Esta evidencia no afirma
`COMPLETE`, coverage 269 publicada ni `FULL_HARD_VALID`; queda pendiente aislar el
consumidor terminal que aún agota el ledger antes de completar ENTRY/EXIT.
