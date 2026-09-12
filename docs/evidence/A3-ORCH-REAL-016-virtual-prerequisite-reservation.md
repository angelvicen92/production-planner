# A3-ORCH-REAL-016 — reserva virtual reparable de prerrequisitos

Base obligatoria: `c8fab5f6768bb1c0f6bd26284626cad55dab9269`.

## Decisión técnica

La reserva ya no es únicamente un certificado optimista. Al cerrar `main+feeder`, la autoridad de deadlines recorre la cadena transitiva pendiente y el constructor exacto de transporte crea un witness canónico de IN usando la política efectiva (target, mínimo/máximo, gap y dominios hard). El estado recursivo conserva grupos, deadlines y fingerprint. Estilismo y cualquier otro prerrequisito intermedio siguen siendo virtuales: sólo estrechan el deadline propagado; no se les asigna un start.

Después de cada placement se valida el witness contra los dominios y deadlines actuales. Si sigue válido se reutiliza sin búsqueda; si no, se invoca el mismo constructor exacto de transporte para repararlo. Un certificado necessary-only puede podar antes y un `NO_WITNESS` exacto puede podar después; una búsqueda agotada propaga agotamiento y nunca se interpreta como imposibilidad. La hoja terminal entrega los grupos reservados a `materializeTerminalTransport` para su validación/reutilización final.

## Evidence focal

- El fixture genérico de dos participantes construye la reserva inicial desde el deadline efectivo del core, no desde `day.start`.
- Un placement ajeno conserva exactamente el fingerprint y produce cero ramas de witness (reuse).
- Adelantar la primera obligación de un participante cambia su deadline, invalida el witness y produce una reparación determinista. El diagnóstico causal conserva task causante, boundary anterior/nuevo, fingerprint/resumen anterior y diagnóstico del constructor reparador.
- Si el nuevo límite deja un participante sin ningún IN posible, la rama se rechaza y se registra el drop; no se materializa el prerrequisito intermedio.
- La inversión del input conserva el resultado y el fixture no contiene nombres ni IDs de A2.
- Los tests de transporte verifican que el terminal reutiliza una reserva válida y que una reserva invalidada se repara con la autoridad exacta.

## Full A2 — presupuesto 5.000

El candidato con diagnóstico causal OFF terminó con `BRANCH_BUDGET_EXHAUSTED`: `CORE=1.599`, `STANDALONE=3.401`, total `5.000`, y conservó frontier standalone máximo `129` (no hay regresión frente al baseline documentado). La reserva realizó `2.711` mantenimientos, `18` ramas exactas de witness y `8` reparaciones; registró `1.263` prunes/drops exactos. El primer blocker necessary-only siguió siendo `PENDING_ARRIVAL_DEADLINE`, cutoff `530`, demanda `2`, capacidad máxima `0` (participantes `participant:217` y `participant:219`).

El gate hard no llegó a hoja terminal dentro de 5k, por lo que terminal reuse fue `0` en Full A2; su conexión y reutilización real quedan demostradas focalmente. Se conservaron `9` prunes de comida operacional, `0` prunes de comida de participantes, `122` ramas de setup, y no se produjo publicación parcial. La ejecución observada tardó aproximadamente 30 segundos de pared. No se ejecutó 10k, 20k ni 300k.

## Validación

- `npx tsx --test engine/planner-next/deferredPrerequisiteReservation.spec.ts engine/planner-next/transportGrouping.spec.ts`: 37/37.
- `PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000 PLANNER_NEXT_FULL_A2_CAUSAL_DIAGNOSTIC=false npx tsx engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts`: terminó, contabilidad exacta 1.599/3.401 y frontier 129.
- `npm run check`: correcto.
- `git diff --check`: correcto.

No se hizo merge.
