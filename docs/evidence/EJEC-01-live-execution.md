# EJEC-01 — Mi Día y ejecución persistente

Base: `022a2db19245e406eb1774901e4dc55a331c4d0c`. Rama objetivo: `codex/live-day-execution-p1`.

## Resultado y frontera

Inicio y fin atraviesan autenticación real, autorización nominal, HTTP, PostgREST y una única transacción PostgreSQL. Mi Día muestra tarea/persona/ubicación, inicio real, tiempo activo, siguiente actividad y agenda cronológica. Control Room observa el mismo estado y ambos navegadores lo conservan al recargar.

La aceptación de ejecución usa una **copia descartable del snapshot A2 previamente aceptado** que contiene el fixture versionado `script/demo/fixtures/a2-legacy-import.json.gz`: 266 obligaciones y 11 checkpoints (S0–S10). No usa respuestas HTTP interceptadas, sustitución de RPC ni almacenamiento mock. No certifica una nueva generación del planificador ni reproduce el fingerprint actual `c0cc8bf4…`. El fingerprint de la copia es `a58fc840fa4b8d04049c96d8310eac6e5d4df66f08069d968fe7a5e0adf9e2dc` y permanece intacto.

[Evidence estructurada](EJEC-01-live-execution.json) y [capturas](EJEC-01-UI/).

## Auditoría causal

| Frontera anterior | Causa comprobada | Delta |
|---|---|---|
| HTTP → escritura privilegiada | `/tasks/:id/status` quedaba fuera de los roles específicos; `service_role` evita RLS | Middleware de rol y autoridad de tarea; segunda comprobación dentro de la RPC |
| Estado → histórico → protección | Tres escrituras separadas podían producir éxito parcial | Una RPC invoker, sin compensación frontend, con rollback completo |
| Dos móviles → mismo estado | Sin precondición de estado ni serialización conjunta | Lock del plan/sesión/tarea, estado observado y 409 explícito |
| Navegador → hora real | Aceptaba `effectiveTimeHHMM`/segundos del cliente | Reloj de PostgreSQL y configuración simulada administrada; esos campos quedan como compatibilidad ignorada |
| Interrupción → reanudación | Restaba segundos de 0–59 | `paused_at` completo y diferencia de epoch; duración antigua sin timestamp completo: no disponible |
| Cámara → permiso personal | Mi Día infería identidad por tipo/cantidad | IDs nominales efectivos de tarea/espacio/zona y vínculo primario de usuario |
| Estado → otras sesiones | Mi Día no suscribía la integración de Control Room; faltaban claves de tareas/locks | Realtime existente, invalidación de las cuatro claves, recuperación de foco/visibilidad/red y polling visible |
| Rechazo → feedback antiguo | Hook compartido actualizaba optimistamente y anunciaba éxito en `onSettled`, incluso al fallar | Estado confirmado por servidor; éxito sólo en `onSuccess`; controles antiguos según autoridad y transición |
| Reset → locks humanos | Reset anterior borraba todos los locks full | Conserva locks humanos e histórico; limpia sólo protección de ejecución y razones legacy generadas conocidas |

Autoridades consultadas: Fuentes oficiales 00 v2.11, 01 v5.2 (11–13, Anexo A), 02 v2.2, 03 v3.6, 04 v2.6, 05 v2.6, 06 v2.8 y 07 v2.2; Evidence de A2-ASSIST-8 e integración nativa actual. No se modifican Fuentes, motor, Assisted workspace ni preferencias de bloques/comida.

## Contrato HTTP, estados y permisos

`PATCH /api/tasks/:id/status` recibe `status` y, preferiblemente, `expectedStatus`. Los consumidores existentes envían el estado observado. Si un cliente antiguo lo omite, Start espera pending y Finish/Interrupt esperan in_progress; Resume requiere observar interrupted.

| Estado actual | Siguientes estados ordinarios |
|---|---|
| pending | in_progress, cancelled |
| in_progress | done, interrupted |
| interrupted | in_progress, cancelled |
| done / cancelled | ninguno |

Pending → done y cualquier reapertura ordinaria se rechazan. Start sobre pending exige planificación consolidada completa: publicación explícita con horarios o Stage aceptado no archivado, no S0, con todas las identidades y placements coincidentes. Se comparan ubicación, horarios, overrides y asignaciones declaradas. Si un snapshot v1 antiguo **omite** `assignedResourceIds`, conserva la asignación live, exactamente como el contrato de persistencia 086; omisión no equivale a borrar sus recursos.

