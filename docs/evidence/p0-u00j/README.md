# P0-U00j — selección nominal por tipo, quantity=1

Base autorizada y remota verificada: `438d92ca9a4f3db6358809b904268f6da33b4ecd`, merge #1187, 7/7 checks PASS. PR abiertos al comenzar: #1085, #1104 y #1106; ninguno se continúa. Una rama nueva y una unidad, sin merge, escrituras productivas, demo o despliegue.

## Gate causal — Fuente 07 §4.4

X: una jornada API nueva con dos participantes, dos cámaras del mismo tipo y espacios diferentes exige ambas tareas entre 09:00 y 09:20. Main rechaza Flexible `byType(type)=1` antes de buscar, con `UNSUPPORTED_RESOURCE_REQUIREMENT`. Y: `engineInputPreflight` rechaza incondicionalmente el tipo y el resolver nominal únicamente recibe anyOf. Z: no puede proponer una jornada físicamente factible. W: obtener el dominio por `typeId` exacto dentro de `resolveNominalResourceRequirements`, manteniendo la misma materialización, búsqueda y persistencia. M: Flexible→B y Crítica byItem(A)→A, 2/2 HARD válidas, identidad diaria persistida y protegida.

[Gate 1](gate1/gate1.json) y sus EngineInputs, preflight, adapter/problem, search y resultado completos prueban sobre main que sustituir **solo** byType por anyOf(A,B) produce B/A. No se retiró ninguna guardia ni cambió disponibilidad, duración, scope, espacio, participante o presupuesto. No hay incompatibilidad semántica con U00i.

## Intervención y autoridades

Solo un tipo de cantidad 1, ordinary auxiliary sin agrupación, STANDALONE_ONLY y EXACT_CONSTRUCTIVE. El resolver existente separa tipo solicitado, inventario diario compatible, exclusiones físicas, alternativas disponibles y selección. Admite identidad diaria ad hoc sin identidad global. Excluye capacidad auxiliar no representable, componentes, coaches y macros; inventario vacío e indisponibilidad total tienen diagnósticos propios. Mantiene byItem/directos/heredados independientes y usa exclusivamente IDs diarios para ocupación.

`nominalResourceChoice` transporta opcionalmente el tipo solicitado; sus variantes, MRV, backtracking, Future Feasibility, validación y fingerprint siguen siendo los de U00i. Ningún archivo de búsqueda cambia. La proyección productora conserva el testigo conjunto efímero; solo el scope pasa a Draft/Stage. La reconstrucción materializa la elección aceptada desde assignedResourceIds. Storage conserva el NULL de la identidad global ad hoc al proyectar el inventario diario; no lo transforma en una identidad global 0.

El [ensayo anterior a 111](before111/sql-omission-before-111.json) acepta una omisión con hashes recalculados en una transacción revertida. El trigger 110 solo se activaba con anyOf. La migración **111 incremental** reemplaza la misma función privada invoker y activa la comprobación para byType: tipo exacto, dominio diario auténtico, una selección, recursos fijos, disponibilidad, consumo, transiciones y coherencia Draft/testigo. No añade RPC, permisos, esquema ni trigger. 110 conserva todos sus bytes.

La [sonda de autenticidad](causal/witness-identity-probe.json) descubre que el guard anterior aceptaba un participantId falso en un testigo futuro. La primera divergencia era la ausencia de comparación SQL con la fila diaria; TypeScript ya lo rechazaba. 111 contrasta identidad, kind, duración y dependencias con autoridades persistidas, valida disponibilidad de participante y verifica los recursos independientes. El ensayo rojo se conserva; los ataques finales correspondientes se rechazan. No se introduce búsqueda SQL ni una segunda autoridad de selección.

## Jornadas nativas y negativos

PostgreSQL 17 + Auth + PostgREST + aplicación y Chromium reales, loopback exclusivamente. Catálogo/plantillas/días/participantes/tareas se crean por API; el navegador genera, aplica, valida y acepta. Ningún placement se fabrica o se aporta como seed.

- A: 2/2, B/A simultáneas, S1 aceptado.
- B: 4/4, dependencias, disponibilidades diferentes y dos scopes. S1 selecciona B+kit independiente; S2 lo conserva y selecciona para la tarea futura una cámara diaria ad hoc, con resource_item_id NULL. Su alternativa no estaba persistida ni protegida en S1.
- Propuesta, Draft, validación, Stage, daily_tasks, reconstrucción y replay completo se guardan en `native/`. Estados pending, cero locks artificiales. Replay API y [replay frío](cold-replay.json) comparan fingerprint, accounting y testigo físico completo.
- Ocho jornadas API negativas: tipo inexistente, tipo sin inventario, indisponibilidad total, cantidad 2, varios tipos, combinación byType/anyOf, requiresAuxiliar y requiresPresenter. Todas UNSUPPORTED antes de buscar.
- **60 ataques SQL** con hashes recalculados y rollback: selección ausente/doble/otro tipo, tipo o dominio falsos, recurso indisponible/ocupado, fijo omitido, transición/ventana futura incompatible, disponibilidad de espacio y lock de tiempo, testigo incompleto o con identidad/dependencias falsas, scope, protección, CAS/revisión/base y permisos. Los tests focales incluyen lock incompatible, Main/Vocal/técnicas, agrupación, macros y auxiliares compartidos.

