# P0-U00k — Gate causal de recursos nominales en Main/feeder

**Diagnóstico reproducible PASS; capacidad nueva no implementada.** Base y rama remota objetivo comprobadas en GitHub: `4733938cad61897a2a3ea89cf77dd6a1c0de0383`, merge de #1188. Sólo se añaden archivos en este directorio. No hay merge, SQL ejecutado, despliegue, acceso a Supabase/Replit/demo ni Stage nuevo persistido.

**Resultado:** existe una jornada Main/Vocal físicamente realizable con B que el producto rechaza al expresar A/B. Y1 está confirmado. **Y2 no está demostrado**: la primera pérdida observada ocurre antes del matching, al intentar materializar Main sin seleccionar una variante. No se propone cambiar preventivamente la identidad de las aristas.

Autoridades leídas: Fuente 00 **v2.14** vigente (la ruta v2.13 de AGENTS está desactualizada), Fuentes 01–07 en sus ámbitos, especialmente 07 §4.4 y 03 §7/§13.4.1–3/SPEC-07 v2.2; catálogo de capacidades; Evidence U00i/U00j; resolver, preflight, adapter, core, witness, Assisted, placement, validadores y frontera de aceptación. El experimento no modifica estas autoridades.

## Jornada y control físico

[scenario.ts](scenario.ts) deriva el caso de `p0-u00a/native/first-input.json`: conserva sus dos participantes, cuatro Main/Vocal, duraciones de diez minutos, coach diario 2, bloque, transiciones y presupuesto **10.000 / 50 backtracks / 20 patterns / bestK 3**. Añade llegada, preparación y salida explícitas por participante, con el contrato de transporte existente. La preparación depende de IN; Vocal depende de IN; Main depende de Vocal y preparación; OUT depende de Main. Preparación y Vocal mantienen su orden parcial. No se añade una precedencia entre ambos.

La ventana hard del espacio Main es **09:40–10:00**; su carga contigua de veinte minutos determina dos spots, sin fijar identidades ni horarios humanos. Los participantes originales están disponibles 09:00–10:30. A y B son físicos exclusivos equivalentes, del tipo 2, disponibles 09:00–10:30: catálogo **201/202**, inventario diario **101/102**. Coach 2 sigue siendo una autoridad distinta, ajena al dominio A/B.

La obligación crítica `task:20` tiene participante independiente 4, espacio exclusivo 5, duración treinta minutos y `byItem(201)=1`. Participante y espacio sólo están disponibles **09:35–10:05**: su dominio es singleton, sin lock ni placement aportado. Toda posición Main posible se solapa con esa obligación. A no puede servir a ambas; B sí permite completar. Todas las tareas están pending, sin locks, assignments nominales o seeds.

El primer diseño usaba una tarea técnica independiente. El perfil Main la rechazaba en la continuación con `UNSUPPORTED_STANDALONE_TASK_KIND:task:20`. Ese diseño **no demostraba** el positivo. Se cambió sólo la obligación diagnóstica a auxiliar con participante propio; `rejected-technical-design/*` conserva y reproduce aquel límite. El contrato de transporte se completó con ambas direcciones y aliases requeridos antes de aceptar el diseño final. No se modificó producción para obtener el positivo.

Los cuatro inputs difieren **únicamente en `task:4.resourceRequirements`**. El runner y el verificador comparan el resto íntegramente. El input B legible está en [input-B.json](input-B.json); los otros tres, la configuración efectiva y el snapshot base están en los recibos.

| Main | Preflight / adapter actuales | Búsqueda actual | Resultado |
|---|---|---|---|
| `byItem(B)` | SUPPORTED / SUPPORTED | COMPLETE, 36 ramas | 11/11, HARD y REQUIRED válidas; propuesta y Draft offline |
| `byItem(A)` | SUPPORTED / SUPPORTED | INFEASIBLE, 117 ramas, 20 backtracks core | Sin propuesta; conflicto físico real, no agotamiento |
| `anyOf(A,B), quantity=1` | UNSUPPORTED / UNSUPPORTED | No se invoca | `UNSUPPORTED_RESOURCE_REQUIREMENT`, detalle `ANYOF_REQUIRES_ORDINARY_STANDALONE_AUXILIARY` |
| `byType(2)=1` | UNSUPPORTED / UNSUPPORTED | No se invoca | Mismo límite; inventario diario A/B resuelto correctamente |

El positivo contiene las once obligaciones, incluidas la crítica y ambos pipelines. La búsqueda decide, entre otras, Main 6 09:40–09:50 y Main 4 con B 09:50–10:00, mientras A sirve a la crítica 09:35–10:05. El Draft offline usa el builder canónico y la resolución byItem existente, sin escribir estado. **No es un recibo HTTP/RPC ni un Stage aceptado nuevo.** El objetivo diagnóstico se acredita en propuesta hard-valid; la futura ampliación productiva seguirá necesitando su gate nativo Draft→Stage.

