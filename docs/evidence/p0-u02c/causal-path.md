# Camino causal y autoridades

| Paso | Productor/consumidor real | Resultado y frontera |
| --- | --- | --- |
| Catálogo/plantillas | Settings, API task-templates/resources/teams | Roles, dependencias, requisitos y miembros auténticos; no nombres inferidos |
| Día | `storage.createPlan`, perfil nativo | Snapshots diarios propios, Main/Vocal y presupuesto U02b |
| Tareas | `daily-tasks`, participantes y coach diario | 24 originales +3 nuevas; duración configurable |
| Autoría | `applyDayConfigurationOperation`, projectors diarios | **Primera pérdida: guard de coexistencia antes del writer/búsqueda** |
| Revisión/replay | `buildCanonicalPlanConfig`, writer v5, CAS, triggers de revisión | Acepta cada subconjunto; rechazos atómicos. No existe replay productivo de las cinco autoridades juntas |
| Builder | `buildEngineInput`, composición diaria | Orden efectivo: fases → anclajes → scopes → conjunta → pausa; reintroducir columnas ignorando API tampoco evitaría guards al reconstruir |
| Preflight/adapter | `preflightEngineInputForPlannerNext`, `adaptEngineInputToPlannerNextProblem` | Contrafactual tipado SUPPORTED en cuatro días, conservación de 27 tareas y autoridades |
| Scope/unidad | `resolveAssistedScope`, `expandVisiblePrerequisites`, `buildAssistedProblem` | Peer expande macro/conjunta; Main expande tripleta y Vocal cuando se solicitan prerrequisitos visibles |
| Geometría | Core exacto Main/feeder, `mainOperationVariants`, `materializeAnchoredOperation` | Main físico, before/after virtuales, unidad común fija; no horarios introducidos |
| Matching | Matching residual del core | Identidades reales y coaches; alternativas físicas sujetas a las mismas disponibilidades |
| Unidad | `materializeItinerantUnitAssignment` | AB común en tripleta; AC en standalone, B directo conservado; A compartido no duplica capacidad |
| Macro REQUIRED | `technicalChains`, continuación de `exactItinerantPlan` | Fases completas y conjunta indivisible con sus ocho obligaciones |
| Futuro | Witness físico nominal global y certificado de cadena | Original: 27 tareas + pausa. AB→AC original agota búsqueda; witness completo sólo en prueba condicionada |
| Validación | `validatePlan` con todos los canales | Original y variante condicionada: witness HARD válido; el resumen de sólo tareas de `inspect.validation` no sustituye la validación global con pausa |
| Draft | Propuesta/codec/servicio Assisted | No se persiste contrafactual. Draft integrado auténtico: **NOT_TESTED / bloqueado por autoría** |
| SQL Stage | Helpers físicos, revisión, writer y aceptación | Exclusiones vigentes + defecto posterior de comparación de peers en scope; cero Stages integrados |
| Continuación | Mismo builder Assisted con placements protegidos en memoria | Original: 1→26 y anclaje+Vocal 4→23; AB→AC no llega a continuación. No es continuación SQL |

La intervención no reemplaza funciones de búsqueda: llama a los projectors existentes con una vista temporal sin marcas de las otras familias, y reúne sus proyecciones en una copia en memoria. Los guards permanecen literales. `intervention` registra los campos cambiados; manifiestos vinculan producto ejecutado a la base exacta.

La existencia de solución física refuta una explicación de inviabilidad para estos perfiles. No demuestra completitud universal del algoritmo ni equivalencia SQL. No se cambia ordering, matching, poda, backtracking, presupuesto ni timeout. La primera pérdida productiva sigue en admisión; la siguiente implementación debe abarcar la integridad de sus consumidores SQL.
