# Auditoría causal y de autoridad

## Consumidor, antes del productor

Los objetos originales del experimento están en `diagnostic/receipts.json.gz`, `consumer-before.json.gz` y `consumer-after.json.gz`; `experimentIsStage=false`. Se parte de tareas pendientes creadas por producto y S0 auténtico, sin placements ni locks preparados.

| Frontera | Observación / autoridad |
| --- | --- |
| Entrada | `engine/buildInput.ts` produce IDs diarios, dependencias, snapshots físicos, unidad y miembros nominales reales. `ordinary-input.json` y revisión/identidad/replay conservan la entrada previa. |
| Adaptación/preflight | Sólo añadir `anchoredAccompaniments` conserva `UNSUPPORTED_TASK_ROLE` e `INCOMPLETE_ANCHORED_OPERATION`. La proyección efectiva omitía miembros al usar Main `LOCATION`. No se ignoran errores globalmente: el productor resuelve sólo el veto de la tarea Main seleccionada y el resolver materializa los miembros de la unidad seleccionada. |
| Scope | El experimento usa DAY completo. Producto cierra antes/ancla/después por identidad y después ejecuta el cierre habitual de prerequisites. B selecciona Main; Vocal y ambos segmentos entran por esos cierres. |
| Construcción y geometría | `anchoredAccompaniment.ts` conserva su materializador; hay 28 inicios admisibles. El core no alcanza ninguno: 11 ramas, 4 arquitecturas, profundidad 0 y ningún witness Main. El evento inferior omitía el before. Añadir sólo sus minutos al evento existente permite el witness completo. |
| Matching | La composición nominal es la existente, sin selección por orden de catálogo. El matching residual pasa de 2 invocaciones sin augment a 4 invocaciones, 1 actualización incremental y 1 augment; el feeder realiza 1 comprobación/1 arista. No se añade matching. |
| Future Feasibility | El positivo entra en 1 comprobación y 1 materialización exacta de futuro, sin poda imposible. En B, el witness independiente queda en `B-future-witness.json`; su tarea continúa sin horas en S1 y sólo se materializa al aceptar S2. No se certifica un futuro estructural anclado fuera de Main: ese scope se rechaza. |
| Validación | Se usa `validatePlan`, REQUIRED/HARD canónicos y los writers Assisted existentes. Los segmentos virtuales conservan lugar, agenda itinerante y recursos propios; el Main físico consume únicamente su duración. |
| Trabajo | Contrafactual corregido: 20 ramas = 17 core + 3 standalone, profundidad 1; límite original 10.000. El ledger contabiliza el witness y el matching. No se elevan budgets ni timeouts. |

## Escritura y protección

La operación nueva utiliza el mismo RPC v5, bloqueo del plan, CAS de revisión, comprobación completa de identidad/replay y captura de fuentes que las autoridades diarias existentes. La equivalencia reutilizada es la transición versionada del día; la materialización de esta operación tiene su propia comprobación porque también cambia `taskOperations`. No se copia la semántica física de rondas/cadenas.

La migración 116 mantiene históricos con autoridad NULL. El guard de revisión rechaza un contrato ausente, Main virtual/mal clasificado, unidad falsificada y recursos directos inventados incluso si el atacante reconstruye sus hashes. Las tres referencias tienen protección de vida: no se eliminan, cancelan ni cambian identidad, lugar o duración mientras sean miembros. Para hacerlo, Producción debe retirar legalmente la declaración. Los recursos materializados y horarios sólo los escriben los loops existentes de aceptación/restauración; el helper de restauración exige un checkpoint inmutable real o su proyección de obligaciones ya autorizada.

El RPC rechaza `done`, `in_progress`, locks, horarios ya consolidados y cualquier Stage histórico con esos miembros. Rollback no convierte el Stage anterior en editable. Draft sucio y propuestas activas o pendientes bloquean la edición. Los permisos de producto siguen siendo ADMIN/PRODUCTION; Data API no recibe grants nuevos. `upgrade/` compara todas las filas, lectores y políticas de un 115 poblado frente a 116, y registra las ACL de los helpers.

La evidencia nativa guarda negativos de API/SQL, CAS con dos escritores, fallo transaccional inyectado después de escribir autoridad, certificados falsos y reconstrucción SQL/navegador. `validation.json` distingue esas pruebas de las regresiones y de los intentos fallidos de preparación. Ninguna prueba utiliza Supabase remoto.

## Contrafactual de regresión: un segmento no se cuenta dos veces

La suite amplia detectó que el benchmark A2 de 100.000 ramas alcanzaba 300 segundos. Al repetirlo serialmente, la base exacta pasa (dos tests, segunda ejecución 241.260 ms). El delta inicial sumaba un before que A2 ya declara entre los antecesores de Main; `checks/boundary-ancestors.json.gz` conserva esas identidades y dependencias. La corrección suma sólo segmentos que aún no están en ese cierre. No cambia budgets, timeouts ni el consumidor de operaciones.

El contrafactual focal usa el EngineInput nativo real, declara before como prerequisite y limita la disponibilidad de la unidad a 10:00. Sin la corrección, el doble cómputo elimina la única frontera constructiva; con ella se obtiene la secuencia HARD válida de 45 minutos. `checks/double-count-before.tap.gz` conserva el rechazo anterior y `checks/double-count-after.tap.gz` el positivo. El benchmark original se conserva sin filtrar ni modificar.
