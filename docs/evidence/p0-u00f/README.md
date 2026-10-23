# P0-U00f — gate causal BLOCKED

**Estado de la capacidad solicitada: BLOCKED; no implementada.** Se detiene la expansión antes del wiring productivo porque el contrafactual demuestra una incompatibilidad estructural real. No se modifica el motor, el contrato productivo, la UI productiva, los budgets, timeouts, dependencias, datos remotos ni despliegues. Este PR contiene únicamente diagnóstico, harness, Evidence y su verificación offline. No cierra P0 ni está listo para merge de funcionalidad.

## Base y autoridades

Base verificada en vivo: `main` **72ec8cdc64666581d14c5c52eb2767c94669672d**, merge de #1183; checkout limpio y sin otro PR abierto de U00f. CI posterior al merge: [Baseline CI](https://github.com/angelvicen92/production-planner/actions/runs/39881411789) y [Data API grants](https://github.com/angelvicen92/production-planner/actions/runs/39881411682), ambas `success`. Los nueve workflows del head de #1183 también estaban aprobados. Se leyeron AGENTS, maestro P0, catálogo, Fuentes 00 v2.14 y 07 v2.3, y las secciones materiales de 01/03/04/05 vigentes. El índice identifica asimismo 02 v2.2 y 06 v2.10; sus autoridades no cambian.

Baseline de regresión **histórico integrado**, no una ejecución nueva de U00f: [U00e v2](../p0-u00e/validation.md), A2 266/266, 11 Stages, 27.049 ramas, 22 certificados, 8.465 minutos de presencia y fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. Sus tres tiempos publicados son 93,479 / 113,805 / 101,733 s. El gate completo A2 y U00a–U00e **no se repite**: no existe candidato de integración; el gate causal ordena detenerse. No se atribuye a U00f igualdad de tiempos, certificados o fingerprints de una ejecución no realizada.

## Experimento y recorrido real

[Receta](../../../script/diagnostics/runU00fTransportGate.ts): archiva la base en `work/`, enlaza dependencias y reutiliza el stack descartable nativo PostgreSQL 17/Auth/PostgREST/Chromium, ledger completo y cinco identidades Auth. Catálogos espaciales y recursos se crean por la API real; plantillas, referencias de dependencias, parámetros de transporte, perfiles, jornadas, participantes, scopes, propuestas, Draft, validación y aceptación se operan por la UI real. No se importa A2 ni se escriben autoridades operativas por SQL. SQL sólo inicializa la plataforma/ledger del stack y lee recibos.

Primero ejecuta el comportamiento original. Después activa mediante un marcador **sólo en el archivo `engine/buildInput.ts` de la copia descartable** el contrafactual: deja de anular los IDs de transporte, conserva la proyección de transporte que el propio builder ya generó y asigna los roles IN/OUT desde sus IDs de plantilla diarios. No fabrica `transportSettings.source`: conserva literalmente el objeto de la proyección productiva `engine-buildInput-optimizer-transport`. Los nombres seleccionados por el editor histórico se congelan mediante las referencias existentes del snapshot; esto demuestra el camino existente, **no entrega todavía el editor por IDs explícitos requerido para U00f**.

[Intervención exacta](counterfactual.patch), [SHA/base/árbol y hashes](intervention.json), [recibo nativo](native/integration.json) y [análisis ejecutable](causal-analysis.json). Los **301 archivos TypeScript de Planner Next** tienen los mismos hashes antes/después de la intervención. El hash del journey ejecutado coincide con el archivo versionado. `PASS` en el recibo nativo significa que se capturó el experimento; el resultado de producto separado es [BLOCKED](result.json).

| Escenario creado por UI | Participantes / obligaciones | Resultado observado |
| --- | --- | --- |
| Main + Vocal, IN/OUT y coach propios | 2 / 8 | Propuesta, Draft, validación y Stage: 8/8, cero HARD/REQUIRED nuevos |
| Continuación de ese día | 6 tareas aceptadas, 2 OUT pendientes | Certificado persistido reutilizado; ambas OUT aceptadas en Stage ordinal 3; las seis tareas originales permanecen idénticas |
| Standalone, IN → retrato → OUT | 3 / 9 | Preflight SUPPORTED y S0 real; run `error`, sin propuesta ni Stage posterior |

El primer día configura vehículo 2; IN min=2/max=2/target=2/gap=20 y OUT min=1/max=2/target=1/gap=15, peso 5. El segundo configura vehículo 3 e IN max=3, conservando OUT max=2 y sus reglas diferentes. Tiene otro conjunto de plantillas y participantes. La configuración posterior no altera el problema/fingerprint del primer día. No se declaran obligaciones nuevas ni se inventa Main/estilismo para el standalone.

La continuación usa rollback soportado exclusivamente sobre el stack descartable para comparar una propuesta completa y una sesión por scopes: S1 completo queda archivado, S2 acepta IN/Vocal/Main y S3 completa OUT. El Stage aceptado y Draft permanecen intactos mientras se calcula la siguiente propuesta. El [Stage final](native/protected-complete-stage.json), su revisión/configuración y el replay repetido desde autoridades reales son verificables. El replay con el `JOINT_COMPLETION` persistido es determinista; no se confunde con replay frío sin ese certificado.

