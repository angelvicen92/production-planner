# Reset masivo de ejecución — ADMIN

Base: `75040e7dabdb77864e216d3b1163c2fb9f26509b`. Unidad independiente en `codex/admin-bulk-execution-reset`; sin cambios de motor, reset Assisted ni Fuentes oficiales.

## Implementación y autoridad

`Ejecución del día` → `useConfirm` → `POST /api/plans/:id/execution/reset` → `reset_plan_execution` (101) → `reset_task_execution` (097). Una petición y una transacción; sin bucle de escrituras JavaScript. ADMIN se comprueba en el middleware, handler y SQL. La RPC es SECURITY INVOKER, search_path vacío, EXECUTE sólo para service_role; conserva RLS y privilegios de tablas. La migración se generó con CLI y se adaptó a la secuencia NNN del repositorio.

La confirmación captura todas las tareas, incluidas las pendientes, con identidad, estado y versión. La RPC bloquea primero el plan y después sus tareas en orden de ID, revalida ADMIN tras la espera y compara el conjunto completo antes de escribir. Un cambio de versión, estado o pertenencia produce 409; una confirmación concurrente no puede resetear una ejecución posterior silenciosamente. Una repetición con snapshot actualizado y todo pendiente devuelve cero sin eventos nuevos. Reutilizar una confirmación anterior al reset produce 409 sin cambios.

Sólo se resetean estados distintos de pending. Cada reset conserva el evento anterior y añade actor, snapshot previo y versión nueva. La rutina individual retira los tiempos efectivos y sus locks de ejecución. Planning, recursos, locks manuales, Stages, Draft y configuración permanecen idénticos. La interfaz captura la jornada completa aunque haya cero resultados filtrados, informa del recuento confirmado e invalida plan, tareas, locks, contexto e historiales afectados.

## Validación

- **92/92 pruebas focales**: ejecución, fecha/DST, rectificaciones auditadas, reset masivo, autorización HTTP, Assisted workflow, incidencias y proyecciones de UI.
- TypeScript de aplicación e integración: PASS. Build: PASS, con el aviso existente de tamaño del bundle. Secuencia de migraciones: PASS hasta 101. Higiene del diff: PASS.
- [Ensayo nativo](integration.json): PASS, PostgreSQL 17.11, Auth, PostgREST y Chromium desechables; ledger completo y permisos con defaults restringidos. Sin sustitución de RPC ni interceptación de peticiones.
- Mezcla real done/in_progress/interrupted/cancelled/pending: cuatro resets y 266 tareas pendientes. Las ya pendientes y todas las tareas de otros días permanecen literalmente iguales.
- API: anónimo 401; norole/viewer/aux/production 403. SQL también rechaza esos actores. anon/authenticated carecen de EXECUTE incluso aportando un actor ADMIN. Catálogo completo de privilegios y RLS contrastado con el contrato versionado.
- Fallo inyectado en el último reset: HTTP 503 y comparación literal de tareas, versiones, eventos y locks sin cambios. Ningún éxito parcial.
- Dos sesiones nativas: la petición espera el lock del plan; una rectificación concurrente incrementa la versión; al liberar el lock recibe 409 sin resets. Dos confirmaciones simultáneas producen un 200 y un 409, con un solo evento nuevo.
- Historial previo comparado literalmente y UPDATE posterior rechazado por el trigger de inmutabilidad. Cada evento nuevo coincide con tarea, versión, ADMIN y snapshot anterior.
- [Navegador real](bulk-execution-reset.png): Production no ve el botón; ADMIN lo usa con cero coincidencias filtradas; Cancelar no modifica nada; offline deshabilita; un cambio durante el diálogo devuelve 409; éxito actualiza contadores, filas y cabecera sin recarga. Planning/Stages/Draft/configuración y locks manuales se comparan literalmente antes y después.

Comando del ensayo, también incorporado a `Live day execution`:

```sh
node --import tsx script/demo/smokeA2Integration.ts work/bulk-execution-reset --historical-topology --bulk-execution-reset --restricted-data-api
```

Tests nuevos: `server/bulkExecutionReset.spec.ts` y caso HTTP en `server/apiAuthorization.spec.ts`. La suite de 92 incluye `server/liveExecution*`, `server/executionTimeCorrections.spec.ts`, `server/assistedPlanningWorkflow.spec.ts`, `server/incidents.spec.ts` y las proyecciones de ejecución de cliente. Los cuatro casos de reset se repitieron tras añadir la comprobación de reaplicación de 101.

## Límites y retirada

101 no se ha aplicado en Supabase productiva. No hay publicación Replit ni merge. Antes de activar la funcionalidad deberá incorporarse la migración mediante el procedimiento operativo autorizado. La entrega WebSocket de Supabase no se certifica en el gateway local; la actualización observada usa las invalidaciones HTTP reales de la aplicación. La operación serializa brevemente la jornada y puede devolver 409 si cambia durante la confirmación; exige revisar y confirmar de nuevo.

Retirada conceptual: revertir UI/API y revocar EXECUTE de la nueva RPC. No borrar eventos ni reescribir migraciones históricas. Un reset administrativo ya confirmado conserva sus hechos originales en el historial; la retirada de la función no reconstruye automáticamente su estado efectivo.
