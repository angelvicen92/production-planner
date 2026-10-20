# Auditoría causal de Estilismo, IN y OUT

## Resultado

El baseline vigente completa **266/266, S11, sin violaciones HARD/REQUIRED**. Las posiciones de las tareas flexibles examinadas no son todas necesarias: existe un plan completo válido que adelanta Estilismo entrada de C03 de **11:25 a 09:10**, conservando todo lo demás, y otro que adelanta su cierre Estilismo salida/OUT de **17:25/17:30 a 14:45/14:50**, reduciendo su presencia **515 → 355 minutos**. No se ha aplicado ninguno al producto.

La decisión causal ocurre antes de la protección humana: S1 produce un certificado `JOINT_COMPLETION` con horas para toda la jornada; S2–S11 revalidan y proyectan ese mismo certificado. La geometría inicial ofrece un bloque serial de entradas; sus placements pasan a contexto inmutable de la continuación. El cierre visita primero las horas tardías de Estilismo salida. Alcanzada la primera terminación válida, no se prueba la rematerialización focal demostrada aquí. S8 y S11 convierten respectivamente apertura y cierre en placements aceptados.

Esto acredita una desviación de la preferencia temprana de apertura y una optimización de cierre ausente. **No acredita una poda HARD incorrecta, agotamiento de búsqueda, optimalidad ni superioridad Pareto global.**

## Baseline y reproducción

- Repositorio: `angelvicen92/production-planner`.
- Rama remota objetivo: `codex/styling-in-out-causal-diagnostic`, verificada inicialmente en el mismo SHA que la base.
- Base exacta: `75040e7dabdb77864e216d3b1163c2fb9f26509b`.
- Árbol base: `da4d06f02d01fc9e26925a42a644cbf9a207deb8`.
- Node `v24.19.0`, V8 `13.6.233.17-node.51`.
- Entrada: `buildCanonicalA2AssistedStage1Fixture()` y `runA2Assist8Evidence()` existentes. Sin seed humano, snapshot inicial vacío, scopes automáticos, `includePrerequisites=false`, sin overrides de budgets ni reloj.
- Policy efectiva `EXACT_CONSTRUCTIVE`; grid soportado 5 min; `maxBranchExpansions=100000`, `bestK=5`, `maxBacktracks=200`, `maxPatterns=200`; techo Assisted existente 300000 ms/Stage.
- Main `REQUIRED`, AUTO (sin `preferredBlockCount`), `participantPresencePreference=OFF`.
- Fingerprint final, idéntico en ambos ensayos: `b9df879577cd8fb3d1b32e4588d6da0ad404739341a431e587eee4f68fa4f30f`.

Desde la raíz del repositorio, con sus dependencias declaradas instaladas:

```sh
bash docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/reproduce.sh /tmp/styling-causal-rerun
```

El script ejecuta dos veces el benchmark existente: con y sin el callback de captura ya disponible; después analiza sin intervenir en la búsqueda. Escribe los runs brutos en `with-capture/run.json` y `without-capture/run.json`, y los informes en el directorio solicitado. Las duraciones y hashes del JSON bruto pueden variar; fingerprints, decisiones, contabilidad y contrafactuales deben coincidir. No sobrescribe la Evidence histórica ni la Evidence entregada.

El harness existente usa los servicios reales request/run/apply/validate/accept con persistencia en memoria; esta unidad **no certifica HTTP, navegador, SQL ni una jornada remota**. No se accedió a Supabase, Replit ni DB remota. La prueba antigua de integración real se conserva como comparación histórica, con su propia frontera de autoridad.

## Autoridad aplicada

Se consultaron `AGENTS.md`, Fuente 00 v2.13, Protocolo 07 v2.2 (gate causal), el protocolo causal local y el catálogo de capacidades. Ámbitos relevantes:

