# A2-FULL-003 — Auditoría de configuración fuente del Full A2

Estado: Evidence documental de rumbo, read-only.  
Clasificación: administrativa/documental; no modifica motor, DB, UI ni reglas hard.

## Objetivo

Separar los nueve `requiredCreationInputs` que actualmente bloquean Full A2 en cuatro categorías: valor ya definido por fuente, valor heredable por contrato oficial, valor derivable sin decisión humana y decisión de producción todavía no definida.

La auditoría no utiliza los horarios del planning humano como seed, hint, lock ni disponibilidad. El planning humano sigue siendo únicamente referencia de calidad.

## Resultado

| Input actual | Resolución | Autoridad | Acción |
|---|---|---|---|
| `execution_date` | `2025-06-15` | Cabecera oficial A2 | Resolver automáticamente en el fixture de creación. |
| `effective_day_window` | `09:00–21:00` mientras no exista override A2 | Default oficial del Day Setup del PRD | Materializar como configuración del benchmark, no como dato inferido de los PDF. |
| `daily_space_availability` | Hereda disponibilidad de plató/unidad y, en ausencia de ventana propia, la jornada | Addenda de snapshot/herencia | No exigir una ventana explícita por cada espacio. Una ventana específica futura sigue prevaleciendo. |
| `daily_resource_availability` | Jornada completa cuando el snapshot del recurso no declara ventana explícita y `isAvailable=true` | Addenda de disponibilidad temporal de recursos | No exigir una ventana explícita por cada recurso. No sustituir recursos ni ignorar `isAvailable=false`. |
| `future_productive_ids` | Derivable de las identidades canónicas de la plantilla | SPEC-10 + manifest A2 | Generar determinísticamente; no pedirlo al usuario. |
| `daily_participant_availability` | **PENDIENTE** | El dominio exige disponibilidad del concursante y no define aquí un default A2 autoritativo | Mantener fail-closed. No convertir IN/OUT humanos en disponibilidad hard. |
| `daily_itinerant_unit_availability` | **PENDIENTE** | SPEC-08 exige disponibilidad de la composición y prohíbe sustituir una ventana necesaria por disponibilidad total | Mantener fail-closed. No copiar las horas humanas de Reality. |
| `general_meal_window` | **NOMBRE/SEMÁNTICA INCORRECTA** | Dominio v4, Addenda y SPEC-10: no existe comida global implícita | Sustituir por configuración de comidas por ámbito. Sodexo individual ya es obligación canónica; cualquier comida de espacio/recurso/unidad debe llegar scoped y explícita. |
| `out_transport_policy` | **PENDIENTE** | Documento Maestro A2 no fija default OUT | Mantener fail-closed hasta configuración expresa. |

## Pendientes reales después de aplicar la semántica oficial

El gate de creación no debería seguir mostrando nueve decisiones humanas. Debería reducirse a:

1. `daily_participant_availability`;
2. `daily_itinerant_unit_availability`;
3. `scoped_meal_policies` para los ámbitos que deban tener comida adicional a las tareas individuales Sodexo;
4. `out_transport_policy`.

## Reglas de seguridad

- No se convierten las horas de IN/OUT de la referencia humana en ventanas de concursante.
- No se convierten horarios de operaciones Reality de los PDF en disponibilidad de las unidades itinerantes.
- No se crea una comida global para imitar visualmente el planning humano.
- Las ventanas heredadas sólo significan jornada/ámbito superior conforme a las Addenda; nunca `24h`.
- Los IDs productivos se derivan de identidades canónicas, no de nombres ni de IDs históricos conocidos.
- Cualquier override futuro del día prevalece sobre los defaults/herencia aquí auditados.

## Consecuencia para el roadmap

La siguiente implementación deberá corregir el contrato de creación/representabilidad para que el benchmark distinga estos valores resueltos o heredados de las cuatro decisiones realmente pendientes. No se añadirá una nueva capacidad del planificador mientras Full A2 siga bloqueado por datos de entrada.

Después de resolver esos cuatro datos, Full A2 deberá construir un `EngineInput` sin horarios humanos, ejecutar `EXACT_CONSTRUCTIVE`, superar gates hard y entrar por primera vez en comparación P01–P10 contra la referencia humana.
