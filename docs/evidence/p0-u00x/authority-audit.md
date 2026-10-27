# Auditoría causal U00x

Base exacta: `cc0b674ebaadb8c41c5438302a62eb29de684833`, U00w integrado (#1201), migración 118. Main y rama remota coincidían con esa base; ocho checks observados estaban verdes. No se consulta ni modifica Supabase real. Las fuentes y sus hashes están en `authorities.json`.

## Antes de editar producto

`diagnostic/before.json.gz` conserva una jornada nueva de 19 obligaciones: cinco Main/Vocal, tres tripletas, dos equipos con cámara/sonido auténticos, kit por anclaje, kit independiente, Reality en Corner, otra tarea de Corner y CAM1 consumida desde Hall. Los catálogos y tareas proceden de APIs de producto; Chromium crea el día y declara tres dominios A/B. Ventanas, dependencias y recursos son explícitos. No se suministran horarios, placements, seeds ni locks.

El PUT independiente devuelve el **422 productivo original** `UNSUPPORTED_TASK_SCOPE_COMBINATION`. La sesión y las filas de autoridad se comparan antes/después y permanecen exactas. La intervención retira únicamente `anchoredAccompaniments` de una copia durante la llamada a `withDailyTaskOperationScopes` y repone inmediatamente su contrato original. Ningún materializador de anclajes, recurso ni consumidor se modifica en este experimento. Se conservan agenda `ITINERANT_UNIT`, herencia `OPERATION_ONLY`, `blocksSpace=true`, unidad nominal y directos reales.

| Control sobre las mismas fuentes | Propuesta completa | Trabajo observado | Validación global |
| --- | --- | --- | --- |
| Anclajes, independiente con herencia ordinaria | 19/19 | 425 ramas, 420 core, 5 standalone | HARD válida |
| Scope independiente, sin declarar anclajes | 19/19 | 102 ramas, 86 core, 16 standalone | HARD válida |
| Ambas autoridades en memoria | 19/19 | 425 ramas, 420 core, 5 standalone | HARD válida |

El combinado selecciona una sola unidad para cada tripleta. Reality y Hall comparten intervalo sin consumir ambos CAM1; Corner ordinario se coloca después de Reality. Una propuesta parcial de cuatro obligaciones conserva un witness completo HARD válido de las 19. La salida `inspect.validation` aplicada sólo a esas cuatro contra el problema global informa pendientes; **no es la validación de scope ni del witness**. `diagnostic/causal-summary.json.gz` separa ambos contratos.

La primera frontera era el productor, antes de preflight. No había agotamiento ni una alternativa A/B válida perdida en este caso. Los controles negativos de intervalo detectan unidad/recurso compartido, ocupación de Corner, split de tripleta/unidad, recurso inexistente y ventana. La omisión de un directo de una tarea con unidad fija no se rechaza en `validatePlan`: se reproduce igual en el control standalone. Su barrera material pertenece a SQL, como en U00v; los gates de certificado recalculan hashes y comprueban esa barrera. Se conserva el intento diagnóstico fallido que permitió identificarlo, sin atribuirlo a una comprobación posterior.

## Recorrido real

1. Snapshot de perfil y plantillas → `buildEngineInput`, composición diaria y IDs físicos nominales.
2. Materialización del perfil, dependencias y directos; después anclajes; después scopes independientes. Al exigir miembros disjuntos, sus campos no se sobrescriben. El test de conmutación compara ambas proyecciones completas y comprueba inmutabilidad.
3. `preflightEngineInputForPlannerNext` y adapter conservan las obligaciones y producen v2 sólo desde adopción explícita. La ubicación sigue siendo real; una agenda itinerante no crea otra capacidad física.
4. `resolveAssistedScope` → `expandVisiblePrerequisites` cierra anclaje y Vocal. `buildAssistedProblem` separa visible, supporting, futuro y protegido.
5. El core Main/feeder genera geometrías, variantes A/B completas y matching residual con claves físicas distintas. El primer caso registra 127 intentos de witness, 30 reparaciones y profundidad cinco; no se exige repetir esos contadores como contrato.
6. `materializeAnchoredOperation` y el materializador itinerante conservan un equipo durante los tres segmentos. La continuación standalone usa sus recursos directos, miembros y ocupación real.
7. Future Feasibility certifica conjuntamente todas las obligaciones nativas v2. El witness completo no se copia al Draft parcial. La continuación recibe exactamente el Stage protegido.
8. `validatePlan`, validación de propuesta, Draft y aceptación SQL reconstruyen autoridades materiales. No basta el fingerprint. Rollback/redo restaura los mismos snapshots sin revertir configuración ni permitir editar decisiones protegidas.

## Segunda frontera: disponibilidad tardía del feeder

La primera B mantiene el día a las 09:00, pero participantes, coach y equipos empiezan a las 10:00. El consumidor rechaza 11 arquitecturas a profundidad cero, sin matching ni ramas standalone: `FEEDER_CAPACITY`, `RESOURCE_WINDOW`, `PREREQUISITE_WINDOW`. No hay evidencia de agotamiento.

**X:** una cohorte factible no llega a matching. **Y:** los eventos `withoutLeadIn` se calculan desde `problem.day.start`, ignorando la apertura posterior del coach compartido. **Z:** se rechazan correctamente las geometrías generadas, pero no se genera la alternativa alimentable. **W:** conservar los eventos existentes y traducirlos también por los inicios auténticos del coach, dentro de adopción nativa v2. **M:** el mismo EngineInput y presupuesto completa 20/20 y certifica un S1 parcial.

`diagnostic/geometry-before-after.json.gz` conserva input, código literal transformado con esbuild `write:false`, hash previo, antes/después y parcial. **27 ramas sin propuesta → 142 ramas, 20/20**, witness completo válido. No se añade rejilla, ordering, poda, matching ni nuevo nivel de búsqueda. Las geometrías anteriores permanecen y se validan por los mismos consumidores. El histórico A2 no adopta v2.

## SQL y certificación física

117 rechazaba la autoridad coexistente y verificaba todos los placements como si no existiesen los campos efectivos del anclaje. 119 reutiliza esos helpers: valida disyunción de miembros, toma unidad elegida/dominio y campos operativos del replay auténtico y comprueba la composición contra filas físicas. El helper 118 ya reconstruía `blocksSpace`, herencia y coach de los peers; se conserva literalmente.

El primer borrador de 119 confundió coach implícito de Main/Vocal ordinario con asignación persistida. `diagnostic/sql-materialization-before.json.gz` conserva ese SQL, input, snapshot y rechazo. El SQL final incluye el coach en consumo físico, pero exige en `assignedResourceIds` sólo el canal que corresponde: directos/miembros, incluyendo el coach declarado de un anclaje cuando se materializa. No inventa asignaciones ordinarias.

Los peers dentro de la misma operación conservan su frontera `INCLUDED`. Los traslados entre operaciones siguen siendo HARD. El contraste transaccional con `diagnostic/snapshot-before-internal-transition.sql` usa B con ubicaciones virtuales distintas y transición nominal de cinco minutos; se exige el rechazo anterior y el positivo final sobre el mismo snapshot. Los segmentos virtuales no ocupan esos espacios.

El cierre también asigna por API el kit real independiente como recurso fijo del Main. Su consumo físico se comparte legítimamente con Reality. Native v2 persiste el conjunto físico completo de los miembros anclados, incluyendo LOCATION en Main; ordinary y scopes conservan sus canales previos. `location-materialization-before-correction` registra el rechazo anterior con la lista exacta esperada/real; el helper final acepta el mismo snapshot. Al combinar este caso con el probe antiguo de transición, la primera barrera pasa a ser recursos físicos: se registra como tal. `snapshot-internal-only-counterfactual.sql` conserva todas las demás correcciones y retira únicamente INCLUDED para alcanzar, por separado, `TASK_SCOPE_RESOURCE_TRANSITION`. No se atribuye al guard de transición un rechazo anterior por recursos.

El writer sigue siendo `apply_day_config_operation_v5`: bloqueo de plan, CAS, identidad/replay esperados, captura de fuentes, mutación autorizada, revisión y transición de sesión atómicas. Sus cuerpos y triggers no cambian. La edición selecciona una autoridad por operación, preservando la otra. Los dos guards de revisión exigen que cada proyección corresponda a su declaración; una tarea común se rechaza en API y SQL.

119 no altera 001–118, 088, filas de aplicación ni RLS. El único helper nuevo es invoker, `search_path=''`, sin EXECUTE de PUBLIC/anon/authenticated y con EXECUTE sólo para service_role. Los contratos de catálogo verifican cuerpos y ACL reales, incluyendo 117, 118 y 119. El ensayo poblado compara todas las filas, lectores y políticas antes/después.

## Continuación con un anclaje protegido en medio del bloque

La CI del primer head detectó que B aceptaba S1 y un witness válido de las 20, pero S2 devolvía `CORE_INFEASIBLE` en 1.547 ramas. Se conservan los recibos exactos y la reconstrucción fría en `diagnostic/continuation-before.json.gz`. No era inviabilidad física ni agotamiento: el witness previo seguía siendo HARD válido y conservaba las cuatro decisiones aceptadas.

El recorrido tiene dos fronteras dentro del core existente. Los eventos anteriores sólo empaquetan todo el trabajo pendiente antes o después del Main protegido; no generan el bloque continuo que lo rodea. Además, el cierre DFS llama a `hardGateCoreLeaf` con las políticas pendientes y omite `fixedMainContracts`, aunque los otros dos callers ya incluyen ambas colecciones. La validación reducida deja entonces de reconocer las fronteras internas `INCLUDED` del anclaje aceptado. Con espacios virtuales distintos y traslado nominal de cinco minutos, las interpreta erróneamente como transiciones externas.

| Misma entrada y S1 exacto | Resultado |
| --- | --- |
| Sin intervención | Sin propuesta; 1.547 ramas |
| Sólo alineaciones alrededor del Main protegido | Sin propuesta; 7.408 ramas; 354 candidatos core, ninguno atraviesa el gate HARD |
| Sólo conservar el contrato protegido en validación | Sin propuesta; 1.547 ramas |
| Ambas correcciones en memoria | 16 pendientes completas; witness válido de 20; S1 exacto; 3.642 ramas |

`protected-geometry-only.json.gz`, `protected-authority-only.json.gz` y `continuation-combined.json.gz` conservan los cuerpos literales esbuild `write:false` y resultados. No se incorporó un arreglo aislado insuficiente. El delta productivo amplía las alineaciones de la geometría existente a ambos lados de los slots aceptados, conserva las alternativas previas, identifica cada geometría por sus slots y cobra los mismos eventos de timeline/composite. El gate DFS utiliza la misma unión de contratos fijos/pendientes que los otros callers. No se usa el witness como seed, placement aceptado ni lock; las alineaciones derivan exclusivamente del Main ya aceptado. No se añade solver, heurística, poda o nivel de búsqueda.

La misma CI conservó dos negativos U00v que construyen un anclaje mal formado. `taskOperationScopesSupported` exige ahora adopción nativa explícita y referencias estructurales válidas para anunciar coexistencia; la declaración mal formada sigue siendo UNSUPPORTED y nunca se itera como una tripleta válida. Las assertions originales permanecen intactas.

## Matriz de compatibilidad

| Autoridades | Resultado de esta unidad |
| --- | --- |
| Anclaje v1, sin scopes | Regresión U00u conservada |
| Scopes independientes, sin anclajes | Regresión U00v conservada |
| Varios anclajes v2 A/B, sin scopes | Regresión U00w conservada |
| Varios anclajes v2 + scopes en tareas disjuntas | UI/API → propuesta → Draft → validación → Stage y continuación |
| Una tarea en ambos contratos | Rechazo de integridad antes de buscar |
| Dos equipos con cámara/técnico común | No constituyen dos capacidades |
| Operaciones independientes sin conflicto físico | Simultaneidad permitida, sin herencia indebida |
| Joints, comidas coordinadas, rondas/cadenas/setups/transporte combinados | Fronteras previas conservadas; no habilitados por U00x |
| Configuración histórica/088 | Sin adopción ni reescritura |

El siguiente PR recomendado es la autoría diaria de operaciones conjuntas: `next-gap.json` prueba el rechazo de `jointGroups` por ambas superficies nativas tipadas. El consumidor histórico no sustituye un productor nativo. No se implementan aquí esas operaciones, comidas coordinadas, transiciones de coach, coordinación estructural ni `requiresBand`.
