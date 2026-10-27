# Gate causal P0-U00y

Base autorizada y comprobada en GitHub: `e0403c90866b5cd54986d68a59b76062e9ac47bc`, también head remoto inicial de `codex/p0-u00y-native-joint-operations`. La migración 119 pertenece a esa base; su integración no implica aplicación a Supabase real. Cero escrituras de aplicación remotas.

Autoridad: Fuentes 00 v2.15, 01 v5.4, 02 v2.2, 03 v3.8 (§6.8, construcción, matching, scopes y futuro), 04 v2.9 (autoridad efectiva, operaciones, revisión), 05 v2.8, 06 v2.10 y 07 v2.3 §4.4. Se cotejaron ambos PDFs originales; prevalece la corrección 06: dos obligaciones de 10 minutos y dos de 5, con dos participantes, no cuatro operaciones físicas ni una fila compartida. Protocolo Maestro, catálogo DEP-04/AST-02, maestro de adecuación y Evidence U00n/p/s/t/v/w/x completan el estado descriptivo; no crean normas nuevas. `authorities.json` registra hashes.

## Experimento anterior al delta

`diagnostic/before.json.gz` conserva los JSON públicos literales del stack auténtico: PostgreSQL 17, Auth GoTrue, PostgREST, Express/Vite y Chromium. Catálogos, plantillas, día, dos participantes y siete tareas se crean mediante UI/API. Cada participante tiene preparación → actividad candidata → actividad posterior. Dos ventanas distintas intersectan realmente; un kit nominal y una actividad competidora presionan el mismo espacio/recurso. No se suministran placements, seeds, horarios ni locks. La pausa global está dentro de la jornada; las ventanas individuales limitan el trabajo efectivo.

El HTTP original devuelve **400**, `unrecognized_keys: jointGroups`, en `shared/dayConfig.ts`. También lo rechaza el perfil general: antes de crear el día aún no existen identidades de tareas diarias que agrupar. El editor nuevo corresponde a la configuración diaria, no a un catálogo de IDs futuros. La captura inicial `ui-before.png` se tomó antes de hidratar y no prueba ausencia de controles; el replay separado `ui-before-reproduced/` espera al editor diario anterior en la base exacta y es la evidencia visual autoritativa.

Después del rechazo, sólo se añaden `jointGroupId` coherentes a dos tareas **en memoria**. Las filas completas de `plans`, el Draft y S0 quedan idénticos. El control de alimentación incompatible amplía únicamente en memoria la duración del prerrequisito del segundo participante a 145 minutos: cabe individualmente, pero ya no puede alimentar la operación común dentro de las disponibilidades. No se declara inviable un problema por truncamiento.

| Control previo | Resultado real | Primer mecanismo material |
| --- | --- | --- |
| A, separadas | 7/7, 9 ramas | Dos ocupaciones ordinarias, sin excepción de simultaneidad |
| B, pareja completa | 7/7 HARD, 9 ramas | Macro JOINT, una decisión temporal, dos identidades |
| C, alimentación incompatible | Sin propuesta, 26 ramas; sin agotamiento | `PREREQUISITE_RESERVATION_PRUNE`, segundo prerrequisito, `INDIVIDUAL_ZERO_DOMAIN` |
| D, un miembro protegido | Sin propuesta, 28 ramas | Macro pendiente contiene sólo el sibling; `MACRO_CANDIDATES_EXHAUSTED` / `standaloneJointGroupStartDomain` |
| Scope de un miembro, sin prerequisites visibles | Devuelve sólo un miembro, 9 ramas | La búsqueda usa ambos; el filtro final de `executeAssistedPlanning` elimina el supporting sibling |
| Scope de un miembro, con prerequisites visibles | Devuelve pareja y ambos prerrequisitos | El cierre supporting ya existía; el catálogo histórico era incompleto en ese punto |
| Sólo competidora | Devuelve competidora, 5 ramas | No produce el witness físico conjunto completo de lo pendiente |

## Recorrido integral y primera pérdida

1. `buildEngineInput` reconstruye snapshots de plantillas, dependencias por participante, disponibilidad y recursos nominales diarios. La autoridad nativa previa no produce membresía conjunta.
2. `preflightEngineInputForPlannerNext` y el adapter admiten el contrafactual; conservan los namespaces de tareas, participantes, espacios y recurso. Las dependencias de ambos participantes permanecen en el problema.
3. `resolveAssistedScope` previo conserva sólo el ID solicitado. `buildAssistedProblem` sí cierra siblings y los dos prerrequisitos como supporting. No hay pérdida del sibling en el grafo ejecutable.
4. `exactItinerantPlan` reconoce una macro `JOINT` y la competidora nominal `RESOURCE_TASK`. `standaloneJointGroupStartDomain`, `canPlaceJointGroup`, `canPlaceTask` y las reservas de prerrequisitos comprueban alimentación y ventanas de ambos miembros. El primer start geométrico puede rechazarse por el segundo prerrequisito; esa poda correcta aparece también en el caso que finalmente tiene solución.
5. `scheduleJointGroup` materializa ambas identidades con el mismo inicio/fin/espacio. Los recursos concretos ya fijan el matching nominal: no hay elección de sustitutos ni matching Main en este control (sus contadores son cero). No se inventa una fase inexistente. La métrica de macro `totalDuration=20` suma dos obligaciones; no constituye una reserva física de veinte minutos. El consumo físico observado es diez.
6. Las agendas/validadores autorizan únicamente peers sincronizados de **ese** `jointGroupId`; los conflictos con otras operaciones, espacios, participantes o el kit permanecen HARD. Las tareas posteriores conservan sus propias dependencias. `validatePlan` del resultado completo es HARD válido.
7. La búsqueda completa usa nueve ramas del límite original de 10.000. El diagnóstico integral registra selección de macros, dominios, reservas, descartes y backtracking; no se cambian ordering, matching, dominios, poda, budgets ni el solver.
8. **Primera decisión incorrecta**: el filtro de propuesta retiene exclusivamente IDs visibles. El supporting sibling se calculó correctamente y se pierde al materializar la selección. Una propuesta de una sola obligación no constituye una operación física aceptable.
9. El control de otra actividad no activa el productor existente del witness nominal/físico. Las reservas analíticas individuales no sustituyen el witness íntegro exigido antes de Stage.
10. El estado parcialmente protegido no es reparado por otra búsqueda. El nuevo contrato lo rechaza explícitamente antes de buscar; los nuevos Stages nunca pueden originar esa partición.

