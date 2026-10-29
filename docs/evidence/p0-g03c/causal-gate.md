# Gate causal y primera frontera

## X / Y / Z / W / M

**X:** G03b permite fases REQUIRED y comidas individuales, pero `jointGroups.supported=false` cuando el día usa `flexible_meal_window`.

**Y:** `server/jointGroupStructure.ts::jointCombinationSupported` exige pausa global; `requiredPhaseCompositionSupported` excluye grupos/miembros conjuntos al admitir comidas flexibles. Los cuerpos efectivos de `assert_daily_joint_groups` (120 y ampliaciones) y `assert_daily_technical_chains` (128) conservan las exclusiones.

**Z:** no puede persistirse la operación única C06+C10 conservando las 19 comidas Sodexo. Una lista de fases con un representante todavía no vincula la obligación del otro participante.

**W candidato:** extender esos predicados y sus dos guards SQL, reutilizando los consumidores físicos y el witness global. El ensayo local se retiró: no alcanza el gate productivo completo.

**M requerido:** UI → configuración efectiva/revisión → propuesta auténtica → witness completo → Draft → validación → S1/S2 → conexión SQL nueva, con comidas/supporting pendientes en S1 y decisiones aceptadas preservadas en S2.

## Recorrido reconstruido antes de implementar

| Tramo | Consumidor existente y autoridad material |
| --- | --- |
| Configuración efectiva | `effectiveConfigurationView.ts` publica `technicalChains.phasesSupported` y `jointGroups.supported`. Los editores actuales guardan contratos por `applyDayConfigurationOperation`; writer v5, CAS, revisión y replay siguen siendo los productores. |
| Reconstrucción | `buildInput.ts:1021` aplica fases → anclajes → ámbitos → conjunta → pausa → rutas; `:1023` revalida las fases después de componer. `withDailyJointGroups` comprueba obligaciones distintas, duración, espacio, unidad, recursos efectivos, dependencias y disponibilidad común. |
| Scope | `assistedScopeResolver.ts` cierra peers y propiedad de la cadena, incluso desde el miembro no representante. La unidad visible contiene ambos IDs conjuntos; el contrato de fases conserva sólo un representante físico. |
| Proyección global | `buildAssistedProblem` conserva `analyticalParticipantMeals` y produce `collectiveCoreProjection` cuando hay fases/conjunta nativas. `executeAssistedPlanning` reúne comidas visibles/analíticas sin alterar el input y filtra lo autorizado para la propuesta. Supporting permanece efímero. |
| Geometría y matching | Main/Vocal utiliza `exactMainAndFeederCore`, arquitectura, geometría, matching feeder/residual y el ledger existente. No se añaden seeds, prioridades ni alternativas. El probe genérico standalone usa el mismo completion exacto. |
| Unidad conjunta y fases | `technicalChains.ts` permuta dentro de cada fase; `canPlaceJointGroup`/`scheduleJointGroup` materializan todos los peers al mismo cursor y avanzan una sola duración. `jointTasks.ts` permite deduplicación únicamente para peers auténticos sincronizados; terceros conservan la competencia por espacio/recursos. |
| Future Feasibility | `exactItinerantPlan` reutiliza `probeParticipantMealFutureFeasibility` y `assessParticipantMealFutureFeasibility`. La factibilidad individual no reemplaza el witness colectivo de todas las comidas. |
| Witness y certificado | `nominalPhysicalFutureWitness` conserva todas las tareas y canales de ocupación. La rama de fases de `certifyDailyTechnicalChain` valida exactamente ese objeto con `validatePlan`; `consumed=0`. No ejecuta el explorer ni redescubre una solución. |
| Propuesta y Draft | `AssistedProposalService` ejecuta el gate global de comidas y el certificado, construye `proposedDraftSnapshot` sólo para el scope y deja supporting pendiente. Aplicar/validar conservan fingerprints, revisión, base y contexto protegido. |
| Revalidación | `assertNominalProposalWitness` autentica identidad, requisitos materiales, asignación, hash, Draft y todos los canales del witness persistido. `AssistedPlanningService::assertNominalDraftWitness` lo consume al validar/aceptar. |
| SQL | `assert_daily_technical_chain_snapshot` delega al witness global existente. 120 autentica conjunta y deduplicación física; 124 resuelve recursos efectivos de unidades fijas; 126 conserva peers conjuntos frente a terceros/ámbitos; 128 consume las comidas sin pausa ficticia. Las RPC de clean validation/accept y triggers conservan autenticidad, CAS, fuente, Stage y protección. No contienen otra búsqueda. **El guard actual impide llegar a este consumidor con la nueva intersección; su autenticidad combinada no está demostrada.** |
| Continuación | La sesión reconstruye posiciones/ocupaciones aceptadas desde el snapshot como contexto fijo. Los probes preservan literalmente las ocho obligaciones de la unidad; las certificaciones SQL de G03b/U02d sólo acreditan sus configuraciones previas. |

