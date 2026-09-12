# A3-ORCH-REAL-008 — orden por libertad de comida operacional

Base exacta: `1b5291f1570fa84aaf15f470c19fc864a2dea711`. El baseline y los runs cambiados usan el runner Full A2 canónico con diagnóstico ON y replay OFF; el JSON canónico grande se restauró y no se versiona.

## Delta técnico

Sólo al recorrer los starts del macro ya seleccionado `RESOURCE_TASK`, cada placement hard-valid recibe una medida branch-free sobre las políticas de comida operacional REQUIRED cuyo scope toca: número mínimo de witnesses restantes y suma total. Se ordena lexicográficamente por ambos valores descendentes y, si empatan, por el índice canónico previo. Las políticas no afectadas no participan. El dominio dinámico, sus starts, `canPlaceTask`, las reservas y podas hard, y `ledger.consume` no cambian; ningún candidato se elimina.

## Gate causal 5k

| medida | baseline | cambio (run 1) | cambio (run 2) |
|---|---:|---:|---:|
| status | `BRANCH_BUDGET_EXHAUSTED` | igual | igual |
| ramas CORE / STANDALONE | 1.599 / 3.401 | igual | igual |
| deepest standalone frontier | 121 | **123** | **123** |
| siguiente unidad | `RESOURCE_TASK resource:task:10209` (22) | `ORDINARY ordinary:task:10090` (1) | igual |
| invariancia diagnóstico ON/OFF | `exactMatch=true` | `exactMatch=true` | `exactMatch=true` |

Los dos runs cambiados tienen frontier completo idéntico, la misma partición de ramas y el mismo estado terminal. Se cumple el gate estructural porque el frontier aumenta `121 → 123`; por contrato se ejecutó después 10k, no 20k/300k.

## Decisiones causales y libertad P14

- `task:10051`: baseline `960–965`, witnesses de `plato-14-operations` `7 → 1`; cambio `715–720`, `7 → 7`.
- `task:10114`: baseline `780–790`, witnesses `28 → 26`; cambio `995–1005`, preserva los 28 disponibles en su estado.

La recomposición no usa estos IDs como señal. Son observaciones posteriores del benchmark: el score sólo conoce scopes, intervalos libres, duración y grid canónicos.

## Timeline P14 / CAM1

El prefijo baseline de CAM1 estaba fragmentado en 29 bloques entre `575–1115`; P14-recursos contenía 32 tareas y dejaba como único witness largo `885–960`. Con el nuevo orden, CAM1 baja a 17 bloques, agrupados en dos bandas amplias (`575–800` y `935–1115`); P14-recursos queda igualmente agrupado en `590–765` y `935–1100`. En particular, `10051` pasa de `960–965` a `715–720` y `10114` de `780–790` a `995–1005`. Otros desplazamientos que explican la nueva geometría incluyen `10188: 965–975 → 690–700`, `10216: 810–820 → 745–755`, `10241: 820–830 → 755–765`, `10198: 1090–1095 → 940–945` y `10201: 975–985 → 1060–1070`.

## Run 10k y nuevo cuello

El run 10k vuelve a agotar exactamente 10.000 ramas (`CORE=1.599`, `STANDALONE=8.401`), conserva frontier 123 e invariancia ON/OFF (`exactMatch=true`). El nuevo blocker estructural es `ordinary:task:10090`: su único start dinámico `1115–1120` pasa la colocación y después falla `TRANSPORT_FUTURE_FEASIBILITY`; la salida pendiente `task:10093` queda con dominio de departure vacío (`demand=1`, capacidad hard máxima `0`). El padre causal serializado es `task:10003` a profundidad 122. Ampliar de 5k a 10k no supera este nuevo cuello.
