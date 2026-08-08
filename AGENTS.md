# OptiPlan — instrucciones permanentes para Codex

Este archivo es un **mapa estable**, no una enciclopedia. El prompt de cada tarea contiene sólo el delta. Para la política completa de contexto y créditos, consulta `docs/governance/CODEX_EFFICIENCY_PROTOCOL.md` únicamente cuando sea relevante.

Codex sólo debe recibir tareas que ya han superado el gate de autonomía definido en `docs/governance/AUTONOMY_FIRST_EXECUTION_PROTOCOL.md`: ChatGPT ya ha decidido que necesita una capacidad local de edición, ejecución o validación que no puede cubrir directamente. No reabras por defecto esa decisión ni conviertas el delta en una auditoría general.

## Invariantes

- Respeta las fuentes oficiales y SPEC citadas por la tarea; no inventes requisitos, reglas, contratos ni arquitectura.
- Producción primero: viabilidad operativa antes que optimización local.
- El motor propone; el humano decide.
- `done` e `in_progress` son inmutables; sólo se replantea lo pendiente o interrumpido.
- Locks y restricciones hard nunca se convierten en preferencias soft.
- Preserva determinismo, input inmutable, simulación antes de consolidación y Evidence cuando aplique.
- Configuración explícita: sin hardcodes, inferencias por nombre ni IDs de fixtures en lógica productiva.
- Robustez ante `null`, `undefined`, relaciones incompletas y RLS.
- La evidencia prevalece sobre la intuición.

## Alcance

- Implementa una sola unidad lógica y modifica sólo los archivos necesarios.
- Reutiliza autoridades y utilidades existentes antes de crear componentes nuevos.
- No hagas refactors amplios, limpiezas generales ni mejoras adyacentes no pedidas.
- No modifiques DB, schema, migraciones, RLS, UI, API, ORC, V3, V4 o publicación salvo autorización expresa.
- Si una ambigüedad material impide implementar correctamente, detente y repórtala.
- No abras otro PR si la tarea indica continuar uno existente. No hagas merge.

## Contexto

1. Lee este archivo y el prompt.
2. Lee sólo las rutas indicadas en `Leer:` o las fuentes directamente citadas.
3. Usa búsquedas dirigidas para localizar símbolos o dependencias inmediatas.
4. Amplía el contexto sólo si aparece una dependencia real no prevista.

No recorras por defecto todo el repositorio, `README`, `docs/`, Evidence o todas las SPEC. No repitas en la respuesta final el prompt, documentación, logs extensos ni grandes fragmentos de código.

## Validación escalonada

Durante implementación:

- ejecuta TypeScript/lint y tests focales directamente afectados;
- no repitas `npm ci` si las dependencias no cambiaron y el entorno ya está preparado;
- no ejecutes suite global, Full A2, Focal completo o todos los benchmarks tras cada corrección local.

Sobre un head candidato, ejecuta el merge gate completo sólo cuando el prompt lo exija o el alcance lo haga imprescindible. Si una validación no puede ejecutarse, informa causa y riesgo residual.

## Entrega

Sé breve. Incluye únicamente:

1. objetivo completado;
2. archivos modificados;
3. decisión técnica relevante;
4. tests ejecutados y resultado;
5. riesgos o validaciones pendientes;
6. URL y head del PR cuando aplique;
7. confirmación de que no hiciste merge.
