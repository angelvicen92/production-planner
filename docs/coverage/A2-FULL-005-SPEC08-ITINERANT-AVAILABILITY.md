# A2-FULL-005 — Disponibilidad de unidades Reality (corregida por SPEC-08 v1.1)

Estado: superseded por la autoridad oficial SPEC-08 v1.1.

## Corrección de autoridad

En A2 existen tres composiciones: **reality-unit-a** (CAM3 + SON1),
**reality-unit-b** (CAM4 + SON2) y **reality-unit-combined** (CAM3 + CAM4 +
SON1). Las tres heredan la jornada efectiva completa, 09:00–21:00.

Las horas observadas en el planning humano no son disponibilidad, ventanas hard,
seed, lock, ordering hint ni restricciones de composición. Por tanto, no se
proyectan al `EngineInput`.

## Exclusividad

La unidad A y la B pueden solaparse. A y combined se excluyen por CAM3/SON1; B y
combined se excluyen por CAM4. El modelo conserva esa exclusividad mediante los
recursos miembros, sin registrar los IDs de unidad como recursos hard ni añadir
capacidad duplicada.

## Materialización

El contrato canónico usa `inherits_day_unless_overridden`. Como el `EngineInput`
requiere ventanas de equipos itinerantes, la ejecución materializa para las tres
unidades una única ventana derivada de `effectiveDayWindow`, no de horarios del
planning humano.
