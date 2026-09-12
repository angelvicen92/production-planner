# A3-ORCH-REAL-011 — resource continuity ordering

Base exacta: `b08a3a981393cddccb74ac2fa07b13f58443ba40`. Baseline y candidato se ejecutaron sobre el Full A2 canónico con 5.000 ramas, diagnóstico causal ON y replay OFF. El JSON canónico grande se restauró antes del commit; esta Evidence conserva el delta relevante.

## Implementación y contrato

Los starts hard-valid de cada `RESOURCE_TASK` conservan primero el ranking de Future Feasibility (`minimumWitnesses`, después `totalWitnesses`) y sólo a igualdad comparan el delta físico incremental de todos sus recursos requeridos: reentradas, cambios y bloques. El estado es el `spaceId` real; la secuencia ignora huecos temporales sin un estado intermedio. La suma por IDs de recurso únicos y ordenados es determinista y conservadora para candidatos multi-recurso. Un recurso cuya secuencia sólo contiene un espacio aporta cero.

La duración de transición no participa en esta señal: CAM1 conserva `transitionMinutes=0` y aun así prefiere menos movimientos. El ranking no elimina starts ni convierte compactación en restricción hard; el índice canónico anterior sigue siendo el último desempate. No cambiaron selección de macro, domains, meals, transport, capacity, matching, backtracking, ledger ni budgets.

## Gate Full A2

| medida | baseline obligatorio 5k | candidato 5k | repetición 5k |
|---|---:|---:|---:|
| estado | `BRANCH_BUDGET_EXHAUSTED` | igual | igual |
| ramas CORE / STANDALONE | 1.599 / 3.401 | 1.599 / 3.401 | idéntico byte a byte |
| frontier standalone | **124** | **124** | **124** |
| fingerprint de frontier CORE | `02c0ac…09821aa` | igual | igual |
| CAM1 bloques / cambios / reentradas | **30 / 29 / 28** | **16 / 15 / 14** | **16 / 15 / 14** |
| CAM2 | **3 / 2 / 1** | **3 / 2 / 1** | igual |
| cada coach | **2 / 1 / 0** | **2 / 1 / 0** | igual |

El candidato reduce catorce bloques, cambios y reentradas de CAM1: mejora real frente a 30/29/28 y mejora también A3-008 (17/16/15), aunque aún queda lejos del humano 3/2/1 y del ideal 2/1/0. No fue necesario usar el 10k para recuperar frontier; se ejecutó una vez como comprobación adicional y mantuvo frontier 124 (CORE 1.599, STANDALONE 8.401).

La protección de comidas no retrocede: en 5k los prunes operacionales siguen en 9, los prunes de comida de participantes en 0 y el ranking sigue dando prioridad absoluta a ambos conteos de witnesses. Los checks cambian por visitation (operacionales 1.885→2.049; participantes 699→762), no por relajación de autoridad. El blocker CORE tampoco cambia: `task:10256` conserva 102/159 rechazos a depth 19, seguido por `10243` (18), `10229` (15), `10147` (9), `10218` (9) y `10131` (6).

## Planning drawing delta

CAM1 completo por bandas en el frontier 124:

`Pasillo 575–585 → Recursos 585–645 → Pasillo 645–650 → Recursos 650–780 → Pasillo 780–785 → Recursos 785–985 → Pasillo 985–990 → Recursos 990–1005 → Pasillo 1005–1055 → Recursos 1055–1065 → Pasillo 1065–1070 → Recursos 1070–1080 → Pasillo 1080–1090 → Recursos 1090–1095 → Pasillo 1095–1100 → Recursos 1100–1105`.

- **CAM1:** 16 / 15 / 14.
- **CAM2:** `Croma 570–685 → Estrellas/Sillón 690–785 → Croma 990–1080`, 3 / 2 / 1.
- **Estrellas / Sillón:** una banda de familia cada una; preparación intermedia preservada.
- **Coaches:** Lucía y José María conservan 2 / 1 / 0 cada uno y su ruta hard de 30 minutos.
- **Estudio 7:** el frontier CORE y su fingerprint no cambian; no se altera main flow.
- **Comidas:** mismas autoridades y mismos 9 prunes operacionales; cero branches de participante declaradas inviables.
- **Frontier:** 124; mismo fingerprint estructural y mismo blocker `task:10256`.

`task:10167` deja de causar la primera ruptura: pasa de `600–605` a la banda Pasillo `1010–1015`. La primera reentrada física restante pasa a ser `task:10182@645–650` (Recursos→Pasillo después de haber abandonado Pasillo). No se etiqueta automáticamente como `AVOIDABLE_SPLIT`: el ordering ya escoge la alternativa compacta cuando los witnesses empatan, de modo que certificar evitabilidad requeriría un probe causal contemporáneo que demuestre igualdad de Future Feasibility. Es el primer corte restante a diagnosticar, no evidencia de que el ranking haya ignorado un empate.

## Conclusión

El cambio cumple la unidad causal: mejora materialmente CAM1 sin perder frontier, comidas ni las geometrías estables de CAM2/setup/coaches. El plan sigue parcial por presupuesto y no se afirma publicación ni hard-validity terminal. No se hizo merge.
