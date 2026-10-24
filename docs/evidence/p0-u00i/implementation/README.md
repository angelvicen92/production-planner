# P0-U00i — selección nominal productiva limitada

Continuación del mismo [PR #1187](https://github.com/angelvicen92/production-planner/pull/1187), base `e79f8ee`, diagnóstico inicial `bb47936`. El producto certificado localmente corresponde a `a310e54`; [source-authority.json](source-authority.json) permite verificar los bytes aunque el head posterior añada Evidence. CI remoto pendiente de cerrar sobre el head de entrega.

Soporte exclusivo: jornadas **STANDALONE_ONLY**, tareas **ordinary auxiliary sin agrupación**, un grupo `anyOf`, `quantity=1`, inventario global→diario inequívoco y recursos físicos exclusivos. Los recursos independientes byItem, directos y heredados se conservan. Main/Vocal, joint, cadenas, rondas, macros/setup, componentes, selección de coaches, grupos múltiples, quantity>1, byType y auxiliares compartidos permanecen fuera de este contrato. Las guardias de requiresAuxiliar/Presenter siguen activas. `anyOf: []` continúa significando ausencia de grupos; un grupo con dominio vacío se rechaza.

## Auditoría causal integral — Fuente 07 §4.4

**Antes.** El [diagnóstico inmutable](../README.diagnostic.md) y [call path](../call-path.md) documentan configuración, snapshots, preflight, adapter, scope, geometría/matching, materialización, disponibilidad, futuro, backtracking, validación y persistencia. El rechazo inicial no era inviabilidad: B/A completaba la ventana simultánea. Retirar sólo el rechazo eliminaba el consumo y aceptar flexible→A podía cerrar una obligación futura de otro participante. La primera pérdida aparecía en representación/materialización; faltaban además validación, fingerprint y round-trip. La frontera Main permanece cerrada.

**Delta.** El resolver de U00h resuelve cada identidad global contra una única identidad diaria y conserva separadamente dominio elegible, recursos fijos y selección. `Task.nominalResourceChoice` es opt-in. `Positions.variants` materializa una alternativa específica antes del dominio estático y canPlaceTask; la clave de caché distingue la identidad. MRV, coste, ledger, presupuesto y backtracking conservan su autoridad. `tasksCanAffectEachOther` contempla el consumo posible entre participantes diferentes. No hay heurística de afinidad nueva; el ID sólo desempata de forma estable. Un test reproduce un callejón colectivo y acredita retroceso de A a B.

**Futuro y aceptación.** La proyección productora existente construye un testigo conjunto de las obligaciones pendientes usando la misma búsqueda y ledger. Sólo el scope autorizado llega a propuesta/Draft/Stage. Los testigos futuros son efímeros y sus recursos no se escriben como asignaciones ni locks. La elección aceptada se reconstruye desde `assignedResourceIds` diarios y permanece protegida en la continuación. La validación compara identidades y recursos con el input canónico, revalida el testigo completo sin buscar otra vez y distingue las elecciones en el fingerprint. Días sin anyOf conservan su fingerprint histórico.

**Persistencia y contrafactual SQL.** Los recibos [antes de 110](before-integrity/sql-omission-before-110.json) muestran que la omisión con todos los hashes recalculados era aceptada por el RPC existente; la transacción se revierte. Por ello la migración incremental 110 añade un trigger a la inserción de validaciones. Es SECURITY INVOKER, `search_path` vacío y pertenece a un esquema privado sin USAGE/EXECUTE para anon/authenticated/service_role: [catálogo nativo](native/guard-security.json). No reemplaza RPCs, concede permisos ni modifica migraciones históricas. Comprueba identidad, recursos fijos, testigo completo, disponibilidad, solape/transición y coherencia con el Draft. El control público de privilegios de U00a sigue pasando sin modificar la demo. La edición manual de un Draft con anyOf devuelve `NOMINAL_PHYSICAL_FUTURE_REQUIRES_CERTIFIED_PROPOSAL`: requiere volver al flujo de propuesta para certificar el futuro.

**Después.** Las dos jornadas nacen por API real de catálogo/plantillas/días/participantes; el navegador inicia sesión y opera alcance, generar, aplicar, validar y aceptar. No se fabrican placements. Los recibos contienen input, adapter, runs, Drafts, validaciones, Stage, daily_tasks, reconstrucción, replay y capturas. El resultado cambia por la identidad física, sin nuevas HARD/REQUIRED ni mayor presupuesto. No declara cierre de P0 general ni soporte de las modalidades excluidas.

## Jornadas y adversarios

| Jornada | Autoridad y decisión observada | Resultado |
| --- | --- | --- |
| A | Dos participantes, dos espacios, ventana simultánea 09:00–09:20; flexible A/B→B y crítica byItem(A)→A. IDs globales 2/3 frente a diarios 6/7. | 2/2, S1 aceptado; [captura](native/A-S1-accepted.png). |
| B | Tres participantes, cuatro tareas, disponibilidades distintas. S1 selecciona B+KIT; el testigo futuro usa A para crítica y futura flexible, y B para la cola. Sólo una tarea queda aceptada. | S2 completa 4/4 conservando S1 exactamente; [captura](native/B-S2-accepted.png). |

En B-S1 la futura flexible mantiene `assignedResourceIds=[]` en Draft/daily_tasks y `selectedResourceId` ausente al reconstruir. S2 decide su identidad sin cambiar B+KIT de S1. Se comprueban todos los estados pending y cero locks artificiales. El replay API y el proceso frío comparan propuestas, fingerprints, trabajo y testigo físico completo; el frío usa los snapshots base persistidos reales.

Los 37 ataques SQL recalculan hashes y se revierten: ninguna/doble elección, sustitución por identidad inventada, omisión de recurso fijo, pérdida de obligación futura, colisión, transición, CAS de Draft/base/revisión obsoleto, rol sin permiso, cambio fuera del scope y mutación protegida aun expandiendo fraudulentamente el scope. Todos se rechazan. Tests focales añaden dominio vacío, identidad inexistente/ambigua, indisponibilidad total, cantidad, compartidos, componentes, Main/Vocal/agrupación, locks y fingerprints distintos. El testigo falsificado también se rechaza al validar en servicio, sin otra búsqueda.

## Gates y reproducción

Gate local: **3.168/3.168 tests**, 411 archivos, mismas dos exclusiones históricas de benchmarks; [ejecución](checks/suite-execution.json), [TAP](checks/product-suite.tap.gz). Se conservan los dos fallos iniciales y su corrección: orden canónico de diagnósticos y test trasladado al área de integración de Planner Next sin ampliar allowlists. TypeScript, harness, build y secuencia de migraciones forman parte del gate. Las siete regresiones nativas U00a–U00h pasan: Main/Standalone, rebootstrap/CAS, composición itinerante, setup, transporte, comidas y byItem. Los seis problemas/Stages históricos Main/Standalone/itinerantes, cinco Stages de comidas y tres Stages byItem permanecen idénticos. Setup se compara sobre las mismas autoridades congeladas en base/candidato, sin renombrar IDs aleatorios.

A2 se ejecuta aislado en tres procesos/archivos Git independientes, base/candidato/repetición, Node 20.20.2 y mismo lockfile, sin otra carga de tests. Informes, certificados y snapshots se comparan íntegramente, excluyendo sólo duraciones. El audit canónico revalida 22 certificados: **266/266, 11 Stages y 27.049 ramas** en las tres ejecuciones. Fingerprint final `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. Suma de duraciones de iteración: base 66.434 ms, candidato 64.831 ms y repetición 65.980 ms. Los resultados completos se registran en `a2/` y `regression-comparison.json`; no se atribuye optimización a diferencias de reloj.

```bash
node node_modules/tsx/dist/cli.mjs --test engine/planner-next/integration/nominalResourceRequirements.spec.ts engine/planner-next/integration/nominalResourceWitness.spec.ts
npx --no-install tsc -p script/validation/tsconfig.u00i.json
node --import tsx script/validation/runU00iFunctional.ts /tmp/u00i-fresh
node --import tsx script/validation/replayU00iFrozen.ts /tmp/u00i-fresh/native /tmp/u00i-cold.json
node --import tsx script/validation/runU00iFunctional.ts /tmp/u00i-before --before-integrity-guard
python3 docs/evidence/p0-u00i/implementation/verify.py
```

Usar Node 20, Docker y Chromium. Los runners exigen destinos nuevos e inyectan el dispatch únicamente en una copia Git descartable. Los runners históricos intactos y sus argumentos constan en [U00h](../../p0-u00h/README.md); `replayU00iSetup.ts` compara la misma captura setup desde ambos archivos Git, y `replayU00fFrozen.ts` verifica transporte frío/persistido. A2 usa `STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts`, seguido de `config-u06c/verify.ts`. No se cambian budgets/timeouts. Los hashes certifican demo y migraciones anteriores intactas. Sin escrituras productivas, despliegue ni merge.
