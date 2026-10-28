# Primer rechazo auténtico y contexto efectivo

Los payloads y respuestas completos están en `api-receipts.json` y `*-authoring.json` dentro de cada `receipts.json.gz`. `*-input`, `*-effective`, `*-memory-effective` y `*-view` permiten distinguir lo guardado de lo inyectado. Las solicitudes de estructura usan el revisionId recargado del producto. SQL se prueba con **SELECT de los helpers reales**, ledger 001–123 intacto. No se escriben contratos/revisiones/runs ficticios para atravesar el guard.

Ejemplo A, IDs auténticos del primer descartable (idénticos en repetición):

```json
{
  "jointGroups": {
    "contractVersion": 1,
    "groups": [{"id":"synchronized-operation","taskIds":[21,26]}]
  },
  "expectedRevisionId": 10
}
```

`PUT /api/plans/2/day-configuration` → **422** `{"message":"UNSUPPORTED_JOINT_COMBINATION"}`. `SELECT assert_daily_joint_groups(2, <jointGroups>)` → **P0001**, mismo mensaje. La conjunta B no usa unidad; las fases I/II sí usan AB. Primera función: `withDailyJointGroups`, `jointCombinationSupported` en `server/jointGroupStructure.ts`. La expresión `input.tasks.filter(active).some(t => t.itinerantTeamRequirement ... !== 'none')` rechaza por presencia en cualquier tarea.

La solicitud independiente de fases, sobre ese mismo plan y revisión:

```json
{
  "technicalChains": {
    "contractVersion": 1,
    "policies": [{
      "id":"required-unit",
      "orderedTaskIds":[19,24,29,20,25,21,30],
      "phases":[[19,24,29],[20,25],[21,30]],
      "adjacency":"REQUIRED",
      "resourceContinuity":"REQUIRED",
      "requiredResourceIds":[]
    }]
  },
  "expectedRevisionId":10
}
```

Devuelve **422 `UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION`**, al igual que el SELECT de `assert_daily_technical_chains`. `validateDailyTechnicalChains → technicalChainCombinationSupported → requiredPhaseCompositionSupported` rechaza antes de `validatePhasedMembers`: por `itinerantTeamAvailability.length` y por requisito itinerante activo. SQL 122, conservado por 123, replica ambas exclusiones con snapshots y plantillas. El array vacío es válido desde U01d y no es el blocker.

| Perfil | Primer PUT conjunta | PUT fases independiente | Revisión antes→después de ambos intentos | Clasificación productiva |
| --- | --- | --- | --- | --- |
| baseline | 200 | 200 | 4→6 | PRODUCTIVE_COMPOSED; S1/S2 SQL |
| A-fixed | 422 JOINT | 422 TECHNICAL_CHAIN | 10→10 | UNSUPPORTED_EXPLICIT |
| B-segments | 422 JOINT | 422 TECHNICAL_CHAIN | 14→14 | UNSUPPORTED_EXPLICIT |
| C-joint-unit | 422 JOINT | 422 TECHNICAL_CHAIN | 18→18 | UNSUPPORTED_EXPLICIT |
| D-rest-competition | 422 JOINT | 422 TECHNICAL_CHAIN | 22→22 | UNSUPPORTED_EXPLICIT |
| impossible | 422 JOINT | 422 TECHNICAL_CHAIN | 26→26 | UNSUPPORTED_EXPLICIT en entrada; PHYSICALLY_INFEASIBLE en memoria |
| unused-snapshot | 200 | 422 TECHNICAL_CHAIN | 30→31, sólo por conjunta | UNSUPPORTED_EXPLICIT para fases |

Cada fila tiene el mismo resultado SQL de autoría que la API. En A–D/imposible, la fila completa de `plans` y el Draft son idénticos antes/después; sólo existe S0. La pausa sí se ha creado antes mediante su writer real y posee revisión auténtica. El día y sus 17 tareas existen; no existe una revisión diaria con la combinación rechazada. En unused-snapshot cambia legítimamente la revisión de conjunta, pero no se guarda una cadena. El view expone `supported=false`/`phasesSupported=false`, aunque enumera los recursos efectivos; no se afirma una interacción visual de Chromium que este harness no ejecuta.

El flujo inverso no es una vía alternativa: se ha ejecutado el PUT de fases sin conjunta aceptada y ya falla. Guardar fases nominales antes de crear equipos no sirve para este día: los snapshots diarios son su autoridad inmutable; no se reescriben para sortear el rechazo.

## Consumidor SQL físico incompleto detrás del guard

`SELECT id, joint_task_resources(planId,id) ...` utiliza exclusivamente filas auténticas. En C:

| Tarea | Fuente API/snapshot | Resolver efectivo JS | `joint_task_resources` SQL |
| --- | --- | --- | --- |
| 53 | Unidad diaria 7, miembros 10/11 | [10,11] | [] |
| 54 | Unidad diaria 7, miembros 10/11 | [10,11] | [] |
| 55 y 60, conjunta solicitada | Unidad diaria 9, miembro 11 | [11] | [] en ambas |
| 64, final independiente | byItem C | [12] | [12] |

Clasificación **CONSUMER_DEFECT acotado**: ese helper no representa recursos de una unidad fija. Hoy el guard evita usarlo como autoridad completa para esta composición. No se demuestra una vulneración de un Stage actual ni se atribuye el defecto al solver. No cuenta como Stage una consulta aceptada, ni como rechazo material de Stage un guard de autoría.

No hay SEARCH_EXHAUSTED en estos perfiles. SQL de aceptación itinerante y su continuación quedan **NOT_TESTED**, porque no existe contrato diario auténtico para alcanzarlos; no se simula un run persistido.
