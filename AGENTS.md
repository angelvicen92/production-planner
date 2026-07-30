# OptiPlan — instrucciones permanentes para agentes

## Propósito

OptiPlan es un sistema operativo para planificar y ejecutar una jornada de producción audiovisual real.

Principio rector:

> La producción tiene que salir.

La viabilidad operativa real prevalece sobre cualquier optimización técnica o elegancia arquitectónica local.

## Fuentes de verdad

Antes de modificar comportamiento de producto, dominio, base de datos o motor, consulta la documentación oficial vigente facilitada para la tarea:

- PRD;
- Documento Maestro;
- Documento de Visión;
- Especificación Maestra de Dominio y Operación;
- Operational Reasoning Core;
- SPEC-00 a SPEC-08;
- Documento de Operativa, UI e Inteligencia de Producción.

No inventes requisitos, reglas de negocio ni arquitectura. Si una decisión necesaria no está definida, detén la implementación y solicita aclaración.

## Principios no negociables

- Viabilidad antes que optimización.
- Producción primero.
- El motor propone; el humano decide.
- Las tareas `in_progress` y `done` nunca se modifican.
- La replanificación actúa únicamente sobre tareas pendientes, reanudaciones y nuevas obligaciones no ejecutadas.
- Los locks son explícitos, visibles, persistentes y gestionables.
- Toda decisión relevante debe ser explicable.
- Configuración antes que hardcode.
- Robustez ante `null`, `undefined`, RLS y relaciones incompletas.
- Determinismo: misma entrada, configuración y presupuesto deben producir la misma salida.
- Simulación antes de consolidación.
- Evidence y benchmarks son obligatorios cuando el cambio afecta al planificador u ORC.
- La evidencia prevalece sobre la intuición.

## Arquitectura ORC

Cuando el cambio afecte al ORC, respeta estrictamente el pipeline oficial:

`OperationalState -> SEE -> Transformation -> Simulation -> Validation -> Operational Evaluator -> Commit -> Evidence`

No introduzcas dependencias cruzadas ni muevas responsabilidades entre componentes sin autorización documental explícita.

Antes de añadir componentes o mecanismos nuevos, demuestra que el problema no puede resolverse corrigiendo o aprovechando capacidades existentes.

## Método de trabajo

Cada Pull Request debe implementar una única unidad lógica.

Clasifica el cambio en la descripción del PR:

- `Fast Merge`: UI/frontend de bajo riesgo, sin DB, RLS, motor ni contratos críticos.
- `DB Safe Merge`: DB, migraciones, RLS, modelos, contratos, locks, planificación, ORC o motor.

No mezcles varios objetivos grandes en una misma iteración.

## Antes de modificar

1. Revisa el código actual y las últimas iteraciones relacionadas.
2. Identifica el comportamiento real, no sólo la intención aparente.
3. Comprueba si existen tests, benchmarks o Evidence representativos.
4. Define el siguiente paso de mayor valor y menor riesgo.
5. Conserva compatibilidad con comportamiento correcto existente.

## Validación mínima

Ejecuta los comandos relevantes según el alcance:

- `npm ci`
- `npm run check`
- `npm run build`
- `npm test`

Para cambios del motor, ejecuta además los tests y benchmarks específicos disponibles en `package.json`. No sustituyas un benchmark focal por uno genérico cuando exista un escenario representativo del cambio.

Toda modificación del planificador u ORC debe demostrar:

- correctitud hard;
- ausencia de regresiones operativas;
- determinismo;
- coste computacional razonable;
- Evidence suficiente para explicar el resultado.

Si una validación no puede ejecutarse, indícalo explícitamente en el PR con la causa y el riesgo residual.

## Base de datos y RLS

Los cambios DB Safe deben:

- usar migraciones idempotentes cuando corresponda;
- preservar integridad y compatibilidad;
- revisar RLS y permisos afectados;
- no asumir relaciones cargadas;
- incluir validación operativa completa antes del merge.

## UI y operativa

- Nunca mostrar IDs técnicos al usuario operativo.
- Toda vista debe contemplar loading, empty, error, partial data y falta de permisos.
- La realidad ejecutada prevalece sobre el plan.
- No ocultar inviabilidad ni errores mediante fallbacks silenciosos.
- Las acciones críticas deben ser comprensibles y auditables.

## README y trazabilidad

Toda iteración funcional debe actualizar `README.md` con un registro ordenado por ID que indique:

- objetivo;
- implementación;
- alcance y exclusiones;
- validaciones ejecutadas;
- resultado operativo.

No declares soporte basándote sólo en presencia de código. El soporte se demuestra mediante test, benchmark o validación independiente.

## Prohibiciones

- No hacer hardcode de nombres de programas, espacios, concursantes o recursos.
- No relajar restricciones hard para lograr una planificación.
- No modificar silenciosamente tareas protegidas.
- No usar un fallback como si fuera resultado del ORC.
- No añadir heurísticas o arquitectura sin evidencia de necesidad.
- No aprobar una mejora por compilar únicamente.
- No ocultar tests fallidos, benchmarks degradados o incertidumbre.
