# ENGINE V3 HARD VALIDATION — ID 026

## Problema detectado

La primera validación real de un plan grande produjo un diagnóstico contradictorio: `status: success`, `solutionSource: phaseA_greedy`, 219 tareas planificadas, ninguna sin planificar y **81 hard constraint violations**. Un plan no puede considerarse utilizable cuando contradice restricciones hard, con independencia de si la causa es una infracción real del candidato o un falso positivo del diagnóstico.

## Causa encontrada e hipótesis

Hasta ID 026, `hardConstraintViolations` era una métrica posterior a la selección. Sumaba disponibilidad, locks, tareas ejecutadas movidas, solapes de concursante/espacio/recurso, cruces de comida y dependencias, pero `generatePlanV3` confiaba en `complete`/`hardFeasible` del solver y no aplicaba esa métrica como compuerta antes de devolver el resultado. Por eso era técnicamente posible exportar `success` con un contador mayor que cero.

La categoría con mayor riesgo de falso positivo en el caso real es `MEAL_CROSSING`: la métrica histórica interpreta toda la ventana global `input.meal` como un bloqueo hard para tareas normales. ID 026 conserva esa regla —no relaja constraints— y ahora la hace visible por código. El JSON real de las 81 incidencias permitirá confirmar si domina esta categoría o si existen solapes reales.

## Regla nueva

**Nunca se devuelve un resultado exitoso si `hardConstraintViolations > 0`.**

Todo camino de `generatePlanV3` pasa por `applyFinalHardValidationGate`. Si falla:

- `hardFeasible`, `complete` y `feasible` quedan en `false`;
- se conservan el candidato y sus metadatos para diagnóstico; no se borra silenciosamente;
- se añaden reason/warning `HARD_VALIDATION_FAILED`;
- el servidor entra en su flujo `infeasible` antes de persistir tiempos planificados;
- el diagnóstico queda disponible con detalles compactos, hasta 50.

La selección lexicográfica prioriza cero hard violations sobre cualquier candidato inválido. Neighborhoods y CP-SAT rechazan explícitamente candidatos que no superan la validación hard.

## Códigos de violación

- `CONTESTANT_OVERLAP`: dos tareas operativas del mismo concursante se solapan.
- `SPACE_OVERLAP`: dos tareas operativas del mismo espacio se solapan.
- `RESOURCE_OVERLAP`: un recurso exclusivo asignado aparece en tareas solapadas.
- `LOCK_MOVED`: una tarea con lock `time` o `full` cambió su intervalo.
- `DONE_MOVED`: una tarea terminada cambió respecto a su intervalo persistido/real.
- `IN_PROGRESS_MOVED`: una tarea en curso cambió respecto a su intervalo persistido/real.
- `AVAILABILITY_VIOLATION`: la tarea sale de jornada, ventana fija o disponibilidad del concursante.
- `DEPENDENCY_VIOLATION`: una tarea comienza antes de finalizar una dependencia planificada.
- `MEAL_CROSSING`: una tarea normal cruza un bloque real asignado o una tarea real de comida; desde ID 027 nunca significa solo presencia dentro de `input.meal`.
- `UNKNOWN_HARD_VIOLATION`: intervalo inválido, tarea desconocida o duplicada en el output.

## Alcance de las entidades

- Las tareas `pending`, `interrupted`, `done` e `in_progress` se consideran operativas si aparecen planificadas. `done` e `in_progress` además son inamovibles.
- Los bloques manuales se validan como ocupación normal de su concursante/espacio y por sus locks.
- Los wrappers itinerantes son contenedores temporales: se validan por ventana, pero no duplican ocupación de concursante/espacio ni convierten su relación envolvente en una dependencia secuencial.
- Las tareas `cancelled` se excluyen de ocupación para evitar falsos positivos no operativos.
- Las filas sintéticas de breaks con id negativo no se mezclan con tareas normales; su scheduler específico mantiene sus invariantes.
- Los recursos se cuentan a partir de `assignedResources` del candidato final.
- Los solapes se comprueban por todos los pares, no solo por filas adyacentes ordenadas.

## Categorías aún no detectables completamente

La validación final no reconstruye por sí sola cantidades genéricas `byType`, pools `anyOf`, afinidades de bundles ni capacidad de cámaras. Esas reglas siguen en el solver y validadores de recursos existentes. `RESOURCE_OVERLAP` cubre los ids exclusivos efectivamente asignados. La ausencia de una asignación requerida no se clasifica todavía con uno de los códigos de ID 026.

