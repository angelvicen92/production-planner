# Delta mínimo recomendado después del gate

**X:** Main de una jornada válida con obligación crítica simultánea A no puede expresar A/B aunque B permite completar. **Y:** admisión limitada de U00i/U00j; tras aislarla, canal de coach incluido indebidamente en los fijos nominales y ausencia de materialización de variantes en el constructor Main. **Z:** se pierde una propuesta completa físicamente realizable. **W:** ampliar de forma explícita ese contrato y reutilizar la materialización física existente antes de construir operación/arista. **M:** este caso debe resolver B/A dentro del mismo run, volver de una alternativa A rechazada a B al mismo spot y conservar prueba física completa hasta Stage.

El orden obligatorio de Fuente 03 permanece arquitectura → capacidad necesaria → geometría anónima → matching por bundles → materialización/validación. La elección de recurso no debe trasladar el descubrimiento del pipeline a otro DFS de tareas. El presente caso demuestra qué falta; no determina todavía una nueva representación de aristas.

## Contrato inicial propuesto

Una tarea **Main ordinaria** de pipeline Main/Vocal representable, una sola elección física exclusiva `anyOf` o `byType`, quantity=1. Reutilizar todas las exclusiones vigentes de inventario ambiguo, recursos compartidos/composites, macros, grouping/anchors y cantidades no representables. Mantener los recursos independientes byItem/directos/heredados/locks y el coach explícito. Main/Vocal sigue teniendo sus dependencias, agenda y transiciones originales.

No abrir automáticamente Vocal: su preflight rechaza recursos físicos genéricos adicionales al coach y su materializador de feeder también recibe tareas sin variantes. Ese límite está identificado en `engineInputPreflight.ts` y en el recorrido de feeder, pero no se ha ejecutado un positivo Vocal con recurso genérico en esta unidad. Una ampliación Vocal exige su propio control físico, caracterización y decisión de alcance. “Main/feeder” no autoriza sustituir ni seleccionar coaches.

## Reutilización y cambios necesarios

| Autoridad/módulo | Reutilizar | Delta necesario |
|---|---|---|
| `resolveNominalResourceRequirements`, ambos preflights | Dominio exacto global→diario/typeId, disponibilidad, exclusiones y diagnósticos | Admitir únicamente el nuevo contrato Main demostrado; mantener rechazo explícito del resto |
| `projectedTaskResources`, adapter | Separación coach/físico y recursos independientes | Construir los fijos de la elección desde el canal físico proyectado. Preservar coachId y locks de coach; no duplicarlo como recurso genérico |
| `nominalResourceChoice`, `placement` | `nominalResourceVariants`, materialización, unión de dominios estáticos/dinámicos, ocupación y transiciones | Hacer que el constructor Main entregue una variante antes de llamar a `materializeAnchoredOperation`/`canPlaceTask`; conservar las guardias físicas existentes |
| `exactMainAndFeederCore`, `anonymousPipelineWitness` | Arquitectura, geometría, bundles, matcher y ledger actuales | Conservar alternativas de operación para un mismo task/spot en la construcción, selección y reparación, incluidas alternativas distinguidas por el futuro. Cubrir tanto residual/ordinary core como el camino de bundles; no basta con corregir sólo uno |
| Firmas/cachés/nogoods del core y perfiles del witness | Fingerprint final nominal ya distingue selección; reparación task↔spot existe | Auditar en el cambio concreto qué firma observa el recurso seleccionado/dominio. Un fallo de A no puede prohibir B del mismo spot sin prueba válida para ambas. No cambiar identidad de aristas por precaución; primero generar ambas y caracterizar su conservación |
| Assisted/continuación | Proyección productora conjunta, prueba física futura, scope y protección | Mantener selección aceptada desde assignedResourceIds y elecciones futuras efímeras. La sonda Main-sólo/B ya acredita prueba 11/11 y propuesta 1/11 |
| `validatePlan`, `assertNominalProposalWitness`, snapshot mapping | Comparación canónica de selección/identidad, fingerprint, revalidación sin buscar y round-trip | Ensayar Main dentro del contrato ampliado, coherencia de coach y de todos los fijos. No crear una segunda autoridad de recursos |
| Certificados estructurales | V1/V2 para supporting/feeder, autoridad de contexto protegido | Conservar su alcance. El certificado físico completo existente debe acreditar la elección Main y el futuro; no convertir un V2 igual para A/B en prueba física global |

