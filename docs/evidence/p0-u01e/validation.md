# Validación, control imposible, coste y límites

Dos stacks descartables PostgreSQL 17.11, Auth y PostgREST, imágenes fijadas por digest, todas las migraciones 001–123 sin modificación. Se eliminan del entorno del runner las credenciales heredadas antes de arrancar el stack. Todas las altas y autoridades operativas usan API; SQL sólo inspecciona catálogo, fuentes, Stages nominales y ejecuta SELECT de validadores. No se ensaya una política itinerante con un writer/run/revisión inventados.

| Perfil, sólo memoria salvo baseline | Full | S1 parcial | Continuación | Resultado |
| --- | --- | --- | --- | --- |
| baseline | 83 | 83 | 82 | 17 hard-valid; también S1/S2 SQL genuinos |
| A-fixed | 83 | 83 | 82 | 17 hard-valid; WITNESS consumed=0 |
| B-segments | 83 | 83 | 82 | 17 hard-valid; A compartido y recursos finales exactos |
| C-joint-unit | 83 | 83 | 82 | 17 hard-valid; una ocupación B para dos peers |
| D-rest-competition | 179 | 179 | 178 | 17 hard-valid; pausa exacta temprana |
| unused-snapshot | 83 | 83 | 82 | 17 hard-valid; producto bloquea fases |
| impossible | 4.278 | No se ensaya | No se ensaya | NO_PROPOSAL, sin BUDGET ni TIME_LIMIT |

Son ramas contabilizadas por el consumidor existente, idénticas entre ejecuciones frías. Las horas y elapsedMs de los experimentos están en los recibos; no se convierten en SLA. El presupuesto sigue 10.000, sin ampliación de backtracks, patrones, bestK o timeouts. Main, feeder y matching no intervienen: sus ceros no significan certificación de otras familias.

## Control físico imposible

El recurso A sólo está disponible 08:00–08:40. Las cinco operaciones de I/II consumen A durante 25 minutos; su competidora independiente necesita 15; la pausa física necesita otros 15 dentro de esa disponibilidad. **55 > 40** incluso ignorando cualquier restricción adicional. La conjunta final sólo consume B y no se cuenta dos veces; el final C no se atribuye a A. Esta cota independiente demuestra inviabilidad material.

La API rechaza primero por composición no soportada, igual que en los positivos; no se etiqueta ese 422 como detección de capacidad. La copia de memoria completa pasa preflight y termina NO_PROPOSAL, 4.278 ramas, `ASSISTED_SCOPE_INCOMPLETE / NO_COMPLETE_HARD_VALID_ITINERANT_PLAN`, sin agotamiento. La prueba de demanda, no sólo ese reason code, sustenta PHYSICALLY_INFEASIBLE.

## Comprobaciones

- 41 pruebas existentes en siete archivos focales, runner `tsx --test --test-reporter=tap`: PASS, cero fallos.
- TypeScript del harness y probes offline: PASS.
- `verify.py`: correspondencias global→diaria, miembros exactos, continuidad de fases, dependencias, conjunta deduplicada, disponibilidad individual/colectiva/espacial, competencia de unidades/miembros, pausa, supporting y continuación. 48 witnesses físicos entre dos stacks; 32 casos comparados con igualdad exacta de propuesta, witness, trabajo y fingerprint de problema. Igualdad exacta de fingerprints SQL nominales. Sin normalizar IDs ni horas.
- `receipt-probes.ts`: supporting reparado y recertificado conservando la propuesta; igualdad exacta del resultado entre las dos entradas frías. Forzar la unidad AB en el final C añade ABC y no expresa liberación.
- `rest-probe.ts`: la misma competidora en un espacio independiente se rechaza durante su pausa de recurso y se admite si sólo se retira ese recurso de la pausa; resultado exacto entre stacks.
- Cuatro Stages nominales aceptados, dos por stack: S1 contiene una tarea; S2, 17. Cada snapshot se lee también de la fila SQL. Cero Stages de las composiciones itinerantes.
- Hashes de fuentes y `checkoutDelta=[]` en ambos manifiestos. Diff funcional cero fuera de Evidence.

La ejecución inicial con `node --import tsx --test` sólo reportó siete archivos; no se usa como conteo de pruebas. Se ejecutó después el runner tsx habitual del repo, que reporta las 41 pruebas individuales en `checks/focal.log`.

## Ensayos y limitaciones explícitas

Tres intentos previos corrigieron exclusivamente el harness: acceso a un campo de scope con nombre equivocado; probe de disponibilidad colectiva aplicado a una tarea sin unidad; y copia superficial al probar dos agendas que introducía un jointGroupId en la entrada original del segundo ensayo. No fueron rechazos del motor. Se corrigieron usando clones independientes y el harness final exige input inmutable. Los recibos finales `native/repeat` proceden de dos ejecuciones completas PASS posteriores. Sus propuestas/budgets no se alteraron para obtener el resultado. El ensayo previo `probe2` ya había cubierto A–D y el imposible, pero no se mezcla con la evidencia final.

No se ejecutaron suite global, A2 Full, build ni regresión A2 importada: sólo cambia diagnóstico. La limitación histórica ASST-010 documentada en U01d no se presenta como resuelta ni se vuelve a investigar sin causa concreta. No se mide optimalidad ni se demuestra exhaustividad de todos los casos físicamente factibles.

No se usan UI/Chromium ni horario humano en esta nueva auditoría; se ejercitan las APIs del producto, su view efectiva, almacenamiento real y SQL local. U01d ya conserva su evidencia visual nominal. No hay cobertura nueva de locks/excepciones, capacidad compartida genérica, MAIN/VOCAL, selección alternativa, recomposición temporal, transporte, setup o rondas en la macro. Stage SQL itinerante es NOT_TESTED por bloqueo auténtico previo, no «casi certificado».

No se añadieron productores, editores, helpers SQL, tablas, writers ni migraciones. Sin cambios de motor, matching, geometría, prioridades ni presupuestos; sin retirada de guards, Supabase real, Replit, publicación o merge.
