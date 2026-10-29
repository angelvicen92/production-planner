# Intersección antes/después

| Contrato | Base G03 / 127 | G03b / 128 |
| --- | --- | --- |
| 19 comidas individuales pendientes + Main/Vocal | Proyección parcial válida | Misma autoridad y scheduler |
| Fase REQUIRED + pausa global | U02d certificada | Regresión literal exigida |
| Fase nativa + comidas flexibles | UI deshabilitada y SQL UNSUPPORTED | Admisión TypeScript/SQL alineada; gate físico global obligatorio |
| Canal físico SQL sin pausa operacional ficticia | Cuenta comidas como tareas productivas | Consume `participantMeals` por el canal existente |
| Comida adyacente a tarea productiva | Scheduler/108 válido; loop SQL 121 exige margen productivo | Ocupación virtual sin solape; márgenes productivo→productivo intactos |
| Conjunta + comidas flexibles | UNSUPPORTED | UNSUPPORTED; no se abre `jointCombinationSupported` |
| Unidades specific de miembros fijos, transición cero | Admitidas en intersecciones previas | Conservadas; C efectiva en el recorrido G03 |
| Alternativas A/B con transición positiva | Fuera de la intersección | Guard conservado |
| Transporte, rondas, setup P15, requiresBand y recursos no admitidos | Guards propios | Sin ampliación |
| Futuro fuera del scope | No equivale a decisión humana | Comidas/supporting siguen pendientes en S1 |

La identidad de cadena nueva es estable dentro del día (`max(1)` en el contrato). El editor conserva cualquier ID previo; no se altera la identidad física de tareas, recursos o unidades ni su prioridad.

La primera siguiente frontera de autoría observada es la conjunta con comidas flexibles: la configuración efectiva mantiene su editor no soportado después de guardar la fase. No se ha probado su viabilidad por analogía con la fase A. Las fases B/C completas de Alfombra, las 266 obligaciones nuevas por UI y la macro A2 completa permanecen sin acreditar.

La topología adicional inicialmente ensayada con participantes 12:00–18:00 sobre jornada 09:00–21:00/preferencia Main 19:00 devolvió `CORE_INFEASIBLE`, 26 ramas, cero matching y ninguna llegada al standalone. Se conserva su input/run nativo en `diagnostic-receipts.json.gz`; no demuestra inviabilidad física ni agotamiento. Esa frontera de geometría Main no se amplía aquí. El contrafactual de ventanas 09:00–19:00 produjo tres operaciones + cuatro comidas en 55 ramas y define la segunda topología de aceptación, conservando sus dos fases, duraciones diferentes, recurso compartido y participante repetido. No se cambian algoritmos, budgets o prioridades para resolver la primera configuración.
