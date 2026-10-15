# F. Catálogos, duplicados y dependencias

## Evidencia observada

`script/audit/read_configuration_catalog_p1.py` sólo emite GET PostgREST con `select` de columnas enumeradas. Pagina en lotes de 500; no llama RPC, Auth, UI ni rutas de aplicación que pudieran sincronizar datos. No imprime credenciales. El resultado intermedio permitido queda en `work/`; el resumen publicado elimina payloads de configuración y conserva entidades, IDs de relación, rutas JSON y contadores. No se extraen contactos, notas, identidades de usuario ni tiempos de ejecución.

`script/audit/summarizeConfigurationCatalogP1.py` produce `generated/catalog.json` y `catalog.md`: **204 entidades de catálogo** (incluidos 15 tipos), **7640 aristas tipadas**, **32 grupos nominales** (31 de plantillas y uno de recursos), seis unidades locales de dos días, jornadas y referencias sin resolver. Cada entidad incluye ID/nombre, procedencia evidenciada o pendiente, activo/inactivo o ausencia de columna, días, IDs de tareas enlazadas, snapshots, dependencias entrantes/salientes, dependientes transitivos, paths JSON, riesgo de autoridad y `deleteAuthorized=false`.

Los cierres transitivos se detienen al alcanzar el contenedor plan para no atribuir todas las tareas hermanas de una jornada a una plantilla. `linkedDailyTaskIds` de plantilla se obtiene por template_id; `transitiveDailyTaskIds` incluye dependencias. `templateSnapshotIds` puede incluir referencias por dependencia además de source_template_id; los paths directos distinguen ambos casos. Una relación transitiva no significa que todas sus propiedades deban moverse juntas.

| Entidad | Recuento actual | Interpretación |
|---|---:|---|
| Plantillas | 85 | 23 originales + 31 A2 20xxx + 31 A2 120xxx |
| Zonas / espacios | 30 / 49 | Incluyen topología histórica, sintética A2 y real reconciliada; no borrar aliases por apariencia |
| Tipos / recursos concretos | 15 / 22 | Identidades globales; no equivalen a las 71 filas de recursos diarios |
| Equipos globales | 3 | IDs 1–3; las seis unidades Next locales son otra representación |
| Bundles / componentes de item | 0 / 0 | No hay filas actuales; no implica ausencia de composición diaria en JSON |
| Tareas diarias / snapshots plantilla | 865 / 154 | 154 = 23×4 + 31×2 en esta observación; snapshots preservan también plantillas sin instancia |
| Revisiones / sesiones / Stages | 6 / 4 / 35 | Sólo IDs y relaciones seleccionados; payloads históricos no descargados |
| Defaults exactos zona/espacio | 0 / 0 | Días sí contienen 11/18 asignaciones exactas. Ausencia global no demuestra ausencia diaria |
| Reglas coach globales / diarias | 4 / 2 | Autocreación/asignación, no todos los requisitos de tareas existentes |
| Responsables defaults / día | 6 / 20 | Sólo scope y referencias de ubicación/equipo; personas excluidas |

| Día | Fecha | Tasks | Next explícito | Uso/clasificación provisional |
|---|---|---:|---|---|
| 13 | 2026-02-07 | 65 | No | Histórico por fecha; conservar accesible |
| 27 | 2026-02-27 | 193 | No | Histórico por fecha; conservar accesible |
| 28 | 2026-02-26 | 51 | No | Histórico por fecha; conservar accesible |
| 29 | 2026-02-28 | 24 | No | Histórico por fecha; conservar accesible |
| 27001 | 2026-10-30 | 266 | Sí | Demostración A2 previa/histórica frente a topología nueva |
| 27002 | 2026-10-31 | 266 | Sí | Demostración A2 con topología real; rama funcional paralela fuera de P1 |

Todos tienen status draft en la lectura. Ese estado no basta para declarar que una jornada está abandonada o que sus referencias ya no son operativas. La vigencia humana del catálogo requiere decisión de producción; en el JSON se usa «operativa referenciada» y no se inventa una marca activo para tablas que no la tienen.

## Duplicados y no equivalencia

Las 31 etiquetas de A2 están repetidas entre 20xxx y 120xxx. Ocho grupos incluyen además una plantilla original: Redes, Sodexo, Croma, Estrellas, Pasillo, IN, OUT y Giratuto. El grupo nominal de recursos `eva` reúne 3 y 7007. La normalización usada sólo aplica Unicode NFKC, casefold y espacios: no convierte CAM3 y cam-3 ni nombres de plató parecidos en la misma identidad física.

Ejemplo verificable: Redes 12 tiene tareas en 13/27/28/29; 20026 en 27001 y 120026 en 27002. Sus referencias, snapshots y topologías pertenecen a días diferentes. La familia 120xxx usa la reconciliación espacial/recursos de la topología real. No consolidar IDs, dependencias o snapshots por etiqueta. Tampoco fusionar automáticamente recursos 3/7007: sus asignaciones diarias preservan identidades históricas distintas aunque representen una persona nominal similar.

