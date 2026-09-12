# A3-ORCH-REAL-020 — future feasibility del joint `totales-post`

## Alcance y método

Diagnóstico **read-only** sobre el HEAD obligatorio `cbe423f605de12125c8a29e16c282551154765aa`, con árbol inicialmente limpio. Se ejecutó una sola vez el Full A2 canónico con 5.000 ramas y causal diagnostic activo; el runner hizo además su replay de neutralidad. Ambos lados terminaron `BRANCH_BUDGET_EXHAUSTED`, exactamente en 5.000 ramas (`CORE=1.599`, `STANDALONE=3.401`), con profundidad standalone máxima 129 y equivalencia exacta on/off. No se ejecutaron 10k/20k/300k ni phase gate.

La instrumentación temporal se insertó inmediatamente después de construir el dominio productivo y antes de que el iterador consumiera su primera rama. Copió estado y dominio, y para cada start llamó aisladamente, sin descendencia, en orden: `canPlaceJointGroup`, `checkMacroPendingPrerequisites`, `probeOperationalMealFutureFeasibility` y `maintainDeferredPrerequisiteReservation`. No llamó `ledger.consume`, no escribió caches productivas y no utilizó el resultado para ordenar, eliminar ni visitar candidatos. Un contador separado entregado a la reparación exacta registró **0 ramas diagnósticas** en los 50 casos: las reservas aceptadas se reutilizaron analíticamente y los negativos de transporte fueron certificados antes de enumerar witnesses. Toda instrumentación y el JSON canónico regenerado fueron revertidos.

Comando: `A3_ORCH_REAL_020_TRACE=true A3_ORCH_REAL_020_TARGET='joint:joint-group:joint.totales-post.C06-C10' PLANNER_NEXT_FULL_A2_BRANCH_BUDGET=5000 PLANNER_NEXT_FULL_A2_CAUSAL_DIAGNOSTIC=true npx tsx engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts`.

## Estado congelado

El primer estado exacto inmediatamente anterior a seleccionar `joint:joint-group:joint.totales-post.C06-C10` está en macro depth 77, contiene 120 placements standalone (más el core inmutable) y tiene fingerprint de placements `983bc8fed5246ec9504bd6d86f8494eeeb57e1c9b213b7927433f6b64ccc6de3`.

Placements standalone exactos (`task@start-end`):

`task:10001@570-580, task:10008@580-585, task:10012@585-590, task:10014@890-920, task:10015@635-645, task:10016@655-665, task:10020@720-725, task:10023@710-715, task:10025@715-720, task:10026@765-770, task:10028@960-990, task:10029@600-615, task:10030@625-635, task:10036@1060-1065, task:10038@675-680, task:10040@925-955, task:10041@660-675, task:10042@605-615, task:10049@1065-1070, task:10051@680-685, task:10053@890-920, task:10054@625-635, task:10055@615-625, task:10059@695-700, task:10062@1020-1025, task:10066@760-765, task:10068@960-990, task:10069@740-750, task:10070@615-625, task:10071@1070-1080, task:10075@715-720, task:10079@1080-1085, task:10081@625-655, task:10082@1105-1110, task:10084@995-1025, task:10086@695-705, task:10087@1045-1055, task:10091@710-715, task:10094@790-795, task:10096@795-800, task:10097@780-785, task:10099@745-775, task:10100@740-755, task:10101@1060-1070, task:10107@1025-1030, task:10111@720-725, task:10113@1030-1060, task:10114@730-740, task:10115@995-1005, task:10119@725-730, task:10122@1005-1010, task:10124@740-770, task:10125@705-710, task:10126@775-780, task:10128@1030-1060, task:10129@740-750, task:10130@645-655, task:10134@690-695, task:10137@1010-1015, task:10139@695-725, task:10140@665-670, task:10141@755-760, task:10143@925-955, task:10145@645-655, task:10146@665-675, task:10152@780-785, task:10154@590-620, task:10155@785-790, task:10156@770-775, task:10158@995-1025, task:10159@655-665, task:10160@585-595, task:10167@1095-1100, task:10169@555-585, task:10170@595-600, task:10172@1065-1095, task:10173@675-690, task:10174@635-645, task:10178@700-705, task:10182@1015-1020, task:10184@670-675, task:10185@750-755, task:10187@780-810, task:10188@685-695, task:10189@675-685, task:10196@800-805, task:10198@805-810, task:10200@745-775, task:10201@1050-1060, task:10202@1080-1090, task:10209@1075-1080, task:10211@1100-1105, task:10212@745-750, task:10214@710-740, task:10216@770-780, task:10217@1005-1015, task:10223@990-995, task:10225@1030-1035, task:10227@780-810, task:10228@1035-1045, task:10232@705-710, task:10235@1070-1075, task:10237@730-760, task:10238@725-730, task:10240@675-705, task:10241@755-765, task:10242@1015-1025, task:10248@995-1000, task:10250@765-770, task:10251@740-745, task:10253@710-740, task:10254@1035-1045, task:10255@1025-1035, task:10261@1000-1005, task:10263@705-735, task:10264@1045-1050, task:10266@675-705, task:10267@855-860, task:10268@835-855, task:10269@860-865`.

