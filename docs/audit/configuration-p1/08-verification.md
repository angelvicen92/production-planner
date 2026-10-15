# Verificación, Evidence y límites

## Identidad y no intervención

Base local `621303a3b3e1e3a2d745e35de9db0a0cbd28c7c9`. `git ls-remote` confirmó inicialmente el mismo head para main y codex/configuration-catalog-audit-p1. Checkout local `work`, usado como alias del entorno según AGENTS.md; no switch, reset, rebase ni rama adicional. La entrega sólo añade `docs/audit/configuration-p1` y `script/audit`. No se toca código productivo, dependencias declaradas, migraciones, Fuentes, permisos ni RLS. El PR apunta a main y no se hace merge.

Las herramientas remotas de datos sólo hicieron GET directo a PostgREST. No se llamó a `getPlan` de la aplicación: su ruta puede ejecutar sincronización de comidas, por lo que GET de aplicación no se asumió libre de efectos. No hubo generación/aceptación/rollback/reset ni reparaciones A2. Las dos jornadas mantienen 266 tareas y 266 taskOperations en la lectura.

## Reproducción

Desde la raíz del repositorio, con dependencias locales disponibles:

```bash
node script/audit/configurationSurfaceP1.mjs
node --import tsx script/audit/characterizeConfigurationP1.ts docs/audit/configuration-p1/generated/characterization.json
python script/audit/summarizeConfigurationCatalogP1.py work/configuration-audit/catalog-allowlisted.json
node script/audit/verifyConfigurationP1.mjs
```

El primer comando es estático; el segundo sólo importa contratos/adapters puros y ejecuta asserts sintéticos; el tercero usa una observación mínima ya descargada; el cuarto comprueba artefactos, paths, fuentes, 16 dimensiones, namespaces básicos y conservación de 266. Ninguno importa storage ni inicia el servidor para escribir en DB.

Para obtener **otra** observación de catálogo explícitamente permitida:

```bash
mkdir -p work/configuration-audit
python script/audit/read_configuration_catalog_p1.py --output work/configuration-audit/catalog-allowlisted.json
python script/audit/summarizeConfigurationCatalogP1.py
```

Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya configurados. Nunca imprimir su valor. La allowlist enumera columnas; la herramienta tiene método GET y no usa `select=*`, RPC o cliente de escritura. Los payloads de Stage/replay no se descargan. Revisar la observación antes de reemplazar Evidence versionada: una nueva fecha puede incluir cambios de otras ramas/despliegues. Las observaciones paginadas REST no son una transacción consistente de toda la base; no sirven para certificar integridad destructiva concurrente.

RLS y dependencias SQL: `script/audit/configurationCatalogP1.sql` contiene sólo SELECT de catálogos/policies/grants/FKs y contadores históricos. **No ejecutado aquí**. Completar con conexión SQL autorizada y el estado del despliegue concreto antes de cambiar BLOCKED. Service-role GET no demuestra aislamiento de anon/authenticated ni health de Realtime.

## Resultados

| Comprobación | Resultado y alcance |
|---|---|
| Identidad repo/base/ramas remotas | Coincidente al comienzo; sin cambios de rama |
| Lectura REST de columnas explícitas | PASS; 30 tablas seleccionadas, sin errores HTTP; recuentos y timestamp en catalog.json; 0 escrituras |
| Inventario AST y acciones | PASS; 264 controles y 353 acciones en 42 archivos, 16 dimensiones por fila con gaps explícitos |
| Caracterización diferencial | PASS; 7 sweeps de pesos, aliases, agrupación, candidatos transporte, payload alta/PATCH de plantilla y mapa de roles |
| Grafo relacional offline | PASS de generación; 204 entidades, 7640 aristas tipadas y 32 grupos nominales. 10 referencias a recursos 15/16 sin resolución; no se reparan |
| Primera tanda de tests existentes | 13 archivos PASS; `shared/configurability.test.ts` FAIL preexistente (2 de 4 casos fallan por informe/semántica desactualizados) |
| Segunda tanda focal | 11 archivos PASS; incluye UI estática, Control Room, preflight, itinerancia exacta/comidas, presencia, transporte, cadenas/rondas y meal preference |
| TypeScript de proyecto | PASS: npm run check. Inicialmente faltaba @electric-sql/pglite (ya declarado); se instaló localmente sin cambiar package.json/lock y se repitió tras resolver esa dependencia |
| Scripts/documentos | Node syntax, Python compile, artefactos/links/hashes y `git diff --check`; resultado final registrado en artifact-verification.json |
| Mutaciones UI/DB live, Full A2, S0/HTTP500 | No ejecutadas; fuera del alcance autorizado de auditoría |

