# P0-U00o — gate causal de sincronización de rondas

Diagnóstico ejecutado sobre `main` y rama remota `codex/p0-u00o-round-sync-authority-causal`, ambos comprobados en **`3b5f5de5bb534f9f0fcd8cc46614895bc0845ee8`**. No modifica producto, Fuentes oficiales, migraciones ni Evidence anterior. No realiza merge, despliegue ni escrituras remotas de BD.

**Primera brecha:** producción no dispone de una autoridad diaria editable/versionada que declare los miembros de los carriles. El perfil general estricto no la representa; el alta del día congela ese perfil y las tareas obtienen sus IDs después. No se pierde una política guardada: falta el productor de esa política. [Recorrido y contratos](causal-path.md).

**Consumidor demostrado, con límites:** dos carriles físicos, auxiliares con participante, duración uniforme, preparación explícita y tarea independiente funcionan con el motor actual. Duraciones heterogéneas dentro de la misma sincronización se rechazan antes de buscar. No se propone otro algoritmo. [Única implementación posterior](next-implementation.md).

| Observación | Jornada A | Jornada B |
| --- | --- | --- |
| Creación de día en Chromium | 11/04/2027, plan 1 | 12/04/2027, plan 2 |
| Espacios físicos / tareas reales | 1 y 2 / 1–5 | 3 y 4 / 6–10 |
| Duraciones originales, carriles + independiente | 20/25/20/20 + 35 min | 30/35/30/30 + 35 min |
| Resultado nativo previo | READY; ninguna ronda | READY; ninguna ronda |
| Contrafactual con esos mismos IDs/duraciones | UNSUPPORTED, mezcla de duraciones | UNSUPPORTED, mezcla de duraciones |
| Edición posterior por API de tarea | tarea 2: 25 → 20 min | tarea 7: 35 → 30 min |
| Contrafactual uniforme, sólo cuatro miembros | 08:45–09:05; 09:10–09:30 | 09:00–09:30; 09:35–10:05 |
| Ocupación de preparación, en ambos espacios | 09:05–09:10 | 09:30–09:35 |
| Ramas de ese scope | 8 | 6 |
| Validación del scope sincronizado | HARD válido; ninguna infracción | HARD válido; ninguna infracción |
| Propuesta/snapshot completo simulado | 5 tareas + 2 preparaciones | 5 tareas + 2 preparaciones |
| Stage productivo ordinario real | S1, ID 2; 5/5 sin autoridad de rondas | S1, ID 4; 5/5 sin autoridad de rondas |
| Stage sincronizado aceptado | **ninguno** | **ninguno** |

Las dos jornadas tienen catálogos/participantes/espacios propios. Los carriles comparten sólo la semántica tipada. Los espacios tienen ventanas distintas heredadas desde sus APIs de disponibilidad; los participantes tienen ventanas diferenciadas. La quinta tarea ocupa físicamente el segundo espacio pero no pertenece a la sincronización. No se suministran horas al solver ni se utiliza A2.

En B el Stage ordinario coloca las tareas 6 y 8 a las 09:40 y 10:15, respectivamente: una propuesta válida sin la regla no garantiza la sincronización que producción pretendía. READY describe las autoridades efectivamente declaradas, no descubre una intención ausente. El configurability registry ya anuncia `SYNCHRONIZED_ROUNDS` como PARTIAL y limita el editor existente a minutos de carriles previamente creados. No debe presentarse READY como prueba de cobertura de esa intención.

## Frontera de Stage

La proyección de `roundSynchronizations` cambia `plan_workday`, la identidad efectiva y el replay. Con el input proyectado y **la revisión auténtica persistida**, `AssistedProposalService.run` devuelve **`STALE_CONFIG_REVISION`** antes del solver. Se conserva este rechazo, no se sustituye el fingerprint por el antiguo.

