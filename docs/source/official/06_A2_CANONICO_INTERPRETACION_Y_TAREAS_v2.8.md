# OPTIPLAN — BENCHMARK A2 CANÓNICO: INTERPRETACIÓN Y OBLIGACIONES

**Versión:** 2.8<br>
**Fecha:** 13 de octubre de 2026<br>
**Estado:** Fuente oficial consolidada  
**Absorbe:** Documento Maestro de Interpretación A2 v1.9, Cuadro de tareas A2 v1.3 y Addendum Reality/EVA/Alfombra/márgenes v1.0.

## Actualización v2.8 — reconciliación física autorizada por producción

Esta versión consolida las correcciones operativas expresas del responsable de producción del 13 de octubre de 2026. Sustituye materialmente la antigua asignación de Redes a Recursos/CAM1; ninguna asignación histórica errónea se convierte en requisito hard del nuevo día. Los PDFs originales no se modifican.

| Operación/source | Destino histórico o identidad efectiva | Capacidad y recursos |
|---|---|---|
| Estilismo entrada y salida | zona 14, espacio 40 Vestu | Una capacidad compartida HARD=1, con huecos permitidos, sin continuidad obligatoria ni penalización de hueco no configurada; sin descanso de plató 75 min. |
| Redes | zona 14 Otros, espacio 39 Maqui/Pelu | Independiente de Corner/Pasillo, capacidad 1, sin CAM1 ni recurso añadido automáticamente. Se preservan requisitos explícitos distintos, disponibilidad, dependencias, transporte y márgenes. |
| P14 Pasillo | zona 3, espacio 3 | Capacidad 1; CAM1 explícita. |
| P14 Corner/Recursos | zona 3, espacio 31 Corner | Corner Influencer/Music/combinado comparten capacidad 1; CAM1 explícita. |
| P14 Giratutto | zona 3, espacio 32 | Capacidad 1 propia; sin CAM1 por defecto. |
| Reality Hall | zona 3, espacio 4 Hall | Identidad catalogada explícita. No se equipara a Pasillo por nombre. Mantiene los equipos itinerantes efectivos por instancia. |
| P15 Croma | zona 2, espacio 43, padre 42 | CAM2 explícita, independiente de la capacidad del set combinado. |
| P15 Estrellas + Sillón | nueva identidad efectiva combinada bajo el padre histórico 42 | Una sola capacidad 1; conserva 44/45 sin modificarlos. Cada familia ocupa un bloque, setup de 10 min entre familias, no reentrada; orden flexible salvo autoridad expresa. CAM2 explícita. |
| Estudio 7 | zona 1, espacio 48 | El Ensayo principal ocupa 15 min; Reality no amplía a 45 min su ocupación física. |
| Caracola Lucía / José María | zona 13, espacios 35 / 41 | Identidades separadas; transiciones y comidas propias de coaches. |
| Exterior Alfombra / Manzano / Buggy / Control | zona 11, espacios 25 / 26 / 28 / 46 | Reutilización inequívoca; requisitos itinerantes por instancia. |
| Salas Totales Coreo / Totales 1 | zona 12, espacios 33 / 34 | Capacidades distintas, sincronización de rondas y descanso común según configuración. |
| Totales Post | nueva identidad efectiva explícita, independiente de 33/34 | Operación conjunta C06+C10 sincronizada; sin descanso 75 min inferido por nombre. La ubicación es configurable y reasignable a cualquier destino compatible, cuyas autoridades efectivas entonces se aplican. Nunca hardcode en el motor. |
| Transporte IN / OUT | zona 14, espacio 49 | Capacidad gobernada por las reglas propias de agrupación IN/OUT; no exclusividad serial artificial del espacio. |
| Reality Plató / Sodexo | proyección virtual no física cuando corresponda | No se crea un plató Reality permanente ni una comida espacial ficticia. Ubicación del equipo y decorado físico son conceptos diferentes. |

La unidad operativa de construcción/descanso P14 sigue siendo Corner/Recursos + Pasillo + Giratutto. Redes queda fuera de su scope y de su corte; las comidas de los participantes permanecen independientes. CAM1 limita Corner/Pasillo incluso con espacios distintos. CAM2 limita todo el trabajo A2 de Croma y Estrellas/Sillón incluso con capacidades espaciales distintas. CAM5 de Totales 1 y CAM6 de Totales Coreo se conservan como requisitos efectivos conforme al catálogo original; no se omiten del modelo ni se crean cámaras ficticias. Estas exclusividades proceden de identidades concretas y asignaciones explícitas, nunca de nombres ni herencia indiscriminada de zona.

Reality standalone en Corner Influencer o Corner Music utiliza el mismo espacio físico 31 que las otras operaciones de Corner, conservando además los recursos itinerantes A/B/C efectivos. No se duplica capacidad por un alias. Los padres históricos se conservan como jerarquía explícita; no se inventan equivalencias físicas adicionales.

Reality Plató es **una operación lógica continua de 45 min**: 15 antes → Ensayo 15 (Reality simultáneo) → 15 después. El participante y el equipo Reality permanecen ocupados 45 min completos; Estudio 7 sólo los 15 del Ensayo. El contrato interno `anchoredAccompaniments` conserva before/anchor/after con continuidad REQUIRED y recursos incluidos. La proyección visible/reporting agrupa los segmentos en una operación, preservando sus IDs técnicos sin crear doble ocupación ni 60 min de estancia. Los tres segmentos no son tres operaciones productivas independientes. Se mantienen **19 concursantes y 266 obligaciones técnicas canónicas**; no se reinterpretan como 263/269.

El manifest de transición conserva las 23 identidades source históricas y registra la extensión explícita de Maqui/Pelu para Redes. El número de identidades source, de destinos efectivos y de capacidades físicas son magnitudes diferentes; los alias se reconcilian antes del motor/import. Una nueva jornada demo preserva literalmente el A2 previo y sus Stages; su implantación requiere preflight, verificación de drift, reversibilidad y autorización separada, sin mutar los originales.

## Actualización v2.7 — disponibilidad de participantes y cierre Estilismo salida → OUT

Aclaración operativa expresa del responsable de producción para el A2 canónico:

- la ventana global del día se mantiene en `09:00–21:00`;
- C01 mantiene disponibilidad `09:00–15:30`;
- C02–C19 pasan a disponibilidad `09:00–19:00`; el antiguo `18:40` observado en el fixture/snapshot histórico queda sustituido para el benchmark A2 vigente;
- el margen hard general de participante sigue siendo `5` minutos entre actividades independientes cuando no exista override;
- `Estilismo salida` declara `participantMarginAfterMinutes = 0`;
- `OUT` declara `participantMarginBeforeMinutes = 0`;
- para la frontera `Estilismo salida → OUT`, ambos overrides explícitos producen un margen efectivo de participante de `0` minutos; las tareas pueden ser consecutivas;
- la capacidad de Estilismo permanece **1**: no se autoriza paralelismo adicional ni se cambia la exclusividad del espacio;
- los overrides terminales no relajan transporte, disponibilidad, dependencias ni ninguna otra autoridad aplicable.

La semántica de resolución es la general de las Fuentes 03/04: si una frontera posee overrides en ambos lados se usa el mayor; si sólo existe uno, ese valor sustituye el default; `0` explícito no equivale a ausencia; los valores no se suman.

Esta actualización invalida para el canon vigente cualquier diagnóstico de inviabilidad cuya prueba dependa materialmente de `availabilityEnd = 18:40` para C02–C19 o de insertar automáticamente 5 minutos entre `Estilismo salida` y `OUT`. Deben regenerarse fixture, Evidence y benchmark antes de extraer nuevos blockers.

## 1. Autoridad

El universo canónico vigente contiene **19 concursantes y 266 obligaciones**. Se retiran definitivamente las tres falsas operaciones técnicas sin concursante derivadas de la cabecera Reality con EVA.

Orden de autoridad para interpretar los PDFs:

1. aclaraciones operativas expresas incorporadas en esta Fuente;
2. documento por espacios `ENSAYO_A2_LV.pdf`;
3. desglose por concursantes;
4. inferencia visual sólo cuando no exista contradicción y nunca para inventar una regla hard.

Los horarios humanos son benchmark de comparación, no seed, hint, lock ni dominio temporal salvo una restricción explícita configurada.

El antiguo addendum A2 del 13/09/2026 queda retirado como Fuente separada porque sus correcciones ya están incorporadas en las dos partes siguientes.


---

## 0. Autoridad específica A2

Este documento gobierna **hechos y parámetros del snapshot A2**. Ante conflicto con un default, ejemplo o valor genérico de 01–05, prevalece este canon A2. Los PDFs son evidencia primaria; las correcciones expresas aquí prevalecen sobre errores o ambigüedades visuales de los PDFs.

Invariantes de regresión documental:

- universo canónico: **266 obligaciones**;
- no existen las tres antiguas tareas técnicas ficticias derivadas de la cabecera Reality con EVA;
- EVA/Reality C/Alfombra siguen la topología por fases descrita en este documento; las permutaciones internas no se convierten en precedencias hard;
- margen hard general de participante: 5 minutos por defecto entre actividades independientes, con override explícito;
- disponibilidad A2: C01 `09:00–15:30`; C02–C19 `09:00–19:00`; día global `09:00–21:00`;
- cierre A2: `Estilismo salida.after = 0` y `OUT.before = 0`; Estilismo mantiene capacidad 1;
- Sodexo A2: 40 minutos y witness global obligatorio en cada Stage aceptado;
- Plató 14 es una unidad operativa de scope (`Recursos + Pasillo + Giratuto`), no tres Stages por `spaceId`;
- Salas Totales son una única unidad sincronizada y de alta presión por sus rondas de 30 minutos;
- Reality A/B forman una agenda coordinada de dos equipos equivalentes para las operaciones elegibles; la asignación humana A/B no es hard;
- Reality C + EVA → Alfombra se cierra/protege antes de materializar la agenda standalone de Reality A/B;
- `requiresBand` es operativo; `usesInstrument`/`instrumentAnnotation` no crean demanda de motor;
- Plató 15 se construye internamente como unidad multi-espacio coordinada; CAM2 es recurso efectivo común de Croma y Estrellas/Sillón y usa `presenceConcentrationPolicy = PREFERRED` en A2;
- el orden Croma/Sillón/Estrellas observado en el PDF no es hard salvo configuración explícita;
- ningún descanso operacional A2 se prefiere por comenzar a las 13:00: manda primero una frontera estructural natural y sólo después el resto de huecos válidos;
- transporte `IN` A2:

```text
targetGroupSize = 3
maximumGroupSize = 3
minGapMinutes = 30
```

Estos tres valores son el canon de `IN` A2 vigente. `minGapMinutes` es un mínimo entre inicios, no una parrilla. Ningún fixture/histórico con otros números puede reemplazarlos sin una nueva versión oficial de este documento.

La preferencia operativa vigente para `IN` A2 es **temprana**: los grupos se colocan desde el inicio hard-válido más temprano y progresan hacia delante respetando el margen mínimo. La composición de los grupos prioriza presión efectiva —fin de disponibilidad, primera obligación, carga futura, slack/dominio y dependencias— antes del desempate por identidad. Estilismo entrada sigue el mismo principio de apertura temprana sobre su capacidad serial de 10 minutos. Esta regla maximiza margen para el resto del día y sustituye la antigua preferencia “lo más tarde posible” de la actualización v1.8.

# PARTE I — Documento Maestro de Interpretación v1.9 consolidado

# Documento Maestro de Interpretación del Ensayo A2

**Provenance:** antiguo Documento Maestro de Interpretación v1.9, integrado aquí; no constituye una Fuente separada.  
**Ámbito:** interpretación operativa de `ENSAYO_A2_LV.pdf` y `ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf`  
**Objetivo:** conservar de forma explícita las reglas necesarias para convertir los dos documentos humanos en una plantilla reproducible del `DÍA DE PRUEBA A2`, incluida la arquitectura coordinada de bloques Caracola→Estudio 7 por Vocal Coach y la topología real de recursos compartidos, sin depender de colores, nombres, intuiciones ni conocimiento oral.

