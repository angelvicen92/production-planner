# SPEC10-020 — Orden flexible de familias setup

## Regla operativa

Las familias Sillón y Estrellas pueden ejecutarse en cualquiera de los dos órdenes. Cada familia debe formar un único bloque contiguo, no puede existir reentrada y la segunda familia requiere 10 minutos de preparación de set.

## Ruta autoritativa

La capacidad se ejecuta a través de `executePlannerNext` con política `EXACT_CONSTRUCTIVE`. El adaptador conserva `orderConstraint=UNSPECIFIED` como conjunto canónico de familias permitidas; no selecciona ni impone un orden.

La fase exacta usa un enumerador exhaustivo específico de bloques setup:

- comparte el mismo `ExactSearchLedger` que core y standalone;
- no usa beam, `bestK`, fallback ni truncado aproximado;
- explora ambos órdenes y todas las permutaciones compatibles dentro del presupuesto;
- mantiene activa una familia hasta terminarla;
- publica la preparación como ocupación explícita del espacio;
- valida y fingerprinta tareas y preparaciones conjuntamente.

## Evidence

El probe conectado demuestra:

- EngineInput preflight, adaptador y Planner Next preflight aceptados;
- ejecución completa y hard-valid por `EXACT_CONSTRUCTIVE`;
- ambos órdenes observados como candidatos;
- un único bloque por familia y ausencia de reentrada;
- cero preparación antes de la primera familia;
- una preparación de 10 minutos antes de la segunda familia;
- preparación situada exactamente entre ambos bloques;
- resultado y fingerprint incluyen `scheduledSetupPreparations`;
- contabilidad `branchesExplored = coreBranches + standaloneBranches`;
- determinismo, invariancia al orden de entrada e input inmutable;
- compatibilidad con la política histórica `EXPLICIT`;
- agotamiento atómico del ledger, sin publicar candidatos parciales.

La validación reducida del core aplaza únicamente las políticas setup cuyos trabajos pertenecen a la fase posterior. La validación final usa el problema completo y conserva todas las restricciones hard.

## Estado A2

Desaparece `PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED`. El siguiente blocker técnico razonado pasa a ser `PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED`.

## Límites

La búsqueda exacta permanece acotada por `maxBranchExpansions`; no se afirma optimalidad global cuando el presupuesto se agota. No se añade DB, RLS, UI, publicación productiva, hardcodes de nombres ni fallback entre motores.
