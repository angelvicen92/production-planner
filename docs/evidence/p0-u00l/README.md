# P0-U00l — elección física nominal de Main hasta Stage

**Implementado y gates locales PASS.** Base autorizada `main @ 4eca413065d3832bce8ccbbf005b8829beaed5e7`. Un Main ordinario del perfil Main/Vocal, EXACT_CONSTRUCTIVE, admite un grupo `anyOf` quantity=1 o un `byType[typeId]=1`. La búsqueda elige B, conserva su identidad hasta DB y permite continuar alrededor del Stage aceptado. El estado de CI corresponde al head vivo del PR; esta Evidence no lo sustituye. Sin merge, despliegue, demo publicada ni Supabase productivo.

## Causa y delta

Se conserva X/Y/Z/W/M de U00k. La admisión ausente, el coach mezclado con los fijos físicos y la construcción sin variante impedían expresar una jornada que sí tenía solución con B. `resolveNominalResourceRequirements`, ambos preflights y la proyección existente admiten exclusivamente Main ordinario. `projectedTaskResources` publica sus independientes físicos sin duplicar el coach; `coachId`, disponibilidad, transiciones, assignments explícitos y locks siguen siendo autoridades. La codec de snapshot conserva una asignación explícita del coach y la reconstruye por su canal.

El core residual materializa cada variante antes de construir la operación. Los bundles conservan sus alternativas dentro de la misma arista task↔spot; se reutiliza el matcher bipartito, sin otro scheduler. Singleton significa una posición distinta, aunque contenga dos variantes. Los rechazos físicos distinguen la selección y la reparación vuelve al mismo spot. La continuación conserva la elección del core al rematerializar el pipeline; reconstruirlo desde Main sin selección volvía a introducir A.

Se mantienen arquitectura anónima, capacidad necessary-only, geometría, matching por bundles, supporting y materialización conforme a Fuente 03/SPEC-07 v2.2. Sin aumentos de los límites de ramas, backtracks, patterns, memoria o timeouts. Vocal nominal, varios grupos/tipos, combinación byType/anyOf, cantidades distintas de 1, coaches seleccionables, auxiliares compartidos, composiciones y estructuras no autorizadas siguen cerrados.

## Gate causal de identidad y recuperación

[run.ts](run.ts) reproduce tres estados en fuentes Git descartables, sin servicios ni cambios en el checkout:

1. Tras admitir Main y separar el canal, se generan A y B para el mismo task/spot usando todavía el almacenamiento anterior. El tap neutral observa que `Map.set` sobrescribe A con B. Una reserva HARD de B deja A viable y el grafo ya no puede recuperarla. Se conserva el [delta previo a identidad](pre-identity-delta.patch.gz).
2. Con las variantes coexistiendo, una ablación cambia **sólo** la clave del rechazo a `task@spot`. La obligación crítica A rechaza A; la reparación mueve el Main y termina INFEASIBLE, 132 ramas. No es agotamiento.
3. Con identidad física en el rechazo, la misma construcción completa 11/11, 140 ramas. A y B se generan en ambos spots; A se rechaza por `OVERLAP_REQUIRED_RESOURCE`. Residual y continuación de bundles recuperan B para `task:4`, spot 1, **09:50–10:00**, sin cambiar esa posición. El matching reparado conserva las asignaciones de task↔spot. Inventario permutado produce el mismo plan y ledger.

Los recibos íntegros y manifests están en [causal.json.gz](causal.json.gz); los tests productivos están en `mainNominalResourceChoice.spec.ts`. La identidad del matcher genérico no se modifica. La ablación demuestra por qué el rechazo de una variante no puede excluir el spot completo.

[gate1.json.gz](gate1.json.gz) conserva los cuatro inputs y resultados del caso U00k, sin assignments nominales ni horarios precargados. Cambia únicamente `task:4.resourceRequirements`:

| Contrato Main | Resultado | Ramas |
|---|---|---:|
| byItem(B) | COMPLETE 11/11, HARD/REQUIRED válidas | 36 |
| byItem(A) | INFEASIBLE por conflicto físico | 117 |
| anyOf(A,B)=1 | COMPLETE 11/11, Main B / crítica A | 140 |
| byType(2)=1 | COMPLETE 11/11, Main B / crítica A | 140 |

Presupuesto original: 10.000 ramas / 50 backtracks / 20 patterns / bestK 3. Las consultas de selección añadidas consumen el ledger existente. La propuesta parcial sólo-Main contiene una obligación y su testigo físico conjunto las once; el futuro permanece efímero.

## Jornadas nativas y persistencia

PostgreSQL 17, Auth/GoTrue, PostgREST, API y Chromium reales, en loopback y stacks descartables. Configuración, días, plantillas, participantes, recursos y tareas por API; generación, aplicación al Draft, validación y aceptación desde navegador. Ningún placement se aporta al constructor.

- **A: 11/11, S1 aceptado.** Dos pipelines, IN/preparación/OUT y crítica A. Main nominal usa B mientras la crítica ocupa A. Se conserva transporte agrupado auténtico.
- **B: 6/6, S1→S2 aceptados.** Otra topología, Main por tipo y kit independiente. S1 acepta sólo Main 1 y Vocal 1, con B+kit. Main 2 conserva `startPlanned=null` y `assignedResourceIds=[]`; su elección futura sólo existe en el testigo. S2 conserva exactamente lo aceptado y elige una cámara diaria ad hoc, `resource_item_id=NULL`, para Main 2.
- Propuesta, Draft, validación, Stage, filas diarias, reconstrucción del adapter, replay de petición y replay frío se conservan completos. Los tres replays fríos coinciden en fingerprint, accounting y testigo físico. Todas las tareas siguen **pending** y no se crean locks artificiales.

