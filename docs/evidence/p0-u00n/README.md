# P0-U00n — altas puras después de Stage

Candidato sobre main `382e7966ea1fe3508978f92cf5afcc05fe3c3157`. [Diseño y límites](design.md). Las Fuentes 01 v5.4 y 04 v2.9, con índice 00 v2.15, incorporan la aclaración de rollback recibida.

El candidato resuelve el contrato de U00m: S0 → propuesta → Draft → S1 → alta real → admisión/revisión → propuesta completa → Draft → S2, conservando la sesión y literalmente S1. La causa X→Y→Z y el delta W→M están en [design.md](design.md). No cambia el motor ni las migraciones 077–112.

## Recibos de producto

[native/receipts.json.gz](native/receipts.json.gz) contiene los JSON originales, indexados por nombre de archivo. [native/repeat-receipts.json.gz](native/repeat-receipts.json.gz) repite el recorrido en otra base vacía. Los manifiestos comprimidos identifican los fuentes ejecutados; [validation.json](validation.json) indexa resultados y hashes. Los IDs siguientes pertenecen exclusivamente a esas bases desechables.

| Jornada | S1 preservado | Alta posterior | S2 aceptado | Revisión vigente |
| --- | --- | --- | --- | --- |
| A, Main/Vocal | Vocal 10:30–10:40; Main 10:40–11:00; Stage 2 | Tarea 4, auxiliar dependiente: 11:00–11:15 | Stage 3, misma sesión 1 | 2 → 5 |
| B, Standalone | Tarea 6, cámara 4: 09:00–09:30; Stage 6 | Participante nuevo y tarea 8: 09:30–10:00, misma cámara | Stage 7, misma sesión 2 | 7 → 10 |

Los saltos de secuencia de revisión proceden de transacciones negativas revertidas; se comprueban parentRevisionId, identidad y replay completos. Las obligaciones que ya estaban pendientes siguen en ambos snapshots. La nueva tarea figura tanto en `proposal` como en `proposedDraftSnapshot`. No se suministra ningún horario al motor.

La interfaz muestra revisión vigente e histórica, revisión de altas, confirmación y resultado: [A revisión](native/A-review.png), [A confirmación](native/A-confirmation.png), [A S2](native/A-S2.png), [B revisión](native/B-review.png), [B confirmación](native/B-confirmation.png), [B S2](native/B-S2.png).

En ambas jornadas se comprueban rollback S2→S1→S0, redo S0→S1→S2, aceptación de una rama alternativa desde S1, archivo del futuro anterior y continuación. Cada restauración mantiene las decisiones exactas del checkpoint y proyecta separadamente las altas posteriores pendientes. S1 completo y su fingerprint original permanecen iguales. La revisión efectiva no retrocede con la provenance histórica.

## Integridad y excepciones

Los recibos `A-*`/`B-*` incluyen rechazos de edición/eliminación, participantes o recursos alterados, dependencias y autoridades ajenas, baseline ausente/incompleto, identidad duplicada, actor sin permiso, CAS/base/config/token/lista obsoletos, propuesta anterior a la admisión y alta entre validate/accept. Las dos conexiones reales ejercitan escritores de tareas/configuración y finalización contra admisión abierta; un fallo inyectado después de escribir revisión/transición verifica rollback integral. Los ataques SQL recalculan hashes y fingerprints: omisión de tarea, movimiento de decisiones protegidas y falsa validez HARD siguen rechazados.

El recibo causal `*-source-comparison-causal.json` demuestra por qué se exige igualdad completa: la contención JSONB antigua aceptaba ampliar arrays anidados. 113 cierra esa vía en los perfiles S0 y post-Stage. No se sustituye `TASK_SET_MISMATCH` por aceptación parcial.

Una excepción HARD aceptada de verdad por administrador permanece aplicable en el mismo linaje y con la misma identidad material después de otra admisión; conserva `hardValid=false`. Una nueva infracción no la hereda. Se comprueban ACTIVE, STALE, SUPERSEDED, cambio de lifecycle entre validate/accept y ramas archivadas. Restaurar contra ejecución `done` o `in_progress` devuelve `RESTORE_EXECUTION_CONFLICT` sin sobrescribirla.

## Regresión y A2

Los diez bundles de [regressions/](regressions/) conservan los JSON nativos completos: Main, Standalone, familias/setup, U00c Main, U00c Standalone, U00g, U00i, U00j, U00l y autorización de catálogo frente a su base histórica. Todos pasan con ledger 116/116 hasta 113, Auth/PostgREST/API reales y cero escrituras remotas; los recorridos de UI utilizan Chromium real. Incluyen Stages manuales, autorización, CAS, configuración, roles, recursos y privilegios. U00g acepta 6/6 y 12/12 con 19 ataques SQL; U00i/j continúan sus jornadas protegidas. El replay frío de U00i sobre U00l conserva fingerprint, trabajo y witness físico sin acceso a red. [regressions/summary.json](regressions/summary.json) relaciona comandos y recibos.

