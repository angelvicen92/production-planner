# OptiPlan — instrucciones permanentes para Codex

Este archivo es un **mapa estable**, no una enciclopedia. El prompt de cada tarea contiene sólo el delta. Para contexto y créditos consulta `docs/governance/CODEX_EFFICIENCY_PROTOCOL.md` cuando sea relevante. Para selección de ejecutor consulta `docs/governance/EXECUTION_ROUTING_PROTOCOL.md`. Para cambios sobre búsqueda o diagnóstico de Planner Next consulta `docs/governance/PLANNER_CAUSAL_DIAGNOSTIC_PROTOCOL.md` cuando exista estancamiento, agotamiento de presupuesto o una optimización que no produzca progreso estructural. Para cambios que creen, extiendan o reutilicen capacidades del planificador o de Assisted Planning, consulta primero `docs/architecture/PLANNER_CAPABILITY_CATALOG.md` para comprobar qué existe, su wiring, Evidence, limitaciones y frontera experimental; el catálogo es descriptivo y no sustituye las Fuentes oficiales.

Cuando una tarea llega a Codex, ChatGPT ya ha definido objetivo, alcance y criterios de aceptación y ha elegido Codex porque su entorno de código/ejecución es adecuado para esa unidad. No reabras por defecto la estrategia global, pero comprueba las dependencias locales necesarias y reporta cualquier incompatibilidad material que descubras en el código real.

## Adecuación integral y objetivos de producto

Ante peticiones sobre rumbo, parametrización, funcionalidades pendientes, estado global, prioridades o inicio de un nuevo chat, consultar `docs/governance/OPTIPLAN_MASTER_ADECUACION_APP.md` junto con las Fuentes 00–07 y el `main`/Evidence vigentes. Es un mapa vivo **no normativo** de decisiones humanas, brechas de UI/configuración, Planner/Assisted, ejecución y analítica; sus tablas de PR y despliegues son fotografías y **nunca** sustituyen la comprobación en vivo.

## Prioridad absoluta P0: jornadas nuevas planificables (decisión humana 22/10/2026)

**Esta prioridad gobierna el siguiente trabajo nuevo una vez cerrados los dos hilos ya activos U04a/U06c.** OptiPlan debe permitir crear por interfaz cualquier día con sus propios participantes, plantillas, tareas, recursos y reglas válidas, y planificarlo mediante Planner Next/Assisted hasta Stages; el A2 sólo es benchmark de regresión, nunca requisito de funcionamiento ni medida suficiente de éxito. En `main` al 22/10/2026 el alta de días crea snapshots pero no construye automáticamente `planner_next_configuration`; el preflight Next exige políticas y autoridades estructuradas que el A2 tiene preparadas. Antes de ampliar motor o editores, auditar causalmente este recorrido y demostrar al menos dos jornadas no A2 creadas desde UI y planificadas E2E. Una configuración imposible o no representable debe dar diagnóstico explícito, no éxito ficticio. **Leer el apartado P0 de `docs/governance/OPTIPLAN_MASTER_ADECUACION_APP.md` para aceptación, precedencia y secuencia vigente; comprobar GitHub/Evidence frescos.** No empezar nuevas ramas de optimización A2 hasta resolver P0 o un prerrequisito causal demostrado.

## Despliegues y continuidad operativa

Ante cualquier petición de **backup, migración de Supabase, sincronización o publicación de Replit**, consulta primero `docs/operations/OptiPlan_Guia_Replit_Supabase.md` y `script/deploy/optiplan_preparar_release.sh` del `main` vigente. La guía es **procedimiento operativo, no Fuente normativa**. Verifica commit aprobado, CI, Evidence, backup recuperable, ledger de migraciones y estado real de Replit antes de actuar; no supongas que ya está desplegado. No ejecutar cambios productivos desde Codex salvo autorización expresa: ChatGPT orquesta las migraciones y publicación mediante las herramientas correspondientes.

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

## Identidad del checkout

- La identidad autoritativa del trabajo es el **repo + PR/rama remota objetivo + base remota** indicada por ChatGPT; el nombre de la rama local puede ser `work` u otro nombre interno del entorno.
- El prompt puede incluir una línea explícita `RAMA A SELECCIONAR EN CODEX`. Esa rama es la referencia remota que el usuario debe seleccionar en el desplegable de la interfaz antes de lanzar la tarea. No la confundas con el nombre de la rama local que el entorno use después.
- Para una tarea nueva desde `main`, la rama a seleccionar será normalmente la rama de trabajo remota creada por ChatGPT desde el `main` autorizado. Para continuar un PR existente en un nuevo hilo/tarea, la rama a seleccionar será normalmente el **head remoto actual de ese PR**, no su base.
- No exijas igualdad de SHA de commit local cuando el entorno pueda recrear commits equivalentes con metadatos distintos. Si hace falta verificar equivalencia, compara contenido (`HEAD^{tree}`), diff contra la referencia disponible o parent/base; el tree SHA identifica el contenido, el commit SHA también incluye metadatos.
- Un SHA exacto es un ancla útil cuando el objeto existe localmente y debe probarse una base concreta, pero su ausencia local no es por sí sola un blocker si el checkout puede demostrar por contenido/base que corresponde al trabajo remoto correcto.
- Para continuar bastan normalmente: repositorio correcto, trabajo remoto objetivo correcto, árbol limpio y ninguna diferencia material respecto al head/base que se pretende continuar.
- Detente sólo ante riesgo real de trabajar sobre contenido/base equivocados, cambios locales ajenos, divergencia material o imposibilidad de demostrar equivalencia con la información disponible.
- No hagas `fetch`, `pull`, `switch`, reparación de remotes o reescritura de historia únicamente para satisfacer un nombre de rama o SHA local cosmético, salvo que el prompt lo requiera porque esa operación sea necesaria para recuperar la base correcta.

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

## Fuentes oficiales de OptiPlan

Los originales vigentes están en `docs/source/official/` del repositorio. Lee
`docs/source/official/00_INDICE_Y_AUTORIDAD_FUENTES_OPTIPLAN_v2.13.md`
para autoridad por ámbito, y
`docs/source/official/07_PROTOCOLO_MAESTRO_CONTINUIDAD_v2.2.md`
para el método de trabajo y la auditoría causal. Según el alcance, consulta las
Fuentes 01–06 y los dos PDFs A2. Si la Fuente 06 interpreta o corrige un PDF,
prevalece la Fuente 06. El repositorio `main`, la CI y Evidence describen el
estado de implementación. Actualizar normas sólo mediante una nueva versión
consolidada y un PR que eleve la Fuente 00; no mantener versiones oficiales
paralelas en otros directorios.
