# A3-ORCH-REAL-019 — primera pérdida post-core del joint blocker

## Alcance y reproducción

Diagnóstico **read-only** sobre el HEAD obligatorio `28aa3066937598528ebe66acdde37ecc11307247`, con árbol inicialmente limpio. Se ejecutó una sola vez el Full A2 canónico a 5.000 ramas (el runner hizo su replay de neutralidad): `BRANCH_BUDGET_EXHAUSTED`, `CORE=1.599`, `STANDALONE=3.401`, frontier observado 129 y tres scopes `ITINERANT_UNIT`. La instrumentación temporal sólo leyó estados y fue revertida; también se restauró el JSON canónico generado.

Comando: `A3_ORCH_REAL_019_TRACE=true PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000 PLANNER_NEXT_FULL_A2_CAUSAL_DIAGNOSTIC=true npx tsx engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts`.

## Contrato reconstruido

El blocker es `joint:joint-group:joint.totales-post.C06-C10`: `task:10085` (C06/`participant:206`) y `task:10144` (C10/`participant:210`), ambas de 5 minutos, mismo start, `space:3022` y `plan-resource:4008`. No se infiere fase de sus nombres ni IDs. El joint conserva participantes, dependencias individuales, espacio y recurso; `standaloneJointGroupStartDomain` cruza esas autoridades y `canPlaceJointGroup` valida el placement conjunto. Después de cada placement, las autoridades separadas vuelven a comprobar prerrequisitos/arrival reservation, comida operacional, transporte futuro y comida de participantes antes de aceptar descendencia.

El dominio inicial exacto tiene **104 starts**: `540–660, 680–720, 740–960, 980–1020, 1040–1115` (grid 5). Primera alternativa `540`, última `1115`. No existe evidencia contractual de que este joint «deba ir antes»; sólo existe una alternativa contemporánea hard válida.

## Ledger de decisiones aceptadas

La tabla agrupa únicamente tramos consecutivos cuyo dominio exacto no cambia. “Autoridad” identifica la que elimina starts: conflicto hard del placement ya consolidado con participante, espacio, recurso o transición aplicable. Las reservas de arrival y comidas permanecieron factibles para los estados aceptados; cuando rechazaron candidatos no los convirtieron en decisiones aceptadas.

| estado tras decisión aceptada | scope/macro aceptado | placement(s) causal(es) | dominio restante exacto | starts eliminados en la transición | autoridad |
|---|---|---|---:|---|---|
| cierre core | — | — | 104 | — | ventanas y hard placement |
| profundidad 5 | `ITINERANT_UNIT itinerant-team:5003` | `10169@555–585`, `10154@590–620`, `10081@625–655`, `10041@660–675`, `10173@675–690` | 98 | `625–650` (6) | ocupación hard de participantes C06 y recursos de la unidad; no la identidad de unidad por sí sola |
| profundidad 24 | `ROUND_SYNCHRONIZATION a2-totales-rounds` | 19 placements de ronda aceptados | 86 | `925–950`, `995–1020` (12) | participantes C06/C10 y espacio/recurso según cada placement |
| profundidad 26 | `ITINERANT_UNIT itinerant-team:5001` | `10263`, `10124` | 86 | — | — |
| profundidad 29 | `TECHNICAL_CHAIN task:10268` | `10268@835–855`, `10267@855–860`, `10269@860–865` | 85 | `860` | `space:3022` por `10269` |
| profundidad 31 | `ITINERANT_UNIT itinerant-team:5002` | `10139@695–725`, `10237@730–760` | 79 | `695–720` (6) | participante C10 (`10139`) |
| profundidad 48 | `SETUP_GROUP space:3009` | 17 placements | 77 | `690`, `755` | participantes de los miembros setup |
| profundidades 49–64 | 16 `RESOURCE_TASK` | `10001…10160` | 77 | — | — |
| profundidad 65 | `RESOURCE_TASK task:10071` | `1070–1080` | 75 | `1070–1075` | participante C06 |
| profundidades 66–79 | 14 `RESOURCE_TASK` | `10189…10086` | 75 | — | — |
| profundidad 80 | `RESOURCE_TASK task:10070` | `615–625` | 73 | `615–620` | participante C06 |
| profundidades 81–112 | 32 `RESOURCE_TASK` | `10122…10211` | 73 | — | — |
| profundidad 113 | `RESOURCE_TASK task:10079` | `1080–1085` | 72 | `1080` | participante C06 |
| profundidad 114 | `RESOURCE_TASK task:10082` | `1105–1110` | 71 | `1105` | participante C06 |
| profundidades 115–118 | `10094`, `10096`, `10196`, `10198` | placements aceptados; último `10198@805–810` | 71 | — | — |
| profundidad 120 | `JOINT joint.alfombra-roja.C06-C10` | `10069@740–750` + `10129@740–750` | 50 | `540–610`, `655–660`, `680–685`, `740–745` (21) | dependencias/precedencia y ocupación conjunta de C06/C10 |

