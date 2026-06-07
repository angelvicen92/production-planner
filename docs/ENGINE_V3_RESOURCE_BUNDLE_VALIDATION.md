# ENGINE V3 RESOURCE BUNDLE VALIDATION — ID 020

## Problema

El scoring soft basado en bundles solo es útil si el catálogo que lo alimenta es fiable. Una referencia inexistente, un componente repetido o un bundle vacío puede crear una señal aparentemente inteligente pero operativamente falsa. Engine V3 necesita advertir sobre esos datos y excluirlos del scoring sin bloquear la planificación.

## Validaciones

El módulo puro `engine/v3/resourceBundleValidation.ts` devuelve el catálogo utilizable, sus warnings y contadores de bundles utilizables, parcialmente utilizables e inválidos.

| Código | Severidad | Tratamiento |
|---|---|---|
| `BUNDLE_WITHOUT_COMPONENTS` | warning | El bundle activo queda fuera del scoring. |
| `BUNDLE_COMPONENT_WITHOUT_RESOURCE_ITEM` | info | El componente se ignora porque el scoring actual enlaza por `resourceItemId`. |
| `BUNDLE_COMPONENT_UNKNOWN_RESOURCE_ITEM` | warning | El componente se ignora al no existir en `planResourceItems`. |
| `DUPLICATE_BUNDLE_COMPONENT` | warning | Se conserva la primera combinación bundle + resourceItem + role y se ignoran duplicados posteriores. |
| `INVALID_BUNDLE_COMPONENT_QUANTITY` | warning | La cantidad no finita o menor o igual que cero se normaliza a `1`. |
| `BUNDLE_AFFINITY_UNKNOWN_SPACE` | warning | La affinity se ignora porque el espacio no pertenece al contexto conocido del plan. |
| `RESOURCE_BUNDLE_LOAD_FAILED` | warning | `buildInput` no pudo leer una tabla; se conserva el fallback neutral y se hace visible el fallo. |

Los bundles inactivos quedan fuera del catálogo validado y no generan warnings por defecto.

## Efecto sobre scoring

- Los bundles inválidos no influyen en `bundleCoherencePenalty`.
- Los bundles parcialmente válidos se usan solo con componentes y affinities validados.
- Los duplicados no multiplican demanda ni uso observado.
- Si todos los bundles son inválidos, el scoring de bundles es neutral y la razón de selección no puede afirmar una mejora de coherencia por esa señal.
- Los planes sin bundles mantienen contadores y penalizaciones a cero.
- La validación no cambia factibilidad, no añade hard constraints y no obliga a ninguna tarea a usar un bundle.

## Escenario S

S contiene dos bundles utilizables, un bundle activo sin componentes, un duplicado, un componente con `resourceItemId` ausente y una affinity a un espacio inexistente. El resultado de referencia es `complete`, cero violaciones hard, `usableResourceBundleCount=2`, `invalidResourceBundleCount=1`, `partiallyUsableResourceBundleCount=2`, `resourceBundleValidationWarnings=4` y métricas del candidato seleccionado consistentes.

## Riesgos residuales

- Aún no existe UI admin para corregir o revisar el catálogo.
- No hay enforcement hard de bundles y este lote no lo recomienda implícitamente.
- CP-SAT todavía no modela bundles como variables ni restricciones hard.
- La validación comprueba integridad para el scoring actual, no compatibilidad técnica profunda, disponibilidad temporal, setup, teardown o traslado.
- Los componentes basados exclusivamente en `resourceId` siguen sin correspondencia inequívoca con el snapshot `planResourceItems`.

## Recomendación para ID 021

Priorizar una **UI admin básica para resource bundles** que muestre estos códigos antes de guardar o activar un bundle. Es el siguiente paso más seguro: mejora la calidad del catálogo en origen sin adelantar hard enforcement ni introducir prematuramente bundles en CP-SAT. El pilot CP-SAT debería esperar a disponer de catálogo revisable y datos operativos suficientes.
