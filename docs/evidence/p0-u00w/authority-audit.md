# Gate causal previo al delta

Base exacta y ambas referencias remotas: `25aaa056970e86f0fd13e90570fa1fcf5582a97c`, merge #1200, migración 117. Los 24 workflows del head integrado de #1200 están aprobados. El checkout inicial era U00u; se recuperó la base correcta antes de editar. No se modifican 001–117 ni el histórico 088. U00v remite al inventario A2 de U00u: la ruta `p0-u00v/a2-ui-inventory.md` indicada en el encargo no existe en esa base.

Autoridades consultadas: AGENTS, Protocolo Maestro 07 v2.3 §4.4, Fuentes 00 v2.15, 01 v5.4 (identidades, recursos y snapshots), 02 v2.2 (restricciones y configuración), 03 v3.8 (geometría, alimentación, matching, variantes y SPEC-08), 04 v2.9 (autoridad efectiva/replay, Stage y operaciones ancladas), 05 v2.8 (gates), 06 v2.10 §8.1–8.1.1 y ambos PDFs originales. Los PDFs se leen como evidencia; sus horarios/asignaciones no se entregan al constructor. Se contrastan Master Adecuación, catálogo de capacidades y Evidence U00l/n/s/t/u/v.

## Experimento anterior a implementación

`diagnostic/before.json.gz` conserva fuentes creadas por API y Chromium en PostgreSQL 17, GoTrue y PostgREST locales. Sólo plataforma y roles Auth se preparan por SQL. No se suministran placements, locks ni soluciones; las ventanas son contratos de disponibilidad. Configuración EXACT_CONSTRUCTIVE original: 10.000 ramas, 50 backtracks, 20 patterns y bestK 3.

| Caso | Resultado | Ramas |
|---|---|---:|
| Una operación, A fijo, externa de 60 min consumiendo cámara/sonido A | Scope incompleto, sin agotar presupuesto | 20 |
| Mismo día y contratos, B fijo | 5/5, HARD válido y unidad B común | 19 |
| Mismo día, dominio A/B | Falso completo: 5/5 y HARD válido, pero **ningún segmento tiene unidad elegida** | 19 |
| Tres operaciones, cinco Main y una externa | Cuatro de las ocho asignaciones completas son factibles; otras cuatro no completan | 89–403 |
| Mismo segundo día, tres dominios A/B | Falso completo: 17/17, sin selección de ninguna unidad | 88 |

El segundo día tiene IDs, catálogos y participantes propios. Dos Main ordinarios permiten intercalar las tres operaciones; exigir tres anchors consecutivos con continuidad Main y sólo dos equipos produciría un caso físicamente imposible y no probaría elección.

La API rechaza dominios y múltiples declaraciones con HTTP 400 del parser **antes del solver**. Esto es contrato no representable. Los resultados de dominio anteriores son exclusivamente intervenciones en memoria y nunca se aplican a Draft/Stage.

## Camino material y primera pérdida

1. `buildEngineInput` conserva snapshots, recursos, relaciones y revisión diaria auténticos. `withDailyAnchoredAccompaniments` produce las identidades y ámbitos de cada tripleta; el experimento usa copias y sólo sustituye requisito fijo por dominio explícito común.
2. Preflight/adapter reconocen las referencias y disponibilidades reales; el kit directo común permite que el contrato anclado pase la comprobación de recursos continuos. Esto no materializa cámara/sonido de A ni B.
3. El resolver cierra before/anchor/after y Vocal por identidad/prerrequisitos. `buildAssistedProblem` conserva alcance visible y supporting separados.
4. `exactMainAndFeederCore.residualMatching` enumera `nominalResourceVariants(task)`: ésta sólo conoce alternativas de **un recurso**, no `allowedItinerantUnitIds`. Es la primera pérdida constructiva: llega al materializador una única tarea sin elección de unidad.
5. `materializeAnchoredOperation` toma los segmentos originales de `problem.tasks`. Elegir sólo el anchor no propagaría la unidad a sus segmentos.
6. El matching utiliza `nominalOperationEdgeKey`, que identifica variantes por `selectedResourceId`; dos elecciones de equipo quedarían bajo la misma clave. La reparación no puede distinguirlas correctamente sin extender esa identidad existente.
7. El validador compara `undefined` esperado con `undefined` materializado y no exige elegir una unidad pendiente. El bloque anclado compara recursos originales, por lo que añadir una selección física legítima requiere validar contra su materialización autorizada.
8. La proyección colectiva y el witness físico existentes se activan por elección nominal de recurso. Un dominio de unidades ancladas necesita el mismo recorrido y ledger, manteniendo las operaciones pendientes como witness completo y sin placements visibles.

