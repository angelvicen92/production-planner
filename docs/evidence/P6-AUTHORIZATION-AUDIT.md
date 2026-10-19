# P6 — auditoría causal de autorización y lectura del run

**Estado histórico del head `c0ad6dd`: diagnóstico, sin corrección de producto.** La continuación autorizada aplica y valida la [corrección del contrato de roles](P6-AUTHORIZATION-CORRECTION.md). Este informe conserva la Evidence y las limitaciones del diagnóstico original.

Head auditado `e7cf5a2b81905599fa9077a12648add622dbe9ac`; base `c1b3305b792e75d1409740e2893b3fd137ea6933`. Se continúa la misma rama y PR. No se modifica P7, producto, autorización SQL/backend, motor, presupuestos, timeouts ni configuración efectiva.

La validación anterior de Control Room no cubría el recorrido largo de Autopilot. Sus resultados no constituyen un gate completo. Esta unidad aplica la condición del prompt: «Si las dos causas no están aisladas, devolver diagnóstico y Evidence antes de introducir más código». Se añade únicamente diagnóstico del lector HTTP nativo y su artifact de CI; **el hook global todavía conserva el cambio problemático de P6**. No se presenta una corrección o comportamiento posterior que aún no se ha implementado.

## Incidencia A: regresión de autorización demostrada

### Recorrido exacto

1. `AuthProvider` obtiene la sesión y llama POST `/api/bootstrap-role`. `requireAuth` valida el token con GoTrue. Bootstrap consulta `user_roles`; una cuenta de Producción ya asignada conserva su rol. `/api/me/role` lo confirma desde `server/authz.ts::getUserRole`.
2. `useUserRole` en la base usaba `['/api/me/role']`, sin polling propio, y devolvía el último `query.data?.role` aunque una reconfirmación fallase. P6 añadió actor/AbortSignal/polling de 30 s y devolvió null ante **cualquier** `query.isError`.
3. Assisted copia cada render a `authorized.current = role === 'admin' || role === 'production'`. Autopilot recibe `authorized: () => authorized.current`, no una captura fija de la autorización inicial.
4. `AssistedAutopilot.call()` ejecuta `check()` antes y después de cada llamada y espera. `check()` en `shared/assistedAutopilot.ts:123` es el único emisor de `UNAUTHORIZED` en el recorrido inspeccionado; el servidor no contiene ese código.
5. Autopilot solicita scope y POST `/assisted/proposals`; el servidor autoriza la petición y devuelve 202 con runId. `AssistedProposalService` inicia su ejecución síncrona mediante defer/queueMicrotask. Durante la búsqueda, el mismo proceso HTTP no puede atender las consultas ordinarias con normalidad.
6. El GET periódico del rol empieza durante ese intervalo. `apiRequest` conserva su timeout ordinario de 20 s. El GET aborta, React Query entra en error y P6 devuelve null, retirando `authorized.current` aunque no exista revocación real.
7. En el siguiente `check()` el controlador se detiene con `UNAUTHORIZED`, antes de aplicar/validar/aceptar una etapa. El mensaje compartido de permisos no acredita un 401/403 del servidor.

### Pruebas contra los dos intentos de CI

