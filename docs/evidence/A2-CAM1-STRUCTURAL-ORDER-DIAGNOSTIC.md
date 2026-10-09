# A2 con CAM1 — contrafactual de prioridad estructural

PR #1104, base `5e46168daa35d755bcb9a2573ed81647d8b466a2`, código
evaluado `e9d33171274f251185d751c5bd34d93abbfece65`. Fecha: 2026-10-09.
Datos, contextos completos, certificados generados y reproducción:
[JSON](A2-CAM1-STRUCTURAL-ORDER-DIAGNOSTIC.json).

**Resultado: CASO B, S1/A2 siguen BLOCKED.** Cambiar únicamente P15→Totales por
Totales→P15 no recupera S1 desde S0: ambas políticas consumen 100.000 ramas
antes de alcanzar otro core. En una segunda arquitectura ambas construyen un
certificado completo válido; el orden actual consume menos ramas. No se
implementa prioridad ni otro cambio de solver. Se conserva CAM1 y se detiene
la expansión: no existe contraprueba de un defecto general puntual que permita
sustituir ese delta por otra corrección.

## X/Y/Z/W/M

- **X:** S1 Main de 19 participantes no obtiene propuesta; A2 queda S0, 0/266.
- **Y contrastada:** P15 puede materializar una geometría provisional que deja
  Totales sin matching. Esto demuestra un rechazo condicionado, pero no que
  invertir ambas unidades sea suficiente para recuperar el cierre global.
- **Z:** en el primer contexto alcanzado, ambos órdenes consumen todo el ledger
  en productores conjuntos, sin residual ni certificado. Una continuación
  alcanzable posterior sí produce 247 tareas + 19 Sodexo bajo CAM1.
- **W experimental:** hook temporal que elige la ronda si MRV seleccionaría una
  unidad de recurso preferido y existe una ronda con dominio positivo. Sólo
  cambia esa elección; conserva productores, alternativas, autoridades y ledger.
  No se integra en producción.
- **M:** primera arquitectura, agotamiento con ambos órdenes; segunda, FOUND y
  revalidación PASS con ambos, con menor consumo bajo MRV. El control desde S0
  sigue NO_PROPOSAL. No se convierte INCONCLUSIVE/ABSTAIN en PASS ni se declara
  inviabilidad global.

Autoridad: Fuentes 03 v3.6 §§13.4–13.5, 28 y 35; 05 v2.6 A2-ASSIST-8;
06 v2.7 §§7.4–7.6; 07 v2.2 §§4.4 y 10.1. Totales conserva criticidad
estructural; las fuentes no autorizan descartar alternativas ni modificar
restricciones para fabricar un certificado. Los hashes de las fuentes están
en el JSON. Esta prueba refuta la suficiencia del delta propuesto, no la
presión temporal de las rondas ni toda posible utilidad contextual del orden.

## Contrafactual dirigido

Camino observado:

```text
SPACE Main → scope projection → analytical continuation → arquitectura/matching
→ supporting efímero → onHardValidCoreLeaf → searchJoint → cadenas/agendas
→ searchStandaloneForCoreCandidate → macroConstrainedness → selector
→ productores P15/Totales → CAM1/residual/comidas/transporte → validator
```

Se captura el primer contexto de continuación del core Main 12:00 / comida
14:15, después de cadenas/agendas. Sus dos replays comparten exactamente
problema, tareas core, comidas, recursos, preparaciones, witnesses previos,
evidence inicial y ledger ya consumido: **12.656 = 3.642 core + 9.014 continuación**.
El hash de la entrada completa es
`021f123f04d1ca9f554b9619a4600059f72f9474e84d2803c275bd9a60b83269`.

Primera divergencia: después de JOINT Totales Post, P15 tiene dominio 34 y
Totales 41 matchings factibles entre 353 geometrías estructurales. MRV elige
P15; el hook elige Totales. El vector de candidatos anterior a la elección es
idéntico en ambos replays. P15 mide el mínimo dominio individual de sus
tareas; Totales cuenta formas sincronizadas con matching. El etiquetado actual
`hard-valid-top-level-macro-placements` no convierte esas medidas en cardinalidades
equivalentes. No se corrige ese contrato descriptivo dentro de esta unidad.