| Autoridad | Aplicación |
|---|---|
| Fuente 01 v5.2, §8.6 | Medir llegada, salida, actividad y permanencia; producción y decisiones humanas. |
| Fuente 02 v2.2, prefacio | COMMIT interno no equivale a aceptar un Stage de producto. |
| Fuente 03 v3.7, prefacio v3.5 y §§3–6 | Supporting efímero, preferencia temprana, primera solución interactiva y conservación de witnesses. |
| Fuente 04 v2.7, §§2.3 y 9 | Protección automática de lo aceptado; Stage completo, configuración y Draft separados. |
| Fuente 05 v2.7, P03/P04/P10 | Permanencia, espera evitable demostrada y robustez; no confundir espera bruta con evitable. |
| Fuente 06 v2.10, apertura, §6 y topología de descansos | Canon 266, capacidad Estilismo 1, precedencias, márgenes, grupos y ausencia de continuidad/comida de plató para Estilismo. |

Los PDFs A2 originales se consultaron como procedencia de las obligaciones, mediante `pdftotext -layout`; las correcciones de Fuente 06 prevalecen. Ninguna hora humana interviene en la entrada ni en los experimentos. Los IDs y horas mostrados aquí son resultados de Evidence, nunca condiciones productivas.

## Call path efectivo

Las rutas y líneas siguientes corresponden al árbol base, que permanece intacto:

1. `server/benchmarks/runA2Assist8Evidence.ts:155`: calcula pendientes desde el snapshot y llama `recommendNextAssistedScope`. La selección de unidades conectadas y su prioridad se encuentran en `server/assistedScopeOrchestrator.ts:85`; apertura/cierre en 119–133, comparador en 305–340. Usa autoridades, presión/carga, deadlines y sólo finalmente identidad.
2. `server/assistedProposalService.ts:258`: materializa ocupaciones aceptadas mediante `materializeAssistedSnapshotOccupations`, recupera lineage y witnesses y resuelve el scope. `buildAssistedProblem` (`engine/planner-next/assistedPlanning.ts:280`) cierra dependencias/anchors, preserva placements y proyecta futuro analítico. La proyección colectiva permite certificar el día entero sin ampliar el scope visible.
3. `executeAssistedPlanning` (`assistedPlanning.ts:617`) usa el productor colectivo cuando corresponde, el ledger Assisted limitado y el checkpoint de tiempo existente. `executePlannerNext.ts:39` resuelve la policy exacta y llama `constructExactItinerantPlan`.
4. En S1, sin witness previo, `exactItinerantPlan.ts:2459` prepara arquitecturas, geometría anónima y matching de bundles. `anonymousPipelineWitness.ts:645` construye la familia de Estilismo; en 714 asigna `start + ordinal * duration` a los spots, y en 716–743 hace matching y prueba IN. `exactMainAndFeederCore.ts` ejecuta el ledger y las continuaciones de bundles; su aceptación de la continuación detiene la construcción completa.
5. **Primera frontera causal de apertura:** `exactItinerantPlan.ts:2699` incorpora los placements nominales del pipeline a `immutableCoreTasks`. Estilismo entrada deja de ser variable del residual de esa continuación. El fallback de reparación en 2933–2954 se activa por pérdida demostrada de capacidad futura, no por la existencia de una entrada adelantable. La aceptación no exige corregir una entrada tardía que ya permite completar todo.
6. `searchJoint` (`exactItinerantPlan.ts:2791`) utiliza el problema completo y los productores existentes de cadenas, rondas, equipos, recursos, setups y tareas ordinarias. Future Feasibility mantiene comidas y cierres; se materializan Sodexo y descansos operativos. **Cierre:** en 1692–1737 se separan prerrequisitos directos de OUT, se seleccionan por deadline de OUT/MRV/deadline/duración/ID y se recorren sus starts **de mayor a menor** (1724). Después `transportGrouping.ts:439` materializa los paquetes de transporte conforme a límites y separaciones mínimas. Que OUT sea temprano respecto a una salida ya tardía no adelanta esa salida.
7. `completeLeaf` (`exactItinerantPlan.ts:1050` y 1329–1347) exige identidad, comidas, transporte, validación y witnesses futuros. Con `FIRST_HARD_VALID` termina en la primera terminación aceptable. En 2891 crea `JOINT_COMPLETION`: 247 tasks + 19 comidas individuales, además de preparaciones y comidas operativas. Es un certificado, no un Stage de 266 tareas visibles.
8. **Frontera causal posterior:** `exactItinerantPlan.ts:2348–2376` revalida el certificado completo, el contexto protegido, preparaciones, cierre colectivo y `validatePlan`; si pasa devuelve sus horas proyectadas directamente. No compara otras materializaciones flexibles. En S2–S11 se observa el mismo fingerprint de witness y 293 ramas de replay por Stage, con cero selección residual.
9. `assistedPlanning.ts:661–684` valida el resultado y filtra la propuesta a IDs automáticos del scope. `assistedProposalService.ts:295` proyecta las horas a Draft. El flujo de aceptación (`assistedPlanningService.ts:183`) verifica autoridad/revisión y persiste mediante el límite de almacenamiento del harness. Al siguiente Stage, únicamente los placements realmente aceptados son contexto protegido. Apertura queda aceptada en S8; Sodexo/Estilismo salida/OUT en S11. `acceptedSupportingPlacements=[]`: **no hay prueba de un supporting invisible aceptado accidentalmente**. Sí hay conservación algorítmica de sus horas por replay antes de ser visible.