Run [39256905113](https://github.com/angelvicen92/production-planner/actions/runs/39256905113):

| Intento | Job Autopilot | Resultado |
|---|---:|---|
| 1 | 118074988071 | FAILED / UNAUTHORIZED / stage 0 / completed 0 / run 1 |
| 2 | 118093848661 | Mismo resultado; ningún checkpoint aceptado |

Los [artefactos del primer intento](P6-AUTHORIZATION-AUDIT/ci-autopilot-attempt-1.json) y [segundo intento](P6-AUTHORIZATION-AUDIT/ci-autopilot-attempt-2.json) coinciden con dos reproducciones locales del head auditado (Node 24.19.0 y 20.19.5), con Auth/HTTP/Postgres reales y servicios descartables.

La [traza local HTTP](P6-AUTHORIZATION-AUDIT/p6-before-http-trace.json) contiene GET de rol confirmados con 200, después GET periódicos abortados a los 20 s y posterior reconfirmación 200. En las respuestas observadas de rol/Assisted: **cero 401/403 y cero peticiones a accept-stage**. El error local vuelve a ser UNAUTHORIZED, stage 0/completed 0. Una instrumentación adicional de caché de esa reproducción no llegó a instalarse; no se utiliza como prueba. La conclusión se apoya en la traza HTTP, la reproducción nativa, el único emisor del código y el contraste con la base.

Los siguientes archivos son byte a byte iguales entre base y head auditado: AuthProvider, apiRequest, QueryClient, controlador compartido Autopilot, adaptador HTTP del cliente, rutas, apiAuthorization, authz y AssistedProposalService. El delta causal está en el hook compartido, no en una policy del servidor ni una ampliación de permisos.

El contraste nativo con la base se conserva en los JSON de esta carpeta: mismo runner original, Auth real y configuración del A2; sin aplicar el hook P6 ni interceptar respuestas. El test incluye el error de caché de planning que ya tenía el runner, manteniendo autoridad y peticiones HTTP reales. Resultado **PASS** en Node 20.20.2: checkpoints 1/19, 2/38 y 3/46; parada STOPPED y reanudación hasta COMPLETE, 266/266, etapa 11. [Reporte completo comprimido](P6-AUTHORIZATION-AUDIT/main-autopilot-workspace-pass.json.gz) y [resumen](P6-AUTHORIZATION-AUDIT/main-autopilot-workspace-pass.json) y [caché de rol/aceptaciones HTTP](P6-AUTHORIZATION-AUDIT/main-role-and-acceptance-trace.json). El [resumen nativo](P6-AUTHORIZATION-AUDIT/main-native-summary.json) acredita el día anterior, 11 Stages históricos y otras 333 tareas. Es comportamiento de la base, no una validación de P6 corregido.

### Corrección propuesta, todavía no aplicada

Recuperar el comportamiento estable del hook global y trasladar a una consulta exclusiva de Control Room la clave por actor, reconfirmación y cierre ante error. Las cachés de diagnóstico y de autorización global no deben compartir esa política de polling. Confirmar después recorrido completo válido y revocación auténtica con HTTP real; un 401/403 real nunca se convertirá en éxito ni se relajará la autoridad SQL/backend. Esa validación sigue pendiente.

## Incidencia B: fallo de lectura JSON, origen del cuerpo aún no aislado

El job a2-assisted-integration del primer intento (118074987776) falla en `engine must return its result`, pero el [artifact del controlador](P6-AUTHORIZATION-AUDIT/ci-configuration-reader-failure.json) permite reconstruir un fallo anterior:

- `phase=FAILED`, `code='Unexpected end of JSON input'`.
- La última lectura registrada del run tenía status 200. **El artifact no registra el status ni headers de la respuesta que falló al decodificarse**, así que no se afirma que la respuesta fallida fuese 200.
- El run consultado directamente en DB aún estaba `running` y sin resultado. Eso no demuestra que el motor hubiese finalizado y perdido su resultado; la limpieza del ensayo interrumpe los servicios después de fallar la assertion.
- Este ensayo no monta React ni usa `useUserRole`: su controlador tiene `authorized: () => true`, mientras cada petición mantiene Auth/autorización real del servidor. No se atribuye el fallo al hook.
- El lector y el pipeline de servidor/motor no cambiaron entre la base y P6. El reintento 2 pasó el paso «Configuration read with the observed 52 legacy breaks and S0 Autopilot» **sin cambiar el head**. El estado final del resto del job no se confunde con el éxito de ese paso.
- La reproducción local secuencial en Node **20.20.2**, versión de CI, pasó sin cambiar producto: SUPPORTED/266, run success con resultado, primera etapa aceptada, stop y restart; 52 filas legacy, configuración, historia y otras jornadas preservadas. [Lecturas/resultados](P6-AUTHORIZATION-AUDIT/local-configuration-reader-pass.json).

Está aislada la frontera fallida: decodificación HTTP previa a inspeccionar el resultado, separada de la autorización React. **No está demostrado por qué llegó un JSON no decodificable en aquel intento**, ni se afirma competición de recursos, un bug del solver o un fallo concreto de servicios. La intermitencia se observa, pero no identifica por sí sola la causa.

### Instrumentación focal

`smokeA2ConfigurationReadRecovery` mantiene `response.json()`, los timeouts, el error original y todas sus assertions. Si falla la lectura, registra runtime/método/path/status, headers de respuesta permitidos (`content-type`, `content-length`, `transfer-encoding`, `connection`), bytes recibidos y nombre/mensaje redactado del error en `configuration-read-http-failure.json`. No guarda cuerpo, token, headers de petición ni credenciales. No reintenta ni sustituye la respuesta por éxito. El workflow publica ese artifact para que un próximo fallo pueda contrastarse con el run persistido.

## Validación y gate pendiente

PASS del delta diagnóstico: TypeScript general y de integración, build, 6 tests focales de configuración/HTTP y 38 tests de Control Room/autorización. El ensayo nativo de configuración también pasa tras añadir la instrumentación: [lecturas posteriores](P6-AUTHORIZATION-AUDIT/instrumented-configuration-reader-pass.json). La comparación de propuesta/fingerprint antes y después se conserva en [diagnosis.json](P6-AUTHORIZATION-AUDIT/diagnosis.json); no se convierte este verde en cierre de P6. Los JSON adjuntos distinguen resultado previo, reproducción del head, contraste de la base y prueba de configuración. Cero escrituras en Supabase real; sólo servicios locales descartables.

**No se ha cerrado Planner Engine CI ni la validación posterior de una corrección.** Los verdes previos de Control Room y Baseline no sustituyen el gate completo. La corrección del hook, tests de cuenta/revocación de Control Room, Autopilot válido completo y revocación real, matriz Admin/Producción/Aux/Viewer, ejecución, P2B/P3 y Planner Engine CI completo deben ejecutarse sobre el futuro head corregido. No se cambian heurísticas, presupuestos, timeouts o solver para intentar obtener verde.

Reproducción de los dos recorridos originales (Node 20.20.2 en CI), en checkouts separados del head auditado y de la base, con los servicios descartables que crea el runner:

```sh
node --import tsx script/demo/smokeA2Integration.ts work/audit-autopilot --historical-topology --autopilot-workspace
node --import tsx script/demo/smokeA2Integration.ts work/audit-config --historical-topology --configuration-read-recovery
```

En el head auditado Autopilot reproduce el fallo; en la base alcanza COMPLETE. El fallo JSON original no se ha vuelto a reproducir localmente: no se oculta esa limitación ni se simula una solución.

Sin otro PR, merge ni publicación.
