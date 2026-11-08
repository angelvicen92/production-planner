# Gate causal integral G04b — diagnóstico, sin implementación

## Estado recibido y comparación con G04a

Base `349dea6`; las autoridades productivas permanecen idénticas. G04a tenía 103 obligaciones y propuesta/Stages SQL. G04b incorpora 38 obligaciones y las dependencias canónicas de apertura/cierre, conservando sus 103 anteriores. Es un cambio real de problema, no evidencia por sí solo de regresión. La auditoría histórica de Estilismo no se utiliza como explicación de este resultado.

S0, revisión 4, 141 pendientes, cero locks/horarios humanos/placements protegidos, Draft sin modificar. Ventanas: 09:00–21:00; C01 hasta 15:30, demás hasta 19:00; Sodexo 13:00–16:30, 40 minutos. Vestuario exclusivo único, entrada 10 y salida 5, sin continuidad/comida de espacio. Referencias individuales en `inventory.json` y todas las autoridades en los recibos nativos.

| Paso requerido | Call path / autoridad | Observación real |
|---|---|---|
| 1. Estado, revisiones, locks | `buildEngineInput` → snapshots diarios → `applyNewDayPlannerConfiguration` → revisión SQL | 141 pendientes; R4; ninguna protección o lock |
| 2. Autoría, guard, preflight | controles UI → `dayConfigurationService` → `requiredPhaseCompositionSupported`/conjunta → adapter | Fases y conjunta guardadas; `SUPPORTED`; ningún rechazo anticipado |
| 3. Scope y prerrequisitos | `resolveAssistedScope` → `buildAssistedProblem` → `collectiveCoreProjection` | Peers 120/121 cierran 115–122; 14 supporting; proyección 122+19 |
| 4. Arquitectura Main/Vocal/Vestuario | `executeAssistedPlanning` → `executePlannerNext` → `runExactItinerantPlanSearch` → `runExactMainAndFeederSearch` | Un patrón de dos bloques; tres arquitecturas comprobadas; nunca hard-valid core |
| 5. Matching de entradas | productor de pipeline situado en `onHardValidCoreLeaf` | **No alcanzado nativamente**. 19 entradas conservadas, sin asignación ni congelación nominal; contrafactuales sí prueban matching completo |
| 6. Fases y conjunta | autoridades diarias / `searchStandaloneForCoreCandidate` | Configuradas 3/2/2, siete representantes/ocho obligaciones; construcción no alcanzada |
| 7. Future Feasibility | bound `mainFutureLatestEnds`, reserva individual y forward check | Dos abstenciones del bound, 224 checks de prerrequisitos, 223 podas de salida C16; comidas individuales analíticas sin poda, cero certificados globales |
| 8. Materialización terminal | terminal prerequisites, comidas y transporte | No alcanzada; cero intentos de transporte terminal y cero cierres de salida |
| 9. Poda/backtracking/witness | dominio dinámico exacto → rechazo local → matching feeder | 10.000 = 9.931 CORE + 69 STANDALONE; 8.994 ramas de matching feeder; agotamiento, sin propuesta |
| 10. Draft y SQL | servicio de propuestas → aplicación → validación → acceptance | `NO_PROPOSAL`; S0 y Draft literales; writer/consumidor físico de Stage no alcanzados |

`hardValid=true`/cero nuevas violaciones en el resultado sin propuesta no certifica la jornada: no existe placement propuesto, `completeForScope=false`, `globalMealGate=BUDGET_EXHAUSTED` y comidas globales certificadas=0. Se usa como autoridad de éxito la cadena completa, no ese contador aislado.

## Primera pérdida atribuible

La primera arquitectura anotada es END=1140; los finales candidatos observados empiezan `[1140,1260,1135,925,…]`. Las dos primeras no producen una hoja completa. En END=1135 el matching asigna C16 Main `task:108` 1120–1135 (18:40–18:55). Su salida `task:138`, plantilla 30, comparte Vestuario 9 y depende de Sodexo `task:64`, Main 108 y Alfombra individual 122. Main→salida exige 5; la salida necesita 5 y la persona termina a 1140. Su dominio es vacío incluso antes de resolver OUT. `after=0` y `OUT.before=0` no anulan esta frontera previa.

`exactItinerantPlan.ts:onPartialCoreCandidate` aplica correctamente `standaloneForwardDynamicDomain`; registra 223 podas, todas atribuidas a 138. La atribución actual de backjump no obtiene una profundidad ancestral anterior; la búsqueda vuelve al matching de Vocal de la cohorte. El waterfall conserva 681 ramas a profundidad 0, 374 a 8 y 8.945 a 19. No hay colisión de autoridad ni rechazo feeder registrado que permita inventar una poda incorrecta.

