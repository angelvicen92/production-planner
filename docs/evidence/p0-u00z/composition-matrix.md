# Composición transversal: antes y después de U00z

Base técnica exacta: `ade9fd65`. Durante la revisión, main avanzó a `53ceb251` (#1205), exclusivamente AGENTS/Master. Se incorpora su gate documental sin cambiar producto, datos, budgets ni las pruebas sobre la base técnica. El conflicto fue una inserción simultánea en el Master; se conservan ambos apartados.

La matriz usa los estados del nuevo gate. `UNSUPPORTED_EXPLICIT` indica la primera frontera del productor, **no inviabilidad física**. `NOT_TESTED` no certifica una combinación por transitividad.

| Capacidad × capacidad | Antes | Después | Certificado / primera frontera |
| --- | --- | --- | --- |
| Descanso explícito × tareas ordinarias/recursos nominales | UNSUPPORTED_EXPLICIT (400 contrato diario) | PRODUCTIVE_COMPOSED | A, un descanso común de dos espacios/cámara, 3/3 tareas y Stage. Test adicional de espacio único y recurso solo, independiente de nombres. |
| Descanso × unidades itinerantes/recomposición | UNSUPPORTED_EXPLICIT | PRODUCTIVE_COMPOSED | B, 4/4 y dos Stages, dos pausas independientes y witness global pendiente; la tercera composición no crea otra pausa. |
| Descanso × scope diario/agenda/herencia/ocupación | UNSUPPORTED_EXPLICIT; CONSUMER_DEFECT en contrafactual visual | PRODUCTIVE_COMPOSED | B/D, 4/4; miembros físicos conservados, ubicación sin ocupación puede trabajar durante pausa del espacio. |
| Descanso × Main/Vocal | UNSUPPORTED_EXPLICIT; CONSUMER_DEFECT en certificado SQL | PRODUCTIVE_COMPOSED | C, 4/4 y Stage; puente Main declarado y feeder paralelo, pausa sin tareas consumidoras conservada. |
| Descanso × operación conjunta | UNSUPPORTED_EXPLICIT | PRODUCTIVE_COMPOSED | Perfil U00y ampliado mediante API real, 7/7 y Stage. |
| Descanso × operación conjunta × Main/Vocal | UNSUPPORTED_EXPLICIT | PRODUCTIVE_COMPOSED | Mismo perfil lógico U00y ampliado, 11/11, S1 parcial/S2 exacto, recursos reales y protección SQL. |
| Descanso × comidas individuales/capacidad | UNSUPPORTED_EXPLICIT; CONSUMER_DEFECT por canal SQL | PRODUCTIVE_COMPOSED | E, 4 tareas + 2 comidas + 1 pausa, dos Stages en dos bases, continuación/rollback/redo y cuatro replays exactos. |
| Descanso × anclaje A/B | UNSUPPORTED_EXPLICIT | UNSUPPORTED_EXPLICIT | `operationalMealsCombinationSupported`, luego SQL `assert_daily_operational_meals`. Contratos productivos por separado; falta autenticar conjuntamente geometría anclada, alternativas y pausas en SQL. |
| Descanso × ronda diaria | UNSUPPORTED_EXPLICIT | UNSUPPORTED_EXPLICIT | Mismo primer guard por `roundSynchronizations`; falta composición del canal de preparaciones/ronda con el certificado físico. |
| Descanso × cadena técnica REQUIRED | UNSUPPORTED_EXPLICIT | UNSUPPORTED_EXPLICIT | Mismo primer guard por `technicalChains`; no se declara certificado de continuidad/pasos con pausas. |
| Descanso × setup | UNSUPPORTED_EXPLICIT | UNSUPPORTED_EXPLICIT | Mismo primer guard por `setupPolicies`; faltan preparación, cambio y continuidad en el certificado compuesto. |
| Descanso × transporte | UNSUPPORTED_EXPLICIT | UNSUPPORTED_EXPLICIT | Mismo primer guard por `transportSettings`; no se certifica conservación conjunta de batches, alimentación y recursos. |
| Descanso × continuidad estructural diaria | UNSUPPORTED_EXPLICIT | UNSUPPORTED_EXPLICIT | Mismo primer guard por `operationContinuityGroups`; no se confunde con continuidad Main ya certificada. |
| Descanso × byType/anyOf estructural | NOT_TESTED | NOT_TESTED | Las elecciones nominales previas se regresan; no se eleva la intersección estructural por ese resultado. |
| Conjuntas × anclajes/rondas/setup/cadenas, con o sin descanso | NOT_TESTED / límites previos explícitos | NOT_TESTED / límites previos explícitos | Fuera de las intersecciones certificadas; consultar U00u–y y guard de cada autoridad. |
| A2 completo configurado desde UI | NOT_TESTED | NOT_TESTED | Ninguna de estas jornadas representa las 266 obligaciones A2. El replay importado permanece separado. |

Los guards estructurales restantes son **conservadores y globales**: también excluyen potenciales actividades disjuntas o una pausa fuera de la estructura. No se ha demostrado incompatibilidad física de esos casos ni se convierten en reglas de negocio. La razón pendiente es la autenticación simultánea de sus canales/relaciones en el consumidor y el certificado, no un nombre de tarea o la mera presencia de un equipo itinerante. Retirarlos sin ese gate produciría una promesa más amplia que la evidencia. El caso individual demuestra que una frontera localizada sí se resuelve dentro de U00z, en lugar de abrir otra variante.

## Jornada integrada creciente y mapa de obligaciones

El perfil de operaciones conjuntas se conserva respecto de U00y, con sus dos participantes por operación, dependencias, espacios, cámara y materialización individual. En descartables se añade mediante API una autoridad de disponibilidad sobre los miembros/espacios reales, sin modificar engine input ni sembrar asignaciones. El perfil pequeño mantiene 7 obligaciones; el perfil ampliado añade Main/Vocal y segundo grupo, llega a 11 obligaciones y demuestra S1 parcial → futuro global → S2. El dispatch literal del harness y sus hashes constan en el manifiesto; `joint-integration/receipts.json.gz` conserva propuestas, Draft, validaciones, Stages, tareas SQL y negativos. Es ampliación de la misma topología lógica; no es un fixture A2 importado.

E añade otra intersección real al perfil de preparación/grabación por participante: dos preparaciones, dos grabaciones dependientes, dos obligaciones individuales de comida de capacidad 1 y un descanso físico de sala/cámara. S1 sólo acepta una preparación; la realización global restante incluye ambos canales de comidas. S2 materializa las seis obligaciones y la pausa sin mover S1. Los recursos físicos persisten en SQL; rollback/redo conserva el snapshot final. A/B aportan las topologías independientes requeridas, con miembros compartidos y ventanas diferentes. No se presume que unir estos perfiles sea automáticamente productivo.

La intersección A2 pendiente de mayor impacto sigue siendo la **unidad REQUIRED de fases conjuntas y su alimentación física** (operaciones descritas como Alfombra en el PDF), seguida de su composición con los descansos y estructuras previas. Debe auditarse completa antes de otro productor: continuidad/cadena, pares de obligaciones, alimentación, competencia y certificado común. Las transiciones de coaches y `requiresBand` son otras brechas explícitas. La prioridad no se deriva del último error de harness ni del número de tests verdes.
