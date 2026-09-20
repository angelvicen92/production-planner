# Auditoría de configurabilidad de producto — Fuente 04 v2.4

**Base reauditada:** PR #964. La autoridad canónica machine-readable es
`shared/configurability.ts`; el test `shared/configurability.test.ts` comprueba los
gates semánticos y de seguridad y evita convertir conteos históricos en objetivo.

## Resultado derivado del registry

| Estado | Cantidad |
|---|---:|
| PRODUCTIVE | 3 |
| PARTIAL | 13 |
| MISSING | 5 |
| BLOCKED | 5 |
| NOT_APPLICABLE | 1 |

Total: **27 capabilities**. Las capacidades compuestas se dividieron cuando mezclaban
madurez: jornada/grid, comida global/políticas por ámbito, estructura espacial/capacidad,
catálogo/asignaciones de recursos y las tres semánticas de transporte.

## PRODUCTIVE (justificación exhaustiva)

- `WORKDAY_WINDOW`: persistencia diaria, edición, proyección `workDay`, preflight,
  consumidor, validación y Evidence de revisión están cableados.
- `GLOBAL_MEAL_BREAK`: default general, materialización diaria, proyección
  `meal/mealMode`, validación y consumidores productivos están cableados.
- `OPTIMIZATION`: settings generales, snapshot diario versionado, override explícito,
  normalización, consumidores, validador y fingerprint están cableados.

## Gaps y seguridad

`daily_tasks`, `spaces`, `resource_items` y `plan_resource_items` mantienen RLS
desactivada; este PR no cambia RLS y clasifica las capacidades afectadas como BLOCKED.
`PROTECTED_STATE_LOCKS` es NOT_APPLICABLE porque es un invariante hard, no un knob.
Las capacidades futuras ausentes describen cobertura de producto y no degradan por sí
solas el readiness de una jornada que no las requiera.
