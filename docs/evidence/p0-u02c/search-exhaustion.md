# Segunda topología: agotamiento y alternativa física aislada

La variante U02b AB→AC **se conserva**, incluidos ventana de AB ajustado hasta 11:00, coaches, 24 originales, conjunta con unidad B y carga distinta. No se suaviza para hacer verde U02c. Al añadir sus tres tareas nuevas, ambos órdenes de autoría admitidos sólo en memoria dan:

| Recorrido sobre las mismas fuentes/presupuesto | Resultado |
| --- | --- |
| Búsqueda original sin placement suministrado | NO_PROPOSAL; 10.000 ramas, 88 core +9.912 standalone |
| Condicionar sólo standalone a 08:00, primer inicio elegido por el original | NO_PROPOSAL; 10.000 ramas |
| Condicionar sólo ese standalone a 09:30, fin de ventana de pausa ya configurada | 26 pendientes propuestas; witness completo de 27+pausa, 217 ramas y validación HARD válida |

Los dos órdenes reproducen esos contadores. `search-probe.ts` no cambia EngineInput, tareas, disponibilidades, perfiles, recursos, unidades, políticas o budgets. La condición se pasa como contexto protegido a **un experimento separado**, nunca se escribe en App ni se presenta como éxito de búsqueda original. El horario completo sigue procediendo del solver; sólo se interviene una decisión para falsar la hipótesis. No constituye recomendación de colocar la operación a esa hora.

## Reconstrucción causal

1. Preflight/adapter SUPPORTED; scope completo de 27, sin supporting oculto. Geometría Main/feeder alcanza profundidad tres. La primera hoja física contiene los tres Vocal/Main y dos segmentos, con una sola unidad AB en la tripleta. El matching no pierde identidad de unidad.
2. En la primera geometría, el anclaje ocupa su equipo 10:05–10:35 y los tres Main forman 10:15–11:00. La fase I usa otro snapshot AB ajustado hasta 11:00; compartir A/B limita capacidad aunque sean unidades distintas. La pausa A+B debe caber entre 09:00–09:30.
3. `selectMostConstrainedUnit` elige standalone (`resource:task:81`, o 108 en el otro día), por mínimo dominio: 33 frente a 36 del rival A y 180 realizaciones nominales de cadena. El primer candidato es 08:00–08:20; a continuación coloca rival A 08:20–08:40. Estas decisiones consumen la ventana temprana útil de la macro bajo esa geometría.
4. El primer dead end expuesto corresponde a `technical-chain:task:58` (o 85): 12 candidatos evaluados y agotados en profundidad dos, bajo esas dos decisiones ancestrales. La traza no identifica un `firstPlacementRejection`: es `null`. No se inventa una poda física que la instrumentación no haya mostrado.
5. La exploración de cadena acumula 9.884 ramas, 24 candidatos completos y 28 backtracks de standalone, antes de agotar el ledger. Sólo queda una traza de candidato raíz; no vuelve a probar el inicio posterior necesario para la terminación observada. La instrumentación raw confirma los mismos 10.000 del recorrido Assisted.
6. Fijar únicamente el standalone al límite 09:30 deja que el constructor elija rival A temprano, cadena y pausa compatibles, y el resto. El verificador independiente certifica las 27 obligaciones, recursos y continuidad del witness. Esto demuestra capacidad física existente, no completitud de la búsqueda original.

**Clasificación:** SEARCH_EXHAUSTED. No PHYSICALLY_INFEASIBLE, ni eliminación global de un dominio, ni CONSUMER_DEFECT de matching demostrado. La primera decisión local consume capacidad temprana; el agotamiento impide explorar otra rama que sí funciona. La alternativa permanece en el dominio. No hay base para proponer por reflejo otra heurística, hacer hard el inicio tardío, aumentar presupuesto o cambiar la regla de dominio de macro.

La primera causa **productiva** de U02c sigue siendo autoría; este límite de búsqueda es posterior y distinto del defecto SQL de peers. La unidad funcional recomendada debe conservar este caso como SEARCH_EXHAUSTED sin Stage falso, junto al positivo 27/27 de la topología original. Una futura intervención de búsqueda tendría que explicar su mecanismo y comparar sobre estas mismas fuentes; no se incluye aquí.