## Qué hacer si aparece

1. No usar el plan como planificación válida ni persistir manualmente sus tiempos.
2. Descargar el JSON compacto desde el panel diagnóstico.
3. Revisar `hardConstraintViolationCodes` y la muestra `hardConstraintViolationDetails`.
4. Si `detailsTruncated=true`, usar el contador total y la muestra para identificar la categoría dominante.
5. Conservar el input/datos operativos asociados para reproducir la ejecución.

## Riesgos residuales

Una incidencia puede ser una violación real o un falso positivo de modelado. La compuerta favorece seguridad: ante duda rechaza el plan. El principal riesgo residual es que una regla histórica (especialmente la semántica de la ventana global de comida) no represente la operación real. También quedan fuera del helper algunas restricciones de capacidad que no pueden inferirse solo del output final.

## Recomendación para ID 027

Analizar el JSON real con detalles, agrupar por código y corregir la categoría dominante. Si domina `MEAL_CROSSING`, confirmar primero el contrato de datos de `meal`; si dominan solapes, corregir generación/ocupación; si el origen es un falso positivo, mejorar el modelado sin rebajar la restricción. ID 026 no implementa esa corrección específica.

## ID 027 — Meal semantics

La auditoría de ID 027 confirmó una mezcla conceptual en la validación final:

- `meal_start`/`meal_end` se cargaban en `input.meal` y Phase A ya los utilizaba como **ventana flexible** para buscar slots de las tareas de comida;
- las tareas con `breakKind: space_meal | itinerant_meal` representaban los **bloques reales asignados**;
- `hardValidation.ts`, sin embargo, comparaba cada tarea normal contra todo `input.meal` como si fuera un bloqueo global. Una ventana 13:00–16:30 podía producir una violación por cada tarea legítima colocada durante esas tres horas y media.

### Contrato corregido

1. `meal` sigue siendo compatible y ahora se documenta como ventana flexible. También se aceptan los alias `mealWindow`, `mealWindowStart` y `mealWindowEnd`.
2. `actualMeal` o `actualMealStart`/`actualMealEnd` representan un bloque concreto. Puede limitarse por `contestantId`, `itinerantTeamId`, `spaceId` o `zoneId`; sin scope se considera global de forma explícita.
3. `globalHardBreaks` representa paradas globales reales.
4. `protectedBreaks` permite otros bloques hard, opcionalmente scoped.
5. Las tareas de comida reales se reconocen por `breakKind`, `mealTaskTemplateId` o `mealTaskTemplateName` y protegen únicamente el concursante, equipo o espacio al que corresponden.

`MEAL_CROSSING` mantiene compatibilidad y ahora significa exclusivamente cruce con un bloque real de comida o con una tarea real de comida. Su detalle incluye `violationType: MEAL_BLOCK_CROSSING`. Los bloqueos globales explícitos usan `GLOBAL_BREAK_CROSSING`; otros bloques protegidos usan `PROTECTED_BREAK_CROSSING`.

Una ventana flexible sin bloque asignado no crea hard violations. ID 027 no relaja ningún bloqueo real y la compuerta final de ID 026 continúa rechazando todo candidato con una de estas violaciones.

## ID 028 — Capacidad y concurrencia de espacios

`SPACE_OVERLAP` ya no significa simplemente que exista un par solapado. El validador agrupa las tareas ocupantes por `spaceId`, ordena eventos de inicio/fin y calcula la concurrencia de cada tramo. Solo registra una violación cuando `observedConcurrency > spaceCapacity`; los finales se procesan antes que los inicios en el mismo minuto, por lo que dos tareas contiguas no cuentan como simultáneas.

El contrato opcional del input es `spaceCapacityById` (con alias compatible `spaceConcurrencyById`). Un valor ausente, no numérico o menor que uno conserva el comportamiento seguro histórico: capacidad 1. El esquema DB actual no contiene un campo de capacidad, así que ID 028 no añade migración y `buildInput` solo reconoce defensivamente nombres de campo que alguna integración pudiera aportar.

Cada detalle agregado de `SPACE_OVERLAP` expone `spaceId`, `spaceName`, `spaceCapacity`, `observedConcurrency`, intervalo y listas compactas de `taskIds`, `taskNames` y `templateNames`. Se evita la explosión combinatoria: tres tareas sobre capacidad 2 producen un tramo agregado, no tres pares.
