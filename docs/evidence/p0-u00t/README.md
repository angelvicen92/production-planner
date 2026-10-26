# P0-U00t — ensayo previo a publicación 103 → 115

Base autorizada: `3ade5d2774584f92f86b2b8670bbb3f19fc5f83c` (#1197).
**Gate local completado:** SQL e integridad, recorridos nativos, A2 y reparación focal verificados. La CI alojada se registra en el PR y en `checks/`.

## Alcance y representatividad

El ensayo aplica los SQL literales de `main` a PostgreSQL **17.11**, imagen fijada por digest en los harnesses existentes. La referencia productiva comunicada es PostgreSQL 17.6: se comparte major, no se afirma identidad de minor ni de catálogo real. Auth y PostgREST también usan las imágenes fijadas existentes. Los recorridos finales usan Node 20.19.5.

Se reconstruyen 001–103 una sola vez, se persisten datos históricos y **después** se aplican 104–115 secuencialmente. No se reaplica una migración anterior al punto de partida. Los archivos 001–115 permanecen literales. El ensayo no ejecuta el preparador oficial de Replit ni acredita un respaldo productivo.

El fixture público `seedA2HistoricalRehearsal` conserva su import original: una jornada 088 con 266 tareas/11 checkpoints y otra sin configuración Next con 333 tareas. Se añaden registros **sintéticos explícitos**, válidos bajo 103: una validación, una excepción STALE, evento de ejecución, lock, run y una segunda sesión con S0 y Draft distinto. Total inicial: **2 planes, 599 tareas, 12 checkpoints, 2 revisiones, 2 sesiones, 19 participantes, 9 recursos diarios, 31 snapshots de plantilla**. La ejecución legacy incluye una tarea `done` sin modernizar sus timestamps.

No es una copia ni una aproximación fila a fila de los siete planes reales. Las autoridades y hashes de lectura están en [authorities.json](authorities.json). Los fixtures nuevos se crean por producto; las inserciones SQL de preparación sólo representan estado previamente persistido, y los ataques SQL se revierten.

## Migraciones, inventario y catálogo

[SQL del ledger puro](sql/raw.json.gz) y [SQL con seguridad preparada](sql/prepared.json.gz) contienen `catalogs.json.gz` descomprimido como objeto JSON, inventarios 103/115 y el resultado de cada paso. Cada catálogo incluye columnas/defaults, funciones y cuerpos efectivos, triggers, constraints, RLS, privilegios efectivos por tabla/columna/secuencia/función, roles y ACL por defecto. El manifest identifica el bootstrap PostgreSQL existente y el helper ejecutado.

| Migración literal | Cambio autorizado observado | Integridad original 103 |
| --- | --- | --- |
| 104_operation_continuity.sql | Grupos, snapshot y overrides de continuidad | PASS |
| 105_new_day_planner_configuration.sql | Configuración futura y perfil diario nullable | PASS |
| 106_itinerant_physical_composition.sql | Composición física, snapshots y permisos explícitos | PASS |
| 107_assisted_post_bootstrap_additions.sql | Captura y reconciliación S0 | PASS |
| 108_assisted_participant_meal_validation.sql | Validación material de comidas | PASS |
| 109_new_day_meal_template_identity.sql | Identidad de plantilla de comida, sin backfill | PASS |
| 110_nominal_resource_integrity.sql | Integridad nominal | PASS |
| 111_typed_nominal_resource_integrity.sql | Integridad nominal tipada | PASS |
| 112_main_nominal_resource_integrity.sql | Integridad nominal Main | PASS |
| 113_assisted_post_stage_additions.sql | Transiciones y origen operativo | PASS |
| 114_daily_round_synchronization.sql | Autoridad diaria de rondas nullable | PASS |
| 115_daily_required_technical_chains.sql | Cadenas REQUIRED y compatibilidad 088 | PASS |

Después de **cada** SQL se comparan todos los contadores y SHA-256 de las filas proyectadas sobre **todas las columnas originales de 103**, incluidos views, revisiones, fingerprints, replays, snapshots, validaciones, excepciones, eventos, locks y provenance. Los inventarios 103 y 115 son idénticos. Las políticas RLS existentes permanecen idénticas; se registran las nuevas, todos los grants y los cuerpos cambiados. La compatibilidad DDL del siguiente paso se demuestra aplicándolo, no sólo mediante el checker estático.

113 inicializa exclusivamente sus columnas nuevas de origen desde el Stage activo. Se comprueba el snapshot/fingerprint de ese origen, transición NULL y preservación del Draft sucio original. No se adoptan perfil Next, composición física, rondas ni cadenas en las jornadas anteriores; permanecen NULL. El nuevo override de continuidad es `[]`. No se reescribe 088.

## Dos baselines de seguridad, sin confundirlos

El ledger puro y el bootstrap histórico A2 son autoridades de preparación distintas:

- **Ledger puro:** un JWT `authenticated` sin rol funcional puede leer **599 tareas en 103 y las mismas 599 en 115**. Las políticas permisivas proceden de 001; el upgrade no las amplía ni las corrige. El inventario final coincide exactamente con `data-api-privileges.json`.
- **Perfil A2 preparado:** se aplica el `script/demo/sql/security.sql` existente **antes de 104**, con sus quince grants SELECT y políticas restrictivas registrados literalmente. El mismo actor ve **0 filas en 103 y 0 en 115**. El contrato esperado incorpora exactamente esos grants; no se modifica el fixture canónico del ledger puro.
- **New day** usa su perfil original de ledger puro y su auditor original, sin eliminar la comparación exacta de permisos. La matriz completa Data API usa el perfil preparado: siete actores, cambios/revocación de rol con el mismo JWT, lecturas, PATCH directo y delegado interno; las escrituras no autorizadas no cambian filas.

No se presupone que el Supabase real tenga el segundo perfil por registrar la migración 103. Su catálogo/RLS debe contrastarse en la operación posterior. No se aplica `security.sql` a producción desde este trabajo.

## Defecto encontrado y delta mínimo

**X:** consultar una jornada legacy sin Next crea pausas persistidas. **Y:** `GET /api/plans/:id` llama a `storage.syncPlanMealBreaks`, que toma espacios del catálogo global cuando falta autoridad estructurada. **Z:** una lectura, incluso de VIEWER, altera el estado histórico sin edición explícita. **W:** retirar esa llamada del GET; conservar la sincronización existente de creación y edición explícita. **M:** la misma lectura devuelve HTTP 200 y conserva todas las filas.

[Antes](before/legacy-read/receipts.json.gz): el método literal anterior a 104 (`21f9b6c`) y el GET de la base generan las mismas **46 pausas** sobre entradas sintéticas equivalentes. La comparación del método anterior se ejecuta contra PostgREST local en el esquema actualizado, no se presenta como un despliegue del servidor antiguo sobre 103. El gate estricto de historial termina en FAIL; también lo reproducen REQUIRED y A2 completo con ejecución del baseline.

[Después](after/legacy-read/receipts.json.gz): el método antiguo sigue creando 46; el GET reparado conserva **0 → 0**. Los hashes de todas las tablas de ambas jornadas históricas coinciden antes/después. La aserción estricta de preservación permanece intacta. El impacto potencial afecta a jornadas reales sin Next con pausas incompletas o nuevos espacios globales; no se afirma que sus filas estén en ese estado ni qué SHA esté desplegado. El único delta productivo está en `server/routes.ts`: elimina la escritura incidental de la lectura. No cambia solver, contrato API, migraciones, autoridades, budgets ni timeouts.

## Compatibilidad, producto y negativos

[Regresión SQL de #1197](sql/u00s-compatibility.json.gz), ejecutada sin cambios: replay literal `{"contractVersion":1}` 088 aceptado incluso con otro source; snapshots/fingerprints/lectores originales idénticos; replay nativo coherente con cadena inexistente rechazado por wrapper y delegado; source histórico falso, CAS e intento de editar 088 rechazados; rollback integral. Es una regresión adicional 114→115; no sustituye el ensayo poblado 103→115 anterior.

| Recorrido reutilizado sobre 103 actualizado | Resultado |
| --- | --- |
| U00n: altas, participantes, propuestas, Draft, validación, Stage, rollback/redo y ramas | PASS; 2 jornadas, 6 Stages; verificador original 118 comprobaciones |
| U00p: rondas, preparación, CAS/actores, admisión posterior y continuación | PASS; 2 jornadas, 7 Stages, 6 sincronizados y 40 rechazos materiales |
| U00r: equipo byItem y continuación inferida con prefijos protegidos | PASS; 2 jornadas 4/4, 6 Stages; prefijos de 2 y 1 tarea |
| U00s: REQUIRED explícito, dominio imposible, certificados y negativos | PASS; 4 jornadas, 6 Stages; una jornada NO_PROPOSAL por dominio físico vacío |
| New day: readiness/preflight, creación UI, configuración efectiva, Assisted → Stage | PASS; 2 jornadas UI, 4/4 y 9/9; contrato de permisos exacto del ledger puro |
| A2 completo por UI/API, validación manual, rollback/redo, ejecución y locks | PASS; 266/266, 11 Stages, validación manual/excepciones, ejecución y roles; ambas jornadas previas intactas |

Las comparaciones incluyen filas históricas completas después de operar las nuevas jornadas. Los negativos mantienen permisos, fuentes obsoletas, CAS, ejecución `done/in_progress`, excepciones ACTIVE/STALE/SUPERSEDED y verdad `hardValid=false`. Se conservan los límites de U00p/U00r/U00s: no se certifica el producto cartesiano de topologías no soportadas ni se convierte UNSUPPORTED en regresión.

## A2, determinismo y clasificación de intentos

[A2 comparativo](a2/comparison.json): candidato y repetición en procesos Node 20 nuevos, **266/266, 11 Stages, 27.049 ramas**, fingerprint **`2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`**. Reports completos iguales al candidato integrado U00s salvo `iterations[].durationMs`; snapshots y certificados idénticos, **22 certificados revalidados**. Los originales comprimidos se conservan. Este gate de motor no usa SQL; el recorrido A2 UI/API aporta la prueba sobre la base actualizada.

Los intentos iniciales no se convierten retrospectivamente en PASS. El baseline falla por mutación legacy; un intento REQUIRED devuelve `STALE_CONFIG_SOURCES` en vez de alcanzar el rechazo por decisiones protegidas: la ruta mapea 55P03/40P01 y se repite literalmente. El intento New day contra el perfil A2 preparado falla correctamente su contrato de grants; se repite con el perfil original del harness. Los errores iniciales de preparación de fixtures y la restricción IPC de `tsx` se distinguen de fallos de DDL/producto. Ninguna aserción de los recorridos existentes, presupuesto ni timeout cambia.

ASST-010 permanece como fallo histórico documentado por U00s (`ASSISTED_SCOPE_INCOMPLETE` / `SEARCH_TIME_LIMIT_REACHED`), separado del A2 completo certificado. No se usa para declarar inviabilidad ni se optimiza búsqueda en esta unidad. El detalle de intentos y comandos está en [validation.json](validation.json) y `checks/`. Los verificadores originales de U00n/U00p pasan; los replays fríos de estos recibos pasan 5/5 (U00s), 10/10 (U00r) y 4/4 (U00p), y los cinco tests SQL/preflight focales pasan. TypeScript de producto/harness, build y secuencia de migraciones pasan.

## Reproducción

Requiere el checkout con historial Git, dependencias exactas del lockfile, Docker local y Chromium. Los runners excluyen las variables Supabase heredadas y rechazan hosts distintos de 127.0.0.1; destruyen exclusivamente sus contenedores. Sus únicos cambios de dispatch/bootstrap se realizan en archivos dentro de un archivo Git descartable; las migraciones se leen literalmente. Los manifests y copias comprimidas del harness identifican esas modificaciones.

```sh
npm ci
npx --no-install playwright install chromium
node --import tsx docs/evidence/p0-u00t/sql.ts /tmp/u00t-raw
node --import tsx docs/evidence/p0-u00t/sql.ts /tmp/u00t-prepared --prepared
node --import tsx docs/evidence/p0-u00t/run.ts /tmp/u00t-read legacy-read
# Ejecutar secuencialmente, con directorios nuevos:
node --import tsx docs/evidence/p0-u00t/run.ts /tmp/u00t-required required
node --import tsx docs/evidence/p0-u00t/run.ts /tmp/u00t-additions additions
node --import tsx docs/evidence/p0-u00t/run.ts /tmp/u00t-rounds rounds
node --import tsx docs/evidence/p0-u00t/run.ts /tmp/u00t-prefix prefix
node --import tsx docs/evidence/p0-u00t/run.ts /tmp/u00t-newday newday
node --import tsx docs/evidence/p0-u00t/a2-stack.ts /tmp/u00t-a2-http full
python3 docs/evidence/p0-u00t/a2.py /tmp/u00t-a2 --node /ruta/a/node20
python3 docs/evidence/p0-u00t/verify.py
```

La CI añadida repite el SQL poblado y la lectura histórica; el estado alojado se documenta al observar el candidato. La base conserva sus siete contextos de CI distintos verdes (ocho recibos por una repetición de baseline). Los runners A2 sustituyen sólo el ensayo previo 099→100 del harness por el punto de partida 103, evitando su reaplicación idempotente de 100; conservan la matriz de actores, los recorridos de producto y el contrato exacto de permisos. Los lectores JSON, manifests y resúmenes bastan para revisar los recibos sin publicar trazas, logs privados, JWT ni dumps de datos.

## Aptitud y límites para la operación real

El lote literal 103→115 y el candidato reparado superan el gate técnico local: doce SQL, invariantes históricos, recorridos nativos y A2 exacto. La aceptación final exige también CI verde. El GO de seguridad aplica al perfil preparado verificado; un estado real con sólo las políticas permisivas del ledger puro es NO-GO para aislamiento por rol y necesita diagnóstico/autorización operativa separado. No se convierte este ensayo en un GO de publicación.

Antes de cualquier operación real siguen pendientes: contrastar esquema/cuerpos/grants/RLS y drift de 103 con estos baselines; verificar las formas de datos/revisiones y capturas históricas reales; confirmar SHA aprobado/CI y SHA desplegado, actualmente no demostrado; obtener respaldo productivo recuperable según la guía vigente; aplicar el lote aprobado y verificarlo antes de publicar. Sesiones históricas sin captura de fuentes no reciben una reconstrucción inferida para admitir altas: conserva el límite explícito existente.

**El respaldo productivo, las migraciones reales y la publicación Replit siguen siendo operaciones posteriores separadas.** Ninguna se ejecuta ni se declara preparada aquí. No hay merge automático.
