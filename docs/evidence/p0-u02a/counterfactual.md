# Contrafactual físico y límites

`memory.ts` lee `*-memory-input.json` generado desde el builder del día real. El único overlay añade `dailyTechnicalChainsVersion/technicalChains`, `dailyJointGroupsVersion/dailyJointGroups` y los jointGroupId correspondientes. **No cambia perfil Main, tareas, coaches, dependencias, unidades, miembros, recursos efectivos, ventanas, transición o pausa.** Nunca se escribe esa copia en DB, revisión, planning_run, Draft o Stage.

## Capacidad independiente de la búsqueda

`capacity.ts` construye exclusivamente un testigo en memoria derivado de las cargas: preparaciones seriales, fases consecutivas, cierres, competidoras alrededor de la pausa declarada, técnica y luego cohortes feeder por coach seguidas de Main continuo. No toma horas del solver ni del A2. `capacity.json`: 24 tareas, una pausa y `hardValid=true`; Main termina a minuto 670 (11:10), dentro de la disponibilidad 12:00. El fin **preferido** 11:00 no se trata como hard. El solver encuentra además una solución que termina Main a 11:00.

Cotas simples: cada persona productiva demanda 20–30 minutos en la macro más 20 Main/Vocal, frente a 240 disponibles. AB requiere 25 minutos en I/II; las fases completas duran 40, la pausa ocupa 15 y los tres cierres 15. La capacidad no es prueba suficiente por sí sola: el testigo completo y el verificador independiente de recursos, espacios, participantes, coaches, unidades, dependencias y conjunta cierran la prueba física. Las horas construidas nunca se suministran al planificador como seed.

## Resultados runtime del perfil Main original

| Scope | Propuesta día 1 | Witness global | Ramas día 1 / día 2 | Evidencia |
| --- | ---: | ---: | ---: | --- |
| Todas las tareas | 24 | 24 + pausa | 127 / 160 | `*-full.json` |
| Repetición misma entrada | 24 | 24 + pausa | 127 / 160 | Propuesta y contadores idénticos |
| Sólo competidora A | 1 | 24 + pausa | 127 / 160 | `*-partial.json` |
| Continuación alrededor de esa decisión protegida | 23 | 24 + pausa | 126 / 159 | Igualdad literal de la decisión anterior |
| Un miembro de fase | 8 | 24 + pausa | 127 / 160 | Macro cerrada con peer; tres preparaciones supporting fuera de propuesta |
| Sólo los Main | 3 | 24 + pausa | 127 / 160 | Vocal y macro permanecen en witness, sin aceptación supporting |

Cada positivo pasa `validatePlan` global y `certifyDailyTechnicalChain(...,0,proof)` con WITNESS, consumed=0. `verify.py` comprueba independientemente identidad completa, duración, ventanas, dependencias, recursos efectivos exactos, capacidad, conjunta deduplicada, unidad, pausa, fases y continuidad Main. No se considera suficiente el `hardValid` del mismo motor.

`supporting.json`: en el scope de macro cambia sólo la preparación `task:10` de 08:05–08:10 a 08:15–08:20. La propuesta visible permanece idéntica, el witness global vuelve a validar y el certificado sigue WITNESS. `acceptedSupportingPlacements=[]`. No hay protección nominal de esas preparaciones por haber demostrado capacidad.

Seis ataques por día modifican copias del witness: quitar miembro físico, separar peer, borrar pausa, superponer competidora por recurso, eliminar disponibilidad de coach y eliminar disponibilidad de unidad. Los doce dan `hardValid=false`. No son ataques SQL ni Stages aceptados.

## Geometría, matching y primeras decisiones

Primer día, `integrated-search-path.json` y diagnóstico completo `integrated-full.json`:

