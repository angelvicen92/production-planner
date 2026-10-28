# Autoría y primer rechazo auténtico

`*-authoring.json` conserva cada payload, respuesta HTTP, resultado del helper SQL sin modificaciones y estados completos antes/después: columnas diarias, revisión/fingerprint/replay, sesión, Draft, S0 y configuración efectiva. Los PUT rechazados no añaden revisión ni dejan autoridad parcial.

| Orden | Autoridades persistidas por producto | Primer rechazo HTTP | SQL del mismo contrato |
| --- | --- | --- | --- |
| Fases/conjunta primero | conjunta, fases REQUIRED y pausa | Anclaje: 422 `UNSUPPORTED_ANCHORED_COMBINATION` | P0001, mismo mensaje |
| Anclaje/ámbito primero | anclaje fijo y ámbito independiente | Fases: 422 `UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION` | P0001, mismo mensaje |

En el primer orden, el ámbito independiente también devuelve 422 `UNSUPPORTED_TASK_SCOPE_COMBINATION`. En el segundo, conjunta y pausa mantienen sus exclusiones recíprocas. No se atribuye ninguno de estos rechazos a preflight, geometría o presupuesto: no han comenzado.

Chromium guarda el anclaje fijo y el ámbito independiente en el orden inverso. Un único anclaje fijo se crea como v1 por diseño del editor; un PUT nativo adopta explícitamente v2 con una identidad estable del experimento (`reality-operation`), conservando unidad fija, miembros y políticas. El recibo UI conserva también la identidad aleatoria anterior. La adopción de v2 evita confundir el contrato histórico v1 con el witness global extendido. Las capturas y `*-editors.json` registran botones, `disabled`, textos y valores recargados. En el orden directo, los editores de anclaje/ámbito anuncian combinación no soportada; en el inverso, los de fases/conjunta/pausa quedan bloqueados.

UI verificada aquí: Main/Vocal, perfil general, día, participantes/coaches/ventanas y guardado de anclaje/ámbito. Las fases, conjunta y pausa del nuevo perfil se guardan por API en el orden directo; U02b acredita sus editores y su control se vuelve a ejecutar. Catálogo de unidades, requisitos byItem, plantillas auxiliares/técnicas y tareas se preparan por rutas API reales. No se presenta esta ejecución como edición completa de todos esos campos en Chromium. Sigue faltando un editor genérico de requisitos de recursos, documentado por U02b.

Guards efectivos: `anchoredCombinationSupported`, `taskOperationScopesSupported`, `requiredPhaseCompositionSupported`, `jointCombinationSupported` y `operationalMealsCombinationSupported`. Sus predicates gobiernan autoría, reconstrucción y disponibilidad de editores. La pausa también excluye anclajes; no basta retirar sólo los tres guards de la hipótesis inicial.
