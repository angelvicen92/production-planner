# D. Equipos itinerantes y composición física

## Autoridades y representaciones

Fuente 03, Parte III §§5–7: una unidad agrupa recursos físicos con agenda coordinada; el ID de la agrupación no se añade como recurso hard ficticio junto con sus miembros. Los miembros pueden participar en composiciones distintas; la exclusividad corresponde a su identidad física. La disponibilidad de la composición sólo restringe adicionalmente si es explícita. No se deduce una ventana de una planificación humana.

| Representación | Identidad / contenido | Dónde se edita hoy | Consumidor / límite |
|---|---|---|---|
| Catálogo global `itinerant_teams` | IDs 1,2,3; code/name/is_active/order_index | `settings.tsx:ItinerantTeamsSettings`: alta de código/nombre y eliminar. No editor de miembros/ventanas/activo/orden integral | Pickers de plantillas, responsables y lectura; no mapping automático demostrado a unidad diaria Next |
| Responsables | `staff_assignment_defaults` / `plan_staff_assignments`, scope itinerant_team, staff_role/person | StaffDefaultsSettings y PlanStaffRolesTab | Autoridad/visibilidad operacional. Una persona asignada de producción/editorial no declara cámaras/sonidos físicos consumidos |
| Componentes de recurso | `resource_item_components(parent,component,quantity)` | ResourceItemComponentsDialog | Composición de un item; no incluye relación global equipo→miembros. No sustituye disponibilidad/comida de unidad |
| Bundle | `resource_bundles`, components, space_affinities y snapshot diario | Modelo y APIs existentes; 0 bundles conectados | Arquitectura de recursos distinta; no certifica materialización de unidades por tener miembros |
| Unidad diaria Next | `plans.planner_next_configuration.itinerantTeamAvailability[]` | Sin editor productivo localizado; entra por configuración explícita de jornada/import | ID de unidad diario, ventanas, miembros **plan_resource_items.id**, transición; adapter a `ItinerantUnit` |
| Requisito de tarea | Global/snapshot `itinerant_team_requirement/id/allowed_ids`; final en `taskOperations` | Plantilla global permite requisito + multiselección global; no editor diario completo | Para jornadas explícitas mandan taskOperations y catálogo local de unidades, no el selector global de otra identidad |

La coincidencia de nombre, código, ordinal o número no prueba una relación. En particular, no existe obligación de que 105001 corresponda a global 1 y **no debe inventarse ese mapping**. Una unidad puede existir como composición local del día sin una FK al catálogo global; la reconciliación reutilizable es un gap de producto.

## Observación read-only real

Consulta GET de columnas explícitas del 15/10/2026; IDs y relaciones en `generated/catalog.json`. Dos jornadas A2 y sus autoridades permanecen intactas:

| Día | Unidades | Recursos diarios | Identidad física global |
|---|---|---|---|
| 27001 | 5001 | 4003 + 4008 | resource_items 7003 cam-3 + 7008 son-1 |
| 27001 | 5002 | 4004 + 4009 | 7004 cam-4 + 7009 son-2 |
| 27001 | 5003 | 4003 + 4004 + 4008 | 7003 + 7004 + 7008 |
| 27002 | 105001 | 104003 + 104008 | 7 CAM3 + 10 SON1 |
| 27002 | 105002 | 104004 + 104009 | 8 CAM4 + 11 SON2 |
| 27002 | 105003 | 104003 + 104004 + 104008 | 7 + 8 + 10 |

En ambos días la ventana de las tres unidades es explícitamente **09:00–21:00**. Transición: 15 min para A/B y 0 para C. No inferir disponibilidad real de un integrante concreto a partir de esa ventana de unidad: se intersectan ambas autoridades. Cada contrato tiene 266 `taskOperations`; cuatro operaciones tienen alternativas A/B declaradas, y otras operaciones pueden tener ID concreto sin `allowedItinerantTeamIds`.

