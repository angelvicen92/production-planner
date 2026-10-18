# OPS-P1A — Mi Día operativo

Base: `17dc265c51bb2c7c1e93a28f8d8a05db67e9d7db` (G0, #1146). Rama: `codex/ops-p1-mi-dia-operational`. [Resultados y hashes](OPS-P1A-mi-dia-operational.json).

## Resultado y decisión técnica

Mi Día abre automáticamente el ámbito efectivo del usuario y permite concentrarlo en cada plató/zona o espacio con actividades dentro de ese ámbito. Los nombres de espacios incluyen su plató/zona para distinguir ubicaciones homónimas. La agenda separa En curso, Pendientes, Completadas e Interrumpidas/canceladas; los accesos táctiles saltan directamente a cada grupo. Una asignación por espacios no se amplía al resto del plató al elegir el filtro de zona. Al cambiar de jornada se reinicia el foco, sin persistencia nueva.

La autoridad sigue siendo `execution_context.tasks[].inScope`, `canExecute` y el rol global, con las correcciones G0. Las opciones se derivan de las ubicaciones de las tareas efectivas, no de recursos genéricos, nombres o cantidades. La relación espacio→zona usa el snapshot diario existente (`GET space-availability`), nunca la jerarquía general para reinterpretar el día. Se conserva la consulta global explícita existente; sin ámbito, se identifica como agenda de consulta. Redacción no concede ejecución. Los accesos por fragmento no desactivan automáticamente el ámbito personal.

Cada tarjeta muestra concursante o actividad de equipo, nombre, ubicación de la actividad, ambos extremos previstos y reales, duración activa y recursos nominales efectivos recibidos del contexto de ejecución. Se reutilizan `executionDuration`, `formatExecutionDuration`, reloj, actualización y la única mutación Start/Finish ya existente, con `expectedStatus`, confirmación del servidor e invalidaciones. Un fin real ausente dice «Sin registro», también para una actividad interrumpida.

La anterior de una actividad pendiente y el siguiente destino de una actividad en curso se buscan en **todo el planning recibido**, antes de los filtros visibles. Se usa la geometría prevista: anterior con fin más próximo anterior al inicio; siguiente con inicio más próximo posterior al fin. Los empates se mantienen plurales; los solapes avisan que el recorrido no es único. Una actividad cancelada conserva su estado como antecedente pero no se propone como siguiente destino. Sin concursante, horarios completos o vecinos conocidos se muestra una ausencia explícita. No se deducen dependencias, readiness ni permiso de Start de esta proyección.

«Última ubicación operativa conocida» procede únicamente del último registro temporal completo de ejecución recibido (inicio, fin o pausa), con su actividad y estado. No se infiere del horario previsto ni de tareas pendientes, canceladas o registros futuros. Se muestra expresamente «Ubicación física actual: no confirmada» y que los registros no confirman presencia ni traslados. No hay flujos de movimiento.

## Alcance del diff

- `client/src/pages/my-day.tsx`: composición, foco, grupos y consulta del snapshot espacial diario.
- `client/src/components/my-day/activity-information.tsx`: información común de las tarjetas.
- `client/src/lib/my-day-operational.ts`: proyecciones locales puras.
- Pruebas propias en esas carpetas y esta Evidence.

Sin delta en Control Room/proyección, servidor, DB/migraciones, motor, Planning Workspace, hooks compartidos, contratos shared o scripts compartidos de integración. No se crean estados, horas, métricas predictivas, notificaciones, rectificaciones, configuración temporal ni persistencia. Se conservan los avisos temporales que ya existían; no se añaden semáforos configurables.

Fuentes revisadas: AGENTS.md; 00 v2.13; 01 v5.2 (roles, Mi Día, Vista Plató, móvil); 04 v2.7 (protección y snapshot diario); 05 v2.7 (validación/Evidence); 07 v2.2; Evidence G0 y EJEC-01. La autoridad de producto/ejecución prevalece sobre las inferencias visuales.

## Validación

| Gate | Resultado |
|---|---|
| TypeScript (`npm run check`) | PASS |
| Build (`node --import tsx script/build.ts`) | PASS; avisos existentes de Browserslist y tamaño de bundle |
| Proyección/render de Mi Día | 13/13 PASS |
| Permisos G0, ejecución y middleware HTTP existentes | 11/11 PASS |
| Ensayo focal nativo A2, Auth→HTTP→PostgREST→PostgreSQL + Chromium | PASS |
| Ensayo EJEC-01 existente sin modificaciones | PASS, dos navegadores, sincronización con Control Room, offline y permisos |
| 390×844 móvil / 820×1180 tablet | PASS, sin desbordamiento horizontal ni errores de navegador |
| 266 placements, recursos de planning, Stages y Draft | Preservación literal PASS |
| Otros días de la base descartable | Preservación literal PASS |

El ensayo focal comprueba conjuntos exactos de IDs visibles contra el contexto real para dos platós y para dos espacios de una persona, con selección individual de cada ubicación. Una segunda identidad nominal comparte un espacio y conserva su propio ámbito. Sin vínculo, sólo Redacción y viewer consultan sin botones de ejecución; Start HTTP editorial recibe 403. Se observa el anterior pendiente, en curso y completado; se ejecutan dos actividades simultáneas, interrupción y cancelación, y se verifican sus grupos.

Start y Finish se pulsan desde Mi Día real y generan dos eventos del servidor; los timestamps completos se comparan con PostgreSQL tras recargar. El navegador operador usa `America/New_York` y la presentación sigue Madrid. Los recursos, siguiente destino y aviso de ubicación física se ven tanto en móvil como tablet. La prueba local pura añade empates, solapes del mismo concursante, tareas sin concursante, vecinos ausentes, horarios incompletos, ubicaciones y registros incompletos y no mutación de los inputs/autoridad.

La copia aceptada proviene del fixture público versionado `script/demo/fixtures/a2-legacy-import.json.gz`, 266 tareas y S0–S10; fingerprint `a58fc840fa4b8d04049c96d8310eac6e5d4df66f08069d968fe7a5e0adf9e2dc`. Se certifica lectura y preservación de ese planning aceptado, no una nueva generación del solver ni la configuración A2 posterior. Todas las escrituras del ensayo quedan en servicios loopback descartables. Cero escrituras remotas.

## Reproducción

Desde la raíz, con las dependencias del lockfile instaladas:

```sh
npm run check
node --import tsx --test --test-isolation=none --test-concurrency=1 server/liveExecution.spec.ts server/apiAuthorization.spec.ts client/src/lib/my-day-operational.test.ts client/src/components/my-day/activity-information.test.tsx
node --import tsx script/build.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx client/src/components/my-day/a2-native.test.ts work/my-day-p1a
```

La orden focal necesita Docker y Chromium. El ejecutable puede omitirse si Playwright tiene Chromium instalado. `--test-isolation=none` requiere Node 24 (ensayo local: 24.19.0); en Node 20 se omite esa opción o se ejecutan los archivos con `node --import tsx` individualmente.

Regresión existente adicional: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx script/demo/smokeA2Integration.ts work/my-day-p1a-regression --historical-topology --live-execution-snapshot`.

El punto de entrada focal genera y borra un runner temporal a partir de la infraestructura nativa existente, cambiando únicamente la importación de la prueba de navegador y añadiendo hashes de los archivos propios. No edita los scripts compartidos. El servidor productivo arranca mediante el entry point compartido original. No hay interceptación HTTP, mocks de RPC ni destino remoto configurable. Los logs privados y credenciales efímeras no se publican en Evidence.

## Capturas

- [Móvil: ámbito y grupos](OPS-P1A-UI/mi-dia-mobile-overview.png)
- [Móvil: actividad en curso](OPS-P1A-UI/mi-dia-mobile-running.png)
- [Tablet: dos actividades en curso](OPS-P1A-UI/mi-dia-tablet-running.png)
- [Tablet: actividad completada tras recarga](OPS-P1A-UI/mi-dia-tablet-completed.png)

## Límites

El entorno descartable verifica polling HTTP; no certifica transporte Supabase Realtime/WebSocket real. El fixture A2 no aporta tareas sin concursante: ese caso se verifica en las pruebas focales, sin fabricar obligaciones A2. Se distinguen ubicaciones del planning y última ubicación operativa; no existe confirmación de presencia física en los contratos disponibles. No se publica Replit ni se hace merge.
