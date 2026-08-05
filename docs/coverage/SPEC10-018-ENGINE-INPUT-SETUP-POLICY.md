# SPEC10-018 — EngineInput setup policy

## Contrato

`TaskInput.setupFamilyId` identifica la familia semántica de una tarea auxiliar. `EngineInput.setupPolicies` declara, por espacio, las familias, la prohibición de reentrada, el bloque único por familia, el orden y los minutos de preparación.

Las identidades se canonicalizan como `setup-family:<spaceId>:<familyId>`.

## Orden explícito y orden flexible

Una política `EXPLICIT` se proyecta sin pérdida a `Space.setupPolicy.familyOrder`.

Una política `UNSPECIFIED` continúa bloqueada con `UNSUPPORTED_FLEXIBLE_SETUP_ORDER`. SPEC10-018 no inventa un orden para Sillón y Estrellas ni convierte el planning humano en una restricción hard.

## Preparación

Los minutos entre familias se modelan como ocupación real del espacio. La primera familia no recibe una preparación artificial; la familia posterior recibe los 10 minutos exigidos entre bloques.

## Evidence

El probe ejecuta el recorrido completo:

EngineInput → preflight → adaptador → Planner Next preflight → `planMainFlowAndFeeders` → validación hard.

Demuestra para ambos órdenes explícitos:

- plan completo y hard-valid;
- un bloque por familia;
- una única transición;
- una preparación de 10 minutos;
- ausencia de reentrada;
- determinismo;
- invariancia de arrays-set;
- input inmutable.

## Estado A2

`ENGINE_INPUT_SETUP_POLICY_NOT_PROJECTED` queda resuelto únicamente cuando el probe conectado pasa.

A2 continúa bloqueado por `PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED`, ya que la fuente permite ambos órdenes. El siguiente blocker es `ADAPTER_COACH_ROUTE_TRANSITION_SCOPE_LOSS`.
