# A3-ORCH-REAL-013 — reproducibilidad Full A2 y primera reentrada CAM1

Base obligatoria: `d13d5b5641e61bad8d6a7d38e00267c1ab549b9f`; tree `a887315e16c93d67f79a0483f860b8aeb8515a40`. El árbol estaba limpio antes del gate. Esta unidad no cambia comportamiento productivo: los tres runs iniciales se ejecutaron en procesos independientes sin instrumentación, cada JSON generado se copió fuera del repositorio y el artefacto canónico fue restaurado después de cada ejecución.

## Entorno fijado

| elemento | valor observado |
|---|---|
| Node | `v24.15.0` |
| npm | `11.4.2` |
| `tsx` local | `4.20.5` |
| dependencias raíz | `tsx@4.20.5`, `typescript@5.6.3` |
| SHA-256 `package.json` | `5d619dfadd99fa5c9f14cc1fea75297a7b165bd66e5168f217de0972b39c4b3b` |
| SHA-256 `package-lock.json` | `4984746b0b1aff2402d236cac64a039755f8cdcc44c923abfeae3b94eb2b3ff9` |
| `PLANNER_NEXT_*` heredadas | ninguna |
| HEAD/tree | `d13d5b5…` / `a887315…` |
| estado inicial | limpio |

## Gate limpio A/B/C

A y B usaron presupuesto 5.000 y `PLANNER_NEXT_FULL_A2_CAUSAL_DIAGNOSTIC=false`; C sólo cambió esa variable a `true`. La fuente fue el mismo HEAD/tree en los tres procesos y el adapter produjo el mismo problem fingerprint `4e967005475bbf30fb3bbd0129728a986aeb3e24540bdd681e2915a2c918f76a`. Los JSON completos de A y B fueron idénticos byte a byte (SHA-256 `fb0ad60670bca391d15154ab8ffe629cb833147fa9b0d22b370cfb494cbd5d62`). C contiene Evidence diagnóstica adicional (SHA-256 `46e65b85d3316cffaf20bc222126bcb64c139beead12fddaa319463c7462aa8b`), pero su `searchInvariance.exactMatch=true` y no cambia el recorrido observable.

| medida | RUN A | RUN B | RUN C |
|---|---:|---:|---:|
| status | `BRANCH_BUDGET_EXHAUSTED` | igual | igual |
| CORE / STANDALONE | 1.599 / 3.401 | igual | igual |
| core depth | 19 | 19 | 19 |
| standalone frontier | **124** | **124** | **124** |
| primera macro standalone | `RESOURCE_TASK:resource:task:10169` | igual | igual |
| Setup ramas / starts / candidatos / repairs | 122 / 31 / 56 / 0 | igual | igual |
| deepest frontier fingerprint | `02c0ac19e5838b663ac5b06beadf366dce50f73bfe7bd28bfda5ec75309821aa` | igual | igual |
| bloqueo en frontier | `task:10162`: `540` rechaza por transporte; `545` por dominio cero de `task:10018` | igual | igual |
| CAM1 bloques / cambios / reentradas | **16 / 15 / 14** | igual | igual |

**Clasificación inequívoca: `CURRENT_HEAD_STABLY_FRONTIER_124`.** A3-012 no describió una propiedad estable de este commit: su `frontier=0` fue contaminación de instrumentación o estado temporal del proceso/entorno de aquella ejecución, no un cambio Git ni un efecto del diagnóstico canónico. Los artefactos conservados por A3-012 no permiten distinguir retrospectivamente cuál de esas dos fuentes lo causó. El siguiente punto mínimo, sólo si se quisiera cerrar esa procedencia histórica, sería reproducir su parche temporal exacto y registrar proceso, variables, toolchain y orden de carga; no corresponde investigar Setup en el head actual.

## `task:10182`: elegido frente a alternativa compacta

Recuperado el gate, se añadió únicamente instrumentación temporal read-only y se restauró antes de persistir esta Evidence. En el estado contemporáneo de profundidad macro 71 (109 tareas standalone ya colocadas), `task:10182` afecta una sola política, `break:plato-14-operations`. Todos los candidatos relevantes comparados conservan exactamente el intervalo libre `780–990`, 28 starts representables, `minimumWitnesses=28` y `totalWitnesses=28`; no hay diferencia de comidas ni pérdida de duración REQUIRED.

