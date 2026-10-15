# U02 — alta y edición fiable de plantillas

15 de octubre de 2026 · Europe/Madrid. Base autorizada posterior a #1130 y #1131: `12a5d2d4e4592c8660d43c2ccebb609d4f8faa80`, árbol `a70d4d416207fb176dd3d205d502d354c59aed58`.

## Causa demostrada y contrato

El recorrido es Configuración → `TaskTemplatesSettings` → hooks `use-tasks` → `api.taskTemplates` → autorización de catálogo de #1130 → handlers existentes → `SupabaseStorage` → PostgreSQL/PostgREST → GET. Para una jornada nueva, `createPlan` copia el catálogo a `plan_task_template_snapshots` (contrato 2); `buildEngineInput` resuelve exclusivamente ese snapshot y los overrides de instancia.

En el baseline inmutable, Chromium envía el formulario real de alta: 400 por `participantMarginBeforeMinutes` y `participantMarginAfterMinutes` no reconocidos por el schema estricto. La edición real omite ambos campos y devuelve 400 por `location_label` cuando envía la ubicación. También se reproduce el rechazo del PATCH de márgenes aislado. Los hashes completos no cambian ante esos fallos. Los tests nuevos de contrato producen dos fallos en el baseline: formulario completo y valores null/0/positivos.

La migración **004**, apartado B, añade a `task_templates` únicamente `zone_id` y `space_id`. Su apartado C añade `location_label` a **`daily_tasks`**, para la etiqueta histórica de un espacio borrado. `shared/schema.ts` confirma la misma separación y ninguna migración posterior añade esa columna a plantillas. La proyección/escritura de esa etiqueta en el mapping global era errónea. Se elimina sólo de los tres resultados de plantilla y de su UPDATE. El contrato diario se conserva. No se añaden columnas, defaults artificiales, migraciones ni fallback ante errores SQL.

## Cambio mínimo

- POST y PATCH estrictos admiten ambos márgenes nullable/opcionales. Se conservan `null` (ausencia/herencia) y `0` (override explícito); omitir una key del PATCH no escribe esa columna. Se rechazan negativos, fracciones, tipos incorrectos, NaN/infinito y desbordamiento de `integer` PostgreSQL. `2147483647` es un límite técnico de representación, no una regla operativa nueva.
- Create, update y GET incluyen ambos mappings camelCase/snake_case. GET recupera además los dos colores de comentario que ya soportaban POST/PATCH y DB.
- Los hooks y storage usan tipos derivados del contrato HTTP. Los hooks validan antes de serializar, para evitar que NaN se transforme en null por JSON. El formulario distingue vacío/heredado de cero y valida márgenes con el schema compartido.
- `saveEdit` transmite ambos márgenes. Conserva requisitos, flags de coach, reglas, dependencias, abreviatura y colores originales cuando no se modificaron sus controles. Esto evita reconstruir un JSON o convertir un requisito itinerante existente al guardar otra propiedad. Las transformaciones de esos editores continúan disponibles al cambiarlos; no se añade editor de operaciones, itinerancia ni atomicidad inversa. Se admiten también colores con alfa de ocho dígitos, ya aceptados por API/DB, sin perderlos al abrir la edición.
- `server/apiAuthorization.ts`, handlers, snapshots y algoritmos permanecen iguales a la base. Los cambios de plantilla global no refrescan jornadas existentes.

## Evidence diferencial nativa

El harness existente crea PostgreSQL 17, GoTrue y PostgREST locales, aplica las **97 migraciones sin modificar**, importa el catálogo histórico descartable y arranca dos servidores: baseline y candidato. Las credenciales de cada servicio se generan en esa ejecución; las variables de los procesos hijos se sustituyen por el endpoint local. No hay opción de destino remoto ni escritura en Supabase productivo.