**Actualización v2.6 (27 de septiembre de 2026):** consolida la aclaración operativa expresa del responsable de producción sobre descansos flexibles y Plató 15. La hora concreta de cualquier descanso operacional A2 sigue siendo una decisión del planificador dentro de su ventana: **no existe preferencia por el inicio de ventana**. Se ordenan primero fronteras estructurales naturales —cambio de bloque, coach, escenario, setup o espacio cuando proceda—, después fronteras entre tareas y, por último, cualquier hueco libre válido. Lucía y José María mantienen comidas individuales propias de 45 minutos, reparables durante la construcción y nunca absorbidas por la comida de Estudio 7.

Para Plató 15, CAM2 está asignada efectivamente tanto a `Plató 15 - Croma` como a `Plató 15 - Estrellas + Sillón`, y el A2 canónico configura `presenceConcentrationPolicy(CAM2) = PREFERRED`. Por ello el planificador debe construir **Plató 15 como una unidad operativa coordinada** sobre ambos subespacios, minimizando por este orden los bloques de intervención de CAM2, su intervalo primera→última intervención y sus huecos internos, sujeto siempre a hard constraints. La referencia humana `Croma → Sillón → preparación → Estrellas` demuestra una solución factible pero **no impone ese orden**: cuando la configuración no fija precedencia, el solver debe comparar los órdenes estructurales materialmente distintos permitidos y conservar el de menor coste operativo. Si CAM2 dejara de estar asignada a uno de los subespacios por configuración efectiva, dichos subespacios podrían operar en paralelo si ninguna otra autoridad lo impide.

La construcción interna de esta unidad no puede degradarse a colocar Croma concursante a concursante y resolver después el setup. Debe construirse primero una geometría temporal de unidad/recurso, preservar el descanso operacional de 75 minutos y las políticas de continuidad/setup de cada subespacio, y sólo después asignar identidades mediante matching. `IN` y Estilismo entrada utilizados para certificar la alimentación de esa geometría continúan siendo supporting **ephemeral/reparable**: pueden rematchearse dentro de sus dominios autorizados para alimentar una mejor geometría de Plató 15 y no pueden congelarse como restricciones nominales sólo por haber servido al fixed Main bundle.

**Actualización v2.5 (26 de septiembre de 2026):** incorpora la aclaración operativa expresa del responsable de producción sobre la apertura de jornada. `IN` y Estilismo entrada son obligaciones iniciales cuya construcción preferente debe **maximizar margen futuro**, no minimizar permanencia del concursante. Para A2, `IN` conserva `targetGroupSize=3`, `maximumGroupSize=3` y `minGapMinutes=30`, pero los grupos se colocan desde el primero hacia el último en los inicios hard-válidos más tempranos; los concursantes de mayor presión efectiva ocupan antes los spots escasos. Estilismo entrada se construye igualmente sobre los primeros slots seriales de 10 minutos compatibles con IN, Prueba vocal, disponibilidad y transiciones. Durante Stages estructurales, ambas familias pueden permanecer como reservas virtuales/anonimizadas: demostrar capacidad temprana no obliga a consolidarlas si no pertenecen al scope aceptado. Esta aclaración sustituye únicamente la preferencia temporal tardía de v1.8; se mantienen su semántica de grupos, `minGapMinutes` como mínimo y fallback exacto cuando se rompe equivalencia.

**Actualización v2.4 (24 de septiembre de 2026):** incorpora la aclaración operativa del responsable de producción sobre **orquestación de Stages/unidades**, Totales, Plató 14 y Reality A/B. El A2 no se construye recorriendo `spaceId`: los scopes automáticos se forman por unidades operativas. Plató 14 comprende Recursos + Pasillo + Giratuto en un mismo scope; Salas Totales se resuelven como una unidad sincronizada de rondas largas y deben conservar prioridad sobre trabajo breve/flexible; Reality C + EVA → Alfombra se cierra antes de materializar el bloque standalone de Reality A/B que comparte sus recursos. Las operaciones standalone de Reality A/B son elegibles para cualquiera de los dos equipos cuando sus requisitos efectivos sean equivalentes; la asignación observada en el PDF no es hard y el solver debe repartir la carga entre ambas agendas. Entre operaciones independientes consecutivas del mismo equipo Reality A/B se aplica una transición/reposicionamiento A2 de **15 minutos**, salvo operación compuesta con transición interna incluida u override explícito. Se refuerza además que cada Stage aceptado debe conservar un witness global de Sodexo para todos los concursantes pendientes de comer, no sólo para el último participante afectado.

**Actualización v2.3 (21 de septiembre de 2026):** corrige la interpretación de la estructura Reality C + EVA → Alfombra. La referencia humana NO define el orden hard de participantes dentro de cada fase. El contrato A2 es una secuencia de **tres fases consecutivas** con orden interno flexible: (A) tres Reality C + EVA, (B) dos Alfombra Roja + Reality C + EVA y (C) dos Alfombra Roja sin EVA. El orden observado en los PDFs sólo sirve para cotejo. Se reafirma que la operación conjunta de Alfombra Roja de **C06 Lina Isabel García-Salcedo + C10 Gisela Montserrat** es una única operación sincronizada de dos participantes. También se explicita que las decisiones del flujo principal deben conservar al menos una realización factible de esta estructura futura, sin reservar una permutación humana concreta.

**Cambio v1.9 (13 de septiembre de 2026):** incorpora la aclaración operativa expresa sobre Reality A/B/C, Presentadora/EVA y Alfombra Roja. Reality C = CAM3 + CAM4 + SON1; las operaciones A2 de C consumen además EVA, disponible desde las 16:00. EVA y el bloque operativo C deben ejecutarse sin huecos, y Alfombra Roja continúa de forma consecutiva desde las dos intervenciones con EVA hacia las intervenciones sin EVA. Se retira la lectura errónea de la cabecera naranja `Reality con EVA / 20' secuencia / 5' desmontaje y traslado / 5' Totales Post` como tres tareas técnicas sin concursante: no son obligaciones adicionales y el universo canónico pasa de 269 a **266** obligaciones. Se incorpora además el margen hard general de **5 minutos** entre actividades independientes consecutivas del mismo concursante, aplicable también dentro del mismo plató salvo override explícito, con `0`, `30` u otros valores configurables.

**Cambio v1.8 (8 de septiembre de 2026):** consolida la aclaración operativa expresa del responsable de producción sobre transporte agrupado `IN`/`OUT`. La separación configurada entre grupos es un **mínimo temporal**, no una parrilla fija: por ejemplo, con `minGapMinutes = 30`, dos grupos pueden comenzar a las 09:00 y 09:45. Cuando los concursantes son operacionalmente equivalentes para transporte, la construcción canónica evita permutar membresías: `IN` ordena por la primera obligación efectiva, forma paquetes consecutivos hacia el tamaño objetivo y coloca los grupos **desde el último hacia el primero**, lo más tarde posible, propagando hacia atrás el margen mínimo entre grupos; `OUT` ordena por la última obligación efectiva, forma paquetes consecutivos y coloca los grupos **desde el primero hacia el último**, lo más pronto posible, propagando hacia delante el margen mínimo. En `IN` manda dentro de cada paquete el concursante que antes necesita comenzar su siguiente obligación; en `OUT` manda quien más tarde termina su obligación previa. `maximumGroupSize` y `minimumGroupSize` son límites hard configurados; `targetGroupSize` define la agrupación canónica/preferida y no puede utilizarse por sí solo como prueba de inviabilidad. Si disponibilidades, dependencias u otras restricciones hard rompen la equivalencia o impiden la construcción canónica, el planificador debe conservar una alternativa exacta y no declarar inviabilidad por fallo de la construcción preferente. Esta aclaración sustituye cualquier lectura de “cada 30 minutos” como una parrilla de horas fijas y hace explícito el objetivo operativo de minimizar permanencia innecesaria antes de la primera tarea y después de la última.

**Cambio v1.7 (7 de septiembre de 2026):** actualiza la semántica autoritativa de los descansos operativos a partir de una aclaración expresa del responsable de producción. Para toda unidad con descanso `REQUIRED`, la obligación hard es conservar y materializar un intervalo completo de la duración configurada dentro de la ventana de comidas, sin solapar trabajo productivo ni indisponibilidades de los espacios/recursos afectados. El inicio en un cambio natural de escenario, espacio, setup o bloque es `PREFERRED`; en segundo lugar se prefieren fronteras entre tareas; si ninguna de esas fronteras permite encajar el descanso completo, puede utilizarse **cualquier hueco libre válido** dentro de la ventana. La comida nunca puede interrumpir una tarea en curso y no incrementa `runCount` ni divide un bloque lógico. Durante toda la construcción, antes de aceptar una decisión que afecte a la unidad, el planificador debe preservar de forma virtual y reparable la existencia de al menos un intervalo completo para su descanso; si una decisión consume el último intervalo posible, esa rama es inviable y debe podarse inmediatamente. Esta aclaración sustituye la restricción de v1.4 que exigía que todo descanso comenzase necesariamente en una frontera productiva.

**Cambio v1.6 (3 de septiembre de 2026):** fija explícitamente la topología canónica de descansos operativos A2 para evitar inferencias por nombres o por recursos compartidos. Existen descansos hard de 75 minutos para: **Estudio 7**, **Plató 14**, **Plató 15**, **Reality Unidad A**, **Reality Unidad B** y la **unidad sincronizada de Salas Totales**. Las unidades Reality A y B tienen descansos independientes y no tienen que coincidir. La composición Reality C no posee descanso propio porque es una recomposición temporal de recursos de A y B; queda indisponible cuando cualquiera de sus recursos miembros esté afectado por el descanso de A o B. Totales 1 y Totales Coreo comparten un único descanso sincronizado. **Estilismo no se considera plató a estos efectos y no tiene corte operativo de 75 minutos. Caracola tampoco tiene corte de espacio propio:** Lucía y José María conservan exclusivamente sus comidas individuales de 45 minutos. Plató 14 comprende Recursos, Pasillo y Giratuto para su corte operativo; Plató 15 comprende Croma y Estrellas/Sillón. Los espacios auxiliares Reality/Alfombra/Totales Post no se fusionan por nombre o proximidad en una comida adicional: su disponibilidad queda gobernada por las unidades/recursos efectivos a los que estén adscritos.

**Cambio v1.4 (3 de septiembre de 2026; parcialmente sustituido por v1.7):** precisó la colocación de los descansos de plató y corrigió la duración de Sodexo A2. Su exigencia de iniciar siempre el descanso en una frontera entre tareas queda sustituida por v1.7: la frontera natural o de tarea es una preferencia de colocación, no una condición hard, y cualquier hueco libre completo dentro de la ventana es válido. Se mantienen de v1.4 que el descanso autorizado no divide el bloque lógico ni incrementa `runCount`, que Sodexo A2 dura **40 minutos** y que los Vocal Coaches mantienen comida individual propia de **45 minutos**.

**Cambio v1.3 (3 de septiembre de 2026):** consolidó las aclaraciones operativas del responsable de producción sobre comidas y bloques: todos los platós deben realizar su descanso de comida configurado; en A2 el descanso de plató dura 75 minutos dentro de la ventana de comidas; la comida autorizada puede caer dentro de un bloque lógico sin dividirlo ni romper continuidad; los Vocal Coaches no están anclados a un plató y tienen comida individual propia; Caracola→Estudio 7 = 30 minutos como preparación/traslado unidireccional específico, sin presumir el mismo margen en sentido inverso.

