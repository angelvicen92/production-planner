# P10 — integridad de configuración IN/OUT

Base: `c777c5df2b040db4e9b69f30e73531ae13a19578`, main posterior al merge de P9 (#1157).
Rama remota: `codex/ops-p10-transport-group-config-integrity`.
Autoridad: Fuentes 00 v2.13, 01 v5.2, 03 v3.7, 04 v2.7, 05 v2.7,
06 v2.10 §7.7 y 07 v2.2. No se cambian las Fuentes.

## Diagnóstico previo y recorrido real

| Frontera | Autoridad y consumidor |
|---|---|
| General | `TransportSettingsCard` → `shared/routes` → GET/PATCH `/api/optimizer-settings` → `optimizer_settings` |
| Creación y snapshot | `planOptimizerSnapshotPersistence` resuelve identidades del catálogo diario; `planOptimizerSnapshot` normaliza y calcula huella; `plan_optimizer_snapshots` conserva valores y baseline local |
| Jornada y revisión | `DayCapabilityEditor` → `dayConfigurationService` → `apply_day_config_operation_v3` → v2 → revisión canónica; `assisted_apply_config_refresh` conserva overrides |
| Entrada efectiva | `buildEngineInput` → proyección del snapshot → `applyPlanPlannerNextConfiguration` → `effectiveTransportDirection` → preflight/adapter |
| Construcción | witness estructural IN/Supporting → `assessCoreArrivalTransportFeasibility`; terminal IN/OUT → paquetes contiguos, interval matching o enumeración exacta en `transportGrouping` |
| Futuro | `PreparedFutureCollectiveParticipantClosure` y completion reutilizan la materialización y la misma policy clonada; no se cambia matching genérico |
| Validación/producto | `validateTransportGrouping` → `validatePlan` → Assisted propuesta/Draft → validación manual P9 → Stage/AcceptedException bajo el gate vigente |

El ensayo anterior al delta obtuvo **266/266, 11 Stages, cero HARD/REQUIRED** en dos
recorridos deterministas. Huella final:
`b9df879577cd8fb3d1b32e4588d6da0ad404739341a431e587eee4f68fa4f30f`.
No se utilizó la parrilla humana como seed ni lock.

Reproducciones causales previas:

* Solicitar mínimo 2 en EngineInput producía mínimo 1 en el adapter.
* Cuatro transportes con inicio común, dos de cinco minutos y dos de diez,
  máximo 3 y gap 0, producían cero infracciones: `start:end` los separaba.
* Una búsqueda genérica con 19 obligaciones y min=max=3 agotaba 10.000 ramas
  y reportaba `CORE_BRANCH_BUDGET_EXHAUSTED`, aunque la cardinalidad ya probaba
  imposibilidad. El diagnóstico A2 directo adicional se interrumpió; no se usa
  como certificado negativo. El caso genérico completo es la reproducción roja.

## Contrato y precedencia

Mínimo y máximo son HARD por dirección; objetivo es PREFERRED; gap se mide entre
inicios. Un objetivo positivo fuera de los límites se conserva literalmente y
ordena los tamaños legales más cercanos. No invalida la configuración. El 0
histórico significa objetivo no especificado; se conservan los defaults
constructivos anteriores IN 3 y OUT 1. Entradas humanas negativas, fraccionarias
o con mínimo mayor que máximo se rechazan, sin redondearlas.

La migración **099** añade cuatro columnas nullable a las dos tablas existentes:
mínimo y máximo independientes por dirección. No backfillea ni reescribe
snapshots/revisiones/Stages/excepciones ni modifica 098. Ausencia o NULL de un
mínimo nuevo conserva **mínimo 1**, y esos campos no entran en la huella histórica.

Para límites: override explícito del snapshot diario `DAY_OVERRIDE` → override
legacy de `plans.planner_next_configuration` → snapshot heredado → capacidad del
vehículo del snapshot. Objetivo y gap proceden exclusivamente del snapshot diario.
General sólo afecta días nuevos o una actualización explícita. La edición diaria
es una operación sobre el snapshot completo de optimización y transporte; el
editor comienza con los valores efectivos, incluidos máximos legacy, para no
sustituirlos accidentalmente por la capacidad del vehículo. Restore recupera el
baseline local y los overrides legacy vuelven a prevalecer sobre la herencia.

A2: el snapshot optimizador declara objetivo IN 3, OUT 1, gaps 30/20 y vehículo 3;
los overrides diarios declaran máximo IN 3 y OUT 6. El mínimo anterior es 1,
no 3. Un residual IN de uno es legal; OUT de cuatro o seis puede ser legal.

La lectura General incluye explícitamente los cuatro campos nuevos en su SELECT; guardar sin esa lectura perdería los valores al recargar y crear snapshots.

La revisión candidata se reconstruye con el snapshot candidato antes de calcular
EngineInput/identidad/replay. Esto corrige la autoridad obsoleta que quedaba al
sustituir sólo `replay.optimizerSnapshot`. Los escritores atómicos existentes
persisten los campos nuevos, invalidan validaciones y conservan el control de
propuestas stale. Un trigger rechaza modificaciones directas de transporte sin
operación versionada. Restore inserta su revisión inmutable, sin cambiar el
`source` de una revisión ya creada. Los escritores usan `jsonb_object_keys` para contar heurísticas: la función heredada `jsonb_object_length` no existe en PostgreSQL 17 y bloqueaba la edición diaria.

## Construcción y validación

Los tamaños siempre pertenecen a [mínimo,máximo] y retienen particiones residuales
legales. Una comprobación aritmética fría comunica
`TRANSPORT_GROUP_CARDINALITY_PARTITION_IMPOSSIBLE` con dirección, cardinalidad,
límites e identidades antes de explorar ramas. Se abstiene con transportes
protegidos; la materialización conserva esos intervalos y considera sus miembros
junto con los pendientes. No se prueba imposibilidad contando sólo pendientes. Un grupo protegido que ya viola tamaño o sincronización conserva su infracción literal; las tareas nuevas se construyen alrededor sin ampliarla. La validación independiente y la identidad exacta de AcceptedException siguen siendo la única autoridad de aceptación.

La capacidad simultánea y el gap también se comprueban contra transportes ya
colocados. Igual inicio constituye un único grupo por dirección. Diferentes
finales producen `GROUP_SYNCHRONIZATION`, además de `GROUP_SIZE` si corresponde,
con todos los miembros y finales ordenados. P9 conserva exactamente la identidad
anterior para grupos sincronizados sin cambios; la nueva infracción utiliza la
misma proyección estructurada y AcceptedException. El gate admin de P9 permanece
intacto. No se normalizan duraciones ni se crean excepciones automáticas.

## Evidence y gates

Ver `a2-comparison.json` para la comparación reproducida de las once huellas y
scopes; `causal-red.json` y `partition-generic-red.json` para los defectos previos.
`protected-residual.json` compara antes/después con intervalos protegidos idénticos.
Las suites `transportConfigIntegrity.spec.ts` de engine y server cubren límites,
residuales, target independiente, OUT, gap, simultaneidad, duración, fallback,
orden inverso, contexto protegido, lectura histórica, persistencia y precedencia.
El harness nativo `--transport-policy` verifica General y jornada mediante
Chromium/HTTP/Auth/SQL, revisión/replay, permisos, stale, restore y no mutación de
Stages/266 filas. `--manual-validation` conserva el recorrido P9 completo.

Los resultados finales y las limitaciones observadas se registran en
`validation.json`. No se aplica la migración a Supabase real, no se modifica P9,
no se hace merge ni publicación. La cobertura de motores legacy sigue sin estar
certificada; el recorrido certificado de esta unidad es Planner Next/Assisted.

Comportamiento X era causado por Y y producía Z; el delta W cambia esa autoridad
y observamos M: el mínimo visible se confundía con target, el adapter imponía 1 y
la clave start:end permitía grupos ficticios; la configuración explícita y la
validación por inicio gobiernan ahora el mínimo/máximo real y preservan el A2
completo y determinista.
