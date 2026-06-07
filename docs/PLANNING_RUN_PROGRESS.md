# Planning run progress

## ID 033 — Cancel/stale generation recovery

### Contrato de estado

La UI considera activos `running`, `pending` y `optimizing`. Son finales `success`, `infeasible`, `invalid`, `error`, `failed`, `cancelled`/`canceled` y `stale`. Un run activo con `totalPending=0`, o con `plannedCount >= totalPending`, tampoco puede mantener el modal en modo activo.

El endpoint de último progreso presenta como `stale` un run activo cuya última actualización tenga más de 10 minutos. Además, el cliente aplica una defensa más rápida: `2 × requestedTimeLimitMs + 30 s`, con un máximo de 5 minutos sin progreso. `stale` significa que ya no se puede confiar en que el proceso avance; no significa que se borre el planning existente.

### Cerrar y cancelar

- La **X** equivale a cancelar/desbloquear. Cierra inmediatamente el modal, detiene su polling activo, aborta la petición HTTP del cliente e intenta `POST /api/plans/:id/generation/cancel`.
- **Cancelar generación** ejecuta el mismo flujo y muestra “Generación cancelada. Puedes reintentar.” Aunque el backend no responda, el desbloqueo visual es autoritativo.
- **Cerrar** descarta el estado visual final o stale sin modificar tareas.
- **Reintentar** limpia la supresión local del run anterior y lanza una generación nueva.
- Si el run ya está completado, la cancelación es idempotente (`no_active_run`) y no modifica ni borra la planificación válida.
- Si ya está persistiendo, el backend devuelve `already_finalizing`: no cancela a mitad de escritura y el cliente refresca el estado.

El cliente recuerda únicamente en `sessionStorage` el ID que el propio usuario acaba de cerrar, para que un refresh de la pestaña no reabra ese mismo bloqueo. Se limpia al observar un estado final o al reintentar. El usuario nunca debe editar DevTools, Local Storage, Session Storage ni Supabase.

### Persistencia segura

El backend marca como `cancelled` los runs activos cancelables y guarda el mensaje “Cancelado por el usuario”. Antes y después de ejecutar el solver comprueba ese estado para evitar persistir un resultado cancelado. Una excepción de generación marca el run como `failed`, con un mensaje resumido para UI. No se cambia el motor, el scoring, las hard constraints, RLS ni el esquema de base de datos.

### Recuperación para usuarios no técnicos

1. Si el progreso continúa normalmente, esperar al cierre automático.
2. Si aparece “La generación parece haberse quedado bloqueada”, pulsar **Cancelar generación** y después **Reintentar**.
3. También se puede pulsar la **X** para desbloquear de forma segura.
4. No recargar compulsivamente ni tocar consola, storage o Supabase.
