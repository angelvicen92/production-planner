# P0-U00g — diagnóstico causal de comidas individuales

**Estado: BLOCKED; integración funcional detenida.** La pérdida de identidad propuesta queda demostrada desde una jornada creada por UI real. Restaurar únicamente esa identidad permite al adapter y al planificador utilizar las comidas, pero el recorrido nativo revela otra incompatibilidad antes de Stage. Conforme al prompt, este PR entrega diagnóstico e instrumentación; no habilita la capacidad ni modifica código productivo.

Base autorizada y verificada: `4571cb993ae221832630f3ac1c60a72318f83f8c`, `main` con U00f integrado. Se comprobaron los siete checks posteriores al merge en GitHub. Autoridades consultadas: AGENTS, maestro P0, Fuentes 00–07 (especialmente 03 §19, 04 comidas/snapshots, 05 gates y 07 §4.4), catálogo MEAL-02 y Evidence U00e/U00f. Las fotografías documentales de esos PR se interpretan como históricas.

## Primera pérdida demostrada

Una jornada independiente de A2 contiene dos participantes, dos actividades ordinarias por participante, dependencia preparación → entrevista y una plantilla de almuerzo sin espacio ni recursos físicos. Plantillas, perfil, parámetros de comida, jornada y participantes se crean/configuran por UI; el catálogo físico inicial se crea mediante la API real. La comida tiene duración 20 minutos, ventana 12:00–13:00 y capacidad simultánea 1. Todas las escrituras operativas usan la aplicación y su API sobre PostgreSQL 17, Auth y PostgREST descartables con el ledger completo; no hay SQL operacional ni escrituras remotas.

Recorrido: configuración → creación → snapshots diarios → `buildEngineInput` → `applyNewDayPlannerConfiguration` → reconocedor → preflight/adapter → Assisted → construcción/Future Feasibility → propuesta → Draft → validación SQL. El Stage queda bloqueado explícitamente; no se declara completitud productiva.

1. `native/builder-before-profile.json` conserva `mealTaskTemplateId=3`, duración 20, ventana y capacidad reales. Se obtiene mediante una vista de almacenamiento de sólo lectura que omite exclusivamente el perfil para observar la autoridad del builder; no cambia el día persistido.
2. `applyNewDayPlannerConfiguration` asigna `productive_task` y borra `mealTaskTemplateId`/nombre. Las instancias ordinarias de la plantilla no tienen `breakKind` alternativo.
3. `isFlexibleParticipantMealTask` no reconoce ninguna comida. El preflight produce `MISSING_SPACE_REFERENCE` para las dos comidas y `UNSUPPORTED_BREAK_SCOPE` para duración/capacidad y ventana. No es un fallo demostrado de búsqueda: todavía no hay problema adaptado.
4. El contrafactual mínimo restaura **sólo** el ID descartado. Una aserción compara íntegramente la entrada restaurada con `{...original, mealTaskTemplateId:3}`. No se cambian roles, espacios, recursos, estado, duración, capacidad, políticas ni budgets.
5. El adapter reconoce cuatro tareas y dos `ParticipantMealObligation`. El replay completo encuentra las seis obligaciones, HARD/REQUIRED válidos, comidas a 12:00–12:20 y 12:20–12:40, determinismo y Future Feasibility activa. Los tests demuestran que reducir la ventana a 20 minutos es inviable con capacidad 1 y viable con capacidad 2; también cubren dependencias que requieren preservar el último intervalo futuro.

El primer recibo se conserva en [causal/](causal/). [analysis.json](analysis.json) reproduce el diagnóstico offline y distingue los niveles de evidencia.

## Segunda incompatibilidad: propuesta de sólo comidas → validación

La reproducción autoritativa usa un **archivo exacto de la base autorizada**, sin el prototipo de integración. [identity-counterfactual.patch](identity-counterfactual.patch) actúa únicamente en ese archivo, detrás de un marcador inicialmente ausente. Tras capturar la entrada original, la UI solicita un scope de las dos comidas usando el mismo día y las mismas instancias.