## Intervenciones descartables y primera pérdida

[run.ts](run.ts) copia engine/server/shared a un directorio temporal, enlaza las dependencias existentes, ejecuta procesos nuevos y borra la copia en `finally`. `scratch-interventions.json` registra cada sustitución exacta y su finalidad. Ninguna sustitución se aplica al checkout ni a node_modules.

| Nivel acumulativo | Intervención local | Observación |
|---|---|---|
| M0 | Taps de observación en adapter, rechazo nominal y `hardGateCoreLeaf` | Neutralidad: recibos completos del positivo iguales, excluyendo sólo campos de tiempo `*Ms` |
| S1 | Retirar únicamente la admisión profile/kind del resolver nominal | Dominio diario [101,102], sin issues; EngineInput SUPPORTED; adapter aún UNSUPPORTED |
| S2 | Aislar también admisión profile/kind del preflight canónico | Aún `ADAPTED_PROBLEM_NOT_REPRESENTABLE / UNSUPPORTED_NOMINAL_RESOURCE_CHOICE` |
| S3 | Excluir el coach del canal físico fijo de la elección, conservando `coachId` | Adapter SUPPORTED; búsqueda CORE_FAILED/core INFEASIBLE en 15 ramas; cero hojas hardGate |

S2 explica una frontera adicional concreta: adapter publica `nominalResourceChoice.fixedResourceIds=[plan-resource:2]`, pero ese ID pertenece a `problem.coaches`, no a `problem.resources`. El adapter toma los recursos independientes anteriores a `resolveProjectedPlannerNextTaskResources`; el preflight canónico exige recursos físicos auténticos. S3 es una sonda de separación de canales, no una implementación del selector.

La primera pérdida en la **búsqueda real S3** queda registrada con stack en `channel-projection/search-taps.json`:

```text
exactMainAndFeederCore.residualMatching.evaluate
→ materializeAnchoredOperation(Main sin selectedResourceId)
→ canPlaceTask: NOMINAL_RESOURCE_ASSIGNMENT
→ operation=null → no arista residual → residualMatchingPrunes=1
```

En la fuente base: `exactMainAndFeederCore.ts:2211–2216`, `anchoredAccompaniment.ts:29–33`, `placement.ts:231`. La guardia de placement es correcta: impide consumir cero recursos. Lo que falta es producir una alternativa concreta **antes** de consultarla. Ni un aumento de presupuesto ni una reparación posterior pueden recuperar una arista que no se construyó.

La caracterización directa de geometría/bundles, separada de ese recorrido real, usa la misma arquitectura derivada de las ventanas hard:

- El witness anónimo devuelve FEASIBLE con dos Main, dos Vocal, dos preparaciones y dos plazas IN. No constituye una asignación física final: su proyección nominal mantiene Main sin selección.
- `nominalResourceVariants` ya genera A y B. Sus dominios estáticos contienen tres inicios sobre la rejilla 5 min (580,585,590). Con la crítica colocada por su singleton hard, A queda vacío; B conserva los tres. Los spots del bloque completo son 580/590.
- `prepareLegacyPipelineBundleGraph` construye el bundle con Main sin materializar. Su `protectedCompatible` llama al mismo `canPlaceTask`: la fila de Main 4 queda vacía; sólo existen `task:6@0` y `task:6@1`. El matching devuelve NO_PERFECT_MATCH. Los recibos enumeran cada key, posición y tarea/recurso del bundle, no sólo contadores previos al filtrado.
- En controles **separados**, con una variante ya seleccionada en el modelo canónico, existen `task:4@0`, `task:4@1`, `task:6@0`, `task:6@1`. El matching inicial y la reparación incremental tras prohibir un spot funcionan. Reservar la crítica elimina A y conserva B. Cada consulta de matching tiene el ledger existente, con el mismo límite, y registra su consumo.
- La búsqueda completa con selección B ya materializada alcanza hardGate y COMPLETE; la seleccionada A termina INFEASIBLE. Estos controles no son una búsqueda implementada de A/B: cada ejecución recibe una selección distinta conocida.

**Y2:** ningún grafo generado contiene simultáneamente variantes A/B del mismo Main/spot; por tanto no se ha observado que `Map.set`, reparación, fingerprint de matching o un nogood eliminen una de ellas. El contrato actual `mainTaskId@position` representa una única operación concreta. La reparación probada cambia spots, no recursos dentro del mismo spot. Y2 queda **no demostrado**, y queda descartado como primera causa de este caso; su posible efecto tras introducir variantes requiere otra caracterización, no un cambio preventivo de claves.

## Future Feasibility, validación y certificados

Los recibos completos `execution.json` contienen matching residual, reparaciones de feeders, causalDiagnostic, dominios futuros, backtracks y consumo. B completa y A falla con amplia holgura respecto al límite; no hay stop por budget. S3 sin selección no alcanza la continuación futura ni una hoja hardGate. Los taps distinguen esta búsqueda de los controles directos posteriores.

