# Matriz transversal P0 antes/después del diagnóstico

Estados productivos permanecen iguales: este PR no abre guards. Nueva evidencia física/SQL se separa de admisión y UI. Las celdas no ampliadas conservan la [matriz U02b](../p0-u02b/composition-matrix.md).

| Cruce | Antes | Evidencia U02c | Estado productivo después |
| --- | --- | --- | --- |
| Main/Vocal × fases REQUIRED × unidades fijas × conjunta × pausa | PRODUCTIVE_COMPOSED U02b | Control SQL/UI nuevo, originales conservados | PRODUCTIVE_COMPOSED acotado |
| Anclajes × ámbitos independientes | PRODUCTIVE_COMPOSED U00x | Control SQL/UI nuevo | PRODUCTIVE_COMPOSED acotado |
| Las dos familias anteriores, completas | UNSUPPORTED_EXPLICIT; física conjunta NOT_TESTED | Autoría 422 en ambos órdenes; 27 tareas reales y contrafactual con witness | UNSUPPORTED_EXPLICIT; Stage integrado NOT_TESTED |
| Composición física en memoria | NOT_TESTED para U02c | Misma identidad/ventanas/presupuesto: original 27/27 y continuación; AB→AC SEARCH_EXHAUSTED y witness condicionado físico; verificador independiente | Solución física demostrada en memoria; no se etiqueta PRODUCTIVE |
| Ámbito independiente × conjunta, comparación SQL | No certificada | Bucle `assert_task_scope_snapshot` sin equivalencia de peers; probe read-only | CONSUMER_DEFECT posterior que debe adaptarse antes de abrir admisión |
| Pausa × anclajes | Excluida además de fases/conjunta | Guard TS/SQL identificado y conservación física en witness | UNSUPPORTED_EXPLICIT |
| Recursos directos × miembros × OPERATION_ONLY | U00x y U02b en sus contratos | Standalone AC+B directo excluye kit fijo de ubicación; A compite con AB | Física preservada en memoria; SQL integrado pendiente |
| Anclaje o macro parcial × futuro global | Productivo por separado | 1→26 y 4→23 en memoria, conservación de protegidos/supporting | Stage/continuación conjunta SQL NOT_TESTED |
| Alternativas any/A/B, transición positiva con macro | Excluidas/no certificadas | No se amplían | UNSUPPORTED_EXPLICIT / NOT_TESTED según contrato U02b |
| Rondas/setup/transporte/comidas individuales/rutas coach/requiresBand × conjunto | No certificadas | No se amplían | Misma frontera U02b; no inferir soporte por tipos existentes |

| Superficie | Puede representar ahora | Frontera |
| --- | --- | --- |
| UI verificada | Main/Vocal, perfil, día, participantes, coach, anclaje fijo y ámbito independiente cuando la otra familia no está declarada | Editores bloqueados por combinación, sin vía UI para guardar el conjunto |
| API nativa | Las 27 filas y cada subconjunto estructural | No admite todas las autoridades en la misma revisión |
| EngineInput real | Autoridades del subconjunto persistido | Builder revalida guards; columnas manuales no serían solución |
| Copia exclusivamente en memoria | Cinco autoridades y 27 obligaciones | No persiste configuración, Draft ni Stage |
| SQL | Familias por separado y protección existentes | Admisión más consumidor de ocupaciones de scope y revisión de todas las autoridades |

Siguiente delta: [una composición nativa hasta SQL](next-delta.md). No se propone una heurística a partir de un guard conservador.

AB→AC: SEARCH_EXHAUSTED posterior al guard, con alternativa física condicionada demostrada. No se eleva esa topología a éxito original ni se atribuye una poda incorrecta al consumidor. Véase [prueba focal](search-exhaustion.md).