Global 1=Reality 1, 2=Reality 2, 3=Reality con Eva. No hay filas de resource_item_components ni bundles en la observación. Eso prueba ausencia de composición en esas tablas hoy, **no** ausencia de composición en Next: sí está en los JSON diarios.

A y B pueden coincidir si las demás restricciones lo permiten; C comparte miembros con ambas y no puede solaparse consumiéndolos. Comprobar exclusividad con resource IDs diarios, conservando el vínculo a resource_items físicos. No crear una copia de CAM3 para cada unidad.

## Recorrido de materialización y exclusividad

1. `applyPlanPlannerNextConfiguration` valida esquema, IDs de tasks/espacios/recursos y pertenencia de IDs de unidad de `taskOperations` a `itinerantTeamAvailability`. No consulta `itinerant_teams` como autoridad superior.
2. `engineInputPreflight` comprueba representabilidad, ventanas, requisitos/alternativas y recursos efectivos. El perfil diario debe estar completo; no se inventa una composición faltante.
3. `engineInputAdapter.ts` convierte `itinerantTeamId` a `itinerant-team:<id>` y cada `planResourceItemId` a `plan-resource:<id>`, conservando identidad reversible. Proyecta ventanas y transición, y recursos físicos necesarios.
4. `materializeItinerantUnitAssignment` sólo admite unidades del dominio permitido, elimina miembros de alternativas no elegidas cuando procede y une los miembros de la unidad elegida a `requiredResourceIds` de la tarea. No admite reemplazo por nombre.
5. `placement.ts` exige disponibilidad de unidad y recursos, evita solapes de los `requiredResourceIds` compartidos y aplica transición de recurso/unidad. El validador final vuelve a comprobar disponibilidad, identidad, exclusividad, cadena/continuidad y comidas.
6. Comidas de unidad existentes: `assignedItinerantUnitMealBreaks.ts` y `itinerantUnitMeals.ts`. Las comidas de miembros y otras policies también restringen la operación; no son sinónimos de pausa global.
7. Assisted conserva asignación seleccionada/provenance en propuesta/Draft/Stage. La persistencia de selección itinerante tiene migración/tests propios; aceptar Stage no autoriza a reescribir la configuración original.

Pruebas: `itinerantUnits.spec.ts` (agenda/transiciones/determinismo), `exactItinerantPlan.spec.ts` (elección y composiciones), `itinerantUnitMeals.spec.ts`, `integration/engineInputAdapter.spec.ts`, `server/assistedItinerantPersistenceMigration.spec.ts`, benchmarks descriptivos `focalA2ItinerantCompositionControls.spec.ts`. Los fixtures que modelan una unidad como recurso en tests antiguos no autorizan a duplicar una unidad ficticia en el camino productivo con miembros explícitos.

## Auditoría de propiedades

