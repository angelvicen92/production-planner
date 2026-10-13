# Preferencia SOFT de bloques: diagnóstico y condición de parada

Base autorizada: `20e4b30fbccde3615602fffadcf5f5e9a136c705` (#1117).
Rama: `codex/mainflow-soft-block-count-preference`. Estado: **BLOCKED**.
La preferencia no se incorpora al producto en este PR. Se retiraron los cambios
del motor, UI, configuración y migración preparados durante el experimento.
No se modificaron Supabase real, 27001/27002 reales ni Replit. No hay merge.

## Resultado que decide la unidad

El A2 permite propuestas completas de 3 y 4 bloques dentro de los presupuestos
vigentes. Sin embargo, priorizar esas familias y conservar patrones mínimos en
la enumeración **no protege el fallback de una petición fría**: un contraejemplo
genérico completa AUTO en 51 branches y agota 1.000 al solicitar 4, sin recuperar
la misma solución válida de 2 bloques. Por ello se activa la parada solicitada
en el prompt: no añadir heurísticas ni aumentar presupuestos para promover la UI.

La retención de un `JOINT_COMPLETION` previo revalidado sí superó su prueba focal
con un ledger limitado. Eso protege una solución ya certificada dentro del
motor; no resuelve una primera petición sin witness previo.

## Baseline y comparación A2

La reproducción usa PostgreSQL, Auth, PostgREST, HTTP y Chromium descartables.
El día local 27002 conserva literalmente el día local histórico, sus Stages,
333 tareas ajenas y el catálogo. S0 + 11 aceptaciones completan **266/266**, sin
HARD/REQUIRED. Las 30 comprobaciones de esta ejecución incluyen persistencia,
recarga, protección, comidas, rollback/redo y rechazo del reset Legacy.
No se repitieron aquí las variaciones de orden/Autopilot ya certificadas en #1117.

Fingerprint final AUTO:
`c0cc8bf4e1c466a9640b7ce765e0dceeb5772204a8f387f50e1af12d844ec703`.
Es idéntico al baseline integrado. Los 55.625 branches también coinciden.

| Ejecución | Bloques | Cobertura del witness | Branches CORE / standalone | Arquitecturas autorizadas | Tiempo de generación |
|---|---:|---:|---:|---:|---:|
| AUTO, producto descartable | 2 | 266/266 | 9.343 / 46.282 = 55.625 | 21 | 175,923 s |
| Preferencia 3, experimento aislado | 3 | 266/266 | 5.667 / 44.752 = 50.419 | 10 | 236,647 s |
| Preferencia 4, experimento aislado | 4 | 266/266 | 5.113 / 24.389 = 29.502 | 10 | 130,470 s |

Las preferencias 3/4 producen un `JOINT_COMPLETION` de toda la jornada, validado
contra el problema original, incluidas las 19 comidas de participante y las
obligaciones operativas. No son una nueva jornada consolidada ni doce Stages
aceptados: el scope visible del experimento es Main. Los horarios humanos no
son seed. No se declara optimalidad ni superioridad operativa global.

| Contador estructural | AUTO | 3 | 4 |
|---|---:|---:|---:|
| Patrones Main visitados | 2 | 17 | 140 |
| Timelines generados | 858 | 567 | 505 |
| Rechazos necessary-only | 722 | 438 | 406 |
| Arquitecturas preparadas | 21 | 10 | 10 |

Se mantienen `maxPatterns=200`, `maxBranchExpansions=100000` y el límite del
motor de 300 s. El baseline de #1117 midió 155,254 s para S1; esta reproducción
midió 175,923 s. Una primera ejecución del harness alcanzó su espera UI de
180 s. Se repitió en una copia que esperaba el techo de motor ya vigente de
300 s; no se modificó el solver ni su límite. No se interpreta esa espera UI
como prueba de inviabilidad.

## Call path auditado

`DayConfiguration` → `dayConfigEditSchema` / servicio diario → configuración
efectiva y `plan_config_revisions` → `buildEngineInput` → adapter →
`resolveAssistedScope` → `buildAssistedProblem` → `executeAssistedPlanning` →
`executePlannerNext` → exact core / completion → validación y Evidence →
propuesta, Draft y Stage.

Las autoridades reutilizables son la configuración diaria, snapshots/replay,
`mainFlowPatterns`, el frontier de timelines, matching por bundles, Future
Feasibility, el ledger compartido y el validador. No se creó otro planificador.

Puntos concretos encontrados:

- `generateMainFlowPatterns` construye familias por número creciente. Las rutas
  exactas y el frontier de `anonymousPipelineWitness` consumen ese orden. El
  experimento prioriza familias **antes** de truncar; retiene las dos mínimas
  en los fixtures de dos claves. No aumenta 200 ni reordena únicamente un
  array ya truncado. Esto no es todavía un diseño genérico aprobado.
- `constructExactItinerantPlan` puede anteponer una arquitectura nominal;
  `runExactMainAndFeederSearch` puede anteponer un bundle. Ambos deben obedecer
  la preferencia antes de convertirse en arquitectura seleccionada.
- `runExactItinerantPlanSearch` acepta inmediatamente un `JOINT_COMPLETION`
  revalidado. Una preferencia nueva puede quedar ignorada si el witness es sólo
  reutilizable y Main todavía no está aceptado. Si Main está aceptado o locked,
  esa geometría prevalece y la desviación debe explicarse.
- `deriveArchitectureFromProtectedMains` reconoce la geometría contra un
  prefijo truncado de patrones. Reconocer geometría aceptada no debe depender
  del nuevo ranking ni convertirla en movible.
- El ledger es compartido entre CORE y standalone. Los diferimientos existentes
  ceden trabajo a otras arquitecturas del explorador; no reservan capacidad
  para una familia mínima situada detrás de toda la familia preferida.
- El contrato diario Next existente está congelado por migration 088. Su edición
  requiere persistencia/revisión controlada. Fuente 04 §20.6 describe además
  `FIXED_COUNT` como REQUIRED; no representa la preferencia SOFT solicitada.

## Contraejemplo causal sin witness previo

El fixture no usa nombres, IDs ni horarios A2. Tiene cuatro Main de 5 minutos,
dos por cada clave, continuidad REQUIRED y espacio Main disponible `[60,80]`.
Dos tareas futuras independientes del grupo `a` duran 5 minutos, tienen ventana
`[70,75]` y dependen de su Main. Los buffers declarados son cero.

La carga Main ocupa exactamente toda su ventana: sus inicios son 60/65/70/75.
Las dos obligaciones futuras empiezan necesariamente en 70 y exigen que ambos
Main de `a` terminen a más tardar en 70. La arquitectura `a a b b` lo permite.
En cuatro bloques, `a b a b` sitúa el segundo `a` hasta 75 y `b a b a` hasta 80:
ambas familias contradicen esa cota hard futura, independientemente de identidad
nominal, feeders o recursos. Esta es una prueba propia del fixture, **no una
conclusión inferida del agotamiento de búsqueda**.

| Presupuesto compartido | AUTO | Preferencia 4 |
|---:|---|---|
| 51 | COMPLETE, 2 bloques, hard-valid, 51 branches | BRANCH_BUDGET_EXHAUSTED, 51 branches |
| 102 | COMPLETE, 2 bloques, hard-valid, 51 branches | BRANCH_BUDGET_EXHAUSTED, 102 branches |
| 1.000, presupuesto original del fixture | COMPLETE, 2 bloques, hard-valid, 51 branches | BRANCH_BUDGET_EXHAUSTED, 1.000 branches |

Las tres comparaciones se repiten determinísticamente. Se generan los seis
patrones sin truncamiento, incluidos los dos de dos bloques. En todas las
preferencias fallidas sólo se entra en **una arquitectura**, mientras se gasta
presupuesto en el CORE. El fallback está en el array, pero no es alcanzado.
El resultado del motor sigue siendo INCONCLUSIVE; no se falsea a INFEASIBLE.

La causa no es falta de patrones ni su corte en 200. La ventana hard del trabajo
posterior no está proyectada como cota de cohorte/arquitectura antes del trabajo
nominal/feeder. El forward check puede rechazar decisiones concretas demasiado
tarde; la imposibilidad común no elimina la familia preferida antes de gastar
el presupuesto que AUTO necesita.

## Experimento mínimo siguiente, sin implementar en esta unidad

Hipótesis falsable: proyectar hacia Main la cota hard de sus dependientes futuros,
reutilizando dominios/dependencies y matching necessary-only existentes, elimina
las dos familias de cuatro bloques del contraejemplo antes del DFS nominal.
Aquí la cota demostrable es `Main(a).end <= 70`. El matching de cada familia
preferida tiene dos demandas `a` y sólo un slot compatible: un certificado
necesario de insuficiencia basta, sin convertir N en HARD.

El gate mínimo es recuperar exactamente el fallback hard-válido de AUTO con el
**mismo presupuesto 51**, sin evaluar candidatos gratis, aumentar límites,
añadir otro scheduler ni copiar el plan humano. Después debe conservar los
witnesses completos A2 de 3/4, el AUTO y sus fingerprints, y los Stages/locks.
Si esa autoridad no basta o no es sound, debe diagnosticarse el nuevo call path
antes de otra modificación; no repartir porcentajes arbitrarios del presupuesto.

Una petición fría y una petición con witness previo deben probarse por separado.
Conservar un incumbent revalidado es necesario cuando existe; no demuestra
protección del fallback cuando todavía hay que construirlo.

## Reproducción y entrega

```sh
node --import tsx script/demo/mainFlowSoftBlockDiagnostic.ts --cold-only
node --import tsx script/demo/mainFlowSoftBlockDiagnostic.ts work/main-flow-soft-blocks-full
```

En un checkout shallow, obtener primero la base autorizada con
`git fetch --no-tags --depth=1 origin 20e4b30fbccde3615602fffadcf5f5e9a136c705`.
El segundo comando repite COLD, AUTO y preferencias 2/3/4 en un checkout
archivado de esa base bajo `work/`; nunca aplica el patch al producto.
El avance posterior de main (#1118) no modifica el código/fixture diagnosticado. Usa fixtures locales
y verifica que los hashes productivos siguen intactos. Los workers A2 mantienen
el límite de motor de 300 s; la espera externa de 305 s incluye arranque/salida.
CI ejecuta el diagnóstico frío. El script completo es una reproducción opcional
costosa; las capturas A2 3/4 de esta unidad están archivadas.

La [Evidence JSON](MAIN-FLOW-SOFT-BLOCKS.json) contiene resultados, waterfall,
contadores, hashes, presupuestos y manifest. Los tres `.json.gz` conservan la
integración AUTO y los resultados completos A2 3/4; no contienen logs privados
de la app ni credenciales. El [patch experimental](MAIN-FLOW-SOFT-BLOCKS-search-experiment.patch)
sólo documenta el cambio de búsqueda ensayado; no es código productivo.

Gates locales del head diagnóstico: **2866/2866 tests productivos PASS**, cero
fallos/skip, con las dos exclusiones históricas del workflow; TypeScript,
TypeScript de integración, build, secuencia de migraciones y diagnóstico frío
PASS. Los diez checksums oficiales permanecen válidos. CI remota se informa en
la PR y no constituye aprobación de la funcionalidad bloqueada.

La UI, nueva persistencia, actualización normativa y certificación final de la
funcionalidad quedan pendientes. No se elevan 00/03/04/06 ni checksums porque no
se incorpora la nueva semántica al producto. Las pruebas focales verdes del
prototipo retirado no sustituyen el gate de completitud que falló.

Decisión de merge propuesta: **sólo diagnóstico y Evidence**, si sus gates/CI
pasan. **No aprobar la funcionalidad ni su despliegue**. Sin merge realizado y
sin cambios de reutilización de plantillas de PR #1118.
