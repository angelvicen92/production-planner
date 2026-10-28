# Matriz capacidad × capacidad y comparación

El estado productivo **no cambia** en este PR diagnóstico. «Después» significa conocimiento demostrado, no retirada de guard. Sólo se usa PRODUCTIVE_COMPOSED cuando existe Stage auténtico con la autoridad relevante.

| Intersección | Antes, U01d | Después del diagnóstico U01e |
| --- | --- | --- |
| REQUIRED 3/2/2 × AB/AB/B,C × conjunta × pausa × tres competidoras | PRODUCTIVE_COMPOSED, 17/17 | PRODUCTIVE_COMPOSED: control recreado por API, S1/S2 SQL en dos stacks |
| REQUIRED × unidad AB fija × liberación posterior × misma jornada | UNSUPPORTED_EXPLICIT; sólo control reducido U01c en memoria | UNSUPPORTED_EXPLICIT; primer JOINT o TECHNICAL_CHAIN; witness integrado 17 en memoria |
| Fases × unidades AB→AC por tramo × miembro A compartido | NOT_TESTED para jornada completa | UNSUPPORTED_EXPLICIT en producto; memoria física válida; capacidad compartida sin duplicar |
| Conjunta × unidad física B dentro de fase × futuro | UNSUPPORTED_EXPLICIT / sin certificado material integrado | UNSUPPORTED_EXPLICIT; memoria 17 válida; helper físico SQL omite B, CONSUMER_DEFECT acotado |
| Pausa A+B × AB/AC × competencia independiente | Pausa productiva aislada; cruce con REQUIRED itinerante sin certificar | Autoría de pausa aceptada; composición completa UNSUPPORTED_EXPLICIT; memoria válida con pausa temprana real |
| Snapshot itinerante sin consumidor × fases nominales | Guard conocido | UNSUPPORTED_EXPLICIT reproducido; conjunta 200, fases 422 sólo por snapshot; memoria válida |
| S1 parcial × futuro global × continuación itinerante | NOT_TESTED salvo reducido | Copias en memoria 1+16 con 17+pausa y decisiones preservadas; Stage SQL itinerante NOT_TESTED |
| Agenda itinerante × OPERATION_ONLY × blocksSpace true/false × REQUIRED/conjunta | Familias excluidas por guards | Memoria SUPPORTED/WITNESS en ambas; producto sigue UNSUPPORTED_EXPLICIT |
| Transición positiva de unidad × adyacencia cero entre espacios | Capacidad interna aislada | Witness sin margen rechazado HARD en memoria; SQL integrado NOT_TESTED, carencia de comprobación genérica por lectura |
| A: demanda 55 / disponibilidad 40 × composición completa | Nominal PHYSICALLY_INFEASIBLE | API primero UNSUPPORTED_EXPLICIT; memoria PHYSICALLY_INFEASIBLE sin exhaustion |
| Recursos efectivos de unidad × `joint_task_resources` | No certificado para esta intersección | CONSUMER_DEFECT observable por SELECT; guard vigente contiene su uso |
| Alternativas/any, membresía dinámica de una unidad | Fuera del contrato certificado | NOT_TESTED; no ampliadas |
| Main/Vocal, rondas, setups, transporte, anclajes sobre esta macro | UNSUPPORTED_EXPLICIT / NOT_TESTED | Sin nueva certificación |
| A2 completo introducido desde UI | NOT_TESTED | NOT_TESTED; Fuente 06 sólo exigencia conceptual aquí |

## Baselines comparados

| Hito | Qué demuestra | Qué no demuestra |
| --- | --- | --- |
| U01c | Mixto 17 con fases sólo en memoria; itinerante reducido AB→AB→C válido en memoria, bloqueado por API/SQL | Jornada integrada itinerante, conjunta itinerante ni Stage de esa composición |
| U01d | Misma jornada nominal 17 con `requiredResourceIds:[]`, S1/S2 SQL y segunda topología 12; mantiene todos los requisitos efectivos | Composición de fases con unidad itinerante o sus ámbitos |
| U01e | Repite nominal 17 con S1/S2 genuinos; sustituye byItem por unidades reales en jornada 17; cuatro cruces causales, scopes/agenda en memoria; localiza primer rechazo y autoridad SQL incompleta | Cero habilitación productiva nueva; cero Stage itinerante; no se hereda por transitividad la certificación U01d |

U01d corrigió una restricción representacional y su semántica SQL vacía; U01e no descubre una regresión de aquella capacidad. La jornada nominal conserva 83/82 ramas S1/S2. El contrafactual fijo también consume 83/82; la pausa temprana eleva a 179/178 porque cambia el dominio temporal. Esos conteos no son garantía general de complejidad ni criterio de soporte.