| Contexto Main 12:00 | P15→Totales | Totales→P15 |
|---|---:|---:|
| Ledger total | 100.000 | 100.000 |
| Core / continuación | 3.642 / 96.358 | 3.642 / 96.358 |
| Ramas nuevas tras entrada | 87.344 | 87.344 |
| P15 geometrías / intentos / matchings completos | 1 / 13 / 13 | 1.734 / 1.734 / 0 |
| Totales intentos / matchings completos | 4.305 / 0 | 224 / 1 |
| Traversals matching P15 | 1.603 | 79.942 |
| Traversals matching Totales | 81.014 | 6.798 |
| Residual ordinario / cierre completo | 0 / 0 | 0 / 0 |
| Resultado | BUDGET_EXHAUSTED | BUDGET_EXHAUSTED |
| Tiempo de continuación observado, ms | 123.162,598 | 91.238,525 |

La inversión produce una ronda que pasa al siguiente productor; no produce
un certificado global. Desplaza la frontera de Totales a P15. Los tiempos
parciales incluyen instrumentación y se solaparon parcialmente con otros
diagnósticos; no prueban una mejora causal de latencia del producto.

## Segunda arquitectura alcanzable y control positivo

Para obtener un segundo contexto sin aumentar presupuesto se ejecuta un
**enumerador diagnóstico separado**: callbacks de cores anteriores al umbral
12:05 devuelven REJECT para avanzar en el productor existente, sin convertir
ese retorno experimental en una poda de dominio. Se para al capturar la
primera entrada posterior: séptimo core observado, Main **12:10**, comida
**14:25**, **4.784 = 3.846 core + 938 continuación** ya consumidas.
Esta enumeración no es un replay de benchmark ni un éxito desde S0. El JSON
conserva los siete cores y la política de captura. No introduce tareas del
oráculo, fija horas de solución ni altera la configuración.

Ambas continuaciones empiezan desde esa misma entrada capturada; sólo difiere
el orden P15/Totales. Hash completo:
`9eb3ebebaf46a1915b9c186f420c0feb3a9eed722cc5530c3fc06a75187f1d24`.
P15 tiene dominio 37; Totales 92 matchings factibles, 353 formas estructurales.

| Contexto Main 12:10 | Orden actual | Totales primero |
|---|---:|---:|
| Ledger total | 7.849 | 11.459 |
| Core / continuación | 3.846 / 4.003 | 3.846 / 7.613 |
| Ramas nuevas tras entrada | 3.065 | 6.675 |
| P15 geometrías / intentos / matchings completos | 1 / 1 / 1 | 1 / 1 / 1 |
| Totales intentos / matchings completos | 190 / 1 | 145 / 1 |
| Traversals matching P15 / Totales | 156 / 917 | 147 / 4.408 |
| Residual ordinario / cierre completo | 7 / 1 | 7 / 1 |
| Tareas / Sodexo / comidas operativas | 247 / 19 / 8 | 247 / 19 / 8 |
| Revalidación canónica / HARD / REQUIRED | PASS / 0 / 0 | PASS / 0 / 0 |
| Tiempo de continuación observado, ms | 66.282,827 | 18.882,931 |

El orden actual intercala tareas de recurso CAM1 antes de la ronda; Totales
primero construye la ronda inmediatamente. Ambos preservan el core literal,
cierran comidas, preparaciones y transporte con los productores actuales y
llegan a `completeLeaf`. La menor duración observada de la inversión y su
mayor ledger describen métricas distintas; no se infiere una prioridad
universal ni una recuperación de S1 a partir de este caso aislado.

Los certificados nuevos se generaron por búsqueda, no por replay del oráculo
recibido. Revalidación independiente contra el canon completo: **292** cargos
por certificado, incluidas todas las decisiones materiales; totales búsqueda
más esta verificación **8.141 / 11.751**, ambos dentro de 100.000. Ningún task
futuro se acepta o protege y no existe ScopeProposal/Stage de estos probes.
Los dos materiales completos difieren; esa diferencia entre políticas no es
una regresión de determinismo de producción.

## Accounting y causas observadas

El JSON conserva evidencia completa de los cuatro replays, diferencias por
autoridad y una reconciliación con cada delta real del ledger. Matching de
Totales y P15 y decisiones de shape se contabilizan; no se confunden edges
analíticos con ramas. Los campos de traversals de cierre colectivo son trabajo
analítico y no se suman como nuevos cargos. Las autoridades anidadas no se
suman dos veces. El resto no atribuido individualmente agrupa generación de
setup y cierre terminal; no se presenta como trabajo gratis ni como una
autoridad inventada.

