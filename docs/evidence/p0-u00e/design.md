# U00e — autoridad de montajes

Base autorizada: 037500b139d43bf5f82c1087db4fe6ed90fc8074 (U00d). Rama remota verificada codex/p0-new-day-setup-families-u00e, inicialmente idéntica a main. El checkout e8f8927 se avanzó fast-forward hasta esa base antes de cambiar producto.

Recorrido dirigido: catálogo `setupId` → `plan_task_template_snapshots.setup_id` → `applyNewDayPlannerConfiguration` → EngineInput `setupFamilyId`/`setupPolicies` → preflight → adapter → scope SETUP_FAMILY → exactItinerantPlan SETUP_GROUP → geometrías/matching compartidos → preparaciones → validación/propuesta → Draft → Stage. La revisión efectiva y el replay ya incluyen `setupPolicies` y operaciones. El snapshot del perfil es inmutable y los snapshots de plantilla tienen actualización autorizada/versionada existente.

Hipótesis: el perfil rechaza un setupId aun cuando puede representarse con SPA-03/04 existentes. La autoridad ausente es un catálogo de familias y políticas por espacio; no falta un algoritmo. Antes de modificar producto, la receta reproduce el rechazo con una jornada UI y el `setupId` mediante API productiva (la base no tiene selector UI). El contrafactual introduce únicamente las autoridades de EngineInput ya admitidas por el adapter. Si aparece otro bloqueo estructural se documentará antes de ampliar la unidad.

Diseño previsto: ampliar de forma opt-in el perfil congelado existente, guardando familias con ID numérico estable y nombre, y políticas por espacio que referencian esos IDs. Las plantillas reutilizan `setupId` sin reinterpretarlo por nombre ni por IDs de fixture. La UI genera IDs independientes del nombre y no permite cambiarlos. La API exige una configuración completa y referencias reales; el materializador valida contra el snapshot del propio día. Las jornadas setup=NONE y las históricas preservan su forma. Sin schema ni migraciones nuevas.

Frontera: auxiliares físicas con participante, espacio exclusivo de capacidad uno, sin grupo conjunto ni agenda no física; preparación positiva múltiplo de cinco conforme al preflight actual. Orden explícito o flexible, un bloque por familia y no reentrada. No se activa una policy de continuidad temporal independiente. No se crean setups para técnicas, Main o vocales.

## Resultado de la auditoría adicional

El wiring resuelve las dos jornadas compactas pero no la semántica de espera interna. Véase logical-gap-blocker.json: el adapter/preflight impone REQUIRED y ambos generadores retornan cero candidatos sin agotar presupuesto. No se continúa ampliando la unidad; queda como borrador con aceptación fallida. No se ha corregido ni ocultado la limitación mediante una relajación o búsqueda nueva.
