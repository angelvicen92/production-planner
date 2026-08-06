# SPEC10-019 — Transición direccional de coach

## Regla operativa

Un coach que termina una prueba en Caracola necesita 30 minutos antes de comenzar en Estudio 7.

## Contrato

EngineInput y Planner Next transportan una regla explícita formada por coach, espacio de origen, espacio de destino y minutos. La regla es direccional. Los movimientos sin una regla exacta conservan `resourceTransitionMinutes`.

## Evidence

El probe ejecuta EngineInput preflight, adaptador, Planner Next preflight, planificación real y validación hard. Demuestra:

- planificación completa y hard-valid;
- 30 minutos exactos Caracola → Estudio 7;
- rechazo con 29 minutos;
- aceptación con 30 minutos;
- sentido inverso y coaches ajenos conservan el margen general;
- determinismo, invariancia al orden e input inmutable;
- rechazo temprano de contratos inválidos, sin problema parcial.

## Estado A2

Desaparece `ADAPTER_COACH_ROUTE_TRANSITION_SCOPE_LOSS`. El siguiente blocker técnico pasa a ser `PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED`.
