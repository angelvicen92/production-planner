# P6 — corrección del contrato de roles

Continúa el PR #1154, a partir de `c0ad6dd`, e integra main/P7 `0e7442e4b5ccf4fde6756841b7908b27e87fe1db`. La [auditoría anterior](P6-AUTHORIZATION-AUDIT.md) documenta el comportamiento del head previo; sus referencias a «hook todavía sin corregir» corresponden a aquel diagnóstico.

## Delta de producto

- `useUserRole` conserva la clave por usuario, sin polling propio. Un fallo de transporte no elimina el último rol confirmado de la misma identidad.
- `useControlRoomRole`, en el mismo archivo, tiene caché y polling de 30 s propios. Ante error cierra las perspectivas. Una reconfirmación correcta actualiza también el rol global; una discrepancia con el contexto de ejecución mantiene el cierre de Control Room.
- Un 401/403 del lector de rol borra los datos de autoridad de ambas consultas de esa identidad y se vuelve a lanzar como error. Otro timeout no puede resucitar el rol anterior.
- Al cambiar la identidad o cerrar sesión, AuthProvider cancela y elimina las consultas de rol de la sesión anterior. No se cambia el SDK ni el contrato de Auth.
- El backend sigue autorizando cada aceptación de Stage. La caché cliente sólo determina la presentación y la continuidad del controlador.

No se modifican Assisted, Planner Next, ORC, SQL/migraciones, RLS, permisos backend, presupuestos, heurísticas, timeouts o retries. Los cambios de P7 se integran desde main sin alterarlos.

## Prueba causal antes/después

`script/demo/userRolePolicy.browser.mjs` monta AuthProvider, el hook real y los guards `call/check` de AssistedAutopilot en Chromium. Auth y HTTP están interceptados en esta prueba de contrato; no se presenta como una prueba de backend.

Primero se ejecutó con el hook problemático: un GET de rol retenido alcanza el timeout ordinario y produce `AbortError`; la assertion de conservar `production` falla porque recibe vacío. Con la corrección pasa: mismo actor, error visible, autoridad retenida y llamada de aceptación protegida por el controlador. También comprueba 403 seguido de 503, rechazo HTTP de la aceptación con caché Production obsoleta, logout/cambio de cuenta, ausencia de polling global y reconfirmación exclusiva de Control Room con downgrade/401. El workflow Planner Engine CI ejecuta esta prueba antes del recorrido nativo.

## Recorridos reales y límites de la inyección

El ensayo `smokeAutopilotWorkspace` conserva sus assertions de recorrido y añade dos comprobaciones focales:

1. Retiene únicamente el transporte de un GET de rol durante la generación real, hasta el timeout de 20 s ya existente. Se exige `AbortError` y rol `production` conservado. No se interceptan propuestas, resultados, validación ni aceptación. Esta inyección deliberada evita depender de la velocidad del solver o de la clasificación de errores de red del navegador.
2. Antes de una aceptación posterior cambia Producción a Viewer en la DB descartable, con la caché cliente deliberadamente anterior. Se exige 403 real y ninguna modificación de Stages/tareas aceptadas. La restauración explícita del rol se confirma por HTTP antes de aceptar el mismo borrador y recargar/reanudar.

Las primeras calibraciones de la observación natural no son pruebas verdes: una lectura inmediata respondió antes de empezar la búsqueda y otra devolvió TypeError de transporte. El recorrido con inyección tuvo después una [espera agotada](P6-AUTHORIZATION-CORRECTION/calibration-wait-failure.json) con el bloque de Autopilot ausente durante ensayos locales simultáneos; se añadió registro de navegación/Vite/rol. La ejecución aislada posterior pasa, sin cambiar producto ni límites de espera. Su lifecycle sólo muestra las navegaciones deliberadas del ensayo. No se atribuye el síntoma previo al motor, al hook ni a una causa de infraestructura concreta que la traza anterior no registró.

## Lectura JSON independiente

Se conserva el artifact de transporte introducido en `smokeA2ConfigurationReadRecovery`: status, headers permitidos, bytes y tipo de error, sin cuerpo ni credenciales, sin sustituir el fallo por éxito. La CI del head de diagnóstico `c0ad6dd`, run 39268459441, pasó el paso de configuración. Su job A2 completo falló después, al iniciar otro Autopilot S0. Esto no identifica retrospectivamente el origen del cuerpo JSON fallido del intento original.

## Evidencia de validación

[Validación estructurada](P6-AUTHORIZATION-CORRECTION/validation.json), [resúmenes nativos](P6-AUTHORIZATION-CORRECTION/native-summaries.json) y [comparación de Autopilot](P6-AUTHORIZATION-CORRECTION/autopilot-summary.json). Los reportes originales completos se conservan comprimidos en la misma carpeta, sin logs privados de aplicación ni credenciales.

| Gate local | Resultado |
|---|---|
| TypeScript general/integración, build y secuencia de migraciones | PASS; aviso de bundle grande preexistente |
| Control Room, autorización, controlador y configuración HTTP | 79 PASS |
| Contrato browser de roles, caché y autoridad | 5 comprobaciones PASS; prueba roja previa conservada |
| Browser P6 original | 11 comprobaciones, 23 capturas PASS |
| Control Room con Auth/HTTP/Postgres reales | PASS; Admin/Producción/Aux/Viewer, revocación, cambio de cuenta, desconexión, Start/Finish/incidencias |
| Autopilot nativo con timeout de rol inyectado | COMPLETE, 266/266, Stage 11; checkpoints 19/38/46, stop/reload/resume |
| Revocación real durante Autopilot | 403 en accept-stage con caché Production; Stages/tareas aceptadas literales |
| Configuración A2/52 legacy rows | PASS; resultado PROPOSAL, aceptación, restart y conservación |
| P2B/P3 e integridad P7 incorporada | PASS nativo |

Fingerprint final de Autopilot **idéntico al baseline**: `4e1a8ddfc2f82af162a57a00a9eec3986cba9be3933a456da051c639dddae0f2`. También coincide la propuesta de configuración: `10ce592a3772452096b245973a39ba841e4079e32ff76d1890fd087139ac6113`. El reporte lista los fingerprints SQL de S0–S11. El runner comprueba literalmente el día anterior, sus 11 Stages, el catálogo y otras 333 tareas. No hay delta de `engine/`, `server/` o `supabase/` respecto al main integrado.

| Evidence | Autopilot Workspace | Lectura de configuración |
|---|---|---|
| Run 39256905113, intento 1 | FAILED / UNAUTHORIZED / Stage 0 / 0 | Fallo JSON previo a inspeccionar resultado |
| Mismo run, intento 2 | Mismo UNAUTHORIZED | Paso de configuración PASS al mismo head |
| Head diagnóstico c0ad6dd, run 39268459441 | FAILED; hook todavía sin corregir | PASS; A2 completo falla después en otro Autopilot S0 |
| Corrección actual, ensayo aislado local | COMPLETE / Stage 11 / 266; timeout retenido y 403 auténtico verificados | PASS y mismo fingerprint; sin artifact de transporte fallido |

Los [Checks de GitHub del head del PR](https://github.com/angelvicen92/production-planner/pull/1154/checks) son la autoridad del gate de CI, incluidos los cuatro jobs de Planner Engine CI. El estado local del JSON es `LOCAL_PASS_CI_CHECKS_REQUIRED`: no inventa una conclusión de CI antes de que termine ni sustituye ese gate por verdes focales.

Sin otro PR, merge ni publicación. Cero escrituras remotas; todos los cambios de rol y ensayos de datos se realizan en servicios locales descartables.