## Qué demuestra el probe

El perfil genérico reutiliza la geometría conocida de U01a: tres participantes, preparación/cierre, competidora, tres fases y una conjunta. Sólo en memoria se sustituye el modo de comida por tres obligaciones flexibles de 15 minutos, ventana 11:00–12:00, capacidad 1; se retira la pausa operacional de aquella topología. Son 18 obligaciones, 15 productivas. El scope de un peer propone ocho obligaciones, el de la competidora una; ambos conservan un witness global de 15+3 en 84 ramas y certificado sin búsqueda. Doce alteraciones materiales son inválidas; la continuación preserva S1 en memoria.

La jornada nueva reproduce la base lógica de G03b: 19 comidas, 19 Vocal, 19 Main, tres Reality de fase A; añade dos Alfombra con EVA, las dos obligaciones de la conjunta y C16 individual. Se guardan por controles nativos los siete representantes de fases 3/2/2. La conjunta sigue sin autoridad guardada; no se solicita propuesta después de ese HARD.

Sobre ese input real, el contrafactual de conjunta y ventana de EVA demuestra la viabilidad física de las 65 obligaciones. La variante que conserva la ventana nativa sin configurar permite a EVA trabajar antes de las 16:00. Esa diferencia prueba que el campo ausente afecta materialmente al contrato, aunque ambos problemas sean válidos para sus respectivas entradas. No convierte el witness del input incompleto en cumplimiento de Fuente 06.

## Primera pérdida adicional y decisión de parada

- `resources-list.tsx` permite identidad/activación/componentes del catálogo, pero no escribe `defaultAvailabilityStart/End`.
- `day-resources-workspace.tsx` permite disponibilidad booleana y asignaciones; no escribe `availabilityStart/End`.
- Los endpoints existentes y `resourceAvailabilityWindow.ts` sí representan la pareja horaria y el builder/adapter la consumen. La pérdida está en el productor nativo, antes de geometría o matching.
- Chromium verifica cero controles horarios en ambas superficies y SQL confirma EVA `null/null`. La Fuente 06 exige el comienzo efectivo a las 16:00 en las cinco operaciones con EVA de esta unidad.

No se amplía otro editor/capacidad A2 dentro de este PR. No se mantienen cambios de admisión, SQL 129, presupuestos, matching, prioridades ni podas sin el Stage auténtico exigido.

**Siguiente delta verificable:** cerrar la autoría nativa de la ventana efectiva de un recurso ya soportada por modelo/API, conservando snapshot, revisión/CAS y protección; demostrar la ventana de EVA desde UI sin mutaciones laterales. Después repetir este mismo probe y certificar la mínima admisión TypeScript/SQL de la intersección hasta S1/S2, usando los consumidores existentes. La prueba falsable es que el input nativo contenga la ventana, el witness respete sus cinco ocupaciones y SQL acepte ese mismo witness sin búsqueda. No hace falta otro scheduler o solver.
