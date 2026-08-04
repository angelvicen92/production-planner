# OptiPlan — instrucciones permanentes para Codex

## Fuente de verdad

- Respeta la documentación oficial y las SPEC/addenda citadas por la tarea.
- No inventes requisitos, reglas de negocio, contratos ni arquitectura.
- Si una ambigüedad material impide implementar correctamente, detén la implementación y repórtala.

## Principios invariantes

- La producción tiene que salir: viabilidad operativa antes que optimización local.
- El motor propone; el humano decide.
- `done` e `in_progress` son inmutables; sólo se replantea lo pendiente o interrumpido.
- Locks y restricciones hard nunca se convierten en preferencias soft.
- Determinismo, input inmutable, simulación antes de consolidación y Evidence cuando la tarea la requiera.
- Configuración explícita; no hardcodes, inferencias por nombre ni IDs de fixtures en lógica productiva.
- Robustez ante `null`, `undefined`, relaciones incompletas y RLS.
- La evidencia prevalece sobre la intuición.

## Alcance

- Implementa una sola unidad lógica.
- Modifica únicamente los archivos necesarios para el objetivo solicitado.
- No hagas refactors amplios, limpiezas generales ni mejoras adyacentes no pedidas.
- Reutiliza autoridades y utilidades existentes antes de crear componentes nuevos.
- No modifiques DB, schema, migraciones, RLS, UI, API, ORC, V3, V4 o publicación salvo autorización expresa.
- No abras otro PR cuando la tarea indique continuar uno existente.
- No hagas merge.

## Uso eficiente de contexto

- Lee primero este archivo, el prompt y sólo los documentos/archivos directamente relevantes.
- Usa búsquedas dirigidas; no recorras todo el repositorio sin necesidad.
- No repitas en la respuesta final el prompt, la documentación ni grandes fragmentos de código.
- No actualices README, Evidence o benchmarks salvo que el objetivo o los criterios de aceptación lo exijan.

## Validación escalonada

### Durante la implementación

- Ejecuta TypeScript/lint y los tests focalizados de los contratos modificados.
- Corrige esos fallos antes de ampliar pruebas.
- No repitas `npm ci` si las dependencias no cambiaron y ya se ejecutó correctamente en la tarea.

### Merge gate

Ejecuta suite Planner Next, suite global, build, Focal y benchmarks reproducibles sólo cuando el prompt indique que el cambio está listo para revisión final o cuando el alcance lo haga imprescindible.

Si una validación no puede ejecutarse, informa causa y riesgo residual; no sustituyas Evidence ausente por afirmaciones.

## Entrega

La respuesta final debe ser breve e incluir únicamente:

1. objetivo completado;
2. archivos modificados;
3. decisiones relevantes;
4. tests ejecutados y resultado;
5. limitaciones o riesgos reales;
6. URL y head del PR cuando aplique;
7. confirmación de que no se hizo merge.
