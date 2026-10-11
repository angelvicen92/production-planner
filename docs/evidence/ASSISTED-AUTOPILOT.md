El botón **Completar automáticamente** continúa la sesión Assisted desde su Stage activo. La confirmación inicial delega únicamente etapas con propuesta completa y certificada, validación limpia y ninguna alerta pendiente de decisión. La autoridad de aceptación sigue siendo el endpoint existente, con el usuario autenticado y `confirmation="NONE"`.

`shared/assistedAutopilot.ts` coordina lecturas actuales, `next-scope`, propuesta con `includePrerequisites=false`, polling del run persistido, apply al Draft, validación y aceptación. Cada operación usa fingerprints y Stage base de la lectura correspondiente. El controlador comprueba la revisión de configuración, la identidad del run, las certificaciones productivas y el avance persistido; compara literalmente las tareas aceptadas, recursos, bloques, comidas y preparaciones. La completitud requiere que el selector confirme ausencia de alcance, que no queden obligaciones elegibles y que el catálogo y las ubicaciones persistidas coincidan con el Stage aceptado.

La UI sólo ofrece el inicio a `admin` y `production`, con Stage activo y Draft idéntico a su base. Los endpoints conservan la autorización real del servidor. La propiedad de una ejecución por jornada impide dobles inicios dentro de la pestaña; los contratos optimistas y la transacción existente resuelven otras pestañas y usuarios. Ninguna mutación se reintenta. La detención termina la etapa actual; el desmontaje impide emitir operaciones posteriores, conservando una aceptación ya enviada que llegue tarde.

La búsqueda síncrona existente puede ocupar el servidor durante más de una lectura HTTP. El controlador vuelve a observar un GET abortado durante el polling, utilizando `isPlanningRunStale`, sin cambiar timeouts HTTP, presupuestos ni timeouts del motor. Un error HTTP autoritativo, run fallido, cambio concurrente, observación obsoleta o validación no limpia detiene la ejecución. La propuesta y su Evidence permanecen en el planning run existente y su identificador se muestra en el progreso.

La primera versión requiere mantener abierta la pestaña. Una recarga entre etapas permite delegar nuevamente desde el checkpoint persistido. Si se cierra durante una etapa después de apply, se conserva el Draft sin aceptar para revisión del operador. No se ejecutan resets, cancelaciones ni rollbacks automáticos.

La [Evidence verificable](ASSISTED-AUTOPILOT-EVIDENCE.json) contiene hashes del código, peticiones reales sin credenciales, comparación con el baseline manual actual, IDs de runs, validación canónica, protección del historial, persistencia y determinismo. El ensayo de Autopilot usa PostgreSQL, GoTrue, PostgREST, HTTP del producto y Chromium sobre una base local descartable. Los checkpoints provienen exclusivamente de Stages aceptados mediante el flujo real.

Reproducción del gate nativo completo:

```sh
npm run demo:a2:smoke -- work/a2-integration --full --stage-order --autopilot
```

En entornos con Chromium del sistema se puede seleccionar su ejecutable mediante `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. CI instala el navegador de Playwright y ejecuta los tests focales, ambos órdenes existentes y los escenarios del botón. Los ensayos de Autopilot cubren S0 hasta 266/266, continuación desde S5, parada, recarga, reanudación, doble clic, consentimiento rechazado y repetición determinista desde el mismo checkpoint. La validez canónica es el gate; la igualdad de horas con el baseline se registra como Evidence.

Se verificaron 105 tests focales, 26 de importación A2, 2.852 de producto, TypeScript del producto y del ensayo, build, secuencia de migraciones y dos ejecuciones idénticas del benchmark canónico. Las dos variaciones de orden nativas existentes también pasaron. Los resultados de CI remoto se consultan sobre el head publicado.

El checkout local autorizado es `work` sobre `3f6f2379d5b7515917d78a9e269dd7c6fbbb504b`. La base remota verificada es `8b030df7389cd8e860f6c8b31184739dff989994`, que conserva el SQL de colores de #1108. La publicación aplica exclusivamente el delta Autopilot sobre esa base. Permanecen pendientes la adopción sobre el catálogo Supabase conectado, el runtime publicado de Replit y el transporte Realtime; la integración local no certifica esos entornos. No se realizó merge.
