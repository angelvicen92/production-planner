# ENGINE V3 REAL WORLD VALIDATION — ID 024

## Objetivo

Esta guía describe cómo validar el Motor V3 con un plan real de forma guiada, repetible y auditable. La prueba debe permitir confirmar si el motor encontró una solución, qué fuente utilizó, qué mecanismos inteligentes intervienen, si quedan problemas de factibilidad o datos y si el resultado es útil para la operación.

La validación combina dos evidencias:

1. el diagnóstico compacto exportado por la aplicación, que contiene métricas, decisiones y warnings acotados;
2. la revisión humana del planning, necesaria para detectar decisiones técnicamente válidas pero poco prácticas.

No es una guía para modificar el motor ni sus reglas. Si aparece un problema, primero se registra la evidencia y después se clasifica como problema de datos, configuración, diagnóstico o algoritmo.

## Validación técnica previa

Antes de una revisión rápida de datos o documentación del motor se puede ejecutar:

```bash
npm run check
npm run test:engine:quick
npm run benchmark:engine:quick
```

La suite rápida de tests cubre las unidades críticas de Phase A, backtracking limitado, vecindarios operativos, piloto CP-SAT, scoring, validación de candidatos y resource bundles. El benchmark rápido cubre A, G, H, I, L, R y S. Esta ruta sirve para feedback temprano, pero no sustituye la regresión completa.

Antes de mergear cambios del Motor V3 deben ejecutarse siempre:

```bash
npm run check
npm run test:engine:full
npm run benchmark:engine:full
```

Los comandos históricos `npm run test:engine` y `npm run benchmark:engine` siguen disponibles y ejecutan la validación completa. Ninguna de estas suites sustituye la prueba real descrita en esta guía: quick reduce tiempo de feedback, full protege la regresión sintética y la revisión en app valida utilidad operativa con datos reales.

## Preparación del plan

Antes de generar, comprobar:

- [ ] Zonas y espacios cargados.
- [ ] Recursos disponibles cargados.
- [ ] Talents cargados.
- [ ] Tareas del día asignadas.
- [ ] Duraciones revisadas.
- [ ] Dependencias revisadas.
- [ ] Comida y bloques globales configurados.
- [ ] Disponibilidades restrictivas cargadas.
- [ ] Locks manuales revisados.
- [ ] Estados `done`/`in_progress` presentes solo si se está probando un replan real.

Conviene anotar antes de ejecutar cualquier expectativa operativa importante: quién se va pronto, qué recurso es crítico, qué tarea debería ocurrir antes que otra o qué tramo de Main Stage no debería quedar parado. Esto evita reinterpretar las expectativas después de ver el resultado.

## Ejecución

1. Abrir el plan real que se quiere validar.
2. Ejecutar la generación del planning.
3. Esperar a que la ejecución termine y la vista muestre el resultado.
4. Abrir el panel **Diagnóstico del motor**.
5. Revisar las métricas principales y los warnings.
6. Usar **Copiar JSON** o **Descargar JSON** para conservar el snapshot compacto.
7. Guardar observaciones humanas sobre la utilidad operativa del planning.

No repetir inmediatamente la generación para intentar obtener un resultado más favorable: primero hay que guardar el diagnóstico y las observaciones de la ejecución que se está evaluando.

## Qué revisar

### Resultado y fuente de solución

- **`solutionSource`**: identifica la fuente de la solución finalmente seleccionada. Permite distinguir, por ejemplo, una salida greedy, de backtracking, neighborhood o CP-SAT. Indica qué candidato ganó, no que las demás técnicas no se hayan intentado.
- **Estado de la ejecución**: confirma si terminó con éxito, fue infactible o acabó con error.
- **`hardConstraintViolations`**: debe ser `0`. Un valor mayor que cero significa que la salida contradice al menos una restricción dura y debe tratarse como fallo crítico.
- **`plannedTasks` / `unplannedTasks`**: muestran la cobertura. Toda tarea sin planificar debe tener una explicación conocida y operativamente aceptable.

### Calidad operativa

