# A3-ORCH-REAL-003 — amplitud canónica de SETUP_GROUP

Base: `a966ccdcfaa2592a5da8b5f9a9a79acc7849d375`. Se ejecutó el runner canónico Full A2 con diagnóstico causal activo dos veces a 5.000 ramas y una vez a 10.000. Los dos JSON de 5k fueron byte-idénticos. El JSON canónico grande fue restaurado y no se versiona.

## Cambio aislado

`exactSetupBlocks` conserva el dominio hard, el matching canónico, las reparaciones, el orden compacto antes que gapped y la contabilidad de `ledger.consume`. Cambia únicamente el orden lazy dentro de cada clase geométrica:

1. matching canónico de todos los starts compactos;
2. reparaciones de todos los starts compactos;
3. matching canónico de todos los starts gapped;
4. reparaciones de todos los starts gapped.

Con presupuesto amplio, el probe focal enumera exactamente las mismas 30 asignaciones válidas de dos tareas que la frontera completa, tanto con input original como invertido. Las reparaciones siguen siendo alcanzables y `branchesExplored` coincide con `standaloneBranches`.

## Resultado causal

| presupuesto | status | profundidad máxima standalone | ramas SETUP_GROUP | starts SETUP_GROUP | candidatos setup | reparaciones setup |
|---:|---|---:|---:|---:|---:|---:|
| 5.000 | `BRANCH_BUDGET_EXHAUSTED` | 121 | 122 | 31 | 56 | 0 |
| 10.000 | `BRANCH_BUDGET_EXHAUSTED` | 121 | 122 | 31 | 56 | 0 |

El primer candidato que abre descendencia estructural es la geometría compacta `690–785`, orden Estrellas→Sillón y `matchingRepairIndex=0`. SETUP_GROUP usa 122 ramas hasta ese punto; después la búsqueda selecciona macros posteriores y alcanza frontier 121. En la base, SETUP_GROUP consumía 3.049 ramas, entregaba 3.045 candidatos —3.043 reparaciones— y quedaba en frontier 31.

La ejecución a 5k mantiene la partición global de 1.599 ramas CORE y 3.401 STANDALONE, agota exactamente 5.000 y conserva la invariancia ON/OFF que verifica el propio runner. La de 10k agota exactamente 10.000 (1.599 CORE y 8.401 STANDALONE), con la misma profundidad 121: ampliar presupuesto no produce progreso estructural adicional. Por tanto, el cambio elimina el agotamiento prematuro por reparaciones del primer start y desplaza el cuello; no certifica solución completa.
