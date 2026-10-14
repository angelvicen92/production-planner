# MAIN-FLOW-SOFT-MEAL-SPLIT-DAY-CONFIG

Base: `022a2db19245e406eb1774901e4dc55a331c4d0c` (#1122). Rama: `codex/mainflow-soft-meal-split-day-config`. Captura: 2026-10-14. Esta Evidence describe implementación y pruebas; la autoridad normativa son las Fuentes oficiales vigentes.

## Resultado comprobado

La configuración general y el override diario llegan al buscador existente. En A2 frío, «Preferir 4» y «2 antes / 2 después» seleccionan una terminación completa de **cuatro bloques lógicos, 2+2**, con comida efectiva **13:10–14:25**, **266/266**, **42.276 ramas** y **cero HARD/REQUIRED**. El recorrido nativo autentica, guarda, recarga, genera, muestra Evidence, aplica Draft, valida y acepta S1–S11.

| Petición fría por input productivo | Bloques | Reparto materializado | Ramas CORE + standalone | Obligaciones |
| --- | ---: | --- | ---: | ---: |
| AUTO, sin preferencia | 2 | Sin reparto solicitado | 9.343 + 46.282 = **55.625** | 266/266 |
| SOFT 3, sin reparto | 3 | 1 antes + 1 después; un bloque abarca la comida | 5.667 + 44.752 = **50.419** | 266/266 |
| SOFT 4, sin reparto | 4 | 1+3 | 5.113 + 24.389 = **29.502** | 266/266 |
| SOFT 4, preferir 2+2 | 4 | **2+2**, sin bloque que abarque el descanso | 5.809 + 36.467 = **42.276** | 266/266 |

AUTO y SOFT sin reparto conservan las ramas de #1122. En SOFT, la primera familia STRUCTURAL es N en la rama cero; no hay gasto AUTO previo ni revalidación de un incumbent en estas peticiones frías. Presupuestos sin ampliar: 100.000 ramas, 200 patrones y 300.000 ms en el perfil productivo. El run nativo 2+2 consume 108.102 ms de motor (109.041 ms de generación HTTP/UI). Los tiempos dependen del entorno; las ramas y los fingerprints coinciden entre replay y producto.

Fingerprints, con sus dominios separados:

| Dominio | Valor |
| --- | --- |
| AUTO, snapshot productivo final S11 | `c0cc8bf4e1c466a9640b7ce765e0dceeb5772204a8f387f50e1af12d844ec703` |
| AUTO, JOINT_COMPLETION | `0f3bcac7a1a447203edbb6c41307291968a7be731f09ae8353560e8427b04bf8` |
| SOFT 3, JOINT_COMPLETION | `ff6ea5bdb284813d320e50a7c57cb15c64d1c7ffa72b723dffab4228468b86c1` |
| SOFT 4 sin reparto, JOINT_COMPLETION | `a2e7ebaa841c8c8676ee9544ce1fd8780c0e6f61148f3ea9a33814ca514d3254` |
| SOFT 4 / 2+2, JOINT_COMPLETION | `d32e8c85cd49ccec1a6e1a6e3e470bb2094d044f7f07c232d5275d8f31a55542` |
| SOFT 4 / 2+2, búsqueda completa | `da779e9a569d07591b74044af3dfa952e09e28adf8ffd290e9217e024b824671` |
| SOFT 4 / 2+2, snapshot productivo final S11 | `fc506212623067224ed40cf396ac31f1dbdcd5f7cb729126a8af330ad79ea565` |

## Auditoría causal previa y delta

Se consultaron AGENTS, las Fuentes 00–07 y las Evidence MAIN-FLOW-SOFT-BLOCKS, MAIN-FUTURE-DEPENDENCY-BOUND, MAIN-FLOW-INCUMBENT-SAFETY y MAIN-FLOW-SOFT-PREFERRED-FIRST (#1119–#1122).

Antes de editar, el fixture focal devolvía cuatro bloques, **4+0**, en 57 ramas. Su propia geometría ya admitía el corte 2+2. A2 frío SOFT 4 devolvía **1+3**, 29.502 ramas y 266/266. La autoridad de cantidad existía; faltaba una autoridad tipada de reparto y su propagación antes de la primera terminación completa. Después del delta, el fixture selecciona **2+2**, también en 57 ramas, con fingerprint distinto. No es una reclasificación posterior del mismo plan.

Camino real comprobado:

`program_settings / plans → EffectiveConfig + revisión/replay → buildEngineInput → engineInputAdapter → Assisted scope → constructExactItinerantPlan → patrones → frontier de arquitectura/timeline → comida efectiva → matching/feeder → Future Feasibility → JOINT_COMPLETION → ScopeProposal + Evidence → Draft validado → Stage aceptado`.

El fixture de comida flexible reveló una segunda causa en el residual: la validación/materialización de la hoja usaba el inicio preferido de comida en lugar del inicio elegido por el timeline. Para el reparto configurado se transmite ahora ese inicio elegido al hard gate y a la continuación existente. Con una ventana flexible 70–100, el caso sólo termina con 2+2 cuando materializa 85–90; la prueba comprueba precisamente ese movimiento. AUTO y SOFT sin reparto conservan su recorrido anterior.

## Contrato, persistencia y seguridad

`shared/mainFlowPreference.ts` define un contrato Zod estricto y compartido:

```ts
blockCountPolicy:
  { mode: 'AUTO_MIN_FEASIBLE' }
  | { mode: 'SOFT_PREFER_N', count: number }
mealSplitPreference:
  { mode: 'OFF' }
  | { mode: 'PREFERRED', beforeMealBlocks: number, afterMealBlocks: number }
```

La suma debe coincidir con N. La validación diaria usa los números representables por la gramática real de patrones, mínimo por run, máximo por coach y tareas efectivas; no impone un máximo universal de seis. Un cálculo de capacidades evita enumerar todos los patrones al consultar configuración; una prueba exhaustiva focal lo contrasta con el generador existente. Se comprueba la comida aplicable. Cero antes se admite para comida operacional; la autoridad SPACE/CANONICALIZED existente exige trabajo previo y se explica su incompatibilidad. Cero después es representable. La configuración general valida la forma; la geometría concreta se valida al editar/adoptar y se muestra en la configuración efectiva de cada día.

La migración **092** añade columnas escalares de cantidad y bloques anteriores a `program_settings`, y valor efectivo, baseline heredado, origen y metadatos de override en `plans`. El reparto posterior se deriva de la suma. Las jornadas existentes conservan AUTO y origen LEGACY_BACKFILL; nuevas jornadas heredan la configuración general. Cambiar la configuración general no reescribe días existentes. La adopción explícita avanza el baseline y conserva un override vigente; restaurar usa ese baseline local.

No se escribe ni reinterpreta retrospectivamente `planner_next_configuration`. El trigger inmutable de **088** permanece intacto. `buildEngineInput` compone la nueva autoridad después del snapshot; AUTO ausente conserva el input histórico. El adapter asigna N explícitamente a `preferredBlockCount` y transmite el reparto estructurado.

La operación v3 usa el writer versionado existente, lock del plan, actor admin/production, revisión esperada y comprobación del replay frente a los valores efectivos. Sólo service_role puede invocarla; se deniega RPC a clientes y UPDATE directo de las nuevas columnas. Un pin del baseline general bajo FOR SHARE evita adoptar una versión distinta por carrera concurrente. Las revisiones siguen siendo inmutables: se retira el FOR UPDATE innecesario sobre su lectura, porque el lock del plan fija el puntero; no se concede UPDATE a la tabla de revisiones. RESTORE inserta su origen correcto desde el inicio.

La identidad/fingerprint y el replay incluyen la autoridad efectiva a través del EngineInput. Un cambio invalida la validación del Draft y hace stale las propuestas previas. Rollback/redo de planning conserva la configuración vigente. Los contratos de Stage, locks, tareas done/in_progress y restricciones aceptadas se mantienen.

## Prioridad efectiva y contabilidad

Se reutilizan `mainFlowMeal`, `mainFlowPatterns`, `anonymousPipelineWitness`, `exactMainAndFeederCore` y `exactItinerantPlan`. Dentro de cada familia de cantidad, el frontier estructural recorre primero los cortes que satisfacen el reparto en todos sus patrones y después los demás cortes autorizados. El residual aplica los mismos dos niveles dentro de la familia. Los iteradores siguen siendo perezosos; no se genera globalmente el producto cartesiano. No hay un ledger nuevo ni un presupuesto adicional.

El reparto sólo ordena. Los demás cortes, incluido cero antes cuando lo autoriza una comida operacional, permanecen como alternativas. El SOFT de #1122 sigue priorizando N antes de cantidades alternativas. Un incumbent completo sólo satisface la petición nueva si cumple cantidad y reparto; si no, se conserva como alternativa segura y se busca con el ledger existente. Una cantidad correcta prevalece sobre una cantidad distinta aunque ésta tenga mejor reparto.

La distribución materializada agrupa runs lógicos de coach/blockKey, incluyendo sus tareas a ambos lados de una interrupción autorizada de comida. Un bloque que abarca el descanso se cuenta **una vez**, y no se suma como bloque completo anterior ni posterior. La frontera es exclusivamente el inicio/fin de la comida materializada; no hay hora fija ni seed humano.

`mainFlowSoftPreference` mantiene `requested`, `achieved` y `targetAchieved` para cantidad; añade solicitud y resultado de reparto, cumplimiento, comida efectiva, bloque que abarca el descanso y fallback QUANTITY/DISTRIBUTION. Conserva fases, ramas, límite, runtime, stopReason, fingerprints y certificados de autoridad ya existentes. La UI consume la Evidence del run seleccionado mediante un DTO compartido; no importa el solver ni reconstruye el plan a partir de la lista parcial del scope.

## Gates y fallbacks

| Gate | Resultado local |
| --- | --- |
| A, AUTO | 266/266; 55.625 ramas; fingerprint productivo canónico; S0 + 11 Stages; HARD/REQUIRED 0 |
| B, SOFT sin reparto | 3 → 50.419 ramas; 4 → 29.502; ambos 266/266; familia N desde rama cero |
| C, genérico | 14 pruebas: cambio real de selección, structural/residual, comidas en distintas horas, flexibilidad, bloque que abarca descanso, ausencia de comida, forma inválida, cero, tres coaches y seis bloques |
| D, A2 4/2+2 | Cumplido por input tipado frío y por UI/SQL reales; 42.276 ramas; 266/266; 13:10–14:25; HARD/REQUIRED 0 |
| E, configuración/seguridad | SQL/Auth/HTTP/Chromium descartables; roles, snapshot 088, herencia, override, recarga, revisión/replay, refresh/restore, stale, Stages y rollback/redo; sin cambios en otros días |
| F, producto UI | Configurar → guardar → recargar → generar → mostrar Evidence → aplicar → validar → aceptar; completados S1–S11, 45 checks del harness, sin errores de página |
| G, regresión | 2.921/2.921 pruebas de producto; import/config 28/28; aislamiento 8/8; SOFT vigente 28/28; tipado y build PASS; secuencia hasta 092 y diez checksums PASS; benchmark canónico doble idéntico |

El fixture de fallback de reparto solicita 4/2+2 y selecciona **4/3+1**; registra DISTRIBUTION, sin certificado de inviabilidad. Otro sólo admite la alternativa 0+4 operacional y la conserva. El fixture de fallback de cantidad conserva la terminación completa de **dos bloques** después de intentar cuatro. El diagnóstico frío existente reproduce AUTO en 51 ramas, alternativa SOFT completa en 95 y agotamiento sin terminación en 51; mismo ledger y sin elevar límites. Las pruebas SOFT previas cubren incumbent, protecciones, locks y estados done/in_progress.

Los mensajes distinguen cumplimiento, alternativa de reparto, alternativa de cantidad y ausencia de terminación. El agotamiento no demuestra inviabilidad. Un HARD_INCOMPATIBLE sólo procede del certificado específico de geometría principal protegida ya existente, no del mero incumplimiento de una preferencia.

La suite de producto usa las dos exclusiones históricas ya presentes en CI (`runFullA2FirstExecutionBenchmark.spec.ts` y `runA2Assist7Evidence.spec.ts`); no se alteran sus assertions. El benchmark canónico, sus fixtures, sus límites y sus artifacts permanecen idénticos. La CI añade un job específico de integración nativa de preferencia; consultar los checks del head del PR para su estado remoto.

## Reproducción y artifacts

```bash
node --import tsx --test engine/planner-next/mainFlowMealPreference.spec.ts
node --import tsx --test engine/planner-next/integration/mainFlowPreference.spec.ts
node --import tsx engine/planner-next/benchmarks/runMainFlowPreferenceEvidence.ts AUTO work/main-preference
node --import tsx engine/planner-next/benchmarks/runMainFlowPreferenceEvidence.ts 3 work/main-preference
node --import tsx engine/planner-next/benchmarks/runMainFlowPreferenceEvidence.ts 4 work/main-preference
node --import tsx engine/planner-next/benchmarks/runMainFlowPreferenceEvidence.ts 4:2 work/main-preference
npm run demo:a2:smoke -- work/main-flow-preference-integration --historical-topology --full --main-flow-preference
node --import tsx script/demo/mainFlowSoftBlockDiagnostic.ts work/cold-fallback --cold-only --candidate
npm run check
npx --no-install tsc -p script/demo/tsconfig.integration.json
npm run build
npm run check:migrations
(cd docs/source/official && sha256sum -c SHA256SUMS)
```

El benchmark tipado usa tablas del fixture en memoria, sin conexión a DB. Los identificadores canónicos de ese fixture no son escritura sobre las jornadas reales. El harness nativo crea y destruye PostgreSQL/Auth/PostgREST/app descartables y ejecuta Chromium con identidades locales. No contiene credenciales ni logs privados en los artifacts publicados.

[Reporte JSON](MAIN-FLOW-SOFT-MEAL-SPLIT-DAY-CONFIG.json) incluye hashes de runtime y artifacts, imágenes Docker fijadas, Node/V8, checks nativos, tiempos, Evidence, resultados focales antes/después y resúmenes/hashes de gates. Los archivos `MAIN-FLOW-SOFT-MEAL-SPLIT-DAY-CONFIG-*.json.gz` conservan resultados completos: AUTO/3/4/4-2-2, integración nativa, S1 productivo seleccionado, AUTO nativo y diagnóstico frío.

## Fuentes y límites de la certificación

Consolidación oficial: **00 v2.12, 03 v3.7, 04 v2.7, 05 v2.7 y 06 v2.9**; referencias vigentes actualizadas en 07/README/AGENTS y SHA256SUMS. Canon A2 y PDFs intactos. FIXED_COUNT/REQUIRED no se activa.

La prueba demuestra prioridad efectiva y terminaciones completas dentro de los límites, no optimalidad ni inviabilidad global. El límite de 200 patrones sigue pudiendo truncar la enumeración. La capacidad requiere un flujo Next EXACT ya configurado; una jornada legacy sin esa autoridad muestra la incompatibilidad y no fabrica una configuración Next.

No se han escrito Supabase real, jornadas reales 27001/27002 ni Replit publicado. La migración sólo se ha aplicado en entornos descartables. Quedan fuera de esta certificación la adopción del catálogo/backup conectado, el runtime publicado, el navegador del usuario y Supabase Realtime/WebSocket. No se ha hecho merge.