Por tanto, la **primera transición estricta y material** es `104 → 98`, causada por los placements internos de `ITINERANT_UNIT 5003`, concretamente el intervalo C06 `task:10081@625–655` para los seis starts perdidos. El selector había elegido ese scope por `mixed-domain-semantic-policy`: señal conservadora 54 frente al joint exacto 104; dentro de la unidad eligió primero `task:10169` por `minimum-dynamic-domain`. Contemporáneamente había 78 macros (tres itinerant, 70 resource, dos joint, setup, round y chain). El Future Feasibility antes y después fue **factible** —la rama continuó—, pero la Evidence no certifica igualdad de witnesses ni que otro start del mismo scope conservara los seis starts; no se promueve esa reducción normal a error causal.

## La supuesta transición final a cero

No existe en el dominio hard exacto observado. En el último estado previo a seleccionar el blocker aún hay **50 starts**, `750, 760–855, 865–920, 955–960, 980–990, 1040–1065, 1085–1100, 1110–1115`; primera `750`, última `1115`. El comparador selecciona entonces el propio joint porque es el único macro restante. Por ello la afirmación `dominio > 0 → dominio = 0` no puede atribuirse a una decisión aceptada anterior ni a scope global.

Las cuatro observaciones de cada miembro como blocker pertenecen a filtros posteriores/ramas rechazadas, no prueban que el dominio exacto del joint sea cero. El artefacto vigente no serializa por cada uno de los 50 starts el resultado completo de prerrequisitos, reserva de llegada, comidas y Future Feasibility, ni una alternativa contrafactual del macro anterior. En consecuencia:

- no puede identificarse honestamente una “decisión final exacta” que mate el último start;
- no está probado que otra alternativa de `joint.alfombra-roja` preserve una hoja futura, aunque antes de aceptarlo había 71 starts hard válidos para el blocker;
- al cierre de core el joint podía elegirse hard-valid (104 starts), pero no está probado que elegirlo antes conserve toda la hard/Future Feasibility terminal;
- sí hay competencia global entre scopes, pero **correlación de orden no demuestra causalidad de fase**.

## Lente SPEC-07 y respuesta crítica

1. Main+feeder estaban cerrados: inequívoco.
2. Los scopes itinerantes, joints y operaciones con recursos preservan autoridades explícitas de recursos/equipos/ventanas, pero eso no basta para asignarles ordinal de fase.
3. Round, setup y technical chain son estructuras explícitas; no se inventa que sean “bloques secundarios” de una fase concreta.
4. El resto de estructuras conserva su identidad contractual.
5. `RESOURCE_TASK` queda **`UNRESOLVED`**: no se convierte en fase fija ni se clasifica por duración, nombre, ID o espacio.

Respuesta crítica: **no demostrado**. Una unidad itinerante elegida por el comparador global produce la primera reducción `104 → 98`, pero el joint sigue con 50 alternativas al llegar a ser seleccionado. No se observa que una decisión inequívocamente de fase posterior consuma la última alternativa de una estructura anterior. Como no existe clasificación de fase inequívoca ni transición hard a cero, tampoco se puede separar causalidad de phase scope, unit order o placement interno para el rechazo futuro final.

## Clasificación y salida

Clasificación obligatoria: **`INCONCLUSIVE`**.

Se descartan con la Evidence disponible `TRUE_JOINT_INFEASIBLE` (hay 50 starts hard), `PHASE_SCOPE_CAUSAL` y `UNIT_ORDER_CAUSAL` (fases no clasificables y ninguna pérdida final demostrada), e `INTERNAL_PLACEMENT_CAUSAL` (no hay contrafactual contemporáneo de igual Future Feasibility). `FUTURE_FEASIBILITY_MISSING` describe la brecha de observabilidad, pero no se eleva a clasificación causal porque no está probado que esa autoridad sea la que rechaza los 50 starts.

No se define gate A3-020: hacerlo exigiría inventar fases que el contrato no clasifica. El siguiente diagnóstico mínimo, antes de cualquier gate, debe serializar por start del joint seleccionado la primera autoridad de rechazo y comparar contrafactualmente las alternativas contemporáneas del macro inmediatamente anterior, sin consumir ramas ni cambiar ordering. Debe abstenerse para toda entidad cuya fase siga `UNRESOLVED`.

No se cambió comportamiento productivo, no se hardcodeó A2 y no se hizo merge.