La reserva operacional está vacía. La reserva de arrival conserva siete grupos: `540:{10006,10021,10165}`, `570:{10034,10047,10150}`, `600:{10060,10077,10180}`, `630:{10135,10194,10207}`, `660:{10092,10233,10259}`, `690:{10105,10120,10246}`, `740:{10221}`. Su fingerprint incluye esos grupos y los 19 deadlines: `10006:545, 10021:560, 10034:575, 10047:580, 10060:605, 10077:605, 10092:670, 10105:695, 10120:695, 10135:635, 10150:580, 10165:545, 10180:610, 10194:635, 10207:650, 10221:745, 10233:665, 10246:700, 10259:665`.

Los 50 starts congelados son: `750, 760, 765, 770, 775, 780, 785, 790, 795, 800, 805, 810, 815, 820, 825, 830, 835, 840, 845, 850, 855, 865, 870, 875, 880, 885, 890, 895, 900, 905, 910, 915, 920, 955, 960, 980, 985, 990, 1040, 1045, 1050, 1055, 1060, 1065, 1085, 1090, 1095, 1100, 1110, 1115`.

## Resultado por start

Todos pasan `canPlaceJointGroup`. Ninguno cae en `HARD_REJECT` ni `OPERATIONAL_MEAL`; el probe de comida se ejecuta, pero el joint no afecta ninguna policy operacional y por ello devuelve `checkedPolicyIds=[]`, sin repair ni policy blocker. “Participante” identifica al participante del blocker cuando la autoridad lo aporta; en transporte el certificado es colectivo de departure y no atribuye un participante único.