Para observar también la materialización existente, una segunda simulación sustituye **en memoria** la lectura de revisión por la identidad/replay calculados del input proyectado. Reutiliza el servicio y genera propuesta de cinco tareas, snapshot completo, fingerprint y dos preparaciones. El validador canónico del snapshot da válido. El run simulado no escribe ni finaliza en DB, no se aplica a Draft y no se acepta como Stage.

Dos intentos transaccionales revertidos, sobre la misma BD descartable y sin desactivar contratos, precisan la barrera:

- UPDATE de la autoridad histórica → `PLANNER_NEXT_CONFIGURATION_IMMUTABLE` (088). Además 105 prohíbe coexistencia con el perfil nuevo; 106 rechaza esa coexistencia en el builder.
- Operación versionada existente, con revisión del **plan** auténtica, replay actual auténtico y replay candidato con rondas → `STALE_ROUND_PREPARATION_CANDIDATE` (v5 → v4/102). El guard compara con el baseline histórico; no admite una autoridad estructural nueva. La revisión de plan y la de sesión no se suponen iguales.

Las únicas aceptaciones son por la API sin intervención: propuesta ordinaria → Draft → validar → S1 → rollback a S0 → redo. Las sondas comprueban que no cambian sesión ni snapshot. **No hay un Stage sincronizado E2E demostrado.**

## Negativos y clasificación

| Contrafactual | Rechazo observado | Clasificación |
| --- | --- | --- |
| Miembros intercambiados entre espacios, IDs únicos | `UNSUPPORTED_ROUND_SYNCHRONIZATION`; `taskSpaceId != laneSpaceId` | Validación correcta de identidad/ubicación |
| ID inexistente | mismo código; `taskFound=false` | Referencia no representable |
| Duraciones mixtas reales | mismo código; `durationMixValid=false`, duraciones en details | Límite del contrato actual, anterior a búsqueda |
| Preparación de 240 min contra ventanas matinales | `ASSISTED_SCOPE_INCOMPLETE`, `NO_COMPLETE_HARD_VALID_ITINERANT_PLAN`; 0 ramas | Geometría físicamente inviable |
| Ambos carriles factibles por separado, ventanas de carriles sin intersección | mismos códigos; 75/48 ramas; sin límite de tiempo/presupuesto | Sincronización físicamente inviable, matching exhausto |
| Quitar preparaciones a una solución | `ROUND_PREPARATION_VIOLATION` | Validación HARD correcta |
| Desplazar sólo un miembro | `ROUND_SYNCHRONIZATION_VIOLATION`, más conflictos aplicables | Validación HARD correcta |
| Validar sólo cuatro placements contra el día completo | `UNPLANNED_TASKS` | Incompletitud global correcta; el scope sí es válido |

Para el negativo de ventanas disjuntas se ejecuta también **el mismo problema sin sincronización**, que sí produce propuesta para las cuatro tareas. No se etiqueta agotamiento como inviabilidad. El código canónico de duración `UNSUPPORTED_ROUND_SYNCHRONIZATION_DURATION_MIX` existe en `roundSynchronizationPreflightReasons`; la frontera EngineInput se adelanta y devuelve el código genérico anterior con details, que es el realmente observado.

## Scope y Future Feasibility vigentes

El recomendador selecciona `ROUND_SYNCHRONIZATION:<id>` con los cuatro miembros. El resolver conserva los IDs solicitados; `buildAssistedProblem` expande tarea única o espacio a cuatro tareas para búsqueda (3 o 2 supporting), conserva ambas lanes y no sincroniza la quinta tarea. La propuesta visible sigue el scope solicitado: supporting no significa aceptación automática de todos los miembros. La implementación posterior debe mostrar la unidad completa como selección operativa.

Al solicitar sólo la independiente y pasar `analyticalFutureEligibleTaskIds` como hace el servicio real, la proyección mantiene una ronda futura analítica. El motor reserva un witness completo de cuatro placements, matching y dos preparaciones, con fingerprint propio; propone sólo la tarea independiente. No convierte el witness en posiciones aceptadas. Las antiguas tablas del catálogo que describen pérdida de peers no se interpretan como estado de esta base.