## Reproducción y estado

```sh
node --import tsx script/validation/runU00jFunctional.ts work/u00j-red --baseline
node --import tsx script/validation/runU00jFunctional.ts work/u00j-before --before-integrity-guard
node --import tsx script/validation/runU00jFunctional.ts work/u00j-native
node --import tsx script/validation/replayU00iFrozen.ts work/u00j-native/native work/u00j-cold.json
node --import tsx --test engine/planner-next/integration/typedNominalResourceRequirements.spec.ts
npx --no-install tsc -p script/validation/tsconfig.u00j.json
python3 docs/evidence/p0-u00j/verify.py
```

Node 20.20.2, lockfile intacto, Docker y Chromium. Usar destinos nuevos. Los runners inyectan el dispatch solo en una copia Git descartable; la demo no se edita. La CI histórica de U00i verifica sus recibos contra su propia fuente integrada, como ya hacía U00h; sus jornadas funcionales se ejecutan sobre el candidato.

## Regresión final y comparación causal

**69/69 focales PASS**. TypeScript aplicación/harness, build, secuencia y ejecución nativa del ledger completo: PASS. La suite local inicial pasó 3.185/3.186: una expectativa de U00h todavía exigía rechazar todo byType. Se conserva el TAP rojo; el test ahora protege quantity>1 y pasa. La suite completa del head final se verifica en el check remoto `planner-engine-ci` de [#1188](https://github.com/angelvicen92/production-planner/pull/1188): 3.195 tests esperados en 413 archivos, con las mismas dos exclusiones históricas. La metadata del PR registra su resultado final sin atribuir un CI anterior al último head.

U00a–U00i: Main/Vocal, Standalone, rebootstrap/CAS/roles, composición itinerante, setup, transporte, comidas individuales, byItem y anyOf pasan en stacks nativos nuevos. Los seis problemas/Stages Main/Standalone/itinerantes y los once Stages adicionales de comidas/byItem/anyOf conservan sus snapshots y fingerprints completos. Setup se compara sobre las mismas autoridades congeladas en base y candidato; transporte conserva replay frío y certificado. [Comparación completa](regressions/regression-comparison.json) y recibos comprimidos en `regressions/`. El último guard SQL se vuelve a ensayar con U00i, conservando 2/2 y 4/4 hasta Stage.

A2 aislado en serie desde S0: **266/266, 11 Stages, 27.049 ramas, 8.465 minutos de presencia** en base/candidato/repetición. Informes, snapshots y certificados completos coinciden con el último baseline U00i, excluyendo únicamente `durationMs`; los **22 certificados se revalidan**. Fingerprint final `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. Duraciones de iteraciones: 67.807 / 67.723 / 67.585 ms. No se atribuye mejora de rendimiento a diferencias de reloj. [Provenance, comparación y tiempos](a2/execution.json).

Los archivos Git de A2 capturan exactamente las fuentes de ejecución finales de engine/server/shared y lockfile. El refinamiento posterior afecta exclusivamente al guard SQL y al harness de ataques nativos, que A2 offline no carga; se verifica igualdad de todas sus fuentes de runtime. La auditoría canónica reutilizada conserva una etiqueta histórica fija en su informe original; `canonical-audit.json` registra la base real y conserva aquella como `verifierOriginalBaseLabel`.

Fuente 07 §4.4 posterior: el cambio material deseado es la representabilidad y persistencia de una elección por tipo, no un cambio de ordering, poda o capacidad del solver. El resultado B/A y los futuros abiertos demuestran el efecto. Ninguna regresión cambia obligaciones, ramas, huellas, certificados o snapshots. La integridad SQL se endurece sobre autoridades persistidas; el NULL ad hoc se conserva al cargar inventario. Los fallos intermedios de compilación por un tipo compartido se resuelven conservando el contrato estático legacy y todos los bytes de la demo. Un error de invocación del replay de transporte (`argv[2]` es el destino) se corrige sin tocar el runner.

A2 se reproduce con `docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts` sobre archivos Git independientes de base/candidato, seguido de `docs/evidence/config-u06c/verify.ts`. Las regresiones usan los runners históricos intactos y argumentos registrados en U00h/U00i. No se aumenta ningún budget o timeout.

**Gates locales completos PASS. READY requiere además CI verde en el head final de #1188; su metadata contiene el estado en vivo de entrega.** No cierra P0 general ni habilita Main/Vocal, quantity>1, varios tipos, anyOf combinado, compartidos, bundles o estructuras. Sin merge, demo, producción ni despliegue.