**Cambio v1.2 (3 de septiembre de 2026):** incorporó aclaraciones sobre recursos compartidos en P14/P15/Totales, transporte IN y número de bloques por Vocal Coach. Eliminó como regla hard el máximo de 2 bloques por coach; el objetivo es minimizar bloques sujeto a viabilidad completa.

---

## 1. Autoridad y precedencia

La interpretación se resuelve con este orden de autoridad:

1. aclaraciones operativas expresas **ya incorporadas en la versión vigente de esta Fuente 06**;
2. documento por espacios `ENSAYO_A2_LV.pdf`;
3. documento por concursantes `ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf`;
4. inferencia visual, sólo cuando no exista contradicción y nunca para crear una regla hard.

Cuando los PDFs contienen un error reconocido, prevalece la corrección de este documento.

## 2. Uso de nombres y anonimización

Los nombres reales se conservan únicamente en el cuadro de verificación para poder cotejar los PDFs. La plantilla creada en la aplicación utilizará exclusivamente códigos `C01` a `C19` y nombres ficticios o neutros. Los nombres de canciones, vestuario, instrumentos y atrezo no se convertirán en restricciones operativas.

## 3. Qué representa cada documento

- El **desglose por concursantes** permite conocer qué actividades corresponden a cada persona y el orden de la planificación humana de referencia.
- El **documento por espacios** permite identificar duración, espacio, recursos, paralelismo, cambios de montaje y operaciones conjuntas.
- Los horarios visibles son una **referencia humana de comparación**. No deben introducirse como seed, lock ni solución del planificador salvo que una obligación esté expresamente protegida.
- La **lógica estructural** demostrada por los documentos —bloques por coach, dependencia Caracola→Estudio 7, continuidad del plató principal, transiciones y paralelismo entre unidades— sí constituye evidencia operativa que debe reproducirse mediante reglas configurables y no mediante horas copiadas.
- La referencia humana puede utilizarse para demostrar por qué una estructura de bloques funciona; nunca para fijar a un concursante en una hora concreta durante la búsqueda.

## 4. Leyenda canónica

| Marca del PDF | Interpretación canónica | ¿Se planifica? |
|---|---|---:|
| `NO P.15` | No participa en Estrellas ni Sillón. Puede realizar Croma en Plató 15. | No; se ignora la nota. |
| Bloque verde o rojo inicial | `IN`, entrada del concursante. Los tres bloques rojos iniciales son un error de color. | Sí. |
| `E` inicial | Estilismo de entrada. | Sí. |
| Bloque verde | Croma. | Sí. |
| `VOCAL` azul | Prueba vocal con Lucía. | Sí. |
| `VOCAL` amarillo pastel | Prueba vocal con José María. | Sí. |
| `PLATÓ 7` | Ensayo vocal del flujo principal en Estudio 7. | Sí. |
| `REALITY PLATÓ → PLATÓ 7 → REALITY PLATÓ` | Una operación indivisible de Reality que envuelve el ensayo de Estudio 7. | Sí, como operación anclada. |
| Otros bloques `REALITY` | Reality en la localización indicada, fuera del plató principal. | Sí. |
| `R` azul | Redes. | Sí. |
| `PASILLO` | Actividad de Pasillo. | Sí. |
| `TOTALES 1` | Tarea en Sala de Totales 1. | Sí. |
| `TOTALES COREO` | Tarea en Sala de Totales Coreo. | Sí. |
| `SODEXO` | Comida individual del concursante. | Sí. |
| `G` | Giratuto. | Sí. |
| `P.14 I` | Corner Influencer, en Recursos de Plató 14. | Sí. |
| `P.14 M` | Corner Music, en Recursos de Plató 14. | Sí. |
| `P.14 I + M` | Corner Influencer + Music, tarea combinada. | Sí. |
| `s` | Sillón. | Sí. |
| `e` | Estrellas. | Sí. |
| `A. ROJA` | Alfombra Roja sin EVA. | Sí. |
| `A. ROJA EVA` | Alfombra Roja con EVA. | Sí. |
| `E` final | Estilismo de salida. | Sí. |
| `C` final de Eva Martín | Error del PDF: debe interpretarse como Estilismo de salida. | Sí, corregido. |
| Bloque rojo final | `OUT`, salida del concursante. | Sí. |
| Instrumentos, vestuario, canción, atrezo o notas de contenido | Información editorial o de realización. | No, salvo que se configure una necesidad operativa independiente. |

## 5. Catálogo canónico de tareas

| Tarea | Duración | Espacio / ámbito | Regla principal |
|---|---:|---|---|
| IN | 5 min | Transporte / acceso | Primera obligación del concursante; se agrupa según la política de transporte IN. |
| Estilismo entrada | 10 min | Estilismo | Debe finalizar antes de cualquier tarea salvo IN y Prueba vocal en Caracola. |
| Croma | 10 min | Plató 15 - Croma | Una persona cada vez; CAM2 por asignación efectiva del espacio; sin sonido. |
| Prueba vocal - Lucía | 15 min | Caracola Vocal Coach - Lucía | Debe preceder al Ensayo vocal de Estudio 7; usa a Lucía. |
| Prueba vocal - José María | 15 min | Caracola Vocal Coach - José María | Debe preceder al Ensayo vocal de Estudio 7; usa a José María. |
| Ensayo vocal - Estudio 7 | 15 min | Estudio 7 / Plató principal | Flujo principal; usa al mismo coach de la Prueba vocal. |
| Redes | 5 min | Otros / Maqui/Pelu (zona 14, espacio 39) | Capacidad 1 propia; independiente de P14, sin CAM1. |
| Pasillo | 5 min | Plató 14 - Pasillo | Una persona cada vez; el espacio consume CAM1. |
| Totales 1 | 30 min | Salas Totales - Totales 1 | Rondas sincronizadas con Totales Coreo mientras ambas salas estén activas; consume CAM5. |
| Totales Coreo | 30 min | Salas Totales - Totales Coreo | Rondas sincronizadas con Totales 1 mientras ambas salas estén activas; consume CAM6. |
| Sodexo | 40 min | Comida del concursante | Obligación de comida individual dentro de la ventana de comidas; no es un bloqueo global. |
| Giratuto | 5 min | Plató 14 - Giratuto | Una persona cada vez. |
| Sillón | 5 min | Plató 15 - Estrellas + Sillón | Familia de montaje Sillón; agrupar en un bloque; el espacio consume CAM2. |
| Estrellas | 5 min | Plató 15 - Estrellas + Sillón | Familia de montaje Estrellas; agrupar en un bloque; el espacio consume CAM2. |
| Corner Influencer | 10 min | Plató 14 - Recursos | No requiere cambio de montaje; una persona cada vez. |
| Corner Music | 10 min | Plató 14 - Recursos | No requiere cambio de montaje; una persona cada vez. |
| Corner Influencer + Music | 15 min | Plató 14 - Recursos | Tarea combinada; no requiere cambio de montaje; una persona cada vez. |
| Reality Plató - antes | 15 min | Localización Reality | Primer segmento de una operación indivisible alrededor del Ensayo de Estudio 7. |
| Reality Plató - después | 15 min | Localización Reality | Último segmento de una operación indivisible alrededor del Ensayo de Estudio 7. |
| Reality Hall | 30 min | Reality - Hall Plató 14 | Reality externo al plató principal. |
| Reality Influencer | 30 min | Reality - Corner Influencer | Reality externo al plató principal. |
| Reality Manzano | 30 min | Reality - Manzano | Reality externo al plató principal. |
| Reality Buggy | 30 min | Reality - Buggy | Reality externo al plató principal. |
| Reality Control con EVA | 30 min | Reality - Control | Requiere también a EVA. |
| Reality Corner Music | 30 min | Reality - Corner Music | Reality externo al plató principal. |
| Alfombra Roja | 10 min | Alfombra Roja | No requiere a EVA. |
| Alfombra Roja con EVA | 15 min | Alfombra Roja | Requiere a EVA. |
| Alfombra Roja conjunta | 10 min | Alfombra Roja | Operación conjunta y sincronizada de C06 y C10; no requiere a EVA. |
| Totales Post conjunto | 5 min | Totales Post | Operación conjunta y sincronizada de C06 y C10. |
| Estilismo salida | 5 min | Estilismo | Penúltima obligación del concursante. |
| OUT | 5 min | Transporte / salida | Última obligación del concursante; se agrupa según la política de transporte OUT. |

### 5.1 Asignación efectiva Reality C / EVA / Alfombra en A2

La asignación de equipo Reality y de EVA es **por instancia**, nunca por el nombre genérico de la actividad. En A2:

- C06 `Reality Hall`, C12 `Reality Control` y C11 `Reality Buggy` consumen Unidad Reality C + EVA;
- C04 y C13 `Alfombra Roja con EVA` consumen Unidad Reality C + EVA y ocupan además Alfombra Roja;
- las demás operaciones Reality indicadas para Unidad A o B no consumen EVA salvo asignación efectiva explícita;
- EVA tiene disponibilidad efectiva desde las **16:00**;
- las cinco operaciones de Unidad C forman un bloque `REQUIRED` sin huecos;
- las intervenciones de Alfombra continúan, sin huecos del espacio, con C06+C10 y C16 ya **sin EVA**.

Las horas humanas sirven sólo para cotejo. Los recursos, disponibilidad y continuidades anteriores sí forman parte del problema de entrada mediante configuración estructurada.


## 6. Dependencias y orden hard

1. `IN` es la primera obligación de cada concursante.
2. `OUT` es la última obligación de cada concursante.
3. `Estilismo salida` es siempre la penúltima obligación.
4. `Estilismo entrada` debe terminar antes de cualquier actividad del concursante, con dos únicas excepciones: `IN` y `Prueba vocal` en Caracola.
5. La `Prueba vocal` de Caracola debe terminar antes del `Ensayo vocal - Estudio 7` del mismo concursante.
6. Las dependencias se expresan por identidad de tarea; nunca se deducen por nombre, color o posición visual.
7. Una operación `Reality Plató` se representa como `before 15 min → Ensayo Estudio 7 15 min → after 15 min`, sin huecos y sin transición genérica entre sus tres fases.
8. `Alfombra Roja conjunta` y `Totales Post conjunto` de C06 y C10 son operaciones sincronizadas: ambos concursantes comienzan y terminan juntos.
9. Para considerar alimentable un `Ensayo vocal - Estudio 7`, el concursante debe conservar una secuencia temporal posible con `IN`, `Estilismo entrada` y `Prueba vocal` ya completables antes del ensayo. La Prueba vocal es el feeder estructural escaso porque comparte Vocal Coach; IN y Estilismo entrada son prerrequisitos breves con mayor libertad y pueden materializarse después en la construcción siempre que mantengan al menos una posición válida.
10. La viabilidad de los ensayos no se comprueba sólo concursante a concursante: debe existir una alimentación viable del **bloque completo de coach**.
11. Entre dos actividades independientes consecutivas del mismo concursante existe por defecto un margen `REQUIRED` de **5 minutos**, incluso si pertenecen al mismo plató. Un override explícito de margen previo o posterior puede sustituir ese default para la frontera afectada. Las fases internas de una operación compuesta con `internalTransition = INCLUDED` no reciben un margen adicional.

## 7. Reglas de bloques, setup y sincronización

### 7.1 Flujo principal de Estudio 7 y pipeline Caracola→Estudio 7

#### 7.1.1 Estudio 7 es el eje central

- `Ensayo vocal - Estudio 7` constituye el flujo principal del día.
- Fuera de los cortes autorizados, sus posiciones deben mantenerse continuas cuando la configuración de continuidad sea `REQUIRED`.
- La planificación de las demás actividades parte de esa columna vertebral y se propaga hacia atrás y hacia delante para conservar viabilidad.

#### 7.1.2 Bloques por Vocal Coach

