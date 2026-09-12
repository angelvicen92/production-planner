# A3-ORCH-REAL-010 — overrides de transición por recurso

Base exacta: `43cec7935abe23edac9c149b3d9f4c89ab936edf`. Se ejecutó el Full A2 canónico con 5.000 ramas y diagnóstico causal ON, incluido su replay OFF. El JSON canónico grande se restauró antes del commit; este documento conserva el delta relevante.

## Corrección de representación

`PlanResourceItemInput.transitionMinutes` es ahora un override opcional, entero finito y no negativo. El preflight rechaza fail-closed `NaN`, infinitos, negativos y decimales. El adapter conserva explícitamente `0` mediante `??` y sólo usa `plannerNext.resourceTransitionMinutes` cuando el override está ausente. La proyección participa en los fingerprints canónicos, es invariante al orden de `planResourceItems` y no muta el input.

Full A2 declara `cam-1: 0`; los demás recursos continúan heredando los 5 minutos globales. Esto corrige la duración hard sin hacer deseables los movimientos: duración y cardinalidad son dimensiones independientes. No se añadió scoring ni se cambió ordering. Las dos rutas explícitas Caracola→Estudio 7 de coach conservan 30 minutos hard y `coachRouteTransitions` no fue modificado.

## Ejecución Full A2 5k

- Estado: `BRANCH_BUDGET_EXHAUSTED`; 5.000 ramas (`CORE=1.599`, `STANDALONE=3.401`), agotamiento en `STANDALONE`.
- Frontier standalone más profundo: **124** tareas, fingerprint `688ecc2639caefe6762554d320a1fee95408cbe9d465ce799ee11c1843f8add5`.
- Diagnóstico ON/OFF: `exactMatch=true`, incluyendo status, ramas, profundidades, fingerprints y fase de agotamiento. Ambos alcanzaron core depth 19 y standalone depth 124.
- Hard: preflight y adapter `SUPPORTED`; no apareció prune/rechazo hard nuevo atribuible a la configuración. Como el presupuesto se agotó sin plan completo, no se afirma validación hard de una solución publicada.
- Blocker crítico: se mantiene `task:10256` con 102 de 159 rechazos en depth 19 (64,2 %); siguen `10243` (18), `10229` (15), `10147` (9), `10218` (9) y `10131` (6). No hay desplazamiento del cuello crítico respecto de A3-009.

No hizo falta 10k: 5k verifica la proyección nueva, la neutralidad diagnóstica y el cambio del estado operativo solicitado.

## Planning drawing delta

El conteo usa la misma definición de A3-009: bloque es una subsecuencia cronológica maximal en un mismo estado; un hueco sin estado intermedio no divide el bloque.

| estructura | A3-009 | A3-010 5k | delta |
|---|---:|---:|---:|
| frontier standalone | 123 | **124** | +1 |
| CAM1 bloques / cambios / reentradas | 17 / 16 / 15 | **30 / 29 / 28** | +13 / +13 / +13 |
| CAM2 bloques / cambios / reentradas | 3 / 2 / 1 | **3 / 2 / 1** | sin cambio |
| coach Lucía | 2 / 1 / 0; ruta 30 min | **2 / 1 / 0; ruta 30 min** | sin cambio |
| coach José María | 2 / 1 / 0; ruta 30 min | **2 / 1 / 0; ruta 30 min** | sin cambio |

CAM1 programa 51 tareas entre 575 y 1105. Su secuencia empieza `Pasillo 575–585 → Recursos 585–600 → Pasillo 600–605` y después alterna hasta completar 30 bloques (15 Pasillo y 15 Recursos). La transición temporal cero permite contactos inmediatos entre estados, pero —correctamente— no introduce ninguna preferencia que minimice sus 29 movimientos. El deterioro geométrico frente a A3-009 es por tanto esperado bajo el ordering actual y confirma por qué no debe confundirse tiempo hard de transición con compactación soft.

CAM2 conserva `Croma 570–685 → Estrellas/Sillón 690–785 → Croma 990–1080`; las familias Estrellas y Sillón permanecen en una banda cada una con su preparación configurada. Los coaches conservan la geometría y las rutas hard descritas por A3-009, porque el override genérico de recursos no altera la autoridad específica `coachRouteTransitions`.

## Primera ruptura evitable

La primera reentrada observable de CAM1 continúa siendo `task:10167@600–605`, tras `Pasillo 575–585 → Recursos 585–600`; por tanto **no cambia la primera `AVOIDABLE_SPLIT` identificada en A3-009**. Sí cambia el estado anterior (Recursos queda ahora contiguo 585–600 al eliminar el margen artificial), así que cualquier ranking futuro deberá reevaluar sus alternativas contemporáneas con transición efectiva cero. Esta iteración no implementa ni simula compactness ordering.

## Conclusión

La representación operativa queda corregida aunque el dibujo parcial sea menos compacto: frontier 124, CAM1 30/29/28, CAM2 3/2/1, coaches estables y mismo blocker crítico. El siguiente cambio puede implementar el ranking de compactación sobre este estado correcto, manteniendo los movimientos de CAM1 como preferencia a minimizar y no como transición temporal ficticia.