## Contrafactual mínimo, exclusivamente en memoria

`memory-probe.ts` aplica tres transformaciones con esbuild `write:false`, antes de editar producto. `diagnostic/memory-after.json.gz` incluye cuerpos transformados, hashes, inputs/salidas y resumen. No escribe fuentes productivas ni datos. Un marker explícito de versión cierra visibilidad, rechaza protección parcial y activa el productor de witness que ya existía para elecciones físicas/anclajes v2.

La pareja completa continúa en nueve ramas. El scope de un miembro devuelve ambos; el scope de la competidora devuelve únicamente ésta pero conserva witness de las siete obligaciones, incluidos todos los miembros futuros. El witness completo vuelve a pasar `validatePlan`. C sigue rechazado sin agotar el presupuesto; D pasa a rechazo contractual explícito. El experimento no es un Stage.

**Decisión:** productor diario versionado mínimo y reparación de esos dos caminos de proyección/protección. No hace falta rediseño de búsqueda. `jointTasks.ts`, `placeAuxiliaryTasks`, matching, Future Feasibility y el core exacto conservan sus algoritmos.

## Delta material

- `shared/jointGroupStructure.ts`: identidades explícitas y canónicas; al menos dos miembros, sin techo de pareja, una autoridad por tarea. IDs opacos de operación, nunca inferencia por plantilla/nombre.
- `server/jointGroupStructure.ts`: pertenencia diaria, participantes distintos, duración/espacio/requisitos compatibles, dependencias y ventana común; materialización fría exacta desde revisión/replay.
- Writer existente `apply_day_config_operation_v5`, CAS, locks de fuentes, actor, diff, snapshot y transición de sesión. Guardar, editar y retirar no crean otra arquitectura ni cambian S0/históricos.
- Editor diario con tareas reales, espacio, duración, recursos, dependencias, origen y revisión; rechazos contractuales legibles.
- Marker nativo explícito en adapter/Assisted. Los contratos históricos no adoptan semántica nueva automáticamente.
- SQL 120 extiende el consumidor físico **existente** `assert_anchored_choice_witness`: el nombre es histórico; el camino joint está condicionado por su autoridad explícita. No se crea otro solver ni otro modelo de certificado. Valida autoridad, revisión, propuesta auténtica, witness completo, recursos, ventanas, locks, dependencias, indivisibilidad, competencia y protección. La excepción interior no se extiende a otros grupos.

## Fronteras que siguen abiertas

Se certifican auxiliares físicas con recursos concretos, pausa global, standalone o junto a Main/Vocal. El contrato no eleva a productivas combinaciones con comidas individuales flexibles/coordinadas, transporte estructural, rondas, cadenas, setups, anclajes, scopes Reality o elección genérica de recursos. La retirada de una declaración no adopta otra estructura. La familia global sigue **PARTIAL**, con esas dos combinaciones concretas **PRODUCTIVE** tras los gates finales. Los dos grupos A2 ya tienen autoría nativa; la composición de su Alfombra con la continuidad/cadena de fases completa sigue siendo otra frontera.

## Revisión causal tras el primer head de CI

El gate nativo nuevo pasó en GitHub, pero continuidad, alta de días e itinerancia física detectaron el mismo falso rechazo al crear una jornada sin perfil configurado. En la reproducción del head `cd56cbe4`, el HTTP devuelve 500 y la instrumentación read-only del inicializador revela `JOINT_AUTHORITY_NOT_MATERIALIZED`. Un envelope no nulo con `configuration:null` no produce `plannerNextAuthorities`; el guard comparaba `null taskOperations` con `[]`. Se preserva explícitamente la ausencia, manteniendo el rechazo de una autoridad conjunta declarada en un día sin perfil. El recorrido original, sin assertions/timeouts/budgets modificados, vuelve a pasar. No es un cambio de búsqueda ni una relajación de grupos.

## Control saturado de ocupación física

`diagnostic/tight-physical.json.gz` estrecha en memoria únicamente ventanas del input auténtico: el kit dispone de 25 minutos. Competidora + las dos obligaciones suman nominalmente 35 minutos, pero la operación conjunta consume diez una sola vez: 25 físicos en total. Con grupo: 7/7 HARD, ocho ramas. Sin grupo: sin propuesta, dos ramas y sin agotamiento. Los cierres individuales y ambas preparaciones permanecen obligatorios. El test focal reproduce ambos casos sin placements ni seeds. Esto contrasta el consumo real con el contador agregado de duración individual de la macro; no cambia una heurística ni constituye Stage.
