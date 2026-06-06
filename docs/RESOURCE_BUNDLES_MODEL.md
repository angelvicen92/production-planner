# RESOURCE BUNDLES MODEL — ID 018

## Problema

Los pools y recursos planos describen inventario y alternativas, pero no expresan por sí solos cómo se opera un equipo audiovisual real. Un requisito `anyOf` puede seleccionar una cámara disponible y otro requisito puede seleccionar sonido, aunque producción trabaje normalmente con combinaciones estables como `Camera 1 + Sound 1`, un pack de dos cámaras con sonido asociado o un coach con afinidad por una sala vocal.

La tabla existente `resource_item_components` permite que un `resource_item` consuma otros items, pero mezcla la identidad del inventario con la identidad operativa del equipo y no ofrece nombre, estado, metadata, roles por componente ni afinidad explícita por espacio. ID 018 incorpora una entidad de catálogo independiente sin retirar ese modelo ni los pools existentes.

## Modelo añadido

La migración `066_resource_bundles.sql` añade tres tablas:

### `resource_bundles`

Representa el equipo compuesto con identidad estable:

- UUID independiente del inventario;
- nombre y descripción operativos;
- `bundle_type`, inicialmente `composite` por defecto;
- activación mediante `is_active`;
- `metadata` extensible;
- timestamps de creación y actualización.

`updated_at` se mantiene mediante un trigger específico al actualizar el bundle.

### `resource_bundle_components`

Declara los componentes del bundle:

- referencia obligatoria al bundle;
- referencia exactamente a uno de `resources` o `resource_items`;
- `component_role` para describir la función (`camera`, `sound`, `operator`, `coach`, etc.);
- cantidad positiva;
- carácter requerido u opcional;
- metadata extensible.

Las claves foráneas hacia catálogos existentes son `BIGINT`, porque ese es el tipo real de `resources.id` y `resource_items.id`. El bundle y sus filas nuevas usan UUID. El borrado del bundle elimina sus componentes; el borrado del recurso referenciado también elimina la declaración de componente correspondiente.

### `resource_bundle_space_affinities`

Registra una afinidad informativa y única entre bundle y espacio:

- referencia al bundle y a `spaces`;
- `affinity_score` entero, sin semántica hard en este lote;
- metadata para futura evidencia o configuración.

Se incluyen índices por estado activo, bundle, recurso, resource item y espacio. La combinación `(bundle_id, space_id)` es única.

## Compatibilidad

El cambio es estrictamente aditivo:

- no elimina ni renombra tablas o columnas;
- conserva `resources`, `resource_items`, `resource_item_components`, pools, snapshots y availability;
- no añade una referencia obligatoria desde tareas, templates o planes;
- no requiere que existan bundles para planificar;
- no migra ni reinterpreta automáticamente datos existentes;
- no cambia Phase A, scoring, validación, neighborhoods ni CP-SAT.

El diagnóstico V3 puede emitir sugerencias con forma compatible (`suggestedBundleName`, IDs de componentes, roles, observaciones y confianza), pero no consulta estas tablas y no usa sus resultados para decidir factibilidad.

## RLS

Las tres tablas tienen RLS activo.

- `admin`: lectura, inserción, actualización y borrado;
- `production`: solo lectura;
- `aux`: solo lectura, coherente con los catálogos operativos actuales;
- `viewer`: solo lectura, coherente con los catálogos operativos actuales;
- `anon`: sin policies.

Las policies reutilizan `public.has_role(...)` y se limitan al rol PostgreSQL `authenticated`. No se crea un sistema RBAC paralelo ni se amplían permisos de tablas existentes.

## Cómo se conectará en futuro

1. Añadir UI/admin y validaciones de servicio para crear, editar y desactivar bundles.
2. Cargar bundles explícitos en el input del motor y probar primero soft scoring auditable de continuidad/afinidad.
3. Incorporar bundles a subproblemas CP-SAT con métricas comparativas y fallback al modelo actual.
4. Convertir relaciones concretas en hard constraints solo después de validarlas con producción, disponibilidad y datos reales.

Recomendación para ID 019: definir el contrato de lectura/API y un validador de bundles (componentes duplicados, roles, cantidades y referencias), todavía sin alterar factibilidad.

## Riesgos residuales

- No se modela setup time, teardown, traslado ni coste de cambio.
- La availability continúa perteneciendo a los modelos actuales; no hay disponibilidad propia o temporal del bundle.
- `affinity_score` es deliberadamente neutral y todavía no tiene escala o efecto de scoring.
- No se valida compatibilidad técnica entre componentes más allá de integridad referencial y cantidad positiva.
- El borrado en cascada de un recurso elimina la declaración de componente; una futura capa de servicio puede preferir impedir el borrado o desactivar catálogos.
- Los candidatos estadísticos pueden reflejar coincidencia circunstancial y requieren validación humana antes de persistirse.

## ID 019 — Lectura por Motor V3 y señal soft

El catálogo persistente pasa a formar parte opcional de `EngineInput` mediante `resourceBundles`, `resourceBundleComponents` y `resourceBundleSpaceAffinities`. `buildEngineInput` solicita las tres colecciones al storage, que las lee con el cliente administrativo ya utilizado por el backend. Las tablas vacías producen arrays vacíos y cualquier despliegue transitorio sin el catálogo conserva el fallback seguro del constructor de input.

La identidad que conecta el snapshot del plan con un componente declarado es `resource_items.id`: cada `plan_resource_items.resource_item_id` se compara con `resource_bundle_components.resource_item_id`. Los componentes basados solo en `resources.id` se transportan en el contrato, pero todavía no intervienen en el scoring porque no existe una correspondencia inequívoca con el snapshot `plan_resource_items`.

Los bundles activos aportan diagnóstico y desempate soft. No cambian disponibilidad, asignación hard, pools, locks, tareas ejecutadas ni factibilidad. Una tarea no necesita bundle y un plan sin bundles conserva score neutral (`bundleCoherencePenalty=0`). No se añade migración ni policy RLS en ID 019.