- Admin/Producción: autoridad global ya existente.
- Aux: vínculo primario a staff activo con asignación explícita del mismo plan y ámbito efectivo por espacio/zona; o recurso nominal activo y disponible que realmente participa en esa tarea. Se respeta el modo explícito de staff por zona/espacio. Ámbitos itinerantes sin enlace nominal demostrable quedan en lectura.
- Viewer/sin rol/anónimo: ninguna ejecución. Un recurso genérico o cantidad de cámaras no concede autoridad.
- Reset: endpoint separado, sólo admin/producción, una transacción, snapshot anterior en el evento y preservación de locks humanos.

401: autenticación ausente. 403: autoridad insuficiente. 409: transición, conflicto/stale, ocupación, reloj cambiado o planning pendiente. 503: no se confirmó persistencia. No se muestra éxito para un rechazo.

Las operaciones de interrupción/reanudación existentes conservan inicio, pausa completa, evento y protección en la misma transacción. **No se certifica el dominio oficial completo de división de trabajo, generación de reanudación pendiente, motivos de cancelación o replanificación de la parte restante**; no se añaden esos flujos a Mi Día.

## Migración y diff técnico

`092_live_task_execution.sql` es necesaria porque varias llamadas REST no forman una transacción conjunta.

- Timestamps completos y modo/revisión de reloj en `daily_tasks`, sin backfill inventado de tiempos legacy.
- Estado previo, hora operativa, modo y snapshot de tarea en eventos; `created_at` conserva la hora física del servidor incluso en simulación.
- `execution_owned` e índice único parcial: una protección automática por tarea. Locks automáticos legacy duplicados provocan conflicto y revisión, sin éxito parcial.
- Funciones `SECURITY INVOKER`, `search_path=''`, sólo ejecutables por `service_role`; no RPC pública de ejecución.
- Revoca DML directo de anon/authenticated/PUBLIC sobre tarea, histórico, locks y autoridades operativas que podrían falsificar ámbito o publicación. No amplía grants de tabla ni modifica tablas de preferencias de bloques.
- Añade tareas/locks a `supabase_realtime` sólo si esa publicación existe y aún no los incluye.

Se creó una plantilla con Supabase CLI 2.81.3 y se normalizó a la secuencia NNN exigida por el repositorio. La migración completa se aplicó en PostgreSQL 17.11 descartable y sus funciones se ejecutaron mediante PostgREST real.

Backend: `server/liveExecution.ts`, `apiAuthorization.ts`, `routes.ts`, `storage.ts`; contrato en `shared/routes.ts`, `schema.ts` y `execution.ts`. UI: `/my-day` existente; hooks de contexto/realtime/datos/reloj; adaptaciones limitadas de Dashboard, Control Room, controles de tareas y hooks de ejecución/reset. La navegación y el solver conservan su implementación.

## Pruebas

| Gate | Resultado |
|---|---|
| TypeScript, build, secuencia 071–092 | PASS local |
| Servidor (Node 20) | 304/304 PASS |
| Focal HTTP + RPC + workflow | 24/24 PASS |
| Suite ampliada server/shared/client-lib | 449/451: dos fallos reproducidos en la base sin delta |
| Ledger entero + GoTrue + PostgREST + HTTP + Chromium | PASS sobre copia aceptada descartable |
| Viewer/aux sin vínculo/fuera de ámbito/otro plan | 401/403 según contrato, material persistente intacto |
| Eventos/locks: fallos inyectados por triggers PostgreSQL | 503, estado/horas/histórico/locks intactos |
| Start/Finish simultáneos | Cada carrera da 200 + 409; un evento por transición y una protección por tarea |
| Reset autorizado | Histórico anterior conservado; locks humanos no se borran |
| Simulación | Activada por HTTP de admin; viewer recibe 403; navegador operador en America/New_York sigue autoridad Madrid |
| Dos tareas simultáneas | Ambas visibles; viewer sin acciones |
| Error UI, offline y recuperación | Rechazo mantiene pending; sin conexión no hay acciones; actualización recupera datos |
| Identidades/horarios/Stages/Draft | Las 266 obligaciones y sus placements permanecen literales |

