# Primera frontera SQL

No se modifica SQL, ledger, privilegios, triggers ni datos de aplicación por consultas manuales. Todas las autoridades persistidas se escriben mediante UI/API. Los helpers se invocan sobre las filas reales; `sql-function-bodies` conserva cuerpos obtenidos de `pg_get_functiondef`, owner, invoker y ACL del ledger 001–125 ejecutado.

| Propiedad | Autoridad existente | Evaluación para esta composición |
| --- | --- | --- |
| Admisión de anclajes | `assert_daily_anchored_accompaniments` → versión v1 | Excluye cadenas antes de buscar; v2 no evita ese guard |
| Fases y conjunta | `assert_daily_technical_chains`, `assert_daily_joint_groups` | Excluyen anclajes y ámbitos; U02b sólo abrió Main/Vocal y unidades fijas |
| Ámbitos y pausa | `assert_daily_task_operation_scopes`, `assert_daily_operational_meals` | Exclusiones de cadenas/anclajes aplicables; no basta abrir TypeScript |
| Revisión y replay | `assert_anchored_revision`, `assert_task_scope_revision`, `assert_joint_revision`, writer v5 | Reutilizables, pero llaman a las autoridades de admisión y deben probar convivencia/conmutación material |
| Miembros, directos y recursos efectivos | `assert_anchored_choice_witness`, `assert_task_scope_snapshot`, `assert_anchored_selected_snapshot` | Resuelven unidad, coach, byItem, LOCATION/OPERATION_ONLY y disponibilidad desde tablas/replay. Mantener igualdad exacta de asignaciones y separación de coach implícito |
| Recursos de conjunta/fases | `joint_task_resources` | Válido en miembros físicos nominales de U02b. Hereda ubicación incondicionalmente y usa equipo de plantilla; **no es un resolver general de anclajes/scopes**. No sustituir con él el resolver efectivo de esos contratos |
| Virtualidad | Helpers 118/119 consultan `blocksSpace` del replay | Reutilizar: Main ocupa su intervalo original, segmentos no bloquean espacio. No suprimir ocupación de Main |
| Witness global | `assert_anchored_choice_witness` | Ya autentica run/fingerprint/27 identidades, selección, recursos, dependencias, continuidad, peers y conflictos; entrada `IF conjunta ELSIF anclaje` debe revisar todas las autoridades coexistentes, no sólo la primera |
| Fases REQUIRED | `assert_daily_technical_chain_snapshot` | Reutiliza witness global, certificado WITNESS y pausa; comprueba orden/contigüidad de fases |
| Pausa | `assert_operational_meal_snapshot` | Ventana, duración, miembros, espacios e invasión física; conservar llamada desde fases/Stage |
| Stage y continuidad | Validación canónica, `assisted_accept_stage`, triggers de materialización/inmutabilidad | Mantener autenticidad, revisión/CAS, fuentes, estado protegido y aceptación atómica. Stage integrado **no certificado** |

## Divergencia física localizada

El bucle de ocupaciones de `assert_task_scope_snapshot` (119) compara **todas** las tareas con hora. Ante dos peers conjuntos sincronizados ve igualdad de espacio o de recurso/unidad y lanza `TASK_SCOPE_PHYSICAL_CONFLICT`. Este cuerpo no consulta `daily_joint_groups` ni `jointGroupId`; el witness global de 120 sí reconoce esa equivalencia. Por tanto, retirar las exclusiones de admisión no vuelve compatible este consumidor.

`sql-probe.ts` invoca el helper intacto con `service_role` dentro de `BEGIN READ ONLY` y rollback. Usa revisión y autoridades **reales de anclajes/ámbito**, y un snapshot argumental derivado del witness combinado. No inserta conjunta, fases, pausa, run, Draft ni Stage. Conserva el cuerpo literal del helper. La prueba focal compara el witness completo con el mismo argumento omitiendo sólo un peer; el segundo argumento se usa para aislar el bucle, **no es un plan completo válido**.

El rechazo de ese argumento no se presenta como rechazo erróneo de un Stage autorizado: bajo las autoridades hoy persistibles, no existe conjunta declarada. La demostración causal es más precisa: el consumidor alcanza la comparación física y carece de una rama que pueda reconocer una futura conjunta auténtica. Su contraste con la solución verificada en memoria y la ausencia de lectura de conjunta prueban que la futura apertura debe adaptar ese punto. Los recibos `*-sql-scope-peer-probe` registran ambos resultados y la limitación.

El helper `joint_task_resources` también difiere del resolver OPERATION_ONLY al consultar la tarea independiente con kit fijo de ubicación; los recibos de recursos SQL lo muestran. No se atribuye este contraste a un fallo ya alcanzado en Stage: ese helper se usa hoy para miembros físicos de fases/conjunta, disjuntos de la operación independiente. La implementación siguiente debe preservar esos ámbitos o resolver por las autoridades efectivas; no generalizar el helper por su nombre.

No se han probado falsificaciones autenticadas de un Stage integrado, porque no se puede persistir su configuración. Hash correcto o éxito en memoria no certifican SQL. Los ataques productivos U02b/U00x vuelven a ejecutarse en sus contratos soportados y permanecen separados del probe read-only.
