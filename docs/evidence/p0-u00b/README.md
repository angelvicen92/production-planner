# P0-U00b — jornadas sin flujo principal

Base comprobada: `be5d817c23aec2cf69029bd675edeed8c7d5c0d6`. Rama exclusiva: `codex/p0-new-day-standalone-no-main-u00b`. Sin migraciones nuevas, cambios productivos, publicación ni merge.

**Dos jornadas nuevas creadas desde la UI alcanzan Stage aceptado sin MAIN, VOCAL ni coach: 6/6 auxiliares y 3/3 operaciones técnicas.** El segundo día no tiene concursantes. Las plantillas, roles, dependencias, altas de día/tareas, configuración general, selección de scope, propuesta, Draft, validación y aceptación atraviesan la UI real. Los catálogos físicos, asignaciones y ventanas diarias usan las APIs productivas. No se introduce configuración operacional por SQL ni se importa A2 para esas jornadas.

## Causa y contrafactual

La reproducción mínima reutiliza tres actividades explícitamente auxiliares, con salas y disponibilidades válidas y sin recursos/coach necesarios. En la base:

- `mainFlow` ausente → `MISSING_MAIN_FLOW_CONFIGURATION`.
- Con el contrato de flujo pero sin tareas MAIN → adapter `SUPPORTED`, core `UNSUPPORTED_CORE_SHAPE / MISSING_MAIN_TASK`, ejecución `CORE_FAILED`.
- Declarar `STANDALONE_ONLY` en la base tampoco habilita la capacidad: el contrato anterior sigue exigiendo `mainFlow`.

[causal.ts](causal.ts) ejecuta el mismo observador en base y candidato. Los inputs, diagnósticos y resultados están en `before/` y `after/`. En el candidato, omitir MAIN sin perfil explícito sigue rechazándose. Sólo la ausencia intencional declarada por `STANDALONE_ONLY` produce `SUPPORTED` y completitud.

Recorrido real: configuración general → snapshot inmutable de día → roles/dependencias de plantillas congeladas → instancias efectivas → `buildEngineInput` → `applyNewDayPlannerConfiguration` → preflight/adapter → `resolveAssistedScope`/`buildAssistedProblem` → `executePlannerNext` → `runExactItinerantPlanSearch` → core vacío explícito → **la misma continuación standalone existente** → propuesta persistida → Draft → validación → RPC de aceptación de Stage.

## Separación mínima

El esquema general es una unión discriminada. `MAIN_WITH_VOCAL_FEEDER` conserva su contrato anterior; `STANDALONE_ONLY` no admite una propiedad `mainFlow` y requiere la policy exacta ya existente. La materialización emite únicamente `profile: STANDALONE_ONLY`; no crea tarea, participante, espacio, recurso ni hora de flujo principal.

`PlannerNextProblem.mainFlow` y el input de integración admiten ausencia representada explícitamente. Preflight continúa exigiendo el flujo en los contratos históricos. Mezclar el perfil standalone con MAIN/VOCAL o un `mainFlow` da `UNSUPPORTED` accionable. La configuración general mantiene ADMIN/CAS y los snapshots diarios existentes; no hay otra autoridad estructural ni modificación del contrato SQL de inmutabilidad.

`runExactMainAndFeederSearch` sólo admite el core vacío después de comprobar el perfil y el preflight canónico. Entrega un único candidato `EMPTY_STANDALONE` a la continuación usada por los cores ordinarios, con contexto protegido cuando existe. No hay un solver nuevo, un dominio alternativo, ni un segundo presupuesto: `searchStandaloneForCoreCandidate` conserva selección por dificultad, dominios, dependencias, recursos, comidas aplicables, Future Feasibility, retroceso y validación HARD final. Un resultado incompleto no entrega placements parciales como propuesta completa.

Los consumidores generales de comidas no encuentran una comida de flujo si no existe ese flujo. La pausa global declarada continúa bloqueando los espacios. Continuidad auxiliar compara con el espacio principal sólo cuando existe. La enumeración de pipelines principales no se inicia sin `mainFlow`. Los accesos a MAIN de observadores históricos sólo reciben ajustes de tipos, sin cambios en datos ni assertions canónicas.

El perfil efectivo entra en fingerprints y replay; su omisión histórica conserva la representación anterior. Readiness usa el adapter productivo y muestra MAIN/preferencias de MAIN como no aplicables en este perfil. No convierte un contrato MAIN incompleto en una jornada standalone.

## Jornadas nuevas y negativos

| Jornada | Participantes | Plantillas/tareas | Salas | Recursos requeridos | Resultado | Ramas core/standalone | HARD/REQUIRED |
| --- | ---: | --- | ---: | --- | --- | --- | --- |
| 24/11/2026, auxiliares | 3 | 2 / 6 | 2 | ninguno | Stage, 6/6 | 0 / 7 | 0 / 0 |
| 25/11/2026, técnica | 0 | 3 / 3 | 2 | kit físico compartido | Stage, 3/3 | 0 / 108 | 0 / 0 |

