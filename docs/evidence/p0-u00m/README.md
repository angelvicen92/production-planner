# P0-U00m — altas posteriores a S1: gate causal

**Diagnóstico completado; no hay implementación de incorporación post-S1.** Base y `main` remoto verificados: `e03f3476020fc220f9d70f86d6e9b8a05c818eeb`, merge de U00l #1190. Sólo se añaden Evidence y harnesses en este directorio. No se modifica motor, servidor, cliente, migraciones, Fuentes ni lógica productiva. Sin escrituras productivas, merge o despliegue.

El contrato ausente es una **transición explícita del conjunto de obligaciones y su origen de trabajo**, separada del Stage histórico usado para protección y auditoría. Retirar `REBOOTSTRAP_ACCEPTED_STAGE`, actualizar solamente la revisión, ampliar sólo el Draft o reutilizar bootstrap no resuelve ese contrato. [Diseño causal y decisión pendiente](design.md).

## Recibos

[native/receipts.json.gz](native/receipts.json.gz) es un mapa `nombre.json → contenido original`, con ambos recorridos completos: fuentes antes/después, configuración efectiva, EngineInput/identidad/replay, S0, propuesta, Draft, validación, S1, alta API, preview/confirmación rechazada, runs, historial/timings, rollback/redo, SQL y contrafactuales. [La repetición independiente](native/repeat-receipts.json.gz) conserva el segundo stack completo. [manifest.json](manifest.json) contiene hashes de **todos** los archivos productivos de base; [authorities.json](authorities.json) identifica las autoridades contrastadas con `main`, el merge real y los artefactos A2 protegidos. Los logs privados, contraseñas y JWT locales no se versionan.

| Día | Topología propia | S1 aceptado | Alta genuina posterior | Resultado observado |
| --- | --- | --- | --- | --- |
| A | Main/Vocal, coach explícito, dependencia vocal→main, otro trabajo pendiente | Vocal 10:30–10:40 y Main 10:40–11:00; tasks 1/2, pendiente 3 | task 4, auxiliar de 15 min dependiente de Main; mismo participante | Snapshot S1/Draft conserva {1,2,3}; EngineInput/daily pasan a {1,2,3,4}. Rechazo post-S1. La sonda calcula 11:00–11:15 sin mover S1, pero el productor omite task 4 del snapshot |
| B | Standalone, dos participantes, dos espacios, cámara física exclusiva compartida | Captura 09:00–09:30, task 5; pendiente 6 | task 7, otra captura de 30 min, otro participante/espacio, misma cámara | Snapshot conserva {5,6}; EngineInput/daily pasan a {5,6,7}. La sonda coloca 09:30–10:00 con la misma cámara, conservando S1, pero el snapshot omite task 7 |

Son jornadas nuevas, tareas reales con IDs generados, sin A2, horarios iniciales aportados ni locks artificiales. Todas las tareas siguen `pending`. Plantillas, catálogos, configuración general, días, participantes y tareas se crean mediante APIs de producto. Chromium inicia sesión y captura la frontera de incorporación bloqueada: [día A](native/A-post-S1.png), [día B](native/B-post-S1.png). La primera propuesta, aplicación, validación y aceptación se realizan mediante las APIs reales; no se presenta el experimento como un recorrido de clics completo.

## Cadena demostrada

