# Diseño causal mínimo post-S1

## Autoridades y frontera normativa

Fuente 00 v2.14 vigente distingue WorkingPlan, Draft, Stage completo, AutomaticProtection y Lock. Su tabla conserva algunos rótulos antiguos; se leen las versiones actuales del corpus listado, sin crear autoridad paralela. `AGENTS.md` también referencia 00 v2.13: la autoridad documental se resuelve contra el índice realmente vigente. Fuente 01 v5.3 §§3.4–3.10; Fuente 04 v2.8 §§2.1–2.5, 9–12; Fuente 05 v2.8 gates A2-ASSIST-3/4/5/7 y §§4–5; Fuente 07 v2.3 §4.4; maestro P0; U00a y U00c/`design.md`. Rutas y hashes contrastados contra `main` real en `authorities.json`.

04 §9 exige Stage completo, restauración exacta de su planning y `daily_tasks`, historial, redo y archivo del futuro al divergir. §10 exige mantener la configuración vigente y usarla en la siguiente intervención. §§11–12 exigen grandfathering por identidad material y aceptación atómica con fingerprint/base/revisión/validación. Ninguna cláusula define expresamente qué hacer con obligaciones creadas **después** del snapshot restaurado. No se puede inferir autorización para borrar obligaciones, mezclarlas silenciosamente en ese Stage ni cambiar el significado de “exactamente”. El contrato SQL actual rechaza la diferencia de conjuntos; es protección de integridad, no semántica nueva de producto.

## Estado y primera pérdida de continuidad

S1 conserva universo U1, snapshot P1, revisión R1 y linaje a S0. La sesión contiene `activeStageId=S1`, `draftBaseStageId=S1`, Draft=P1, fingerprint(P1), revisión R1 y scope vacío. Sus placements aceptados son contexto fijo del siguiente solver aunque sus tareas sigan pendientes; no existen locks.

Crear una tarea por `POST /api/daily-tasks` amplía las fuentes y EngineInput a U2=U1∪{n}. R1 y P1 no se modifican. La proyección de operaciones/autoridades efectivas cambia de identidad F1 a F2, pero falta una transición que vincule U2/F2 a un origen de trabajo consistente. El alta no vuelve incorrecto el hecho histórico P1/R1.

La primera bifurcación operativa es el **alta persistida sin transición Assisted**: todavía se conserva toda la información, pero ya no hay recorrido autorizado para incorporarla a esa sesión. El primer rechazo visible de incorporación es 107 `assisted_preview_bootstrap_additions → REBOOTSTRAP_ACCEPTED_STAGE`. No es una decisión de búsqueda que agote el presupuesto ni una inviabilidad: la sonda obtiene placements válidos alrededor de S1. Tampoco es regresión de U00c: su contrato excluye expresamente S1+.

## Dependencias materiales hasta SQL

| Frontera | Decisión real | Consecuencia de continuar sin transición |
| --- | --- | --- |
| API alta → EngineInput | `createDailyTask`, `buildEngineInput`, materializador de perfil y proyección de autoridades | Nueva identidad efectiva, misma revisión de sesión |
| Preview → confirmación | `AssistedPlanningService.additionsCandidate/incorporateAdditions`, 107 | No construye candidato cuando preview rechaza; POST conserva sesión |
| Request | `AssistedProposalService.request` exige Draft fingerprint=Stage base | Ampliar sólo Draft falla `DIRTY_DRAFT` |
| Inserción de run | 107 `assisted_guard_new_run_session` serializa sesión y exige pertenencia de IDs al Draft | Task nueva fuera de Draft: `STALE_CONFIG_REVISION` |
| Run | Servicio compara fingerprint efectivo con revisión persistida | Scope antiguo tampoco avanza tras alta |
| Contexto protegido | `materializeAssistedSnapshotOccupations`, linaje y `affectedTasksUnchanged` | Usa Stage aceptado y excepciones aplicables; esta autoridad debe conservarse |
| Resultado | `baseSnapshot.tasks.map` en el productor | Calcula n, pero n no existe en `proposedDraftSnapshot` |
| Apply | 079 `assisted_apply_proposal` comprueba CAS, sesión/base/revisión, digest SQL, IDs propuesto=Draft y scope | No admite un snapshot ampliado mientras Draft siga en U1; la propuesta vieja aún puede pasar mientras CAS/R1 no cambien |
| Edición | 090 `assisted_patch_draft` mantiene IDs y campos inmutables | No es API de incorporación; `TASK_SET_MISMATCH` |
| Validación | Servicio compara EffectiveConfig; 080 exige run actual y snapshot exacto; 108/110–112 añaden guards de autoridad | No se puede reciclar validación, certificado de futuro ni hash de U1 como prueba de U2 |
| Aceptación | 089 `assisted_accept_stage`, validación/base/config/CAS + igualdad IDs/daily + Stage/proposal plan trigger | Snapshot U1 contra daily U2: `TASK_SET_MISMATCH`; sin consolidación parcial |
| Historia/rollback/redo | 078 `assisted_move_stage` + 086 `assisted_apply_snapshot` | Mismo conjunto: exactos; conjunto diferente: bloqueo atómico |