| start | clasificación / primera autoridad negativa | reason, blocker y autoridad | deadline / capacidad | reserva |
|---:|---|---|---|---|
| 750 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 760 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 765 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 770 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 775 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 780 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 785 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 790 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 795 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 800 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 805 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 810 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 815 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 820 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 825 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 830 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 835 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 840 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 845 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 850 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 855 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 865 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 870 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 875 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 880 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 885 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 890 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 895 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 900 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 905 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 910 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 915 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 920 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 955 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 960 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 980 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 985 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 990 | `PASSES_MACRO_FF` / — | ninguna; participantes del joint `participant:206` y `participant:210` | — | arrival reutilizada; 0 repair/drop; 0 ramas exactas |
| 1040 | `ARRIVAL_RESERVATION` / `maintainDeferredPrerequisiteReservation` | `departure/CUMULATIVE_CAPACITY`; tasks `{10035,10048,10061,10078,10093,10106,10121,10136,10151,10166,10181,10208,10222,10234,10247,10260}`; participant=colectivo; authorityId/policyId=n/a | demand=16, maximumHardCapacity=15 | witness dropped; 0 repair; 0 ramas exactas |
| 1045 | `ARRIVAL_RESERVATION` / `maintainDeferredPrerequisiteReservation` | `departure/CUMULATIVE_CAPACITY`; tasks `{10035,10048,10061,10078,10093,10106,10121,10136,10151,10166,10181,10208,10222,10234,10247,10260}`; participant=colectivo; authorityId/policyId=n/a | demand=16, maximumHardCapacity=15 | witness dropped; 0 repair; 0 ramas exactas |
| 1050 | `ARRIVAL_RESERVATION` / `maintainDeferredPrerequisiteReservation` | `departure/CUMULATIVE_CAPACITY`; tasks `{10035,10048,10061,10078,10093,10106,10121,10136,10151,10166,10181,10208,10222,10234,10247,10260}`; participant=colectivo; authorityId/policyId=n/a | demand=16, maximumHardCapacity=15 | witness dropped; 0 repair; 0 ramas exactas |
| 1055 | `ARRIVAL_RESERVATION` / `maintainDeferredPrerequisiteReservation` | `departure/CUMULATIVE_CAPACITY`; tasks `{10035,10048,10061,10078,10106,10121,10136,10166,10208,10234}`; participant=colectivo; authorityId/policyId=n/a | demand=10, maximumHardCapacity=9 | witness dropped; 0 repair; 0 ramas exactas |
| 1060 | `ARRIVAL_RESERVATION` / `maintainDeferredPrerequisiteReservation` | `departure/CUMULATIVE_CAPACITY`; tasks `{10035,10048,10061,10078,10106,10121,10136,10166,10208,10234}`; participant=colectivo; authorityId/policyId=n/a | demand=10, maximumHardCapacity=9 | witness dropped; 0 repair; 0 ramas exactas |
| 1065 | `ARRIVAL_RESERVATION` / `maintainDeferredPrerequisiteReservation` | `departure/CUMULATIVE_CAPACITY`; tasks `{10035,10048,10061,10078,10106,10121,10136,10166,10208,10234}`; participant=colectivo; authorityId/policyId=n/a | demand=10, maximumHardCapacity=9 | witness dropped; 0 repair; 0 ramas exactas |
| 1085 | `ARRIVAL_RESERVATION` / `maintainDeferredPrerequisiteReservation` | `departure/CUMULATIVE_CAPACITY`; tasks `{10035,10048,10061,10078,10106,10121,10136,10166,10208,10234}`; participant=colectivo; authorityId/policyId=n/a | demand=10, maximumHardCapacity=9 | witness dropped; 0 repair; 0 ramas exactas |
| 1090 | `ARRIVAL_RESERVATION` / `maintainDeferredPrerequisiteReservation` | `departure/CUMULATIVE_CAPACITY`; tasks `{10035,10048,10061,10078,10106,10121,10136,10166,10208,10234}`; participant=colectivo; authorityId/policyId=n/a | demand=10, maximumHardCapacity=9 | witness dropped; 0 repair; 0 ramas exactas |
| 1095 | `ARRIVAL_RESERVATION` / `maintainDeferredPrerequisiteReservation` | `departure/CUMULATIVE_CAPACITY`; tasks `{10078,10136,10166,10208}`; participant=colectivo; authorityId/policyId=n/a | demand=4, maximumHardCapacity=3 | witness dropped; 0 repair; 0 ramas exactas |
| 1100 | `ARRIVAL_RESERVATION` / `maintainDeferredPrerequisiteReservation` | `departure/CUMULATIVE_CAPACITY`; tasks `{10078,10136,10166,10208}`; participant=colectivo; authorityId/policyId=n/a | demand=4, maximumHardCapacity=3 | witness dropped; 0 repair; 0 ramas exactas |
| 1110 | `PENDING_PREREQUISITE` / `checkMacroPendingPrerequisites` | `COLLECTIVE_CAPACITY`; blockingTaskId=`task:10074` (C06/participant:206); authorityId=`space:3018`; overload `{10074,10133}` | deadline=1120; demand=10, freeCapacity=5 | no alcanzada |
| 1115 | `PENDING_PREREQUISITE` / `checkMacroPendingPrerequisites` | `COLLECTIVE_CAPACITY`; blockingTaskId=`task:10074` (C06/participant:206); authorityId=`space:3018`; overload `{10074,10133,10162}` | deadline=1260; demand=20, freeCapacity=15 | no alcanzada |

