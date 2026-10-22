# P0-U00a — primeras jornadas nuevas planificables

Base remota comprobada: `b9802860d8e48b26938e38f82648c328122efd26` (#1177 integrado). Destino exclusivo: `codex/p0-new-day-planner-next-u00a` → `main`. Sin despliegue, cambios remotos de BD, importación A2 productiva ni merge.

**Dos jornadas creadas desde cero llegan a Stage aceptado: 4/4 y 9/9 obligaciones con horario, cero HARD/REQUIRED.** La segunda cambia participantes, plantillas, espacio principal y composición de recursos: dos coaches reales. Se utiliza la UI para las plantillas, los días, las disponibilidades, la asignación de coach, la selección del scope, la propuesta, el Draft, la validación y la aceptación. Los catálogos de espacios/recursos se crean mediante sus APIs reales. No se prepara configuración operacional mediante SQL ni se importa una fixture A2 en ese entorno.

Esto entrega el primer perfil representable; **no cierra el P0 general**. El contrato actual necesita flujo principal, una preparación vocal enlazada por participante y coach explícito. La jornada sin principal queda `UNSUPPORTED`. Transporte, montajes, selección genérica por tipo y operaciones estructurales adicionales necesitan sus siguientes unidades causales. No se inventan Main, Comer, participantes, recursos ni horarios para satisfacer el contrato.

## Causa y recorrido exacto

| Frontera | Antes y autoridad ausente | Delta y consumidor |
| --- | --- | --- |
| Configuración general | `GeneralProgramSettings`/catálogo no declaraban la base Next | `NewDayPlannerEditor` → GET/PUT `/api/new-day-planner-configuration`; esquema estricto y CAS ADMIN |
| Plantillas | Ubicación/duración/dependencias existían; no había rol Next explícito | `TemplatePlannerRole` → `rulesJson.plannerNextOperation` v1; requisito de coach declarado separadamente |
| Crear día | `CreatePlanDialog` → POST `/api/plans` → `SupabaseStorage.createPlan` congelaba catálogos/optimizer, sin base Next | Snapshot inmutable `plans.planner_next_profile` v1 con revisión de origen; `plan_task_template_snapshots.planner_next_operation` conserva el rol |
| Crear participantes | `createContestantForPlan` → snapshots → `createDailyTask` autogenera las instancias | Se reutiliza el recorrido. Disponibilidad y coach se asignan por UI; los IDs todavía no existen al guardar la configuración general |
| Lectura del día | `getPlanEngineInputDetails` → `buildEngineInput` → `applyPlanPlannerNextConfiguration`; NULL devolvía el input sin autoridades Next | `applyNewDayPlannerConfiguration` materializa sobre las instancias efectivas y snapshots; después siguen las autoridades diarias de bloques, rondas y continuidad |
| Prerrequisitos | La grafía persistida `dependency_template_ids` se perdía en la normalización histórica | La declaración operativa v1 activa su lectura correcta. Sin esa declaración se mantiene la representación histórica ya fingerprintada. Una instancia previa ausente bloquea, no se elimina silenciosamente |
| Recursos | El coach del participante y el requisito de la tarea son autoridades distintas | Sólo una plantilla que declara `requiresCoach` materializa el coach asignado en `declaredResourceIds`; preflight conserva referencias, disponibilidad, locks y canales de recursos |
| Comida/transporte | Los campos legacy no constituían obligaciones Next válidas por sí solos | Una pausa global explícita conserva `protectedMeal`; no se proyectan como comida flexible sus parámetros inactivos. No se generan pausas de catálogo en días con perfil Next. Las pausas explícitas existentes permanecen visibles al preflight. El perfil declara transporte/montajes no aplicables y desactiva la clasificación legacy por nombres |
| Readiness | El inventario podía mostrar READY con Next ausente | `buildEffectiveConfigurationView` → `plannerReadiness` → **adaptador y preflight productivos**, incluida la validación canónica del problema adaptado. Estados READY/INCOMPLETE/INCOMPATIBLE/UNSUPPORTED y causas accionables |
| Propuesta | `AssistedProposalService.request`/`run` no llegaban al solver con esos inputs | Scope explícito → adaptación `SUPPORTED` → `executeAssistedPlanning` productivo → propuesta persistida → apply sólo al Draft → validación → RPC de aceptación → Stage completo |
| Identidad/replay | `taskOperations` v1 histórico exigía una lista estática exacta | No se persiste una lista nueva. `projectEffectiveAuthoritiesFromEngineInputV1` incorpora las operaciones efectivas a fingerprint/replay. Una alta cambia la identidad; un run con revisión anterior se rechaza |

La reproducción antes de activar el perfil general conserva el comportamiento NULL de la ruta ordinaria, en el mismo stack descartable. [before-input](native/before-input.json) y [before-preflight](native/before-preflight.json) registran **todos** los reasonCodes observados: faltan políticas, presupuesto, flujo, transiciones y roles, y aparecen contratos legacy no representables. El [catálogo íntegro de 62 reasonCodes](preflight-reason-codes.json) procede de la unión tipada vigente, sin redefinirlos ni ocultarlos.

## Autoridad, seguridad y protección

La migración aditiva 105 no actualiza filas históricas ni altera 088. General y día usan columnas/tabla separadas; no pueden coexistir dos autoridades estructurales en un día. El perfil del día no se puede modificar mediante UPDATE. No existe fallback ante una lectura fallida del perfil. Los snapshots sin declaración operativa conservan su forma/fingerprint anterior.

El catálogo general es server-only, con RLS y grants explícitos mínimos: SELECT/UPDATE para `service_role`; sin acceso directo de clientes. HTTP relee el rol y limita escrituras a ADMIN, con revisión esperada. La configuración diaria sigue usando los permisos, locks, revisiones y RPCs existentes. El refresh de plantillas recalcula las autoridades efectivas; su wrapper invoker conserva también la declaración operativa. No se cambia ninguna regla HARD/REQUIRED, presupuesto A2, timeout, fixture ni referencia canónica. Las únicas ampliaciones del preflight son defectos de materialización explícitos; el consumidor read-only de readiness se añade a la lista de fronteras autorizadas.

El ensayo nativo valida el ledger completo, la matriz efectiva de permisos de **todas** las tablas/funciones contra el contrato revisado, REST denegado, roles y CAS, el trigger de inmutabilidad y el aislamiento literal del primer día tras modificar el catálogo general. Los logs y traces privados permanecen fuera del repositorio. [integration.json](native/integration.json) registra `remoteWrites=0`.

## Recorrido y coste observados

| Día | Participantes | Plantillas | Recursos | Obligaciones con horario | Stages nuevos | Ramas | HARD/REQUIRED |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Entrevistas, 21/11/2026 | 2 | 2 | 1 coach | 4/4 | 1 | 21 | 0/0 |
| Segunda producción, 22/11/2026 | 3 | 3 | 2 coaches | 9/9 | 1 | 39 | 0/0 |

[journey.json](native/journey.json) registra tiempos, fingerprints, trabajo y comprobaciones. Cada recorrido conserva input, preflight/problema adaptado, propuesta, Draft, validación y Stage: [primera jornada](native/first-stage.json), [segunda jornada](native/second-stage.json). Las disponibilidades y la dependencia real están en sus inputs. Aplicar al Draft no modifica las filas aceptadas; aceptar consolida exactamente ese Draft. Las capturas muestran [configuración general](native/general-planner.png), [READY](native/first-ready.png) y [Stages aceptados](native/second-accepted.png).

Negativos demostrados: rol no clasificado y tarea previa ausente → INCOMPLETE y HTTP 422 sin invocar el solver; fin preferido posterior a la pausa global → INCOMPATIBLE, con la causa canónica `INVALID_PREFERRED_END`; eliminación del principal → UNSUPPORTED. Los inputs/diagnósticos de cada caso se conservan en `native/`.

## A2 inviolable

Antes de editar se ejecutó el replay desde S0 de la base exacta. Los deltas de autoridad/proyección y el candidato final vuelven a completar **266/266 y 11 Stages**. La comparación final y una repetición independiente conservan **todos los snapshots**, 27.049 ramas, 8.465 minutos agregados y la huella `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`.

Se reutiliza sin alterar assertions `docs/evidence/config-u06c/verify.ts`: revalida 22 certificados conjuntos, Future Feasibility, igualdad de placements protegidos, identidad de obligaciones y cero nuevas HARD/REQUIRED. [a2-report.json](a2-report.json) contiene comparación y calidad individual; los runs y snapshots íntegros se conservan comprimidos. El campo `base` del informe se identifica con la base realmente ejecutada, no con el SHA histórico incrustado en el observador reutilizado. Los tiempos locales varían bajo carga; no se declara mejora de CPU.

## Límite siguiente demostrado

Una alta **después de S0** ya materializa roles/dependencias para sus IDs nuevos y cambia la identidad efectiva. El run anterior se rechaza con `STALE_CONFIG_REVISION` antes de búsqueda; se preservan literalmente Stage y Draft. La [Evidence](native/added-after-s0-state.json) contrasta seis tareas efectivas con tres en el checkpoint. Reconciliar explícitamente el catálogo de obligaciones del Draft/revisión, conservando decisiones protegidas, es la siguiente unidad necesaria para ampliar días ya iniciados. Esta PR prueba el recorrido de preparación completa **antes** de S0; no presenta ese bloqueo como resuelto.

El perfil general del día tampoco tiene EDIT/RESTORE/REFRESH estructural propio todavía; su snapshot es inmutable. Los editores diarios ya existentes mantienen sus contratos. Una jornada sin flujo principal/coach o que necesite transporte, montajes, recursos seleccionables por tipo, comidas flexibles materializadas o estructuras opcionales requiere ampliar autoridad y consumidores de forma causal. P0 general continúa abierto.

## Reproducción y fuentes

```sh
bash docs/evidence/p0-u00a/reproduce.sh /tmp/p0-u00a-reproduction
```

Requiere Docker local, dependencias del lockfile y Chromium de Playwright. El script usa exclusivamente BD/Auth/PostgREST/HTTP/Chromium descartables para jornadas nuevas y replays offline separados para A2. Ningún script obtiene autorización para Supabase o Replit productivos.

Autoridad: Fuentes 00 v2.13 (ámbitos), 01 §6 (snapshots/precedencia), 03 (construcción principal/feeder y presupuestos), 04 (configuración efectiva, replay y protección), 05 (gates y verdad automática), 06 v2.10 (canon A2), 07 v2.2 (diagnóstico y comparación), catálogo de capabilities y auditoría configuration-p1. Este informe describe implementación y Evidence; no crea una nueva Fuente normativa.
