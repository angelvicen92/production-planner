# P0-G02 — rutas físicas direccionales por recurso

Base autorizada `7302a333be10532b17284e5db06bdc62aed975e0`; rama `codex/p0-g02-native-directional-coach-routes`. Una unidad de producto. Sin merge, despliegue ni mutaciones de servicios productivos.

## Hipótesis causal X/Y/Z/W/M

- **X:** la jornada nativa no permite expresar el traslado direccional de una identidad física concreta (CAM, SON, presentadora o coach).
- **Y:** el productor diario carece de rutas y el resolver direccional se especializa en coach. Recursos ordinarios consumidos efectivamente llegan al motor, pero usan el margen uniforme; varios validadores SQL sólo comparan ese escalar.
- **Z:** se pierde una restricción física necesaria o se impone un margen uniforme excesivo. Un recurso no consumido nunca debe originar un conflicto.
- **W:** lista diaria mínima y adaptación del resolver existente a la identidad del recurso, manteniendo el canal y los certificados históricos de coach. Las dos representaciones se validan juntas y no se elige entre declaraciones duplicadas.
- **M:** autoría nativa → CAS/revisión/replay → EngineInput → dominios/colocación/matching/futuro → propuesta/witness → Draft → validación → S1/S2 SQL y lectura fría. Controles sin rutas conservan resultados.

## Primera pérdida y recorrido comprobado antes del cambio

Se consultaron AGENTS, Fuentes 00/01/03/04/05/06/07, catálogo, gate transversal y Evidence G01/U02d. `Resource.transitionMinutes` y `resourceTransitionMinutes` ya existen. `resolveEffectiveTaskResourceAssignments` y `resolveProjectedPlannerNextTaskResources` son la autoridad de consumo: incluyen byItem y asignaciones efectivas y separan el coach de Main/Vocal. G01 produce byItem; U02d compone y certifica esas identidades hasta Stage.

La primera ausencia es el productor diario, anterior a `engine/buildInput.ts`. En el motor, `placement.ts` aplica el margen a recursos comunes; sus dominios alimentan construcción/Future Feasibility. `exactMainAndFeederCore.ts` invalida aristas residuales por interacción física. `validate.ts` revalida; `resourcePresence.ts` explica slack. `coachRouteTransitions.ts`, patrones Main y deadlines de feeder sólo conocían la excepción coach. El adapter proyectaba a recursos ordinarios el respaldo general.

Se reconstruyó también `effectivePlanConfigRevision` → operación diaria v5 → fuentes/revisión → propuesta certificada → Draft/validation → Stage. SQL 112 autentica elecciones nominales y su witness; 120/126 autentican el witness físico compuesto; 115 comprueba certificados de cadena y 119 la ocupación de scopes. Esos consumidores y sus guards se conservan; 127 sustituye comparaciones escalares por el mismo contrato direccional y añade el control autenticado de rutas diarias en revisión, validación y Stage.

## Contrato y compatibilidad

`plans.daily_resource_route_transitions` contiene `{contractVersion:1,routes:[{planResourceItemId,fromSpaceId,toSpaceId,minutes}],by,at}`. Son IDs reales del día. El payload público no acepta actor/fecha. La lista se ordena por recurso/origen/destino; no hay matriz de zonas, transporte ni nuevo scheduler.

EngineInput transporta esas cuatro propiedades y el adapter produce `{resourceId,fromSpaceId,toSpaceId,minutes}` con identidades canónicas reversibles. La revisión efectiva contiene las reglas sin metadata mutable. Lista vacía conserva ausencia en la proyección histórica.

La resolución compartida usa: ruta explícita → respaldo por recurso cuando exista → respaldo general. Dentro del mismo espacio devuelve cero traslado. La dirección inversa no se hereda. Minutos de ruta son enteros positivos en rejilla de cinco; `0` no se amplía como nueva opción. Entre recursos simultáneos se toma el máximo; la duración productiva no se altera.

`coachRouteTransitions` conserva su contrato, preflight y representación histórica. Su wrapper llama al mismo resolver. Una declaración del mismo recurso/dirección en ambos contratos se rechaza incluso con minutos iguales; no hay prioridad silenciosa. El canal dedicado del coach se cuenta una vez. La disponibilidad y el consumo proceden de las autoridades existentes, sin inferencia por nombres/tipos.