- Cada concursante tiene exactamente un Vocal Coach concreto para `Prueba vocal` y para `Ensayo vocal - Estudio 7`.
- Las tareas de Estudio 7 se agrupan por Vocal Coach para evitar movimientos continuos del recurso entre Caracola y Estudio 7.
- Para el A2 canónico existen dos coaches, Lucía y José María. **No existe un máximo hard de bloques por coach.**
- El número de bloques es una decisión constructiva: debe utilizarse el **mínimo número de bloques factible** que permita completar toda la jornada respetando feeders, transiciones, comidas, disponibilidad y demás restricciones hard.
- La arquitectura humana de referencia utiliza cuatro bloques main: dos bloques de Lucía y dos de José María. El descanso de comida del plató ocurre dentro de la jornada, pero **no define ni separa por sí mismo esos bloques**.
- Esos cuatro bloques no se interpretan como cuatro horas copiadas ni como IDs hardcodeados. Representan la solución estructural compacta que emerge de la carga A2, la continuidad, las dependencias y el uso compartido de los coaches en dos unidades.

#### 7.1.3 Bloques feeder correspondientes en Caracola

Cada bloque de Estudio 7 debe haber sido alimentado previamente por una cohorte de `Prueba vocal` del mismo coach.

Conceptualmente:

```text
Caracola — bloque Lucía 1
        ↓ transición Lucía
Estudio 7 — bloque Lucía 1
        │
        │ mientras Estudio 7 continúa con Lucía,
        │ José María puede completar su siguiente cohorte feeder en Caracola
        ↓
Estudio 7 — bloque José María 1
        ↓
Estudio 7 — bloque Lucía 2
        ↓
Estudio 7 — bloque José María 2
```

El descanso de comida de Estudio 7 debe conservar en todo momento un intervalo completo viable dentro de su ventana configurada. Al materializarlo se prioriza una frontera que coincida con un cambio natural de bloque, escenario, espacio o setup cuando exista y permita encajar íntegramente el descanso; después se prefieren otras fronteras entre tareas. Si ninguna frontera preferente resulta adecuada, puede utilizarse cualquier hueco libre completo dentro de la ventana. Nunca se interrumpe una tarea en curso. Al reanudarse, continúa el mismo bloque lógico cuando proceda: una comida autorizada **no crea un nuevo bloque lógico** ni incrementa `runCount`.

Los bloques feeder posteriores deben prepararse en las ventanas que deja disponibles el sistema. La comida de Estudio 7 no se convierte por sí sola en comida de los coaches o de Caracola: Lucía y José María son recursos no anclados a un único plató y deben conservar cada uno su propia comida individual de 45 minutos dentro de la ventana de comidas.

La lógica es una **tubería de producción**: mientras un coach está ocupado ejecutando su cohorte en el flujo principal, el otro puede preparar la cohorte que alimentará el siguiente bloque.

#### 7.1.4 Misma cohorte no significa mismo orden interno

El requisito estructural es que los concursantes de un bloque main hayan completado su feeder correspondiente y que el coach pueda trasladarse a tiempo.

El orden de los concursantes dentro del bloque de Caracola **no tiene por qué ser idéntico** al orden de esos concursantes dentro de Estudio 7. La planificación humana A2 demuestra esta independencia.

Por tanto:

- la pertenencia a la cohorte y la dependencia individual son estructurales;
- el espejo exacto de orden es únicamente la severidad que configure `mirrorMainFlowOrder`;
- una preferencia de espejo nunca puede cerrar una solución, crear bloques adicionales o empeorar la compactación si no está configurada como `REQUIRED`.

#### 7.1.5 Número de bloques: consecuencia, no fórmula

La planificación humana de referencia A2 produce cuatro bloques con dos Vocal Coaches porque esa alternancia permite:

- preparar previamente las Pruebas Vocales;
- mover cada coach entre Caracola y Estudio 7 con su margen;
- mantener continuidad en Estudio 7;
- aprovechar el trabajo del otro coach para preparar la siguiente cohorte;
- encajar los descansos de comida obligatorios sin convertirlos en fronteras artificiales de bloque;
- evitar una jornada innecesariamente larga.

No existe una regla general `bloques = 2 × coaches`. Con tres coaches, otra carga o ventanas distintas podría producir, por ejemplo, cinco bloques en lugar de seis. El motor debe encontrar el **mínimo número de bloques factible** que mantenga la tubería y la completitud.

Los cuatro bloques humanos son **benchmark de calidad**, no una cota hard. Una solución con uno, dos, tres, cuatro o más bloques puede ser válida si es el mínimo número factible para ese estado y conserva completitud, continuidad, transiciones, alimentación feeder, comidas y viabilidad del resto de obligaciones. En un día con menor carga, un único bloque por coach puede ser perfectamente correcto.

#### 7.1.6 Cierre de bloque antes de trabajo secundario

Antes de invertir presupuesto relevante en Reality standalone, Totales, setups, comidas materializadas o tareas flexibles, la búsqueda debe demostrar que el siguiente bloque del pipeline central todavía puede existir.

Si una decisión en Estudio 7 deja a la siguiente cohorte sin ninguna posición de Prueba vocal o deja al coach sin transición posible, esa rama debe retroceder inmediatamente.

### 7.2 Comidas de plató, concursantes y Vocal Coaches

#### 7.2.1 Descanso de todos los platós

- Todos los platós o unidades de plató activos en A2 deben realizar un descanso de comida **hard** dentro de la ventana de comidas configurada.
- Para el A2 canónico, la duración operativa del descanso de plató es **75 minutos** y la ventana efectiva es **13:00–16:30**, salvo override diario explícito.
- El descanso bloquea el plató o unidad durante el intervalo elegido y, por tanto, las tareas que dependan de ese plató no pueden ejecutarse durante él.
- Los recursos efectivamente asignados a ese plató o unidad descansan con la comida de su unidad según la Fuente 01 y la configuración efectiva de la Fuente 04.
- La hora concreta del descanso es una decisión del planificador dentro de la ventana; los horarios de la referencia humana no se convierten en locks.
- La viabilidad del descanso participa desde el inicio de la construcción como obligación hard futura: no se permite completar primero el trabajo del plató y comprobar la comida sólo al final.

#### 7.2.2 Comida y bloques

- Una comida autorizada **no rompe continuidad operativa** y **no divide un bloque lógico**.
- El requisito hard es que exista un **intervalo completo libre** de la duración configurada dentro de la ventana de comida, compatible simultáneamente con todos los espacios y recursos afectados por la unidad.
- El descanso **nunca interrumpe una tarea en curso**.
- Al materializarlo, se prueban primero como `PREFERRED` los huecos cuyo inicio coincide con un cambio natural de escenario, espacio, setup o bloque y que permiten encajar íntegramente la duración configurada.
- Después se prefieren las fronteras entre concursantes/tareas productivas.
- Si ninguna frontera preferente permite encajar el descanso completo, puede utilizarse **cualquier otro hueco libre válido** dentro de la ventana, sobre la granularidad temporal efectiva del día.
- Las categorías anteriores ordenan candidatos de calidad; **no eliminan** el fallback de hueco libre ni convierten una frontera productiva en requisito hard.
- Si el descanso cae dentro del intervalo cronológico de un mismo bloque lógico, al reanudarse continúa ese mismo bloque: no aumenta `runCount`.
- Durante la construcción no es obligatorio fijar prematuramente la hora exacta. Sí es obligatorio mantener una **reserva virtual reparable**: después de cada decisión que afecte a la unidad debe seguir existiendo al menos un intervalo completo. Si una decisión consume el último hueco posible, la rama se poda inmediatamente.
- La reserva es existencial y puede desplazarse conforme se colocan tareas; que una tarea ocupe el witness anterior no invalida la rama si existe otro intervalo completo.
- Por tanto, el número de bloques se cuenta ignorando las interrupciones de comida autorizadas.

#### 7.2.3 Comida individual de concursantes

- Cada concursante A2 dispone de una comida individual `Sodexo` de **40 minutos** dentro de la ventana de comidas.
- La comida del concursante no depende del descanso del plató en el que esté trabajando.
- Durante cualquier decisión estructural debe conservarse al menos un hueco completo de 40 minutos para cada concursante pendiente de comer.
- Los probes incrementales pueden recalcular sólo las comidas causalmente afectadas si parten de un estado previamente certificado y la reducción es sound.
- **Antes de aceptar cualquier Stage A2**, debe certificarse de nuevo el conjunto global de comidas pendientes: cada concursante conserva al menos un intervalo completo y existe una realización conjunta compatible con `maxSimultaneous`. Un Stage no se acepta si alguna comida queda con dominio cero o si el conjunto es colectivamente imposible.
- La Evidence de cada Stage debe exponer, como mínimo, número de Sodexo pendientes/certificados, dominios cero y primer blocker cuando exista.

#### 7.2.4 Comida individual de Vocal Coaches

- Lucía y José María se utilizan en varias unidades —Caracola y Estudio 7— y **no están anclados a un único plató**.
- Por ello no heredan automáticamente la comida de Estudio 7 ni la de Caracola.
- Cada coach necesita su propia comida individual de **45 minutos** dentro de la ventana de comidas.
- Esta obligación debe participar en Future Feasibility de la arquitectura CORE: no puede aceptarse una geometría de bloques que deje al coach sin un intervalo completo de 45 minutos.
- La planificación humana A2 sirve como comprobación de factibilidad, no como horario hard: José María puede comer aproximadamente 14:00–14:45 y Lucía aproximadamente 13:00–13:45 en la referencia.

#### 7.2.5 Topología canónica de descansos operativos A2

La configuración A2 debe declarar explícitamente las unidades que poseen descanso operativo de 75 minutos. No se deducen por nombre de espacio, cercanía física ni coincidencia de recursos.

| Unidad de descanso | Ámbito operativo | Semántica |
|---|---|---|
| Estudio 7 | `Estudio 7` y recursos anclados a su operación según configuración efectiva | Un descanso REQUIRED de 75 min. |
| Plató 14 | `Recursos`, `Pasillo` y `Giratuto` de Plató 14 | Un único descanso REQUIRED de 75 min para el plató. |
| Plató 15 | `Croma` y `Estrellas/Sillón` | Un único descanso REQUIRED de 75 min para el plató. |
| Reality Unidad A | composición A = `CAM3 + SON1` | Descanso REQUIRED de 75 min propio e independiente de B. |
| Reality Unidad B | composición B = `CAM4 + SON2` | Descanso REQUIRED de 75 min propio e independiente de A. |
| Reality Unidad C | composición C = `CAM3 + CAM4 + SON1` | **No crea una tercera obligación de comida.** Es una recomposición de A/B y queda condicionada por la disponibilidad de sus miembros. |
| Salas Totales | `Totales 1` + `Totales Coreo` | Un único descanso REQUIRED de 75 min, sincronizado para ambas salas. |
| Estilismo | Estilismo entrada/salida | **Sin descanso operativo de plató de 75 min.** |
| Caracolas | Caracola Lucía + Caracola José María | **Sin descanso de espacio propio.** Los coaches comen individualmente 45 min. |

Reglas adicionales:

- Los descansos Reality A y Reality B **no tienen que coincidir**.
- Reality C no puede operar si cualquiera de sus recursos miembros está indisponible por el descanso de A o B, pero eso no constituye una comida C adicional.
- El descanso de Totales es común: las dos salas sincronizadas paran y reanudan como una unidad a efectos de comida.
- La pertenencia de un espacio auxiliar —por ejemplo Alfombra Roja o Totales Post— a una obligación de comida no se inferirá por nombre, proximidad ni por aparecer junto a Reality en la referencia humana. Sólo se bloquea por las unidades o recursos efectivos que realmente consuma.
- La topología de comidas es configuración de dominio A2, no lógica hardcodeada dentro de Planner Next.
- Un recurso físico compartido entre unidades no adquiere automáticamente una obligación adicional de comida por cada espacio en que trabaja. El descanso de un plató puede representarse por el ámbito de sus espacios; las comidas de unidades itinerantes se representan por sus composiciones de recursos. Sólo se duplica una obligación sobre el mismo recurso si existe configuración explícita que lo exija.