| candidato | señal CAM1 incremental (bloques/cambios/reentradas) | witnesses min/total | resultado del caller |
|---|---:|---:|---|
| `540–545` (primera alternativa más compacta) | `0 / 0 / 0` | `28 / 28` | `DEAD_END`; alcanza profundidad 110 y falla `PENDING_ARRIVAL_DEADLINE` en `task:10180`, participante 213 |
| `545–550`, `550–555` | `0 / 0 / 0` | `28 / 28` | mismo blocker `task:10180` |
| `555–560` … `570–575` | `0 / 0 / 0` | `28 / 28` | `DEAD_END`; `PENDING_ARRIVAL_DEADLINE` en `task:10006`, participante 201 |
| `645–650` (rama observada) | `2 / 2 / 2` sumado sobre sus recursos; inaugura la primera reentrada física CAM1 | `28 / 28` | alcanza frontier 124 y finalmente agota presupuesto |

El ranking sí visita primero **todos los starts compactos `540..570/5`** porque empatan en witnesses y ganan por continuidad. No elige `645` por una política de comidas: llega a él después de demostrar que las alternativas compactas anteriores no tienen descendencia bajo las autoridades futuras. Los starts tardíos `1080..1110/5` (delta `1/1/1`) también terminan en `TRANSPORT_FUTURE_FEASIBILITY` de salida; `1115` termina en `COLLECTIVE_CAPACITY` de `space:3018`, blocker `task:10018`. El primer punto de rechazo de las alternativas compactas aparece 39 niveles después de `10182`, no en `canPlaceTask`, comidas, ranking ni compactación.

### Clasificación de la primera reentrada restante

**`NECESSARY_SPLIT_IN_OBSERVED_SEARCH_STATE`.** Existe una alternativa contemporánea más compacta y hard-valid, y empata exactamente en witnesses por política, mínimos/totales e intervalo REQUIRED. Sin embargo, el caller la recorre antes que `645` y su subárbol termina por la autoridad futura de llegada. Por ello la reentrada no es un empate ignorado (`AVOIDABLE_SPLIT`) ni una victoria causada por exceso de witnesses: es la primera rama menos compacta que conserva descendencia hasta el frontier dentro del recorrido exacto observado. Esto no convierte el split en constraint universal ni prueba completitud terminal del plan de 5k.

## Autoridades futuras y límites

Para `540`, el rechazo demostrado es `MACRO_PENDING_PREREQUISITE:PENDING_ARRIVAL_DEADLINE`, con `task:10180`/participante 213; para los compactos `555..570`, `task:10006`/participante 201. La rama `645` alcanza profundidad 124; su deepest blocker es transporte y el frontier final selecciona `task:10162`, cuyos dos starts fallan respectivamente transporte y dominio dinámico cero de `task:10018`. No se alteraron domains, matching, comidas, transporte, orden, ledger ni presupuesto para obtener estas observaciones.

## Estado de la Evidence anterior

- **A3-003 queda confirmada** en este head para la amplitud Setup: 122 ramas, 31 starts, 56 candidatos, 0 repairs antes del frontier útil.
- **A3-011 queda confirmada**: Full A2 5k reproduce frontier 124 y CAM1 `16/15/14`; el primer corte restante sigue siendo `task:10182@645–650`.
- **A3-012 queda invalidada como caracterización reproducible del HEAD/tree actual.** Se conserva como registro honesto de una ejecución contaminada; su atribución a enumeración Setup es provisional y no debe guiar una corrección productiva.
- La causalidad nueva reemplaza la clasificación `INCONCLUSIVE` de A3-012 sólo para la primera reentrada: `task:10182` es `NECESSARY_SPLIT_IN_OBSERVED_SEARCH_STATE`. Las trece reentradas restantes no se reclasifican en esta unidad.

## Conclusión

La contradicción de reproducibilidad se resuelve sin cambio productivo: el HEAD obligatorio es estable entre procesos, diagnóstico OFF/ON es neutral y la clase aplicable es **`CURRENT_HEAD_STABLY_FRONTIER_124`**. No existe motivo para investigar ni corregir `createExactSetupBlockExplorer` en este estado. La causa exacta de la primera reentrada CAM1 restante sí queda localizada: las alternativas compactas empatan en Future Feasibility de comidas y son visitadas primero, pero sus descendencias cierran por `PENDING_ARRIVAL_DEADLINE`; `645` es la primera opción que alcanza el frontier 124. No se hizo merge.