- **`mainStageGapMinutes`**: minutos totales de hueco detectados en Main Stage. Un valor bajo no garantiza por sí solo un buen plan, pero uno alto exige revisar dónde y por qué se detiene el escenario.
- **`coachSwitchCount`**: número de cambios de coach. Debe interpretarse según el día real; un valor alto puede ser aceptable si las restricciones lo obligan, pero puede revelar demasiada fragmentación.
- **`restrictiveTalentAverageStartOffset`**: retraso medio de inicio de talents restrictivos respecto a su referencia. Cuanto mayor sea, más importante es comprobar disponibilidades y riesgo de salida temprana.
- **`selectedCandidateMetricsConsistent`**: cuando aparezca dentro de las métricas seleccionadas, debe ser `true`; confirma que las métricas describen la salida final seleccionada.

### Inteligencia utilizada

- **`candidateSolutionsEvaluated`**: número de soluciones candidatas comparadas. Ayuda a saber si hubo selección entre alternativas, pero un número alto no garantiza calidad.
- **Backtracking**: revisar por separado `backtrackingAttempted` y `backtrackingAccepted`. “Intentado” indica que se exploró; “aceptado”, que su candidato quedó incorporado o seleccionado según la metadata disponible.
- **Neighborhoods**: revisar `neighborhoodSearchAttempted`, `neighborhoodCandidatesGenerated` y `neighborhoodCandidateAccepted`. Permiten saber si hubo búsqueda local y si alguna alternativa fue aceptada.
- **`cpSatPilot` / `cpSatSegments`**: comprobar intentos y aceptaciones. Que CP-SAT no se intente puede ser normal si el caso queda fuera de sus límites; que se intente no implica que su solución sea la final.

La combinación de `solutionSource` y estos flags es la forma correcta de responder qué técnica se usó: la fuente explica el resultado elegido y los flags explican la búsqueda realizada.

### Recursos y bundles

- **Resource warnings**: revisar códigos, mensajes y tareas afectadas. Pueden señalar datos incompletos, recursos compuestos dudosos o condiciones que requieren comprobación humana.
- **Bundle warnings**: revisar bundles inválidos o parcialmente utilizables. Los bundles son una señal soft; un warning no implica automáticamente que el planning sea infactible, pero sí que la recomendación puede apoyarse en información incompleta.
- Comparar los contadores de bundles declarados, utilizables, inválidos y parcialmente utilizables. Una diferencia inesperada debe investigarse antes de atribuir el resultado al algoritmo.

### Revisión humana

Además de las métricas, recorrer visualmente el planning y responder:

- ¿Respeta la lógica real del rodaje?
- ¿Los talents restrictivos aparecen suficientemente pronto?
- ¿Los recursos y espacios críticos se usan de forma creíble?
- ¿Los huecos y cambios tienen una causa comprensible?
- ¿Los locks y las tareas `done`/`in_progress` permanecen donde corresponde?
- ¿El equipo podría ejecutar este planning sin reorganizarlo de forma sustancial?

## Semáforo de validación

### Verde

La ejecución puede considerarse validada inicialmente cuando:

- `hardConstraintViolations = 0`;
- `unplannedTasks = 0`, o las tareas no planificadas están justificadas;
- `selectedCandidateMetricsConsistent = true` cuando la métrica está disponible;
- no hay warnings críticos de recursos o bundles;
- el planning parece operativamente razonable tras revisión humana.

### Amarillo

La ejecución requiere explicación o ajustes menores cuando hay uno o varios de estos casos:

- tareas sin planificar con una explicación conocida;
- CP-SAT no se intenta por límites del piloto o de los segmentos;
- warnings no críticos de bundles o recursos;
- gaps moderados que no bloquean la operación;
- `coachSwitchCount` alto, pero aceptable para las restricciones del día.

Un resultado amarillo debe conservarse con su JSON y observación antes de corregir datos o volver a generar.

### Rojo

La ejecución no debe aceptarse como válida cuando:

