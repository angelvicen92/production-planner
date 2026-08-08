# ADDENDUM A2 — Descansos operativos y comidas

**Versión:** 1.0  
**Fecha de aclaración:** 8 de agosto de 2026  
**Estado:** fuente oficial complementaria para el DÍA DE PRUEBA A2  
**Autoridad:** aclaración operativa expresa del responsable de producción, con precedencia conforme al `DOCUMENTO_MAESTRO_INTERPRETACION_ENSAYO_A2_v1.md`.

---

## 1. Propósito

Fijar la semántica operativa de los descansos de comida del DÍA DE PRUEBA A2 sin convertir los horarios de la planificación humana en seed, lock, hint u orden autoritativo.

Este addendum complementa la documentación de dominio y las SPEC aplicables. No sustituye la configuración efectiva del día: la duración y la ventana de comida deben poder configurarse y los overrides diarios explícitos prevalecen conforme a SPEC-11.

## 2. Regla por defecto de descanso operativo

Por defecto, cada **ámbito operativo activo que represente un plató, espacio o unidad de trabajo con recursos efectivamente asignados** dispone de un descanso de comida de **75 minutos**.

La regla no significa que cada subespacio físico o alias interno de un mismo plató deba generar una comida independiente. El ámbito efectivo se determina por la configuración operativa y las asignaciones de recursos del día.

La duración de 75 minutos es un valor por defecto configurable. Una configuración o override diario explícito puede sustituirla.

## 3. Recursos asignados

Los recursos efectivamente asignados a un ámbito operativo descansan durante la comida de ese ámbito.

Durante el intervalo de comida finalmente elegido:

- el ámbito correspondiente no ejecuta trabajo que requiera su actividad operativa;
- los recursos que están descansando no pueden ser utilizados simultáneamente en otra tarea o espacio;
- la comida no debe interpretarse como tiempo ocioso evitable ni como ruptura de continuidad operativa;
- un recurso compartido no debe recibir varias comidas por aparecer en varios espacios o composiciones: debe existir una única pausa compatible con su asignación efectiva y con la configuración del día.

La pertenencia nominal a una zona, espacio o plantilla nunca sustituye la asignación efectiva de recursos.

## 4. Reality y unidades itinerantes

Reality también requiere un descanso operativo de **75 minutos** por defecto.

La razón operativa es que las operaciones Reality consumen recursos reales —por ejemplo cámaras y sonido— y esos recursos también necesitan su descanso de comida.

La semántica de la pausa debe sobrevivir a la itinerancia y a la recomposición de las unidades Reality:

- no se crean tres comidas independientes sólo porque existan distintas composiciones temporales de la unidad itinerante;
- no se obliga a encajar 75 minutos dentro de cada ventana parcial de una composición A, B o combinada;
- la pausa se aplica a los recursos/equipo operativo que deban descansar y debe impedir que esos mismos recursos trabajen durante el intervalo seleccionado;
- una recomposición posterior no reinicia ni duplica la obligación de comida ya satisfecha.

Esta regla es coherente con SPEC-08: una unidad itinerante es una composición operativa de recursos, no un recurso físico ficticio.

## 5. Colocación temporal

El descanso de 75 minutos es **flexible dentro de la ventana efectiva de comidas configurada para el día**.

El planificador debe elegir el inicio concreto que permita la mejor planificación completa y hard-valid, respetando las demás restricciones. Sólo el intervalo finalmente seleccionado bloquea el ámbito y sus recursos afectados.

Las horas de `CORTE COMIDA` visibles en los PDFs A2 sirven para interpretar que el descanso existe y para comparar el planning humano, pero **no se copian como horas fijas** del problema de entrada.

Para cualquier ejecución concreta, la ventana efectiva procede de la configuración reproducible del día; no de inferencia visual ni de un hardcode universal.

## 6. Sodexo de concursantes

La comida operativa de platós/unidades es independiente del **Sodexo individual de cada concursante**, que conserva una duración de **40 minutos** según la plantilla A2.

El Sodexo:

- bloquea al concursante durante su intervalo;
- no crea por sí mismo una comida global de plató;
- no sustituye el descanso de los recursos técnicos;
- y no debe convertirse en exclusividad física de un plató salvo configuración expresa distinta.

## 7. Configuración y precedencia

La aplicación debe permitir configurar estas políticas. La resolución efectiva seguirá la precedencia general de SPEC-11:

1. configuración general aplicable;
2. snapshot efectivo del día;
3. override diario explícito.

La ausencia de un dato requerido no autoriza a inferirlo silenciosamente a partir del nombre de un espacio, de una fila histórica, de un horario humano o de una configuración legacy no equivalente.

En particular, ningún valor histórico distinto para una unidad itinerante puede sustituir silenciosamente la aclaración oficial de **75 minutos por defecto** para Reality.

## 8. Consecuencia para Full A2

El benchmark Full A2 deberá representar de forma exacta y verificable:

- 75 minutos de descanso por defecto para los ámbitos operativos de plató/espacio que tengan comida aplicable;
- 75 minutos de descanso por defecto para el equipo/recursos Reality, incluso cuando cambie su composición;
- indisponibilidad real de los recursos afectados durante la pausa;
- elección flexible del intervalo dentro de la ventana efectiva del día;
- y Sodexo individual de 40 minutos como obligación separada del concursante.

Si EngineInput, el adaptador o Planner Next no pueden preservar alguna de estas condiciones, Full A2 debe permanecer `NOT_FULLY_REPRESENTED` / bloqueado y exponer la pérdida semántica como blocker técnico en Evidence. No se permite aproximarla mediante una comida global ni mediante pausas fijas copiadas del planning humano.
