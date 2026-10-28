# Matriz capacidad × capacidad

Clasificación acotada al perfil nominal STANDALONE_ONLY demostrado; no convierte la familia completa en general.

| Intersección | Antes U01c | Después U01d |
| --- | --- | --- |
| Fases REQUIRED × AB/AB/B,C × conjunta × pausa × tres competidoras | UNSUPPORTED_EXPLICIT en UI/schema/autoridad SQL; witness sólo en memoria | PRODUCTIVE_COMPOSED: 17/17, dos Stages con fases, repetidos en base fría |
| Conjunto común vacío × scope parcial × futuro global × continuación | MEMORY_WITNESS, ningún Stage de esa autoridad | PRODUCTIVE_COMPOSED: S1 sólo A, witness 17+pausa, S2 conserva S1 y completa 16 |
| Fases sin recurso universal × otra distribución y número de miembros/fases | NOT_TESTED | PRODUCTIVE_COMPOSED: 12/12, fases 2/3, AB→AC/B, conjunta después de sus prerrequisitos |
| Fases con A común × conjunta × pausa × competencia | PRODUCTIVE_COMPOSED U01b | PRODUCTIVE_COMPOSED: control 17/17 y regresión U01b separada |
| Liberación real de A × competencia en fase final | Contrafactual físico en memoria | PRODUCTIVE_COMPOSED en el perfil; el consumidor SQL admite la ocupación liberada y rechaza el hold común real. Probe revertido, no Stage añadido |
| Recurso común no vacío × todas las operaciones | Garantía universal existente | Misma garantía: lista falsa rechazada por servicio/SQL, consumo omitido rechazado materialmente |
| Fases mixtas × demanda A 55 / disponibilidad 40 | PHYSICALLY_INFEASIBLE en memoria; sin fases en producto | PHYSICALLY_INFEASIBLE con fases realmente guardadas, sin propuesta/Stage/exhaustion |
| Recursos efectivos × witness omitido/inventado × doble ocupación | Contrafactuales y controles anteriores | Rechazos SQL materiales, hashes recalculados y otros canales conservados |
| Fases × CAS/revisiones × Draft/protección × rollback/redo | PRODUCTIVE_COMPOSED con común | PRODUCTIVE_COMPOSED también con vacío, determinismo y Stage inmutable |
| Contrato lineal histórico sin fases | PRODUCTIVE_COMPOSED | Misma rama SQL y mínimo no vacío; regresión histórica separada |
| Fases × unidad itinerante, alternativas byType/anyOf, recomposición | UNSUPPORTED_EXPLICIT por guards previos | Sin cambio; no se extrapola el control itinerante en memoria de U01c |
| Fases × setup/rondas/transporte/anclajes/Main/Vocal/agenda compleja | UNSUPPORTED_EXPLICIT / NOT_TESTED según contrato previo | Sin ampliación ni nueva certificación |
| A2 completo creado desde UI | NOT_TESTED | NOT_TESTED. El importado 266/266 es sólo regresión |

La primera frontera pendiente es certificar composición de estas fases con autoridades itinerantes reales y sus demás ámbitos, hoy excluidas por el guard conservador existente. No se retira ese guard por transitividad desde el caso nominal ni se declara que los contratos itinerantes de U01c fueran físicamente imposibles. Alternativas de equipos, recomposición dinámica, setups, rondas, transporte, anclajes y agendas físicas complejas quedan fuera de esta unidad.

Complejidad neta: una condición del schema, ajuste del editor, rechazo explícito de ausencia en dos preflights y dos reemplazos de cuerpo en una migración. Continúan las mismas autoridades y el mismo ledger. La revisión de catálogo SQL se extiende a 123 para que detecte drift del consumidor nuevo. No hay nueva matriz de requisitos por fase, presupuesto, solver ni prioridad.
