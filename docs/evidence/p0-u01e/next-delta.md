# Una única unidad funcional posterior

**Certificar la composición fija de unidades itinerantes con la autoridad REQUIRED por fases, conjunta y pausa existentes, hasta Stage SQL y continuación.** No crear productor, editor, tabla, regla por nombre ni solver.

La justificación conjunta es material: el integrado A demuestra que el guard rechaza física válida; C demuestra el mismo recorrido con conjunta consumidora de unidad; el SELECT de recursos demuestra por qué no basta retirar guardias. Son aspectos del mismo cierre de composición física fija, no tres productos independientes. No se autoriza ninguna modificación en este PR diagnóstico.

| Alternativa | Evaluación causal |
| --- | --- |
| A: reutilizar contratos/consumidores | Sí: API de equipos y snapshots, recursos efectivos por tarea, fases, conjunta, pausa, scope/futuro, validación, certificado, Draft y writer ya existen. No duplicar recursos por fase. |
| B: simplificar un guard de familias | Necesario: presencia de equipo ajeno a la conjunta o sólo snapshot excluye combinaciones válidas. Insuficiente como certificado: tiene que seguir atravesando reconstrucción, revisiones y SQL. |
| C: extender autoridad física existente | Justificado: `joint_task_resources` pierde miembros fijos, demostrado sin contratos ficticios. Completar la misma autoridad y sus consumidores afectados conserva igualdad física y protección; no añadir otro ledger. |
| D: adapter/certificado nuevo | Sin causa demostrada en fijo. Adapter conserva unidad/miembros; witness global/certificado validan las 17 y pausa. No proponer arquitectura alternativa por reflejo. |

## Contrato mínimo propuesto para la aceptación

Unidades específicas, activas, no vacías, con mapping diario inequívoco e inmutable; transición de unidad explícita cero en la intersección inicial. Por operación, se puede declarar una unidad fija diferente o dejar de requerirla. Los requisitos independientes se unen a los miembros: nunca se restan por nombre o por acabar una fase. Si una identidad universal no vacía se declara en la cadena, debe comprobarse también cuando la aporta una unidad. La conjunta tiene peers físicamente compatibles con identidad de unidad fija común cuando la consume. Se conservan las exclusiones de alternativas, membresía temporal y otros ámbitos no certificados.

Esto permite un avance real integrado sin intentar resolver toda la itinerancia. No es un permiso para añadir otro guard global por presencia: cada límite retenido debe responder al consumidor material afectado y devolver diagnóstico explícito. Las transiciones positivas o scopes explícitos no se descartan del producto como regla de negocio; quedan fuera de esta certificación inicial mientras falte garantía SQL equivalente.

## Evidence de aceptación necesaria en ese único PR

1. Recrear A y otra topología fija materialmente distinta desde APIs reales; conservar el perfil creciente de 17, fases 3/2/2, conjunta física, tres competidoras y pausa. Incluir conjunta consumidora de unidad y cambio AB→AC por tramo; no habilitar alternativas para conseguirlo. El control sin consumidor itinerante debe seguir componiendo sin que el catálogo ajeno lo impida.
2. Guardar/recargar autoridades, revisar view/editor existentes, rebuild frío, revisión/replay y permisos/CAS. En todos los órdenes de edición admitidos, el contrato guardado debe producir el mismo EngineInput. No eludir guards con un EngineInput manual.
3. Propuesta real para S1 sólo competidora A: witness 17+pausa, certificado sin segunda búsqueda. Apply→Draft→validar→**aceptar Stage SQL** con fuente/run/revisión auténticos. S2 completa 16 y conserva S1 literalmente, con selección de unidad y miembros exactos. Repetir en segunda base fría y comparar propuestas, trabajo, witnesses y fingerprints.
4. Validación SQL material de miembros de unidad omitidos/inventados, identidad/domino falso, peer asíncrono/incompleto, capacidad compartida entre AB y AC, recurso/unidad fuera de disponibilidad, pausa ausente/alterada o invadida, hueco/orden de fase y decisiones protegidas. Recalcular hashes para evitar atribuir al hash un rechazo físico. Incluir edición de pausa sobre un recurso itinerante protegido fuera de sus espacios declarados: debe seguir protegido.
5. Liberar A en III y permitir competencia legítima por A; la misma ocupación debe fallar si una fuente real mantiene A requerido. Un requisito de AB en la tarea final no puede hacerse pasar por consumo de C solamente. Conjunto común no vacío aportado por unidad debe validarse materialmente; `[]`, omitido y null conservan semánticas U01d.
6. Control 55>40 sin propuesta/Stage, sin confundir guard, agotamiento o timeout. Supporting fuera de scope permanece reparable y no aceptado/protegido. Comparar coste con 83/82 de U01d y registrar cualquier cambio real, sin aumentar budgets.

La solución garantiza operativamente que una decisión parcial no hace imposible el bloque REQUIRED, que dos agendas no duplican a un miembro compartido y que los finales liberan sólo recursos que dejaron de requerir. Esas garantías deben existir a ambos lados de API/SQL; un WITNESS de memoria no las sustituye.

**Siguiente frontera tras ese delta:** composición de la misma macro con ámbitos diarios explícitos de agenda/herencia/ocupación y transiciones positivas materialmente certificadas; después evaluar selección alternativa/recomposición dinámica según necesidad causal. Ninguna se implementa ni se declara general aquí. A2 desde UI sigue siendo una frontera mayor, no el gate sustitutivo de las jornadas nuevas.

Si la implementación focal muestra otro bloqueo antes de Stage que invalide esta reutilización, detener expansión y aportar el experimento mínimo sobre ese consumidor auténtico. No retirar sucesivamente guards sin cerrar la jornada.