El [A2 comparativo](a2/comparison.json) ejecuta base autorizada, candidato y repetición en procesos Node 20 nuevos y seriales: **266/266, 11 Stages, 27.049 ramas**, fingerprint **`2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`**. Los reports completos, snapshots y certificados coinciden, excluyendo sólo `durationMs` del report. Se revalidan 11 certificados completos por pasada del candidato: **22 entre candidato y repetición**, más 11 de la base, mediante las tres autoridades del auditor existente de `buildA2Demo.ts`. No cambian budgets, timeouts ni límites. [run-a2.py](run-a2.py) reproduce el aislamiento y la comparación.

TypeScript de producto y de los harnesses, build, secuencia de migraciones, **108 tests focales** y **57 tests UI/autopilot** pasan. La suite global sin filtrar ejecutó **3.228 tests: 3.227 PASS y un fallo histórico ASST-010**. Se reprodujo aisladamente en base y candidato, en la misma aserción y por `ASSISTED_SCOPE_INCOMPLETE`/`SEARCH_TIME_LIMIT_REACHED`; [checks/asst010-comparison.json](checks/asst010-comparison.json) y sus logs conservan el diagnóstico. La CI existente ya excluye ese diagnóstico y otro benchmark exploratorio del gate de producto (`planner-engine-ci.yml`); los **3.226 tests de ese subconjunto pasaron** dentro de la ejecución global. No se declara PASS de la suite global sin filtrar ni se amplían budgets para ocultarlo.

La CI nueva repite las dos jornadas y sus negativos sobre el head. [PR #1192](https://github.com/angelvicen92/production-planner/pull/1192) es la autoridad del estado vivo de CI. La CI U00l mantiene sus pruebas nativas actuales y verifica sus recibos históricos contra el fuente integrado al que pertenecen, siguiendo el patrón existente de U00f/h/i/j. Los ataques antiguos U00g/i/j/l se adaptan sólo para registrar rechazos más tempranos (`RUN_ORIGIN_IMMUTABLE`, `STALE_OBLIGATION_SOURCES`); conservan rollback y hashes recalculados. El verificador diagnóstico de U00i comprueba el harness histórico en los objetos Git auditados, sin exigir que el harness actual conserve ese cuerpo.

La primera pasada de CI detectó que el auditor de catálogo seguía exigiendo los siete cuerpos SQL anteriores a 113. Su lista ahora incluye 113 y soporta firmas sin argumentos; sigue comparando cuerpos y permisos íntegros. El test de adopción histórica aplica después las migraciones vigentes y las claves compuestas originales de 077 que omitía su fixture Drizzle. Sus siete tests y la matriz nativa de autorización pasan. [checks/ci-initial.json](checks/ci-initial.json) conserva las causas de esa primera pasada; no hay bypass del preflight. Un intento local U00g agotó la espera de un tab de navegador; la repetición completa pasa con el mismo límite, sin modificar producto ni timeout.

La revisión final añadió un negativo de captura con todas sus claves pero sin una fila histórica. El preview anterior lo permitía; [checks/missing-row-baseline-before.json](checks/missing-row-baseline-before.json) conserva ese RED real. 113 exige ahora el universo exacto del origen y la cobertura de participantes demostrada por tareas/replay antes de proyectar campos aceptados. Ambos recorridos U00n se repiten completos y deterministas con los negativos de filas ausentes; U00c Main/Standalone se repiten con ese guard final. Las otras ocho regresiones conservan sus manifiestos anteriores a esta última comprobación; la CI del PR vuelve a ejecutarlas sobre el head. El A2 no ejecuta SQL y sus consumidores TypeScript permanecen idénticos al comparativo.

## Diff y límites

113 añade transición/origen y freshness, conserva igualdad completa, RLS y permisos; servicios y UI consumen el origen operativo; el productor materializa todo su universo. [authorities.json](authorities.json) registra fuentes leídas y versiones normativas mínimas 00/01/04. [design.md](design.md) describe locks, CAS, proyecciones, excepciones y riesgos.

La admisión requiere altas puras demostrables y Draft limpio. Capturas insuficientes, ejecución/locks protegidos y cambios ajenos se rechazan explícitamente. Los locks breves pueden devolver conflicto; las proyecciones crecen con checkpoints×admisiones. Código/API y migración 113 deben publicarse coordinadamente en una entrega futura. No se ha hecho merge, despliegue ni migración productiva.

## Reproducción local

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node --import tsx docs/evidence/p0-u00n/run.ts /tmp/p0-u00n-fresh
python3 docs/evidence/p0-u00n/verify.py /tmp/p0-u00n-fresh/native
python3 docs/evidence/p0-u00n/verify.py
# Comparativo A2 completo, en Node 20:
python3 docs/evidence/p0-u00n/run-a2.py /tmp/p0-u00n-a2 --node /ruta/a/node20
```

Requiere las dependencias exactas del lockfile, Docker local y Chromium. El harness crea PostgreSQL 17, Auth, PostgREST y API locales, aplica todo el ledger y destruye exclusivamente sus contenedores. No utiliza las credenciales productivas. Las identidades y tareas se crean mediante producto, sin A2 ni horarios entregados al motor. Las pruebas SQL de ataques usan transacciones revertidas; no aceptan Stages mediante bypass.

Los recibos públicos excluyen logs privados, contraseñas y JWT. La confirmación de admisión se realiza en Chromium y conserva capturas de revisión, consentimiento y resultado.