[Native receipts](native/receipts.json.gz) es un mapa nombre de archivo → JSON original. [Manifest](native-manifest.json), [replay frío](cold-replay.json) y tres capturas `native/*-accepted.png` identifican las ejecuciones finales con Node 20.20.2 y dependencias exactas del lockfile.

## SQL e integridad

La migración **112 incremental** reemplaza la misma función privada invoker. No cambia 108–111, triggers, RPC públicas, privilegios ni RLS. Contrasta tipo, dominio y selección única con inventario diario; conserva independientes y coach auténtico, disponibilidad, ocupación, transiciones dirigidas, dependencias, ventanas, scope, protección y CAS/revisión. Un certificado anónimo/estructural no reemplaza el testigo físico completo.

Dos pérdidas de integridad se caracterizaron durante la ampliación:

- El guard de Standalone rechazaba un paquete IN legítimo por ocupación de espacio. 112 permite únicamente paquetes con plantilla diaria auténtica, igual intervalo, cardinalidad HARD y separación del snapshot de transporte. No comparte recursos físicos exclusivos.
- Un negativo con ventana Main amplia falsificó Main/OUT, recalculó hashes y obtuvo validación SQL aunque el validador canónico daba `BLOCK_VIOLATION`. La transacción se revirtió y **no se aceptó Stage**. 112 contrasta espacio, continuidad y bloques con la policy Main persistida; sólo una comida operacional Main auténtica puede justificar una interrupción. La repetición rechaza exactamente `MAIN_FLOW_CONTINUITY`. [Rojo](sql-main-gap-red.json.gz) y [verde](sql-main-gap-green.json.gz), reproducibles con [main-gap-probe.py](main-gap-probe.py).

El testigo revalida además `blockKey` y la semántica de `blocksSpace` contra el modelo canónico. Dos falsificaciones antes aceptadas quedan documentadas en `main-metadata-red.tap.gz`; ambas se rechazan en el recibo verde.

**90 negativos SQL nuevos**, con hashes recalculados y rollback: 89 de las jornadas principales más el hueco Main controlado. Incluyen selección ausente/doble/inexistente/de otro tipo, dominio, fijo omitido, recurso indisponible/ocupado, coach ausente/cambiado/ocupado/indisponible y transición, ventanas/dependencias, futuro incompleto o alterado, scope, Stage protegido, CAS/revisión y permisos. [Detalle](sql-summary.json).

**Límite de cobertura explícito:** seis intentos de lock físico/coach se rechazan por la FK histórica `locks_locked_resource_id_fkey`, antes de la RPC; se identifican aparte, no como pruebas del guard nominal. No se fabrican filas de `resources` para hacerlos pasar. Los locks diarios compatibles de coach y el lock físico A incompatible se verifican en EngineInput con las autoridades existentes. Esta unidad no migra el namespace histórico de locks.

## Regresión final y A2

TypeScript de aplicación, harness y probes, build, secuencia de migraciones y ledger SQL nativo completos: PASS. **3.225/3.225 tests PASS**, con las mismas dos exclusiones históricas de CI. Los intentos iniciales con dependencias instaladas distintas del lockfile se corrigieron con `npm ci`; no se cambió ningún manifest o lockfile.

Nueve familias nativas previas pasan: Main/Vocal, Standalone, itinerantes, setup, transporte, comidas, byItem, U00i anyOf y U00j byType. Veinte comparaciones exactas conservan problemas, Stages, fingerprints y ledgers contra U00j; Main conserva además los dos U00a congelados, 4/4 y 9/9. Setup se reproduce sobre las mismas identidades congeladas; transporte conserva replay frío y protección. Las seis etapas nominales históricas se revalidan también con el guard de testigo final. Los manifests distinguen el primer candidato de búsqueda `b07ed76` y el endurecimiento posterior de integridad Main; las familias afectadas se repiten sobre el código final.

A2 aislado desde S0: base, candidato, repetición y código final conservan **266/266, 11 Stages, 27.049 ramas y 22 certificados revalidados**. Informes completos, certificados y snapshots coinciden con U00j, excluyendo únicamente `durationMs` de iteraciones. Fingerprint final:

`2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`

[a2/](a2/) conserva fuentes por hash, refs, runtime, informes y auditoría. No se atribuye mejora a los tiempos de este host. La etiqueta fija histórica del verificador se conserva como `verifierOriginalBaseLabel`; la base real es la autorizada 4eca413.

## Reproducción

Requiere Node 20, dependencias del lockfile y, para lo nativo, Docker y Chromium como los runners integrados. Destinos nuevos:

```sh
node --import tsx docs/evidence/p0-u00l/run.ts work/u00l-causal-fresh
node --import tsx script/validation/runU00lFunctional.ts work/u00l-native-fresh
node --import tsx script/validation/replayU00iFrozen.ts work/u00l-native-fresh/native work/u00l-cold.json
python3 docs/evidence/p0-u00l/main-gap-probe.py work/u00l-gap-fresh
python3 docs/evidence/p0-u00l/main-gap-probe.py work/u00l-gap-before --ref b07ed76 --expect accepted
python3 docs/evidence/p0-u00l/verify.py
```

`verify.py --extract <directorio>` expone los recibos comprimidos. Las regresiones reutilizan los runners anteriores, con comandos y provenance conservados en `regressions/execution.json.gz`. A2 usa `STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts` sobre archivos Git independientes y `config-u06c/verify.ts`; no hay seeds humanos.

Los archivos de demo, package/lockfile y migraciones 108–111 conservan sus bytes. No se declara resuelto P0 general ni se habilitan otros roles o capacidades.
