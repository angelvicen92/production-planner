# Documento Maestro de Interpretación del Ensayo A2

**Versión:** 1.0  
**Estado:** listo para revisión y aprobación como fuente de OptiPlan  
**Ámbito:** interpretación operativa de `ENSAYO_A2_LV.pdf` y `ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf`  
**Objetivo:** conservar de forma explícita las reglas necesarias para convertir los dos documentos humanos en una plantilla reproducible del `DÍA DE PRUEBA A2`, sin depender de colores, nombres, intuiciones ni conocimiento oral.

---

## 1. Autoridad y precedencia

La interpretación se resuelve con este orden de autoridad:

1. aclaraciones operativas expresas aportadas por el responsable de producción;
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
| Croma | 10 min | Plató 15 - Croma | Una persona cada vez; cámara 2; sin sonido. |
| Prueba vocal - Lucía | 15 min | Caracola Vocal Coach - Lucía | Debe preceder al Ensayo vocal de Estudio 7; usa a Lucía. |
| Prueba vocal - José María | 15 min | Caracola Vocal Coach - José María | Debe preceder al Ensayo vocal de Estudio 7; usa a José María. |
| Ensayo vocal - Estudio 7 | 15 min | Estudio 7 / Plató principal | Flujo principal; usa al mismo coach de la Prueba vocal. |
| Redes | 5 min | Plató 14 - Recursos | Una persona cada vez. |
| Pasillo | 5 min | Plató 14 - Pasillo | Una persona cada vez. |
| Totales 1 | 30 min | Salas Totales - Totales 1 | Rondas alineadas con Totales Coreo mientras ambas salas estén activas. |
| Totales Coreo | 30 min | Salas Totales - Totales Coreo | Rondas alineadas con Totales 1 mientras ambas salas estén activas. |
| Sodexo | 40 min | Comida del concursante | Obligación de comida individual; no es un bloqueo global. |
| Giratuto | 5 min | Plató 14 - Giratuto | Una persona cada vez. |
| Sillón | 5 min | Plató 15 - Estrellas + Sillón | Familia de montaje Sillón; agrupar en un bloque. |
| Estrellas | 5 min | Plató 15 - Estrellas + Sillón | Familia de montaje Estrellas; agrupar en un bloque. |
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

## 6. Dependencias y orden hard

1. `IN` es la primera obligación de cada concursante.
2. `OUT` es la última obligación de cada concursante.
3. `Estilismo salida` es siempre la penúltima obligación.
4. `Estilismo entrada` debe terminar antes de cualquier actividad del concursante, con dos únicas excepciones: `IN` y `Prueba vocal` en Caracola.
5. La `Prueba vocal` de Caracola debe terminar antes del `Ensayo vocal - Estudio 7` del mismo concursante.
6. Las dependencias se expresan por identidad de tarea; nunca se deducen por nombre, color o posición visual.
7. Una operación `Reality Plató` se representa como `before 15 min → Ensayo Estudio 7 15 min → after 15 min`, sin huecos y sin transición genérica entre sus tres fases.
8. `Alfombra Roja conjunta` y `Totales Post conjunto` de C06 y C10 son operaciones sincronizadas: ambos concursantes comienzan y terminan juntos.

## 7. Reglas de bloques, setup y sincronización

### 7.1 Flujo principal de Estudio 7

- Las tareas se agrupan por vocal coach.
- Para esta plantilla, el máximo inicial es **2 bloques por coach**, configurable desde la UI.
- Con Lucía y José María, el máximo total posible es 4 bloques.
- El motor debe minimizar los bloques sin romper viabilidad, dependencias, comidas, disponibilidades ni recursos.

### 7.2 Traslado de coaches

El mismo coach necesita un mínimo de **30 minutos** entre su última actividad en Caracola Vocal Coach y su siguiente actividad en Estudio 7. Esta transición es hard y se aplica al recurso coach, no al concursante.

### 7.3 Estrellas y Sillón

- Comparten el espacio `Plató 15 - Estrellas + Sillón`.
- Cada familia se agrupa en un único bloque.
- Se dejan **10 minutos de preparación del set** entre el bloque de Sillón y el de Estrellas.
- No se admite reentrada del tipo `Sillón → Estrellas → Sillón`.

### 7.4 Corner Influencer y Corner Music

- Se realizan en `Plató 14 - Recursos`.
- Son exclusivos: sólo un concursante a la vez.
- No requieren cambio de montaje y no se agrupan obligatoriamente por tipo.
- `Influencer + Music` es una tarea combinada de 15 minutos.

### 7.5 Salas Totales