## Causas falsadas y confirmadas

**Pérdida inicial confirmada.** `shared/newDayPlannerConfiguration.ts` exige NONE; `engine/buildInput.ts` anula `arrivalTransportTemplateId`/`departureTransportTemplateId` cuando hay perfil; `applyNewDayPlannerConfiguration` borra transporte y fuerza `productive_task`. La jornada original aparece READY/SUPPORTED sin `transportPolicy`. El contrafactual restaura el transporte y lleva el escenario Main hasta Stage. Por tanto el wiring es necesario, pero **no suficiente** para el alcance pedido.

**Bloqueo determinante: standalone con transporte.** `runExactMainAndFeederSearch` emite correctamente `EMPTY_STANDALONE`. En `exactItinerantPlan.ts::onHardValidCoreLeaf`, la condición `orderedMains.length === problem.tasks.filter(kind=main).length` acepta **0 === 0** y llama a `materializePipelineBundleMatching`. Con política arrival presente, `anonymousPipelineWitness.ts::buildPipelineWitness` supera `ARRIVAL_POLICY_ABSENT`, construye cero capas y accede a `layers[0]!.styling.spaceId`. Resultado nativo y offline: **TypeError: Cannot read properties of undefined (reading 'styling')**. No es agotamiento de presupuesto ni prueba de inviabilidad.

El análisis conserva un **testigo manual de factibilidad**, específico de este fixture: tres IN simultáneos 09:00; retratos 09:20/09:30/09:40; OUT 10:00/10:15/10:30. El validador canónico lo acepta, incluidas capacidad, ventanas, dependencias y agrupación. No se proporciona a búsqueda, UI, Draft ni Stage. Es un control diagnóstico, nunca otro scheduler ni una propuesta disfrazada.

**Frontera adicional: replay frío protegido.** Sin el certificado persistido, `deriveArchitectureFromProtectedMains` exige una capa auxiliar IN→styling→Main que el perfil Main+Vocal válido no declara. El fallback de `mains.length===0` valida el core con `transportPolicy:undefined`; las dos IN aceptadas simultáneas pasan a parecer ocupaciones exclusivas y producen `OVERLAP_VIOLATION`. El mismo snapshot con su política de transporte conservada valida sin infracciones. El resultado frío es NO_PROPOSAL/NO_COMPLETE_HARD_VALID_CORE con cero ramas. **La continuación productiva probada sí funciona con su JOINT_COMPLETION**; este negativo no se presenta como fallo de ese recorrido.

## Diagnóstico accionable y decisión

- **UNSUPPORTED — standalone + transporte:** revisar la aplicabilidad del pipeline Main en la continuación del core vacío y demostrar su llegada al standalone existente. No añadir Main, styling ficticio, segundo solver ni presupuesto.
- **UNSUPPORTED — replay frío de Main protegido con IN agrupado:** auditar la conservación de la autoridad de transporte en el fallback y el requisito de capas. Conservar el certificado persistido para la modalidad de continuación actualmente demostrada.
- El producto devuelve hoy `error` en el primer caso, no un UNSUPPORTED accionable. Esta es una brecha registrada, **no un diagnóstico ya implementado en UI/preflight**.

Antes de integrar wiring hay que resolver causalmente esa frontera dentro de una decisión explícita de alcance. Este PR no modifica el motor para hacerlo. Quedan pendientes el editor por IDs, referencias de transporte nuevas lossless, negativos de configuración/roles/CAS específicos de U00f, dos jornadas completas hasta Stage y el gate de integración A2/U00a–U00e. Las autoridades históricas, capacidades y severidades no se reinterpretan.

## Reproducción y validación

Node 20.20.2, dependencias del lockfile y Chromium del entorno. Desde el repositorio:

```sh
node node_modules/tsx/dist/cli.mjs --test script/diagnostics/u00fTransportGate.spec.ts
node node_modules/typescript/bin/tsc -p script/diagnostics/tsconfig.u00f.json
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx script/diagnostics/runU00fTransportGate.ts work/u00f-fresh 72ec8cdc64666581d14c5c52eb2767c94669672d
node --import tsx script/diagnostics/analyseU00fTransportGate.ts work/u00f-fresh/native work/u00f-fresh/causal-analysis.json
```

El directorio de salida debe ser nuevo. El wrapper no cambia el checkout ni dispara llamadas remotas de aplicación; las conexiones del harness se fijan a loopback. Docker usa exclusivamente el daemon local. Logs y trazas privadas se conservan sólo en `work/`, nunca en el PR. Los artefactos publicados no contienen tokens/credenciales.

[Validación focal y límites](validation.json). Los tests observacionales mantienen el fallo conocido como BLOCKED; aprobarlos no significa que standalone esté implementado. CI comprueba esos artefactos offline; la demostración UI nativa descrita aquí es local y reproducible con Docker. Sin merge, publicación Replit, migraciones Supabase ni cambios productivos.
