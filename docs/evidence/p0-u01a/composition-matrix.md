# Matriz capacidad × capacidad y comparación causal

Antes = main autorizado tras U00z. Después = mismo producto, auditado por U01a. **No se habilita ninguna combinación mediante este PR.** `MEMORY_WITNESS` describe prueba diagnóstica, no un estado productivo del gate.

| Cruce | Antes | Después de auditoría | Evidencia / primera frontera |
| --- | --- | --- | --- |
| Participantes × dependencias × recurso nominal × conjunta × descanso | PRODUCTIVE_COMPOSED en perfiles U00y/U00z | PRODUCTIVE_COMPOSED, reproducido y ampliado | 15 obligaciones, S1/S2 auténticos en dos bases; independencia de competidora y cierres; física/SQL/determinismo. |
| REQUIRED de tres fases × orden interno flexible | UNSUPPORTED_EXPLICIT en autoridad diaria | UNSUPPORTED_EXPLICIT; MEMORY_WITNESS | Primer 400 por `phases`; motor existente sí conserva orden parcial. |
| Fases × operación conjunta indivisible | NOT_TESTED en esta topología nativa | UNSUPPORTED_EXPLICIT; MEMORY_WITNESS | Contrato 3/2/2 operaciones, peer preservado; 422 de guard tras retirar el campo que no cabe. |
| Fases × disponibilidad/recurso compartido × dependencias externas | UNSUPPORTED_EXPLICIT | UNSUPPORTED_EXPLICIT; MEMORY_WITNESS | Productor exige técnicas sin participante y dependencias lineales cerradas. Consumidor representa auxiliares y futuro completo. |
| Fases × descanso explícito | UNSUPPORTED_EXPLICIT | UNSUPPORTED_EXPLICIT; CONSUMER_DEFECT focal | Guard conservador y certificado TS que pierde pausa; SQL sigue siendo lineal. Ningún Stage de esta intersección. |
| Fases × scope independiente × supporting/futuro | NOT_TESTED para la intersección | NOT_TESTED en producto; MEMORY_WITNESS | Scope de una tarea, witness de 15 y descanso; continuación de 14. No basta para SQL. |
| Selección de representante × cierre de unidad | PRODUCTIVE_ISOLATED para cadena nativa lineal | MEMORY_WITNESS para fases | Cierra ocho tareas y mantiene tres preparaciones supporting. |
| Selección de peer conjunto × cierre visible de cadena | NOT_TESTED | CONSUMER_DEFECT en memoria | Orden de expansiones del resolver deja sólo pareja visible. Futuro/supporting íntegros. |
| Conjunta × override de agenda/herencia/ocupación | Límites previos explícitos | UNSUPPORTED_EXPLICIT reproducido | PUT 422 `UNSUPPORTED_TASK_SCOPE_COMBINATION`; evaluación física ortogonal local válida no acredita Stage. |
| Unidad con equipo de 40 min × carga 70 min | PHYSICALLY_INFEASIBLE por autoridades materiales | PHYSICALLY_INFEASIBLE reproducido | API de propuesta NO_PROPOSAL, seis ramas, sin agotamiento ni Stage adicional; fases en memoria conservan el negativo. |
| Fases × byType/anyOf, alternativas itinerantes, setup/rondas/transporte/anclajes | NOT_TESTED / guards previos | Sin cambio: NOT_TESTED / guards previos | No se presume composición por transitividad ni se retiran exclusiones ajenas. |
| A2 completo creado desde UI | NOT_TESTED | NOT_TESTED | No se importa ni ejecuta A2 Full en este gate de Evidence. |

## Qué cambió respecto de U00y/U00z

U00y demostró las operaciones conjuntas nativas 7/7 y 11/11, pero rechazó continuidad estructural y aún no tenía productor de descanso. U00z añadió ese productor y certificó conjunta × pausa, incluso Main/Vocal y otros perfiles. Su matriz conservó explícitamente las exclusiones de cadena/continuidad y priorizó diagnosticar las fases REQUIRED y su alimentación.

El nuevo perfil crece a 15 obligaciones manteniendo conjunta, recurso, descanso y futuro; continúa siendo productivo para esas reglas. La primera intersección perdida es la **declaración de fases sobre operaciones con participante**, anterior al guard de continuidad que sugería U00y. El código vigente, no el `next-gap.json` histórico, fija ese orden causal. No hay regresión demostrada del motor: el contrato que se intenta configurar es más rico que el aceptado.

La auditoría reduce incertidumbre: el exacto existente puede construir ese bloque y permutar cada fase, mientras productor/certificado específico/SQL no lo componen todavía. También descubre la selección del peer. Ninguno de esos hallazgos se contabiliza como nueva capacidad productiva. La extensibilidad de una jornada creciente sigue bloqueada antes de aceptar su primera autoridad de fases; no procede seguir añadiendo productores aislados ni optimizar A2 para desplazar el blocker.