## Recibos, determinismo y regresión

[native/receipts.json.gz](native/receipts.json.gz) y [native/repeat-receipts.json.gz](native/repeat-receipts.json.gz) contienen los **82 JSON completos por ejecución**, indexados por nombre. Incluyen estado generado, inputs, preflight/adapter/readiness, scopes, solver, witness futuro, propuesta y snapshot simulados, identidad/replay, rechazos, Draft/validación/Stage ordinarios y restore. [A S1](native/A-product-stage.png) y [B S1](native/B-product-stage.png) son capturas reales. Logs privados, JWT, contraseñas y dumps de entorno quedan excluidos.

Cada ejecución crea PostgreSQL 17, GoTrue, PostgREST, API y Chromium locales, aplica las **116 migraciones** exactas hasta 113 y destruye sus propios contenedores. Los manifiestos comprimidos protegen **4.124 archivos** de producto, scripts, Fuentes y Evidence histórica por SHA-256. La única modificación del archive descartable es el dispatch documentado a este journey; el checkout conserva literalmente el harness original.

La repetición parte de otra base vacía: inputs contrafactuales, solver completo/work/fingerprint, identidades, replays y snapshots simulados coinciden. El replay frío reproduce los resultados y la invariancia al invertir tareas, espacios, lanes y miembros. En los witnesses futuros sólo se excluyen de la comparación siete campos CPU `futureItinerant*Ms` enumerados en el test; se conservan todos los contadores, placements y fingerprints.

El A2 se **protege por hash, no se vuelve a ejecutar**: se verifica el recibo actual de U00n, **266/266, 11 Stages, 27.049 ramas**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`, y su Evidence y todos sus consumidores permanecen idénticos a la base. No se atribuye a esta unidad un nuevo benchmark A2.

[validation.json](validation.json) registra comandos, resultados y comparación; [verify.py](verify.py) verifica fuentes, recibos y hashes. Fuentes dirigidas y hashes: [authorities.json](authorities.json).

Pasan **57 tests focales existentes y 4 tests nuevos de replay frío**, TypeScript de producto y del diagnóstico, secuencia de migraciones y verificador de integridad. No se ejecuta suite global ni build al no cambiar producto.

## Reproducción

```sh
# Dependencias del lockfile, Docker local y Chromium disponibles.
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node --import tsx docs/evidence/p0-u00o/run.ts /tmp/u00o-fresh
python3 docs/evidence/p0-u00o/pack.py /tmp/u00o-fresh /tmp/u00o-public
U00O_RECEIPTS=/tmp/u00o-public/receipts.json.gz \
  node --import tsx docs/evidence/p0-u00o/replay.spec.ts
npx --no-install tsc -p docs/evidence/p0-u00o/tsconfig.json
python3 docs/evidence/p0-u00o/verify.py
```

El verificador por defecto comprueba los recibos entregados. El runner exige un output nuevo, archiva la base autorizada y verifica hashes después de ejecutar; no lee credenciales productivas para construir su stack. Las pruebas se limitan a las topologías descritas: recursos nominales, otras comidas y combinaciones con cadenas/setups no se declaran cubiertos por esta unidad.

**Comportamiento X**: una jornada nueva puede estar READY y aceptar un planning que no sincroniza las rondas pretendidas; **es causado por Y**: ausencia de una autoridad diaria productiva para pertenencia a carriles, anterior a EngineInput; **produce Z**: la regla no participa en scope, búsqueda ni validación real. **El delta W** debe materializar/editar esa autoridad con versión y replay, adaptando el guard SQL existente; **esperamos observar M**: dos jornadas nuevas uniformes configuradas desde producto alcanzan Stages sincronizados auténticos, con preparaciones, rechazo de negativos y snapshots históricos intactos.