- `Totales 1` y `Totales Coreo` son espacios independientes y pueden trabajar en paralelo.
- Las rondas comienzan simultáneamente mientras ambas salas estén activas.
- Cada tarea dura 30 minutos.
- El documento por espacios muestra 5 minutos de cambio de micro entre rondas consecutivas; debe modelarse como preparación o transición del espacio, no sumarse a la duración productiva del concursante.

### 7.6 Transporte IN y OUT

- IN y OUT se agrupan mediante la configuración de transporte de la aplicación.
- Default acordado para IN: mínimo 30 minutos entre grupos y mínimo 3 concursantes por grupo.
- La política exacta de OUT se toma de la configuración de transporte de la UI; este documento no inventa un default adicional.
- Los horarios humanos de IN/OUT no deben convertirse automáticamente en disponibilidades hard.

## 8. Operaciones especiales

### 8.1 Reality Plató

Afecta a C01, C05 y C08. El Reality dura 30 minutos y envuelve el Ensayo de Estudio 7:

- 15 minutos antes;
- 15 minutos de Ensayo de Estudio 7;
- 15 minutos después.

La ocupación del concursante y de la unidad Reality es continua durante 45 minutos. Los segmentos Reality no bloquean falsamente Estudio 7; únicamente el anchor de 15 minutos ocupa el plató principal.

### 8.2 Alfombra Roja y Totales Post corregidos

- C06 y C10 realizan conjuntamente Alfombra Roja durante 10 minutos.
- A continuación, C06 y C10 realizan conjuntamente Totales Post durante 5 minutos.
- C16 realiza Alfombra Roja individual durante 10 minutos.
- C04 y C13 realizan Alfombra Roja con EVA durante 15 minutos cada uno.

### 8.3 Operación técnica sin concursante

Existe una operación sin concursantes que ocupa recursos:

1. `Reality con EVA`: 20 minutos;
2. `Desmontaje y traslado`: 5 minutos;
3. `Totales Post técnico`: 5 minutos.

La secuencia es continua y consume, según el documento, CAM 3, CAM 4, SON 1 y EVA, además de las asignaciones de redacción/producción que se decidan representar como recursos exclusivos. No debe atribuirse a ningún concursante.

## 9. Correcciones expresas sobre los PDFs

1. `NO P.15` se ignora como tarea.
2. Los tres bloques rojos iniciales son IN y deberían ser verdes.
3. C06 y C10: Alfombra Roja conjunta 10 min, seguida de Totales Post conjunto 5 min.
4. C16: Alfombra Roja 10 min; no Totales Post.
5. C09: el segundo Sodexo es un duplicado erróneo y se elimina.
6. C12: el bloque de comida de 5 min es erróneo; se sustituye por Sodexo de 40 min, con la misma referencia temporal que C11.
7. La guitarra blanca de C12 es atrezo y no cambia Corner Influencer.
8. El bloque `C` final de C13 es Estilismo de salida.
9. La operación técnica Reality con EVA no tiene concursantes y sí consume recursos.

## 10. Plantilla de aplicación y referencia humana

La futura acción `Crear DÍA DE PRUEBA A2` debe crear:

- 19 concursantes anónimos;
- las tareas del cuadro canónico;
- dependencias explícitas;
- espacios y recursos;
- coaches y transiciones;
- familias de setup;
- operaciones ancladas y conjuntas;
- comidas y política de transporte;
- configuración de bloques del flujo principal.

La plantilla **no debe** copiar los horarios humanos como planificación inicial. Los horarios de los PDFs se conservarán en un objeto de referencia separado para comparar el resultado generado por el planificador.

El fixture Planner Next existente no representa todavía todo este documento: su corpus base contiene principalmente Prueba vocal y Estudio 7, ampliados con operaciones ancladas. El día completo aquí descrito contiene **266 registros de tarea asociados a concursantes** antes de añadir las tres operaciones técnicas sin concursante.

## 11. Criterios de validación de la futura plantilla

- 19 concursantes creados, sin nombres reales.
- Una y sólo una tarea IN, OUT, Estilismo entrada, Estilismo salida, Croma, Prueba vocal, Ensayo Estudio 7, Pasillo, Totales y Sodexo por concursante; Redes se crea para los 18 concursantes que la muestran en el desglose y no se crea para C05.
- Exactamente una asignación de coach por concursante.
- Todas las dependencias anteriores verificadas.
- Reality Plató completo o ausente; nunca parcial.
- C06/C10 sincronizados en Alfombra Roja y Totales Post.
- C09 con un único Sodexo.
- C12 con Sodexo de 40 minutos.
- Sillón y Estrellas agrupados, con preparación de 10 minutos y sin reentrada.
- Transición de coach Caracola → Estudio 7 de al menos 30 minutos.
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