### 7.3 Traslado de coaches

- El mismo coach necesita un mínimo de **30 minutos** entre su última actividad en Caracola Vocal Coach y su siguiente actividad en Estudio 7. Esta transición Caracola→Estudio 7 es hard y se aplica al recurso coach, no al concursante.
- Esos 30 minutos no representan sólo desplazamiento: incluyen llegada y preparación necesaria para comenzar su **bloque completo** de ensayos en Estudio 7.
- Los 30 minutos **no se aplican en sentido Estudio 7→Caracola**. En ese sentido se utiliza únicamente el margen efectivo general o específico que esté configurado para la jornada; no se espeja automáticamente la preparación de ida.
- Toda alternancia de bloques debe comprobar las transiciones reales del coach antes de aceptar la cohorte.
- Un bloque main no es viable si sólo cabe ignorando el desplazamiento/preparación del coach o su comida individual.

### 7.4 Plató 15 — CAM2, Croma, Estrellas y Sillón

- CAM2 está asignada de forma efectiva tanto a `Plató 15 - Croma` como a `Plató 15 - Estrellas + Sillón`.
- Por compartir CAM2, una tarea de Croma **no puede solaparse** con una tarea de Estrellas o Sillón.
- La exclusividad se deriva del recurso compartido CAM2, además de la exclusividad propia de cada espacio.
- `Estrellas` y `Sillón` comparten el espacio `Plató 15 - Estrellas + Sillón`.
- Cada familia se agrupa en un único bloque.
- Se dejan **10 minutos de preparación del set** entre el bloque de Sillón y el de Estrellas.
- No se admite reentrada del tipo `Sillón → Estrellas → Sillón`.

### 7.5 Plató 14 — CAM1, Recursos, Pasillo y Giratuto

- CAM1 está asignada de forma efectiva a `Plató 14 - Recursos` y `Plató 14 - Pasillo`.
- Por compartir CAM1, cualquier tarea de Recursos y cualquier tarea de Pasillo **no pueden ejecutarse simultáneamente** entre sí.
- `Plató 14 - Giratuto` no consume CAM1 y puede operar simultáneamente con Recursos o Pasillo si el resto de restricciones lo permite.
- Corner Influencer, Corner Music y Corner Influencer + Music se realizan en `Plató 14 - Recursos/Corner` (zona 3, espacio 31).
- Redes se realiza exclusivamente en Otros / Maqui/Pelu (zona 14, espacio 39), fuera de P14 y sin CAM1. Puede coincidir con Corner o Pasillo cuando participantes, recursos explícitos y demás autoridades lo permitan.
- Son exclusivos: sólo un concursante a la vez.
- No requieren cambio de montaje y no se agrupan obligatoriamente por tipo.
- `Influencer + Music` es una tarea combinada de 15 minutos.
- **Scope Assisted A2:** `Recursos + Pasillo + Giratuto` constituyen una única unidad `Plató 14` para recomendación/encadenamiento de Stage. No se crean tres Stages sólo porque existan tres `spaceId`.
- Agrupar el scope no serializa artificialmente Giratuto con CAM1: Giratuto mantiene su paralelismo permitido; Recursos/Pasillo mantienen su exclusividad por CAM1.
- El descanso operativo de 75 min se decide una sola vez para la unidad Plató 14 y debe ser compatible con los tres subespacios conforme a §7.2.

### 7.6 Salas Totales

- `Totales 1` utiliza CAM5 y `Totales Coreo` utiliza CAM6.
- Las salas y sus cámaras son independientes, por lo que físicamente pueden trabajar en paralelo.
- Para A2 la simultaneidad de rondas es **REQUIRED**: las rondas comienzan simultáneamente mientras ambas salas estén activas.
- Cada tarea dura 30 minutos.
- El documento por espacios muestra 5 minutos de cambio de micro entre rondas consecutivas; debe modelarse como preparación o transición del espacio, no sumarse a la duración productiva del concursante.
- `Totales 1 + Totales Coreo` constituyen **una única unidad estructural de scope**. No se planifican como dos Stages independientes.
- Por tratarse de 19 obligaciones de 30 minutos organizadas en rondas sincronizadas y con un único descanso operacional, Totales es una unidad de alta presión temporal. En el A2 canónico debe cerrarse **antes que las tareas breves/flexibles de Plató 14 y antes de relegarlo a supporting closure de Estilismo**, salvo Evidence hard del estado concreto que obligue a otra elección.
- “Totales temprano” es una relación de prioridad de construcción, no una hora fija copiada del PDF.

### 7.6.1 Disponibilidad efectiva y margen terminal A2

Para el benchmark vigente, C01 conserva su restricción específica hasta las 15:30 y C02–C19 pueden permanecer operativos hasta las 19:00. Esta disponibilidad pertenece al participante y no modifica el final global del día, que continúa a las 21:00.

La cadena terminal conserva `Estilismo salida` como penúltima obligación y `OUT` como última. El margen general de participante de 5 minutos no se inserta entre ambas porque la configuración específica declara `0` a la salida de Estilismo y `0` a la entrada de OUT. El resto de fronteras independientes sigue resolviendo el margen conforme a la configuración efectiva.

### 7.7 Transporte IN y OUT

#### 7.7.1 Autoridad común y configuración

- IN y OUT se agrupan mediante la **configuración efectiva de transporte de la aplicación**. El planificador no deduce capacidades, tamaños de grupo ni separaciones temporales a partir del benchmark humano.
- La configuración debe gobernar, como mínimo, `minimumGroupSize`, `maximumGroupSize`, `targetGroupSize` y `minGapMinutes` para cada dirección cuando corresponda.
- `minimumGroupSize` y `maximumGroupSize` son límites **hard**. Ningún grupo puede quedar por debajo del mínimo ni superar el máximo configurado.
- `targetGroupSize` expresa el tamaño de agrupación **objetivo/canónico**. Orienta cómo debe construir producción los paquetes y cómo se ordenan alternativas de calidad, pero **no es un mínimo hard ni una prueba negativa de viabilidad**. Un grupo residual menor que el target es válido si respeta el mínimo configurado.
- `minGapMinutes` significa **separación mínima entre inicios de grupos**, no parrilla fija de salidas. Con `minGapMinutes = 30`, por ejemplo, 09:00 → 09:45 es perfectamente válido; no existe obligación de utilizar únicamente 09:00, 09:30, 10:00, etc.
- Dos operaciones de transporte con el mismo inicio efectivo constituyen un único grupo sincronizado a efectos de cardinalidad. Por tanto, no pueden utilizarse varios “grupos simultáneos” para eludir `maximumGroupSize`.
- Los horarios humanos de IN/OUT son referencia de benchmark y no deben convertirse automáticamente en disponibilidades hard, seed ni horas preferidas.

#### 7.7.2 Construcción canónica de IN

Cuando los concursantes son operacionalmente equivalentes respecto al transporte —es decir, su identidad no introduce una restricción hard adicional que obligue a una composición distinta— producción construye `IN` de esta forma:

1. Calcular para cada concursante una **presión efectiva de apertura** a partir de su fin de disponibilidad, primera obligación efectiva posterior a IN, carga mínima futura, slack/dominio, dependencias y participación en unidades críticas. Estas magnitudes ordenan; no crean por sí solas una nueva HARD.
2. Ordenar primero por mayor presión efectiva. Cuando dos concursantes sean materialmente equivalentes, puede usarse la primera obligación efectiva y finalmente un desempate canónico determinista.
3. Formar paquetes consecutivos buscando `targetGroupSize`, sin superar `maximumGroupSize` ni violar `minimumGroupSize`. Los intercambios dentro de una firma operacional realmente equivalente no justifican permutaciones factoriales.
4. Colocar los paquetes **desde el primero hacia el último**, comenzando en el inicio hard-válido más temprano del día/configuración. Cada paquete posterior comienza tan pronto como sea válido respetando `minGapMinutes` respecto al anterior y todas las disponibilidades/dependencias aplicables. `minGapMinutes` sigue siendo un mínimo, no una parrilla: 09:00 → 09:45 es válido con `minGapMinutes=30`.
5. Si una disponibilidad, dependencia, recurso o primera obligación rompe la equivalencia, el solver conserva alternativas exactas de membresía/posición y nunca declara inviabilidad por fallar únicamente la construcción preferente.

Ejemplo A2: con jornada desde 09:00, `targetGroupSize=3`, `maximumGroupSize=3` y `minGapMinutes=30`, la construcción preferente comienza el primer grupo a las 09:00 y los siguientes en el primer inicio hard-válido que respete al menos 30 minutos de separación. No existe obligación de usar 09:30 exactos si otra causa exige 09:45, pero tampoco se retrasa un grupo a 09:45 sólo para reducir espera si 09:30 es hard-válido.

La finalidad operativa es **abrir capacidad cuanto antes y maximizar slack para el resto de obligaciones del concursante y del día**. La minimización de permanencia no es el objetivo canónico de IN A2 salvo configuración futura explícita que así lo establezca.

#### 7.7.3 Construcción canónica de OUT

Cuando la composición de los grupos es operacionalmente equivalente, `OUT` se construye de forma simétrica respecto a la permanencia, pero con propagación temporal hacia delante:

1. Ordenar los concursantes por el final de su **última obligación efectiva anterior a OUT**, de más temprana a más tardía. Quien queda libre antes tiene prioridad para salir antes.
2. Formar paquetes consecutivos siguiendo ese orden y buscando `targetGroupSize`, respetando los límites hard de tamaño.
3. Para cada paquete, calcular su **límite local más temprano**: manda el integrante que termina más tarde, porque el grupo no puede salir hasta que todos sus miembros estén libres.
4. Colocar los paquetes **desde el primero hacia el último**. El primero sale lo antes posible. Cada paquete siguiente sale lo antes posible respetando tanto su límite local como `minGapMinutes` respecto al paquete anterior.
5. Conceptualmente, para paquetes consecutivos `i-1` e `i`, el inicio de `i` no puede ser anterior a `inicio(i-1) + minGapMinutes`, además de no preceder a la liberación del último integrante de su propio paquete.

Ejemplo: si el paquete A está completamente libre a las 16:50, el paquete B a las 17:05 y `minGapMinutes = 30`, A sale a **16:50** y B no puede salir antes de **17:20**.

Si `targetGroupSize = 1`, cada concursante debe poder realizar OUT tan pronto como quede libre, sujeto únicamente a los límites hard y a la separación mínima configurada. Si `minGapMinutes = 0`, no se añade espera artificial; la cardinalidad simultánea continúa limitada por `maximumGroupSize`.

La finalidad operativa es que el concursante abandone producción **lo antes posible después de completar todas sus obligaciones**, sin retención innecesaria.

#### 7.7.4 Equivalencia, fallback y exactitud

- La agrupación consecutiva anterior es la **construcción canónica de producción** cuando las identidades de los concursantes son intercambiables respecto a todas las restricciones hard de transporte. En ese caso, permutar miembros equivalentes no aporta una alternativa operacionalmente distinta.
- Si disponibilidad, dependencias, ventanas, locks, recursos, distinta duración o cualquier otra condición hard hace que una identidad no sea intercambiable, esa diferencia debe conservarse.
- Si la construcción canónica no puede certificarse o falla por una de esas diferencias, el planificador debe **abstenerse de declarar inviabilidad** y recurrir a una búsqueda exacta contabilizada que preserve las alternativas materialmente distintas.
- Un fallo de la agrupación preferente, del target o de una colocación greedy nunca constituye por sí solo una prueba negativa.
- La política exacta de OUT —incluidos tamaño objetivo, máximo, mínimo y separación— se toma de la configuración efectiva de la UI/snapshot del día; este documento no inventa un default adicional.

