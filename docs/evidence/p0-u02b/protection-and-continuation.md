# Protección y continuación

S1 solicita exclusivamente la competidora A: propuesta y Draft contienen una colocación; el witness físico global contiene las 24 obligaciones y la pausa. Las otras 23 siguen pendientes. S2 solicita esas 23 y acepta el planning completo en SQL. Se compara literalmente cada fila colocada de S1 dentro de S2: tiempos, espacio, participante/identidad, recursos, unidad y campos protegidos.

`repairSupporting` desplaza una preparación efímera fuera de la propuesta de macro. La validación global y el certificado WITNESS siguen válidos. Una copia del run con ese witness reparado pasa `assert_daily_technical_chain_snapshot` en transacción revertida, con propuesta visible y Draft idénticos. `acceptedSupportingPlacements=[]`. No se convierte supporting en protección ni se acepta por servir de prueba.

Los scopes de representante y peer cierran ocho obligaciones de macro sin añadir automáticamente preparaciones. Main-only mantiene Vocal y toda la macro en el witness; Vocal-only conserva los coaches por el mapping diario del participante. Una propuesta parcial no elimina tareas futuras.

Los controles de S2 modifican una decisión protegida de S1 y reciben `ANCHORED_PROTECTED_DECISIONS`. Rollback a S0 y redo restauran los snapshots aceptados; se vuelve a construir EngineInput tras consolidación. Intentar UPDATE de Stage se rechaza por permisos de servicio y por el trigger histórico de inmutabilidad; estos rechazos se clasifican como protección, nunca como prueba física.

Sobre Draft ya validado, `acceptAttacks` llama al **RPC `assisted_accept_stage` auténtico** con CAS incorrecto (`STALE_DRAFT`), base obsoleta (`STALE_BASE_STAGE`), token de fuente falsificado (`STALE_OBLIGATION_SOURCES`) y Draft falsificado con fingerprint y referencia de validación coherentes (`ANCHORED_AUTHENTIC_PROPOSAL_REQUIRED`). Cada prueba revierte su transacción; después el Draft legítimo se acepta por API y se relee su Stage SQL. El harness respeta la FK compuesta de validación para llegar al RPC; su primer fallo de montaje se conserva aparte.

Los roles viewer/aux/sin rol/anónimo no pueden escribir autoridades; CAS obsoleto se rechaza. Los controles U01f conservan además su carrera concurrente 200/409. El upgrade 124→125 verifica metadata, ACL, SECURITY INVOKER/search_path, RLS, lectores y todas las filas históricas, incluidos 11 Stages y 599 tareas.
