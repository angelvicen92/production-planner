# INFORME 02 — Auditoría FIELD-BY-FIELD UI/API/DB/Planner/Stage

> **Corte:** 2026-10-28. `main = 39e26f1c2e84cc8160c2066e197d61bc8b972384` (merge #1213). La rama U02c se excluye. **Tipo de comprobación de esta entrega:** inspección remota de fuentes/código y reconciliación de Evidence existente; no se ejecutó una jornada UI+Postgres/SQL propia en esta auditoría. No afirmar que se visitó Replit/Supabase real.

**Fuentes de autoridad:** [00](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [01](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [03](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.8.md), [04](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.9.md), [05](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/05_VALIDACION_CALIDAD_BENCHMARK_v2.8.md), [06](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.10.md), [07](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official) y [AGENTS.md](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/AGENTS.md). La Fuente 06 prevalece sobre errores de los PDF humanos. **Nota:** etiquetas `UI_PRESENT_UNVERIFIED` significan componente o Evidence previa localizado, NO prueba end-to-end universal.

## Documento rector: 70 requisitos, 28 columnas

[**Abrir matriz principal M02 (CSV)**](M02_matriz_configurabilidad_70_requisitos.csv). Cada fila traza necesidad → ejemplo A2 → severidad → ámbito → campo UI → componente → rol → API → persistencia/snapshot → `buildEngineInput` → preflight/adapter → solver/Future → SQL Stage → combinaciones y Evidence → primera frontera → dependencia → prioridad.

**Recuento de celdas (NO score de producto):** estado UI MISSING_CONTRACT=1; MISSING_UI=4; NOT_TESTED=5; UI_PRESENT_UNVERIFIED=60; estado composición NOT_TESTED=12; PRODUCTIVE_COMPOSED=35; PRODUCTIVE_ISOLATED=20; UNSUPPORTED_EXPLICIT=3. No convertir `PRODUCTIVE_COMPOSED` de una fila en prueba de la jornada integral: certifica sólo la intersección descrita en `combinaciones_probadas`. La observación `UI_PRESENT_UNVERIFIED` representa UI localizada o Evidence puntual y no significa test de todos los valores del editor.

## La cadena de autoridad real

```text
Settings (programa + zonas/espacios + recursos + templates)
  → defaults versionados
  → CreatePlanDialog (día nuevo)
  → snapshot de templates, asignaciones y configuración Planner Next
  → plan-details/day capability editors (Overrides y CAS)
  → API/Auth/PostgREST (source de datos; SQL de validación)
  → buildEngineInput(planId)
  → applyNewDayPlannerConfiguration + policies diarias
  → Materialization Issues / readiness
  → engineInputPreflight + adaptEngineInputToPlannerNextProblem
  → PlanningScope con supporting context protegido
  → executeAssistedPlanning / exact main + feeders / standalone exact
  → future feasibility y validatePlan
  → ScopeProposal → Draft → validate Stage → SQL accept_stage
  → snapshot completo, fingerprint, daily_tasks, histórico / replay / UI
```

**Permisos:** se comprobó en código que la configuración general de `NewDayPlannerEditor` tiene `fieldset disabled` para roles distintos de `admin`; los roles exactos de **todos** los demás formularios y RPC no se certifican aquí sin ejecutar intentos autenticados. En la matriz esa parte figura como pendiente, no como permiso universal concedido.

**Persistencia:** la arquitectura mezcla catálogo→snapshot de día→overrides efectivos con procedencia/revisión; migraciones 072–076 y 077–125 han introducido snapshots/Assisted y contratos diarios. Se localizaron pero no se ha reejecutado ledger en PostgreSQL en esta auditoría. `daily_tasks` es Stage aceptado, no Draft; una tarea añadida después del Stage conserva historia y queda pendiente según Fuente 04 v2.9.

## Qué sí se puede editar localizadamente y qué ocurre al combinar

| Área UI | Componente | Valor actual |
|---|---|---|
| Crear día y perfil | `create-plan-dialog.tsx`, `new-day-planner-editor.tsx` | Main+Vocal o STANDALONE_ONLY, tiempo/presupuesto/transport/setup; CAS al guardar; Stage U00a/U02b |
| Plantillas, roles, duración | `settings.tsx::TaskTemplatesSettings`, `TemplatePlannerRole` | Rol y tareas ordinarias UI; `resourceRequirements` se lee/preserva pero no hay **editor universal demostrado** |
| Equipo itinerante | `daily-itinerant-compositions.tsx` | Identidades/miembros/ventanas; condiciones specific + 0 en macro U02b |
| Agenda, herencia y ocupación | `task-operation-scopes-editor.tsx` | Tres ejes tipados; U00v/x SQL; falta cruce U02c con macro |
| Joint groups | `joint-groups-editor.tsx` | U02b Chromium guarda y recarga, Stage 24/24 de conjunto |
| Macro por fases REQUIRED | `technical-chain-editor.tsx` | Editor existente y U02b Stage con specific fixed; exclusiones para otras variantes |
| Anchor v2 | `anchored-accompaniment-editor.tsx` | U00w/x Stage; con macro pendiente U02c |
| Rondas + micro | `round-synchronization-editor.tsx` y `round-preparation-editor.tsx` | U00p/r SQL en sus contratos; no macro todo A2 |
| Setup + continuidad | `setup-families-editor.tsx`, `operation-continuity-editor.tsx` | U00e/00m SQL en sus escenarios; no universal con joint/fases |
| Pausa | `operational-meals-editor.tsx` | U02b integrada con macro; coach puede declararse como recurso, pero 45m×2 mixto NO demostrado |
| Transporte | `transport-settings-card.tsx`, `transport-policy-fields.tsx` | U00f SQL; intersección con macro NO acreditada |
| Planificación y Autopilot | `assisted-planning-workspace.tsx`, `shared/assistedAutopilot.ts` | Existe flujo y botón; no E2E-3 sobre A2 nativo |

## Carencias de autoría demostrables por código/Evidence

**P0-R63 — editor `byItem` de plantilla (MISSING_UI).** En `settings.tsx` se accede a `resourceRequirements` y se preserva en la edición; U02b `ui-api.md` declara que se creó por API. Es un contrato API/EngineInput que *sí* puede llegar a Stage bajo condiciones actuales. No crear nuevo schema ni sobrecargar un editor de coaches. Reparación: productor UI tipado y validación, guardar/recargar por mismo endpoint, snapshot y compare con EngineInput; luego comprobar los Stage U02b sin variación física.

**P0-R64 — `byType`/`anyOf` (MISSING_UI y consumidor limitado).** U00i/j/l certifica selección nominal quantity=1 ordinaria y Main acotada. Fases, joint y Vocal con elección genérica mantienen exclusiones. Incluso si se crea la UI, no prometer universalidad al cruzar macro; un control puede mostrar combinaciones **solo si el consumidor las admite**. Módulo UI podría ser reutilizable, con estados `UNSUPPORTED` exactos.

**P0-R17 — `coachRouteTransitions` (MISSING_UI/PRODUCTOR NATIVE NO CONFIRMADO).** `server/planPlannerNextConfiguration.ts` declara contrato histórico, `engine/planner-next/coachRouteTransitions.ts` lo consume. U02b constata sin productor nativo. No inventar ruta general ni tomar `resourceTransitionMinutes` como equivalente: A2 tiene transición 30 min **unidireccional**. Debe conservar valor/identidad origen/destino y hacer Stage real.

**P0-R50 — `requiresBand`: semántica sin productor tipado confirmado.** A2 distingue demanda operativa de anotación (`usesInstrument`). Esta auditoría **no ha probado** si un recurso `byItem`/rol ya basta para representarlo sin pérdida. Antes de crear campo nuevo, ejecutar una prueba de equivalencia causal. Sólo si falla y existe exigencia semántica real se añade nuevo contrato.

**P0-R06 — shared/capacity>1: UNSUPPORTED_EXPLICIT, fuera del mínimo A2 demostrado.** No desviar prioridad P0 por soporte genérico sin caso de uso A2. La vida real puede exigirlo en P1 si aparece topología de capacidad mayor.

## Ejemplos de conservación sin pérdida que debe exigir cada PR

1. `resourceInheritance=OPERATION_ONLY` **no** elimina `declaredResourceIds`, locks, membresía elegida ni ocupación física de Corner; CAM1 ordinary se mantiene en tareas que heredan ubicación.
2. `blocksSpace=false` sólo elimina la exclusividad física de sus **segmentos virtuales**; no borra carga de participante/equipo ni el Main físico de 15 min.
3. Margen instancia `0` explícito nunca se convierte en `undefined`, `null` o el default global de 5; los dos overrides se resuelven con `max`, no sumando.
4. `REQUIRED` por fases sólo fija orden de **fases** y adyacencia, no la permutación de cada fase. La Fase C sin EVA mantiene exclusividad de Alfombra.
5. Joint peers C06/C10 se preservan por ID aunque una operación física se proyecte visualmente una sola vez; el SQL debe validar ambos.
6. Scope P14 multi-espacio no fuerza serialización de Giratuto ni inyecta CAM1 en Redes.
7. Un cambio de settings general no muta snapshots ni Stages anteriores; CAS, provenance y refresh explícito conservan autoridad de cada valor.
8. `READY` de configuración no certifica la búsqueda exacta global. `NO_PROPOSAL`, `UNSUPPORTED` y `SEARCH_TIME_LIMIT_REACHED` necesitan mensajes y estados distintos.

## Limitación técnica de la auditoría actual

Las 70 filas **no son recibos de 70 operaciones de UI ejecutadas**. Hay celdas donde los nombres de tabla, endpoint o componente son inventario localizable por fichero/Evidence, pero no un `SELECT`/HTTP/Chromium fresh verificado; se etiquetan en `confidence` y `tipo_de_evidencia`. El inventario es reproducible desde los enlaces de `main`; el **gate faltante** en cada fila identifica exactamente la prueba que convertirá esos límites en certificación. El siguiente paso no es declarar producto DONE por este spreadsheet, sino cerrar esas celdas con evidencia proporcional.