# A3-ORCH-REAL-025 — cierre final del gate one-click por feeding conjunto

Fecha: 2026-09-13. Rama/base obligatoria: `codex/implementar-cambios-para-full-a2` en
`cd8068d464b8a510cf6888335d641c2010420be6`. El árbol inicial estaba limpio.

## Baseline causal 5k

Se ejecutó una vez el runner canónico, con diagnóstico causal y sin seed humano/IA:

```text
PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000 PLANNER_NEXT_FULL_A2_CAUSAL_DIAGNOSTIC=true \
  npx tsx engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts
```

El contrato siguió reconciliado: 266 obligaciones, transición de participante REQUIRED de
5 minutos, preflight y adapter `SUPPORTED`. El resultado fue
`BRANCH_BUDGET_EXHAUSTED`: 4.791 ramas CORE y 209 STANDALONE, profundidad CORE 8,
cero `coreCompleteLeaf` y cero invocaciones de búsqueda standalone. El agotamiento fue
`FEEDER_SLOT_MATCHING_BUDGET_EXHAUSTED` en CORE.

## Primer estado causal y geometría

La primera arquitectura exacta tiene dos runs, de 8 y 11 posiciones. El primero es el bloque
de coach Lucía (`plan-resource:4009`), con mains consecutivos a
695, 710, 725, 740, 755, 770, 785 y 800. Su bloque vocal candidato empieza a 545; ocho
vocales de 15 minutos terminan a 665 y la transición configurada Caracola→E7 de 30 minutos
alcanza exactamente el primer main a 695. No se infirió ni se fijó una hora humana.

La cohorte contiene necesariamente las ocho identidades canónicas de ese coach:
C01, C02, C03, C04, C12, C13, C14 y C15. Por ello el contrafactual de identidad sobre la
misma geometría no puede cambiar membresía; sólo puede permutar participante→main-slot y
participante/vocal→ordinal.

El primer bloque cerrado llega a Future Feasibility en profundidad 8. Los rechazos observados
son 48 por `TRANSITION_COACH` y 33 por `OVERLAP_COACH`. El blocker colocado dominante es
`task:10203`, identidad canónica **C15 / ENSAYO_ESTUDIO_7**, con 66 de 81 eliminaciones.
Los feeders afectados proyectados son C01/C02/C03/C04/C12/C13/C14 /
`PRUEBA_VOCAL_LUCIA`; no se conservaron sólo IDs opacos.

El último rechazo de Future Feasibility conserva `main=task:10002`
(**C01 / ENSAYO_ESTUDIO_7**), `feederStart=545` y blocker pendiente `task:10207`
(**C15 / IN**). La causa terminal de ese witness es por tanto arrival/entry feasibility; las
eliminaciones que forman su dominio previo están dominadas por la agenda conjunta del coach.

## Contrafactual sobre la misma geometría

El certificado diagnóstico del contexto
`2feb71eddd6a042f086e92f485f00fcd5d10b4de9d39b0e531562d3fb3b33b24` conserva:

* 8 slots, 8 perfiles distintos, 64 aristas nominales y dominios `[8,8,8,8,8,8,8,8]`;
* 11 materializaciones de matching distintas, todas rechazadas tras cerrar feeders;
* 88 reparaciones (84 con matching perfecto y 4 sin matching), sin certificado de rechazo
  parcial (`certificate=null`);
* 3.131 augment traversals y agotamiento antes de demostrar el resto de permutaciones.

Para las alternativas realmente alcanzadas se comprobaron, en el orden existente, ventanas
hard de participante, dominio vocal exacto, transición Caracola→E7, márgenes de 5 minutos y
Future Feasibility de las obligaciones pendientes. IN y Estilismo de Entrada permanecieron
virtuales: no aparecen como placements del CORE. La capacidad agregada del coach sí es
nominalmente suficiente (120 minutos de vocal + 30 de transición antes de 695), pero eso no
certifica una agenda participant-envelope conjunta.

El grafo nominal no incorpora todavía un certificado que acople, por arista, IN, Estilismo de
Entrada, vocal, transición y main; tampoco el artefacto conserva un certificado Hall/capacidad
residual para las alternativas no alcanzadas. En consecuencia:

* **no** existe Evidence sound de `ASSIGNMENT_DEFECT`: ninguna alternativa observada mantiene
  viable el core;
* **no** existe Evidence sound de `GEOMETRY_DEFECT`: el presupuesto termina antes de probar
  que ninguna asignación de la misma geometría es viable.

La distinción obligatoria queda por tanto **no demostrada**. Se clasifica `OTHER` en vez de
inventar un certificado. Conforme al prompt, no se introdujo una heurística ni un prune sin
resolver esa distinción.

## Probeta necessary-only y after 5k

Se probó localmente, y luego se revirtió, una envolvente analítica necessary-only de cierre de
prerrequisitos aplicada a las aristas main. Pasó 104 specs focales, incluidos core, residual
matching y main-flow patterns, pero no eliminó ninguna arista del estado causal. El 5k posterior
fue exactamente igual en sus métricas de supervivencia: 4.791/209 ramas, profundidad 8, cero
hojas CORE y cero invocaciones standalone, con el mismo agotamiento de feeder-slot matching.
No se conserva este cambio inefectivo.

Como el 5k no cerró CORE, no se ejecutaron 20k ni 50k. Tampoco se ejecutó un segundo intento de
microoptimización. No se añadieron los tests de una solución no demostrada; los checks focales
ejecutados validan que la probeta no relajaba los casos existentes, no constituyen aceptación
del gate.

## Decisión

```text
ROOT_CAUSE = OTHER
CORE_COMPLETE_LEAF = NO
POST_CORE_REACHED = NO
QUALITATIVE_PROGRESS = NO
ONE_CLICK_SURVIVAL_GATE = FAIL
```

No hubo aumento de budget, phase gate post-core, parche terminal, seed humano/IA, relajación
hard ni merge.

## Validación final

`npm run check` y `git diff --check` pasaron. La ejecución conjunta de las suites afectadas
terminó con 196/198 casos verdes. Los dos fallos también se reproducen aisladamente sobre el
source restaurado: `exactItinerantPlan.spec.ts` espera `COLLECTIVE_CAPACITY` y recibe
`INDIVIDUAL_ZERO_DOMAIN`; `feederClosure.spec.ts` espera 48.959 ramas y recibe 54.214. No se
modificó código productivo ni esos tests para ocultarlos. Constituyen validación pendiente del
head inicial y son otra razón para no presentar un cambio de motor como aceptable.
