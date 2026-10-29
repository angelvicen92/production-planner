# P0-G03d — gate causal contrastado

Base autorizada y rama remota comprobadas: `84056c3de8bf16769ce2c1ec32113fbc7443f532`, `codex/p0-g03d-resource-windows-native-ui`.

- **X:** los editores de catálogo y de recursos diarios omiten las ventanas. G03c guarda EVA `null/null`.
- **Y:** los campos ya existen en 072, GET/POST/PATCH, snapshot, `buildEngineInput` y `resolveEffectivePlanResourceAvailability`; falta el productor UI.
- **Z:** el contrafactual G03c sin ventana coloca EVA desde 09:00, contradiciendo Fuente 06. El solver consume correctamente el input que recibe.
- **W:** compartir el control horario entre alta y edición global/diaria; usar los campos existentes. Cerrar primero el PATCH diario directo mediante el writer CAS v5 y su transición de fuentes existente.
- **M:** recibos Chromium → catálogo → snapshot independiente → override → recarga → EngineInput/adapter; contrafactual idéntico salvo ventana; segundo día y propuestas/SQL reales; negativos sin escrituras parciales y dos bases frías.

## Endpoint y autoridad antes de editar

| Endpoint | Permiso vigente | Persistencia anterior | Riesgo / corrección |
| --- | --- | --- | --- |
| POST/PATCH `/api/resource-items` | admin | escritura de catálogo; pareja normalizada; GET ya devuelve defaults | No propaga a snapshots. Se reutiliza; alta comprueba tipo activo. |
| POST `/api/plans/:id/resource-items` | admin/production | inserción ad hoc; normalización; sin revisión de sesión | Se conserva para preparación; el trigger rechaza altas cuando la sesión ya ha capturado fuentes. No admite incorporación posterior en esta unidad. |
| PATCH diario | admin/production | UPDATE directo, sin CAS/revisión; nombre limitado a ad hoc | La pareja horaria exige `expectedRevisionId`, se guarda sola y pasa a v5. Las rutas directas no pueden cambiar ventanas. |
| DELETE/init diario | admin/production | borrado ad hoc / inicialización en bloque | El guard SQL protege las fuentes capturadas y decisiones ya planificadas. |

La comprobación HTTP reproduce además un bypass anterior: `POST /API/RESOURCE-ITEMS` con rol inexistente alcanzaba el handler privilegiado (200), mientras su ruta en minúsculas exigía admin. Se normaliza únicamente la clave de autorización según la semántica de Express y se registra explícitamente el GET `resource-types-with-items`; el request/ID real no se modifica. El mismo test HTTP queda verde para escritura/lectura global y diaria, mayúsculas y slash final.

GET conserva la lectura de admin/production/viewer/aux. Anónimo requiere autenticación. `supabaseAdmin` usa service_role y omite RLS: los checks HTTP por sí solos no protegen una transición concurrente.

## Recorrido de revisión y protección

`resource_configuration` ya incluye identidad diaria, identidad global nullable, tipo, nombre, booleano y pareja. `buildCanonicalPlanConfig` reutiliza identity/replay v1. La rama añadida a `apply_day_config_operation_v5` comprueba actor, revisión, fuentes bloqueadas, proyección SQL completa, delta exclusivo y hashes; modifica solamente dos columnas. El discriminador interno `RESOURCE_AVAILABILITY` hace que el writer anterior a 129 rechace la operación; no puede ignorar un campo nuevo y persistir sólo su revisión. En 129 delega como EDIT, conservando los contratos existentes. Delega la inserción de revisión, cambio de puntero de plan/sesión e invalidación de validación al writer previo. Los lectores existentes recuperan `resourceAvailabilityTransition.sources` del diff inmutable; no se crea otra sesión, tabla de revisiones ni RPC.

El S0 limpio puede cambiar su configuración manteniendo snapshot y sesión. Un Draft modificado o propuesta pendiente impide el cambio. Cualquier horario ya planificado, ejecución, lock o placement histórico produce rechazo controlado. Este delta **no implementa edición horaria posterior a placements con grandfathering/recertificación**, aunque el cambio fuera inocuo. Los Stages permanecen inmutables y no se mueven decisiones. La restricción es de backend/SQL y se explica en UI al rechazar; no se oculta deshabilitando un botón.

La migración incremental 129 es necesaria porque el writer vigente no actualiza `plan_resource_items` y ningún guard de 072–128 hace atómico ese PATCH con la revisión/sesión. Mantiene los campos, identidad y mecanismo existentes. Sólo se aplica en bases descartables.

## Frontera preservada

Conjunta + fases + comidas flexibles continúa rechazada por la autoridad diaria y su guard SQL. El macroprobe sólo añade conjunta en memoria, conservando la ventana auténtica guardada. Su control elimina únicamente esa ventana. Ninguno acredita Stage combinado. La siguiente unidad sigue siendo autenticar esa misma composición mediante los consumidores TypeScript/SQL existentes, sin retirar guards sin evidencia.
