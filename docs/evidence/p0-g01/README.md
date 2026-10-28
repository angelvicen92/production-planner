# P0-G01 — autoría de recursos físicos específicos en plantillas

Base autorizada `48bb56c145a33b1bd85584f63afeb3e7c87c44c5`; una sola unidad lógica, rama `codex/p0-g01-ui-template-byitem-resource-authoring`. Sin cambios de motor, SQL, contratos públicos, migraciones ni servicios productivos. Sin merge ni deploy.

## Causa y cambio

Antes, `TaskTemplatesSettings` conservaba `resourceRequirements` pero sólo lo enviaba cuando cambiaba el coach. No existía productor general de `byItem`. El primer corte estaba en el formulario y en su condición de construcción del PATCH, antes de snapshots o búsqueda. `engine/concreteTaskResourceRequirements.ts` ya resuelve cantidad 1 contra una identidad diaria única; los consumers de U00h/U02d ya validan y persisten ese consumo.

El selector reutilizable se añade a Crear/Editar plantilla, con tipo, nombre e IDs inequívocos, selección múltiple por incorporaciones y retirada, y cantidad fija 1. Reutiliza el catálogo y endpoints actuales. Excluye el coach gestionado por su control existente y no ofrece auxiliares nominales, cuya capacidad no tiene contrato equivalente en el consumidor. Indica ventanas generales y que la disponibilidad diaria se comprueba al planificar. Un recurso fuera del catálogo no se ofrece; un requisito existente desconocido se muestra como no disponible y se conserva hasta una retirada explícita.

La edición copia sólo el mapa de items, preservando literalmente las demás propiedades, incluidos `byType` y `anyOf`. Los formatos legacy no editables se conservan y muestran diagnóstico. La edición del coach modifica exclusivamente sus entradas y conserva los demás recursos. Cambiar recursos sin tocar coach envía `resourceRequirements` independientemente. Los guardados de recursos/coach usan `save-with-inverse` con listas inversas vacías cuando proceda y revisión esperada, reutilizando la RPC atómica existente; el 409 conserva el editor y exige Recargar.

La precedencia sigue las Fuentes 01 (identidad física/configuración), 04 (snapshots/consumo efectivo), 05 (gates proporcionales), 06 (canon y autoridades independientes) y 07 §4.4. Ningún nombre de recurso o jornada determina reglas productivas. Las hipótesis X/Y/Z/W/M del encargo se prueban sobre el recorrido existente, sin añadir otra capa de planificación.

## Prueba y límites

- [Validación y reproducción](validation.md).
- [Comparación UI/API y matriz de composición](composition-matrix.md).
- El harness G01 incorpora un productor opcional a la jornada U02d sin cambiar fixtures, geometrías ni assertions: los metadatos de plantilla siguen por API y sus declaraciones físicas no vacías se guardan realmente con Chromium; después se crea cada jornada por UI y se ejecuta el recorrido U02d íntegro.
- Un control independiente usa las mismas declaraciones por la API original, en otra base fría. El comparador exige igualdad literal de snapshots SQL de plantilla, EngineInput, propuestas, contadores, certificados, Draft y filas Stage SQL. Las IDs originales se conservan, sin remapeo ni normalización de resultados para comparar.
- La prueba CRUD adicional crea por UI una plantilla con dos recursos de nombre idéntico, recarga, añade/retira sin tocar coach, cambia coach específico y conserva otras dimensiones; prueba concurrencia stale, permisos y catálogo.

El delta de interfaz es **una subclase: `byItem` nominal de cantidad 1**. No abre editores `byType`/`anyOf`, ni capacidades mayores, bundles, auxiliares nominales, rutas coach, rondas o transporte. No cierra P0 ni promete autoría completa de A2. El roadmap fechado se conserva; el índice vivo enlaza este delta.

No se repite A2 histórico localmente: no cambia ninguna dependencia material de construcción, búsqueda, matching, presupuestos, validación, snapshots o SQL. Los controles afectados son el recorrido U02d y la regresión U00x, además de los tests de contrato/recursos. La CI viva del head del PR se informa por separado de los recibos locales.

Los workflows preexistentes conservan sus propios gates automáticos al abrir el PR; no se modifican para omitir controles. El workflow nuevo de G01 no añade otra ejecución A2.

Gate local final: 50 tests focales, TypeScript, build, Chromium y comparación SQL PASS; 26 plantillas UI, 148 snapshots operativos idénticos y 16 Stages SQL nuevos en las dos vías. U00x/U02b conservan sus controles aislados. [Resumen de comparación](ui-api-comparison.json), [fuentes ejecutadas](source-binding.json) y [captura del selector tras recargar](ui/g01-created-reloaded.png).