Las jornadas con rutas utilizan el productor existente de witness físico conjunto para pendientes. El servicio revalida ese witness sin otra búsqueda al validar/aceptar. SQL reutiliza 112 para elecciones nominales y el validador físico existente para identidades concretas; no se relaja autenticidad, locks, Stage ni revisiones.

## Autoría, pruebas y límites

El editor está en Configuración del día: recurso concreto con ID, origen/destino, minutos, alta/edición/eliminación y disponibilidad. Reutiliza autorización, revisión consultada, operación v5, locks de fuentes, hashing y captura inmutable. Las rutas se configuran antes de aceptar decisiones. No se crea un editor de rutas heredables generales ni se adopta una jornada histórica.

[Reproducción y gates](validation.md), [matriz viva](composition-matrix.md) y los recibos públicos distinguen intentos de desarrollo de pruebas finales. Los logs privados de la aplicación y credenciales de los stacks no se publican.

## Resultado verificado del candidato

Dos bases frías definitivas (`first/`, `repeat/`) completan las dos jornadas nativas y **ocho Stages SQL nuevos**: técnica/auxiliar de 4 obligaciones, S1 1 → S2 4; Main/Vocal con preparación de cámara de 6, S1 3 → S2 6. La separación A→B pasa de 5 a 25 minutos por el máximo CAM=10, SON=15, presentadora=25; las tareas siguen durando 10 minutos. Coach=30 conserva su canal específico y comparte la frontera con CAM=10 sin sumar. Las propuestas, witnesses, contadores, snapshots SQL y fingerprints son literalmente iguales entre bases; ambas usan las fuentes finales sin delta. [Determinismo](determinism.json), [vinculación de fuentes](source-binding.json).

Hay 29 negativos por base, clasificados en permisos, contrato, autenticidad, física, versión y protección. Los ataques físicos conservan la autoridad auténtica y recalculan hashes antes de invocar SQL; una separación menor sigue rechazándose. El recurso ausente de una tarea no se inventa por su nombre o espacio. Los roles ADMIN y PRODUCTION guardan con CAS; VIEWER/AUX/sin rol/anónimo no pueden hacerlo.

El control G01/U02d reproduce **ocho Stages SQL nuevos** frente a ocho históricos, 26 plantillas guardadas por UI y 148 snapshots operativos de plantilla iguales. Se conservan los cuatro perfiles originales, los dos órdenes de autoría, todos los recursos y decisiones, y el agotamiento de 10.000 ramas en AB→AC. El único cambio de su harness es comprobar cuerpos contra el ledger 127 actual, sin modificar fixtures, geometrías, budgets ni assertions operativas. [Comparación](control-g01-comparison.json), [verificador físico U02d](control-u02d-verification.json).

A2 histórico aislado conserva **266/266, 11 Stages, 27.049 ramas**, el informe completo salvo duración y todos los snapshots/certificados. SPEC10-019 conserva literalmente su proyección histórica. El upgrade poblado 126→127 conserva las 599 tareas, 11 Stages, lectores, RLS, owners y ACL existentes; los cuatro consumidores nuevos son invoker, con search_path vacío y sin EXECUTE para clientes. No hay adopción histórica ni cambios remotos.

La suite global inicial registró 3.315/3.317: el nuevo consumidor debía añadirse a la lista explícita de fronteras de aislamiento y pasa su recheck (22 pruebas). ASST-010 reproduce el mismo `NO_PROPOSAL` en un checkout limpio de la base autorizada; no se presenta como regresión nueva ni como prueba verde. Los 41 focales finales, nueve controles de cuerpos/ACL SQL, TypeScript, build y ledger pasan. [Detalle y límite global](test-results.json).

## Frontera siguiente

Las rutas cubren cualquier identidad concreta **efectivamente consumida por un contrato ya soportado**. No habilitan capacidades genéricas/auxiliares nominales ni nuevas formas de tarea. El perfil Vocal rechaza recursos genéricos además del coach; una Vocal aceptada aislada deja el Main pendiente sin feeder libre en el core actual. El caso certificado conserva Main y sus prerrequisitos en la misma aceptación. Esos primeros rechazos quedan en `attempts.json`; no se retiran guards para ocultarlos. Las rutas diarias se editan antes de aceptar decisiones. Ampliar esas fronteras requiere su propia auditoría causal; no forma parte de una matriz general de distancias ni de este PR.

La CI viva del único PR determina el estado remoto del head; los recibos locales no sustituyen sus checks. Sin merge ni despliegue.