El alcance investigado es el recorrido anterior, no una invocación aislada del DFS legacy. La reproducción focal de la arquitectura elegida se conserva en [selected-geometry.json](selected-geometry.json): con la comida main seleccionada, reproduce exactamente los **spots anónimos** 09:55–13:05. El matching nominal posterior permuta identidades; por eso `nominalSupportingEqualsSelected=false` y no se presenta esa reproducción como una traza nominal original. Los candidatos 09:00–09:50 de esa construcción fueron rechazados por su matching/IN; eso **no prueba** que todas las asignaciones o geometrías anteriores fueran imposibles.

## Secuencia observada y contabilidad

| Stage | Scope operativo aceptado | Delta | Acumulado | Ramas |
|---|---|---:|---:|---:|
| S1 | Main Estudio 7 | 19 | 19 | 22053 |
| S2 | Feeders Prueba vocal | 19 | 38 | 293 |
| S3 | Reality C + EVA → Alfombra | 8 | 46 | 293 |
| S4 | Totales sincronizados | 19 | 65 | 293 |
| S5 | Reality A/B y anchors | 8 | 73 | 293 |
| S6 | Unidad P15 + comida operativa | 36 | 109 | 293 |
| S7 | Unidad P14 + comida operativa | 42 | 151 | 293 |
| S8 | IN + Estilismo entrada | 38 | 189 | 293 |
| S9 | Totales Post conjunto | 2 | 191 | 293 |
| S10 | Redes | 18 | 209 | 293 |
| S11 | Sodexo + Estilismo salida + OUT | 57 | 266 | 293 |

S1 consume 4766 CORE + 17287 STANDALONE = 22053, sobre 100000. Total de los once runs: 24983. Su waterfall atribuye 22053 a `other` en profundidad 0: no se inventa una granularidad feeder/depth que la instrumentación no proporciona para este camino. Hay 7 materializaciones de bundle, sin forbidden edges ni nogoods, repairs certificados o conflict backjumps. Se registra una continuación diferida sin reanudar al encontrarse la solución; no se declara exploración exhaustiva. El residual observado selecciona 36 macros, explora 25 ramas ordinarias y llega a una hoja completa.

Estilismo salida consume 38 ramas y la primera terminación completa se alcanza en la 38; se observan 19 podas de dominio individual de obligaciones futuras. Ejemplo de poda legítima: salida C01 a 15:25 impediría OUT dentro de su disponibilidad, y se usa 15:20. El transporte terminal se intenta una vez y pasa. Las alternativas focales de este informe **no son registros de candidatos podados por el motor**: sus horas no se exploran en la continuación seleccionada. Los contadores disponibles no incluyen un total global fiable de backtracks; se conserva su ausencia, en lugar de convertirla en cero. La comparación de neutralidad sí incluye íntegra toda la contabilidad disponible.

## Auditoría por participante, capacidad y recursos