| Propiedad | Estado verificado | Clase / gap y decisión |
|---|---|---|
| Identidad global vs diaria | Catálogos y namespaces distintos; no mapping obligatorio presente | PARCIAL; reconciliación explícita requerida para reutilizar defaults |
| Miembros de una unidad | Lista fija para esa revisión diaria; A/B/C comparten miembros | Motor con efecto; FALTANTE editor global/día. No llamar «composición variable» a sustitución libre durante un run |
| Recomposición | Varias composiciones pueden reutilizar físicos; agenda controla exclusividad | PARCIAL producto. Si recomponer exige preparación, usar tarea/policy explícita; no sumar minutos ocultos |
| Disponibilidad de unidad | Ventanas diarias explícitas, array no vacío | PARCIAL UI. Si general omite ventana, materializar jornada como ausencia de restricción adicional, conservando provenance |
| Disponibilidad de integrante | Ventana global→snapshot de `plan_resource_items`, booleano disponible | Motor existente; FALTANTE editor temporal completo y resumen de intersección |
| Sustitución | No sustitución silenciosa de recurso concreto; alternativas de unidad son dominio explícito | Mantener. FALTANTE edición de alternativas autorizadas con representación lossless |
| Unidades equivalentes | Equivalencia operativa no se deduce por nombre o composición similar | FALTANTE catálogo de alternativas reutilizables si producto lo necesita; no crear framework de equivalencias genérico |
| Requisito none/any/specific | Snapshot y taskOperations final; subconjuntos soportados en adapter | PARCIAL UI: global no tiene IDs de las unidades locales A2; aviso antiguo confunde |
| Equipo específico obligatorio | `itinerantTeamId`, dominio singleton | Motor soportado; falta editor diario de esa autoridad con revisión |
| Desplazamientos | Transición de unidad + miembros/coach donde aplica | Motor soportado; sin editor integral/matriz que gobierne unidad/operación |
| Comidas/pausas | Obligaciones existentes y materialización | PARCIAL de superficie heredable y edición por unidad/miembro |
| Personal | Asignaciones de producción/editorial por scope | Operativo separado; no equiparar automáticamente staff a recurso del motor |
| Herencia/override | Snapshots de recursos/staff sí; JSON Next protegido no tiene editor general lossless | PARCIAL. Nueva revisión explícita de configuración, sin modificar snapshots anteriores |
| Preflight/materialización/validación | Existentes; no bastan para certificar UX completa | Conservar y ampliar pruebas sobre edición/reload, no duplicar motor |

## Propuesta concreta de interfaz y configuración — sin implementar

**Catálogo general → Recursos → Unidades itinerantes.** Lista activa con nombre/código, miembros físicos, número de composiciones que los comparten y advertencias de referencia. Editor de unidad: identidad global, miembros seleccionados entre recursos existentes, disponibilidad explícita opcional, transición, comidas/policies aplicables y responsables en sección separada. Mostrar «CAM3 también pertenece a composición C; no podrá trabajar a la vez». No crear un resource_item por unidad. Un recurso físico aparece una sola vez en el catálogo.

**Configuración del día → Recursos y unidades.** Materializar baseline de la composición aplicable con un mapping explícito global-item→plan-resource-item y global-unit→daily-unit cuando exista; unidades puramente locales se muestran «Propia de esta jornada». Filas con valor efectivo, baseline, origen y revisión; diferencia de miembros, ventanas y pausa. Edición autorizada crea nueva revisión y diff; Restore recupera baseline local; Refresh propone comparación y conserva overrides. El JSON histórico protegido permanece inmutable; la unidad de implementación debe elegir una autoridad efectiva versionada que siga el patrón de configuración diaria existente, sin abrir escritura directa al JSON.

**Editor de tarea/operación.** Tres estados: «No requiere unidad», «Una de estas unidades permitidas», «Esta unidad obligatoria». Multiselección sólo de unidades del día. Mostrar miembros físicos de cada opción y efecto de concentración/continuidad; bloquear referencias globales no reconciliadas. La selección de «Requiere unidad» sin ninguna opción debe ser error, no degradarse a none. Para anchored/chain, editar la unidad operativa consistente, no romper continuidad de un segmento.

**Revisión antes de guardar.** Miembros añadidos/retirados, conflictos de exclusividad potenciales y ventanas efectivas; impacto sobre tareas protegidas y propuestas antiguas. No mover ningún placement por guardar. Requerir revalidación; avisar de stale proposals. Perfil operativo consulta; producción/admin modifica dentro de autorización. No activar vía UI capacidades experimentales de benchmarks.

Prueba de aceptación mínima: crear baseline genérico A/B/C con físicos compartidos; cambiar un miembro/ventana sólo para un día; guardar/recargar/restore/refresh; demostrar que A+B simultáneo es legal y A+C/B+C simultáneo es rechazado por el mismo físico, incluso en espacios diferentes; probar 0 transición, comidas, ID inexistente, alternativa prohibida y Stage protegido. Después demostrar adaptador/validator/replay con revisión/fingerprint, sin cambiar el canon A2.