El control S3 con B ya materializado demuestra reutilización adicional: scope de **sólo Main 4** → una propuesta visible y `nominalPhysicalFutureWitness` con **las once obligaciones**. La proyección productora existente conserva al crítico A y los demás pipelines como trabajo efímero. No los convierte en decisiones aceptadas. El mismo control A no produce propuesta.

Tres falsificaciones con fingerprint recalculado —selección omitida, crítico futuro omitido y sustitución B→A conflictiva— son rechazadas por `validatePlan`: respectivamente `NOMINAL_RESOURCE_ASSIGNMENT`, `UNPLANNED_TASKS` y solape/transición de recurso. Los fingerprints de dos selecciones al mismo tiempo ya son distintos. No se ha demostrado aceptación productiva de un witness incompleto.

Los certificados `FIXED_SUPPORTING_PIPELINE` V1/V2 se generan y revalidan con Main/Vocal protegidos. A y B producen el mismo V2: certifica tiempos/espacios de supporting y feeders, **no la elección física de Main**. Es su alcance existente, no una prueba de que el plan global con A sea válido. El testigo físico completo y la validación final son los que discriminan A/B. No es necesario atribuir a ese certificado estructural una garantía que no contiene.

| Categoría solicitada | Diagnóstico |
|---|---|
| a) Preflight | Rechazo explícito de capacidad fuera del contrato U00i/U00j; no prueba inviabilidad |
| b) Arista ausente | Confirmada después de aislar admisión/canal: falta materializar la variante antes de construir operación/arista |
| c) Colapso de alternativas | No demostrado; nunca se generaron ambas dentro del mismo grafo |
| d) HARD verdadero | Confirmado en A por ventana/carga/consumo y por contrafactual completo B |
| e) Poda incorrecta | No demostrada sobre un dominio correctamente materializado; el residual vacío S3 deriva de representación incompleta |
| f) Presupuesto | Descartado como causa en estos runs: 15/36/117 frente a 10.000 |
| g) Witness/certificado | Anónimo/estructural no acredita elección física; validación rechaza omisiones; no aceptación incompleta observada |

## Reproducción y regresión proporcional

```sh
node --import tsx docs/evidence/p0-u00k/run.ts /tmp/u00k-fresh
python3 docs/evidence/p0-u00k/verify.py /tmp/u00k-fresh --extract /tmp/u00k-inspect
npx --no-install tsc -p docs/evidence/p0-u00k/tsconfig.json
```

No requiere DB, Docker, navegador, credenciales ni red. Destinos nuevos. [receipts.json.gz](receipts.json.gz) contiene un mapa **ruta relativa → JSON íntegro** de 94 recibos: cuatro inputs controlados, diseño descartado, S0/Draft offline, preflights/adapters, búsquedas, grafos, recursos por variante, diagnósticos, certificados, falsificaciones, taps y autoridades. `verify.py --extract` los hace legibles. [summary.json](summary.json) es el índice breve; [checks.json](checks.json) y [focal.tap.gz](focal.tap.gz) documentan validación.

Dos ejecuciones independientes coinciden **íntegramente** al excluir sólo tiempos `*Ms` y stacks con rutas temporales. El observador M0 también conserva el positivo completo. TypeScript del harness PASS. **182/182 tests focales PASS** en seis archivos: nominal/typed requirements, nominal witness, anonymous pipeline, exact Main/feeder y residual matching. En Node 24 se usó `--test-isolation=none --test-reporter=tap` para obtener los subtests reales; la invocación con aislamiento mostraba sólo seis resultados de archivo.

Se repiten los dos U00a congelados con el motor actual: **4/4 y 9/9**, fingerprints originales iguales. Sus Stages aceptados históricos se verifican por SHA-256. No se fabrica un Stage para el caso derivado.

**1.614 archivos de ejecución/configuración** conservan sus bytes respecto de la base, incluidas migraciones 108–111 y demo. El recibo A2 U00j se verifica por hash y conserva su baseline documentado **266/266, 11 Stages, 27.049 ramas**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. No se repite A2 porque este PR no modifica ninguna fuente de ejecución. Entorno observado: Node 24.19.0 y lockfile existente intacto; no se atribuye validación nueva en Node 20.

## Decisión para la siguiente unidad

Ver [minimum-delta.md](minimum-delta.md). La pérdida operativa es representabilidad/construcción, no una regresión demostrada de matching. El siguiente cambio debe producir variantes físicas de Main en la autoridad existente, mantener cada alternativa distinguible hasta validación/futuro y completar el contrato de aceptación. No basta con abrir preflight ni con elegir greedy la primera alternativa. **Este PR no habilita Main/Vocal nominal, no cambia SQL/Stage, matching, budgets, coaches ni persistencia.**