[participants.csv](participants.csv) contiene los 19 participantes: IN, entrada, última obligación sustantiva, última obligación incluyendo Sodexo, salida, OUT, presencia, tiempo no ocupado y Stages de protección. [schedule.csv](schedule.csv) enumera las 266 obligaciones con horas, espacios, recursos efectivos, equipo y Stage. [baseline-witness.json](baseline-witness.json) conserva el horario completo y todas las preparaciones/comidas; [final-snapshot.json](final-snapshot.json) es el snapshot aceptado que se cotejó literalmente con ese witness. [report.json](report.json) incluye disponibilidad de participantes, espacios, recursos y equipos, ambas definiciones de última obligación, scans y validación.

- Todos empiezan por IN y terminan por OUT; la salida es penúltima. Se valida contra el contrato completo, incluidos recursos/equipos efectivos, dependencias y comidas.
- C03 tiene el intervalo IN-fin → entrada más largo del ensayo: 140 min (09:05 → 11:25). IN-inicio → entrada son 145 min. No se confunden ambas medidas.
- Capacidad de Estilismo 1, sin solapes; 190 min de entradas + 95 min de salidas = **285 min**. Amplitud 09:55–18:55 = **540 min**; utilización sobre la ventana de 720 min: 39,58%.
- Huecos internos: **13:05–15:20 (135 min)** y **15:25–17:25 (120 min)**. No hay comida de plató de Estilismo ni continuidad REQUIRED que explique esos huecos. No se declaran evitables íntegramente.
- Permanencia agregada: **9180 min**, media 483,16, mediana 495, P90 570, máximo 575. Las diferencias por persona importan aunque el agregado coincida con otra iteración.
- Los minutos no ocupados incluyen márgenes y esperas: no son una estimación de espera evitable. El cambio de un caso certificado no permite clasificar todo el tiempo vacío.

La medición reutiliza `script/demo/a2TopologyMetrics.ts` y contrasta su agregado/ocupación con el detalle del witness. La auditoría no introduce una penalización de huecos ni modifica la policy `participantPresencePreference=OFF`.

## Contrafactuales focales completos

Selección del caso: mayor demora medida de entrada y mayor demora de cierre respecto a todas las obligaciones previas; ambos criterios seleccionan C03. No se seleccionan IDs en lógica productiva. Disponibilidad C03: 09:00–19:00. Estilismo no requiere equipo ni recurso adicional en esta entrada efectiva.

| Ensayo | Cambio respecto al mismo baseline | Completitud/validación | Efecto |
|---|---|---|---|
| [Entrada temprana](entry-earlier-witness.json) | Entrada 11:25–11:35 → **09:10–09:20** | 266/266, cero violaciones; replay, cierre futuro y validador de producto PASS | Entrada 135 min antes; presencia 515 sin cambio. |
| [Salida con OUT fijo](exit-earlier-fixed-out-witness.json) | Salida 17:25–17:30 → **14:45–14:50**; OUT sigue 17:30 | Mismos gates PASS | Sólo desplaza la espera al intervalo salida→OUT; presencia sin cambio. |
| [Cierre temprano](closure-earlier-witness.json) | Salida → **14:45–14:50**, OUT → **14:50–14:55** | Mismos gates PASS | Presencia C03 **515 → 355**; agregado **9180 → 9020**; fin global sigue 19:00. |

Para entrada, 09:00 incumple IN; 09:05 no deja los 5 minutos exigidos después de IN. **09:10 es el primer start anterior válido en la granularidad efectiva**, con Estilismo libre, IN ya completado y Prueba vocal intacta 09:55–10:10. No hay dependencia que exija mantener el orden vocal→entrada: ambas órdenes están autorizadas. El resto de tareas y sus horas se conserva literalmente.

Para cierre, la última actividad sustantiva de C03 es Croma 14:30–14:40; Sodexo ya terminó. 14:40 no respeta el margen y **14:45** sí. OUT puede comenzar al terminar salida: sus overrides efectivos producen margen cero. El nuevo paquete OUT unitario de 14:50 tiene 35 minutos hasta el siguiente de 15:25, cumpliendo el mínimo configurado de 20; mínimo 1/máximo 6, target 1. No mueve ni reagrupa a otra persona.

Los scans de [report.json](report.json) cubren **todos** los starts anteriores de esos dos tasks a pasos de 5 min, registran el primer rechazo de `diagnoseTaskPlacement` y, cuando pasa, ejecutan `validatePlan` sobre la jornada completa. El par salida/OUT se enumera focalmente con las mismas autoridades; no alimenta una propuesta productiva.