Para el A2 canónico, `IN` utiliza `targetGroupSize = 3` y `maximumGroupSize = 3`; su separación mínima configurada es de **30 minutos**. Esta cifra representa un mínimo entre grupos, no una parrilla fija. La configuración efectiva de OUT se conserva tal como esté declarada en el snapshot A2 aplicable.

### 7.8 Orden operativo de construcción del resto de A2

Después de cerrar provisionalmente la columna vertebral `Caracola feeder ↔ Estudio 7 main`, el A2 se construye por **unidades operativas**, preservando primero las ventanas de las estructuras largas, sincronizadas o con recursos escasos antes de rellenar trabajo breve.

Relaciones de prioridad A2:

1. pipeline Estudio 7 + Pruebas Vocales; si las Pruebas Vocales no se aceptan en el mismo scope visible, deben cerrarse inmediatamente alrededor del Main antes de unidades no relacionadas;
2. certificar globalmente Sodexo de los 19 concursantes pendientes y comidas de coaches;
3. cerrar/proteger la cadena `Reality C + EVA → Alfombra con EVA → Alfombra sin EVA`, porque consume la recomposición de recursos de Reality A/B y EVA desde las 16:00;
4. cerrar la unidad sincronizada **Salas Totales** suficientemente pronto: sus rondas de 30 minutos y baja flexibilidad prevalecen sobre P14/P15 breve cuando no exista una autoridad hard más crítica;
5. cerrar unidades de setup/recursos compartidos como Plató 15;
6. cerrar **Plató 14 como una única unidad** (`Recursos + Pasillo + Giratuto`), no como tres scopes por espacio;
7. materializar la agenda standalone **Reality A/B como un único problema de dos carriles**, utilizando el hueco pre-C y respetando sus comidas/transiciones; las horas exactas pueden intercalarse con otras unidades ya protegidas;
8. completar otras tareas intermedias/flexibles;
9. Estilismo salida y OUT, que deben llegar con todas sus obligaciones anteriores —incluido Sodexo— ya materializadas o con witness preservado.

Estas relaciones ordenan la **construcción y recomendación de scopes**, no imponen que las tareas ocurran cronológicamente en esa misma secuencia. El número exacto de Stage no es hard: puede variar si una unidad se acepta conjuntamente con supporting obligations. Lo normativo es la relación de presión y precedencia de razonamiento. En particular, “Totales debe aparecer pronto” no significa “Stage 5 exacto”; significa que no puede quedar detrás de P14/P15 breve o descubrirse por primera vez al cerrar Estilismo.

El planificador debe comportarse como un rompecabezas de dominios: cada colocación estructural habilita o elimina huecos del resto. Una rama se rechaza cuando cualquier obligación hard pendiente queda sin hueco, aunque todavía no se haya materializado.

### 7.9 Unidades recomendadas de scope A2

Estas identidades gobiernan la orquestación Assisted del benchmark. No sustituyen las restricciones internas de cada tarea.

| Unidad de scope | Contenido operativo | Regla de orquestación |
|---|---|---|
| Main pipeline | Estudio 7 + feeders Caracola considerados estructuralmente | Primera columna vertebral. |
| Reality C + EVA + Alfombra | Fases A/B/C de §8.2–8.3 | Una sola unidad estructural multi-espacio; antes que Reality A/B standalone. |
| Salas Totales | Totales 1 + Totales Coreo + cambios de micro + descanso común | Una sola unidad sincronizada de alta prioridad. |
| Plató 15 | Croma + Estrellas/Sillón + setup + descanso común | Una unidad de plató multi-espacio. |
| Plató 14 | Recursos + Pasillo + Giratuto + descanso común | Una unidad de plató multi-espacio. |
| Reality A/B | pool de operaciones elegibles sobre dos equipos itinerantes | Un scope coordinado de dos carriles, no un scope por localización. |
| Cierre participante | Sodexo materializado cuando corresponda + Estilismo salida + OUT | Final de cadena; nunca debe descubrir obligaciones estructurales largas omitidas. |

El recomendador puede alterar el orden entre unidades vecinas cuando Evidence hard/dominio del estado concreto lo justifique, pero debe registrar la causa. No puede degradar esta tabla a un sort por `spaceId`.

## 8. Operaciones especiales

### 8.1 Reality Plató

Afecta a C01, C05 y C08. El Reality dura 30 minutos y envuelve el Ensayo de Estudio 7:

- 15 minutos antes;
- 15 minutos de Ensayo de Estudio 7;
- 15 minutos después.

La ocupación del concursante y de la unidad Reality es continua durante 45 minutos. Los segmentos Reality no bloquean falsamente Estudio 7; únicamente el anchor de 15 minutos ocupa el plató principal.

### 8.1.1 Reality A/B — agenda coordinada de dos equipos

En el A2 canónico existen dos unidades itinerantes de mañana:

- Unidad A = `CAM3 + SON1`;
- Unidad B = `CAM4 + SON2`.

Las operaciones Reality standalone que no pertenezcan a la composición C son un **pool elegible para A o B** cuando sus requisitos efectivos sean equivalentes. La asignación concreta observada en el PDF humano sirve de benchmark, pero no fija `itinerantUnitId` por identidad de concursante.

Reglas A2:

- A y B pueden trabajar en paralelo.
- El solver debe repartir la carga entre ambos equipos y minimizar el makespan/intervalo activo conjunto sujeto a hard constraints; no debe dejar un equipo ocioso mientras el otro concentra todo el trabajo si existe una distribución equivalente mejor.
- Entre el final de una operación Reality independiente de un equipo y el inicio de la siguiente operación independiente del **mismo equipo** existe una transición/reposicionamiento `REQUIRED` de **15 minutos**, salvo que una operación compuesta declare `internalTransition = INCLUDED` o exista override explícito.
- Las operaciones `Reality Plató` ancladas alrededor de Estudio 7 consumen la unidad asignada durante su operación compuesta y participan en el matching/balanceo del bloque Reality.
- Reality C recompone `CAM3 + CAM4 + SON1` y, con EVA, ocupa esos recursos desde el inicio de su bloque crítico. Por ello la agenda A/B standalone debe quedar completada en la ventana **pre-C** y no puede invadir el bloque C+EVA/Alfombra.
- Las comidas operativas de A y B siguen siendo independientes de 75 minutos y forman parte de la construcción del bloque pre-C.
- El hecho de que la referencia humana muestre dos columnas, con arranques escalonados y reparto concreto de participantes, evidencia la estrategia de dos carriles; las horas y membresías exactas no son seed.

### 8.2 Reality C + EVA

Reality C es la recomposición `CAM3 + CAM4 + SON1`. En A2 sus operaciones requieren además a EVA, cuya disponibilidad comienza a las **16:00**. La referencia humana muestra un único bloque continuo:

- C06 · Lina Isabel García-Salcedo — Reality Hall, 30 min;
- C12 · Marta Fornali — Reality Control, 30 min;
- C11 · Linet Varela — Reality Buggy, 30 min;
- C04 · Carmen María Saborido — Alfombra Roja con EVA, 15 min;
- C13 · Eva Martín Fernández — Alfombra Roja con EVA, 15 min.

Las horas concretas de la referencia humana no se copian al problema. Sí se configuran como `REQUIRED` la disponibilidad de EVA, la asignación de C+EVA y la ausencia de huecos en el bloque de EVA/Unidad C. El cambio de Reality a Alfombra pertenece a la misma operación coordinada y no introduce un margen interno de recurso.

### 8.3 Alfombra Roja y Totales Post corregidos

- C04 y C13 ocupan Alfombra Roja mientras continúan consumiendo Reality C + EVA.
- A continuación, C06 y C10 realizan conjuntamente Alfombra Roja durante 10 minutos **sin EVA**.
- C16 realiza Alfombra Roja individual durante 10 minutos **sin EVA**.
- La unidad Alfombra Roja se configura con continuidad `REQUIRED` durante este bloque: no se permiten huecos entre la fase con EVA y la fase sin EVA.
- C06 y C10 realizan además Totales Post conjunto durante 5 minutos conforme a su relación sincronizada ya documentada.
- El PDF indica que al terminar la fase con EVA el equipo Reality se posiciona en Totales Post; cualquier movimiento o trabajo técnico independiente se modelará sólo si existe una obligación explícita con identidad, duración y recursos propios.

### 8.4 Cabecera técnica `Reality con EVA`: no constituye tres tareas adicionales

La cabecera naranja `Reality con EVA`, `20' secuencia`, `5' desmontaje y traslado`, `5' Totales Post` describe la configuración/receta operativa de la sección y **no** una cadena independiente de 30 minutos sin concursante. Tratarla como tarea adicional produce un solapamiento imposible desde las 16:00 con C06 utilizando los mismos recursos.

Por tanto:

- no se crean `Reality con EVA`, `Desmontaje y traslado` y `Totales Post técnico` como tres obligaciones canónicas adicionales;
- esos rótulos no se suman de nuevo a la duración de las actividades de concursante;
- si en una producción existe realmente una operación técnica independiente de ese tipo, deberá configurarse explícitamente y auditarse como cualquier otra tarea técnica.

## 9. Correcciones expresas sobre los PDFs

1. `NO P.15` se ignora como tarea.
2. Los tres bloques rojos iniciales son IN y deberían ser verdes.
3. C06 y C10: Alfombra Roja conjunta 10 min, seguida de Totales Post conjunto 5 min.
4. C16: Alfombra Roja 10 min; no Totales Post.
5. C09: el segundo Sodexo es un duplicado erróneo y se elimina.
6. C12: el bloque de comida de 5 min es erróneo; se sustituye por Sodexo de **40 min**. La referencia temporal humana puede ayudar a identificar la obligación, pero no fija su hora.
7. La guitarra blanca de C12 es atrezo y no cambia Corner Influencer.
8. El bloque `C` final de C13 es Estilismo de salida.
9. La cabecera `Reality con EVA / 20' secuencia / 5' desmontaje y traslado / 5' Totales Post` **no** crea tres tareas técnicas sin concursante. Describe la sección operativa de Unidad C + EVA; las obligaciones reales son las actividades de concursante y cualquier operación técnica futura que se configure explícitamente.

## 10. Plantilla de aplicación y referencia humana

La plantilla canónica `DÍA DE PRUEBA A2` debe representar:

- 19 concursantes anónimos;
- las tareas del cuadro canónico;
- dependencias explícitas;
- espacios y recursos;
- coaches y transiciones;
- familias de setup;
- operaciones ancladas y conjuntas;
- comidas y política de transporte;
- configuración de bloques del flujo principal;
- semántica de pipeline por coach entre Caracola y Estudio 7, sin copiar horarios humanos.

La plantilla **no debe** copiar los horarios humanos como planificación inicial. Los horarios de los PDFs se conservarán en un objeto de referencia separado para comparar el resultado generado por el planificador.

El universo canónico Full A2 contiene **266 registros de tarea asociados a concursantes**. La anterior suma de tres supuestas operaciones técnicas derivadas de la cabecera Reality con EVA queda retirada; por tanto, el total canónico vigente es de **266 obligaciones**. Cualquier operación técnica real sin concursante que se apruebe en el futuro deberá incorporarse explícitamente, versionar de nuevo esta Fuente 06 y actualizar la Fuente 05/Evidence aplicable.

## 11. Criterios de validación de la plantilla canónica

