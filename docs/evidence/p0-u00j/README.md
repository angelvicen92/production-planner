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
- Ataques SQL con hashes recalculados y rollback: selección ausente/doble/otro tipo, tipo o dominio falsos, recurso indisponible/ocupado, fijo omitido, transición/ventana futura incompatible, testigo incompleto o con identidad/dependencias falsas, scope, protección, CAS/revisión/base y permisos. Los tests focales incluyen lock incompatible, Main/Vocal/técnicas, agrupación, macros y auxiliares compartidos.

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

**Estado provisional: BLOCKED por regresiones finales y CI pendientes.** Jornadas nativas y gate SQL demostrados; 46 focales PASS, TypeScript aplicación/harness PASS. Suite completa, U00a–U00i y A2 aislado se están ejecutando sobre el candidato. No declarar READY antes de completar esos gates. No cierra P0 general ni habilita Main/Vocal, quantity>1, varios tipos, anyOf combinado, compartidos, bundles o estructuras.
