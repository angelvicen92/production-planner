# ASST-010: experimento de continuación conjunta

PR #1104, HEAD inicial `7f5091d3afb5c1dc746d1e9d5e56fdc38e534e31`, 10 de octubre de 2026.

**S2 no se ha conseguido. El experimento no se integra en producción.** Dos fixtures alcanzan hojas completas certificadas; el estrés del canon protegido termina sin hojas. Se detiene la expansión tras dos ciclos causales de una misma arquitectura. El motor, selector, harness, canon, expectativas, dependencias productivas y límites permanecen idénticos al HEAD inicial.

[Resultados y estados reproducibles](ASST-010-S2-JOINT-COMPONENT-EXPERIMENT.json). La [prueba positiva independiente](ASST-010-S2-PROTECTED-FEASIBLE.json) se reaudita: el problema protegido sigue siendo **FEASIBLE**. No se utiliza su solución para ordenar, inicializar o completar la búsqueda.

## X / Y / Z / W / M

- **X:** después de aceptar Main 10017 `[835,850]` y refrescar las 19 entradas de Estilismo a 20 minutos, `TASK_IDS:[10015]` no obtiene S2.
- **Y:** la geometría densa impide el cierre de C01. La reparación elimina IN y entradas provisionales, pero mantiene todos los Main/Vocal futuros del core. Reinicia prerequisites y el cursor de reservas con ese contexto, perdiendo tanto el hueco como la posibilidad de revisar esas decisiones dentro de la continuación.
- **Z:** el máximo stage real permanece S1. AcceptedException, provenance, rollback, redo, divergencia y recertificación posterior siguen `NOT_REACHED` en ASST completo.
- **W:** probar dominios acoplados con Main/Vocal no aceptados revisables, propagación de precedencias/capacidad, matching y conflictos condicionados. Conservarlo únicamente como diagnóstico porque no alcanza ninguna hoja en el canon completo.
- **M:** fixtures certificados; estrés `INCONCLUSIVE`; ASST `BLOCKED`; dos A2 nuevos 266/266; 723 tests y checks requeridos PASS. PR draft, sin merge readiness.

## Pérdida de decisiones y contextos equivalentes

En `exactItinerantPlan.ts::onHardValidCoreLeaf`, `reparableIds` contiene IN y entradas no protegidos. `attempt(true)` los retira; Main, Vocal y anchored futuros permanecen en `immutableCoreTasks`. `searchJoint` usa ese contexto como fijo para prerequisites, reservas de cadenas, agendas y residual. La búsqueda puede cambiar Main/Vocal al recibir otro core, pero la reparación de ese core no puede hacerlo.

Los 27 cores del experimento anterior se reducen a dos entradas materiales a reparación, repetidas 19 y ocho veces. Dentro de cada grupo coinciden las tareas retenidas, comidas, `selectedMainMealStart=865`, obligaciones pendientes, canon, protecciones y tipo de productor. Difieren placements retirados y fingerprints de arquitectura/geometría que no conservan el hueco en el problema reparado.

Esto acredita equivalencia de las restricciones iniciales, **no equivalencia del estado operativo**. `PreparedFutureTechnicalChainAuthority` conserva candidatos descubiertos y su explorer; `visitChain` reinicia su cursor local en cero, y `searchExactPrerequisiteClosure` reconstruye la DFS. El ledger restante también cambia. Reutilizar correctamente ese trabajo requiere conservar stack, próximos choices, cursores y alternativas diferidas. No se añade una cache de DEAD_END/ABSTAIN ni se afirma haber evitado esas 25 recomputaciones en producción.

## Arquitectura ensayada y límites

El diagnóstico lee el canon vigente y el JOINT_COMPLETION real asociado al stage aceptado. Proyecta dominios canónicos; mantiene las filas protegidas literalmente; permite permutar las posiciones anteriores de Main entre identidades no aceptadas y mover Vocal, entradas, cierres y comidas. Materializa sólo un witness efímero y lo acepta después del replay canónico completo.

Las asignaciones itinerantes y los layouts previos de anchored, joint, rondas, cadenas, setup, continuidad secundaria y grupos de transporte son **restricciones adicionales de una candidata**. No son nuevas reglas HARD. Las pausas previas son también una elección de esta candidata. Un negativo restringido, una cuota o un timeout no certifican inviabilidad del problema completo.

El primer ciclo usa consistencia binaria conjunta; el segundo añade Hall para las posiciones de Main, límites energéticos de capacidad, explicaciones por valores eliminados y nogoods locales. Se ensayan refinamientos de estos mismos mecanismos, registrados en JSON. Ninguno mejora el resultado funcional del canon completo. No se ensaya otra arquitectura ni se conecta ésta al producto.

El grafo estático que une precedencias y capacidad compartida conecta las 247 tareas. Una partición ingenua por componentes no reduce este A2 a subproblemas independientes. Tras agrupar los layouts candidatos quedan 193 variables y 4.083 relaciones: esta aproximación sigue explorando un componente demasiado grande mediante decisiones de start.

El ledger diagnóstico cobra preparación de relaciones, decisiones intentadas, batches de propagación y vértices de replay. Registra además revisiones y comparaciones de soporte. No concede un presupuesto adicional al producto ni rebaja cargos de reentradas. El techo diagnóstico de 60 segundos se aplica exclusivamente al experimento; el producto conserva 300 segundos y 100.000 ramas.

