# P0-U00r — continuación inferida con prefijo protegido

Base: `eb3facfb6a935ee4d7daf84770e9b6a20ae91b2d` (#1195). Un delta causal productivo en dos archivos de motor; sin configuración, migraciones, API/UI, políticas artificiales, nuevos exploradores ni presupuestos. Sin merge ni despliegue.

**Corregido:** una cadena inferida válida se reconoce en el grafo efectivo completo, incluidos los vértices protegidos. Sólo un sufijo íntegro pendiente puede generar placements nuevos. Un miembro residual utiliza `RESOURCE_TASK`; varios miembros utilizan el explorador técnico existente con predecesores fijos. Dependencias ordinarias permiten esperas; no se convierten en REQUIRED.

**Gate literal pendiente:** el caso B pedido incluía aceptar primero una propuesta de sólo T1. El scope de una raíz sola sigue siendo UNSUPPORTED; recortar una propuesta completa mediante Draft tampoco pasa la validación manual existente. La Evidence nativa B demuestra la continuación T2+T3 desde **S0 auténtico con T1 preplanificada por API**, no una primera propuesta T1 aceptada con `accept_stage`. No se presenta ese bootstrap como cumplimiento literal de ese criterio. [Recibo nativo del recorte fallido](checks/literal-b-blocker.json.gz) y `literal-b.spec.ts` reproducen ambos límites. El PR debe permanecer en borrador hasta resolver o autorizar expresamente esta diferencia de gate. Se conserva el alcance causal del motor; no se amplía el flujo manual para conseguir verde.

## Antes y después

[Before](checks/before.json.gz) y [after](checks/after.json.gz) ejecutan exactamente los inputs U00q y sus prefijos sobre la base y el candidato. Las cuatro ejecuciones originales rechazan antes de búsqueda; todas las del candidato proponen el sufijo con protección intacta.

| Geometría / prefijo | Base | Candidato: ramas / placements nuevos |
| --- | --- | --- |
| A / T1 | UNSUPPORTED, 0 ramas | 9 / T2+T3 |
| A / T1+T2 | UNSUPPORTED, 0 ramas | 2 / T3 |
| B / T1 | UNSUPPORTED, 0 ramas | 17 / T2+T3 |
| B / T1+T2 | UNSUPPORTED, 0 ramas | 2 / T3 |

`pendingTechnicalChains` conserva el consumidor/proyección explícito anterior. Para inferencia usa `getTechnicalChains(problem.tasks, policies)`, exige que los excluidos sean un **prefijo fijo** y que el resto esté pendiente; no amplía a cortes interiores. Conserva el reconocimiento previo sobre pending, incluido trabajo pendiente antes de una sucesora fija. `orderedTechnicalChainMembers(tasks, placed)` reconoce como raíz residual al miembro cuyas dependencias externas están materializadas; `canPlaceTask` y los dominios conservan la autoridad temporal/física. No reprograma las antecesoras.

## Jornadas reales

Mismas geometrías U00q, catálogos y días nuevos creados mediante Chromium/API en PostgreSQL 17, GoTrue y PostgREST. Sin SQL operativo manual ni intervención en revisión/policy. Las únicas escrituras SQL del harness compartido son el arranque descartable, las migraciones literales y el alta de roles Auth; esta journey sólo hace SELECT para observar persistencia.

| Jornada / checkpoint | Estado aceptado | Identidad primera ejecución |
| --- | --- | --- |
| A S1 | T1 09:00–09:15 + T2 09:15–09:35; otras dos pendientes | Stage 2 |
| A S2 | añade T3 09:35–09:45; prefijo/snapshots/equipo literales | Stage 3 |
| A S3 | independiente 09:45–10:05; 4/4 | Stage 4 |
| B S0 | T1 10:00–10:20 preplanificada por API y capturada por bootstrap | Stage 5 |
| B S1 | propone/acepta T2 10:40–10:55 + T3 11:00–11:25 | Stage 6 |
| B S2 | independiente 11:30–11:45; 4/4 | Stage 7 |

B conserva **20 y 5 minutos de espera**, sin hold ni adyacencia artificial. El byItem de T1 procede del snapshot de plantilla diario; su asignación persistida inicial es vacía y se conserva literalmente. T2/T3 y la independiente consolidan el ID del equipo diario en `assigned_resource_ids`; el motor exige el mismo byItem físico también para T1. No se interpreta una lista persistida vacía como ausencia de ese requisito efectivo.

Cada propuesta se repite antes de aplicar; se guardan request, scope, propuesta, contadores, fingerprints, Draft, validación, Stage completo, filas persistidas y captura. Rollback S0 + todos los redos recupera literalmente el checkpoint final. Después se crea un Draft humano negativo, se valida y se cambia la ventana diaria mediante API: la aceptación con la validación anterior devuelve `STALE_VALIDATION`, sin alterar el último Stage completo. El Draft negativo no se acepta.

[Recibos](native/receipts.json.gz) · [Manifiesto](native/manifest.json.gz) · [A S2](native/A-S2.png) · [B S1](native/B-S1.png). La segunda base usa IDs diferentes mediante altas de relleno por API; sus recibos y comparación se registran en `native/`.

## Negativos y límites

Los tests focales y los replays nativos conservan: técnica realmente aislada; referencias ausentes; ciclos; branching; cortes interiores; miembro/identidad nominal alterados; contexto protegido incompatible; recurso/ventana sin dominio físico; stale Draft/base/validación; snapshot con tiempo inválido; intento de escribir recursos por el endpoint de Draft. El rechazo físico mantiene ausencia de UNSUPPORTED/BUDGET/TIME_LIMIT; las referencias/topologías inválidas no consumen ramas.

El campo de recursos prohibido devuelve un **500 de esquema existente**, con `unrecognized_keys`, y Draft intacto; no se declara HTTP 400 ni se cambia API para esta unidad. La función aislada de validación manual rematerializa byItem desde la fuente y **no rechaza por sí sola** sustituir en un snapshot el ID por otro ID conocido. El replay registra esa frontera: su hash cambia; la API no permite esa escritura. No se declara que ese seam autentique por sí solo snapshots/Stages arbitrarios. Los caminos de propuesta, fingerprint, protección y persistencia siguen vigentes.

Fuera de soporte: técnica aislada sin unidad física, branching, ciclos, referencias ausentes y cortes inferidos no representables. Sin ampliación a órdenes parciales, alternativas nominales de técnica, mezclas con rondas/setup/joint o nuevas políticas diarias. La raíz sola seleccionada y el recorte manual de una propuesta técnica completa permanecen como límites reproducidos.

## Regresión y reproducción

251 tests de 16 archivos (incluidos 14 nuevos), 6 replays fríos del contrato explícito REQUIRED de U00q, y 10 replays por bundle nativo. Los explícitos comparan placements, ramas y fingerprints; sólo los siete campos CPU ya enumerados por U00q se excluyen. La inversión de colecciones conserva todas las decisiones/contadores, manteniendo el orden semántico de dependencias. TypeScript producto/diagnóstico, build y secuencia de migraciones pasan.

A2 candidato/repetición: **266/266, 11 Stages, 27.049 ramas, 22 certificados revalidados**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. Informe completo salvo `durationMs`, snapshots y certificados coinciden con baseline; [comparación](a2/comparison.json). Sin aumentos de budgets/timeouts.

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00r/run.ts /tmp/u00r-new
U00R_REPEAT=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00r/run.ts /tmp/u00r-repeat
python3 docs/evidence/p0-u00r/pack.py /tmp/u00r-new /tmp/u00r-public
U00R_RECEIPTS=/tmp/u00r-public/receipts.json.gz node --import tsx docs/evidence/p0-u00r/replay.spec.ts
node --import tsx docs/evidence/p0-u00r/explicit-regression.spec.ts
node --import tsx docs/evidence/p0-u00n/a2.ts /tmp/u00r-a2
npx --no-install tsc -p docs/evidence/p0-u00r/tsconfig.json
python3 docs/evidence/p0-u00r/verify.py
```

El dispatch de journey sólo cambia en un archivo descartable; las autoridades productivas no se sustituyen. JWT/passwords/logs privados no se empaquetan. [Autoridades leídas](authorities.json), [call path y contratos](causal-path.md), [validación y límites de gate](validation.json). [CI del PR y head remoto](https://github.com/angelvicen92/production-planner/pull/1196/checks): estado vivo autoritativo. `checks/ci.json` es una observación histórica del commit de implementación; los commits posteriores sólo añaden Evidence y conservan sus hashes de producto/tests. El resultado final de CI también se recoge en la descripción del PR.
