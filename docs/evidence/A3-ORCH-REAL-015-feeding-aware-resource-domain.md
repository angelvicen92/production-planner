# A3-ORCH-REAL-015 — dominio `RESOURCE_TASK` consciente de alimentación

Base: `814621867e091e86c69e780158060b0d9624cc5d`. El cambio es genérico y no contiene IDs, nombres ni horas de A2.

## Autoridad y contrato

`assessPendingArrivalFeeding` reutiliza `createPendingCompletionDeadlineAuthority` (propagación bidireccional por precedencias y placements fijos) y `assessAnonymousPostInCompletions` (dominios hard de IN, separación y capacidad de grupos). Su único resultado negativo concluyente es el mismo certificado `PENDING_ARRIVAL_DEADLINE` consumido por `checkMacroPendingPrerequisites`. Un input incompleto o una prueba positiva se considera inconcluso y conserva el start.

Para cada `RESOURCE_TASK`, el selector parte del dominio hard dinámico, materializa cada placement provisional y ejecuta esta prueba necessary-only. El `domainSize` y la visita posterior usan exclusivamente los starts supervivientes. Meal freedom y compactación sólo reordenan ese conjunto. No se ejecuta DFS exacto, repairs, matching ni se consume `ledger` durante el cálculo del dominio.

La reutilización de cotas `day.end` para obligaciones no ancestras es deliberadamente optimista: los successors fijos y la cadena ancestral completa del candidato mantienen la propagación causal, mientras una obligación ajena nunca puede fabricar un certificado negativo. Es una abstención segura, no una regla soft.

## Evidence explícita

La Evidence productiva añade:

- `resourceTaskDomainLogicalStarts`: starts del dominio hard dinámico antes de alimentación;
- `resourceTaskDomainFeedingChecks`: placements provisionales analizados;
- `resourceTaskDomainAnalyticallyEliminatedByArrival`: certificados negativos concluyentes;
- `resourceTaskDomainInconclusiveStarts`: checks sin autoridad suficiente;
- `resourceTaskDomainKeptStarts`: starts visitables después de la prueba.

El fixture focal `IN → preparación → RESOURCE_TASK` obtiene 10 starts lógicos, ejecuta 10 feeding checks, elimina 7 y conserva exactamente 3 (`35`, `40`, `45`). La variante con colecciones invertidas conserva fingerprint y conjunto; un IN con membership incompleta mantiene el start por abstención. El fixture de capacidad anónima cubre además que la capacidad/grupos conjunta puede certificar imposibilidad aunque cada llegada aislada quepa.

## Full A2 5k

Baseline autoritativa A3-014: frontier `124`, CAM1 `16/15/14`, CORE/STANDALONE `1599/3401`, y dominio raw de `task:10182` igual a `56`; `task:10182@540` era rechazado dentro de la rama con `PENDING_ARRIVAL_DEADLINE` (`demand=1`, `maximumPossible=0`).

Se lanzó el runner canónico 5k, diagnóstico OFF para evitar una segunda ejecución, cuatro veces durante la optimización del coste analítico. Las ejecuciones se interrumpieron manualmente, la más larga tras 38 minutos, sin salida ni artefacto final. No se lanzó 10k. Por tanto este entorno no produjo una medición post-change autoritativa de frontier, primer macro, CAM1/CAM2/coaches/setup, comidas ni Planning drawing delta. Tampoco se sobrescribió `A2-FULL-EXEC-001-first-execution.json`.

La ausencia de resultado 5k es riesgo pendiente: aunque el test focal demuestra que el start equivalente a `10182@540` se elimina antes de `ledger.consume`, no se afirma aquí un conteo post-change de dominio `10182`, branches `PENDING_ARRIVAL_DEADLINE`, frontier o blocker nuevo sin Evidence terminada. Los contadores nuevos hacen explícito el coste del barrido analítico y permitirán medirlo en un runner con tiempo suficiente.

## Validación

- `npx tsx --test engine/planner-next/macroPendingPrerequisiteForwardCheck.spec.ts`: 17/17.
- tests focales `RESOURCE_TASK` en `exactItinerantPlan.spec.ts`: 3/3.
- `npm run check`: correcto.
- `git diff --check`: correcto.

No se hizo merge.
