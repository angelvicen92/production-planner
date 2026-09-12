# A3-ORCH-REAL-017 — aclaración SPEC-08 sobre operaciones itinerantes standalone

Esta aclaración complementa, sin reescribir, `A3-ORCH-REAL-017-phase-unit-causality.md`.

## Motivo

La Evidence A3-017 demuestra correctamente dos hechos del estado observado:

1. tras cerrar `main+feeder`, el selector standalone forma una bolsa global de macros heterogéneas y aplica constrainedness/MRV entre ellas;
2. tareas que conservan `itinerantUnitId` llegan a esa bolsa como `RESOURCE_TASK` individuales y la identidad de la composición no participa como scope de selección.

Al revisar conjuntamente SPEC-07 v2.0 y SPEC-08 v1.1 debe precisarse el alcance de esa segunda observación.

## Autoridad reconciliada

SPEC-07 exige conservar identidades explícitas de unidad como `itinerantUnitId` y prohíbe usar MRV global como sustituto del avance por fase/unidad. La unidad itinerante mantiene una agenda coordinada y su identidad debe seguir disponible para configuración, agenda, Evidence, métricas y agrupación de operaciones.

SPEC-08, sin embargo, define una operación itinerante `STANDALONE` como una operación independiente que conserva participante, duración, espacio, recursos, ventana y dependencias, y establece que se planifica como cualquier tarea operativa.

Por tanto:

- `itinerantUnitId` NO debe perderse como identidad de agenda/scope;
- compartir `itinerantUnitId` NO autoriza a fusionar varias operaciones standalone en una tarea ficticia;
- NO se deduce contigüidad, adyacencia, una única geometría compacta ni un único bloque hard para todas las operaciones de la unidad;
- los conflictos entre composiciones siguen derivándose de sus recursos miembros y de cualquier disponibilidad de composición explícitamente configurada;
- una operación standalone sigue siendo una tarea real independiente dentro de la agenda de su unidad.

## Consecuencia para A3-018

La corrección siguiente no debe agrupar las cinco operaciones de `reality-unit-combined` en una macro indivisible ni imponer `activeUnit` hasta vaciar todas sus tareas.

El delta mínimo correcto es introducir una selección de dos niveles que conserve el scope operacional:

1. construir candidatos de **scope/unidad** desde autoridades explícitas;
2. elegir el scope estructuralmente elegible y crítico con hard/Future Feasibility, sin hardcodes de benchmark;
3. dentro del scope elegido, conservar cada operación standalone itinerante como tarea independiente y aplicar el ordering exacto autorizado;
4. para setup, round y technical chain reutilizar sus geometrías estructurales existentes;
5. no inventar una geometría conjunta para itinerant standalone hasta que una autoridad contractual la exija.

La infracción demostrada que permanece inequívoca es `PHASE_SCOPE_ONLY`: el selector actual compara globalmente decisiones de scopes estructurales distintos. La observación `UNIT_IDENTITY_MISSING` se conserva en sentido de **scope/agenda de selección**, no como prueba de que las operaciones standalone deban fusionarse o ejecutarse contiguamente.

Esta aclaración prevalece para el diseño de A3-018.