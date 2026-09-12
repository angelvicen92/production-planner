# A3-ORCH-REAL-012 — diagnóstico bloqueado por una divergencia reproducible

Base exacta: `9cf47963203ce7fff0a2ed0091ba38815b1608e7`. La iteración debía observar, sin cambiar el orden, el estado inmediatamente anterior a `task:10182` en el frontier standalone 124. Ese estado **no es alcanzable por el runner canónico en este HEAD**: el Full A2 5k reproducido agota el presupuesto dentro del primer `SETUP_GROUP`, con frontier standalone 0. Por ello no se atribuyen causas a estados que esta revisión no ejecutó ni se inventan conteos de witnesses.

## Gate de reproducción

Se ejecutó una sola vez:

```text
PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000 \
PLANNER_NEXT_FULL_A2_CAUSAL_DIAGNOSTIC=true \
npx tsx engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts
```

Resultado observado:

| medida | requisito de la tarea | observado en este HEAD |
|---|---:|---:|
| estado | `BRANCH_BUDGET_EXHAUSTED` | igual |
| ramas CORE / STANDALONE | 1.599 / 3.401 | 1.599 / 3.401 |
| frontier standalone | **124** | **0** |
| profundidad parcial total | 168 (44 core + 124 standalone) | **44** |
| primera macro standalone | recorrido que acepta setup y desciende | `SETUP_GROUP:setup:space:3009` |
| ramas / starts / candidatos de setup | 122 / 31 / 56 según A3-003 | **3.223 / 1 / 3.219** |
| reparaciones setup | 0 hasta el candidato causal | **3.217** |
| diagnóstico ON/OFF | `exactMatch=true` | **true** |
| CAM1 16 / 15 / 14 | exigido | no existe dibujo standalone que contar |
| fingerprint y branch accounting | invariantes | accounting invariante; no existe fingerprint frontier-124 |

Los 3.219 candidatos del único start se rechazan antes de crear descendencia standalone: 3.218 por `PENDING_ARRIVAL_DEADLINE` con blocker `task:10233` y uno con blocker `task:10246`. El generador entra así en reparaciones del primer start hasta agotar las 3.401 ramas standalone. No se modificó `ledger.consume`, el orden, el dominio ni cache alguna para forzar el estado esperado.

Esta salida contradice la Evidence textual A3-003, que registra 122 ramas, 31 starts y 56 candidatos antes de alcanzar profundidad 121, y también A3-011, que registra profundidad 124. El JSON canónico grande fue restaurado después de la medición y no se persiste.

## Respuesta causal que sí permite el código

La autoridad inmediata de los starts de un `RESOURCE_TASK` está definida, en este orden:

1. hard-validity (`canPlaceTask`);
2. `operationalMealFreedom.minimumWitnesses` descendente;
3. `operationalMealFreedom.totalWitnesses` descendente;
4. reentradas, cambios y bloques físicos incrementales ascendentes;
5. índice canónico.

Por tanto, **si** el estado A3-011 existiese y el start elegido para `10182` tuviese más `minimumWitnesses`, o a igualdad más `totalWitnesses`, ésa sería la única señal de ranking capaz de vencer la alternativa más compacta. No puede afirmarse que eso ocurrió: en esta ejecución no se seleccionó `10182` y no existe el estado previo sobre el que calcular sus candidatos, políticas afectadas, intervalos P14, reservas, prerequisites, comidas de participante, transporte o capacidad colectiva.

La geometría de `operationalMealFreedom` sí queda comprobada estáticamente: no mide intervalos independientes ni minutos directamente. Para cada intervalo continuo libre cuenta **todos los starts representables en la cuadrícula de 5 minutos** mediante `floor((end - duration - first) / 5) + 1`. Así, un único intervalo continuo puede aportar muchos witnesses fuertemente correlacionados. Cinco witnesses contiguos representan 20 minutos entre el primer y último inicio, no cinco reservas independientes; el intervalo conserva además la duración REQUIRED completa. El ranking maximiza primero el menor de esos conteos por política afectada y después su suma.

El probe operacional conserva explícitamente un witness: toma el primer start representable del primer intervalo factible y repara la reserva sólo si ese witness deja de caber en todos los intervalos posteriores. Esa autoridad de reserva ya existente es distinta del exceso de starts usado por `operationalMealFreedom`.

## Auditoría de las 14 reentradas CAM1

No es metodológicamente válido reutilizar la secuencia dibujada por A3-011 y evaluar candidatos contra un prefijo reconstruido: faltan las colocaciones core, las demás colocaciones standalone y las reservas branch-local que forman las autoridades exactas. Tampoco es válido alterar temporalmente la selección de setup para fabricar el frontier, porque la instrumentación dejaría de ser read-only y cambiaría el orden que esta tarea exige auditar.

En consecuencia, las catorce reentradas quedan clasificadas como **`INCONCLUSIVE`** en esta base reproducible:

| reentradas | causa dominante | distinción A/B/C/D |
|---:|---|---|
| 1–14 | `INCONCLUSIVE` | no observable; no se asigna una clase sin ambos candidatos en el mismo estado |

No se puede identificar responsablemente el start elegido de `10182`, su start compacto permitido, una diferencia de witnesses, minutos de libertad, conservación de intervalo REQUIRED ni «única razón por la que gana». Tampoco se puede medir cuántas reentradas desaparecerían potencialmente; el resultado correcto es **no determinado**, no cero.

## Planning drawing diagnosis

- **Agrupación causal:** `INCONCLUSIVE` 14/14 (**100 %**); las otras cinco categorías 0/14 (**0 % observado**, no demostrado como ausencia causal).
- **Primera decisión causal reproducida:** la búsqueda selecciona `setup:space:3009` y permanece en reparaciones del primer start hasta agotar el presupuesto; nunca llega a `task:10182`.
- **Señal exacta que habría que auditar después de restaurar el frontier:** `minimumWitnesses`, luego `totalWitnesses`, antes de `deltaResourceReentries / deltaResourceLocationChanges / deltaResourceBlocks`.
- **Riesgo de modificarla sin el probe solicitado:** perder una comida REQUIRED o conservar sólo una libertad terminal frágil. No se propone ni se inventa threshold.
- **Benchmark de dibujo solicitado:** actual esperado **16/15/14**, humano **3/2/1**, ideal preferente **2/1/0**. El run reproducido no produce CAM1 standalone y por tanto no sustituye esos benchmarks por ceros.

## Estrategias a revisar, sin implementación

Cuando el frontier 124 vuelva a ser reproducible, la comparación debe separar: (A) cero/un witness terminal frágil; (B) múltiples witnesses en ambas alternativas y autoridades preservadas; (C) igualdad real; (D) alternativa compacta inviable. Sólo entonces podrá medirse si conviene suficiencia/criticidad de comida, preservar explícitamente un witness robusto, anteponer compactación al exceso de witnesses, o conservar el ranking actual. La existencia de una reserva operacional explícita sugiere que comparar suficiencia y robustez del intervalo aporta una señal menos redundante que maximizar starts de cinco minutos, pero esta iteración no demuestra cuál estrategia gana.

## Conclusión

El gate obligatorio `frontier=124`, CAM1 `16/15/14` no se conserva en el HEAD obligatorio aun con diagnóstico ON/OFF neutral. La causa de esta iteración no puede atribuirse a comidas ni compactación: el bloqueo anterior está en la enumeración de `SETUP_GROUP`. Se detiene el análisis causal en esa incompatibilidad material, sin cambiar comportamiento productivo y sin presentar Evidence contrafactual como observación.
