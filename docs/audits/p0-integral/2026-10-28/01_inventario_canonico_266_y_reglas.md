# INFORME 01 — Inventario canónico A2 y requisitos totales

> **Corte:** 2026-10-28. `main = 39e26f1c2e84cc8160c2066e197d61bc8b972384` (merge #1213). La rama U02c se excluye. **Tipo de comprobación de esta entrega:** inspección remota de fuentes/código y reconciliación de Evidence existente; no se ejecutó una jornada UI+Postgres/SQL propia en esta auditoría. No afirmar que se visitó Replit/Supabase real.

**Fuentes de autoridad:** [00](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [01](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [03](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.8.md), [04](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.9.md), [05](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/05_VALIDACION_CALIDAD_BENCHMARK_v2.8.md), [06](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.10.md), [07](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official) y [AGENTS.md](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/AGENTS.md). La Fuente 06 prevalece sobre errores de los PDF humanos. **Nota:** etiquetas `UI_PRESENT_UNVERIFIED` significan componente o Evidence previa localizado, NO prueba end-to-end universal.

## Reconciliación programática

- **Participantes:** 19, identificados como C01–C19.
- **Obligaciones:** **266**, filas `Cxx-Oyy` en [`M01_266_obligaciones_A2.csv`](M01_266_obligaciones_A2.csv). Las cuentas se validan por `Counter` contra la cardinalidad independiente de Fuente 06.
- **Familias canónicas:** **31**, desglosadas en [`M01_cardinalidad_31_familias.csv`](M01_cardinalidad_31_familias.csv).
- **Operaciones físicas conjuntas:** Alfombra Roja conjunta C06+C10 y Totales Post conjunto C06+C10: cada una representa **dos obligaciones** y **una sola ocupación física coordinada**. No reducir 266 por ello.
- **Reality anclado:** para C01/C05/C08, la pareja `antes`/`después` + el Main propio son segmentos distintos del contrato 45, no ocupan Estudio7 durante 45 min. Las secuencias canónicas comprenden las tres obligaciones.
- **Cabecera técnica 20/5/5 Reality con EVA:** **cero** nuevas obligaciones sin concursante. No añadir tres falsas tareas ni bloquear Unidad C doblemente.

## Cardinalidades por familia

| Nº | Familia Fuente 06 | Obligaciones |
|---:|---|---:|
| 01 | Croma | 19 |
| 02 | Ensayo vocal - Estudio 7 | 19 |
| 03 | Estilismo entrada | 19 |
| 04 | Estilismo salida | 19 |
| 05 | IN | 19 |
| 06 | OUT | 19 |
| 07 | Pasillo | 19 |
| 08 | Sodexo | 19 |
| 09 | Redes | 18 |
| 10 | Prueba vocal - José María | 11 |
| 11 | Corner Influencer | 10 |
| 12 | Totales 1 | 10 |
| 13 | Sillón | 9 |
| 14 | Totales Coreo | 9 |
| 15 | Estrellas | 8 |
| 16 | Prueba vocal - Lucía | 8 |
| 17 | Giratuto | 7 |
| 18 | Reality Plató - antes | 3 |
| 19 | Reality Plató - después | 3 |
| 20 | Alfombra Roja con EVA | 2 |
| 21 | Alfombra Roja conjunta | 2 |
| 22 | Corner Influencer + Music | 2 |
| 23 | Corner Music | 2 |
| 24 | Reality Hall | 2 |
| 25 | Totales Post conjunto | 2 |
| 26 | Alfombra Roja | 1 |
| 27 | Reality Buggy | 1 |
| 28 | Reality Control · Unidad C + EVA | 1 |
| 29 | Reality Corner Music | 1 |
| 30 | Reality Influencer | 1 |
| 31 | Reality Manzano | 1 |
| | **TOTAL** | **266** |

## Instancias por concursante (orden visual de cotejo, no todas precedencias HARD)

Las secuencias siguientes permiten cotejar el inventario contra Fuente 06 v2.10 §3 y los PDF. **El orden observado no se convierte automáticamente en dependencia dura**: las únicas dependencias operativas son las declaradas en Fuente, configuración y contratos de fase.

| Concursante | Coach | Nº | Secuencia para cotejo |
|---|---|---:|---|
| C01 | Lucía | 14 | IN, Estilismo entrada, Croma, Prueba vocal - Lucía, Reality Plató - antes, Ensayo vocal - Estudio 7, Reality Plató - después, Redes, Pasillo, Totales 1, Sodexo, Giratuto, Estilismo salida, OUT |
| C02 | Lucía | 14 | IN, Estilismo entrada, Croma, Corner Influencer, Prueba vocal - Lucía, Ensayo vocal - Estudio 7, Redes, Pasillo, Totales Coreo, Sillón, Sodexo, Estrellas, Estilismo salida, OUT |
| C03 | Lucía | 12 | IN, Estilismo entrada, Croma, Prueba vocal - Lucía, Totales 1, Corner Influencer + Music, Ensayo vocal - Estudio 7, Redes, Pasillo, Sodexo, Estilismo salida, OUT |
| C04 | Lucía | 13 | IN, Prueba vocal - Lucía, Estilismo entrada, Croma, Totales Coreo, Ensayo vocal - Estudio 7, Pasillo, Redes, Sodexo, Giratuto, Alfombra Roja con EVA, Estilismo salida, OUT |
| C05 | José María | 15 | IN, Estilismo entrada, Prueba vocal - José María, Croma, Corner Music, Reality Plató - antes, Ensayo vocal - Estudio 7, Reality Plató - después, Totales 1, Pasillo, Sillón, Sodexo, Estrellas, Estilismo salida, OUT |
| C06 | José María | 17 | IN, Estilismo entrada, Corner Music, Croma, Prueba vocal - José María, Pasillo, Redes, Ensayo vocal - Estudio 7, Totales Coreo, Sodexo, Estrellas, Giratuto, Reality Hall, Alfombra Roja conjunta, Totales Post conjunto, Estilismo salida, OUT |
| C07 | José María | 14 | IN, Estilismo entrada, Corner Influencer, Croma, Prueba vocal - José María, Totales 1, Pasillo, Redes, Ensayo vocal - Estudio 7, Sillón, Sodexo, Estrellas, Estilismo salida, OUT |
| C08 | José María | 14 | IN, Estilismo entrada, Prueba vocal - José María, Croma, Corner Influencer + Music, Totales Coreo, Pasillo, Redes, Reality Plató - antes, Ensayo vocal - Estudio 7, Reality Plató - después, Sodexo, Estilismo salida, OUT |
| C09 | José María | 15 | IN, Prueba vocal - José María, Estilismo entrada, Croma, Corner Influencer, Reality Influencer, Pasillo, Redes, Ensayo vocal - Estudio 7, Sillón, Sodexo, Estrellas, Totales 1, Estilismo salida, OUT |
| C10 | José María | 16 | IN, Prueba vocal - José María, Estilismo entrada, Reality Manzano, Croma, Pasillo, Redes, Ensayo vocal - Estudio 7, Sillón, Estrellas, Sodexo, Totales Coreo, Alfombra Roja conjunta, Totales Post conjunto, Estilismo salida, OUT |
| C11 | José María | 14 | IN, Prueba vocal - José María, Estilismo entrada, Croma, Corner Influencer, Pasillo, Redes, Ensayo vocal - Estudio 7, Sillón, Sodexo, Totales 1, Reality Buggy, Estilismo salida, OUT |
| C12 | Lucía | 14 | IN, Estilismo entrada, Croma, Pasillo, Redes, Prueba vocal - Lucía, Sodexo, Giratuto, Ensayo vocal - Estudio 7, Totales 1, Corner Influencer, Reality Control · Unidad C + EVA, Estilismo salida, OUT |
| C13 | Lucía | 15 | IN, Estilismo entrada, Totales 1, Croma, Pasillo, Redes, Sillón, Prueba vocal - Lucía, Sodexo, Giratuto, Estrellas, Ensayo vocal - Estudio 7, Alfombra Roja con EVA, Estilismo salida, OUT |
| C14 | Lucía | 13 | IN, Estilismo entrada, Totales Coreo, Croma, Pasillo, Redes, Sodexo, Prueba vocal - Lucía, Giratuto, Ensayo vocal - Estudio 7, Corner Influencer, Estilismo salida, OUT |
| C15 | Lucía | 14 | IN, Estilismo entrada, Croma, Pasillo, Redes, Totales 1, Corner Influencer, Sillón, Prueba vocal - Lucía, Giratuto, Sodexo, Ensayo vocal - Estudio 7, Estilismo salida, OUT |
| C16 | José María | 13 | IN, Estilismo entrada, Croma, Pasillo, Redes, Totales Coreo, Corner Influencer, Sodexo, Prueba vocal - José María, Ensayo vocal - Estudio 7, Alfombra Roja, Estilismo salida, OUT |
| C17 | José María | 13 | IN, Estilismo entrada, Croma, Reality Hall, Pasillo, Redes, Estrellas, Sodexo, Prueba vocal - José María, Ensayo vocal - Estudio 7, Totales 1, Estilismo salida, OUT |
| C18 | José María | 13 | IN, Estilismo entrada, Croma, Pasillo, Redes, Sillón, Sodexo, Corner Influencer, Prueba vocal - José María, Totales Coreo, Ensayo vocal - Estudio 7, Estilismo salida, OUT |
| C19 | José María | 13 | IN, Estilismo entrada, Croma, Pasillo, Redes, Reality Corner Music, Corner Influencer, Prueba vocal - José María, Totales Coreo, Sodexo, Ensayo vocal - Estudio 7, Estilismo salida, OUT |

## Contrato global (distintos tipos de autoridad)

**Ventana A2:** jornada 09:00–21:00; C01 09:00–15:30; C02–C19 09:00–19:00. No adoptar 18:40 de snapshots antiguos. Plantilla/día/instancia deben preservar identity, ventanas y cargas; recursos ausentes no se suplen por nombres A2.

**Secuencia general:** IN primera, OUT última, Estilismo salida penúltima; Estilismo entrada antes de tareas ordinarias salvo excepciones IN/Vocal; Vocal antes de Main del mismo coach; no fijar otros órdenes de PDF como hard. Margen del concursante 5 min entre independientes; `Estilismo salida.after=0` y `OUT.before=0`, frontera efectiva cero; `max` de overrides explícitos en un borde, no suma. Las transiciones internas de operación compuesta no añaden esos 5 min.

**Transporte:** dos policies independientes. En IN `targetGroupSize=3`, `maximumGroupSize=3`, `minGapMinutes=30` entre inicios. Target no es mínimo hard y gap no crea parrilla a 00/30. Los valores efectivos de OUT se obtienen de configuración de Fuente y no se copian de IN sin verificar.

**Main y coaches:** 19 ensayos Estudio7 15 min, 19 Vocal 15 min de Caracola con asignación por identidad (Lucía 8 / José María 11), ambas Caracolas pueden trabajar paralelamente. `coachRouteTransitions` direccional Caracola→Estudio7 de 30 min; no añadir margen inverso. El Main construye estructura protegida y los feeders deben poder rematching por bundle.

**P14:** Recursos/Corner espacio31, Pasillo espacio3 y Giratuto espacio32 forman **una unidad de scope**, pero Giratuto es físicamente independiente y no consume CAM1 por nombre. Actividades Corner/Pasillo ordinarias usan CAM1; Redes 18 tareas está en Maqui/Pelu39, fuera de este scope, no CAM1. Reality físico en Corner ocupa el mismo espacio31 pero, `OPERATION_ONLY`, no hereda CAM1 automáticamente.

**P15:** Croma espacio43 CAM2. Estrellas/Sillón usan capacidad física compartida bajo el padre42, CAM2 efectiva; dos familias de montaje y setup hard de 10 min entre cambios; continuidad/agrupación/reentrada independientes; la permutación del horario humano no es orden hard.

**Totales:** T1 CAM5 (10) + Coreo CAM6 (9) 30 min cada obligación, rondas sincronizadas REQUIRE D mientras ambos lanes activos, cambio de micro/preparación 5 min; un scope estructural, pausas coordinadas físicas. No fijar un *número universal* de rondas: sale de la demanda efectiva.

**Comidas:** 19 Sodexo individuales 40 min, con capacidad máxima de simultáneos y witness global para pendientes en cualquier Stage. Coach Lucía y JM 45 min cada uno, por su recurso real; seis pausas operativas REQUIRED de 75 min, exactamente una para Estudio 7, Plató 14, Plató 15, Reality A, Reality B y las Salas Totales coordinadas, dentro de 13:00–16:30; deben respetar ventanas efectivas. Reality C no implica una tercera pausa; Caracolas ni Estilismo heredan la de plató.

**Reality A/B:** equipos elegibles equivalentes y agenda independiente, 15 min de transición positiva entre operaciones standalone consecutivas de la misma unidad, salvo tramo interno compuesto. No fijar por código la asignación humana A/B. `agendaScope`, `resourceInheritance` y `blocksSpace` son tres dimensiones ortogonales; ocupación de espacio no equivale a pertenencia de agenda y tampoco a herencia de recursos.

**Reality C + EVA + Alfombra:** Unidad C con composición `CAM3+CAM4+SON1`, EVA desde 16:00; fases REQUIRED A tres tareas Reality C (C06 RH30, C12 RC30, C11 RB30), B dos Alfombra con EVA (C04,C13, 15 min), C Alfombra sin EVA (conjunta C06+C10 10 min e individual C16 10 min). **A→B→C sin huecos, orden interno de cada fase libre**, duración estructural 140 min. EVA se libera después de B, la continuidad de Alfombra sigue en C; Totales Post conjunto 5 min es dependiente de la conjunta y puede ocurrir después fuera de esa continuidad. No sobrerreservar Estudio7, CAM1 ni Alfombra virtual.

**Operaciones informativas:** `requiresBand` señalado como semántica real por Fuente 06: requiere test de expresividad frente a requisitos de recurso existentes. `usesInstrument`/`instrumentAnnotation` y guitarras/atrezo de PDF no crean por sí solos nuevas demandas hard.

## Crosswalk y uso de la matriz fila a fila

El CSV contiene por cada obligación ID, concursante, coach, orden solo para cotejo, duración, clase, espacio, consumo nominal explícito donde normado, grupo físico cuando aplica, semántica específica y cinco estados separados (`ui_authoring`, `api_authoring`, `EngineInput`, `preflight`, `sql_stage`). Estos cinco estados están **NOT_TESTED por cada fila en A2 nativo**, incluso si existe Evidence de capacidad en otra jornada. Esa elección impide falsear completitud.

La cardinalidad exacta es **necesaria pero no suficiente**: antes de E2E-1 deben comprobarse en cada fila `override`, `source template ID`, capacidad consumida, relación conjunta/anchor/phase, ventanas, revision CAS, y guard de representabilidad. El CSV no asigna cada minuto del horario humano como constraints; esos datos serían una contaminación del benchmark.

## Distinción entre A2 mínimo y P1

**A2 mínimo:** 70 requisitos en M02, con prioridad P1 (alta) para editor físico, ruta coach, restricciones estructurales, transportes, comidas, setups, rounds, A/B y protección Stage. **No es requisito A2 mínimo** ofrecer espacio genérico `capacity>1/shared`, un segundo motor de reglas, todos los tipos de bundles sin caso de uso, ni refinamiento intensivo de calidad antes de completar. Otra jornada podrá necesitar capacidad>1, pero entonces debe llegar como demanda documentada y tener su gate propio.

**Fuentes primarias:** `ENSAYO_A2_LV.pdf` p.1 (plan por espacios), `ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf` p.1 (distribución por concursante). La fuente interpretativa vigente es [06](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.10.md); errores explícitos corregidos: C09 Sodexo duplicado, C12 comida 40, C13 "C"=Estilismo salida y cabecera técnica no tareas.