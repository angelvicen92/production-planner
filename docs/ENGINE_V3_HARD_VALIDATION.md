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
- `MEAL_CROSSING`: una tarea normal cruza la ventana global protegida de comida.
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
