# P0-U00u — operación anclada nativa

Base exacta `51ba8a6631f0179c0f56933ebcc6a674aaf1a2c0`. Una operación nominal puede declararse por actividades reales en la configuración del día y recorrer propuesta auténtica → Draft → validación HARD/REQUIRED → Stage → continuación. El A2 completamente introducido desde UI sigue abierto: [inventario breve](a2-ui-inventory.md).

## Gate causal previo — decisión B

**X:** el recorrido nuevo no puede declarar el acompañamiento ni consumir su unidad durante Main. **Y:** faltan productor diario y ámbitos operativos; el perfil veta Main itinerante; la proyección efectiva sólo añade miembros bajo `OPERATION_ONLY`. **Z:** añadir únicamente el contrato existente en memoria devuelve `UNSUPPORTED_TASK_ROLE` e `INCOMPLETE_ANCHORED_OPERATION`. Retirar sólo el veto no basta.

La [Evidence diagnóstica](diagnostic/receipts.json.gz) conserva EngineInput real, identidad/replay, S0, preflight y HTTP 422 ordinario en PostgreSQL 17/Auth/PostgREST/Chromium descartables. No hay horas planificadas, locks ni placements aportados. `contract-only.json` y `localized-preflight.json` conservan los rechazos. La intervención siguiente materializa en memoria los miembros de la unidad nominal ya creada, mantiene declaraciones separadas y aplica los ámbitos virtuales. Preflight pasa, pero el core termina con `CORE_INFEASIBLE` / `NO_COMPLETE_HARD_VALID_CORE`: **11 ramas, cuatro arquitecturas, cero candidatos Main**, sin agotar 10.000 ramas.

La primera pérdida constructiva está en `exactMainAndFeederCore.ts`: el evento inicial suma el feeder y sus ancestros, pero omite los minutos anteriores al ancla. La preferencia final coloca el after fuera de disponibilidad; las fronteras iniciales restantes no dejan sitio al before. El materializador canónico encuentra 28 inicios admisibles. **W:** sumar la duración anterior al mismo evento derivado existente. **M:** el contrafactual del consumidor completa 5/5, HARD válido, **20 ramas**, con la operación completa. [Intervención exacta](diagnostic/geometry-intervention.json), [antes](diagnostic/consumer-before.json.gz), [después](diagnostic/consumer-after.json.gz). El experimento nunca se aplica a Draft ni Stage. No se añaden matching, heurísticas, otro motor, presupuestos ni timeouts.

## Autoridad y recorrido

`plans.daily_anchored_accompaniments` es nullable y exclusiva de perfiles nuevos. Se edita mediante la operación versionada existente `PUT /api/plans/:id/day-configuration`, con `expectedRevisionId`; no existe un escritor paralelo ni se modifica 088. La UI selecciona Main, ambos segmentos del mismo participante y una unidad nominal diaria. No exige introducir IDs, SQL, JSON ni horarios. El orden y REQUIRED están explícitos; los nombres son etiquetas.

El productor valida referencias, roles, ubicación diaria, recursos, unidad y dependencias; materializa `anchoredAccompaniments` y `taskOperations`. Los segmentos conservan ubicación, `blocksSpace=false`, agenda itinerante y `OPERATION_ONLY`. Main conserva duración, agenda física y `LOCATION`; también consume la unidad. La proyección efectiva añade sus miembros bajo ambos ámbitos. `declaredResourceIds`, incluidas listas vacías, queda en el replay autoritativo y se relee de esa revisión después de materializar; no se reconstruye eliminando miembros del equipo.

El scope cierra la unidad por identidad y utiliza el cierre de prerequisites existente. Geometría, materialización, matching nominal, Future Feasibility, validación y cobro de branches siguen en los consumidores canónicos. La propuesta se aplica al Draft sin consolidar tareas; `validate` y `accept_stage` son los escritores reales. La migración **116**, posterior a 115, comprueba autoridad y proyección en revisiones y vuelve a comprobar materialmente la operación en validación/Stage. Hashes coherentes no autorizan borrar un segmento, fingir Main virtual, falsificar unidad, omitir miembros ni duplicar capacidad.

CAS, permisos ADMIN/PRODUCTION, bloqueo de propuestas/Draft, captura de fuentes, invalidación y transición de sesión reutilizan v5. El guard reconstruye el delta permitido —contrato y campos propios de las tres tareas— y verifica identidad/replay completos. La transición queda en el diff inmutable de revisión, como las autoridades diarias existentes. Los miembros nuevos no se declaran a partir de recursos heredados del ancla. Los recursos directos y locks mantienen su autoridad.

## Dos jornadas productivas

Los recibos públicos originales están indexados por nombre en `native/receipts.json.gz`; `native/manifest.json.gz` y `native/harness.json.gz` vinculan código y runner ejecutados. Los únicos datos SQL preparados en este recorrido son plataforma, ledger y roles Auth; catálogos, tareas, participantes, unidades y declaración pasan por producto.

