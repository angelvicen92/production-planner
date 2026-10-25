# P0-U00r — continuación inferida con prefijo protegido

Base: `eb3facfb6a935ee4d7daf84770e9b6a20ae91b2d` (#1195). Un delta de **identidad de componente técnico a través de proyección de scope y separación pending/fixed**. Cuatro archivos productivos: reconocimiento/materialización exacta, explorador técnico, proyección Assisted y su contrato interno. Sin configuración, migraciones, API/UI, políticas artificiales, nuevos exploradores ni presupuestos. Sin merge ni despliegue.

**Gate literal A/B/C demostrado:** A acepta T1+T2 → T3 → independiente; B acepta una **propuesta real de sólo T1** → T2+T3 → independiente. Seis `accept_stage` por base, dos jornadas 4/4. B conserva esperas físicas de 20 y 5 minutos. No se usa un bootstrap preplanificado ni un recorte manual de la propuesta para obtener el prefijo final.

## Antes y después

[Before](checks/before.json.gz) y [after](checks/after.json.gz) ejecutan exactamente los inputs U00q y sus prefijos sobre la base y el candidato. Las cuatro ejecuciones originales rechazan antes de búsqueda; todas las del candidato proponen el sufijo con protección intacta.

| Geometría / prefijo | Base | Candidato: ramas / placements nuevos |
| --- | --- | --- |
| A / T1 | UNSUPPORTED, 0 ramas | 9 / T2+T3 |
| A / T1+T2 | UNSUPPORTED, 0 ramas | 2 / T3 |
| B / T1 | UNSUPPORTED, 0 ramas | 17 / T2+T3 |
| B / T1+T2 | UNSUPPORTED, 0 ramas | 2 / T3 |

`pendingTechnicalChains` conserva el reconocimiento anterior sobre pending, incluidas cadenas anteriores a una sucesora fija. Añade sólo sufijos íntegros de un componente inferido del grafo efectivo cuyo prefijo está fijo. Un miembro usa `RESOURCE_TASK`; varios usan `TECHNICAL_CHAIN`. `orderedTechnicalChainMembers(tasks, placed)` reconoce una raíz residual cuyas dependencias externas están materializadas. Dominios y `canPlaceTask` mantienen la autoridad física/temporal.

Para producir el prefijo de una tarea pedido por B, `buildAssistedProblem` conserva **sólo el ID de la raíz inferida** cuando sus sucesoras válidas quedan fuera del scope. `PlannerNextProblem.inferredTechnicalChainRootIds` es contexto derivado, no configuración, policy ni copia de un grafo. Se calcula con los reconocedores existentes antes de filtrar tareas, excluye políticas explícitas y topologías branching/ciclo y sólo permanece si el scope contiene la raíz sin sucesoras. No añade tareas futuras a búsqueda ni hace REQUIRED su factibilidad. La técnica realmente aislada no recibe esa identidad y sigue UNSUPPORTED.

## Jornadas reales

Mismas geometrías U00q, catálogos/días nuevos creados mediante Chromium/API en PostgreSQL 17, GoTrue y PostgREST. Ninguna política, revisión o snapshot se inyecta. La journey sólo hace SELECT para observar persistencia; las escrituras SQL del harness compartido son arranque descartable, migraciones literales y roles Auth.

| Jornada / Stage | Decisiones aceptadas | Primera base |
| --- | --- | --- |
| A S1 | T1 09:00–09:15 + T2 09:15–09:35; otras pendientes | Stage 2 |
| A S2 | añade T3 09:35–09:45, prefijo literal | Stage 3 |
| A S3 | independiente 09:45–10:05; 4/4 | Stage 4 |
| B S1 | propuesta/aceptación sólo T1 10:00–10:20 | Stage 6 |
| B S2 | añade T2 10:40–10:55 + T3 11:00–11:25 | Stage 7 |
| B S3 | independiente 11:30–11:45; 4/4 | Stage 8 |

Todos los requisitos byItem conservan el ID del equipo físico diario; las decisiones aceptadas conservan snapshots completos y `assigned_resource_ids`. La espera no crea un hold. Las propuestas se repiten antes de aplicar; se guardan request, scope, propuestas, contadores, fingerprints, Draft, validación, Stage completo y filas persistidas. Rollback S0 + tres redos recupera literalmente S3 en ambos días.

Tras completar cada jornada, un Draft humano negativo se valida y una edición de ventana diaria por API invalida esa prueba: aceptar devuelve `STALE_VALIDATION`, sin alterar S3. Ese Draft negativo nunca se acepta.

[Recibos](native/receipts.json.gz) · [Repetición](native/repeat-receipts.json.gz) · [Comparación](native/comparison.json) · [A S2](native/A-S2.png) · [B S1](native/B-S1.png) · [B S2](native/B-S2.png). Dos bases vacías, IDs distintos, 88 JSON por base y mismos hashes de producto/harness. Placements y contadores normalizados por identidad son iguales; cada fingerprint exacto se revalida y difiere entre bases por los IDs distintos.

## Negativos y límites

Tests focales/replays nativos conservan: técnica realmente aislada; referencia ausente; ciclo; branching; cortes interiores no soportados; miembro/identidad nominal alterados; contexto protegido incompatible; recurso/ventana sin dominio físico; stale Draft/base/validación; snapshot con tiempo inválido; intento de escribir equipo por el endpoint de Draft. Un dominio físico vacío no se etiqueta UNSUPPORTED/BUDGET/TIME_LIMIT; las referencias/topologías inválidas no consumen ramas. Una sucesora físicamente inviable no se promueve a REQUIRED para impedir planificar la raíz ordinaria.

El campo de recursos prohibido devuelve un **500 de esquema existente**, con `unrecognized_keys` y Draft intacto; no se declara HTTP 400 ni se cambia API. El seam aislado de validación manual rematerializa byItem desde fuente y no rechaza por sí solo sustituir en el snapshot un ID por otro conocido. El replay registra esa frontera: cambia el hash; la API no permite esa escritura. Ese seam no autentica por sí solo un snapshot/Stage arbitrario. Se mantienen los controles productivos de propuesta, fingerprint, protección y persistencia.

Durante el gate se intentó recortar manualmente una propuesta completa a T1: el flujo manual existente lo rechaza. [Recibo histórico descartable](checks/literal-b-blocker.json.gz). `literal-b.spec.ts` prueba que la fuente original ahora produce directamente T1 mediante propuesta real y que el recorte manual sigue rechazado. No se cambió ese flujo para hacer pasar el gate.

Fuera de soporte: técnica realmente aislada sin unidad física, branching, ciclos, referencias ausentes y cortes inferidos no representables. Sin ampliar fases/órdenes parciales, alternativas nominales de técnicas, mezclas con rondas/setup/joint ni nuevas políticas diarias. REQUIRED explícito no se degrada a inferido.

## Regresión y reproducción

**252 tests en 16 archivos**, incluidos 15 focales nuevos; 6 replays REQUIRED de U00q, 20 replays nativos y 2 replays de la frontera histórica manual. Los explícitos comparan placements, ramas y fingerprints; sólo se excluyen los siete campos CPU enumerados previamente por U00q. Invertir colecciones conserva decisiones/contadores y el orden semántico de dependencias. TypeScript de producto/diagnóstico, build y secuencia de migraciones pasan.

A2 candidato/repetición: **266/266, 11 Stages, 27.049 ramas, 22 certificados revalidados**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. Informe completo salvo `durationMs`, snapshots y certificados coinciden con baseline; [comparación](a2/comparison.json). No aumentan budgets/timeouts.

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00r/run.ts /tmp/u00r-new
U00R_REPEAT=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00r/run.ts /tmp/u00r-repeat
python3 docs/evidence/p0-u00r/pack.py /tmp/u00r-new /tmp/u00r-public
U00R_RECEIPTS=/tmp/u00r-public/receipts.json.gz node --import tsx docs/evidence/p0-u00r/replay.spec.ts
node --import tsx docs/evidence/p0-u00r/explicit-regression.spec.ts
node --import tsx docs/evidence/p0-u00r/literal-b.spec.ts
node --import tsx docs/evidence/p0-u00n/a2.ts /tmp/u00r-a2
npx --no-install tsc -p docs/evidence/p0-u00r/tsconfig.json
python3 docs/evidence/p0-u00r/verify.py
```

El dispatch de journey sólo cambia en un archivo descartable. JWT/passwords/logs privados no se empaquetan. [Autoridades](authorities.json), [call path](causal-path.md), [validación](validation.json). [CI del PR](https://github.com/angelvicen92/production-planner/pull/1196/checks) es el estado vivo autoritativo; los recibos de CI identifican el commit observado y la descripción del PR recoge el resultado final.