- Preflight/adapter: `SUPPORTED`.
- Assisted: `PROPOSAL`, dos comidas seleccionadas, scope completo, `hardValid=true`, `requiredValid=true`, gate global de comidas `PASS`.
- El servicio incorpora los horarios de las comidas en `proposedDraftSnapshot`; el array `proposal` contiene sólo placements productivos y queda vacío para este scope legítimo.
- «Aplicar al borrador»: HTTP 200. Se conserva la identidad física nula de ambas comidas.
- «Validar borrador»: HTTP **422 `RUN_RESULT_INVALID`**. La función efectiva `assisted_record_proposal_clean_validation`, definida en migración 104, rechaza `jsonb_array_length(result->'proposal')=0`.
- La consulta de sólo lectura comprueba que coinciden hash del resultado, snapshot, fingerprint de Draft, scopes y prerrequisitos. La función SQL efectiva queda incluida en el recibo. No se atribuye el fallo a CAS ni a inviabilidad.
- S0 y `daily_tasks` permanecen intactos; la validación fallida conserva el Draft que el usuario acababa de aplicar. No se acepta ningún Stage ni se publica nada.

Recibos: [native/diagnostic-summary.json](native/diagnostic-summary.json), [native/validate-response.json](native/validate-response.json), [predicados SQL](native/sql-validation-predicates.json) y [captura UI](native/validation-blocked.png). `native/integration.json:PASS` significa que **la reproducción del bloqueo esperado pasó**, nunca que P0-U00g esté implementado.

Un probe preliminar sobre wiring temporal no cerró el gate; no es la autoridad de esta conclusión. Los recibos finales proceden exclusivamente del archivo exacto de `4571cb9` con restauración de ID y hashes verificables.

## Tercera incompatibilidad: proyección de comida protegida (offline)

El replay conserva la geometría de un testigo completo hard-válido y pasa comidas protegidas al mismo `buildAssistedProblem` usado por el producto. Esa función añade `fixedInterval` a la obligación y mantiene `status:pending`. `preflight` rechaza esa combinación mediante `FLEXIBLE_PARTICIPANT_MEAL_WITH_FIXED_INTERVAL`; la continuación devuelve propuesta nula con **cero ramas**. Se comprueban inmutabilidad de entrada y existencia previa del testigo completo.

Esto es una incompatibilidad representacional entre protección automática y estado de ejecución, **demostrada offline**. No se presenta como Stage nativo aceptado ni como prueba de inviabilidad. Cambiar la comida a `done` para sortearla falsearía ejecución; no se hace. Tampoco se relaja la validación ni se introduce un segundo solver.

## Alcance de aceptación y validación

El gate causal inicial es positivo, pero el gate integral queda **BLOCKED** por otra incompatibilidad estructural. Se detuvo la integración y se retiró el prototipo. `engine/`, `server/`, `shared/`, `client/` y `supabase/` conservan sus bytes de base. El harness existente también permanece intacto: la receta injerta el dispatch diagnóstico únicamente en el archivo descartable. Los modos U00a–U00f y la demo servida no cambian.

No se declaran cumplidos los gates A–H de la capacidad productiva: no hay dos jornadas UI→Stage ni certificación funcional U00g. No se ejecutan nuevas mediciones A2 aisladas o regresiones UI U00a–U00f después de la orden de detener implementación; sus resultados históricos no se reutilizan como resultados del candidato. Los hashes de **todos** los archivos TypeScript de Planner Next se comparan antes/después y contra el checkout entregado. La suite de producto, TypeScript, build, migraciones, tests diagnósticos y CI de esta entrega se registran en [checks/](checks/) y [validation.json](validation.json). Verde técnico certifica el diagnóstico, no resuelve los bloqueos.

La decisión de continuación corresponde a ChatGPT: definir el delta de integración por identidad y el tratamiento de propuestas de sólo comidas / protección automática, preservando HARD/REQUIRED, permisos, revisiones, replay y estado real de ejecución. Este PR no propone una reparación especulativa de esas fronteras.

## Reproducción

Node 20, dependencias del lockfile, Docker local y Chromium. No se versionan credenciales, logs privados ni trazas. La receta rechaza reutilizar directorios de Evidence y comprueba que ningún archivo del solver cambie.

```sh
node node_modules/typescript/bin/tsc -p script/diagnostics/tsconfig.u00g.json
node --import tsx --test script/diagnostics/u00gMealGate.spec.ts
node --import tsx script/diagnostics/analyseU00gMealGate.ts docs/evidence/p0-u00g/causal work/u00g-analysis.json
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx script/diagnostics/runU00gMealGate.ts work/u00g-native-fresh
```

Sin merge, despliegue Replit, modificación de Supabase productivo, cambios a la demo ni optimización A2.