- `hardConstraintViolations > 0`;
- se han movido tareas `done`/`in_progress` o locks manuales que debían preservarse;
- la planificación está incompleta sin explicación;
- existen warnings críticos que revelan datos inválidos o insuficientes;
- `selectedCandidateMetricsConsistent = false`;
- el resultado es claramente inútil operativamente aunque sea técnicamente factible.

## Qué pasar al asesor

Compartir únicamente la evidencia necesaria:

1. **JSON exportado desde el panel**. Es un snapshot compacto; no incluye el planning completo ni los payloads gigantes del motor.
2. **Captura del planning**, solo si ayuda a mostrar el problema y no expone información sensible innecesaria.
3. **Breve observación humana**, completando la plantilla incluida en `humanReviewTemplate` o acompañando el JSON con este formato:

```text
observedIssue: “me parece mal porque...”
expectedBehavior: “esperaba que X fuese antes...”
criticalTalentOrResource: “talent Y se va pronto...”
notes: “Plató principal queda parado en...”
```

Los campos de `humanReviewTemplate` se exportan como `null` para que el usuario añada contexto al pegar o adjuntar el snapshot. No deben rellenarse con datos personales innecesarios. No se debe compartir el input completo del motor, el planning completo, disponibilidades completas, inventarios completos ni otros datos sensibles.

## Limitaciones actuales

- El resultado todavía requiere validación humana: las métricas no capturan toda la lógica de rodaje.
- Los benchmarks existentes son sintéticos y no sustituyen una prueba con datos reales.
- Los resource bundles aún funcionan como señal soft, no como restricción dura.
- CP-SAT se aplica mediante piloto y segmentos acotados, no como optimización global de todo el día.
- El diagnóstico resume la última ejecución y no sustituye la revisión visual del planning.
- El export está deliberadamente acotado: puede truncar warnings o metadata extensa y no contiene detalle por tarea ni payloads completos.

## Recomendación para siguiente fase

Después de la primera prueba real, clasificar las evidencias antes de definir el siguiente cambio funcional del motor. La siguiente fase debe elegirse según el problema observado:

- **corregir datos/configuración**, si faltan disponibilidades, recursos, dependencias, duraciones o locks correctos;
- **mejorar motor**, si los datos son correctos pero la selección produce un resultado repetidamente poco útil;
- **mejorar UI de diagnóstico**, si la ejecución es difícil de interpretar con la información compacta actual;
- **ajustar resource bundles**, si los warnings o la señal soft no representan el uso real de recursos;
- **ampliar CP-SAT**, si las pruebas muestran que los límites del piloto o de los segmentos dejan fuera un subproblema relevante.

No se recomienda ampliar el algoritmo en frío. El siguiente cambio funcional debe partir del JSON, la captura opcional y la observación humana de una ejecución real reproducible.

## ID 026 — Protocolo ante hard violations

Desde ID 026, la compuerta final impide que `generatePlanV3` entregue un plan hard-inválido como éxito y el servidor evita persistir sus tiempos. Si el panel muestra la alerta roja, el plan no debe usarse: exportar el JSON, revisar `hardConstraintViolationCodes` y analizar la muestra de hasta 50 `hardConstraintViolationDetails`.

El caso que motivó la regla fue una ejecución real con 219 tareas planificadas, 0 sin planificar y 81 hard violations declaradas como success. La protección no decide por sí sola si eran infracciones reales o falsos positivos; hace segura esa incertidumbre y prepara el análisis de ID 027.

## ID 027 — Meal semantics

Al repetir una validación real, interpretar los datos de comida con estas reglas:

- `meal` / `mealWindow` es el intervalo permitido para colocar comidas; una tarea normal dentro de 13:00–16:30 es válida por ese solo hecho.
- `actualMeal` es un intervalo concreto asignado y sí es hard para su scope.
- `globalHardBreaks` contiene paradas globales reales; no se infieren desde la ventana flexible.
- una tarea real `space_meal` o `itinerant_meal` protege el espacio, equipo o concursante correspondiente.

