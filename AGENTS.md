# OptiPlan — instrucciones permanentes para Codex

Este archivo es un **mapa estable**, no una enciclopedia. El prompt de cada tarea contiene sólo el delta. Para contexto y créditos consulta `docs/governance/CODEX_EFFICIENCY_PROTOCOL.md` cuando sea relevante. Para selección de ejecutor consulta `docs/governance/EXECUTION_ROUTING_PROTOCOL.md`.

Cuando una tarea llega a Codex, ChatGPT ya ha definido objetivo, alcance y criterios de aceptación y ha elegido Codex porque su entorno de código/ejecución es adecuado para esa unidad. No reabras por defecto la estrategia global, pero comprueba las dependencias locales necesarias y reporta cualquier incompatibilidad material que descubras en el código real.

## Invariantes

- Respeta las fuentes oficiales y SPEC citadas; no inventes requisitos, reglas, contratos ni arquitectura.
- Producción primero: viabilidad operativa antes que optimización local.
- El motor propone; el humano decide.
- `done` e `in_progress` son inmutables; sólo se replantea lo pendiente o interrumpido según contrato.
- Locks y restricciones hard nunca se convierten en preferencias soft.
- Preserva determinismo, input inmutable, simulación antes de consolidación y Evidence cuando aplique.
- Configuración explícita: sin hardcodes, inferencias por nombre ni IDs de fixtures en lógica productiva.
- Robustez ante `null`, `undefined`, relaciones incompletas y RLS.
- La Evidence prevalece sobre la intuición.

## Alcance

- Implementa una sola unidad lógica y modifica sólo los archivos necesarios.
- Reutiliza autoridades y utilidades existentes antes de crear componentes nuevos.
- No hagas refactors amplios, limpiezas generales ni mejoras adyacentes no pedidas.
- No modifiques DB, schema, migraciones, RLS, UI, API, ORC, V3, V4 o publicación salvo autorización expresa del prompt.
- Si una ambigüedad material impide implementar correctamente, detente y repórtala.
- No abras otro PR si la tarea indica continuar uno existente. No hagas merge.

## Contexto

1. Lee este archivo y el prompt.
2. Lee las rutas indicadas en `Leer:` o las fuentes directamente citadas.
3. Usa búsquedas dirigidas para símbolos y dependencias inmediatas.
4. Amplía el contexto cuando aparezca una dependencia real no prevista.

No recorras por defecto todo el repositorio, todo `README`, `docs/`, Evidence o todas las SPEC. No conviertas el delta en una auditoría general.

## Ejecución

Aprovecha el entorno local para cerrar el bucle técnico:

`leer → editar → ejecutar → observar → corregir`

No sigas ciegamente una implementación propuesta si el código real demuestra que el mecanismo exacto es incompatible. Mantén el objetivo y los contratos, realiza el ajuste técnico mínimo y explícalo.

## Validación escalonada

Durante implementación:

- ejecuta TypeScript/lint y tests focales afectados;
- no repitas `npm ci` si las dependencias no cambiaron;
- no ejecutes suite global, Full A2 o todos los benchmarks tras cada corrección local.

Sobre un head candidato, ejecuta el merge gate completo sólo cuando el prompt lo exija o el alcance lo haga imprescindible.

Si una validación no puede ejecutarse, informa causa y riesgo residual.

## Entrega

Sé breve. Incluye únicamente:

1. objetivo completado;
2. archivos modificados;
3. decisión técnica relevante;
4. tests ejecutados y resultado;
5. riesgos o validaciones pendientes;
6. URL y head del PR cuando aplique;
7. confirmación de que no hiciste merge.
