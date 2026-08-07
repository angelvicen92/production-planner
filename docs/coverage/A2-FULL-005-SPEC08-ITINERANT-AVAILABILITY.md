# A2-FULL-005 — Corrección de disponibilidad de unidades itinerantes

Estado: Evidence documental + materialización de configuración del benchmark.
Clasificación: DB Safe Merge por afectar al contrato de entrada del Full A2; no modifica algoritmo, DB, UI ni presupuesto de búsqueda.

## Hallazgo

A2-FULL-003 dejó `daily_itinerant_unit_availability` como decisión pendiente aplicando correctamente la regla genérica de SPEC-08 §6: una composición no puede asumir jornada completa si necesita ventana propia. Sin embargo, para el caso Focal A2, SPEC-08 §24 sí canoniza tres ventanas de composición y §25 exige mantener y respetar las ventanas de las tres unidades en el benchmark.

Estas ventanas son restricciones de disponibilidad de la composición, no horarios de tareas ni seed del planning humano:

- `reality-unit-a`: 11:00–14:00;
- `reality-unit-b`: 11:15–13:30;
- `reality-unit-combined`: 16:00–18:00.

## Decisión

Materializar exclusivamente esas tres ventanas en el Full A2 con procedencia `SPEC08_FOCAL_A2_SECTION_24`. No copiar el orden ni los horarios de ninguna operación Reality.

El gate de creación baja de cuatro a tres inputs genuinamente no resueltos:

1. `daily_participant_availability`;
2. `scoped_meal_policies`;
3. `out_transport_policy`.

## Seguridad

- No se infiere disponibilidad de participantes desde IN/OUT.
- No se usa una ventana común 08:00–19:00 ni jornada completa para Reality.
- No se resuelve comida ni OUT sin fuente/decisión expresa.
- No cambia el presupuesto de búsqueda ni el algoritmo.
- Mientras queden inputs fuente sin resolver, Full A2 continúa fail-closed y no ejecuta Planner Next.