No hay evidencia de que subir presupuestos o reordenar horarios resuelva estas pérdidas. No se clasifican como poda física, protección legítima ni presupuesto agotado.

## Contrafactual del consumidor, íntegramente en memoria

`memory-probe.ts` ejecuta el mismo código mediante esbuild `write:false`; `memory-delta.ts` transforma exclusivamente generación/materialización, clave existente, validación y activación de la proyección colectiva. No escribe archivos de producto ni horarios en DB. `diagnostic/memory-after.json.gz` conserva literalmente los cinco cuerpos transformados y hashes antes/después.

Resultado automático: primer día 5/5 con B, HARD válido, 27 ramas. Segundo día 17/17, una unidad común por operación, HARD válido, 135 ramas. La propuesta parcial de la primera operación conserva un witness de 17 tareas y deja las otras operaciones sin placement en la propuesta. Se repite cada búsqueda y se comparan propuesta y fingerprint.

**Decisión:** reparación localizada del mecanismo de variantes existente, seguida de productor nativo versionado y validación SQL incremental. No se necesita otro scheduler, reescritura Main/feeder ni heurística. La ampliación del productor por sí sola sería incorrecta. Los resultados en memoria no certifican todavía UI → Stage ni cierran P0.

El control U00u literal, repetido aisladamente sobre la base exacta, llega a sus dos jornadas y tres Stages. El primer intento carecía de Playwright; el siguiente agotó el límite original esperando la carga de UI. Se conservan ambos como fallos de preparación/ejecución, sin convertirlos en PASS ni ampliar timeouts.

## Pérdidas incrementales y certificación del delta

- La ventana estrecha de unidad no entraba en los eventos de geometría existentes. El contrafactual `diagnostic/unit-window.json.gz` conserva el primer no-proposal y la intervención que añade el límite inferior de la disponibilidad (unidad y miembros) desplazado por el segmento anterior. Se reutiliza el generador de eventos; no hay rejilla ni nueva heurística.
- La continuación materializada llevaba una unidad común autorizada, pero el preflight seguía comparándola con la unidad nominal inexistente del dominio. `diagnostic/continuation.json.gz` conserva el rechazo y la continuación de 13 tareas con cuatro protegidas después de la corrección en memoria.
- El test rojo `diagnostic/edge-key-red.txt.gz` prueba que anchor solo y tripleta completa deben tener la misma clave de variante. La clave registra la decisión del root; `edge-identity.json.gz` conserva dos búsquedas del mismo input nativo y presupuesto, sin diferencia de resultado/trabajo. No se atribuye mejora de rendimiento a esta corrección de identidad.
- La primera integración activó proyección conjunta por multiplicidad de anclajes; el A2 histórico agotó el límite original. La corrección es adopción nativa **v2 explícita**, nunca adoptar reglas nuevas por contenido de una jornada antigua. Dos ejecuciones finales recuperan literalmente 266/266, 11 Stages, 27.049 ramas y el fingerprint exigido.
- El caso nativo reforzado sitúa segmentos virtuales en el mismo Main y añade un recurso fijo auténtico a ese Main. El constructor/validador pasa; el primer rechazo SQL `ANCHORED_PHYSICAL_SPACE_CONFLICT` estaba en el helper que asumía ocupación física de cualquier peer. El nuevo helper 118 consulta `blocksSpace` de la revisión auténtica. 116 y el camino v1 no se tocan. El recibo rojo se conserva y las propuestas posteriores llegan a Stage.
- La comparación SQL de consumo combina recursos explícitos y coach implícito, evitando que un mismo recurso físico se duplique entre canales. Comidas operativas/transformadas y combinaciones estructurales no se certifican por los nuevos días con pausa global; el límite se declara en README y no se confunde con imposibilidad física.

El gate nativo final, su repetición, reconstrucciones frías, ataques coherentes de hashes y rehearsal 117→118 están indexados en README y validation.json. Fallos de preparación (Chromium no seleccionado o caché Vite de archives) no son resultados del solver; se aíslan caches por archive y se usa el navegador instalado, sin incrementar timeouts. Un primer ataque de capacidad compartida cambiaba sólo la primera operación, ya asignada a A: era un no-op y su aceptación en una transacción revertida no demostraba una vulnerabilidad. El ataque corregido cambia las tres a A y se rechaza por conflicto físico, con los mismos positivos intactos.