**La forma exacta de almacenar o recorrer variantes queda pendiente del primer test en que ambas hayan sido generadas.** Son contratos necesarios, no autorización para introducir un nuevo matcher. La Evidence actual no decide entre variantes internas al bundle u otro refinamiento compatible con el matcher existente. La implementación mínima debe demostrar retorno A→B **en el mismo spot** y el alcance correcto de sus nogoods antes de considerar un cambio de identidad.

## SQL y Stages: límite real, todavía no ensayado nativamente

`111_typed_nominal_resource_integrity.sql:42` exige `STANDALONE_ONLY`; su rama byType exige tarea auxiliary. Por tanto una solución únicamente TypeScript no llegará a aceptación nominal Main. **No modificar 108–111.** Una futura migración incremental necesitará extender la misma comprobación privada, sin nuevos permisos/RPC/matching SQL, contrastando el perfil/rol con autoridades persistidas.

La validación nominal SQL actual nació para auxiliares: sus loops de ocupación física verifican `requiredResourceIds`; Main/Vocal usan además `coachId`. Se debe demostrar contra datos persistidos que identidad/asignación/disponibilidad/solape/transición del coach siguen cubiertos en propuesta y witness, sin exigir meter el coach en el canal físico de la elección. Retirar sólo el gate de perfil no acredita ese contrato.

Riesgos pendientes: revalidación de una selección protegida al continuar Stage, recursos independientes/directos y locks de coach, futuros sin asignación persistida, afinidad de espacio/transiciones, fingerprint/hash recalculado por un atacante, y compatibilidad con Stages históricos sin nominal. La sonda offline no prueba privilegios, CAS, RPC o triggers para Main: son gates nativos futuros. No hay evidencia que justifique ampliar RLS, permisos ni el esquema de recursos.

## Tests de aceptación de la siguiente unidad

1. Este input: los dos controles fijos conservan resultado; anyOf y byType resuelven B/A en una única búsqueda con presupuesto intacto. Negativos de contrato e inventario siguen cerrados.
2. Generar A y B para el mismo Main/spot; verificar identidades, fijos y coach. Provocar rechazo tardío de A por obligación fuera del scope y recuperar B en ese mismo spot, tanto por residual core como por bundles. Cambiar de spot no satisface este test.
3. Reparación/nogood/fingerprint: una prohibición física de A no elimina B; replay determinista y permutación del inventario. Ausencia de reexploración gratuita: ledger real y sin aumento de límites.
4. Future Feasibility y hardGate: full witness, crítico omitido, elección ausente/doble/inventada/otro tipo, recurso fijo omitido, disponibilidad/solape/transición y coach falsificado. FEASIBLE anónimo no puede sustituir prueba física final.
5. Journey nativo API/UI → propuesta → Draft → validar → Stage; scope parcial con futuros efímeros; continuación/replay frío que conserva exactamente Main B aceptado. Ataques SQL con hashes recalculados y rollback sobre un stack descartable, incluyendo CAS/revisión/scope/roles y ocupación del coach.
6. Regresión proporcional al cambio productivo real: Standalone U00i/U00j, Main/Vocal y fijos U00a, Stages históricos y A2 con su baseline canónico. La ausencia de cambio productivo en U00k permite proteger hashes; la futura unidad ya no podrá sustituir su regresión por esos hashes.

No se recomienda heurística, presupuesto, timeout, materialización eager de futuros, persistencia de alternativas no aceptadas ni cambio de identidad de matching en este PR.