La igualdad de IDs de `apply_proposal` y el guard de propuesta/Stage se reconstruyen del SQL vigente. Se demuestran directamente el apply viejo, patch ampliado, validación certificada seguida de aceptación fallida, apply snapshot, CAS/revisión y rollback/redo. La igualdad propuesta ampliada=Draft antiguo no se fuerza con un resultado falsificado: se mantiene como contrato explícito del call path, sin atribuirle un Stage válido. Los guards nominales 110–112 no se desactivan; los días focales usan asignación concreta para aislar el problema de identidad.

## Recomendación: transición dentro de la misma sesión

Crear una operación de producto explícita que admita **sólo altas puras** desde una frontera de fuentes verificable y avance atómicamente el origen de trabajo U1→U2. Mantener `activeStageId` y la base histórica S1, R1 y P1 literalmente intactos. Crear una revisión nueva R2 con identidad/replay de todas las fuentes vigentes; enlazar R1 y registrar actor, tarea/participante añadido, comparación y confirmación. Preparar un snapshot de trabajo P2 que copie exactamente P1 —incluidas ocupaciones derivadas y agrupaciones— y añada n pendiente, sin horario ni elección futura inventada.

El origen de trabajo P2 necesita identidad/versionado propios, vinculados a S1 y a la admisión. Puede almacenarse en la sesión o en un registro inmutable de transición: la Evidence no demuestra necesidad de un esquema concreto. Lo que sí demuestra es que **el mismo Stage no puede seguir siendo simultáneamente universo de salida y único certificado de Draft limpio**. Request/run/apply/validate deben consumir el origen de trabajo admitido, mientras que protección y excepciones siguen usando el linaje histórico aceptado. No crear un S1′ ni un Stage de incorporación automático que simule aceptación humana de un planning nuevo.

El nuevo Stage aceptado por el humano contendrá todo U2, será hijo de S1 y referenciará R2, propuesta y validación actuales. Sólo entonces se consolidan sus placements en `daily_tasks`. Las obligaciones incorporadas ya existen allí como filas pendientes; la transición no las borra ni escribe horarios antes de aceptar. No sustituir `TASK_SET_MISMATCH` por una inclusión parcial: en aceptación de S2 debe continuar la igualdad exacta entre snapshot completo admitido y filas del universo vigente.

La comparación de altas puras necesita una frontera posterior a consolidación, no las fuentes iniciales de S0 sin explicación. Opciones técnicas compatibles: capturar fuentes al aceptar/admitir bajo la misma transacción, o demostrar las diferencias de planning como proyección exacta de operaciones aceptadas y comparar el resto con la captura original. No inferir retrospectivamente campos ausentes. Sin baseline demostrable, rechazar con motivo específico. No incluir en “tarea modificada” un horario/assignment que procede de una aceptación auténtica; tampoco usar esa excepción para permitir cambios humanos de duración, identidad, dependencias o recursos.

### Alternativas descartadas o no justificadas

- **Retirar guardias de 107:** aparecen otras dos barreras S0 y después las de run/Draft/snapshot/SQL. Desprotege una operación cuyo contrato no contiene historia post-S1.
- **Actualizar sólo revisión:** deja el universo de Draft y el productor en U1. Cambiar sólo Draft produce `DIRTY_DRAFT`; cambiar sólo el productor infringe igualdad con Draft y no demuestra validación.
- **Mutar S1/S0 o añadir IDs retrospectivos:** falsea lo aceptado, sus fingerprints, Evidence, excepciones y replay. Prohibido por 01/04.
- **Nueva sesión con bootstrap corriente:** S0 puede conservar las posiciones diarias y esas posiciones pueden convertirse en contexto fijo del solver; no es correcto afirmar que todo placement se pierde. Pero pierde la cadena operativa S0→S1 anterior, redo y búsqueda de excepciones del linaje. `previous_session_id` es auditoría privada, no solución de continuidad. Hacerla equivalente exigiría linaje/protección/excepciones/navegación entre sesiones, de mayor alcance y sin necesidad demostrada.
- **Autoridad nueva independiente para todo el planning:** no es necesaria. Basta separar origen de trabajo admitido de checkpoint aceptado. Sí hace falta una autoridad explícita de pertenencia/origen; no un segundo planificador o revisión opaca que sustituya EffectiveConfig.
- **Locks para conservar placements:** cambia su semántica y bloquea edición humana posterior. AutomaticProtection debe seguir siendo contexto aceptado y permitir nueva intervención humana validada.

