# Contrafactuales exclusivamente en memoria

`memory.ts` lee el EngineInput y la política enviada a la API en la jornada real. No importa storage/Supabase, no modifica archivos de producto, no escribe DB y no aplica propuestas. Asigna a una copia `dailyTechnicalChainsVersion=1` y la política existente `technicalChains` con fases. Esto simula **la salida del productor faltante**, sin fingir que el productor o SQL la aceptaron. Ningún guard se parchea ni se elimina del checkout o del archivo descartable.

La representación sigue el contrato existente: siete representantes de operaciones; la conjunta conserva el peer fuera de la lista serial. Aplanar fases sólo identifica miembros y da enumeración inicial, no autoridad de precedencia interna. Las tres fases contienen tres, dos y dos operaciones; el conjunto ejecutable conserva ocho tareas de fase y siete tareas externas.

## Experimentos y resultados

| Copia / intervención | Resultado observado |
| --- | --- |
| M1: añadir sólo la autoridad de fases | Preflight/adapter SUPPORTED. Propuesta de 15, witness de 15 + descanso; `validatePlan` con todos los canales hard-valid, todas sus cuentas a cero. 81 ramas/10.000, sin backtracking ni exhaustion. |
| M2: seleccionar un representante de A | Resolución visible de las ocho tareas de fases (incluido peer conjunto); tres preparaciones supporting. Propuesta de ocho, witness global de 15 y pausa; no se pierde ninguna obligación posterior. 81 ramas. |
| M3: seleccionar sólo la competidora | Propuesta de una; la proyección física conserva las otras 14 tareas y pausa como futuro. Witness completo válido. 81 ramas. |
| M4: continuar desde el placement M3, sin escribirlo | Propuesta de 14; decisión protegida preservada; mismo witness global válido. 80 ramas. No es una sesión/Stage SQL. |
| M5/M6/M7: invertir enumeración dentro de una sola fase | Se conserva pertenencia, orden de fases, recursos, tareas, dependencias y ventanas. Cada fase admite otra secuencia realizada válida: 89, 81 y 81 ramas respectivamente. No se cambian heurísticas ni se fijan placements. |
| M8: descanso exacto 08:30–08:45 | La pausa invade el antiguo bloque. El consumidor obtiene otro bloque completo, 225 ramas, todas las ocupaciones afectadas evitan el descanso. Es una variante temporal de memoria, no una edición del día ni un Stage. |
| M9: ambas obligaciones conjuntas como pasos seriales | No propuesta; 10.000 ramas agotadas. El consumidor repite/contabiliza la operación serial; no usar esta alternativa como contrato nuevo ni convertir su agotamiento en imposibilidad física. M1 conserva ambos participantes sin duplicar el paso. |
| M10: mismo input imposible creado por API, más fases | NO_PROPOSAL en seis ramas, sin agotamiento. La cota física ya lo demuestra. |
| M11: `certifyDailyTechnicalChain` sobre las 15 tareas de M1 | INVALID, 0 ramas adicionales, únicamente `OPERATIONAL_MEAL_VIOLATION`. Validar el witness con sus canales completos sí pasa. Retirar sólo la exigencia de pausa de otra copia devuelve WITNESS: diagnóstico de la pérdida, nunca recomendación de retirar la pausa. |
| M12: selección del peer conjunto no representante | Sólo pareja visible/propuesta; el resto se conserva como supporting y en witness válido. Pérdida real de cierre operacional en `resolveAssistedScope`, no pérdida de factibilidad. |

`all-individual-members.json` retiene el experimento M9. `direct-execution.json` conserva accounting completo de la ruta Assisted. Las inversiones cambian sólo el orden de enumeración inicial dentro de una fase; todas usan el mismo conjunto de realizaciones autorizadas. El explorador aislado conserva 30 candidatos para comprobar reanudación, no una prueba exhaustiva. Ningún experimento usa el horario humano ni importa A2.

## Dimensiones ortogonales y autoridades alternativas

`orthogonal-dimensions.json` pasa ocupaciones locales al consumidor existente `taskConflictsWithPolicy`/`operationalMealCandidates`:

- ubicación visual con `blocksSpace=false` y sin recursos afectados no bloquea la pausa;
- la misma ubicación con ocupación física sí la bloquea;
- `blocksSpace=false` no libera un recurso miembro afectado por la pausa;
- existen cuatro candidatos de descanso de la ventana original sin ocupantes, y la selección efectiva se conserva en el witness global.

No se inventa otro modelo de agenda. La autoría diaria del override en la jornada conjunta sigue dando `UNSUPPORTED_TASK_SCOPE_COMBINATION`; no se certifica por estas comprobaciones locales. El perfil normal usa ámbitos físicos por defecto, recursos explícitos y espacios distintos. No prueba agendas itinerantes ni herencia LOCATION/OPERATION_ONLY mezclada con esta estructura.

`continuity-alternative.json` conserva el rechazo `UNSUPPORTED_OPERATION_CONTINUITY_MEMBERS` con múltiples espacios y con una sola conjunta en su espacio. Esa autoridad expresa continuidad de grupo, no fases parcialmente ordenadas: no debe eliminarse el preflight para hacerla pasar por la cadena.

## Frontera de interpretación

Los resultados positivos demuestran reutilización de adapter, scope, macro existente, conjunta, placement, recursos, proyección colectiva, pausas y validación canónica. No demuestran autoría diaria, permisos/CAS de fases, emisión de `safeProposal` del servicio, materialización en Draft ni certificado SQL de la intersección. Se detiene ahí: no se modifica la base para introducir la autoridad ausente y no se envía a aceptar ningún Stage ficticio.

El helper histórico U00y `inspect` incluye una validación superior de tareas sin canales de comidas. Esta auditoría descarta esa comprobación incompleta y valida el witness global con todos sus canales usando el mismo `validatePlan`; conserva además el `hardValid` oficial de Assisted. No se atribuye a producto un fallo del helper diagnóstico.