- 19 concursantes creados, sin nombres reales.
- Una y sólo una tarea IN, OUT, Estilismo entrada, Estilismo salida, Croma, Prueba vocal, Ensayo Estudio 7, Pasillo, Totales y Sodexo por concursante; Redes se crea para los 18 concursantes que la muestran en el desglose y no se crea para C05.
- Exactamente una asignación de coach por concursante.
- Todas las dependencias anteriores verificadas.
- Reality Plató completo o ausente; nunca parcial.
- Las operaciones C06 Reality Hall, C12 Reality Control, C11 Reality Buggy, C04 Alfombra con EVA y C13 Alfombra con EVA consumen explícitamente Unidad Reality C + EVA.
- EVA no se utiliza antes de las 16:00 y mantiene un único bloque sin huecos (`REQUIRED`).
- Unidad Reality C mantiene un único bloque A2 sin huecos; esta continuidad se aplica a la composición C, no a todo el historial diario de sus recursos miembros.
- Alfombra Roja permanece continua desde C04/C13 con C+EVA hasta C06+C10 y C16 sin EVA.
- No existen tres tareas técnicas adicionales derivadas de la cabecera `Reality con EVA`.
- Toda pareja de actividades independientes consecutivas de un concursante respeta un margen hard de 5 minutos por defecto, salvo override explícito; las operaciones compuestas con transición interna incluida conservan su adyacencia.
- C06/C10 sincronizados en Alfombra Roja y Totales Post.
- C09 con un único Sodexo.
- C12 con Sodexo de 40 minutos.
- Sillón y Estrellas agrupados, con preparación de 10 minutos y sin reentrada.
- Transición de coach Caracola → Estudio 7 de al menos 30 minutos; esos 30 minutos no se espejan en sentido Estudio 7 → Caracola.
- La Evidence A2 integral debe poder reconstruir la arquitectura de cuatro bloques main de referencia y sus bloques feeder correspondientes por coach, o justificar de forma objetiva una estructura distinta que la supere sin degradar completitud, continuidad, transiciones ni makespan.
- Ningún bloque de Estudio 7 se acepta si su cohorte no dispone previamente de Pruebas Vocales viables con el mismo coach.
- La igualdad de cohorte feeder/main no exige igualdad de orden interno salvo configuración `REQUIRED`.
- La topología de descansos A2 está reconciliada explícitamente: Estudio 7, Plató 14, Plató 15, Reality A, Reality B y Salas Totales sincronizadas tienen exactamente una obligación de 75 minutos; Reality C, Estilismo y Caracolas no crean obligaciones adicionales.
- Los descansos Reality A/B son independientes; Totales 1/Coreo comparten un único descanso sincronizado.
- Cada una de las seis obligaciones operativas A2 debe conservar durante toda la búsqueda al menos un intervalo completo de 75 minutos dentro de la ventana 13:00–16:30; la reserva puede repararse/moverse y sólo se materializa cuando corresponda.
- La comida autorizada puede interrumpir temporalmente el intervalo cronológico de un bloque sin incrementar el contador de bloques ni violar continuidad, siempre sin cortar una tarea en curso. Alinear la comida con un cambio natural de bloque/escenario/espacio/setup es `PREFERRED`; una frontera entre tareas es la siguiente preferencia; cualquier hueco libre completo dentro de la ventana es fallback hard-válido.
- Lucía y José María tienen comida individual propia de 45 minutos y no heredan automáticamente la comida de Estudio 7.
- Durante la construcción del eje central, cada concursante con Sodexo debe conservar al menos un hueco completo de **40 minutos** —o la duración efectiva configurada— dentro de su ventana, y cada Vocal Coach debe conservar su comida individual de 45 minutos.
- Totales, Reality/EVA y otras obligaciones escasas deben conservar al menos una posición antes de aceptar una decisión estructural que las pueda bloquear.
- La plantilla puede crearse repetidamente de forma idempotente o rechaza duplicados de manera explícita.
- No se escriben horarios planificados hasta ejecutar una simulación o una consolidación humana explícita.

## 12. Mapeo de anonimización

| Código | Nombre de referencia PDF | Coach | Sala Totales |
|---|---|---|---|
| C01 | Cristina Zuloaga | Lucía | Totales 1 |
| C02 | Moisés Salazar Ramírez | Lucía | Totales Coreo |
| C03 | Ángel González | Lucía | Totales 1 |
| C04 | Carmen María Saborido | Lucía | Totales Coreo |
| C05 | Julio Gómez | José María | Totales 1 |
| C06 | Lina Isabel García-Salcedo | José María | Totales Coreo |
| C07 | Naomi Inés Carretero | José María | Totales 1 |
| C08 | José Javier Cuenca | José María | Totales Coreo |
| C09 | Luis Belda | José María | Totales 1 |
| C10 | Gisela Montserrat | José María | Totales Coreo |
| C11 | Linet Varela | José María | Totales 1 |
| C12 | Marta Fornali | Lucía | Totales 1 |
| C13 | Eva Martín Fernández | Lucía | Totales 1 |
| C14 | Noa Marcos Díez | Lucía | Totales Coreo |
| C15 | Claudia Torrent | Lucía | Totales 1 |
| C16 | Adrián Darrel | José María | Totales Coreo |
| C17 | Nela García | José María | Totales 1 |
| C18 | Daniel Hernán Barres | José María | Totales Coreo |
| C19 | Pere Portero | José María | Totales Coreo |

---

Fin del documento.


---

# PARTE II — Cuadro canónico de tareas v1.3 consolidado

# Cuadro de tareas - DÍA DE PRUEBA A2

**Provenance:** antiguo Cuadro de tareas A2 v1.3, integrado aquí; no constituye una Fuente separada.  
**Finalidad vigente:** cuadro canónico de cotejo y validación funcional  
**Fuente:** los dos PDFs de Ensayo A2 más las correcciones expresas incorporadas en esta Fuente 06.

**Cambio v1.3 (13 de septiembre de 2026):** corrige Reality C/EVA/Alfombra y retira las tres falsas operaciones técnicas sin concursante derivadas de la cabecera `Reality con EVA`. C06 Reality Hall, C12 Reality Control, C11 Reality Buggy, C04 Alfombra con EVA y C13 Alfombra con EVA consumen Unidad C + EVA; EVA está disponible desde las 16:00 y su bloque, el de Unidad C y el de Alfombra son continuos según la configuración A2. El universo canónico queda en **266** obligaciones. Se incorpora como regla general el margen hard de concursante de 5 minutos por defecto entre actividades independientes consecutivas, con overrides configurables.

**Cambio v1.2 (3 de septiembre de 2026):** corrección de autoridad: Sodexo A2 dura **40 minutos** para todos los concursantes. La referencia anterior de 45 minutos se retira.

**Cambio v1.1 (3 de septiembre de 2026):** versión sustituida; había elevado erróneamente Sodexo a 45 minutos.

> El orden de cada fila reproduce la secuencia de la planificación humana para facilitar el cotejo. La futura plantilla no utilizará ese orden como seed ni fijará esos horarios: sólo conservará tareas, duraciones, espacios, recursos y dependencias.

## 1. Comprobaciones globales

- Concursantes: **19**.
- Registros de tarea asociados a concursantes: **266**.
- Operaciones técnicas sin concursante adicionales derivadas de la cabecera Reality con EVA: **0**.
- Cada concursante tiene exactamente una IN, una OUT, Estilismo entrada, Estilismo salida, Croma, Prueba vocal, Ensayo Estudio 7, Pasillo, una tarea de Totales y un Sodexo. Redes aparece en 18 concursantes; C05 no tiene esa actividad en los PDFs.
- C09 tiene un único Sodexo.
- C12 tiene Sodexo de 40 minutos.
- Los nombres reales son sólo para revisión; la app usará C01-C19.

## 2. Resumen variable por concursante

| Código | Nombre de referencia | Coach | Totales | Corner P.14 | Plató 15 montaje | Reality / Alfombra / especial | Giratuto |
|---|---|---|---|---|---|---|---|
| C01 | Cristina Zuloaga | Lucía | Totales 1 | — | — | Reality Plató anclado | Sí |
| C02 | Moisés Salazar Ramírez | Lucía | Totales Coreo | Corner Influencer | Sillón, Estrellas | — | — |
| C03 | Ángel González | Lucía | Totales 1 | Corner Influencer + Music | — | — | — |
| C04 | Carmen María Saborido | Lucía | Totales Coreo | — | — | Alfombra Roja con EVA · Unidad C + EVA | Sí |
| C05 | Julio Gómez | José María | Totales 1 | Corner Music | Sillón, Estrellas | Reality Plató anclado | — |
| C06 | Lina Isabel García-Salcedo | José María | Totales Coreo | Corner Music | Estrellas | Reality Hall · Unidad C + EVA; Alfombra Roja conjunta sin EVA; Totales Post conjunto | Sí |
| C07 | Naomi Inés Carretero | José María | Totales 1 | Corner Influencer | Sillón, Estrellas | — | — |
| C08 | José Javier Cuenca | José María | Totales Coreo | Corner Influencer + Music | — | Reality Plató anclado | — |
| C09 | Luis Belda | José María | Totales 1 | Corner Influencer | Sillón, Estrellas | Reality Influencer | — |
| C10 | Gisela Montserrat | José María | Totales Coreo | — | Sillón, Estrellas | Reality Manzano, Alfombra Roja conjunta, Totales Post conjunto | — |
| C11 | Linet Varela | José María | Totales 1 | Corner Influencer | Sillón | Reality Buggy · Unidad C + EVA | — |
| C12 | Marta Fornali | Lucía | Totales 1 | Corner Influencer | — | Reality Control · Unidad C + EVA | Sí |
| C13 | Eva Martín Fernández | Lucía | Totales 1 | — | Sillón, Estrellas | Alfombra Roja con EVA · Unidad C + EVA | Sí |
| C14 | Noa Marcos Díez | Lucía | Totales Coreo | Corner Influencer | — | — | Sí |
| C15 | Claudia Torrent | Lucía | Totales 1 | Corner Influencer | Sillón | — | Sí |
| C16 | Adrián Darrel | José María | Totales Coreo | Corner Influencer | — | Alfombra Roja sin EVA | — |
| C17 | Nela García | José María | Totales 1 | — | Estrellas | Reality Hall | — |
| C18 | Daniel Hernán Barres | José María | Totales Coreo | Corner Influencer | Sillón | — | — |
| C19 | Pere Portero | José María | Totales Coreo | Corner Influencer | — | Reality Corner Music | — |

## 3. Secuencia completa por concursante

### C01 - Cristina Zuloaga

- **Coach:** Lucía
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Croma (10 min) → Prueba vocal - Lucía (15 min) → Reality Plató anclado (15 + Ensayo Estudio 7 15 + 15 min) → Redes (5 min) → Pasillo (5 min) → Totales 1 (30 min) → Sodexo (40 min) → Giratuto (5 min) → Estilismo salida (5 min) → OUT (5 min)

### C02 - Moisés Salazar Ramírez

- **Coach:** Lucía
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Croma (10 min) → Corner Influencer (10 min) → Prueba vocal - Lucía (15 min) → Ensayo vocal - Estudio 7 (15 min) → Redes (5 min) → Pasillo (5 min) → Totales Coreo (30 min) → Sillón (5 min) → Sodexo (40 min) → Estrellas (5 min) → Estilismo salida (5 min) → OUT (5 min)

### C03 - Ángel González

- **Coach:** Lucía
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Croma (10 min) → Prueba vocal - Lucía (15 min) → Totales 1 (30 min) → Corner Influencer + Music (15 min) → Ensayo vocal - Estudio 7 (15 min) → Redes (5 min) → Pasillo (5 min) → Sodexo (40 min) → Estilismo salida (5 min) → OUT (5 min)

### C04 - Carmen María Saborido

- **Coach:** Lucía
- **Secuencia canónica para cotejo:** IN (5 min) → Prueba vocal - Lucía (15 min) → Estilismo entrada (10 min) → Croma (10 min) → Totales Coreo (30 min) → Ensayo vocal - Estudio 7 (15 min) → Pasillo (5 min) → Redes (5 min) → Sodexo (40 min) → Giratuto (5 min) → Alfombra Roja con EVA [Unidad C + EVA] (15 min) → Estilismo salida (5 min) → OUT (5 min)

### C05 - Julio Gómez