## Rollback/redo: decisión de producto realmente pendiente

Con U2 vigente y un Stage antiguo que contiene sólo U1, no pueden cumplirse simultáneamente estas tres afirmaciones usando el modelo actual de una sola tabla activa: (a) restaurar literalmente el snapshot completo U1 en `daily_tasks`, (b) mantener n como obligación pendiente activa en esa misma tabla y (c) exigir igualdad exacta IDs(snapshot)=IDs(daily). 04 exige restauración exacta y configuración vigente, pero no define pertenencia temporal ni un backlog separado para esta situación.

Las alternativas que debe resolver producción son exactamente:

1. **Rollback exacto del universo histórico:** el planning activo vuelve a U1. n debe conservar identidad y obligación en un backlog/registro de pertenencia versionado fuera de ese planning; nunca eliminarse silenciosamente. Reincorporarla requiere transición explícita. Redo debe restaurar el universo y planning del hijo; una rama nueva archiva el futuro, pero no extingue obligaciones del backlog. Requiere modelar esa pertenencia y precisar qué representa `daily_tasks` y cómo se vuelve a usar EffectiveConfig vigente.
2. **Rollback sólo de decisiones de planning con obligaciones actuales:** restaurar los placements de U1 y mantener n pendiente en U2. Operativamente conserva todo el trabajo, pero el estado activo ya no es literalmente el snapshot del Stage antiguo. Debe mostrarse como restauración más transición/overlay explícito, con fingerprint/origen nuevo y semántica de redo/ramificación definida. **No está autorizado implementarlo como unión silenciosa ni llamarlo rollback exacto**; exige aclaración/versionado de 01/04 y sus gates.
3. **Frontera explícita de restauración entre universos:** conservar auditable el Stage antiguo, bloquear rollback/redo que cruce la admisión y permitirlos dentro de U2. Es el comportamiento conservador más próximo a las barreras actuales y evita pérdida de trabajo; limita deliberadamente el contrato general de rollback de 04. Requiere aprobación expresa de producto y mensaje operativo, no ocultar el bloqueo como soporte completo de historial.

No se selecciona una por comodidad SQL. La preferencia operativa es conservar todas las obligaciones y su identidad, pero eso no autoriza por sí solo la opción 2. La implementación siguiente debe partir de una decisión explícita sobre esta frontera; no se declara probado un contrato de rollback post-S1 que las Fuentes no contienen. El linaje dentro de la misma sesión sirve a las tres alternativas y reduce el delta necesario.

## Protecciones, excepciones y pasado

S1 conserva su universo, revisión y significado en el momento de aceptación. La interfaz/replay deben etiquetar universo/revisión histórica y la admisión posterior; no reinterpretar S1 como aceptación de n. El origen ampliado conserva todos los placements aceptados y ocupaciones derivadas. Para el siguiente solver son `AutomaticProtection`, sin insertar locks. `done/in_progress`, locks explícitos y restricciones físicas siguen prevaleciendo; la admisión no los convierte en variables.

El linaje de S1 mantiene `AcceptedException` ACTIVE sólo si `severity+violationKey` e identidad material coinciden y sus tareas afectadas permanecen iguales; R2 no las invalida por sí sola. Nuevas interacciones con n se validan y no heredan una excepción antigua por reason code. RESOLVED/STALE/SUPERSEDED nunca se copian como ACTIVE. No fabricar `hardValid=true`. Los días focales no contienen excepciones aceptadas: su semántica se apoya en 04 §11, lectura del consumidor y tests focales `assistedAcceptedBaseline`; un E2E de excepción durante admisión es gate de la futura implementación.

## Transacción, CAS, permisos y carreras

El commit de admisión debe ser único: revalidar alta pura/fuentes + estado de sesión + origen admitido + revisión, crear R2/replay/registro de admisión, ampliar sólo el origen de trabajo/Draft, invalidar validación y volver obsoletas las propuestas anteriores. No cerrar una sesión y abrir otra en llamadas separadas. Actor admin/production releído en servidor y comprobado en SQL; RPC invoker de servicio, sin permisos cliente directos ni SECURITY DEFINER nuevo para sortear RLS.