| Jornada | Operación aceptada | Resultado |
| --- | --- | --- |
| A | Before 09:10–09:25 → Main 09:25–09:40 → After 09:40–09:55 | 5/5; un Stage; participante y cámara/sonido 45 min; Main físico 15 min; competidora posterior. |
| B | Before 11:45–11:55 → Main 11:55–12:15 → After 12:15–12:25 | Otros IDs, participante, espacios, unidad, ventanas y duraciones. S1 acepta cuatro tareas; S2 añade la competidora preservando literalmente S1. |

`B-future-witness.json` registra un hueco admisible de la competidora como contexto. En el primer Draft/Stage permanece sin horario. La reserva terminal de participante comprueba ese futuro; la continuación consume sólo su trabajo pendiente. `*-sql.json`, `*-reconstructed.json`, rollback/redo y capturas de navegador documentan reconstrucción y protección.

El día equivalente sin declaración coloca Main separado de los segmentos: A antes 09:15–09:30, Main 11:45–12:00, después 09:30–09:45; B antes 09:15–09:25, Main 11:55–12:15, después 09:25–09:35. La operación modifica la selección y el consumo; no es metadato. Los recibos ordinarios originales se conservan.

Los negativos API/SQL cubren segmentos ausentes/duplicados, orden contradictorio, referencias desconocidas y ajenas, unidad falsificada, CAS concurrente, roles y escrituras Data API, revisión coherente sin anclaje/proyección/provenance y certificados incompletos. El fallo inyectado después de escribir la autoridad revierte autoridad, revisión y sesión en la misma transacción. Modificar/retirar tras aceptación se rechaza incluso después de rollback. Los tests de consumidor distinguen ventanas/unidad/capacidad físicamente imposibles, `UNSUPPORTED` por contrato y búsqueda agotada. Ninguna prueba negativa alimenta placements al constructor productivo.

## Compatibilidad y límites

Se admite **una operación de tres segmentos por día**, con unidad nominal elegida explícitamente, Main/Vocal real, recursos concretos y perfiles sin transporte/setup/rondas/cadenas/joint groups combinados. No se elige A/B automáticamente; un dominio intercambiable de la operación completa requiere otro gate. La unidad se planifica con Main antes de scopes independientes. SQL exige certificado completo y rechaza un futuro anclado separado sin prueba estructural; no inventa un witness ni convierte UNSUPPORTED en READY. Retirar/editar es legal mientras no haya decisiones protegidas, ejecución, locks, Draft sucio o propuesta activa.

Las jornadas y Stages históricos no adoptan esta autoridad. El ensayo poblado 115 → 116 compara todas las filas originales y lectores/capturas de fuentes, políticas y permisos. Los guards adicionales son invoker con `search_path=''` y ejecución privada; no se amplían grants de tablas. Se conserva la distinción de U00t entre el ledger histórico y su perfil de seguridad preparado; este cambio no corrige ni amplía las políticas anteriores.

A2 se repite desde S0 en dos procesos Node 20 independientes: **266/266, 11 Stages, 27.049 ramas**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. Reports iguales salvo `iterations[].durationMs`, snapshots/certificados exactos y 22 certificados revalidados. `a2/` contiene ambos originales. [Validación y estado final de CI](validation.json) distingue intentos de preparación, positivos, regresiones y límites; los fallos previos no se convierten en PASS.

## Reproducción

Node 20, dependencias exactas del lockfile, Docker local y Chromium. Los runners eliminan credenciales Supabase heredadas, fijan conexiones a loopback y destruyen sus propios contenedores. No operan Supabase real, Replit ni jornadas publicadas.

```sh
npm ci
npm run check && npm run check:migrations && npm run build
npx --no-install tsc -p docs/evidence/p0-u00u/tsconfig.json
npx --no-install tsx --test engine/planner-next/integration/nativeAnchoredAccompaniment.spec.ts
node --import tsx docs/evidence/p0-u00u/upgrade116.ts /tmp/u00u-upgrade
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00u/run.ts /tmp/u00u-native --native
node --import tsx docs/evidence/p0-u00u/consumer-negatives.ts /tmp/u00u-native/native/A-input.json /tmp/u00u-native/native/consumer-negatives.json
python3 docs/evidence/p0-u00t/a2.py /tmp/u00u-a2 --node /ruta/a/node20
```

Para repetir el diagnóstico anterior, archivar la base exacta, enlazar dependencias y copiar únicamente los runners diagnósticos de U00u; ejecutar allí `run.ts` sin `--native`. La intervención geométrica está registrada literalmente y sólo se aplica a una copia descartable. Los positivos nativos se ejecutan sobre producto sin esa intervención.

Sin merge automático, migración real ni publicación. Siguiente brecha recomendada: ámbito operativo nativo de Reality standalone, delimitado en el inventario.
