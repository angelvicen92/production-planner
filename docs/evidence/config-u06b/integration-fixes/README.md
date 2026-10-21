# U06b — integración de la migración 103 en el PR #1174

Continuación desde el head remoto verificado `96cd18b989089b312c0d4a151b79410eeb643885`. Se conserva el endpoint ADMIN, la RPC transaccional, el bloqueo y las revisiones. No se añade otra migración.

## Fallos reproducidos y corrección mínima

**Data API: siete checks fallidos.** Se reprodujo localmente `assertPrivilegeContract` con el mismo ledger y PostgreSQL/PostgREST descartables, bajo defaults restrictivos. El catálogo contiene dos funciones nuevas, ausentes del JSON versionado. El diff del contrato añade **exactamente seis entradas**, dos funciones por tres roles; ninguna tabla, secuencia ni permiso previo cambia:

| Superficie | anon | authenticated | service_role |
| --- | --- | --- | --- |
| EXECUTE `bump_task_template_revision()` | false | false | false |
| EXECUTE `save_task_template_with_inverse(...)` | false | false | true |
| Columna `task_templates.revision` | ninguno | ninguno | SELECT, INSERT, UPDATE |

La columna hereda los grants de tabla existentes y no añade un grant de columna. El JSON compacto sólo representa permisos exclusivos de columna, por lo que permanece igual en esa sección. El gate ahora comprueba además **los derechos efectivos concretos de revision** y que ambas funciones conservan `SECURITY INVOKER` y `search_path=''`.

La igualdad estricta del contrato completo y todos sus controles anteriores permanecen. Se añaden siete mutaciones SQL negativas, aisladas mediante BEGIN/ROLLBACK: EXECUTE de la RPC concedido a PUBLIC, anon o authenticated; revocación de service_role; EXECUTE del trigger concedido a service_role; SELECT(revision) para anon y UPDATE(revision) para authenticated. **Las siete deben hacer fallar el mismo assertPrivilegeContract.** No se permiten objetos desconocidos ni ampliaciones silenciosas.

**U02: octavo check fallido.** Se reprodujo la comparación de `smokeTemplateCreation.ts`: revisión observada **2**, esperada **1**. El campo cambia legítimamente con cada UPDATE. El journey ahora exige `revision anterior + 1` en sus **siete UPDATE exitosos**, y compara estrictamente todo el objeto, incluidos todos los demás campos. Conserva las matrices null/0/positivo, valores inválidos, permisos, snapshots futuros/anteriores, overrides diarios y hashes de historial. Las escrituras rechazadas siguen debiendo dejar todos los datos idénticos.

**Caso límite legacy.** Una regresión nueva, ejecutada primero contra la migración 103 original, prueba que la UI devuelve `[legacyId]` cuando el array persistido está vacío, mientras la RPC guardaba `[]`. La prueba ejecuta el **código real de getTemplateDependencyIds extraído de settings.tsx** en un contexto de test; no copia sus reglas ni modifica la UI.

En la rama que conserva dependencias almacenadas y en los dependientes inversos se cambia únicamente `coalesce(array, legacy)` por `coalesce(nullif(array, '[]'), legacy)`. Para arrays persistidos vacíos y NULL se comprueban: principal conservada, añadir relación sin perder otra legacy, retirar una relación ajena sin perder la legacy, retirar la propia relación legacy y sincronizar los tres campos. Un array vacío **enviado explícitamente en el PATCH** sigue significando borrar: esa rama conserva su precedencia. Todos los demás campos y el incremento de revisión se comparan estrictamente en cada operación de estas fixtures.

## Resultados y Evidence

[original-failures.json](original-failures.json) registra los ocho checks originales de GitHub, las dos reproducciones locales y la regresión legacy contra el SQL original. [atomic-template.json](atomic-template.json) conserva los casos legacy, filas completas de rollback, conflictos, permisos y requests del navegador. [template-creation.json](template-creation.json) registra las siete revisiones, matrices y preservación U02. [native.json](native.json) y [validation.json](validation.json) registran versiones, hashes de fuentes/SQL y resultados reales.

- Check, build, gate de migraciones y tipado del harness pasan.
- **54 tests focales** U02/U06b/snapshots/autorización/ejecución pasan.
- U06b con defaults restrictivos, Auth/PostgREST y Chromium reales pasa: contrato Data API, siete controles negativos nuevos, casos legacy, fallo del tercer UPDATE con rollback completo y carrera real con espera en pg_locks y rechazo 409.
- U02 pasa en PostgreSQL/navegador reales contra su base histórica: siete incrementos exactos de revisión; null/0, snapshots e historial conservados.
- El gate de ejecución repite la ruta nativa que antes fallaba en privilegios: ADMIN/ACL, fallo tardío, dos conexiones concurrentes, confirmación obsoleta y UI filtrada.

Los ensayos de navegador que coincidieron en el mismo workspace presentaron dos timeouts de navegación; se repitieron aisladamente, sin ampliar timeouts ni debilitar aserciones. Se registran también esos intentos en validation.json. No se ejecuta Full A2 local ni se modifica un benchmark. La CI existente completa del PR se deja ejecutar y su resultado final, con enlaces al head validado, se registra en la descripción del [PR #1174](https://github.com/angelvicen92/production-planner/pull/1174). Esto evita otro commit de documentación que volvería a lanzar todos los gates sobre un head distinto.

El workflow propio de U06b usa ahora `--restricted-data-api` y se activa también cuando cambian el contrato/gate: así verifica conjuntamente ambas superficies.

## Reproducción

Con Docker, dependencias del lockfile y Chromium instalados:

```sh
npm run check
npm run build
npm run check:migrations
npx --no-install tsc -p script/demo/tsconfig.integration.json
node --import tsx --test --test-concurrency=1 server/atomicTaskTemplate.spec.ts server/taskTemplateContract.spec.ts server/apiAuthorization.spec.ts server/taskTemplateSnapshot.spec.ts engine/buildInput.taskTemplateSnapshot.spec.ts server/liveExecution.spec.ts server/liveExecutionDateIntegrity.spec.ts server/executionTimeCorrections.spec.ts server/bulkExecutionReset.spec.ts
npm run demo:a2:smoke -- /tmp/u06-atomic --restricted-data-api --historical-topology --atomic-template
TEMPLATE_CREATION_BASELINE_ROOT=/tmp/u06-u02-base npm run demo:a2:smoke -- /tmp/u06-u02 --historical-topology --template-creation
node --import tsx script/demo/smokeA2Integration.ts /tmp/u06-execution --historical-topology --bulk-execution-reset --restricted-data-api
```

Ejecutar los journeys de navegador secuencialmente. `/tmp/u06-u02-base` es un worktree sin cambios de `12a5d2d4e4592c8660d43c2ccebb609d4f8faa80` con node_modules enlazado, como en el workflow U02 vigente. Las reproducciones originales de privilegios y revisión usan el worktree sin cambios de `96cd18b`; el caso legacy usa el test nuevo con el SQL original, antes de aplicar las dos sustituciones documentadas.

No se alteran los grants productivos ni el catálogo alojado. La migración 103 se ha aplicado únicamente a bases descartables. No hay cambios de planificador, Assisted, búsqueda, Fuentes oficiales o Replit. No se abre otro PR ni se hace merge.