El rechazo condicionado original de Totales persiste al retirar sólo CAM1 y
se abre al retirar los 36 placements provisionales P15 (41 matchings): véase
[contraprueba anterior](A2-CAM1-CORRECTION.md). El nuevo contrafactual conserva
CAM1 y todas las restricciones; su primer matching Totales deja P15 sin
matching entre las 1.734 geometrías exploradas antes del agotamiento. No se
ha agotado el conjunto de realizaciones conjunto; no existe una prueba de
inviabilidad de ese core ni del día. No se deriva un nogood global de una
abstención o de un ledger agotado.

## Frontera frente al oráculo completo CAM1

El witness `91987a5174e77a980b976edccca5eaf835b03214937c25514601c0ae63ae761b`
se usa exclusivamente read-only. Su revalidación vuelve a pasar con 292 cargos.

1. **Arquitectura Main:** el frontier temporal existente enumera exactamente
   sus slots, patrón de coaches y comida: primera hora 12:20, comida 14:50,
   final 18:20, ocho slots Lucía y once José María. Aparece en la entrada bruta
   858 del frontier; no equivale a 858 core leaves hard-valid. Pasa la prueba
   estructural y el witness nominal es FEASIBLE. No se inserta esa arquitectura
   como preferredArchitecture ni hint en ningún benchmark.
2. **P15:** condicionado sólo para diagnóstico por las tareas no P15 del
   oráculo, el generador actual enumera 38 candidatos setup con 363 ramas.
   Uno coincide en geometría y asignación nominal con el setup válido:
   Sillón 15:20–16:05, preparación 16:05–16:15, Estrellas 16:15–16:55.
   La fórmula BEFORE ya existente produce Croma 10:55–14:05 y comida P15
   14:05–15:20; las 19 aristas nominales conocidas son admisibles.
3. **Totales:** el constructor de slots y pausas existente genera 353 formas;
   una coincide exactamente con las diez rondas conocidas, primera 11:30,
   comida 13:10–14:25 tras tercera ronda y cambio de micro de cinco minutos.
   Las 19 aristas conocidas pasan `canPlaceTask` en ese contexto diagnóstico.
4. **Combinación con cadenas y cierre:** la combinación conocida se valida,
   pero eso no demuestra su generación nominal íntegra. El control positivo
   Main 12:10 sí genera automáticamente otra combinación completa, con ambos
   órdenes, y certifica todas sus identidades y protecciones provisionales.
5. **Diferencia:** los 19 Main del oráculo difieren de los cores 12:00 y 12:10.
   Trasplantar literalmente sus macros a esos contextos produce 19 y 12
   rechazos directos respectivamente. El JSON guarda sus diagnósticos; no son
   prueba de que toda geometría alternativa con esos cores sea imposible.
6. **Primera frontera observada:** el ledger se agota en la continuación del
   tercer core, antes de llegar al séptimo que ya sabemos cerrar, y antes del
   Main del oráculo. No se demuestra pérdida de representación ni poda
   incorrecta. La prioridad propuesta cambia el consumidor dominante, pero
   no libera esa frontera de presupuesto. No se implementa otra heurística.

## Gates, validación e integración

Control global limpio desde S0, un solo request y budget 100.000, sin seed,
hint ni certificado recibido. Se usa el stop focal existente tras primera
iteración; ambas ejecuciones fallan antes de ese stop y registran NO_PROPOSAL.

| S1 automático con CAM1 | Orden actual | Totales primero |
|---|---:|---:|
| Cores evaluados | 3 | 3 |
| Ledger core / continuación | 3.642 / 96.358 | 3.642 / 96.358 |
| Propuesta / Stage aceptado | No / 0 | No / 0 |
| Completitud aceptada | 0/266 | 0/266 |
| Duración completa de petición, ms | 199.584 | 148.405 |
| Objetivo 120 s / techo 300 s | FAIL / PASS | FAIL / PASS |

Ambos devuelven `ASSISTED_SCOPE_INCOMPLETE` y
`STANDALONE_BRANCH_BUDGET_EXHAUSTED`. El control con hook neutro coincide en
todo `iterations[].work`, material y S0 fingerprint con los dos runs canónicos
CAM1 previos: digest `c62b90875904fe551949c31c95e74eaf8b95176b06463f9290b0ecb926a17126`.
Esto verifica neutralidad material/accounting del observador; no demuestra
neutralidad de latencia ni una reducción causal de tiempo de 51,179 s.
La inversión cambia sus contadores/material provisional, pero conserva el
S0 aceptado `92541a8396180e9d9130e33c7050c9c72d41ba4a5e5009a27943f90b02805556`.

