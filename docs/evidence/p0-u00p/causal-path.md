# Before / after causal

**X (U00o):** una jornada nueva puede aceptar Stage ordinario que incumple la sincronización humana pretendida. **Y:** no existe productor diario de pertenencia con IDs reales; 102/104 derivan rondas de 088 y 107/113 no conocen una transición estructural diaria. **Z:** no existe Stage sincronizado real desde producto.

**W:** autoridad diaria separada del perfil congelado, editor por miembros reales y operación versionada existente; una única resolución efectiva alimenta EngineInput y los guards SQL de revisión/replay/origen. **M observado:** dos días nuevos configuran por UI, recargan, producen propuestas y aceptan S1 sincronizados con preparaciones físicas, completan S2, restauran y continúan sin perder protección ni U00n. Véanse los recibos originales y el verificador.

No se ha reabierto el diagnóstico ni cambiado búsqueda. Durante su integración aparecieron dos diferencias concretas, instrumentadas antes de corregir:

1. La transición tras S0 devolvía `STALE_OBLIGATION_SOURCES`. La captura completa mostró sólo `assigned_resource_ids`: `[]` en el codec S0 frente a `null` en filas pendientes. Se normaliza exclusivamente esa equivalencia al comparar. La captura original comprimida está en `causal/S0-source-difference.json.gz`.
2. El guard de replay exclusivo rechazó `STALE_ROUND_STRUCTURE_REPLAY`: el helper general de edición añadía incidentalmente `mealWindow` también a una edición exclusivamente estructural. La candidata de rondas ahora parte del input efectivo intacto y cambia sólo rondas. No se relaja el guard.

3. Un escritor de tareas abierto en otra conexión bloqueó el guard de sources correctamente, pero el API devolvía 500. El recibo original `causal/source-concurrency-before.json` lo demuestra. Se clasifica ahora como `STALE_CONFIG_SOURCES`/409 y la UI explica el bloqueo; no se cambia el lock ni la atomicidad.

4. La primera CI encontró dos contratos de catálogo que todavía describían 113/104: cuerpos SQL aprobados y matriz de EXECUTE. Ahora el preflight extrae la última definición auténtica de 114, sin sobreescribir v5 con 104, y comprueba también los helpers nuevos. Se añaden sólo sus doce entradas de permisos y se auditan invoker/search_path/columna heredada. Se conserva la denegación de cuerpos o grants inesperados.
5. La CI de jornadas anteriores a S1 detectó `REBOOTSTRAP_TASK_CHANGED_OR_REMOVED`. La captura original `causal/S0-bootstrap-regression.json.gz` demuestra tres filas `assigned_resource_ids=null` que la proyección convertía en `[]`. El preview S0 vuelve a usar su captura literal (bootstrap o transición estructural explícita); la proyección de decisiones sigue reservada para los orígenes que la necesitan. El recorrido U00c y sus assertions no se modifican.

Un alias SQL `old` que colisionaba con OLD en el trigger se corrigió como error local. La suite de aislamiento exigió registrar los dos nuevos consumidores read-only del resolver; conserva todas sus assertions y sigue prohibiendo imports de producto desde el core. No se cambió ninguna assertion del solver ni un budget/timeout/branch limit.

La comparación nativa distingue sincronización **material** de presencia de JSON: cuatro placements persistidos, dos inicios/finales iguales por ordinal y dos ocupaciones de preparación; la independiente sigue pendiente en S1 y sólo se acepta en S2. La rama alternativa prueba además el witness futuro auténtico antes de materializar rondas.

El fallo histórico ASST-010 se clasifica separadamente del A2 canónico y de estos recorridos; sus logs/comparación en `checks/` describen lo realmente observado. El A2 canónico exige su propio recibo completo, sin aumentar límites.
