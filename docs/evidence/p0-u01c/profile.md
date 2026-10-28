# Perfil integrado y obligaciones

Todas las entidades se crean desde cero por UI/API real; fechas de ensayo 1–4/03/2027 elegidas en el editor. No son horas de planificación. Perfil `STANDALONE_ONLY`, EXACT_CONSTRUCTIVE, presupuesto 10.000, rejilla 5 min, márgenes explícitos cero y transición de recursos explícita cero. Día 08:00–16:00; participantes y físicos 08:00–12:00. Las ventanas, requisitos y dependencias se guardan en plantillas/snapshots por producto.

Se amplía conceptualmente el perfil U01b de 15 obligaciones con competidoras B y C. Tres participantes recorren la unidad; otros tres, independientes, compiten por recursos sin compartir participante ni espacio con ella. No se atribuye a recursos un conflicto de personas.

| Trabajo | Obligaciones | Operaciones físicas | Recursos mixtos / autoridad |
| --- | ---: | ---: | --- |
| Preparaciones | 3 | 3 | Sin recurso; prerrequisito de su primera fase. |
| Fase 1 | 3 | 3 | A+B, 5 min cada una. |
| Fase 2 | 2 | 2 | A+B, 5 min; depende de fase 1 propia. |
| Fase 3 conjunta | 2 | 1 | B, 10 min, dos participantes; depende de fase 2 propia. |
| Fase 3 individual | 1 | 1 | C, 5 min; depende de fase 1 propia. |
| Cierres | 3 | 3 | Sin recurso, dependen de su operación final; fuera de la unidad. |
| Competidoras independientes | 3 | 3 | A:15 min, B:10 min, C:10 min; personas y espacios distintos. |
| Descanso físico | Canal independiente | 1 | A+B y tres espacios de fase, 15 min, ventana 09:00–09:30. |

**17 tareas, 16 operaciones productivas físicas, siete pasos de la macro y ocho obligaciones dentro de ella. Macro de 40 min, fases 3/2/2.** La conjunta no suma 20 min ni ocupa dos veces B. La intersección de recursos de toda la unidad es vacía: A deja de ser requerido en la tercera fase; B no es requerido por la operación C. No se infiere ocupación de A durante esas operaciones. La sucesión temporal cambia de recurso sin imponer permanencia espacial: fase 1/2/3 usa tres espacios distintos, cada uno ocupado sólo por sus operaciones declaradas.

Tres días completos por descartable:

| Día | Configuración real | Resultado real |
| --- | --- | --- |
| `common` | Igual inventario de 17; añade A como requisito real de ambas operaciones de fase 3; fases guardadas. | S1 acepta sólo competidora A, witness global de 17 y pausa. S2 acepta 16 pendientes conservando literalmente S1. Dos Stages REQUIRED auténticos. |
| `mixed` | Recursos de la tabla; conjunta y pausa guardadas. Todos los intentos de cadena mixta rechazados sin alterar día ni Draft. | Dos Stages de 1+16 obligaciones **sin fases**, control para aislar el cambio de contrato. El motor no tiene aquí autoridad para exigir adyacencia. |
| `impossible` | Misma topología mixta, A disponible sólo 08:00–08:40; descanso fijo 08:20–08:35. | NO_PROPOSAL, cero Stages adicionales. También falla en memoria con fases. |

S0 es bootstrap, no una obligación completada. `profile.json` identifica los días, IDs de API, siete representantes y Stages reales. Los receipts `S*-sql` comparan filas con la respuesta API; `S*-validation` conserva cero HARD/REQUIRED nuevos.

En memoria, `mixed-memory-full` incorpora sólo la autoridad interna con conjunto común vacío. Conserva fases, requisitos físicos, participantes, dependencias, pausa y futura composición. `mixed-memory-partial` propone únicamente A y mantiene el resto en witness; `mixed-memory-continuation` incorpora las otras 16 manteniendo A idéntica. No ejecuta apply/validate/accept-stage de este contrato.

`mixed-release-control` ensaya A en la frontera temporal de fase 3 del witness auténtico: la competencia independiente es físicamente admisible al liberarse A; añadir un hold artificial de A a las operaciones finales la vuelve inadmisible. Es un ensayo de ocupación en memoria, no una hora fija del producto ni otro Stage.

El control itinerante es deliberadamente menor: una persona, tres fases de una operación de 5 min, unidad fija A+B en las primeras dos y C directo en la tercera. La unidad se crea por API antes del día, con su correspondencia diaria real. El recurso efectivo es AB→AB→C; el mismo equipo en la tercera produciría ABC y no representaría su liberación. No se generaliza este control reducido a la conjunta itinerante de 17 obligaciones.