En el JSON exportado, `MEAL_CROSSING` debe aparecer únicamente con `details.violationType = MEAL_BLOCK_CROSSING`. Un bloqueo global explícito aparece como `GLOBAL_BREAK_CROSSING`. Si el plan solo declara una ventana flexible y no ha asignado comida, la ausencia de un bloque es información operativa pendiente, no una hard violation inventada.

Para la repetición posterior a ID 027 se espera que desaparezcan las decenas de cruces falsos de 13:00–16:30. Cualquier `SPACE_OVERLAP`, `RESOURCE_OVERLAP`, cruce de bloque real u otra categoría restante debe seguir investigándose como hard real; la compuerta no se desactiva.

## ID 028 — Protocolo para `SPACE_OVERLAP`

La repetición posterior a ID 027 dejó 63 hard violations, todas o casi todas `SPACE_OVERLAP`, concentradas en `spaceId: 49` y a menudo en microintervalos de cinco minutos. ID 028 permite distinguir tres causas sin ocultar ninguna infracción:

1. si el espacio declara capacidad N, hasta N tareas ocupantes simultáneas son válidas;
2. si no declara capacidad, continúa siendo exclusivo con capacidad 1;
3. si la concurrencia observada supera la capacidad, el gate mantiene el resultado `infeasible`.

Al repetir la prueba real, exportar el JSON y revisar en cada detalle `spaceName`, `spaceCapacity`, `observedConcurrency`, `start`, `end` y las tareas compactas. Si el espacio 49 sigue mostrando capacidad 1, confirmar en operación si realmente es exclusivo o si falta modelar capacidad en DB. Si la capacidad es correcta y aun así se excede, revisar la asignación de espacios del motor; no relajar el gate.

## ID 029 — Transporte y capacidad de furgoneta

La capacidad operativa del espacio Transporte procede del ajuste existente **Capacidad furgoneta** (`van_capacity`), no de una relajación global de espacios. El input del motor identifica el espacio desde las plantillas configuradas `IN`/`OUT` y sus tareas; solo usa el nombre `Transporte` como fallback defensivo y nunca depende de `spaceId=49`.

Para repetir la prueba real posterior a `runId: 170`:

1. confirmar en Ajustes → Recursos que `vanCapacity=6` y que las plantillas de llegada/salida son `IN`/`OUT`;
2. generar de nuevo el plan;
3. verificar que seis `IN` simultáneas y tres `OUT` simultáneas no producen `SPACE_OVERLAP`;
4. si queda un `SPACE_OVERLAP` de Transporte, comprobar en el detalle `spaceName`, `spaceCapacity`, `observedConcurrency` y `capacitySource`;
5. esperar `spaceCapacity: 6` y `capacitySource: transport_van_capacity`; una concurrencia superior a 6 debe continuar marcada como hard.

Los demás espacios siguen siendo exclusivos por defecto o usan únicamente su capacidad explícita general. No cambia ninguna regla de comida, RLS ni el gate hard final.

## ID 030 — Revisión de calidad operativa del plan hard-valid

Una ejecución con `status: success`, cero tareas sin planificar y cero hard violations ya puede ser válida sin ser cómoda de operar. Tras generar el plan, descargar el JSON del panel y revisar `operationalQuality`:

1. `summary.mainConcerns` prioriza los casos que merecen inspección humana.
2. `topTalentIdle` permite detectar spans largos, idle alto y huecos máximos de cada talent.
3. `topCoachIdle` identifica coaches detectables por nombre con jornadas partidas o poco compactas.
4. `feederToMainGaps` muestra feeders conservadoramente reconocidos antes de Main Stage/Plató 7.
5. `transportSummary` resume grupos IN/OUT, spacing, concurrencia y comparación con `vanCapacity` cuando está disponible.
6. `analysisAvailability` debe revisarse antes de interpretar arrays vacíos: vacío puede significar “sin problema” o “no inferible”, y el flag distingue ambos casos.

El estado `good` no certifica excelencia y `review` no implica una violación hard. Comparar siempre los casos principales con la timeline y con el criterio de producción. El JSON no cambia el motor; sirve para elegir con evidencia el objetivo de ID 031.