| Prueba | Baseline | Candidato |
|---|---|---|
| Alta del formulario real, incluidos márgenes | 400, keys desconocidas | 201; respuesta = GET |
| Guardar edición desde navegador | 400 por columna incorrecta; márgenes omitidos | 200; márgenes enviados y recargados |
| PATCH de márgenes aislado | 400 | 200 |
| POST completo con todas las combinaciones null/0/positivo | Schema incompatible | 9 altas; POST = GET y campos conservados |
| Editar márgenes y volver a editar tras recarga | No persiste | 0/20, null/0, 5/null, 0/20; resto de campos idéntico |
| Valores inválidos | Sin contrato de márgenes | 28 rechazos HTTP, seis rechazos de edición UI, cero escrituras |
| Production/Aux/Viewer/sin rol | Gate de #1130 | POST/PATCH/DELETE y casing: 403; sin token/token inválido: 401 |
| Página Configuración para Production/Aux/Viewer | Restringida a admin | Mismo rechazo real en navegador; sin controles de plantilla |
| Jornadas nuevas | No recorrido global fiable | Tres snapshots con 0/15, 20/0 y null/null, proyectados a EngineInput |
| Override diario 0/5 y restauración a null/null | Capacidad previa | Se comprueba contra cada snapshot; cero conserva autoridad y null hereda |

Se reutiliza `participantGapMinutes`: ningún override → 5 general; un cero → 0; un positivo → ese valor; ambos overrides → máximo, nunca suma. La suite focal existente comprueba dominio/colocación/validación y el nuevo test de `buildInput.taskTemplateSnapshot` cubre 30 combinaciones de snapshot e instancia sin lecturas del catálogo global ni mutación del input.

Antes y después se comparan recuento y hash del contenido completo ordenado de siete tablas. La fixture incluye un lock explícito para que su preservación no sea vacía. Al retirar sólo las filas creadas para U02, coinciden literalmente las plantillas originales, **865 tareas** (266 de 27001, 266 de 27002 y 333 adicionales), **62 snapshots**, **11 Stages**, planes, revisiones y ese lock. La comprobación histórica independiente del harness también pasa. Los snapshots de las jornadas de prueba anteriores permanecen idénticos después de editar el default y crear el siguiente día.

[baseline.json](baseline.json) contiene payloads y fallos anteriores; [candidate.json](candidate.json) conserva matriz, valores, snapshots, hashes de fuente y protección antes/después. Los logs privados y credenciales permanecen fuera de Git. CI publica JSON y capturas de las fixtures.

## Reproducción

Requiere Docker, dependencias del lockfile y Chromium de Playwright:

```sh
git worktree add --detach work/u02-baseline 12a5d2d4e4592c8660d43c2ccebb609d4f8faa80
ln -s "$PWD/node_modules" work/u02-baseline/node_modules
TEMPLATE_CREATION_BASELINE_ROOT=work/u02-baseline npm run demo:a2:smoke -- work/template-creation --historical-topology --template-creation
npx --no-install tsx --test server/taskTemplateContract.spec.ts server/apiAuthorization.spec.ts server/taskTemplateSnapshot.spec.ts engine/buildInput.taskTemplateSnapshot.spec.ts engine/planner-next/participantTransition.spec.ts
```

`Template creation and margins` ejecuta este gate en Node 20. El journey de autorización de U03a mantiene todas sus aserciones de seguridad: reproduce el fallo histórico de su baseline y ahora exige 200/persistencia/recarga en el candidato, porque U02 corrige expresamente ese comportamiento. No se debilitan las expectativas de roles ni se inventa schema para obtener verde.

## Alcance y deuda restante

Autoridades: AGENTS; Fuentes 00 v2.12, 01 v5.2 (§§6–7/12), 03 v3.7 (§18), 04 v2.7 (márgenes, snapshots y §20.17), 05 v2.7 (regresión/determinismo), 07 v2.2; auditoría P1 `04-task-templates`/`06-capabilities-backlog` y Evidence `config-u03a`.

Se cierra el recorrido global de U02, sin promover toda una capability a PRODUCTIVE. U03b (referencias itinerantes históricas), U04 (composición), U06 (operaciones/dependencias inversas atómicas), otras rutas de autorización señaladas en U03a y la certificación del despliegue/RLS/Realtime continúan separados. No cambian Planner Next, heurísticas, Future Feasibility, budgets, preferencias ni canon A2. No se hace merge ni publicación.

Los resultados del gate local y el estado remoto se registran en [validation.json](validation.json).
