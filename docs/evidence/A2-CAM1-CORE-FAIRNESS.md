# A2 CAM1 — continuación acotada entre cores

PR [#1104](https://github.com/angelvicen92/production-planner/pull/1104), draft, sin
merge. Partida `9202cb41ad3821c2f654fe5afb847f8d53e3d2bb`; base
`5e46168daa35d755bcb9a2573ed81647d8b466a2`. Delta productivo y fixtures:
`2cc482b2277f88270e6d4c29405ca57ecf4e7590`. Fecha: 2026-10-09.
Datos compactos, hashes, comandos y scripts de reproducción:
[JSON](A2-CAM1-CORE-FAIRNESS.json). No contiene árboles completos repetidos.

**Avance productivo demostrado: dos runs limpios completan 266/266 en S10 con
CAM1 vigente.** S1 consume 21.975 ramas en ambos, frente al agotamiento de
100.000 del baseline. La latencia de S1 es 147.841 / 117.319 ms: ambos cumplen
el techo de 300 s; el objetivo de 120 s queda abierto en el primero. ASST-010
conserva su gate independiente abierto. El PR no está listo para merge.

## X/Y/Z/W/M y primer punto causal

- **X:** el Main explícito de 19 participantes termina S0, sin propuesta,
  aunque existe un core posterior certificable mediante productores normales.
- **Y:** `onHardValidCoreLeaf → attempt → searchJoint → cadenas/agendas →
  searchStandaloneForCoreCandidate → P15/Totales` permite que el tercer core
  agote el ledger global. `BUDGET_EXHAUSTED` aborta la enumeración de cores.
- **Z:** el séptimo core no se visita y no se acepta ningún Main.
- **W:** acotar cada intento de continuación estructural, retener su raíz y
  matching, visitar otros cores y reentrar si quedan presupuesto y alternativas
  aplazadas. La cuota crece en la reentrada, sin reiniciar el ledger.
- **M:** las dos ejecuciones productivas desde S0 alcanzan el séptimo core,
  certifican S1 con 21.975 ramas y atraviesan request/run/apply → validate →
  accept hasta S10, 266/266.

El control previo del orden original evaluó tres cores y consumió
3.642 CORE + 96.358 STANDALONE = 100.000, en 199.584 ms. Su código productivo
es idéntico al HEAD de partida; se reutiliza esa observación documentada en
[la unidad anterior](A2-CAM1-STRUCTURAL-ORDER-DIAGNOSTIC.md). No se repite la
inversión P15/Totales, no se añade poda y no se toca quality.

Autoridades consultadas: Fuente 07 v2.2 §4.4; Fuente 03 v3.6 §§13.4 y 28;
Fuente 05 v2.6 A2-ASSIST-8, además de las dos Evidence CAM1 previas. Fuente 03
permite diferir alternativas y recuperarlas, pero exige conservar las
materialmente distintas. Agotar una cuota local no demuestra imposibilidad.

## Contrafactual temporal antes del wiring

Los hooks parten de S0 sin seed, hint, snapshot aceptado ni witness recibido.
Conservan geometrías, orden de productores, recursos, comidas y validators.
Los intentos interrumpidos también se cargan al único ledger global.

| Cuota STANDALONE por core | 5.000 | 4.000 |
|---|---:|---:|
| Cores visitados / primer certificado | 7 / 7 | 7 / 7 |
| Alternativas aplazadas | 1 | 2 |
| Ledger CORE | 4.766 | 4.766 |
| Ledger STANDALONE | 16.946 | 15.089 |
| Total al primer certificado | 21.712 | 19.855 |
| S1, ms | 154.302 | 142.432 |
| Main aceptados / Stage | 19 / S1 | 19 / S1 |

El primer borrador de cuota 10.000 limitaba también CORE y omitía un cargo de
interrupción. Se conserva como observación preliminar, fuera del gate de
accounting. Las dos pruebas de la tabla corrigen ambos puntos: sólo acotan
STANDALONE y contabilizan la decisión que interrumpe. No se deniega una carga
CORE después de que el explorador técnico haya avanzado.

El observador temporal clasifica por candidato `DEAD_END_BRANCH`,
`DEFERRED_LOCAL_QUOTA`, `GLOBAL_BUDGET_EXHAUSTED` y certificado completo.
El formatter privado del baseline aún etiqueta el tag diagnóstico como
`UNCERTIFIED_REJECT`; el reemplazo textual no coincidió con el JS minificado.
Esa etiqueta nunca genera un nogood o una prueba de inviabilidad. El contrato
productivo nuevo maneja `DEFERRED` antes de cualquier rechazo o reparación.
Los hooks no reanudan sus raíces: sólo sustentan el resultado positivo, y no
permiten una conclusión negativa de completitud.

Ambas pruebas aceptan el mismo S1 y generan el mismo `JOINT_COMPLETION`
`e56bf4650364243918db0f7aef8907ad8195cdecb2b4062aedb375305572a72a`
que el control positivo de la unidad anterior. Ese control se compara sólo
después de ejecutar; jamás se inyecta su material. Las diferencias de tiempo
no prueban una mejora causal de latencia.

## Retención y reentrada demostradas

Antes de conectar el delta al Planner se probaron 76/76 fixtures, incluidos
los ocho iniciales de coordinación. El conjunto definitivo añade una novena
prueba para un certificado de backjump obtenido después de reentrar.

Los productores actuales son síncronos y no exponen un cursor conjunto. Se
retiene una **raíz inmutable**, con su callback, arquitectura, matching,
aristas prohibidas y conjunto compartido de reparaciones vistas. Los siblings
pendientes del matching permanecen en su cola; las raíces diferidas conservan
su autoridad al cambiar de arquitectura. Tras agotar los candidatos nuevos,
se reentra FIFO desde esas mismas raíces, con cuota duplicada.

La reentrada reconstruye el prefijo: no congela la pila ni promete avanzar sin
repetición. Cada reevaluación real y cada decisión de interrupción vuelve a
cargarse una sola vez al mismo ledger. Por ejemplo, una continuación de cinco
decisiones con cuota inicial dos consume 3 + 5 + 5 = 13 cargos, incluyendo
las dos interrupciones. No existe replay gratis, devolución de cargos ni
budget nuevo. Los candidatos ya cacheados por la autoridad técnica conservan
su accounting normal de cache miss y se revalidan en el contexto actual.

`DEFERRED` no incrementa nogoods ni hard rejects. Si los demás cores fallan,
los fixtures recuperan la raíz inicial, sus identidades, placement protegido
y referencias de reserva. Un certificado obtenido al reentrar repara el
matching original; dos siblings materialmente distintos siguen alcanzables.
La búsqueda sin certificado agota las raíces diferidas antes de concluir
inviabilidad. Si el ledger global se agota primero, devuelve presupuesto;
no convierte la alternativa pendiente en una prueba negativa.

La retención no garantiza explorar toda la frontera dentro de un presupuesto
finito: si enumerar los demás cores agota el ledger, no puede reentrar. Esa
salida permanece explícitamente inconclusa por presupuesto.

## Delta incorporado

Sólo cambian dos archivos productivos:

- `exactMainAndFeederCore.ts`: contrato `DeferredCoreContinuation`, wrapper de
  cuota sobre el ledger existente y cola de raíces estructurales diferidas.
- `exactItinerantPlan.ts`: conecta la cuota únicamente en bundles estructurales
  con continuación colectiva analítica y copia sus contadores de coordinación.

La cuota inicial es `floor(ledger.limit / max(2, número de Main))`, al menos uno;
en este A2 deriva 5.263. Es una prioridad de exploración, no un segundo budget
ni un criterio de viabilidad. El trabajo CORE técnico sigue gobernado por el
ledger global. Se preservan los paths de fixed Main y DFS ordinario, los
productores y `FIRST_HARD_VALID`. No hay IDs, horas, concursantes o nombres A2
en el delta; no se cambia canon, benchmark, expectativas ni timeouts.

`coreContinuationScheduling.spec.ts` prueba solución temprana, solución tardía,
reentrada, ausencia de certificado, presupuesto global, determinismo, input
inmutable, protección y reservas, backjump después de reentrada y conservación
de reparaciones alternativas. Los contadores nuevos existen en la Evidence
del motor; el proyector Assisted actual no los exporta en `work`.

## A2 real desde S0, sin hook

| Gate | Run 1 | Run 2 |
|---|---:|---:|
| Resultado | PASS, 266/266 | PASS, 266/266 |
| Accepted Stages | 10 | 10 |
| S1 CORE / continuación | 4.766 / 17.209 | 4.766 / 17.209 |
| S1 total | 21.975 | 21.975 |
| S1, ms | 147.841 | 117.319 |
| A2 completo, ms | 172.410 | 135.793 |
| HARD / REQUIRED nuevos | 0 / 0 | 0 / 0 |
| Placements aceptados movidos | 0 | 0 |
| Sodexo certificados por Stage | 19 | 19 |
| Objetivo S1 120 s / techo 300 s | FAIL / PASS | PASS / PASS |

Ambos reciben S0 vacío y configuración canónica vigente. No usan selectors
forzados, snapshot inicial, seed ni hook. El selector de producto conserva sus
unidades canónicas. Aceptan 19 → 38 → 46 → 65 → 75 → 111 → 169 → 207 → 209 →
266 obligaciones, sin omisión ni duplicación. P14 conserva 58 obligaciones;
Giratuto permanece independiente de CAM1.

S1 devuelve sólo los 19 Main autorizados. Sus 38 placements supporting
efímeros y el witness futuro no pasan al snapshot aceptado ni se protegen.
Cada Stage preserva literalmente los placements, comidas y decisiones
estructurales ya aceptados; sus obligaciones visibles coinciden con el scope.

Se comparan snapshots, scopes, ledgers, preparaciones, comidas, witnesses y
certificados de cierre mediante `collectiveClosureDeterministicMaterial`:
digest `1ce09d49ee3a737a643cbe8e3a66889291be8bbdcef009834b2a34ca85214795`.
Fingerprint S10 idéntico:
`9aab3549a93a6d656e1000d09edbe51574b14ec0496d4f9175d8b0cf6a6c1745`.

La auditoría independiente revalida los 20 witnesses completos contra el
canon vigente: cada uno contiene 247 tareas + 19 Sodexo, las preparaciones y
comidas operativas necesarias, y las 51 tareas con CAM1 sin solapes. Cada replay
carga 292 vértices; incluso sumados al ledger observado de su petición,
el máximo es 22.267. Es validación posterior, no trabajo oculto de búsqueda ni
un witness utilizado para sembrar una propuesta.

## Checks y límites de entrega

| Validación | Resultado |
|---|---|
| Focales: coordinación, core, itinerante, Assisted, witnesses, comidas y CAM1 | 225/225 PASS |
| Proporcionales de producto: request/apply, refresh, lineage, scope y snapshots | 86/86 PASS |
| Transporte grouping/policy | 22/24, dos fallos heredados |
| `npm run check` / `npm run build` | PASS / PASS |
| `npm run check:migrations` / tests de secuencia | PASS / 8/8 PASS |
| Revalidación conjunta independiente | 20/20 PASS |
| CI del HEAD publicado | Checks y enlace exacto en #1104 |

Los dos fallos de transporte son los mismos documentados antes del delta:
`exact continuation constructs IN, work, ESTILISMO_SALIDA, then dependent OUT
immutably and order-invariantly` y `terminal IN materialization finds the
backward-propagated witness`. Se mantienen fuera de esta unidad.

**Merge readiness: NO.** A2-ASSIST-8 recupera completitud material con CAM1;
el objetivo S1 ≤120 s no pasa en ambos runs. ASST-010 refresh, AcceptedException,
rollback, redo y divergencia no se declaran PASS a partir de este A2. Sus tests
proporcionales pasan, pero el gate integral continúa abierto. Se mantiene el
PR draft, sin merge y sin ampliar esta iteración a optimización de latencia.
