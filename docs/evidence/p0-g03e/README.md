# OptiPlan — P0-G03e

Base autorizada `8d97d4c6f30fb13a97fe673845755422f50cb3c1`. Único [PR #1223](https://github.com/angelvicen92/production-planner/pull/1223). Sin merge, despliegue ni migraciones de Supabase remoto.

La composición **conjunta auténtica + fases REQUIRED + comidas individuales flexibles** llega desde controles nativos a propuesta, Draft, validación y S1/S2 PostgreSQL. Dos bases frías independientes producen **ocho Stages nuevos**, con inputs, configuración efectiva, scopes, decisiones, witnesses, certificados, ramas, fingerprints y snapshots SQL iguales. El motor y las migraciones 001–129 permanecen literales.

| Jornada nueva por base fría | Obligaciones | Comidas futuras certificadas en S1 | Placements S1 → S2 | Ramas S1 / S2 |
|---|---:|---:|---:|---:|
| Reality C + EVA → Alfombra | 65 | 19 | 8 → 65 | 2.884 / 843 |
| Inspecciones genéricas y competidora | 18 | 5 | 4 → 18 | 64 / 53 |

[Verificación A](verification-a.json), [B](verification-b.json), [determinismo](determinism.json) y [vinculación de fuentes](source-binding.json). `native/` y `repeat/` contienen recibos públicos comprimidos, hashes y capturas; excluyen credenciales y logs privados.

## Causa y cambio mínimo

[Gate causal antes/después](causal-gate.md), [matriz de composición](composition-matrix.md) e [inventario del diff](productive-diff.md). G03d ya guardaba EVA 16:00–21:00 y las tres fases, pero los dos predicados de admisión TS/SQL rechazaban la conjunta con comida flexible. El probe pequeño se repitió primero sobre la base: 15 productivas + 3 comidas, 84 ramas y certificado sin búsqueda adicional. El macroprobe conservó la ventana diaria auténtica: 46 + 19, ocho obligaciones/siete operaciones físicas y 2.884 ramas, todavía sin Stage.

El candidato reutiliza `dailyTechnicalChains`, `dailyJointGroups`, los editores, cierre de peers, scheduler, Future Feasibility, witness global, certificado, writer v5, CAS y protección existentes. **130 sólo modifica los dos cuerpos de admisión SQL**; no añade tablas, columnas, funciones, triggers, permisos o búsquedas. Los lectores de contratos conservan la comparación literal de la versión instalada.

La autoría admitida es **fases → conjunta**. Sin fases, una conjunta flexible permanece cerrada; tampoco pueden retirarse sus fases mientras siga declarada. El editor explica ese orden y crea una identidad determinista a partir de los miembros, conservando identidades ya guardadas. La nueva intersección con anclajes, ámbitos especiales, pausas físicas adicionales o rutas queda fuera de esta unidad.

## Recorrido productivo

Todas las altas y autoridades positivas de las dos jornadas proceden de Chromium: catálogos, plantillas, días, participantes, recursos, tareas, ventana diaria, fases y conjunta. No se inyectan posiciones. El primer Stage se solicita, aplica, valida y acepta en UI; S2 utiliza los mismos endpoints auténticos. Antes de S1, una propuesta desde el otro peer se genera y descarta mediante el producto: ambas resuelven la unidad completa y producen exactamente el mismo witness, propuesta y fingerprint.

La macro mantiene 19 participantes y comidas Sodexo de 40 minutos, Main/Vocal, recursos efectivos, Unidad C fija, tres fases 3/2/2 y una única ocupación C06+C10. La cadena conserva ocho IDs de obligación y siete representantes físicos. EVA interviene cinco veces, siempre dentro de **16:00–21:00**, consumida desde el snapshot diario. Cambiar su catálogo después de crear el día no modifica ese snapshot. El editor diario recorre override, jornada completa y restauración antes de planificar; CAS, permisos y protección se prueban sobre esa misma jornada.

El genérico usa cinco participantes propios, cuatro parejas Main/Vocal, sensor con ventana explícita, duraciones de fase 10/15/20, tres fases, una conjunta y una auxiliar competidora con participante propio sin otras tareas productivas. Cinco comidas de 40 minutos conservan capacidad simultánea 2. Su recurso diario se guarda por UI con override 09:30–15:30.

En S1 sólo se aceptan las ocho/cuatro obligaciones de la unidad. Las 19/5 comidas permanecen pendientes, aunque todas aparecen en el witness global. El certificado consume **cero ramas adicionales**. S2 completa 65/18 obligaciones y conserva literalmente cada placement de S1. Los recibos `*-run`, `*-draft`, `*-validated`, `*-sql`, `*-cold-sql` y `*-final-input` vinculan propuesta, Draft y SQL; la lectura fría utiliza otra conexión PostgreSQL. Rollback/redo recupera S2 sin alterar Stages históricos.

## Negativos y protección

[Resumen y errores reales](negative-summary.json): **200 ataques SQL** sobre witness, scope y protección en las dos bases, con transacciones revertidas y hashes recalculados cuando corresponden. Se distinguen de los ataques adicionales a aceptación, permisos, fuentes y configuración.

| Caso | Consumidor / resultado observado |
|---|---|
| Peer omitido, duplicado, desplazado, con duración, espacio, recursos o unidad distintos | TS y consumidor SQL del witness: identidad material, sincronización o dominio inválidos |
| Competidora externa solapada | `ANCHORED_WITNESS_RESOURCE_CONFLICT`, sin conflicto personal que sustituya la prueba del recurso |
| Miembro del scope perdido | `RUN_RESULT_INVALID`; en S2 se retira una obligación realmente pendiente |
| Hueco o ruptura de fases | Continuidad/competencia física en S1; protección de decisiones cuando el ataque toca S1 durante S2 |
| Comida omitida, duplicada, fuera de ventana, duración o capacidad incorrectas | Consumidor global de comidas; capacidad rechazada por `OPERATIONAL_PARTICIPANT_CAPACITY` |
| Última realización colectiva perdida con dominios individuales no vacíos | Test ejecutable del consumidor existente: rechazo sin agotamiento y contrafactual temprano factible |
| EVA anterior a su ventana diaria | `ANCHORED_WITNESS_RESOURCE_AVAILABILITY` |
| Witness distinto del Draft | `ANCHORED_SELECTION_SNAPSHOT_MISMATCH` |
| Revisión stale, fuente alterada, hash inválido o permisos indebidos | Rechazos separados de revisión, fuentes y autenticidad; no se cuentan como invalidez física |
| Alterar Stage, decisión protegida o autoridad sin writer | ACL/trigger inmutable, protección del prefijo y guard de operación versionada |

Los ataques a aceptación ejercitan CAS, base, source token y Draft mediante la RPC real. Se intenta modificar el Stage como `service_role` y como `postgres`, con fingerprint recalculado. También se rechaza una edición estructural físicamente compatible cuando afecta decisiones protegidas. Un rechazo de admisión al retirar las fases se identifica como tal.

## Baselines, migración y límites

- [G03d](g03d-comparison.json): mismo witness físico, IDs, tiempos, recursos, unidades y comidas; sólo cambia la identidad de conjunta, ahora auténtica y guardada. S1 conserva sus 2.884 ramas. La diferencia de recurso no usado se documenta explícitamente.
- [G03b](control-g03b-comparison.json): **60/60 y 15/15**, cuatro Stages frescos, mismos problemas, propuestas, certificados, ramas y SQL; sólo se excluyen tiempos de ejecución.
- [G02](control-g02-comparison.json): dos topologías y **cuatro Stages**, decisiones/fingerprints/rutas literales.
- [G01](control-g01-comparison.json) y [U02d](control-u02d-comparison.json): verificadores físicos y comparación literal de inputs, decisiones, contadores, certificados, Draft y Stages; conservan la frontera de agotamiento anterior.
- [A2 histórico importado](a2/comparison.json): **266/266, 11 Stages, 27.049 ramas**, snapshots e informe exactos salvo duración; 11 certificados revalidados.
- [Upgrade 129→130](upgrade/upgrade130.json): **599 tareas y 11 Stages históricos**, filas, lectores, RLS, owner, ACL, invoker y `search_path` preservados. Se aplica únicamente en PostgreSQL descartable.

El determinismo excluye únicamente los siete contadores de tiempo registrados y los autores/fechas de creación de autoridades en las dos identidades Auth independientes. No se normalizan diferencias físicas, IDs de tareas, fingerprints o decisiones. Los controles de CI se conservan con commit, run, artefacto y digest propios; el código productivo se vincula por hashes.

El manifiesto oficial conserva exactamente su fallo preexistente de tres nombres/versiones ausentes; no se modifica. [Intentos y fallos de harness](attempts.json) separa errores de navegador, postprocesado, reconexión y configuraciones fuera del contrato de resultados productivos.

La primera frontera hacia las **266 obligaciones nativas** continúa en las demás autoridades: A/B con transición positiva, alternativas de unidad, rondas/preparaciones, transporte, setups y composiciones adicionales. Una técnica independiente fuera de fases en Main/Vocal sigue devolviendo `UNSUPPORTED_STANDALONE_TASK_KIND` antes de buscar; no se abre en este PR. El A2 importado permanece como regresión separada. No se declara P0 general cerrado.

Reproducción: `node --import tsx docs/evidence/p0-g03e/run.ts work/g03e-a`, repetir en otro directorio fresco, y ejecutar `verify.py` y `compare.py`. Requiere Docker local y Chromium real. El harness utiliza el build local de producción; no despliega. La CI vigente está en los [checks del único PR](https://github.com/angelvicen92/production-planner/pull/1223/checks).