Las alternativas mantienen las decisiones aceptadas hasta S7 (apertura) o S10 (cierre), respectivamente. Mantienen también, por construcción, todas las tareas futuras ajenas a los IDs cambiados, identidades de equipo, recursos, comidas, setups y rondas. Se refirman sólo los certificados alternativos offline y se exige `revalidateJointCompletionWitness=PASS`, cierre colectivo `CERTIFY` y `validateManualAssistedDelta=hardValid`, sin aplicar ni aceptar nada. Cada comprobación de replay/cierre carga 293 vértices dentro del mismo límite, fuera de la búsqueda original.

**Robustez:** el cierre temprano consume la holgura Croma→salida de C03: margen observado 165 → 5 min, holgura sobre el mínimo 160 → 0. No elimina un witness requerido, pero reduce absorción local de retrasos; no se declara mejora en todos los KPIs. La entrada temprana cambia el orden relativo con Prueba vocal y usa el primer margen permitido después de IN. La amplitud de Estilismo aumenta a 585 min al adelantar entrada: es compatible con el contrato y demuestra por qué compactar visualmente Estilismo no es el objetivo rector.

## Clasificación causal: producción y arquitectura

| Comportamiento | Producción | Decisión concreta | Clasificación |
|---|---|---|---|
| Entrada C03 a 11:25 pudiendo ir a 09:10 | Mantiene una espera de prerrequisito que puede adelantarse sin cambiar otra obligación. | Spots contiguos → hora nominal → `immutableCoreTasks`; después retorno directo del `JOINT_COMPLETION` revalidado. | **Defecto de aplicación de PREFERRED temprano**, no invalidez HARD. El hueco anterior no era una obligación de continuidad ni de comida. |
| Salida/OUT C03 17:25/17:30 | Puede liberar a esa persona 160 min antes; adelantar sólo salida no sirve para presencia. | Starts de salida descendentes + primera hoja válida; transporte sólo se adapta a las salidas elegidas; replay conserva el resultado. | **Optimización ausente**. El contrato permite primera terminación y no exige minimizar estancia en construcción. |
| IN por grupos y margen después de IN | Limita aperturas materialmente, sin exigir una parrilla fija de horas. | `transportGrouping` + márgenes de participante y disponibilidad. | **Restricción legítima/configuración**. No se ha probado una alternativa superior de grupos IN. |
| S8/S11 protegen horas ya aceptadas | Preservar decisiones aceptadas es necesario. | Snapshot → ocupaciones protegidas del siguiente Stage. | **Protección legítima**; el punto de mejora debe preceder a la aceptación. |
| El motor no llega a los contrafactuales focales | Había capacidad para certificar los ejemplos sin mover el resto del día. | Terminación temprana y replay, con presupuesto restante. | **Alternativa no intentada**, no agotamiento ni poda incorrecta demostrada. |

La capacidad y los márgenes explican algunos límites, pero no justifican estos dos horarios concretos. Los contrafactuales completos excluyen, para los ejemplos, que fuera necesario sacrificar recursos, comidas, producción posterior o el último witness futuro. No excluyen tradeoffs de robustez ni otras soluciones globales mejores.

## Comparación histórica y límites

[verification.json](verification.json) conserva comparación individual, hashes y la relación con `AUTOPILOT-MAXIMIZED/integration-proof.json`. Aquel ensayo acredita 266/266, cierre 19:00 y presencia 9180; Estilismo tenía 285/535 min y huecos 130/120. El ensayo actual acredita los mismos totales de obligaciones/cierre/presencia, pero **285/540 y 135/120**, con distribución individual distinta. Son mediciones de revisiones/entradas distintas: hay 30 diferencias en sus 79 hashes de runtime y namespaces de IDs de importación diferentes. No se interpreta el +5 de amplitud como regresión causada por este PR, ni se atribuye a una sola modificación histórica sin ensayo controlado.