- Una arquitectura y timeline; 29 ramas core + 98 standalone. Core máximo 3.
- Geometría Main continua 10:30–11:00: participantes 1 y 3 con coach 4, luego participante 2 con coach 5. Vocal del coach 4 10:10–10:30; Vocal del coach 5 10:40–10:50. Dependencias y coaches conservados.
- Dos candidatos feeder evaluados; dos comprobaciones ordinales, cinco aristas y cuatro recorridos de aumento. Residual: cinco invocaciones, tres construcciones completas y dos actualizaciones; 12 ramas de matching residual. No se usa matching por bundles; sus ceros son **NOT_TESTED para ese camino**.
- La primera eliminación real de dominio feeder descarta dos inicios de `task:15` por `OVERLAP_COACH` con `task:2`. No elimina toda la cohorte. La solución conserva los otros inicios.
- El futuro analiza 14 estados distintos, cero negativos y cero colisiones de autoridad en el positivo.
- Selección macro: competidor A, B, técnica B+C, competidor C, cadena por fases. Los dominios iniciales son 46/47/48/47 y 618 realizaciones top-level de cadena. Se aplica la autoridad física; una cardinalidad no representa minutos de capacidad añadida.
- Primera solución completa sin dead-end standalone. La macro ocupa 08:15–08:55; las preparaciones witness pueden aparecer antes aunque se materialicen después en el recorrido. Esto no las convierte en estado aceptado.

## Inviabilidad física y agotamiento separados

**Control U01f auténtico:** A disponible 08:00–08:40; pausa fija 08:20–08:35. Demanda no solapable de A = 25 (AB fases I/II) + 15 (competidora) + 15 (pausa) = 55 > 40. API productiva obtiene NO_PROPOSAL, sin Stage adicional ni motivo de presupuesto, 4.278 ramas. Es la certificación negativa de la familia standalone, no de Main integrado.

**Negativo integrado auténtico:** conserva las 24 tareas y estrecha A a 08:00–08:40, pero su pausa UI sigue 09:00–09:30. Además de la cota 55 > 40, la pausa ya tiene dominio cero por disponibilidad de A. Se conserva este caso tal como se configuró; no se presenta como el negativo U01f de pausa temprana ni como un fallo sutil de contigüidad.

Tras el overlay de estructuras, adapter SUPPORTED; solver consume 10.000 ramas: 5.149 core / 4.851 standalone. Una arquitectura/timeline, 56 intentos de witness de run, 907 candidatos feeder, 816 invocaciones de matching residual (30 builds, 786 updates). Dominios feeder permiten seguir: 4.042 evaluaciones de futuro task-local, 309 estados únicos y 3.733 repeticiones; cero negativos task-local. Eso no certifica la pausa global.

Primera selección standalone: competidora A `task:69`, dominio de seis inicios (08:00 a 08:25). Cada candidato falla en `PreparedOperationalMealAuthority.assess` (instancia `operationalMeals`): `CAUSED_BY_ADDED_TASK:break:<id>:CANDIDATES_0_TO_0`. El primer dead-end es `MACRO_CANDIDATES_EXHAUSTED`, profundidad 0, seis candidatos evaluados; no hay búsqueda ordinaria ni hoja global completa. La continuación devuelve rechazo al core, que explora otros feeders/matchings hasta `STANDALONE_BRANCH_BUDGET_EXHAUSTED`. Las trazas conservan ancestros y fingerprint; no se incrementa presupuesto ni se confunde este resultado con prueba exhaustiva del solver. El presupuesto se agota sobre un input cuya imposibilidad conocemos por otra prueba.

Este negativo permite localizar coste repetido del camino de rechazo, pero no demuestra que el positivo necesite cambiar geometría/matching ni autoriza ampliar el alcance a otra optimización. La aceptación siguiente exige rechazo seguro y diagnóstico honesto; no exige optimizar este imposible en el mismo delta.

## Lo que falta

- Guardado productivo de fases/conjunta en Main y reconstrucción fría de esas autoridades.
- Servicio real → apply → Draft → validación → Stage SQL integrado → continuación/replay con esas fuentes.
- Variante integrada AB→AC, otra topología, transiciones positivas, elección any, setup, rondas, transporte y anclajes sobre la macro.
- Matching de bundles en esta intersección y todas las políticas operativas específicas A2.

El perfil fijo con transición cero es el alcance investigado. No se habilitan transiciones positivas, unidades mutables o dominios alternativos basándose en estos resultados. No hay un Stage en memoria.