La confirmación vincula plan/session/base/Stage/origen-fingerprint/revisión/token de fuentes y lista de altas revisadas. Construir input/replay entre dos lecturas estables; dentro de transacción adquirir los locks existentes con orden compatible, proteger contra inserciones fantasma y comprobar otra vez token/CAS. El advisory lock por plan y exclusividad de sesión siguen vigentes. Los locks SHARE conservadores de 107 son reutilizables como patrón, con coste de tabla explícito; no se prescriben locks inversos o esperas durante búsqueda/confirmación. Las sondas demuestran NOWAIT `55P03` ante un writer real y `REBOOTSTRAP_STALE_SOURCES` ante token antiguo.

Una aceptación concurrente cambia base/huella; una configuración concurrente cambia revisión/token; una edición de tarea invalida prueba de alta pura. Deben abortar sin R2/origen parcial. Un nuevo run se serializa con la sesión y toma el origen actual. Resultados anteriores, aunque terminen después del commit, nunca se aplican bajo R2/P2: CAS/revisión/origen los rechazan. Conservar resultados descartados y su causa para auditoría; distinguir propuesta en curso, propuesta pendiente de revisión y propuesta ya aceptada. No considerar la propuesta de S1 un bloqueo pendiente eterno.

La aceptación de S2 debe revalidar que sus fuentes/origen no cambian desde la validación; el simple número persistido R2 no prueba ausencia de otra alta antes del commit. La nueva frontera necesita una comprobación SQL de pertenencia/token/autoridad vigente, además del CAS existente, sin delegar integridad a la UI. Una alta durante generación o entre validate/accept debe fallar explícitamente, sin consolidación parcial ni falso READY. Las pruebas de permisos y carreras existentes son baseline; el harness no certifica una transacción de admisión que todavía no existe.

## Una única unidad posterior y aceptación falsable

**U00n: transición versionada de obligaciones post-Stage dentro de la sesión**, después de resolver la opción de rollback. Incluye sólo admisión, origen de trabajo, revisión/replay y consumidores necesarios de request→run→apply→validate→accept, continuidad de linaje/protecciones y semántica de restauración elegida. Reutilizar codec, proyección efectiva, solver, validadores, CAS y aceptación; sin reimplementar bootstrap ni ampliar capacidades de búsqueda. El almacenamiento concreto se decide al implementar ese contrato, no mediante una migración especulativa en U00m.

Pruebas objetivas de esa unidad:

1. Ambos días de este harness, creados por producto: S1 auténtico, alta pura, preview exacto, confirmación, misma sesión y S1 literal, R2 nueva/replay completo y origen U2 con n pendiente; ningún horario diario cambia por admisión o apply.
2. Propuesta con IDs exactos y n presente tanto en placements como en snapshot completo; todos los placements/recursos/ocupaciones aceptados intactos y cero locks nuevos. Día A respeta dependencia Main→n; B usa cámara compartida sin solape.
3. Draft validado bajo R2 y fuentes estables; aceptar S2 humano consolida exactamente U2, parent=S1, misma sesión, identidades únicas, revisión/validación/Evidence correctas y `TASK_SET_MISMATCH` intacto ante omisiones, duplicados o IDs ajenos.
4. Propuesta vieja, CAS/base/config/token/origen obsoletos, edición/eliminación existente, baseline ausente, permisos insuficientes y ejecución/locks: rechazo explícito sin efecto parcial. Test separado para resultado aceptado que no es propuesta pendiente.
5. Carreras deterministas con dos conexiones: alta/edición/configuración/accept y fin de run frente a admisión; sólo un commit coherente. Fallo después de crear R2 revierte origen/revisión/capturas. Alta entre validación y aceptación no produce Stage verde.
6. Rollback/redo y nueva rama según decisión aprobada; demostrar qué ocurre con n, daily, configuración vigente, historial y archival, sin falsificar Stage antiguo. Excepción ACTIVE intacta sigue aplicando; nueva violación no hereda excepción; mutación afectada la vuelve stale/superseded.
7. La UI distingue representabilidad de input, incorporación pendiente, origen stale y capacidad real de continuar. No mostrar la sesión como lista para generar/aceptar si su universo/revisión no coincide. Repetición determinista y regresiones proporcionales; A2 completo cuando cambie código ejecutable relevante.

Comportamiento X (las altas posteriores a S1 quedan fuera del origen de trabajo aceptable) es causado por Y (una sesión que usa el Stage inmutable como universo de Draft/salida y carece de transición de obligaciones) y produce Z (rechazo stale o pérdida de la tarea en el snapshot, con aceptación y restauración bloqueadas por integridad); el delta W (admisión transaccional versionada dentro de la misma sesión, con origen de trabajo separado, revisión actual y semántica de rollback aprobada) debe cambiarlo y esperamos observar M (en ambas jornadas, alta pura → propuesta completa → Draft validado → S2 humano, S1 literal, colocaciones protegidas, obligaciones conservadas, carreras rechazadas y restauración conforme a la decisión explícita).
