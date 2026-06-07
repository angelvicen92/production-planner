# ENGINE V3 OPERATIONAL QUALITY EXPORT — ID 030

## Problema

Un planning hard-valid garantiza que no se han detectado infracciones obligatorias, pero no que el día tenga buena calidad operativa. Un plan puede ser factible y aun así alargar la jornada de un coach, dejar a un talent esperando durante horas, separar feeders del Main Stage o fragmentar el transporte.

ID 030 añade una lectura compacta de esos síntomas al JSON existente. Es diagnóstico puro: no cambia el motor, scoring, CP-SAT, base de datos, migraciones ni RLS.

## Datos utilizados

La vista de detalle ya dispone del planning final completo en `plan.dailyTasks`, el catálogo de concursantes y el mapa de nombres de recursos que usa la timeline. El export reutiliza esos datos y la configuración existente de transporte; no descarga un payload nuevo ni crea un endpoint pesado.

Solo se consideran tareas con `startPlanned` y `endPlanned` válidos. Los cálculos toleran campos ausentes, templates incompletos, planes sin coaches y recursos sin nombre.

## Qué mide

### Talents

Por cada talent detectable se calculan:

- número de tareas, primera hora y última hora;
- `spanMinutes`, desde el inicio de la primera tarea hasta el final de la última;
- `activeMinutes`, unión de intervalos de trabajo para no duplicar solapes;
- `idleMinutes`, `idleRatio`, hueco máximo y número de huecos de al menos 45 minutos;
- número de tareas de Main Stage;
- primera llegada y última salida detectables;
- warnings compactos para span de al menos 360 minutos, idle de al menos 50% o huecos grandes.

Se exportan como máximo los 15 peores casos, ordenados por idle y después por span.

### Coaches y recursos críticos

La detección es conservadora: un recurso asignado se considera coach cuando está referenciado por la configuración `vocalCoachPlanResourceItemId` de un concursante o cuando su nombre contiene `coach` o `vocal`, ignorando mayúsculas y acentos. Para cada coach se calculan span, tiempo activo, idle, ratio, hueco máximo, tareas y bloques de sesión. Un hueco de al menos 45 minutos abre un nuevo bloque y permite señalar una jornada partida.

Se exportan como máximo 10 coaches. Si ningún recurso asignado cumple la heurística, `coachAnalysisAvailable=false` incluye una explicación; no se asume que el plan esté mal ni que haya coaches configurados.

### Feeders y Main Stage

Una tarea principal solo se reconoce si su nombre/template/ubicación contiene `Main Stage` o `Plató 7`. Un feeder previo del mismo talent debe contener una señal explícita entre `prueba vocal`, `coach`, `ensayo`, `totales`, `reality` o `preparación`. Para cada tarea principal se toma el feeder reconocido que termina más cerca antes de ella.

El export presenta media, máximo y hasta 10 casos. Si no existe un emparejamiento fiable, devuelve `feederAnalysisAvailable=false`; no inventa relaciones a partir del mero orden temporal.

### Transporte

Las tareas se clasifican como `IN`/`OUT` con los nombres configurados de llegada y salida y, como fallback, términos explícitos como llegada/salida. Se agrupan por hora efectiva de llegada o salida y se calculan:

- máximo de concurrencia temporal observado;
- spacing medio entre grupos de la misma dirección;
- comparación con `vanCapacity` cuando es mayor que cero;
- warnings compactos por exceso de capacidad o grupos aislados.

Se exportan como máximo 12 grupos y nunca las tareas de transporte completas.

## Cómo interpretar el resumen

`overallOperationalQuality` se representa en `operationalQuality.summary`:

- `good`: hay datos analizables y no se activaron los umbrales de concern.
- `review`: existe al menos un síntoma que merece revisión humana.
- `poor`: se acumulan tres o más casos severos, como idle superior al 65%, spans de nueve horas, gaps feeder de tres horas o exceso de capacidad.
- `unknown`: no había tareas planificadas válidas para analizar.

El score 0–100 es una ayuda simple derivada del número de concerns y casos severos; no es una función objetivo del motor ni debe compararse como benchmark científico. `positiveSignals` recoge señales favorables solo cuando el análisis correspondiente está disponible.

## Límites del payload

El export limita estrictamente:

- 15 talents;
- 10 coaches;
- 10 casos feeder;
- 12 grupos de transporte;
- 5 concerns y 4 señales positivas.

No incluye notas, canciones, disponibilidades, datos personales adicionales, input completo del motor ni listado completo de tareas. Los tests ejercitan una entrada de 2.000 tareas y exigen un snapshot inferior a 30 KB.

## Limitaciones

- Es heurístico y depende parcialmente de nombres, templates, ubicaciones y asignaciones.
- Los umbrales son orientativos y no conocen todas las necesidades editoriales o de rodaje.
- Un análisis no disponible no equivale a ausencia de problemas.
- No sustituye la inspección de la timeline ni la validación humana.
- Todavía no cambia la planificación ni optimiza ninguna de estas métricas.

## Uso

1. Generar o abrir el planning final.
2. Ir al panel **Diagnóstico del motor**.
3. Pulsar **Copiar JSON** o **Descargar JSON**.
4. Compartir el snapshot con el asesor junto con cualquier observación operativa relevante.
5. Revisar primero `summary.mainConcerns` y después los top cases y flags de disponibilidad.

## Recomendación para ID 031

Elegir el siguiente objetivo según la evidencia real:

- si aparecen jornadas largas o partidas de coaches, añadir scoring de compactación de recursos críticos;
- si los feeders quedan lejos, reforzar el objetivo feeder-to-main;
- si los talents acumulan espera o spans largos, añadir un objetivo de participant span/idle;
- si transporte aparece disperso, revisar el objetivo de agrupación sin relajar capacidad.

ID 030 no implementa ninguna de esas modificaciones del motor.
