# Reproducción y alcance

```sh
npm run check
npm run check:migrations
npx --no-install tsc -p docs/evidence/p0-g03/tsconfig.json
node --import tsx --test server/requiredPhaseComposition.spec.ts server/fixedItinerantPhaseComposition.spec.ts server/composedAnchoredRequired.spec.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-g03/run.ts work/g03-fresh
python3 docs/evidence/p0-g03/crosswalk.py work/g03-fresh/native
```

El runner reutiliza `script/demo/smokeNewDayIntegration.ts`: archiva el head, copia/verifica el código del checkout y cambia sólo el dispatch del journey y el cacheDir de Vite en el archivo descartable. Borra las variables de Supabase/DATABASE heredadas y fija servicios nuevos en 127.0.0.1. No escribe en servicios remotos. El manifiesto vincula fuentes y ledger; la copia ejecutada conserva los consumidores productivos sin cambios.

La inicialización heredada crea Auth y sus roles por el procedimiento de bootstrap del harness. **Todas las escrituras de datos de la aplicación de este nuevo recorrido se originan en controles de Chromium.** `ui-writes` registra método, path, payload y respuesta; incluye los POST automáticos de bootstrap-role emitidos por la aplicación al navegar. No hay `page.evaluate` para modificar estado, interceptación de rutas, edición DOM, mocks de readiness ni escrituras API fuera del navegador. SQL de comprobación sólo consulta; el assert causal se invoca en READ ONLY y se revierte la transacción.

No se repiten G01/G02/U02d UI/Auth/SQL completos: se reutilizan sus recibos y la CI verificada del baseline. Los 14 tests existentes de composición pasan y conservan sus negativos. El nuevo recorrido verifica los datos efectivamente producidos y la frontera; el contrafactual no ejecuta búsqueda ni persiste configuraciones alternativas. No procede medir Assisted/propuesta/Stage cuando la autoría se corta antes.

Los archivos públicos se empaquetan con sus SHA-256. Nunca se versionan `app-private.log`, credenciales o cookies. Los errores de desarrollo del harness se enumeran en `attempts.json`, separados del resultado productivo; un locator equivocado no cuenta como bloqueo de OptiPlan.

`crosswalk.py` verifica 266 filas/31 familias contra la tabla de la Fuente 06, hace join semántico sin IDs históricos y comprueba identidad/duración/disponibilidad de cada fila creada. Conserva como pendientes todas las autoridades no declaradas: comparación escalar no equivale a igualdad semántica completa del EngineInput. La fila `stage_sql_contract` enlaza Evidence previa, mientras `stage_sql_new_a2` permanece NOT_REACHED.

La CI del nuevo workflow reproduce este diagnóstico y publica los JSON/capturas públicos, sin logs privados. La CI viva del PR se consulta después del push; no se confunde la CI de G02 con la del candidato G03.
