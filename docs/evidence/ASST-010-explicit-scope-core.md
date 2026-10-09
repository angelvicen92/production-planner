# ASST-010 — scope explícito y bloqueo posterior al refresh

**Resultado: objetivo bloqueado. PR draft, sin merge.** El delta permite obtener y aceptar la propuesta inicial del single-Main, pero ASST-010 sigue fallando en la propuesta posterior al refresh. Se detiene la expansión tras dos ciclos fallidos. A2-ASSIST-8 permanece en **266/266, 10 Stages y dos runs limpios**, materialmente idénticos al baseline.

Base: `codex/implementar-margenes-especificos-de-participante` @ `5e46168daa35d755bcb9a2573ed81647d8b466a2`. Blob productivo verificado de `assistedPlanning.ts`: `7a259c18301936dbbf4368cdc07cd736f5ec206e`. Observaciones compactas: [ASST-010-explicit-scope-core.json](ASST-010-explicit-scope-core.json).

## X — reproducción y causa inicial

El test original `server/benchmarks/runA2Assist7Evidence.spec.ts` falla en su primera aceptación, línea 162 del benchmark, con `NO_PROPOSAL`, `ASSISTED_SCOPE_INCOMPLETE` y `FUTURE_COLLECTIVE_CLOSURE_INCONCLUSIVE`. No se modifican sus expectativas ni sus selectores.

Cadena reconstruida:

1. `TASK_IDS:[10017]` → `resolveAssistedScope` → `task:10017`, elegido por la regla original del benchmark.
2. `analyticalFutureEligibleTaskIds` conserva únicamente estados `pending`/`interrupted` desde el producto.
3. `buildAssistedProblem` mantiene el Main y tres supporting: `task:10018`, `task:10021`, `task:10024`. Otros 36 Main/Vocal quedan fuera del ejecutable.
4. La guardia adicional exige que todos los Main/Vocal estén incluidos o protegidos, aunque sean elegibles como futuro. Deshabilita `analyticalFutureCollectiveContinuation`.
5. `runExactItinerantPlanSearch` no puede representar todos los ancestros exigidos por `PreparedFutureCollectiveParticipantClosure`; comunica falta de prueba y no emite `ScopeProposal`.

La hipótesis inicial queda confirmada para esa primera petición. El single-Main sí admite una continuación sound bajo la configuración inicial: ambos ciclos lo aceptan con contexto futuro certificado, sin ampliar su scope visible.

## Y — productor existente y límite de la hipótesis

Antes del cambio, una contraprueba pequeña con dos Main/Vocal demuestra que la continuación existente puede producir un certificado conjunto válido incluso cuando parte del core queda fuera del scope. No hace falta inventar un certificador ni un scheduler.

La prueba canónica que únicamente inyecta la continuación, conservando la proyección pequeña, se interrumpe tras más de seis minutos sin resultado. Es una observación inconclusa, no una prueba de inviabilidad ni de ausencia de productor. La proyección efímera del core permite reutilizar los exploradores estructurales existentes para alcanzar S1.

## Z — recorrido real alcanzado

El producto solicita, ejecuta, aplica, valida y acepta sólo el Main inicial. Después materializa el refresh de la dependencia `task:10018`, plantilla `20009`, de **10 a 20 minutos**, que afecta 19 tareas. Las aserciones previas al segundo scope comprueban que stages y snapshot S1 permanecen idénticos.

La segunda petición es `TASK_IDS:[10015]`, con el Main `task:10017` protegido en `[845,860]` y la pausa Main aceptada en `[890,965]`. El problema consumido contiene la duración nueva. Ambos ciclos fallan al obtener la propuesta de ese scope, línea 173, con `CORE_BRANCH_BUDGET_EXHAUSTED`.

Por tanto, ASST-010 **no alcanza** sus comprobaciones canónicas de AcceptedException, rollback, redo ni divergencia. Los tests aislados de esas autoridades pasan, pero no sustituyen el gate completo.

## W — delta retenido y dos ciclos

Sólo cambia lógica productiva en `engine/planner-next/assistedPlanning.ts`:

- Generaliza la guardia a obligaciones incluidas, protegidas o explícitamente elegibles; conserva el control de elegibilidad de tareas y comidas.
- Construye una proyección efímera usando el mismo builder y los mismos exploradores Main/feeder, dependencies y anchors. Ejecuta una sola búsqueda con su ledger existente.
- Filtra tareas y preparaciones contra la proyección autorizada antes de validar y emitir el resultado. El witness completo permanece como Evidence; no concede visibilidad ni protección a tareas futuras.
- En el segundo ciclo, los Main son raíces internas y sus Vocal se obtienen por closure. Esto conserva la clasificación de supporting del productor. No resuelve el gate posterior al refresh.

No cambian benchmark, expectativas, configuración canónica, budgets, timeouts, orden de scopes, DB, migraciones, UI, API ni otros motores. Tampoco se aborda S1, el budget 6.000 ni aislamiento.

## M — resultados y diagnóstico focal

| Comprobación | Base | Candidato final |
|---|---|---|
| ASST-010 | Falla antes de S1 | Acepta S1; falla después del refresh |
| A2-ASSIST-8 | 266/266, S10 | 266/266, S10, dos runs limpios |
| Material A2 | `ae079844…5afcc` | Igualdad completa con el baseline |
| S1 A2 | <300 s | 241,975 / 220,710 s |
| Ledger A2 por petición | 100.000 | Máximo observado 80.835; core + continuación = total |
| Nuevas HARD/REQUIRED / aceptados movidos en A2 | 0 / 0 | 0 / 0 |
| Proyección, replay y certificados | — | 36 tests PASS, incluidas tres contrapruebas nuevas |
| Regresiones ampliadas | Dos fallos directos de transporte | 317 PASS, mismos dos fallos reproducidos en base |
| TypeScript, build, secuencia y test de migraciones | — | PASS |

ASST-010 usa el default **300.000** de `buildCanonicalFullA2EngineInput`, ya presente en la base; A2-ASSIST-8 configura explícitamente **100.000**. No se aumenta ninguno. No se afirma que ASST-010 cumpla el máximo general de 100.000 solicitado.

La captura read-only del segundo ciclo, antes de devolver el resultado, registra **300.000 = 299.636 core + 364 standalone**. Se preparan 79 arquitecturas, 60 matchings perfectos y 52 hojas core. La frontera estructural termina; el fallback residual consume 288.190 ramas de matching y se agota a profundidad 2. El stop reason preciso es `MATCHING_SEARCH_BUDGET_EXHAUSTED`.

La primera autoridad negativa observada para una hoja es `FUTURE_PARTICIPANT_TASK_ZERO_DOMAIN`: Main `task:10002` @755 deja sin dominio a `task:10004`, de `participant:201`. Otra hoja obtiene un conflicto certificado de la cadena Reality C por `task:10102` @980. Son pruebas locales de rechazo de esas hojas, **no una prueba de que el scope actualizado sea globalmente imposible**. No llega a producirse un certificado conjunto para S2; no se fuerza `PROPOSAL` ni se convierte incertidumbre en aceptación.

El objetivo completo y el merge gate permanecen bloqueados. No se inicia un tercer delta causal.

Reproducción: `npx tsx --test server/benchmarks/runA2Assist7Evidence.spec.ts`. Para A2, ejecutar dos veces `runA2Assist8Evidence({reportIterationDurations:true})` desde snapshots vacíos y comparar `collectiveClosureDeterministicMaterial`, incluidos placements, recursos, unidades, comidas, preparaciones, certificados y accounting. Las observaciones de este trabajo nunca se usan como seeds del solver.