Primera tanda exacta (todos salvo registry pasan):

```text
engine/buildInput.taskTemplateSnapshot.spec.ts
engine/planOptimizerSnapshotLegacyAdapter.spec.ts
engine/planner-next/integration/effectiveTaskResourceAssignments.spec.ts
engine/planner-next/integration/engineInputAdapter.spec.ts
engine/planner-next/itinerantUnits.spec.ts
engine/planner-next/mainFlowSoftPreference.spec.ts
engine/planner-next/participantTransition.spec.ts
server/dayConfiguration.spec.ts
server/effectiveConfigurationView.spec.ts
server/planOptimizerSnapshot.spec.ts
server/planOptimizerSnapshotRefreshPreview.spec.ts
server/taskTemplateSnapshot.spec.ts
server/taskTemplateSnapshotIntegration.spec.ts
shared/configurability.test.ts
```

Segunda tanda:

```text
engine/planner-next/integration/engineInputPreflight.spec.ts
engine/planner-next/itinerantUnitMeals.spec.ts
engine/planner-next/exactItinerantPlan.spec.ts
engine/planner-next/resourcePresence.spec.ts
engine/planner-next/transportGrouping.spec.ts
engine/planner-next/technicalChains.spec.ts
engine/planner-next/roundSynchronization.spec.ts
engine/planner-next/mainFlowMealPreference.spec.ts
client/src/lib/control-room-metrics.test.ts
client/src/components/general-program-settings.test.ts
client/src/components/effective-configuration.test.tsx
```

Comando de ambas tandas: `node --import tsx --test --test-concurrency=2 <archivos enumerados>`. El runner informa por archivo; no se presenta «24 tests» como si fueran 24 casos individuales. El registry se reprodujo además con `node --import tsx shared/configurability.test.ts`, que muestra 2 PASS/2 FAIL: informe espera PRODUCTIVE=2 frente al registro=3 y contrato de bloques espera FIXED_COUNT(n) frente a SOFT_PREFER_N/reparto vigente. No se cambian expectativas para convertir la auditoría en una reparación funcional.

TypeScript del nuevo script de caracterización: PASS con tsconfig focal temporal que extiende el proyecto; se corrigieron sólo tipos del script de auditoría. Node syntax y Python compile: PASS. Los seis SELECT del suplemento SQL se ejecutaron con PASS en una instancia PGlite en memoria con fixture mínimo; eso verifica sintaxis, no RLS del entorno remoto. No se cambiaron dependencias declaradas ni se ejecutaron scripts de instalación.

## Certificaciones pendientes explícitas

- Browser real de guardar/recargar/cambiar general/restore por cada campo y rol; no confundir renderToStaticMarkup con journey end-to-end.
- Policies/RLS/grants reales y autorización HTTP por rutas efectivas, especialmente alias de plantillas y ajustes fuera del mapa de roles.
- Referencias dentro de JSON históricos no seleccionados y atomicidad/consistencia de una futura limpieza. Ningún DELETE autorizado.
- Curva diferencial completa de cada control que se quiera conservar en V3/V4; la auditoría Next demuestra cortes de adapter y registra consumidores legacy, no calibra heurísticas.
- Sensibilidad del peso de transporte más allá de candidate generation; no se encontró lector de ranking en Next, por eso sigue sin efecto de optimización demostrado.
- Producto completo de ventanas, composición/reconciliación y coordinación; disponer de solver/preflight no certifica UI general/día.
- Vigencia humana y procedencia de alta exacta de entidades; no se deduce de status draft ni de prefijos.

## Cómo actualizar este informe

Mantener la base y las observaciones históricas identificadas. Una nueva implementación debe añadir Evidence propia y cambiar la conclusión por campo, no borrar el hallazgo histórico. Volver a generar el inventario exige revisar sus perfiles conservadores y los casos dinámicos (tres pesos diarios, ventanas start/end, requisitos por tipo/entidad y Choice de War Room), no sólo actualizar un contador. La caracterización está anclada a P1 y deberá cambiar si cambia intencionalmente el contrato; no es un test que obligue a conservar un bug para siempre.