## Gates y bloqueo residual

| Ejecución final | Hojas completas / certificados | Tiempo | Cargos |
| --- | ---: | ---: | ---: |
| Cuatro participantes: bloque denso y cierre | 1 / 1 | 35,3 ms | 179 |
| Seis participantes: Main protegido, cadena, comidas, transporte y margen de 5 min | 1 / 1 | 72,6 ms | 401 |
| Canon completo protegido post-refresh | 0 / 0 | 60,001 s | 12.131 |

Los fixtures parten de un lineage válido con entradas de diez minutos; no contienen una solución post-refresh. Ambos modifican Main y Vocal no aceptados, conservan la protección literal, pasan `validatePlan`, replay JOINT_COMPLETION y cierre `CERTIFY`. Sus ejecuciones repetidas son materialmente idénticas. Una contraprueba exhaustiva sobre 300 problemas pequeños comprueba que capacidad, matching, explicaciones y nogoods no pierden soluciones en esos casos; no acredita escalabilidad al A2 completo.

El estrés alcanza profundidad máxima 25, prueba 2.716 decisiones y realiza 5.332 propagaciones, sin hojas. Aprende 2.615 nogoods condicionados, con 22 usos. Los dominios vacíos más frecuentes son Vocal 10153, 10249, 10262 y 10236 en el espacio 3002, seguido de asignaciones de Main. Son observaciones de este explorer, **no autoridades de imposibilidad global**.

La captura del primer conflicto tarda **1,503 segundos** y consume **4.102 cargos**. Refuta condicionalmente la relación entre las raíces 10263 y 10237, que en esta candidata tienen la misma unidad itinerante. La explicación conserva entradas 10003@680, 10018@720 y 10032@550; raíz de cadena 10081@1000; y anchored 10064@835, equivalente a Main 10056@850. Son decisiones provisionales, aparte del Main 10017 realmente aceptado. El JSON guarda dominios y decisiones completos. La explicación no se declara mínima ni se transforma en un nogood global.

El productor productivo que impide revisar conjuntamente estas elecciones sigue siendo la frontera `immutableCoreTasks → searchJoint → visitChain/visitAgenda → standalone`. El siguiente gate debe coordinar asignación de Main/Vocal con capacidad de Estilismo y agendas/unidades. La captura permite probarlo directamente, sin repetir la aceptación de S1 ni otro timeout completo. Este diagnóstico no demuestra todavía una arquitectura suficiente.

Los conflictos focales C05/C08 se reejecutan con las autoridades actuales: prefixes legales, entrada con dominio cero, Hall 1/0, un cargo por caso y 27/25 traversals. Su detección ya es inmediata. El audit del witness positivo confirma cero violaciones, 247 tareas, 19 Sodexo, 51 CAM1 sin solapes, replay y cierre certificado.

No se ejecuta de nuevo ASST desde S0: el estrés completo no supera el gate previo. El control fiel del HEAD inicial permanece en **300,061 s / 48.743 ramas / cero hojas / SEARCH_TIME_LIMIT_REACHED**. Los números de un diagnóstico limitado a 60 segundos no se comparan como una mejora de ese flujo productivo. No se fabrica ni se fuerza ScopeProposal.

## Regresión y entrega

Dos flujos nuevos A2 desde S0 completan diez stages y **266/266**. S1: **64,069 y 76,592 segundos**, ambos ≤120. Totales: 84,552 y 97,882 segundos. Digest material invariable `1ce09d49ee3a737a643cbe8e3a66889291be8bbdcef009834b2a34ca85214795`; fingerprint final `9aab3549a93a6d656e1000d09edbe51574b14ec0496d4f9175d8b0cf6a6c1745`.

Los veinte replays pasan, con 292 cargos cada uno. Scope exclusivo, futures no aceptados, protección literal, comidas, CAM1 y HARD/REQUIRED intactos. Los tiempos son descriptivos: hubo verificaciones breves concurrentes y no cambia el motor, por lo que no se afirma ganancia de rendimiento.

**723 tests PASS:** 269 focales, 88 producto, 41 transporte/cierre, dos métricas, ocho migraciones, 309 integración y seis del experimento. Se comprueban los casos reales de `tsx --test`, sin sustituirlos por conteo de archivos. Typecheck del repositorio y de los módulos diagnósticos, build y secuencia de migraciones PASS; no se aplican migraciones ni se añaden dependencias productivas. CI del HEAD publicado y SHA exacto se registran en la descripción del PR.

## Reproducción focal

```sh
mkdir -p work/asst-s2-components
npx tsx --test script/diagnostics/asst010JointComponentExperiment.spec.ts
node --import tsx script/diagnostics/runAsst010JointComponentExperiment.ts docs/evidence/ASST-010-S2-PROTECTED-FEASIBLE.json work/asst-s2-components/first-conflict.json --first-conflict
node --import tsx script/diagnostics/runAsst010JointComponentExperiment.ts docs/evidence/ASST-010-S2-PROTECTED-FEASIBLE.json work/asst-s2-components/stress.json
```

El modo `--audit-model` contrasta exclusivamente que el witness externo satisface las relaciones de la candidata y retorna `MODEL_AUDIT_ONLY`, sin búsqueda ni hint. El modo normal lee sólo `source`, `priorJoint` y `protectedTasks`. Ni el artifact externo ni la salida del experimento se envían a `AssistedProposalService`.