Totales: `HARD_REJECT=0`, `PENDING_PREREQUISITE=2`, `OPERATIONAL_MEAL=0`, `ARRIVAL_RESERVATION=10`, `PASSES_MACRO_FF=38`. Las diez negativas de transporte son certificados necessary-only de capacidad acumulada: 16>15 en 1040–1050, 10>9 en 1055–1065 y 1085–1090, y 4>3 en 1095–1100. Las dos negativas de prerrequisitos prueban sobrecarga necesaria de `space:3018` (styling): en 1110, 10 minutos demandados frente a 5 libres antes del deadline 1120 por `task:10074`/`task:10133`; en 1115, 20 frente a 15 e incluye además `task:10162`.

## Ejecución real de los starts que pasan

No se hizo replay recursivo de los 50. En la ejecución real, el iterador visita primero `750`; pasa las cuatro autoridades, **entra en descendencia** y el presupuesto completo se consume bajo esa rama antes de visitar otro start del joint. Por tanto el único start realmente visitado es:

| start | descendencia | profundidad máxima | primera autoridad descendiente observada | terminal |
|---:|---|---:|---|---|
| 750 | sí | 129 | forward check individual de ordinary: `task:10044` causa el primer zero-domain registrado para `task:10148` (styling, C11/`participant:211`); no hay macro posterior porque el joint era el último macro | `BUDGET_EXHAUSTED` |

La profundidad se mide con la misma métrica productiva de placements standalone: el estado congelado tenía 120, el joint añade dos miembros y la rama alcanza 129. El rechazo individual no termina por sí solo toda la rama: se backtrackean alternativas ordinary hasta agotar las 3.401 ramas standalone. No existe un conjunto de varios starts reales del joint del que pueda inferirse un blocker descendiente “común”; sólo `750` fue visitado.

## Respuesta causal y clasificación

**Sí, pero sólo parcialmente:** el dominio hard del joint contiene 12 alternativas que autoridades necessary-only ya disponibles demuestran inviables antes de abrir rama: dos por `checkMacroPendingPrerequisites` y diez por la capacidad acumulada de departure dentro de `maintainDeferredPrerequisiteReservation`. Esto confirma una brecha de dominio local, pero **no explica el fracaso global**: 38/50 (76 %) pasan todas las autoridades macro, y la búsqueda agota presupuesto dentro del primer start válido sin siquiera alcanzar el segundo.

Clasificación final: **`DOWNSTREAM_AFTER_VALID_JOINT`**. No corresponde `ARRIVAL_FF_DOMINANT` (10/50), `PREREQUISITE_FF_DOMINANT` (2/50), `MEAL_FF_DOMINANT` (0/50), `MISSING_JOINT_FUTURE_DOMAIN_FILTER` (la gran mayoría sobrevive) ni `MIXED` (los negativos minoritarios no comparten el dominio del coste dominante).

En consecuencia **no se propone para A3-021 un filtro del dominio del joint**. Aunque reutilizar las autoridades podría retirar analíticamente 12 starts, el benchmark no llega a ellos y esa poda no actúa sobre el consumo observado. El siguiente diagnóstico mínimo debe centrarse, dentro de la descendencia ordinary de `750`, en el primer blocker observado `task:10148` causado por `task:10044`, y separar sus backtracks posteriores hasta el agotamiento; no debe cambiar ordering ni convertir IDs dinámicos en reglas.

No se modificó comportamiento productivo, ordering, dominios, DB, UI, API, ORC, V3/V4 ni publicación. No se hizo merge.