El baseline histórico sin CAM1 llegó a S10, 266/266 con 80.835 ramas en S1.
Su validación carecía de CAM1: no es un objetivo de fingerprint que debamos
preservar ni un PASS comparable del canon vigente. Con CAM1, ambas políticas
actuales están bloqueadas; los certificados aislados no sustituyen ese gate.

| Validación local de esta unidad | Resultado |
|---|---|
| Focales, incluidos selector, CAM1, scope y witness | 340/340 PASS |
| Rondas, P15, comidas, recursos y regresión proporcional | 81/81 PASS |
| Transporte: grouping y policy | 22/24; dos fallos heredados |
| TypeScript / build | PASS / PASS |
| Secuencia de migraciones / test de secuencia | PASS / PASS |
| Certificados generados: canon, identidad, core y HARD/REQUIRED | Dos PASS; 292 cargos cada uno |
| CI del HEAD publicado | Consultar checks y resultado actualizado en #1104 |

Los dos fallos heredados son `exact continuation constructs IN, work,
ESTILISMO_SALIDA, then dependent OUT immutably and order-invariantly` y
`terminal IN materialization finds the backward-propagated witness`. Coinciden
con los fallos ya reproducidos en producción y en el baseline 581f de la unidad
CAM1. Los archivos de motor y tests no cambian en esta unidad: **445 tests,
443 PASS / 2 FAIL heredados, cero nuevos fallos**. No se aplican migraciones
a una base de datos ni se afirma que la suite global del repositorio pase.

El control global y las verificaciones finales se registran en el JSON.
S1, A2-ASSIST-8 completo y ASST-010 conservan sus gates abiertos. Los anteriores
266/266 sin CAM1 son una referencia histórica de búsqueda, no un PASS del
canon vigente. No se exige conservar sus fingerprints inválidos.

La propuesta Main explícita no se produce desde S0; el scope solicitado
contiene únicamente los 19 Main. Cero Stages aceptados implica que no se mueve
ningún placement aceptado, pero no demuestra protección a través de S10.
Los certificados diagnósticos completos no aparecen en una propuesta ni en
el estado aceptado. Dos runs canónicos previos con CAM1 siguen disponibles en
[CAM1 correction](A2-CAM1-CORRECTION.json); este informe no los sustituye por
certificados aislados ni llama determinismo S10 a la igualdad de S0.

**ASST-010 separado:** permanece OPEN. El refresh de Estilismo 10→20 conservó
S1 y reconstruyó configuración vigente en la evidencia histórica sin CAM1;
S2 no certificó el cierre. No se revalida ni se declara ese éxito parcial bajo
el canon CAM1 actual. Excepciones/provenance, rollback, redo y divergencia
canónicos siguen sin alcanzar su recorrido completo. No se modifica ese gate.

El único cambio entregado es Evidence y su referencia desde el informe CAM1;
motor, canon, budgets, timeouts, tests y expectativas permanecen intactos.
Los hooks se retiran del checkout y quedan como texto reproducible dentro de
Evidence, sin wiring productivo. El PR continúa draft, sin merge.

El JSON comparte subárboles repetidos mediante `$evidenceRef` y
`sharedEvidenceObjects.objects`, conservando todos los contextos y materiales.
La expansión se comprueba idéntica al documento original. Para extraer los
probes temporales y los cuatro resultados reproducibles:

```sh
python3 - <<'PY'
import json
with open('docs/evidence/A2-CAM1-STRUCTURAL-ORDER-DIAGNOSTIC.json') as f:
    d = json.load(f)
exec(d['reproduction']['extractor'])
PY
node --import tsx work/structural-priority/verify.ts
```

Las órdenes de replay están en `reproduction.commands`. El extractor hidrata
las referencias antes de escribir contextos; no inyecta el oráculo en el runner.

**Siguiente paso único para ChatGPT:** aislar la incompatibilidad conjunta
P15/Totales del primer contexto Main 12:00 y exigir una contraprueba de una
autoridad necesaria sound que pueda rechazar o reabrir esa decisión antes
del agotamiento. Usar el certificado generado de Main 12:10 como control
positivo. No autorizar otro ordering, budget o solver sin esa prueba.