1. Antes de añadir, S0→S1, rollback S1→S0 y redo S0→S1 funcionan con restauración exacta. La aceptación consolida `daily_tasks`; aplicar la propuesta sólo había cambiado el Draft.
2. El alta posterior mantiene literalmente sesión, revisión persistida, S1 y Draft. Las fuentes anteriores permanecen iguales y sólo aparece una nueva fila diaria sin horario. La autoridad efectiva cambia su fingerprint; el número de revisión persistido **no se actualiza por esa alta**.
3. `GET bootstrap-additions` da `allowed=false / REBOOTSTRAP_ACCEPTED_STAGE`; confirmación POST devuelve 409 con la misma causa. Función: `assisted_preview_bootstrap_additions`, migración 107. Es una barrera intencionada del perfil S0.
4. Pedir scope con task nueva falla al insertar el run por `assisted_guard_new_run_session`: la identidad no pertenece al Draft. Pedir un scope antiguo puede crear un run, pero `AssistedProposalService.run` lo termina con `STALE_CONFIG_REVISION` al comparar autoridad efectiva con revisión persistida. Validar por API falla por la misma comparación.
5. Contrafactual sin persistencia: inyectar únicamente la identidad antigua en la comparación permite al motor proponer la obligación nueva y preservar los placements. Sin embargo, `proposedDraftSnapshot` se construye con `baseSnapshot.tasks.map`, por lo que **pierde la tarea nueva**. No es evidencia de S2 válido ni de capacidad productiva habilitada.
6. Ampliar únicamente el Draft produce `DIRTY_DRAFT` en `request`, porque su fingerprint ya no coincide con el Stage base. El patch SQL manual impide ampliar IDs con `TASK_SET_MISMATCH`. Propuesta y snapshot deben compartir también el conjunto exacto del Draft.
7. Una propuesta vieja ya calculada puede aplicarse al Draft bajo revisión persistida aún igual. No comprueba por sí sola la autoridad efectiva actual. Con validación SQL antigua certificada, la aceptación termina en `TASK_SET_MISMATCH`; todo el intento se revierte. Cambiar revisión o fingerprint del Draft hace esa propuesta inaplicable por `STALE_CONFIG_REVISION` o `STALE_DRAFT`.
8. Después del alta, rollback a S0 falla en `assisted_apply_snapshot` por `TASK_SET_MISMATCH`. Una sonda aislada que sitúa el cursor en S0 demuestra el mismo bloqueo en redo a S1. No se modifica ningún snapshot histórico.
9. Ablación SQL exacta, temporal y revertida: retirar sólo la condición S1 revela `REBOOTSTRAP_PENDING_PROPOSAL`; retirar también esa condición revela `REBOOTSTRAP_TASK_CHANGED_OR_REMOVED`. El comparador de bootstrap trata los placements consolidados por S1 como diferencias respecto a las fuentes capturadas en S0. Las propuestas de S1 ya aceptadas también siguen entrando en su consulta de resultados PROPOSAL. Son contratos S0, no errores que deban borrarse para post-S1.
10. La sustitución experimental `CLOSED + bootstrap` dentro de una transacción preserva S1 y registra `previous_session_id`, pero crea S0 nuevo y deja fuera de su historia operativa el Stage anterior; rollback a éste devuelve `INVALID_STAGE_TARGET`. La transacción se revierte. Un enlace de captura no constituye linaje Assisted ni herencia de excepciones.

Los negativos con funciones sin modificar comprueban propuesta `running`, modificación de tarea y tarea `done` antes de S1, para observar sus causas sin el enmascaramiento del gate de Stage. Después de S1 se conservan además sus sondas específicas y el gate prioritario. CAS, token de fuentes obsoleto y contención real entre dos conexiones (`55P03`, NOWAIT) están registrados. No se atribuye al comparador post-S1 una clasificación que no ejecuta.

## Validación y reproducción

Se usa el stack existente de PostgreSQL 17/GoTrue/PostgREST con imágenes fijadas por digest y ledger completo hasta 112: **115 archivos históricos**. Sólo se sustituye el dispatch del harness en un `git archive` descartable, con texto y hashes exactos en el manifest. Las dos ablaciones SQL viven dentro de `BEGIN/ROLLBACK`; no se relajan `TASK_SET_MISMATCH`, triggers ni permisos. Ningún S2 se acepta mediante bypass.

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node --import tsx docs/evidence/p0-u00m/run.ts /tmp/p0-u00m-fresh
python3 docs/evidence/p0-u00m/verify.py /tmp/p0-u00m-fresh/native
```

Requiere dependencias exactas del lockfile, Docker local accesible y Chromium. Usar una ruta nueva y ejecutar stacks secuencialmente. Para repetición independiente, ejecutar de nuevo en otra ruta y pasar ambas carpetas `native` al verificador. El verificador sin argumentos comprueba los recibos versionados, hashes productivos y autoridades. [validation.json](validation.json) registra resultados objetivos y determinismo.

- 96/96 tests focales productivos existentes: bootstrap additions, workflow, snapshot, clean validation, proposal service, accepted baseline, fidelidad manual, autorización y revisión efectiva.
- TypeScript del harness y dependencias productivas importadas; checker de secuencia de migraciones; `git diff --check`.
- Dos ejecuciones independientes del harness final, con mismos snapshots, identidades, propuestas y Evidence de trabajo; las sondas SQL quedan revertidas y sus resultados son iguales. Los UUID de Auth, fechas, puertos, tiempos y secuencias consumidas por transacciones revertidas son metadatos de ejecución.
- A2 **no reejecutado**: no cambia ningún byte ejecutable productivo. Se protegen por hash el código completo y los artefactos de U00l que acreditan 266/266, 11 Stages, 27.049 ramas, 22 certificados y fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`.

El `readiness=READY` observado describe representabilidad del input y **no acredita continuidad de la sesión**. Esta Evidence no declara el gate altas→propuesta→Draft→S2 verde. Su aceptación pertenece a la implementación siguiente, una vez resuelta la semántica explícita de rollback entre conjuntos distintos.
