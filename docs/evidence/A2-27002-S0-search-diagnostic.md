# A2 real 27002 desde S0: auditoría causal de búsqueda

Base: `977dbb3ef6244de022410e4d00036cd186c15aad` (#1129).
Rama: `codex/a2-s0-real-input-search-diagnostic`. Captura: 15 de octubre de
2026, 09:16 CEST. Unidad diagnóstica, pendiente de revisión de ChatGPT.

## Resultado y frontera de la conclusión

**El timeout histórico no se reproduce en el entorno actual.** El input real
recién capturado y el generado para la integración nativa producen el mismo
problema de búsqueda y la misma propuesta. El resultado completo es además
deep-equal al AUTO archivado de #1123: no sólo coinciden las 266 obligaciones.

| Ejecución | CORE | Standalone | Total | Tiempo observado | Propuesta visible |
| --- | ---: | ---: | ---: | ---: | ---: |
| Real histórico #1129 | 6.782 | 31.858 | 38.640 | 300,011 s | ninguna |
| Real actual, replay de producto | 9.343 | 46.282 | 55.625 | 115,263 s | 19 |
| Nativo generado, mismo recorrido | 9.343 | 46.282 | 55.625 | 110,945 s | 19 |
| Real, interrupción diagnóstica a 38.640 | 6.782 | 31.858 | 38.640 | 72,589 s | ninguna |
| Nativo, misma interrupción | 6.782 | 31.858 | 38.640 | 73,337 s | ninguna |

Las dos últimas filas usan **un checkpoint diagnóstico anticipado**, no una
medición real del límite de 300 s. Mantienen 100.000 ramas y las alternativas
del explorador. Reproducen exactamente los tres totales históricos; eso es
evidencia compatible con el mismo prefijo, **no identidad demostrada de todas
las decisiones de una traza histórica que no se publicó**. Sus tiempos incluyen
actividad de validación del entorno y no son un benchmark de rendimiento aislado.

La primera decisión costosa demostrada está en la continuación del primer
bundle hard-válido, materializado a la rama 93: `searchJoint` exige una
terminación certificada de todo el contexto futuro antes de devolver las 19
obligaciones visibles. No está buscando sólo 19 tareas independientes.
La primera divergencia observable frente a la ejecución histórica es el corte
de reloj antes de terminar esa continuación. No se ha demostrado una primera
decisión de búsqueda diferente ni causalmente incorrecta.

No se atribuye retrospectivamente el tiempo histórico a CPU, Node, GC, carga
concurrente o cambios de configuración: faltan sus mediciones y el hash de su
captura privada. Tampoco se presenta el replay como una aceptación real de S1.
La aceptación nativa S1 de #1129 sigue siendo Evidence separada.

## Autoridades y baseline reconstruido

Se aplican AGENTS, Fuentes 00 v2.12, 03 v3.7, 04 v2.7, 05 v2.7, 06 v2.9 y
07 v2.2 §4.4; `PLANNER_CAUSAL_DIAGNOSTIC_PROTOCOL.md` y el catálogo de
capacidades. El catálogo contiene auditorías históricas de proyección; sus
gaps antiguos no sustituyen el wiring comprobado en este head.

| Iteración / Evidence | Qué demuestra y qué deja de ser comparable |
| --- | --- |
| A2-ASSIST-7/8/9/10 históricos | Blockers de S2, S5/P15 y S6; presión que cambiaba entre CURRENT/FUTURE, ARRIVAL que usaba su propio inicio como deadline, supporting congelado, setup y cierre colectivo. Sus cifras 19/65/111 no son el baseline de completitud actual. |
| #1075–#1082 | Cierre individual/colectivo, transporte terminal y reparación de capacidad. No autorizan aumentar presupuesto ni aceptar un witness provisional como protección. |
| #1105, `5a20e4d` | Flujo completo Assisted, márgenes específicos y disponibilidad corregida. Fuente 05 exige regenerar tras el cambio 18:40→19:00; no se mezclan esos resultados históricos. |
| #1117, `20e4b30` | Topología física reconciliada, Redes sin CAM1, Totales con CAM5/CAM6, lanes ordenadas estructuralmente. A2 real completo en once Stages; S1=55.625 ramas / 155,254 s. El contrafactual de invertir identidades de salas había agotado 100.000: los IDs y la geometría sí pueden importar. |
| #1118, `68c1b20` | Reutilización de identidades globales de plantilla, sin duplicar capacidades. |
| #1119–#1120 | Experimentos de 3/4 bloques y cota necesaria de dependencias futuras; el fracaso de un fallback frío no certifica inviabilidad. No se aplica el patch experimental archivado. |
| #1121 | Conservación de incumbente; AUTO=55.625. Buscar AUTO antes de SOFT consumía presupuesto de la preferencia. |
| #1122–#1123 | Prioridad SOFT explícita y reparto respecto a comida; AUTO sigue en 55.625, SOFT 3=50.419, SOFT 4=29.502 y 4/2+2=42.276. Esas preferencias no están activas en la captura real. Hubo ya un fallo temporal bajo carga concurrente y un pase posterior sin cambiar solver. |
| #1124–#1128 | Ejecución/UI/operación y auditoría documental; no cambian este AUTO. |
| #1129, base de esta unidad | Corrige lectura: 52 pausas legacy + 266 operaciones ya no forman 318 obligaciones incompatibles. No modifica búsqueda. El replay real agota tiempo; la integración nativa finalmente acepta S1. ASST-010 manual falla también en su base y usa input canónico inyectado: no prueba una regresión del lector. |

Referencias: [topología](A2-REAL-TOPOLOGY.md),
[SOFT inicial](MAIN-FLOW-SOFT-BLOCKS.md),
[incumbente](MAIN-FLOW-INCUMBENT-SAFETY.md),
[prioridad](MAIN-FLOW-SOFT-PREFERRED-FIRST.md),
[último baseline completo](MAIN-FLOW-SOFT-MEAL-SPLIT-DAY-CONFIG.md),
[diagnóstico #1129](A2-27002-config-read-diagnostic.md),
[replay histórico](A2-27002-real-input-replay.json),
[validación #1129](A2-27002-validation.json).

## Comparación verificable de inputs

[inputs.json](A2-27002-S0-search/inputs.json) contiene hashes por sección,
configuración estructural, metadatos de captura y comparaciones antes/después
de cada frontera. No publica filas, nombres, credenciales ni cabeceras.

La captura final del nuevo comando hace 29 lecturas REST, todas 200,
bajo guardia GET/HEAD sobre el origen configurado; rechaza RPC, Auth y
mutaciones. Las capturas sucesivas conservan el mismo hash de input; la revisión
persistida coincide con la reconstruida (`ad5cbd8d…360a`).
El estado observado es Stage ordinal 0, base S0, 266 pendientes sin horas y
cero locks/placements protegidos. Se conserva la configuración diaria existente.
No se invoca `GET /api/plans/:id`, que puede sincronizar pausas, ni el endpoint
de propuestas contra Supabase real.

El EngineInput real **no** es literal al generado: difieren campos de nombres,
provenance, fingerprint de snapshots, identidades de plantilla y redundancias
de `tasks`, `planResourceItems`, settings espaciales, meal template y transporte.
La comparación definitiva usa el generado **atravesando buildEngineInput**, no
el objeto parcial anterior al builder. La identityMap completa difiere; las
identidades de tarea y el problema consumido por búsqueda quedan preservados.

| Frontera | Real frente a nativo generado |
| --- | --- |
| Input crudo | Diferente; lista exacta de campos en inputs.json |
| Preflight / adapter | SUPPORTED; 266 obligaciones, cero conflictos de disponibilidad protegida; ningún issue bloqueante |
| PlannerNextProblem, todas sus secciones | Deep-equal; fingerprint oficial `7037e830fab579355c08b67c3f71a094a0e5ba27f56c33dddba0a35e8c5fa6c8` |
| Recomendación y prioridad operacional | Deep-equal; MAIN_PIPELINE / SPACE 48 / 19 |
| Elegibilidad futura y AssistedProblem | Iguales; hash `f0b70806b840ae2bc7e3f626228ffb281ba647419ba739fa2145eae011213de4` |
| Resultado completo | Deep-equal entre real/nativo y frente al artifact AUTO de #1123; [equivalence.json](A2-27002-S0-search/equivalence.json) |

Se comprobaron recursos y sus ventanas, participantes, coaches, asignaciones
directas/espaciales, unidades A/B/C y elegibilidad, comidas, transporte,
transiciones, setup, rondas, dependencias, anchors, flujo principal y presupuesto.
El problema incluye 247 tareas productivas y 19 comidas. EVA conserva
16:00–21:00; C01 termina disponibilidad a 15:30 y C02–C19 a 19:00; coaches
Caracola→Estudio mantienen 30 min; participantes 5 min y overrides terminales 0;
Reality A/B mantiene 15 min. IN sigue 3/3/30. CAM2 conserva PREFERRED, setup
con preparación 10 min y reentrada prohibida. Rondas conservan lanes 10/9.
No hay preferencia SOFT de cantidad/reparto, locks ni witness previo de Stage.
Las advertencias de compatibilidad del optimizer siguen visibles; no son un
rechazo del adapter ni un certificado de inviabilidad.

El canónico numérico vigente tampoco se trata como el mismo input literal.
La traducción explícita del manifest v2 y del namespace de import verifica
igualdad de las 247 tareas, recursos, participantes, coaches, unidades,
dependencias/anchors/cadenas, comidas individuales, transporte y Main. El
catálogo espacial adaptado conserva diferencias: 21 espacios canónicos frente
a 20 de la topología histórica efectiva, alias, padres e IDs distintos.
No se elimina esa diferencia para afirmar identidad de búsqueda. La equivalencia
que explica este caso es real↔nativo **con la misma topología efectiva**.

## Call path y decisiones materiales

1. **Lectura/configuración.** `SupabaseStorage.getPlanEngineInputDetails` y
   snapshots → `buildEngineInput` → autoridades de configuración de Next,
   márgenes y Main. La autoridad estructurada excluye la proyección de las
   pausas legacy no protegidas; no borra sus filas. #1129 ya reparó ese fallo.
   `AssistedProposalService.run` comprueba sesión, base y revisión esperadas,
   reconstruye EffectiveConfig y rechaza STALE_CONFIG_REVISION si difiere de la
   revisión persistida. La captura read-only verifica esa igualdad sin crear run.
   Readiness del optimizer y representabilidad Next son comprobaciones distintas.
2. **Selección.** `recommendNextAssistedScope` agrupa autoridades operativas y
   compara presión, acoplamiento y efecto downstream. Main tiene 19 obligaciones,
   285 min pendientes y 38 acoplamientos REQUIRED; no gana por el ID 48.
   `resolveAssistedScope` resuelve identidades pendientes sin ampliar visibilidad.
3. **Adaptación/preflight.** `preflightEngineInputForPlannerNext` →
   `adaptEngineInputToPlannerNextProblem` preserva disponibilidad, recursos,
   espacios efectivos, márgenes, setup/rondas y REQUIRED. `resolvePlannerSearchPolicy`
   admite EXACT_CONSTRUCTIVE. No hay rechazo de configuración ni geometría aquí.
4. **Supporting y futuro.** `buildAssistedProblem` produce 82 ejecutables:
   19 Main, 19 vocales y 44 auxiliares. 63 son supporting; 19 comidas y 247
   tareas de contexto colectivo permanecen analíticas. Los conjuntos se solapan:
   **82+247 no es un nuevo universo de obligaciones**. No se protegen IN/Estilismo
   por utilizarlos como witness. No hace falta collectiveCoreProjection adicional
   en este primer scope: sus 19 Main ya están incluidos.
5. **Presupuesto.** `executeAssistedPlanning` crea el checkpoint de 300.000 ms
   y conserva el menor límite entre configuración y 100.000. `executePlannerNext`
   → `constructExactItinerantPlan` → ruta AUTO de
   `constructConfiguredExactItinerantPlan` → `runExactItinerantPlanSearch`.
   El contexto colectivo evita la construcción nominal eager de otro camino.
6. **Arquitectura/geometría.** `authorizedPipelineArchitectureMaterializations`
   usa patrones mínimos AUTO, frontier de timelines, comida efectiva y
   `proveMainFeederArchitectureImpossible` como cota necessary-only. Después,
   `preparePipelineBundleGraph` construye spots/dominios de feeders y apertura;
   `materializePreparedPipelineBundleMatching` asigna bundles completos con
   presión futura. No se copian horas humanas. El primer bundle pasa el hard
   gate en la rama 93; hasta el corte, 14 materializaciones pasan sin rechazos hard.
7. **Future Feasibility y continuación.** `runExactMainAndFeederSearch` recibe
   esos bundles. La continuación de `runExactItinerantPlanSearch` llama
   `searchJoint` sobre `analyticalFutureCollectiveContinuation`: cota de cierre
   colectivo, reservas de cadenas Reality C/EVA/Alfombra, prerrequisitos, matching
   de agendas itinerantes y luego `searchStandaloneForCoreCandidate`.
   Existe diferimiento de continuaciones con el mismo ledger; no se interpreta
   una cuota agotada como imposibilidad. La primera macro observada es el Post
   conjunto C06/C10, con dominio 5: prerequisites PASS, futuro participante
   ABSTAIN, comidas PASS y entrada real a residual. ABSTAIN no es la poda causal.
8. **Matching/materialización residual.** P15 coordina 36 miembros bajo CAM2
   (19 tareas de recurso y 17 de setup), después tareas de recurso, rondas y
   trabajo ordinario/terminal. En el resultado elegido P15 encuentra matching
   1/1 en una geometría y termina PASS: no está demostrado un matching insuficiente.
   Las asignaciones itinerantes consumen miembros y ventanas efectivos, y se
   materializan junto con comidas y preparaciones.
9. **Validación y salida.** Cobertura/identidad, transporte, cierre, comidas
   individuales/operativas, preparaciones y `validatePlan` gobiernan la hoja.
   Una hoja ordinaria no equivale a una certificación conjunta. Al completar se
   genera JOINT_COMPLETION (247+19), después se proyecta a 19 visibles. El
   witness `0f3bcac7…bf8` coincide con #1123. Supporting efímero: 38; aceptado: 0.
   El servicio convierte identidades al producto, comprueba el delta HARD/REQUIRED
   y `certifyGlobalParticipantMealGate`, y sólo entonces persiste el run elegible.
   Aplicar modifica Draft; `AssistedPlanningService.validateDraft` comprueba
   freshness/base/revisión y la validación certificada; aceptación transaccional
   crea el Stage inmutable y consolida daily_tasks. Esos pasos están probados
   por la integración nativa previa, no por nuevas mutaciones en esta auditoría.
10. **Agotamiento.** El checkpoint lanza `ExactSearchTimeLimitReached` antes del
    siguiente cargo. Sin terminación conjunta seleccionada no hay propuesta
    parcial ni certificado negativo. El catch conserva ahora el diagnóstico ya
    observado; no vuelve a evaluar un candidato.

## Waterfall, rechazos y límites de observación

[prefix-real.json](A2-27002-S0-search/prefix-real.json) conserva las 14
arquitecturas/materializaciones observadas y sus matching edges; el nativo
repite su hash semántico. Branches antes de materialización:

`93 → 5026 → 10569 → 16110 → 16793 → 22336 → 22982 → 28525 → 29116 → 29812 → 31683 → 32271 → 32600 → 38152 → corte 38640`.

| Punto | CORE | Standalone | Observación |
| --- | ---: | ---: | --- |
| 5.000 | 3.154 | 1.846 | La primera continuación ya ejecuta futuro |
| 10.000 | 3.364 | 6.636 | Continúan alternativas autorizadas |
| 20.000 | 4.201 | 15.799 | No hay certificación global seleccionada |
| 30.000 | 5.643 | 24.357 | Dominio futuro/continuaciones siguen activos |
| 38.640 | 6.782 | 31.858 | 14 arquitecturas preparadas; cero hard-gate rejects |
| 55.625 | 9.343 | 46.282 | JOINT completo, 19 visibles, HARD/REQUIRED 0 |

En el prefijo, la autoridad de cierre registra 1.660 checks y 775 cargos,
una abstención BUDGET_EXHAUSTED y ningún `firstPrune` registrado. No significa
que cada explorador haya probado cero rechazos: los contadores son parciales.
En el recorrido completo hay 4.213 checks; la primera pérdida de matching
colectivo registrada reduce 19→18 para C19: Corner/Croma/Totales Coreo consumen
la alternativa de Estilismo salida (`task:110258`). Es un rechazo de una rama,
no del problema, y se conserva una alternativa que completa. Los contadores
terminales de identidad, transporte, comidas y validación son cero rechazos.
El resultado completo registra seis continuaciones diferidas aún pendientes:
se detiene al obtener la primera terminación válida, no al agotar alternativas.

El waterfall legado agrupa aquí todo como `OTHER` en profundidad 0. Sus ceros
de profundidad core/feeder no prueban ausencia de trabajo: la ruta de bundles
estructurales no tiene la clasificación fina del DFS nominal. La partición
CORE/standalone del ledger, las materializaciones y las trazas macro sí están
observadas. No se inventa una atribución por profundidad ni por tiempo para ese
bucket. Esta limitación impide recomendar una poda a partir de los contadores.

El replay del prefijo invoca directamente `runExactItinerantPlanSearch` con el
ledger y el orderer existentes de AUTO. Sus precondiciones exigen S0 sin locks,
sin SOFT, sin collectiveCoreProjection y con contexto colectivo. Es un
experimento de esa composición, no un endpoint productivo ni un cambio de
policy. Las ejecuciones completas sí atraviesan `executeAssistedPlanning` y
`executePlannerNext`.

## Clasificación y lectura operacional

- **Configuración diferente:** existe diferencia cruda, pero no sobrevive a la
  frontera de búsqueda actual real↔nativo. El histórico no publica hash de input.
- **Regla/validación más correcta o geometría inválida:** #1117 y #1129 sí tienen
  causas demostradas de este tipo en su ámbito; no aparece una nueva aquí.
- **Alternativa eliminada, matching insuficiente o witness futuro perdido:** no
  demostrado; el mismo input completa sin cambiar dominios, límites ni reglas.
- **Agotamiento de búsqueda:** temporal en #1129; no agotamiento de las 100.000
  ramas ni certificado de inviabilidad. El prefijo reproducido sigue inconcluso.
- **Regresión verdadera:** no reproducida. El resultado coincide literalmente
  con el baseline completo de #1123.

Como jefe de producción, proteger Reality/EVA, rondas, comidas y cierres antes
de aceptar Main es razonable. S0 sin propuesta tras cinco minutos sigue siendo
un fallo operativo aunque haya capacidad factible; no permite declarar que el
día sea imposible. Como arquitecto, el coste observado es el de la certificación
conjunta fría antes de proyectar Main. Sustituirla por una prueba más débil,
cambiar el orden o incrementar tiempo requeriría otra causa demostrada y otro
contrato; esta unidad no lo hace.

## Delta diagnóstico, validación y experimento mínimo pendiente

Único cambio runtime: una referencia al diagnóstico ya existente mientras vive
el core y su copia al desenrollarse por timeout. Se mantienen órdenes, dominios,
matching, validadores, checkpoints, cargos, fingerprints y salida de propuesta.
El catch reconcilia los cargos sin clasificación como OTHER, igual que el final
normal. Los arrays de diagnóstico se obtienen de observaciones existentes.

Pruebas: seis archivos focales pasan en Node 24 (core, itinerancia, Assisted
colectivo, lectura de configuración, topología y auditoría); core afectado y
auditoría pasan también en Node 20. El nuevo test compara diagnóstico ON/OFF
en tres checkpoints, repite determinísticamente, concilia cargos y comprueba
input inmutable. Cuatro tests de auditoría distinguen metadata de semántica,
detectan cambios de recurso/comida pese a 266 tareas y rechazan falso S0.
TypeScript de aplicación y de integración, build y secuencia de migraciones
pasan; checksums oficiales intactos. Se ejecutó el build con
`node --import tsx script/build.ts`: el wrapper tsx de npm no podía abrir su
socket IPC en el sandbox. Sin cambios de dependencias/lockfile ni fixture.

La pérdida del diagnóstico al timeout sí tiene causa y contrafactual demostrados:
el throw ocurre antes de copiar `core.evidence` al resultado externo. El cambio
conserva ahora las materializaciones sin cambiar el mismo prefijo consumido.

**Conclusión causal acotada:** «El comportamiento de no devolver propuesta en
el prefijo de 38.640 ramas está causado por el corte temporal antes de completar
el witness conjunto y produce ASSISTED_SCOPE_INCOMPLETE; el delta diagnóstico
de conservar la traza y medir CPU/tiempo del mismo replay debería permitir
observar dónde se consume el tiempo antes de alcanzar la terminación de 55.625».

No queda demostrada la causa del **menor avance por segundo histórico**.
Experimento mínimo pendiente: ejecutar **esta misma captura**, con sus hashes,
base/runtime identificados, en el entorno que presentó los 300 s; guardar
wall time, CPU de proceso, throttling/carga y perfil V8, junto al prefijo por
ledger y las observaciones conservadas. Usar el límite vigente. Comparar esos
datos con un control aislado del mismo input y runtime. Si ya difieren hash o
primer matching, se falsaría la explicación exclusivamente temporal; si se
mantienen y cambia CPU/wall/perfil, se puede localizar el coste sin especular
sobre el solver. No es necesario ni está autorizado probar una solución nueva.

## Reproducción y artifacts

```sh
# Sólo GET/HEAD; datos privados en /tmp. Usar el proxy/CA configurado por el entorno.
node --import tsx script/demo/auditA2S0Search.ts --capture 27002 /tmp/a2-s0-private
# Estos comandos no permiten ninguna petición de red:
node --import tsx script/demo/auditA2S0Search.ts /tmp/a2-s0-private/input-private.json /tmp/a2-s0-audit
node --import tsx script/demo/auditA2S0Search.ts /tmp/a2-s0-private/input-private.json /tmp/a2-s0-audit real
node --import tsx script/demo/auditA2S0Search.ts /tmp/a2-s0-private/input-private.json /tmp/a2-s0-audit native
node --import tsx script/demo/auditA2S0Search.ts /tmp/a2-s0-private/input-private.json /tmp/a2-s0-audit prefix-real
node --import tsx script/demo/auditA2S0Search.ts /tmp/a2-s0-private/input-private.json /tmp/a2-s0-audit prefix-native
node --import tsx --test script/demo/auditA2S0Search.spec.ts engine/planner-next/exactItinerantPlan.spec.ts
npm run check
npx --no-install tsc -p script/demo/tsconfig.integration.json
node --import tsx script/build.ts
npm run check:migrations
```

En este entorno Node fetch se inició con el preload de proxy ya instalado:
`--require /workspace/.production-planner-tools/proxy.cjs`. No se desactiva TLS.
Los resúmenes publicados [real](A2-27002-S0-search/real.json) y
[nativo](A2-27002-S0-search/native.json) remiten al artifact completo preexistente
de #1123, comprobado deep-equal, para evitar duplicarlo. El comando de replay
escribe la traza completa sanitizada y sus hashes semánticos; tiempos/CPU son
observaciones y no deben compararse byte a byte. El prefijo nativo remite a la
traza real idéntica. [validation.json](A2-27002-S0-search/validation.json)
registra checks y hashes de archivos.

No se cambian canon/266 obligaciones, presupuestos, timeouts, heurísticas,
configuración productiva, Supabase real ni assertions históricas. Un único PR
hacia main para revisión; sin merge.