- **Coach:** José María
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Prueba vocal - José María (15 min) → Croma (10 min) → Corner Music (10 min) → Reality Plató anclado (15 + Ensayo Estudio 7 15 + 15 min) → Totales 1 (30 min) → Pasillo (5 min) → Sillón (5 min) → Sodexo (40 min) → Estrellas (5 min) → Estilismo salida (5 min) → OUT (5 min)

### C06 - Lina Isabel García-Salcedo

- **Coach:** José María
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Corner Music (10 min) → Croma (10 min) → Prueba vocal - José María (15 min) → Pasillo (5 min) → Redes (5 min) → Ensayo vocal - Estudio 7 (15 min) → Totales Coreo (30 min) → Sodexo (40 min) → Estrellas (5 min) → Giratuto (5 min) → Reality Hall [Unidad C + EVA] (30 min) → Alfombra Roja conjunta [sin EVA] (10 min) → Totales Post conjunto (5 min) → Estilismo salida (5 min) → OUT (5 min)

### C07 - Naomi Inés Carretero

- **Coach:** José María
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Corner Influencer (10 min) → Croma (10 min) → Prueba vocal - José María (15 min) → Totales 1 (30 min) → Pasillo (5 min) → Redes (5 min) → Ensayo vocal - Estudio 7 (15 min) → Sillón (5 min) → Sodexo (40 min) → Estrellas (5 min) → Estilismo salida (5 min) → OUT (5 min)

### C08 - José Javier Cuenca

- **Coach:** José María
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Prueba vocal - José María (15 min) → Croma (10 min) → Corner Influencer + Music (15 min) → Totales Coreo (30 min) → Pasillo (5 min) → Redes (5 min) → Reality Plató anclado (15 + Ensayo Estudio 7 15 + 15 min) → Sodexo (40 min) → Estilismo salida (5 min) → OUT (5 min)

### C09 - Luis Belda

- **Coach:** José María
- **Secuencia canónica para cotejo:** IN (5 min) → Prueba vocal - José María (15 min) → Estilismo entrada (10 min) → Croma (10 min) → Corner Influencer (10 min) → Reality Influencer (30 min) → Pasillo (5 min) → Redes (5 min) → Ensayo vocal - Estudio 7 (15 min) → Sillón (5 min) → Sodexo (40 min) → Estrellas (5 min) → Totales 1 (30 min) → Estilismo salida (5 min) → OUT (5 min)

### C10 - Gisela Montserrat

- **Coach:** José María
- **Secuencia canónica para cotejo:** IN (5 min) → Prueba vocal - José María (15 min) → Estilismo entrada (10 min) → Reality Manzano (30 min) → Croma (10 min) → Pasillo (5 min) → Redes (5 min) → Ensayo vocal - Estudio 7 (15 min) → Sillón (5 min) → Estrellas (5 min) → Sodexo (40 min) → Totales Coreo (30 min) → Alfombra Roja conjunta (10 min) → Totales Post conjunto (5 min) → Estilismo salida (5 min) → OUT (5 min)

### C11 - Linet Varela

- **Coach:** José María
- **Secuencia canónica para cotejo:** IN (5 min) → Prueba vocal - José María (15 min) → Estilismo entrada (10 min) → Croma (10 min) → Corner Influencer (10 min) → Pasillo (5 min) → Redes (5 min) → Ensayo vocal - Estudio 7 (15 min) → Sillón (5 min) → Sodexo (40 min) → Totales 1 (30 min) → Reality Buggy [Unidad C + EVA] (30 min) → Estilismo salida (5 min) → OUT (5 min)

### C12 - Marta Fornali

- **Coach:** Lucía
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Croma (10 min) → Pasillo (5 min) → Redes (5 min) → Prueba vocal - Lucía (15 min) → Sodexo (40 min) → Giratuto (5 min) → Ensayo vocal - Estudio 7 (15 min) → Totales 1 (30 min) → Corner Influencer (10 min) → Reality Control [Unidad C + EVA] (30 min) → Estilismo salida (5 min) → OUT (5 min)

### C13 - Eva Martín Fernández

- **Coach:** Lucía
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Totales 1 (30 min) → Croma (10 min) → Pasillo (5 min) → Redes (5 min) → Sillón (5 min) → Prueba vocal - Lucía (15 min) → Sodexo (40 min) → Giratuto (5 min) → Estrellas (5 min) → Ensayo vocal - Estudio 7 (15 min) → Alfombra Roja con EVA [Unidad C + EVA] (15 min) → Estilismo salida (5 min) → OUT (5 min)

### C14 - Noa Marcos Díez

- **Coach:** Lucía
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Totales Coreo (30 min) → Croma (10 min) → Pasillo (5 min) → Redes (5 min) → Sodexo (40 min) → Prueba vocal - Lucía (15 min) → Giratuto (5 min) → Ensayo vocal - Estudio 7 (15 min) → Corner Influencer (10 min) → Estilismo salida (5 min) → OUT (5 min)

### C15 - Claudia Torrent

- **Coach:** Lucía
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Croma (10 min) → Pasillo (5 min) → Redes (5 min) → Totales 1 (30 min) → Corner Influencer (10 min) → Sillón (5 min) → Prueba vocal - Lucía (15 min) → Giratuto (5 min) → Sodexo (40 min) → Ensayo vocal - Estudio 7 (15 min) → Estilismo salida (5 min) → OUT (5 min)

### C16 - Adrián Darrel

- **Coach:** José María
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Croma (10 min) → Pasillo (5 min) → Redes (5 min) → Totales Coreo (30 min) → Corner Influencer (10 min) → Sodexo (40 min) → Prueba vocal - José María (15 min) → Ensayo vocal - Estudio 7 (15 min) → Alfombra Roja [sin EVA] (10 min) → Estilismo salida (5 min) → OUT (5 min)

### C17 - Nela García

- **Coach:** José María
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Croma (10 min) → Reality Hall (30 min) → Pasillo (5 min) → Redes (5 min) → Estrellas (5 min) → Sodexo (40 min) → Prueba vocal - José María (15 min) → Ensayo vocal - Estudio 7 (15 min) → Totales 1 (30 min) → Estilismo salida (5 min) → OUT (5 min)

### C18 - Daniel Hernán Barres

- **Coach:** José María
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Croma (10 min) → Pasillo (5 min) → Redes (5 min) → Sillón (5 min) → Sodexo (40 min) → Corner Influencer (10 min) → Prueba vocal - José María (15 min) → Totales Coreo (30 min) → Ensayo vocal - Estudio 7 (15 min) → Estilismo salida (5 min) → OUT (5 min)

### C19 - Pere Portero

- **Coach:** José María
- **Secuencia canónica para cotejo:** IN (5 min) → Estilismo entrada (10 min) → Croma (10 min) → Pasillo (5 min) → Redes (5 min) → Reality Corner Music (30 min) → Corner Influencer (10 min) → Prueba vocal - José María (15 min) → Totales Coreo (30 min) → Sodexo (40 min) → Ensayo vocal - Estudio 7 (15 min) → Estilismo salida (5 min) → OUT (5 min)

## 4. Cabecera técnica `Reality con EVA` — corrección

La cabecera del PDF `Reality con EVA / 20' secuencia / 5' desmontaje y traslado / 5' Totales Post` **no se planifica como tres obligaciones sin concursante**. Describe la configuración/receta de la sección Reality C + EVA y no debe duplicar las actividades de C06, C12, C11, C04 y C13.

Si una operación técnica independiente debe existir en otra jornada, tendrá identidad, duración, recursos y dependencias explícitas y se añadirá al conteo canónico de esa versión.

### 4.1 Estructura continua autoritativa

La continuidad A2 no es una lista totalmente ordenada de siete identidades. Es una **secuencia de tres fases**. El orden de las fases es REQUIRED; el orden interno de las tareas de cada fase es flexible salvo que otra autoridad hard efectiva lo restrinja.

#### Fase A — Reality C + EVA

Deben ejecutarse consecutivamente, sin huecos entre sí, las tres obligaciones siguientes, en **cualquier orden factible**:

- C06 — Reality Hall — 30 min — Unidad C + EVA.
- C12 — Reality Control — 30 min — Unidad C + EVA.
- C11 — Reality Buggy — 30 min — Unidad C + EVA.

No existe precedencia hard `C06 → C12 → C11`. Esa fue únicamente la permutación utilizada en la planificación humana de referencia.

#### Fase B — Alfombra + Reality C + EVA

Inmediatamente después de la Fase A deben ejecutarse, sin huecos entre sí y en **cualquier orden factible**:

- C04 — Alfombra Roja con EVA — 15 min — Unidad C + EVA.
- C13 — Alfombra Roja con EVA — 15 min — Unidad C + EVA.

No existe precedencia hard `C04 → C13`.

#### Fase C — Alfombra Roja sin EVA

Inmediatamente después de la Fase B deben ejecutarse, sin huecos del espacio Alfombra y en **cualquier orden factible**:

- operación conjunta C06 + C10 — Alfombra Roja conjunta — 10 min;
- C16 — Alfombra Roja — 10 min.

La operación conjunta representa simultáneamente a **C06 Lina Isabel García-Salcedo** y **C10 Gisela Montserrat**. Ambos miembros deben comenzar y terminar juntos; no puede degradarse a dos tareas independientes ni perder a uno de los participantes.

`Totales Post conjunto` de C06+C10 mantiene su dependencia respecto de la Alfombra Roja conjunta, pero **no pertenece a la continuidad física de ocupación de Alfombra**. Puede coexistir temporalmente con otra tarea de Alfombra cuando sus propias autoridades de participante, espacio y recursos lo permitan.

#### Continuidad entre fases y disponibilidad

- Fase A → Fase B: consecutivas, conservando la continuidad de Unidad C + EVA.
- Fase B → Fase C: consecutivas, conservando la continuidad del espacio Alfombra; EVA deja de ser necesaria en la Fase C.
- EVA está disponible desde las 16:00.
- La estructura productiva A+B+C dura 140 minutos.
- Las horas humanas y las permutaciones concretas observadas en los PDFs son benchmark de comparación; nunca seed, hint, lock ni orden hard para el motor.

Una comprobación de factibilidad futura debe demostrar la existencia de **alguna permutación autorizada** de cada fase y alguna posición temporal completa compatible. No puede declarar `ZERO_DOMAIN` después de probar únicamente la permutación humana.

## 4.2 Margen de concursante

Entre dos actividades independientes consecutivas de un mismo concursante se aplica por defecto un margen hard de **5 minutos**, aunque estén en el mismo plató. Los overrides de margen previo/posterior pueden establecer `0`, `30` u otro valor configurado. Las fases internas de una operación compuesta con transición incluida no reciben ese margen entre sí.

## 5. Conteo por tipo de tarea

| Tipo | Registros |
|---|---:|
| Croma | 19 |
| Ensayo vocal - Estudio 7 | 19 |
| Estilismo entrada | 19 |
| Estilismo salida | 19 |
| IN | 19 |
| OUT | 19 |
| Pasillo | 19 |
| Sodexo | 19 |
| Redes | 18 |
| Prueba vocal - José María | 11 |
| Corner Influencer | 10 |
| Totales 1 | 10 |
| Sillón | 9 |
| Totales Coreo | 9 |
| Estrellas | 8 |
| Prueba vocal - Lucía | 8 |
| Giratuto | 7 |
| Reality Plató - antes | 3 |
| Reality Plató - después | 3 |
| Alfombra Roja con EVA | 2 |
| Alfombra Roja conjunta | 2 |
| Corner Influencer + Music | 2 |
| Corner Music | 2 |
| Reality Hall | 2 |
| Totales Post conjunto | 2 |
| Alfombra Roja | 1 |
| Reality Buggy | 1 |
| Reality Control · Unidad C + EVA | 1 |
| Reality Corner Music | 1 |
| Reality Influencer | 1 |
| Reality Manzano | 1 |

---

Fin del cuadro de revisión.
