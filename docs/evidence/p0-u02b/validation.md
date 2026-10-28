# Validación y reproducción

Los recibos públicos comprimidos tienen manifiestos de hashes por archivo. `verify.py` admite directorios de JSON vivos o los archivos comprimidos publicados, y no usa el solver ni la App. `source-binding.json` verifica igualdad de todos los fuentes de runtime entre ambas bases y el checkout entregado.

`native/` y `repeat/` proceden de bases PostgreSQL/Auth/PostgREST totalmente nuevas con ledger 001–125, login real y Chromium. Propuesta, Draft y Stage usan rutas/servicios reales. SQL se relee directamente. El runner sólo modifica dispatch de Evidence y caché Vite en la copia descartable; no guarda un EngineInput ni una propuesta importados. Las capturas por editor se añadieron después, en una tercera ejecución documentada en `visual/`, sin cambiar datos ni decisiones. El archivo auxiliar `control.ts`, no importado por la jornada integrada, se actualizó mientras terminaba la segunda base; se declara ese único delta de harness. Los fuentes realmente ejecutados permanecen comprobados por sus hashes, iguales para las decisiones comparadas.

Se comparan propuestas y Draft completos, recursos, unidades, witness, certificado, todos los contadores work, fingerprint de problema y filas SQL (ID/ordinal/snapshot/fingerprint), sin normalización de horarios o decisiones. READY se comprueba con las tres autoridades efectivas; las capturas son originales de Chromium.

## Ejecutado

- `npm run check`, `npm run check:migrations`, `npm run build` y tsc del harness: PASS. Ledger hasta 125, sin cambios en 001–124.
- Cuatro archivos focales afectados: PASS, incluyendo autoría Main nativa en ambos órdenes y exclusiones no certificadas. La suite global amplía la cobertura de contratos.
- Dos stacks integrados fríos y verificador independiente: PASS, 12 Stages SQL y rechazo seguro del imposible. Desglose de 372 ataques SQL en `negative-results.json`; identidad/protección/autenticidad se distinguen de física.
- Upgrade poblado 124→125: PASS, tablas y lectores exactos, políticas y metadata completa de funciones (owner, ACL, invoker, search_path) idénticas. Se conserva el contrato de privilegios de API y no se adopta autoridad histórica.
- U00a, U01b, U01d, U01f, supporting y lineales: PASS. Comparación adicional de U01f y U01d/U01b contra sus recibos históricos. Los 32 Stages que informa el verificador U01f suman 16 nuevos y 16 históricos; no son 32 ejecuciones nuevas.
- A2 importado: PASS separado, 266/266/11 y snapshots/fingerprint históricos exactos.
- Global: 3.305/3.306. Único fallo ASST-010 en `runA2Assist7Evidence.ts:181`, NO_PROPOSAL / ASSISTED_SCOPE_INCOMPLETE / SEARCH_TIME_LIMIT_REACHED. Archivo limpio de la base exacta `6e6901ad`: mismo fallo, 353 s. No se cambia ni se eleva su límite. **La suite global no es completamente verde.**

CI: workflow nuevo `p0-u02b-main-vocal-required-phase-composition.yml`, más los existentes aplicables. El head y checks vivos del PR son la autoridad del resultado remoto; no se deduce CI de los gates locales.

## Reproducción

Dependencias instaladas, Docker local y Chromium. Los runners eliminan las credenciales Supabase heredadas y generan servicios/credenciales sólo en loopback. No usar Supabase remoto. Elegir directorios frescos y ejecutar stacks secuencialmente.

```sh
npm run check
npm run check:migrations
npm run build
npm test
npx --no-install tsc -p docs/evidence/p0-u02b/tsconfig.json
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02b/run.ts work/u02b-a
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02b/run.ts work/u02b-b
python3 docs/evidence/p0-u02b/verify.py work/u02b-a/native work/u02b-b/native work/u02b-verification.json
node --import tsx docs/evidence/p0-u02b/upgrade125.ts work/u02b-upgrade
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02b/control.ts work/u02b-u00a p0-u00a
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02b/control.ts work/u02b-u01f p0-u01f
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02b/control.ts work/u02b-u01b p0-u01b
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02b/control.ts work/u02b-u01d p0-u01d
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02b/control.ts work/u02b-linear p0-u00s
node --import tsx docs/evidence/p0-u00n/a2.ts work/u02b-a2
python3 docs/evidence/p0-u02b/verify.py docs/evidence/p0-u02b/native docs/evidence/p0-u02b/repeat work/u02b-published-verification.json
```

`pack.py` archiva únicamente JSON públicos y capturas seleccionadas, revisa que no haya contraseñas/tokens JWT y omite logs privados. Para regenerar toda la entrega espera los nombres/directorios de esta ejecución enumerados en el propio script. Los manifiestos permiten verificar los recibos entregados sin Docker. Los intentos fallidos están separados de los resultados certificados.
