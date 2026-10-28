# Jornadas y obligaciones

Entidades creadas por UI/API real en bases nuevas: catálogo, plantillas, recursos, participantes, jornada, conjunta, pausa y cadena. Sin importación A2 ni placements preparados. Perfil nominal STANDALONE_ONLY, EXACT_CONSTRUCTIVE, rejilla 5 min, transición de recursos cero, márgenes explícitos cero y presupuesto previo 10.000. Jornada 08:00–16:00; físicos y participantes 08:00–12:00. Las ventanas son configuración; los horarios los propone el motor.

## Mismo perfil mixto U01c

| Obligación | Tareas | Operaciones | Recursos |
| --- | ---: | ---: | --- |
| Preparaciones | 3 | 3 | Ninguno; prerrequisitos de fase 1 |
| Fase 1 | 3 | 3 | A+B, 5 min cada una |
| Fase 2 | 2 | 2 | A+B, 5 min; depende de fase 1 propia |
| Fase 3 conjunta | 2 | 1 | B, 10 min; depende de fase 2 propia |
| Fase 3 individual | 1 | 1 | C, 5 min; depende de fase 1 propia |
| Cierres | 3 | 3 | Ninguno; dependen de operación final propia |
| Tres competidoras independientes | 3 | 3 | A:15 min, B:10 min, C:10 min; participantes/espacios distintos |
| Descanso físico | Canal propio | 1 | A+B y los tres espacios de fase, 15 min, ventana 09:00–09:30 |

17 tareas, 16 operaciones productivas; siete pasos REQUIRED y ocho obligaciones dentro de fases 3/2/2. La macro dura 40 minutos. Conjunto universal vacío; AB no se hereda en operaciones B/C. La conjunta no duplica ocupación ni pierde un participante.

UI guarda la cadena vacía, la recarga y la modifica dentro de una fase sin cambiar ID. S1 acepta únicamente competidora A y certifica el futuro físico global de 17 tareas más pausa. S2 propone las 16 pendientes y conserva literalmente S1. Ambas aceptaciones se comparan con filas SQL reales. Las pruebas de selectors representante/peer/espacio cierran la misma unidad sin incluir automáticamente sus prerrequisitos visibles.

## Segunda topología

Dos participantes estructurales y dos competidores independientes: 12 tareas, 11 operaciones productivas, dos fases 2/3 y seis obligaciones dentro de cinco pasos físicos. Fase 1: dos AB de 5 min. Fase 2: dos AC de 5 min y conjunta B de 10 min. La conjunta se declara primero dentro de su fase, pero depende de ambos AC; el orden interno flexible la materializa al final. Macro de 30 min, sin identidad universal, con pausa AB y Stages de 1+11.

## Controles

`common` conserva la topología de 17 añadiendo A como requisito físico real de ambas operaciones finales y declarándolo común. No se obtiene la garantía mediante un recurso ficticio. `impossible` conserva el mixto y guarda sus fases vacías: A disponible 08:00–08:40 y pausa fija 08:20–08:35. Demanda A = 25 macro + 15 competidora + 15 pausa = 55 min. No hay propuesta ni Stage adicional; no hay exhaustion.

`native/receipts.json.gz` y `repeat/receipts.json.gz` incluyen `profile.json`, IDs reales, solicitudes, configuraciones recargadas, EngineInput, adapter, recursos efectivos, runs, witness, Draft, validaciones, filas SQL, ataques y rollback/redo. Los PNG muestran directamente las autoridades guardadas.