La primera cambia la disponibilidad de los tres participantes y enlaza las dos tareas de cada uno. La segunda encadena instalación → calibración → verificación, con ventanas distintas de salas, disponibilidad del kit y transición física configurada. `native/journey.json` registra tiempos y fingerprints. Cada día conserva input, preflight/problema adaptado, propuesta, replay independiente, Draft, validación, revisión y Stage. Las capturas acreditan configuración, READY y aceptación. Cada replay conserva propuesta y fingerprint. Aplicar al Draft no altera las tareas aceptadas; aceptar consolida exactamente el Draft validado.

Negativos nativos: un rol vocal dentro del perfil standalone bloquea readiness y preflight; una disponibilidad válida del kit de sólo cinco minutos no permite tareas de diez, devuelve `NO_PROPOSAL` con causa explícita y mantiene Draft/S0. Se comprueban CAS obsoleto, cinco roles Auth, inmutabilidad del perfil diario y aislamiento literal del primer día al cambiar la configuración general.

Los tests focales añaden referencias inexistentes, ciclos, recursos ausentes, contradicciones de perfil/policy, agotamiento de presupuesto sin éxito parcial, protección de placements en scopes sucesivos, ventanas y pausa global, continuidad REQUIRED e imposibilidad de satisfacerla. La integración repetida de U00a conserva además la matriz nativa completa de privilegios, denegación REST y rechazo de runs obsoletos antes de búsqueda.

## Regresiones y gate

`u00a-comparison.json` contrasta los problemas, fingerprints, identity maps y snapshots aceptados de las dos jornadas U00a contra la Evidence de la base integrada U04a: **4/4 y 9/9, problemas y placements idénticos, cero HARD/REQUIRED**. `u00a/` conserva sus resultados instrumentados nuevos.

El replay A2 parte de S0 en la base exacta y en candidato/repetición bajo el mismo Node 20 y lockfile. Se reutiliza `docs/evidence/config-u06c/verify.ts` **sin cambiar sus assertions**: completitud 266/266, 11 Stages, igualdad de snapshots, 27.049 ramas, 8.465 minutos agregados, huella `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`, 22 certificados conjuntos, Future Feasibility, determinismo y protección. `a2-report.json` y los runs/snapshots comprimidos contienen la comparación exacta. No se declara una mejora de CPU.

Los resultados de TypeScript, build, migraciones, suite completa de producto y CI se registran en `validation.md`. Los servicios nativos aplican el ledger completo exclusivamente a PostgreSQL descartable; `remoteWrites=0`. Los logs de aplicación, credenciales Auth y traces privados permanecen fuera del repositorio. `source-hashes.json` identifica el código instrumentado: las ejecuciones locales previas al commit parten de la base indicada con el delta candidato, no se presentan como ejecuciones del árbol limpio de esa base.

## Capacidades y siguiente bloqueo P0

Se habilitan auxiliares físicos con participante y operaciones técnicas sin participante, dependencias por plantillas/instancias, espacios, recursos explícitos, ventanas, transiciones y continuidad auxiliar soportada. Capacidad física y recursos conservan sus validaciones previas. Los perfiles nuevos siguen declarando transporte/montaje no aplicables; no materializan comidas flexibles, selección genérica de recursos por tipo, consumo de unidades itinerantes ni todas las familias estructurales. Requisitos explícitos no representables se rechazan; no se eliminan para planificar.

El snapshot estructural diario sigue siendo inmutable, sin editor/adopción histórica. **Añadir obligaciones después de S0 sigue bloqueando la continuación por revisión obsoleta, sin reconciliación de Stage/Draft.** La repetición U00a del candidato vuelve a demostrar `STALE_CONFIG_REVISION` y conservación literal del estado protegido; su Evidence está en `u00a/added-after-s0-state.json`. Éste es el siguiente bloqueo P0 demostrado. U00b amplía una familia real de jornadas preparadas antes de S0; no cierra P0 general.

## Continuidad operativa y reproducción

Comprobación **comunicada por el usuario el 22/10/2026**: la aplicación publicada pasó reinicio Assisted y completado automático A2. Este dato humano no es una ejecución instrumentada por esta PR. La demo La Voz del 23/10/2026 permanece congelada: esta unidad no aplica migraciones productivas, no publica Replit, no cambia jornadas A2 reales ni hace merge.

```sh
bash docs/evidence/p0-u00b/reproduce.sh /tmp/p0-u00b-reproduction
```

Requiere Node 20, dependencias del lockfile, Docker local y Chromium de Playwright. Autoridad: Fuentes 00–07 por ámbito, catálogo de capacidades y Evidence U00a/U04a/U06c. Este informe no redefine esas Fuentes.