`generated/catalog.md` lista cada grupo y entidad. El JSON conserva caminos exactos, no sólo una lista de nombres. Las clasificaciones no son excluyentes: una plantilla puede ser específica demo A2, operativa referenciada, histórica respecto a una versión y posible duplicado a estudiar.

**Ninguna plantilla, zona, espacio, recurso concreto o equipo global quedó sin referencias dentro de la cobertura observada.** Los tipos globales 5 «Reality» y 6 «Reality Duo» no tienen referencias encontradas en esa cobertura; sólo son candidatos de revisión/archivo, con histórico pendiente. No se certifica candidato alguno a eliminación. Un snapshot que conserva una plantilla sin tareas sigue siendo una referencia autoritativa.

## Defectos relacionales encontrados, sin reparar

Hay **10 referencias tipadas no resueltas** a `resource_items` 15/16: `task_templates:21` en `resource_requirements.anyOf[0].resourceItemIds` y los snapshots 41,42,43,44 de las jornadas 27,28,29,13. No aparecen esos recursos en los 22 items consultados. Esto certifica el desajuste entre referencia y catálogo observado; no demuestra por sí solo el impacto sobre cada run histórico ni autoriza sustituir por otro recurso.

Guardar la equivalencia por nombre, borrar la alternativa o reemplazarla por la primera opción disponible falsearía autoridad. La unidad de reparación debe identificar origen, alcance, necesidad histórica y comportamiento preflight/validator antes de proponer un cambio. No se toca en P1.

## Cobertura pendiente y RLS

Se consultaron FK/arrays enumerados y `plans.planner_next_configuration` con namespaces tipados: tasks, spaces, recursos diarios, unidades locales, cadenas/fases, policies, comidas y presencia. No se buscan números sueltos por todo JSON: 1 puede ser minutos, cantidad o ID de otra tabla.

**Pendiente para una limpieza destructiva:** contenido de `plan_config_revisions.replay_snapshot_json/identity_json/diff_json`; Draft/Stage/proposal/run/replay históricos; snapshots de bundles; metadata de bundle; restos de reglas JSON no tipadas/aliases; referencias de código/fixtures/import manifiestos para cada entidad candidata; tablas nuevas fuera de la allowlist. Los IDs de revisiones/sesiones/Stages sí están contados, pero no certifican sus payloads. La consulta mínima excluye autoría de alta y datos personales: «procedencia original» es familia/catálogo, no certificación de creador/fecha.

RLS **no certificada en vivo**: el servicio utiliza service_role y ese rol puede saltársela. Las migraciones/evidencias de seguridad presentes en el repositorio y el indicio del usuario apuntan a que las frases de cinco BLOCKED están anticuadas; no bastan para cambiar su estado. `script/audit/configurationCatalogP1.sql` entrega SELECT de `pg_class`, policies, grants, FKs y contadores históricos. No hay conexión SQL configurada/certificada que haya ejecutado esas consultas aquí. No se llama una RPC para simular SQL.

## Propuesta segura de catálogo activo

1. **Vista activa con histórico accesible**, como producto futuro: filtro explícito por procedencia/uso/estado; originales de producción, demo A2 y archivo claramente identificados. El estado activo no existe hoy en plantillas/zonas/espacios, por lo que el futuro contrato debe definirse; no asumir que un filtro equivale a archivar en DB.
2. **Archivo lógico referencialmente seguro:** deja intactos IDs, snapshots, JSON, tareas y Stages; evita selección para días nuevos salvo recuperación explícita. Debe permitir leer/exportar historia y distinguir archivo de indisponibilidad física de un recurso.
3. **Comparación operacional de candidatos:** duración, ubicación física y padre, recursos exactos/genéricos/alternativas, dependencias, roles/operaciones, márgenes, herencia y protected state; normalizar sólo mediante mapping explícito revisado. Ninguna comparación por nombre es un certificado.
4. **Reutilización para futuro:** permitir seleccionar una plantilla reutilizable aprobada para días nuevos y conservar provenance de las familias antiguas. No reenlazar las 266 obligaciones existentes para «limpiar» el catálogo.
5. **Eliminación posterior, unidad separada:** sólo tras SELECT de todas las referencias, revisión de JSON históricos, rollback/export recuperable, pruebas de lectura/replay y autorización concreta. Esta auditoría no autoriza borrar, renombrar, reasignar o migrar.

La implementación actual de `storage.deleteTaskTemplate` comprueba tareas existentes, pero no constituye un inventario integral de snapshots/JSON/históricos. No usar su éxito hipotético como prueba de que se puede borrar. Tampoco usar el botón Delete de equipos o zonas/espacios como mecanismo de archivo.

## Prueba de aceptación de una futura limpieza

Comparar antes/después: IDs de tareas, snapshots, revisiones, Stages, JSON fingerprints y obligaciones A2; lectura de los seis días; propuestas/replay de días no modificados; selección de defaults para un día nuevo; restauración de una entidad archivada; ausencia de referencias colgantes nuevas. La comprobación debe ser por entidad y por namespace, con reporte de autoridad preservada. Las referencias no resueltas 15/16 se registran como baseline separado para no ocultarlas ni atribuirlas a la limpieza.