El archivo histórico `A2-ASSIST-8-assisted-completion.json` todavía informa BLOCKED/S6. Su nombre no lo convierte en estado vigente: los dos ensayos actuales del runner pasan S11. No se sobrescribe esa historia ni se usan sus blockers antiguos como explicación actual.

Se reutilizó además `planningQuality.ts` para P01/P02/P03/P07/P09. Su informe completo se conserva con límites explícitos en `report.json`. P04/P05/P06/P08/P10 siguen `BLOCKED_BY_CONFIGURATION`. Su P09 contiene una comprobación legacy de adyacencia `sequenceAfterJointGroupId`: Alfombra termina 18:30 y Totales Post empieza 18:35, así que reporta 1, igual en baseline y alternativas. El problema efectivo admite la operación independiente con el margen de participante y el validador canónico devuelve cero violaciones. **Ese scorer no certifica paridad/Pareto de esta revisión**; no se corrige ni se oculta su discrepancia en este diagnóstico.

No se conoce el óptimo, no se ha agotado toda la familia de geometrías y no se ha explicado causalmente cada demora de cada persona. El informe sí entrega el horario y las autoridades necesarias para ampliar un caso concreto sin repetir una auditoría general. Para certificar superioridad integral aún faltan las entradas/autoridades de KPIs bloqueados y un P09 alineado con el problema efectivo. El siguiente experimento mínimo de una implementación de apertura será repetir el mismo par baseline/candidato con una sola rematerialización autorizada, mismo ledger y los mismos gates; no aumentar búsqueda ni cambiar grupos IN.

## Único delta mínimo recomendado, sin implementar

Separar la **reutilización del certificado de factibilidad** de la **materialización nominal temprana de Estilismo entrada visible**, en el retorno de `JOINT_COMPLETION` para el scope de apertura, antes de aceptar sus placements. El alcance mínimo conserva el resto del certificado y todas las protecciones, comprueba un adelanto con las autoridades existentes, y sólo lo devuelve si el certificado completo sigue validando; debe mantener el accounting y el presupuesto. No cambiar la geometría estructural, ordenar todos los Stages de nuevo, compactar IN, ni introducir pesos de estancia o huecos.

La justificación es la alternativa focal `entry-earlier`: demuestra que la hora del witness no debe convertirse automáticamente en la hora nominal preferida. La corrección de cierre queda diagnosticada como una capacidad posterior distinta; no se recomienda mezclarla en ese delta.

Riesgos a verificar en ese futuro cambio: validez y fingerprint del certificado actualizado, tratamiento de supporting todavía efímero, protección de trabajo aceptado, efectos de secuenciar varios adelantos sobre capacidad compartida, márgenes/comidas, coste contabilizado, determinismo y pérdida de holgura local. Ningún resultado focal autoriza congelar una identidad u hora A2.

## Validación y alcance del diff

Todos los archivos nuevos pertenecen a este directorio. La comparación contra la base verifica **1466 rutas existentes** de motor, servicios, clientes, shared, scripts, SQL y manifests sin cambios. No hay instrumentación dentro del motor: se reutiliza su Evidence y el callback existente después de aceptación. La igualdad profunda entre los runs con/sin captura excluye **únicamente** `iterations[*].durationMs`; incluye colocaciones, fingerprints, validaciones, ramas, prunes, continuaciones, witnesses y razones de terminación. Los fingerprints de fixture/configuración y hashes de archivos están en `verification.json`.

Las validaciones locales incluyen dos A2 completos, tres contrafactuales con validación completa/producto/replay/cierre futuro, reproducción focal de la geometría, typecheck del harness y checks finales registrados en [validation.md](validation.md). No se amplían budgets, timeouts ni dominios productivos. No hay migración, despliegue ni merge.

**Comportamiento X —Estilismo entrada nominal tardío pese a existir un adelanto completo válido— es causado por Y —la conservación de horas del pipeline y el retorno directo del witness conjunto sin rematerialización temprana— y produce Z —en el caso certificado, 135 minutos de demora adicional del prerrequisito—. El delta W —separar ese replay de la materialización temprana visible antes de aceptar apertura— debe cambiarlo y esperamos observar M —el adelanto focal certificado, conservando 266/266, validez, decisiones protegidas y el mismo presupuesto—.**
