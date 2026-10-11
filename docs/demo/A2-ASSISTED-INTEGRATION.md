# Ensayo Assisted A2 en la aplicación

Continuación de [#1105](https://github.com/angelvicen92/production-planner/pull/1105), rama `codex/optiplan-a2-import-demo`. El informe ejecutado está en [A2-ASSISTED-INTEGRATION-EVIDENCE.json](A2-ASSISTED-INTEGRATION-EVIDENCE.json). No se ha escrito en Supabase remoto, modificado Replit ni hecho merge.

## Reproducir en una base descartable

Requiere Node 20+, Docker local en `/var/run/docker.sock` y Chromium de Playwright. Desde el repositorio:

```sh
npm ci
npx --no-install playwright install --with-deps chromium
npx --no-install tsc -p script/demo/tsconfig.integration.json
npm run demo:a2:smoke -- work/a2-integration --full
```

Sin `--full`, comprueba S0, S1 y S2. El comando crea tres contenedores y una red con nombres aleatorios, genera sus credenciales y asigna puertos únicamente en localhost. Sobrescribe las variables Supabase de cliente/servidor con las locales antes de importar la aplicación. No acepta una URL de base de destino. Al terminar elimina sus contenedores, volúmenes y red; conserva `integration.json` y capturas. `app-private.log` queda privado y no se publica como artifact CI.

Se ejecutan todas las migraciones de aplicación hasta 089, sin editar históricos, y las migraciones propias de GoTrue. Los únicos primitives de plataforma construidos por el harness son roles PostgreSQL, `auth.uid()`, extensiones y grants de plataforma. El gateway solo enruta HTTP a GoTrue/PostgREST. No hay RPC simulado, interceptación de requests, horarios semilla ni servicio de planificación alternativo. El bundle de adopción para una base con drift tiene sus pruebas separadas: instalar el ledger fresco no acredita aplicar ese bundle al catálogo remoto existente.

El candidato local completó S0–S10: S1 tardó 84,638 s y la suma de generación de las diez etapas fue 105,819 s. La repetición anterior, antes del ajuste de nombres, dio 108,713 s / 127,693 s y el mismo fingerprint final. Son medidas locales, no un gate de latencia de Replit. PostgreSQL real utilizado: 17.11; imágenes exactas y hashes del código/ledger constan en Evidence.

El job `a2-assisted-integration` repite el recorrido de diez etapas en CI y publica únicamente el informe y las capturas. Capturas reales: [S1](integration/S1-real-ui.png), [S10](integration/S10-real-ui.png).

## Fronteras comprobadas

- Auth: creación local de cinco usuarios reales, JWT `authenticated`, login por contraseña desde la UI y bootstrap del rol.
- Roles HTTP: anon 401, Auth sin rol 403, viewer/aux lectura y rechazo de mutaciones, production ejecución del recorrido y admin idempotencia/rollback/redo.
- PostgREST/RLS: lectura en las 15 tablas protegidas con seis identidades; UPDATE directo de tareas sin filas afectadas; RPC de bootstrap rechazado para todos los clientes. Tras S1, escrituras directas a Stage y sesión rechazadas incluso para admin/production.
- Jornada/S0: GET conserva el canon sin crear descansos legacy; bootstrap desde la UI, 266 obligaciones sin horarios, C01–C19 visibles en la selección, persistencia e idempotencia con otro rol.
- Etapas: sugerencia real, propuesta 202, polling del run persistido, apply modifica solo Draft, validación limpia, aceptación y copia literal a `daily_tasks`, fingerprint estable tras `jsonb` y recarga. Cada siguiente propuesta conserva tareas y ocupaciones aceptadas. Los recursos visibles del Draft coinciden con sus asignaciones antes de aceptar y no hay avisos falsos de ocupaciones canónicas legales.
- SQL: trigger de Stage inmutable, rechazo de fingerprints obsoletos por HTTP y RPC sin cambios parciales, privilegios de validaciones sin ampliar. Rollback a S0 y redo restauran la autoridad y las filas completas.
- Canon: revalidación independiente del witness persistido, todas las restricciones y cierre colectivo de comidas contra `EngineInput` leído de la base real antes de cada aceptación. La terminación conserva 266/266 y coincide con la referencia actual de servicios reproducida dos veces.

## Defectos observados y delta causal

| Frontera | Fallo observado | Corrección mínima / resultado esperado |
| --- | --- | --- |
| Importador → 085 | `plan_optimizer_snapshots_baseline_shape_check`: un override A2 se presentó como baseline heredado | Baseline NULL y operador real en `updated_by`; 085 conserva `DAY_OVERRIDE` y registra su procedencia |
| GET jornada → EngineInput | La lectura creó 23 descansos legacy y S0 rechazó operaciones incompletas | Una jornada con contrato estructurado validado usa sus políticas de comidas; GET no materializa el catálogo legacy |
| Bootstrap → trigger 079 | `relation "planning_runs" does not exist` bajo `search_path=''` del RPC | 089 cualifica `public.planning_runs` sin cambiar el guard de pertenencia/procedencia |
| Accept → validación | `permission denied for table planning_stage_validations` por `FOR SHARE` | El lock de sesión serializa acceptance y fija su validación inmutable; leerla sin pedir UPDATE, manteniendo los grants |
| Accept → catálogo de tareas | `operator does not exist: integer[] = bigint[]` | Comparar ambos arrays en el dominio bigint de los IDs nativos |
| UI → sugerencia | El menú expandido no fijado interceptaba el click del botón | Reservar el ancho completo mientras el menú está expandido; la prueba usa el estado inicial de una sesión nueva |
| Persistencia → fingerprint | El orden de claves de comidas/preparaciones/bloques cambiaba al pasar por `jsonb` | Proyectar campos en el orden contractual de los productores; conservar fingerprints de referencia y el orden semántico de miembros |
| API/DTO → avisos locales | Las capturas muestran conflictos de espacio para transportes legalmente sincronizados | Exponer la configuración explícita del día y respetar dirección, intervalo idéntico y capacidad; conservar avisos de sobrecapacidad/intervalos distintos y actividades no autorizadas |
| DTO de tarea → identificación en UI | La selección mostraba «Sin concursante» porque esperaba una relación nested ausente | Resolver el nombre mediante contestantId y el catálogo de concursantes ya usado por el timeline; comprobar C01–C19 en el navegador real |
| Draft → vista de recursos | La vista conservaba recursos de filas live hasta aceptar, aunque Draft tenía otras asignaciones | Proyectar assignedResourceIds del Draft a la propiedad consumida por la vista, preservando arrays ausentes legacy |
| Witness persistido → siguiente Stage | `JOINT_COMPLETION` devolvía `STALE` antes de consumir ramas: firma y comparación semántica dependían del orden de claves | Firmar contenido con claves canónicas y comparar semántica/preparaciones del mismo modo; arrays, validación, protecciones y consumo de ledger permanecen intactos |

El optimizador A2 no tiene un baseline heredado inventado: restaurar defaults requiere primero una actualización revisada que capture un baseline real. No cambian heurísticas, matching, poda, presupuestos ni restricciones del motor.

La firma de los nuevos witnesses JOINT_COMPLETION cambia para poder persistirse como JSON. El revalidador conserva las firmas legacy que aún coinciden con su contenido original y siempre ejecuta las comprobaciones semánticas; un witness viejo cuya firma ya quedó inválida al persistirse sigue siendo `STALE` y debe recertificarse. No se reescriben runs ni Stages existentes. El ensayo no certifica por separado el replay de cada familia auxiliar de witnesses al margen del recorrido JOINT_COMPLETION completo.

La comparación de preparaciones también tenía un falso rechazo en memoria: en S5, las 17 preparaciones de ronda protegidas tenían 0 coincidencias por bytes y 17 por contenido. Al reutilizar correctamente el witness completo, cambian 85 horarios que todavía no se habían aceptado; las huellas de S1–S5 y todas las colocaciones protegidas permanecen iguales. El fingerprint final pasa de `561738ed…` a `a797ee88…`. Dos recorridos actuales de servicios dan ese mismo resultado, 266/266 y 20 auditorías PASS; las 266 filas del primer recorrido nativo coinciden literalmente con él. La comprobación exige equivalencia con la referencia actual y determinismo; la referencia histórica se conserva íntegra en Evidence.

## Smoke remoto breve, pendiente de ejecución

El usuario comunica que el backup ya se restauró en Supabase PostgreSQL 17.6.1.063 (4 planes, 47 concursantes, 333 tareas, 278 runs) y que exportó el catálogo original. Esos archivos no están disponibles en este checkout para inspeccionarlos. Conservarlos y contrastar el catálogo contra los SQL regenerados de este HEAD, incluida 089. Seguir [A2-IMPORT-PROCEDURE.md](A2-IMPORT-PROCEDURE.md); esquema, seguridad y carga siguen pendientes de aprobación específica.

Después de las operaciones aprobadas y de la publicación que realiza el usuario:

1. Login production/admin en la URL real; abrir exclusivamente la jornada A2 2026-10-30. Confirmar C01–C19, 266 pendientes, S0 y ningún descanso legacy añadido.
2. Sugerir alcance → revisar → generar → esperar run terminado → aplicar → validar (0 HARD/REQUIRED) → aceptar S1. Recargar y abrir desde una segunda sesión autorizada: mismos horarios, recursos, Stage y fingerprint. El Draft previo a aceptar no debe haber cambiado `daily_tasks`.
3. Repetir para S2, conservando literalmente lo aceptado; continuar hasta acumulados 19, 38, 46, 65, 75, 111, 169, 207, 209 y 266. No aceptar excepciones para completar este canon.
4. Comprobar con viewer/aux que pueden leer y reciben 403 al intentar mutaciones Assisted; anon debe recibir 401. No ejecutar pruebas de UPDATE/DELETE directo en jornadas existentes. Las pruebas destructivas de protección quedan en la copia descartable.
5. Recargar, revisar comidas/recursos/timeline y comparar el baseline privado de jornadas anteriores mediante el verificador existente. Guardar errores HTTP, run IDs, tiempos y fingerprints como Evidence del entorno real.

Pendientes específicos: adopción sobre el catálogo y datos originales restaurados, distribución Supabase PostgreSQL exacta, URL publicada de Replit, navegador/segunda sesión del invitado y transporte Supabase Realtime. El ensayo local usa recarga HTTP real; no certifica WebSocket ni esos gates remotos. Una falta de compatibilidad concreta en ellos requerirá su propia corrección causal.