La relajación backward existente en `mainFlowPatterns.ts:mainFutureLatestEnds` no reconoce las comidas en su mapa de tareas. Todas las salidas tienen una dependencia a una comida conocida por el contrato, pero ausente de ese mapa; `INCOMPLETE_AUTHORITY` deja el límite desconocido. Ésta es una **abstención conservadora**, no una prueba de inviabilidad ni un fallo del validador HARD. Se observa además que la proyección tiene cadenas físicas ejecutables y cero `analyticalFutureTechnicalChains`: la ruta `structuralBundles` condicionada por `hasFuture` no precede aquí al DFS ordinario. No se propone abrirla globalmente a partir de esta observación.

## Falsación X/Y/Z/W/M

Hipótesis estrecha ensayada:

- **X:** el run gasta su presupuesto en una geometría que no deja salida a C16.
- **Y:** el bound de sucesores se abstiene al tratar la referencia a Sodexo como autoridad ausente.
- **Z:** el forward check encuentra tarde el dominio vacío y vuelve a variantes feeder sin cambiar la geometría.
- **W offline:** reconocer únicamente los `sourceTaskId` de comidas ya presentes, manteniendo todos los demás guards, ventanas, márgenes y presupuesto.
- **M:** deben desaparecer las abstenciones por esa referencia, rechazarse la geometría tardía y obtenerse progreso hasta propuesta nativa.

La primera parte de M se observa: dos rechazos `FUTURE_DEPENDENCY_CAPACITY`, matching máximo 18/19 y cero abstenciones. La parte suficiente **se falsa**: agota de nuevo 10.000, ahora en END=950, con 94 podas de prerrequisito IN; no alcanza core/Stage. Se conserva el contrafactual en `offline/receipts.json.gz`. No se integra W como si cerrara G04b ni se encadena otro arreglo sin un nuevo contrafactual suficiente.

Para descartar inviabilidad se prueban dos geometrías derivadas, con el productor y matching ya existentes. La frontera terminal se obtiene restando salida, OUT y márgenes a disponibilidad, resultando final Main 1125; la de alimentación resulta de IN, margen, carga del primer coach y Main, final 955. No se toman horas del PDF. Ambas conservan 19 slots Main y toda la configuración original.

Con matching preparado, ambas completan 122+19. Se carga la preparación en el mismo ledger (102, o 204 al preparar también la semilla alternativa), manteniendo límite 10.000. El trabajo adicional de los probes de observación/validación no se presenta como coste del run nativo. Cada run condicionado se etiqueta `OFFLINE_ONLY` y no es una propuesta Assisted.

Los controles sin bundle no prueban esas geometrías: `preferredArchitecture` es relegada de nuevo por el reordenado histórico posterior y el primer intento efectivo sigue siendo END=1140. La Evidence lo registra; no se cuenta como contrafactual positivo de geometría aislada. La otra semilla cambia el matching inicial de task:100/102, pero la rematerialización del pipeline converge al mismo witness final. No se atribuye falsamente un resultado a ese intercambio inicial.

## Supporting, salida y SQL

En el run nativo no se materializa pipeline ni se alcanza `firstHardValidCoreLeaf`. `ephemeralSupportingPlacements=[]`, `acceptedSupportingPlacements=[]`, cero decisiones protegidas. **No hay prueba de congelación prematura de IN/entrada en esta ejecución.** Tampoco se construye Estilismo salida: no hay cierre temprano/tardío consumiendo oportunidades futuras. La primera barrera es anterior a ambas fases; las conclusiones históricas de calidad no se trasladan.

Los witnesses condicionados muestran Vestuario serial y 19 comidas válidas. Sus salidas se materializan como ordinarias, porque la frontera OUT está en transporte y no en dependencias nominales de OUT. El reconocedor de prerrequisitos terminales/colectivos explícitos conserva cero miembros. Eso distingue la configuración de otros baselines, sin cambiar su semántica HARD ni demostrar por sí solo un defecto. El replay firmado consume 141 vértices y valida contra el mismo problema.

No se fabrica metadata de propuesta ni se inserta un Stage sintético para ensayar el consumidor físico. SQL sí autentica las autoridades nativas de configuración y S0; aplicación, aceptación, continuación protegida y ataques físicos a Stage quedan **NOT_REACHED**. Por tanto no hay evidencia de discrepancia TS/SQL en G04b.

## Decisión y siguiente prueba mínima

**STOP implementación.** La primera pérdida y una posibilidad física están identificadas, pero no se ha demostrado W suficiente en el recorrido nativo. La siguiente unidad debe probar una sola reutilización de geometría/pipeline y propagación existente, de extremo a extremo, con el mismo problema y ledger; antes de integrarla, debe producir propuesta real y superar Draft, SQL y protección. Las alternativas condicionadas guardadas no autorizan fijar esas horas, identidades o matches en producto. No aumentar timeouts/budgets ni añadir otra familia A2.
