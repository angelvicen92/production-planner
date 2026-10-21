# U06b — guardado atómico de plantilla y dependencias inversas

La [continuación de integración del PR #1174](integration-fixes/README.md) registra la corrección del contrato Data API, las aserciones U02 de revisión y el fallback legacy de la migración 103. Los resultados que siguen documentan el head inicial `96cd18b`.

21 de octubre de 2026 · Europe/Madrid. Repositorio `angelvicen92/production-planner`, rama remota `codex/atomic-template-inverse-deps-u06b`, base exacta `a41c310ec9e00cc2edf9085f15fb474e267bf311`, árbol `aa91a1e777caff1a2e225f6907c5ac856fdfb20d`. El checkout inicial era su padre; se recuperó la rama y se avanzó mediante fast-forward antes de editar.

## Causa y cambio

`TaskTemplatesSettings.saveEdit` confirmaba primero la principal mediante `PATCH /api/ta/:id` y después guardaba cada dependencia inversa con otro PATCH. Cada request constituía una transacción independiente: un fallo posterior no podía revertir lo ya confirmado.

Con cambios inversos, una pulsación de **Guardar** envía un único `POST /api/task-templates/:id/save-with-inverse`, con el PATCH de la principal, las relaciones añadidas/retiradas y las revisiones observadas al abrir el editor. El endpoint usa el mismo schema estricto de actualización y el mismo mapping camel/snake que el PATCH existente, extraídos sin cambiar sus reglas. La respuesta también reutiliza el mapping existente. Sin cambios inversos se conserva el PATCH anterior y el contrato U02, incluidos márgenes `null` y `0`.

La migración aditiva **103** añade `task_templates.revision` y un trigger que incrementa esa revisión en **cualquier UPDATE**, incluido el PATCH anterior. La RPC `save_task_template_with_inverse` verifica ADMIN en BD, serializa las escrituras del catálogo con `SHARE ROW EXCLUSIVE`, compara las revisiones y la pertenencia exacta de las filas afectadas y realiza todas las escrituras dentro de la transacción de PostgREST. El bloqueo corto del catálogo evita cambios de referencias durante la validación y deadlocks por bloqueo cruzado de plantillas; los lectores siguen permitidos. No se añaden locks de planificación.

La principal se construye con `%rowtype`/`jsonb_populate_record` y una lista fija de columnas admitidas. Los nombres de columna/SQL no son parámetros HTTP. Cada dependiente recibe sólo la adición o retirada de esa relación y la sincronización de array, `has_dependency` e ID legacy; las demás dependencias, su orden y los campos ajenos se conservan. IDs inválidos, inexistentes, repetidos y autodependencias se rechazan. Ninguna excepción se captura dentro de la RPC: también un UPDATE suprimido por trigger causa error y rollback.

Un conflicto devuelve **409** con explicación, mantiene abierto el editor y deshabilita Guardar. **Recargar** lee el catálogo actual y reconstruye el editor y sus versiones desde esa misma lectura. No se sustituye la revisión original por una lectura previa al guardado ni hay compensaciones HTTP.

El middleware de catálogo y el handler exigen ADMIN. La RPC es `SECURITY INVOKER`, con `search_path=''`; se revoca EXECUTE a PUBLIC/anon/authenticated y se concede sólo a service_role. El actor proviene de la sesión validada, nunca del body. No se amplían grants de tablas ni políticas RLS.

## Evidence nativa

[atomic-template.json](atomic-template.json) conserva payloads, resultados, filas completas del rollback, conflictos, requests del navegador y hashes antes/después. [native.json](native.json) registra PostgreSQL **17.11**, imágenes fijadas por digest, las **106 migraciones** aplicadas sin modificar, hashes SHA-256 de fuentes y resultados del harness. Las credenciales son nuevas por ejecución; el harness sólo admite servicios locales y destruye sus contenedores al terminar. No hay RPC simulada en esta prueba.

| Caso | Resultado observado |
| --- | --- |
| Principal + añadir/quitar inversas | 200; respuesta = GET; resto de campos y dependencias conservados; null/0 distinguidos |
| Fallo SQL en el último dependiente | 500; trigger confirma que la principal y el primer dependiente ya habían sido modificados dentro de la transacción; tabla completa y revisiones idénticas antes/después |
| Instrumentación del rollback | Secuencia de prueba, con privilegio local de uso, registra **3 intentos**; la condición de fallo consulta la principal y el primer dependiente ya modificados. La secuencia no se revierte; las filas sí |
| Principal o dependiente desactualizados | 409; ninguna fila sobrescrita |
| Escritor realmente concurrente | Otra conexión mantiene un UPDATE sin commit; `pg_locks` acredita que la RPC espera; tras commit, 409 y cero sobrescrituras |
| Inexistente, duplicado, self, ID inválido, columna arbitraria | 400/409, cero escrituras |
| Anónimo/JWT inválido | 401, cero escrituras |
| Production/Aux/Viewer/sin rol | 403, también con casing y slash; cero escrituras |
| RPC anon/authenticated y actor no ADMIN con service_role | Denegación SQL/ACL sin escrituras |
| Única dependencia eliminada | Array vacío, indicador false e ID legacy null |
| Chromium | Guardar produce una request; alta/baja inversa y márgenes persisten tras recarga |
| Chromium sin cambios inversos | Una request PATCH; null/0 preservados |
| Chromium con conflicto | 409, Guardar deshabilitado; Recargar y nuevo guardado conjunto correctos |
| Reaplicar migración 103 | Idempotente; catálogo y revisiones idénticos |

[conflict.png](conflict.png) muestra el estado de conflicto y el control Recargar.

Se comparó el contenido completo ordenado, mediante recuento y hash, de **62 snapshots de plantillas**, **865 tareas**, **11 Stages**, **3 planes**, **1 revisión de configuración** y la tabla de locks (vacía en esta fixture). Todos coinciden literalmente antes/después. Tras retirar únicamente las plantillas de prueba también coincide el catálogo original completo. El harness verifica adicionalmente la preservación del día histórico, sus 11 Stages y las 333 tareas ajenas. **Cero ejecuciones nuevas del solver, cero Stages solicitados, cero escrituras remotas**.

## Reproducción y gates

Docker local, dependencias del lockfile y Chromium:

```sh
npm ci
npx --no-install playwright install --with-deps chromium
npm run check:migrations
npm run check
npm run build
npx --no-install tsc -p script/demo/tsconfig.atomic-template.json
node --import tsx --test server/atomicTaskTemplate.spec.ts server/taskTemplateContract.spec.ts server/apiAuthorization.spec.ts server/taskTemplateSnapshot.spec.ts engine/buildInput.taskTemplateSnapshot.spec.ts
npm run demo:a2:smoke -- work/atomic-template --historical-topology --atomic-template
```

Resultado local: **24 tests focales pasan**, check, build, tipado del journey, gate de migraciones y ensayo nativo pasan. Node local `v24.19.0`; el workflow `Atomic task template save` reproduce los gates en Node 20. El build mantiene sus avisos no bloqueantes de tamaño de chunks. [validation.json](validation.json) registra los gates. Logs privados, JWT y contraseñas quedan fuera de Git.

## Alcance y operación

Autoridades consultadas: AGENTS.md; auditoría `configuration-p1/04-task-templates`; Evidence U02; Fuente 00 para precedencia; Fuente 01 §§6–7 (plantilla/snapshot/instancia), Fuente 04 independencia de snapshots, herencia null/override y §20.17; Fuente 07 ciclo causal, simplicidad, validación proporcional y Evidence. Se consultaron las guías vigentes de funciones/RPC de Supabase y sus notas sobre privilegios Data API y PostgreSQL 17.11.

La migración 103 debe estar aplicada antes de habilitar esta versión de la aplicación. Sólo se ha aplicado al PostgreSQL descartable. No se altera Planner Next, Assisted, heurísticas, búsqueda, budgets, otras familias de UI, configuración efectiva, tareas ni Stages. No se han modificado Fuentes oficiales, migrado Supabase productivo, publicado Replit ni hecho merge. La publicación y validación del runtime productivo quedan fuera de esta unidad.
