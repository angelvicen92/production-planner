# SPEC10-016 — Plantilla canónica completa A2

## Día expresado

La plantilla anónima expresa 19 concursantes, 266 tareas de concursante, 3 tareas técnicas y 269 tareas totales. La expansión conserva semántica operativa de transporte, comida individual, flujo principal, pruebas vocales, segmentos anclados, operaciones conjuntas, cadena técnica, espacios, recursos conocidos, setup, sincronización de Totales y transición de coaches sin horarios seed, locks ni nombres reales.

## Unidades itinerantes A2

Se conservan tres composiciones explícitas, sin registrarlas como recursos hard: **reality-unit-a** (cam-3, son-1), **reality-unit-b** (cam-4, son-2) y **reality-unit-combined** (cam-3, cam-4, son-1). Cada operación itinerante declara sus tareas y recursos miembros; los anchors C01/C05/C08 retienen esos recursos además del coach de Estudio 7. EVA se añade sólo a operaciones que la requieren explícitamente.

## Required creation inputs

Todos los inputs de creación A2 conocidos para este benchmark están resueltos. Los blockers restantes son exclusivamente técnicos y están demostrados por los probes ejecutables.

## Implementation blockers

Estado de representabilidad: **FULLY_REPRESENTABLE**. La puerta ejecutada devuelve **EXECUTED**, con executorCallCount=1. Los probes de capacidades se ejecutan de forma aislada y no publican un plan parcial.



La regla de setup conserva families=[sillon, estrellas], oneBlockPerFamily=true, orderConstraint=UNSPECIFIED, reentry=FORBIDDEN y 10 minutos entre familias; no se impone Sillón antes que Estrellas.

## Siguiente blocker técnico razonado

No hay blocker técnico pendiente. El probe conectado demuestra roundSynchronizationCapabilityProven=true, incluyendo emparejamiento ordinal dinámico, preparación explícita, ronda residual, determinismo, contabilidad de presupuesto y publicación atómica.

## No implementado

No se implementa botón, DB, API, UI, persistencia, comidas scoped ni ejecución del motor para un subconjunto parcial.
