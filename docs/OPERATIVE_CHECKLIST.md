# Checklist operativo Production Planner

## Verificación técnica

- [ ] `npm run check` pasa.
- [ ] `npm run test:engine` pasa.
- [ ] No se han eliminado tests existentes.
- [ ] No hay errores TypeScript.

## Dominio operativo

- [ ] El cambio no mueve tareas `in_progress`.
- [ ] El cambio no mueve tareas `done`.
- [ ] Los locks activos se respetan.
- [ ] Las hard constraints no se relajan.
- [ ] Las soft rules no invalidan planes factibles.
- [ ] Si hay inviabilidad, se explica en lenguaje humano.

## UI defensiva

- [ ] Las vistas afectadas tienen estados loading/empty/error.
- [ ] No se asumen relaciones cargadas.
- [ ] Hay optional chaining/fallbacks donde aplica.
- [ ] Los errores de permisos/RLS se muestran con mensaje claro.

## DB Safe Merge

Marcar como obligatorio si el cambio toca:

- Migraciones.
- RLS.
- Modelos relacionales.
- Motor de planificación.
- Locks.
- Reglas hard.
- Gestión de infeasibilidad.