Los dos fallos ampliados pertenecen a `shared/configurability.test.ts` (conteo documental desactualizado) y `shared/spatialAvailabilityRoutes.spec.ts` (expectativa antigua de create). Se reprodujeron en un archivo extraído de `origin/main`/022a2db con Node 20. No se modifican esas unidades ni se declaran verdes.

Comando del ensayo reproducible, con Node 20, Docker y Chromium:

```sh
node --import tsx script/demo/smokeA2Integration.ts work/live-day-execution --historical-topology --live-execution-snapshot
```

El ensayo crea servicios y credenciales locales, comprueba que los hosts son loopback, ejecuta el recorrido y elimina sus servicios al terminar. No tiene opción para escribir en un proyecto remoto. El nuevo workflow `Live day execution` ejecuta este gate y publica únicamente JSON público/capturas, excluyendo logs privados y credenciales.

## Sincronización observada y capturas

El entorno descartable no ejecuta Supabase Realtime. Se prueba el **fallback HTTP cada 5 s**, visible tanto en Mi Día como Control Room. Las latencias de la medición están en JSON (inicio 6.911 s y fin 1.581 s en la medición de entrega); incluyen confirmación de operador y observación de Control Room. No se califica como instantáneo.

- [Móvil pendiente](EJEC-01-UI/mi-dia-mobile-pending.png)
- [Móvil en curso](EJEC-01-UI/mi-dia-mobile-running.png)
- [Escritorio en curso](EJEC-01-UI/mi-dia-desktop-running.png)
- [Escritorio oscuro](EJEC-01-UI/mi-dia-desktop-dark.png)

## Comparación y límites

El corpus integrado referencia A2 actual 266/266, S0 + 11 Stages, cero HARD/REQUIRED y fingerprint `c0cc8bf4e1c466a9640b7ce765e0dceeb5772204a8f387f50e1af12d844ec703`. El delta no modifica el árbol `engine/` ni fixtures de planificación. Start/Finish no cambian los horarios ni snapshots de la copia usada para ejecución.

Los intentos locales de reconstruir A2 desde cero con Node 24 y Node 20 agotaron 180 s antes de aplicar S1, con run todavía running. Se documenta ese gate como **no certificado localmente**; no se cambia el motor ni se oculta el resultado. El ensayo de ejecución usa el snapshot aceptado previo, no atribuye su éxito a una nueva generación de c0cc8bf4.

Quedan pendientes: transporte Realtime/WebSocket en un proyecto de prueba con Realtime real; compatibilidad y autorización de cualquier despliegue en el Supabase real; CI remota del head; y sincronización/renumeración antes de merge. No se hicieron writes en Supabase real, publicación ni merge.

La rama paralela `codex/mainflow-soft-meal-split-day-config` (`dc626065…` al verificar) también añade `092_main_flow_soft_preference.sql`. Esta unidad mantiene `092_live_task_execution.sql` aislada y válida sobre main 022a2db. **Antes de integrar la segunda rama, renumerar su migración al siguiente número disponible, sincronizar con main y repetir secuencia/ledger/CI.** También coinciden los archivos `server/routes.ts`, `shared/routes.ts`, `shared/schema.ts` y dos helpers de ensayo; conservar ambos deltas. No se importó ni sobreescribió el trabajo paralelo.

## Guion de demostración de dos minutos

Precondición: copia descartable con planning aceptado y las identidades locales ya creadas por el ensayo. La automatización recorre estas mismas funciones reales y guarda las capturas; sus servicios se destruyen al terminar.

1. 0:00–0:20 — Operador aux abre Mi Día y selecciona la jornada de ensayo. Identifica tarea, C02, ubicación, planning aceptado y consulta cada 5 s. Producción abre el mismo día en Control Room en otra sesión.
2. 0:20–0:45 — Operador pulsa INICIAR ACTIVIDAD. Ver estado en curso, inicio y cronómetro; observar la misma tarea en Control Room. El servidor decide la hora.
3. 0:45–1:10 — Pulsar FINALIZAR ACTIVIDAD; comprobar completada, fin y tiempo activo. Esperar la actualización visible de Control Room.
4. 1:10–1:30 — Recargar ambas sesiones: mismos datos persistidos. Revisar los dos eventos de la operación y la protección única de esa tarea en la base descartable.
5. 1:30–2:00 — Viewer abre la misma jornada: consulta sin acciones. Su PATCH directo devuelve 403 y no cambia ninguna fila. Mostrar el caso de dos actividades simultáneas y el error de persistencia que deja la tarea pending, sin anunciar éxito.
