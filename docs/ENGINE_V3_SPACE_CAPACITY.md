# ENGINE V3 SPACE CAPACITY — ID 028

## Problema detectado

Tras corregir la semántica de comida en ID 027, la prueba real `runId: 169` terminó `infeasible` con 219 tareas planificadas, 0 sin planificar y 63 hard violations. Todos o casi todos los detalles visibles eran `SPACE_OVERLAP`, concentrados en `spaceId: 49`, con numerosos tramos de cinco minutos como 09:00–09:05, 09:35–09:40, 10:10–10:15, 14:30–14:35 y 14:50–14:55.

La auditoría de `shared/schema.ts` confirma que la tabla `spaces` no dispone hoy de `capacity`, `concurrency`, `maxConcurrency` ni equivalente. Por tanto, ID 028 no crea una migración: añade un contrato opcional en el input del motor, conserva capacidad 1 por defecto y mejora el diagnóstico para decidir con datos si hace falta modelar el campo en DB.

## Regla

- Espacio exclusivo: capacidad 1.
- Espacio concurrente: permite hasta N tareas ocupantes simultáneas cuando `spaceCapacityById[spaceId] = N` (o su alias compatible `spaceConcurrencyById`).
- Solo existe `SPACE_OVERLAP` cuando la concurrencia observada es mayor que la capacidad.
- Un final y un inicio en el mismo minuto no se solapan.
- Un valor ausente o inválido nunca aumenta capacidad: el default seguro es 1.

Phase A, `validateCandidate` y la validación hard final comparten la misma resolución de capacidad. El gate final sigue impidiendo éxito con excesos reales.

## Diagnóstico

Los detalles agregados de `SPACE_OVERLAP` incluyen:

- `spaceId` y `spaceName`;
- `spaceCapacity`;
- `observedConcurrency`;
- `start` y `end` del tramo excedido;
- listas compactas `taskIds`, `taskNames` y `templateNames`.

El cálculo usa eventos de inicio/fin por espacio. Si seis tareas coinciden, se informa el tramo y la concurrencia observada en vez de generar los quince pares posibles. La exportación general continúa limitada a 50 detalles y cada lista de tareas se compacta.

## Qué hacer si vuelve a aparecer `SPACE_OVERLAP`

1. Confirmar si el espacio debe ser exclusivo o tener capacidad mayor.
2. Revisar si todas las tareas listadas deberían consumir realmente ese espacio.
3. Comparar `observedConcurrency` con `spaceCapacity` y comprobar si el motor sobrepasó el límite real.
4. Si el espacio es concurrente pero el input muestra capacidad 1, identificar la fuente de configuración ausente antes de cambiar algoritmos.
5. No desactivar el gate ni ocultar el código: un exceso sobre una capacidad correcta sigue siendo hard.

## Recomendación para ID 029

Repetir la prueba real y actuar según el resultado:

- si una capacidad explícita resuelve los falsos positivos, validar la calidad operativa del plan;
- si queda overlap real, corregir la asignación/colocación de espacios;
- si operación confirma que el espacio 49 es concurrente pero no existe una fuente de capacidad, crear una migración y un ajuste admin específico, con default 1 y validación de valores.
