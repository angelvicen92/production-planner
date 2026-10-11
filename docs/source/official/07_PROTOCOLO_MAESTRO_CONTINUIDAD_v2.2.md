# PROTOCOLO MAESTRO DE CONTINUIDAD, ITERACIÓN Y CONTROL DE RUMBO

**OptiPlan · Documento fuente oficial de trabajo con ChatGPT, GitHub, Codex y Replit/Shell**  
**Versión 2.2 · 30 de septiembre de 2026**  
**Estado: Documento fuente oficial**

---

## Historial de versión

### Versión 2.2

- Corrige la política de continuidad de Codex al comportamiento real del entorno: **un hilo nuevo de Codex crea un PR nuevo**.
- Mientras una iteración siga perteneciendo a la misma unidad lógica y deba actualizar el mismo PR, se continuará en **el mismo hilo de Codex**, aunque supere dos turnos.
- La regla histórica de valorar un hilo nuevo antes del tercer turno queda retirada para continuaciones de un PR.
- Sólo se inicia un hilo nuevo cuando ChatGPT decide expresamente que corresponde una nueva unidad lógica / nuevo PR, o cuando se acepta conscientemente abandonar/superseder el PR anterior.

### Versión 2.1

- Introduce el **Gate de Auditoría Causal Integral** antes de cualquier nueva iteración relevante de Planner/Assisted.
- Obliga a reconstruir el recorrido real del planificador —no sólo el diff del último PR— desde la selección de unidad/scope hasta la aceptación, poda, backtracking o agotamiento.
- Exige analizar cada bloqueo simultáneamente como **jefe de producción** y como **arquitecto/desarrollador**, contrastando Fuentes, código, Evidence y estado operativo.
- Prohíbe generar el siguiente prompt de Codex mientras no exista una hipótesis causal explícita y falsable; si aún no existe, la siguiente unidad lógica debe ser diagnóstico/instrumentación, no otra modificación del solver.
- Hace obligatoria la comparación contra el último baseline aceptado y las iteraciones inmediatamente anteriores para distinguir regresión real, cambio de configuración, mayor rigor de validación o simple desplazamiento del punto de fallo.
- Convierte caídas bruscas de completitud, repetición de blockers, dos iteraciones sin mejora causal, o una divergencia entre comportamiento operativo y método oficial en disparadores automáticos de auditoría profunda.
- Reafirma que el número de tareas colocadas, ramas reducidas o tests verdes no constituyen progreso suficiente si no aumenta la extensibilidad demostrada hacia el objetivo operativo.
- Actualiza las referencias activas al corpus vigente: Fuente 00 v2.9, Fuente 03 v3.6, Fuente 04 v2.5, Fuente 05 v2.6 y Fuente 06 v2.7.

### Versión 2.0

- Hace obligatoria la identificación explícita y verificada de la **rama exacta de Codex** antes de cada iteración ejecutada sobre GitHub.
- Obliga a mostrar esa rama al usuario **fuera del bloque del prompt**, con el formato `Rama Codex: <rama>`, incluso cuando también se mencione dentro del prompt.
- Prohíbe inferir o reutilizar de memoria la rama de trabajo: debe verificarse dinámicamente en GitHub justo antes de entregar el prompt.
- Sustituye el inventario repetitivo de “estado remoto” por un principio de **contexto Git mínimo suficiente**: el prompt sólo incluye PR/rama, sincronización con `main`, HEAD esperado o stop condition cuando sean materialmente necesarios.
- Distingue entre **selección de rama en la UI de Codex** y **salvaguardas Git dentro del prompt**: seleccionar la rama identifica el trabajo; el prompt conserva sólo las comprobaciones necesarias para evitar ejecutar sobre una base equivocada o perder el delta existente.
- Añade un gate específico para continuaciones de PR: continuar en la misma rama/PR siempre que siga siendo la misma unidad lógica; abrir otra rama sólo cuando cambie la unidad lógica o el PR haya quedado supersedido.
- Corrige referencias internas al corpus vigente: Fuente 00 v2.4 y Fuente 04 v2.4.

### Versión 1.9

- Cierra la auditoría documental 00–07: elimina referencias normativas activas a Fuentes retiradas y normaliza “estado oficial” como estado interno del ORC cuando proceda.
- Separa de forma explícita `Locked` (lock humano real) de `AutomaticProtection` (placement de Stage protegido frente a movimiento automático).
- Reafirma que todo hecho A2 específico procede de la Fuente 06 y que los nombres de SPEC/addenda antiguos sólo pueden sobrevivir como provenance interna.

### Versión 1.8

- Introduce autoridad por ámbito mediante la Fuente 00.
- Cierra el contrato de AcceptedException, grandfathering, rollback/config provenance y la guardia A2 `266 / IN 3-3-30`.
- Preserva como obligatorio el pipeline SPEC-07 v2.2: arquitectura mínima → capacidad necessary-only → witness anónimo → matching por bundles → materialización.

### Versión 1.7

- Adopta **Assisted Planning completa** como objetivo primario de producto y convierte one-click/Autopilot en nivel avanzado, no gate inicial.
- Incorpora `WorkingPlan`, `PlanningScope`, `ScopeProposal`, `Draft`, `Stage`, `AutomaticProtection` y `AcceptedException` como vocabulario de continuidad.
- Distingue verdad automática de autoridad humana: el motor no propone nuevas violaciones HARD/REQUIRED, pero una excepción humana explícita no se oculta ni cambia la regla global.
- Sustituye el Objetivo Maestro v1 por `05_VALIDACION_CALIDAD_BENCHMARK_v2.2` y el canon A2 por `06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.2` (266 obligaciones).
- Mantiene Full A2/Autopilot como benchmark avanzado y conserva diagnóstico causal de Planner Next cuando el bloqueo esté en search.
- Prohíbe usar baselines SHA/PR de documentos históricos como estado actual; GitHub/Evidence se reconstruyen siempre al arrancar.

### Versión 1.6

- Formaliza el **diagnóstico causal read-only de Planner Next** como capacidad permanente de trabajo cuando una búsqueda se estanca, agota presupuesto o una optimización libera ramas sin producir progreso estructural.
- Obliga a consultar o regenerar la Evidence causal antes de modificar ordering, candidate domains, matching, Future Feasibility, backtracking o reparto de presupuesto en esos casos.
- Establece como señales mínimas el waterfall por profundidad/fase, feeder starts válidos/inválidos, causas canónicas de rechazo y decisiones blocker cuando la instrumentación vigente las exponga.
- Prohíbe convertir IDs, conteos, porcentajes o recomendaciones de una ejecución concreta en reglas permanentes; toda conclusión causal debe derivarse de la Evidence del head actual.
- Conserva la instrumentación causal productiva únicamente si es neutral respecto a búsqueda, accounting, hard constraints, determinismo y resultado.
- Añade al arranque y al checklist la obligación de revisar `causalDiagnostic`/`diagnosticReport` vigente cuando el objetivo activo sea desbloquear Planner Next / Full A2.

### Versión 1.5

- Sustituye la jerarquía rígida `ChatGPT → Codex → intervención humana` por un **modelo de orquestación adaptativa**.
- Separa de forma expresa **responsabilidad de decisión** y **responsabilidad de ejecución**: ChatGPT mantiene la dirección técnica y operativa, pero el ejecutor se elige por caso.
- Autoriza utilizar Codex aunque ChatGPT pudiera técnicamente editar el cambio, cuando Codex ofrezca mejor bucle `leer → editar → ejecutar → testear` o menor riesgo total.
- Autoriza solicitar tempranamente una comprobación corta en Shell/Replit cuando sea la fuente más rápida o autoritativa de Evidence y evite una implementación especulativa.
- Prohíbe optimizar la autonomía como objetivo en sí mismo. La métrica rectora pasa a ser **coste total por cambio verificado y aceptado**, considerando tiempo, riesgo, créditos de Codex, intervención humana y retrabajo.
- Consolida en este documento las reglas válidas del antiguo `ADDENDUM_PROTOCOLO_AUTONOMIA_CHATGPT_v1.0.md`, que queda retirado y no debe mantenerse como fuente oficial paralela.
- Mantiene prompts por delta, lectura dirigida, `AGENTS.md` breve, conversaciones cortas, selección proporcional de modelo y validación escalonada.
- Refuerza que el usuario no será mensajero de GitHub, pero sí puede actuar como **operador de entorno** cuando una ejecución breve en Replit/Supabase real sea el instrumento correcto.
- No relaja viabilidad, restricciones hard, determinismo, Evidence, benchmarks, control de rumbo ni merge gate.

### Versión 1.4

- Formaliza que un PR y una conversación de Codex son continuidades distintas.
- Introduce presupuesto por defecto de dos turnos de usuario por hilo de Codex y reset antes del tercero salvo excepción justificada.
- Convierte `AGENTS.md` en mapa estable y breve.
- Añade prompts por delta, lectura progresiva, selección proporcional de modelo y validación escalonada.
- Añade medición de créditos de Codex por cambio aceptado.

### Versión 1.3

- **Histórico v1.3, hoy superseded:** entonces se incorporó `OBJETIVO_MAESTRO_CALIDAD_Y_BENCHMARK_A2_v1.0`; actualmente ese documento está retirado y su contenido vigente vive en la Fuente 05.
- Históricamente fijó `Full A2` como benchmark integral; desde v1.7 el gate de producto es A2-ASSIST y Autopilot queda como nivel avanzado.
- Introduce `INVALID | WORSE | TRADEOFF | PARITY | PARETO_BETTER`.

### Versión 1.2

- Incorpora el protocolo permanente de optimización de créditos y contexto de Codex.
- Introduce prompts por delta y validación escalonada.

### Versión 1.1

- Incorpora `SPEC-10 — Integración de Planner Next con EngineInput, ORC y publicación de producto`.

---

## 0. Naturaleza y autoridad del documento

Este documento regula cómo debe continuar el desarrollo de OptiPlan entre chats, iteraciones, entornos de ejecución y pull requests.

No redefine el producto, el dominio ni la arquitectura del ORC.

Su función es impedir que se pierdan:

- el rumbo;
- la evidencia ya obtenida;
- las decisiones demostradas;
- los caminos rechazados;
- el método de validación;
- y la selección racional del mejor medio de ejecución para cada paso.

Cuando este protocolo entre en conflicto con una regla oficial de producto, dominio, seguridad operativa u ORC, prevalece la documentación oficial correspondiente.

Cuando el conflicto sea entre una interpretación abstracta y el método real de planificación, se aplicará la prioridad de la Parte SPEC-07 v2.2 integrada en la Fuente 03.

> **Regla de activación**  
> En un chat nuevo bastará con indicar: “Aplica el Protocolo Maestro de Continuidad de OptiPlan y continúa desde el estado real del repositorio”.

El asistente deberá reconstruir el contexto sin pedir al usuario que vuelva a explicar el proyecto, el flujo de trabajo o errores ya documentados.

---

## 0.1 Salvaguardas incorporadas en v1.8

- La autoridad documental se resuelve **por ámbito** mediante 00, no mediante una lista lineal.
- Assisted es el producto primario; one-click/Autopilot nunca se presume como gate actual.
- Antes de una iteración Planner/Assisted se preservan Stage/Draft/AutomaticProtection/AcceptedException y configuración vigente como autoridades distintas.
- Un AcceptedException heredado sólo grandfather exacta identidad material mientras las tareas afectadas permanezcan intactas; `STALE/RESOLVED/SUPERSEDED` no se heredan.
- El A2 canónico se toma de 06; en particular 266 obligaciones e `IN target=3, max=3, minGap=30` no se sustituyen por fixtures históricos.
- Cuando el objetivo afecta al pipeline estructural, SPEC-07 v2.2 exige arquitectura mínima → capacidad necessary-only → witness anónimo → matching por bundles → materialización. No se vuelve a un DFS global de tareas individuales para descubrir esa geometría.

## 1. Misión permanente

La misión no es producir más arquitectura, más Evidence ni más código.

La misión es construir una aplicación robusta en la que un jefe de producción pueda completar una jornada audiovisual mediante planificación Assisted por scopes y Stages, con propuestas automáticas seguras, edición humana, checkpoints, rollback y validación explicable. Una vez completado el día, OptiPlan debe alcanzar calidad operativa comparable o superior a la referencia humana A2.

El criterio rector de calidad se define en `05_VALIDACION_CALIDAD_BENCHMARK_v2.6`.

El primer examen integral de producto es la progresión `A2-ASSIST`: representar el día, construirlo mediante scopes/stages hasta `ASSISTED_COMPLETION` y después medir `PARITY` / `PARETO_BETTER`. `Autopilot/Full A2 one-click` queda como benchmark avanzado posterior.

Principios permanentes:

- La producción tiene que salir.
- Viabilidad antes que sofisticación.
- Una planificación válida no es necesariamente una buena planificación.
- El motor propone y el humano decide.
- `done` e `in_progress` no se modifican; los locks explícitos se respetan y los placements aceptados se preservan frente a movimientos automáticos mediante `AutomaticProtection`.
- La replanificación actúa únicamente sobre trabajo pendiente o interrumpido según contrato.
- Configuración antes que hardcode.
- Determinismo y Evidence reproducible.
- Ninguna puntuación agregada compensa una violación hard ni oculta una regresión primaria.
- El planning humano es benchmark y evidencia, nunca seed, hint u orden autoritativo.
- Un Stage aceptado crea AutomaticProtection frente a movimientos automáticos, no un lock implícito.
- Una AcceptedException no convierte una regla HARD/REQUIRED en soft ni falsea `hardValid`.

---

## 1.1 Continuidad específica de Assisted Planning

Cuando el objetivo activo esté en Assisted:

- reconstruir Stage/revisión aceptados y scope actual desde el estado real;
- distinguir placements protegidos automáticamente de locks explícitos;
- verificar que una propuesta no introduce nuevos HARD/REQUIRED respecto al baseline aceptado;
- preservar AcceptedExceptions por identidad estructurada, nunca por reason code genérico;
- usar Evidence causal si un scope se estanca antes de alterar search/order/budget;
- no ejecutar el día completo cuando un benchmark focal de scope responda mejor a la pregunta causal;
- no confundir completar un scope con completar el día.

---

## 2. Fuentes de verdad y recuperación del contexto

Antes de decidir o implementar un cambio deberán consultarse de forma dirigida las fuentes oficiales relevantes:

- `00_INDICE_Y_AUTORIDAD_FUENTES_OPTIPLAN_v2.9.md`;
- `01_PRODUCTO_DOMINIO_OPERACION_v5.2.md`;
- `02_ORC_CORE_CONSOLIDADO_v2.2.md`;
- `03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.6.md`;
- `04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.5.md`;
- `05_VALIDACION_CALIDAD_BENCHMARK_v2.6.md`;
- `06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.7.md`;
- los dos PDFs A2 cuando proceda;
- este Protocolo Maestro;
- documentación y Evidence vigente del repositorio.

No se inventarán requisitos, restricciones, reglas de negocio, arquitectura ni criterios de calidad.

Si algo material no está definido, se intentará resolver primero mediante:

1. Fuentes oficiales.
2. GitHub y código real.
3. Evidence y benchmarks.
4. Una comprobación focal en el entorno adecuado.
5. Sólo después, una decisión humana de dominio si sigue siendo necesaria.

> **Estado dinámico**  
> Este protocolo no contiene SHA, PR o benchmark “actual”. Cada chat reconstruye el estado dinámico desde GitHub y la Evidence disponible.

---

## 3. Arranque obligatorio de cada chat

Antes de proponer una iteración:

1. Leer este protocolo y las fuentes que afecten al objetivo actual.
2. Inspeccionar GitHub: `main`, PR abiertos, último merge, PR recientes relevantes —incluidos rechazados—, archivos afectados, README, CI, benchmarks y Evidence.
3. Reconstruir una ficha de estado con:
   - objetivo operativo;
   - baseline aceptado;
   - hipótesis activa;
   - última Evidence válida;
   - nivel A2-ASSIST y blocker causal vigente cuando proceda;
   - gate/KPI limitante;
   - caminos rechazados;
   - riesgos abiertos;
   - siguiente decisión pendiente.
4. Comparar las últimas iteraciones para comprobar si produjeron el efecto esperado o sólo añadieron infraestructura.
5. Determinar el siguiente paso de mayor valor y menor riesgo.
6. Elegir **la ruta de ejecución más adecuada para ese paso**, sin asumir de antemano ChatGPT, Codex ni Shell.

No se pedirá al usuario que repita información disponible en fuentes, GitHub o contexto compartido.

---

## 4. Ciclo obligatorio de cada iteración

Cada iteración debe responder:

> **¿Cuál es el siguiente paso de mayor valor y menor riesgo para acercar OptiPlan al resultado operativo real, y cuál es la forma más eficiente y fiable de ejecutarlo y demostrarlo?**

### 4.1 Revisión del estado o PR

- Revisar el diff real, no sólo resúmenes.
- Verificar que el trabajo parte del `main` correcto.
- Comprobar CI, tests, benchmarks, fingerprints, README y Evidence aplicables.
- Buscar regresiones, hardcodes, presupuesto oculto, PartialPlan, fallbacks y violaciones de tareas protegidas.
- Contrastar las SPEC aplicables cuando afecte a motor, dominio, DB o integración.

### 4.2 Veredicto de rumbo

Antes de continuar, responder internamente:

- ¿Qué comportamiento operativo cambió o debe cambiar?
- ¿Qué Evidence demuestra el problema?
- ¿Qué componente toma causalmente la decisión?
- ¿Qué gate/KPI pretende mejorar?
- ¿Nos acerca al siguiente gate A2-ASSIST o, tras Assisted Completion, a `PARITY` / `PARETO_BETTER`?
- ¿Puede simplificarse algo existente en vez de añadir una capa?
- ¿Qué ruta de ejecución reduce mejor incertidumbre y riesgo?

### 4.3 Decisión de integración

- PR correcto y gate cumplido → merge protegido y verificación posterior de `main`.
- Defecto localizado → corregir en el mismo PR cuando siga siendo la unidad lógica adecuada.
- Camino equivocado → cerrar o reenfocar; no salvar una arquitectura incorrecta con parches acumulativos.
- Validation gap → obtener la Evidence mínima necesaria antes de decidir implementación o merge.


### 4.4 Gate de Auditoría Causal Integral antes del siguiente prompt

Después de **cada PR o ejecución que cambie materialmente el comportamiento del Planner/Assisted**, y siempre antes de entregar otro prompt de Codex sobre el mismo objetivo, ChatGPT debe reconstruir el comportamiento real del planificador de extremo a extremo.

La revisión no se limita al diff. Como mínimo debe responder, con Evidence del `head` actual:

1. **Qué estado recibió el planificador**: configuración efectiva, Stage/base, placements protegidos, reservas virtuales/efímeras y obligaciones pendientes.
2. **Qué secuencia de decisiones siguió**: scope/unidad elegida, arquitectura construida, matching, materialización, Future Feasibility, validaciones, podas, backtracking y agotamiento.
3. **Qué decisiones son operativamente razonables** desde el rol de jefe de producción y cuáles contradicen el método oficial o comprometen libertad futura sin causa.
4. **Qué función/componente concreto toma la primera decisión causalmente incorrecta o costosa**, incluyendo sus autoridades de entrada y el efecto downstream.
5. **Qué cambió respecto al último baseline aceptado** y a las iteraciones inmediatamente anteriores: modelo/configuración, severidad/validación, ordering, dominios, matching, branch accounting o búsqueda.
6. **Si el bloqueo es real o aparente**: distinguir inviabilidad del problema, incapacidad de búsqueda dentro del presupuesto, regresión de implementación y detección más temprana de una rama ya inviable.
7. **Qué experimento mínimo falsaría la hipótesis** antes de ampliar arquitectura.

No podrá emitirse un nuevo prompt de implementación mientras no pueda formularse una hipótesis de esta forma:

```text
Comportamiento X
es causado por decisión/componente Y
y produce pérdida operativa Z.
El delta W debe cambiarlo,
y la Evidence esperada es M.
```

Si falta cualquiera de esas piezas, la siguiente unidad lógica será **diagnóstico/instrumentación focal**, no una nueva heurística, poda, presupuesto, matching o capa de búsqueda.

#### Disparadores automáticos de auditoría profunda

El gate anterior se vuelve especialmente estricto cuando ocurra cualquiera de estas señales:

- caída material del número de obligaciones completadas;
- dos iteraciones consecutivas sin mejora causal del objetivo;
- cambio del blocker sin mejora demostrada de extensibilidad;
- repetición del mismo certificado/nogood/fallo tras múltiples alternativas nominales;
- aumento de branches/tiempo sin nueva información;
- tests verdes con empeoramiento del benchmark representativo;
- diferencia entre la planificación que haría un jefe de producción y la secuencia que sigue el código;
- cambio reciente de configuración, contrato o validator que pueda invalidar comparaciones históricas.

Una caída de `completedObligationCount` nunca se interpreta automáticamente como regresión del solver: primero se determina si el nuevo sistema está detectando antes una inviabilidad que antes quedaba latente.

#### Regla de revisión de código

Cuando el blocker esté en el motor, ChatGPT debe leer el **call path material**, no sólo los archivos cambiados por el último PR. La lectura termina cuando se identifica la decisión que crea, elimina o deja de explorar la alternativa operativamente necesaria.

Codex se utiliza después para ejecutar un delta ya delimitado o para obtener Evidence que requiera terminal/local loop; no sustituye esta auditoría estratégica.

---

## 5. Puerta de simplicidad y control de deriva

Antes de iniciar una nueva unidad lógica deberán cumplirse estas preguntas:

1. ¿Existe un problema operativo real demostrado?
2. ¿El cambio actúa causalmente sobre ese problema?
3. ¿Puede resolverse mejorando o simplificando algo existente?
4. ¿Es una sola unidad lógica?
5. ¿Existe un criterio objetivo de aceptación?
6. ¿La complejidad permanente añadida está justificada?
7. ¿La ruta de ejecución elegida es la que ofrece mejor relación entre evidencia, riesgo, tiempo, créditos y esfuerzo humano?

Si alguna respuesta es negativa, se revisa el enfoque antes de implementar.

### 5.1 Señales de alarma

- Dos iteraciones consecutivas sin mejora demostrada del planning representativo.
- Más trazas, contadores o capas sin cambio productivo.
- Tests verdes mientras el resultado operativo no mejora.
- Aumento de presupuesto para compensar un orden de búsqueda incorrecto.
- Uso de Codex por costumbre.
- Uso de ChatGPT/GitHub directo para una edición amplia cuando un bucle local edit-test sería claramente más fiable.
- Evitar pedir una comprobación de Shell de 30 segundos y gastar una iteración completa intentando inferir lo que el entorno puede demostrar directamente.
- Pedir al usuario trabajo administrativo que las herramientas pueden resolver.
- Ejecutar un merge gate completo para responder una pregunta que un test focal puede resolver.

### 5.2 Respuesta ante deriva

Detener expansión. Aislar la pregunta causal. Obtener Evidence. Simplificar o retirar el mecanismo que no produce valor. Elegir de nuevo la ruta de ejecución.

---

## 6. Método de planificación que debe protegerse

`03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.6` define el método constructivo y de búsqueda.

> **Método oficial**  
> Construir la estructura que condiciona el día → alimentar sus dependencias → colocar lo difícil y poco flexible → rellenar con lo corto y flexible → retroceder cuando una decisión cierre la solución.

- La unidad de producto es el `PlanningScope`; dentro del solver, bloques/unidades operativas estructuran la construcción.
- Se conservan pocas alternativas relevantes.
- Se aplica backtracking acotado.
- La calidad comparativa se evalúa sobre planes completos comparables; los Drafts/Stages parciales se juzgan por completitud de scope, seguridad, extensibilidad y Evidence.
- En una petición Assisted interactiva, la primera propuesta completa hard-valid para el scope puede cerrar la búsqueda; la optimización intensiva de calidad requiere una petición/fase separada.
- Evidence sirve para decidir; no justifica arquitectura permanente por sí sola.

---

## 7. Comparación con el objetivo real

`05_VALIDACION_CALIDAD_BENCHMARK_v2.6` es la autoridad comparativa.

La evaluación mantiene dos capas:

1. **Gates no compensables:** completitud y todas las reglas hard aplicables.
2. **Calidad operativa multicriterio:** continuidad, makespan, permanencia, espera evitable, presencia de recursos críticos, bloques/setups, desplazamientos, sincronización y robustez.

Clasificación oficial:

`INVALID | WORSE | TRADEOFF | PARITY | PARETO_BETTER`

A2-ASSIST y el benchmark integral del día no sustituyen tests focales causales durante desarrollo. Autopilot Full A2 se ejecuta cuando sea material para el objetivo activo.

---

# 8. ORQUESTACIÓN ADAPTATIVA DE LA EJECUCIÓN

## 8.1 Principio rector

OptiPlan no utiliza una jerarquía fija de ejecutores.

Utiliza una **orquestación adaptativa**.

ChatGPT mantiene la responsabilidad de:

- reconstruir contexto;
- interpretar fuentes;
- decidir el problema real;
- elegir estrategia y alcance;
- fijar criterios de aceptación;
- revisar el resultado;
- decidir merge, corrección, cierre o siguiente paso.

La **ejecución material** puede realizarla:

- ChatGPT mediante GitHub y sus herramientas;
- Codex;
- el usuario mediante Shell/Replit/Supabase o una comprobación manual;
- o una combinación ordenada de los anteriores.

> **Regla clave**  
> “ChatGPT puede hacerlo” no implica “ChatGPT debe hacerlo”.  
> “El usuario puede hacerlo” no implica “hay que evitar pedírselo”.  
> “Codex cuesta créditos” no implica “Codex debe reservarse sólo para imposibilidades”.

La pregunta correcta es:

> **¿Qué ruta produce el cambio verificado y aceptable con menor coste total esperado y menor riesgo de error o retrabajo?**

## 8.2 Separación entre orquestador y ejecutor

### ChatGPT como orquestador

Por defecto ChatGPT es responsable de la decisión global, incluso cuando no escribe el código.

No debe delegar a Codex una pregunta estratégica abierta del tipo “investiga el proyecto y decide qué hacer” si esa investigación puede resolverse con las fuentes y GitHub disponibles.

Tampoco debe aferrarse a ejecutar directamente una implementación sólo para preservar autonomía.

### Ejecutor técnico

El ejecutor se selecciona después de comprender el problema y antes de iniciar el delta.

Puede cambiar entre fases.

Ejemplo válido:

```text
ChatGPT diagnostica
→ Shell confirma el fallo real
→ ChatGPT decide el delta
→ Codex implementa y ejecuta tests focales
→ ChatGPT revisa PR y CI
→ Shell/Replit ejecuta merge gate real si es necesario
→ ChatGPT decide merge
```

No existe obligación de utilizar una única herramienta durante toda la iteración.

## 8.3 Criterios obligatorios de selección

La ruta se decide considerando, como mínimo:

### A. Autoridad de la información

¿Dónde existe la verdad necesaria?

- GitHub/CI;
- entorno local;
- Replit;
- Supabase real;
- navegador/UI;
- documentación;
- benchmark generado.

La Evidence autoritativa prevalece sobre inferencias.

### B. Necesidad de bucle local

¿El cambio exige repetidamente?

```text
leer → editar → ejecutar → observar → corregir
```

Si sí, un agente con shell y repo local suele ser preferible a una serie de ediciones remotas desacopladas.

### C. Amplitud e interdependencia

- cambio documental o mecánico pequeño;
- uno o pocos archivos con contrato claro;
- cambio multiarchivo interdependiente;
- motor/DB/RLS/integración crítica;
- investigación de fallo emergente.

Cuanto mayor sea la interdependencia entre código y ejecución, mayor valor aporta un entorno de coding agent.

### D. Reversibilidad y riesgo

Se considerará:

- facilidad de revertir;
- impacto en DB/RLS/motor;
- posibilidad de pérdida de datos;
- capacidad de comprobar el resultado antes de merge;
- riesgo de introducir una falsa confianza mediante CI incompleto.

### E. Información obtenida por unidad de esfuerzo

Una orden corta de Shell que responda una pregunta causal puede ser preferible a una iteración completa de código.

No se retrasará una comprobación barata sólo por evitar intervención humana.

### F. Coste total

Se consideran conjuntamente:

- créditos de Codex;
- contexto/tokens;
- tiempo de ciclo;
- número de revisiones;
- probabilidad de retrabajo;
- esfuerzo del usuario;
- riesgo residual;
- coste de validaciones repetidas.

Ninguno de estos factores se optimiza de forma aislada.

## 8.4 Rutas preferentes por tipo de trabajo

Estas son preferencias, no hard rules.

### Ruta A — ChatGPT + GitHub directo

Preferible cuando:

- análisis, arquitectura o revisión son el trabajo principal;
- el cambio es documental o administrativo;
- el parche es pequeño y de bajo acoplamiento;
- la corrección está localizada y puede verificarse con diff + CI disponible;
- abrir/cerrar/revisar/mergear PR no necesita un entorno local;
- modificar directamente evita una invocación de Codex sin reducir fiabilidad.

No utilizar esta ruta por orgullo de autonomía si el cambio requiere un bucle local significativo.

### Ruta B — Codex

Preferible cuando:

- existe una implementación multiarchivo coherente;
- el cambio necesita navegar dependencias de código reales;
- es probable que requiera varias rondas edit-test dentro de una misma ejecución;
- motor, DB, RLS, contratos o integración necesitan compilación/test local continua;
- hay un bug cuyo diagnóstico depende de ejecutar el sistema o inspeccionar outputs de terminal;
- un refactor mecánico amplio es más seguro con repo local y tests;
- la probabilidad de que una edición remota parcial requiera retrabajo es superior al coste de una tarea Codex bien acotada.

Codex puede ser la **primera opción de implementación** aunque ChatGPT pudiera técnicamente editar los archivos.

Cuando la iteración continúe un PR o una rama existente, ChatGPT deberá además verificar en GitHub la rama remota exacta y mostrarla al usuario antes del prompt. La continuidad de PR no se inferirá por memoria, título del PR ni resumen de Codex.

Antes de invocarlo, ChatGPT debe haber fijado:

- objetivo;
- Evidence causal disponible;
- fuentes relevantes;
- unidad lógica;
- límites;
- criterios de aceptación;
- validación proporcional.

Codex puede ampliar lectura local cuando una dependencia real emerja; no se le exige ejecutar ciegamente una solución incompatible con el código real.

### Ruta C — Shell/Replit/Supabase operado por el usuario

Preferible cuando:

- la pregunta depende del entorno real;
- una prueba corta puede decidir entre varias hipótesis;
- hace falta un benchmark o JSON que no existe en CI;
- hay que validar una migración en la instancia real;
- hay que reproducir un error de ejecución;
- hay que comprobar comportamiento de UI o integración real;
- la orden es breve, segura y aporta información de alta autoridad.

Esta ruta **no es un último recurso**.

Puede utilizarse al principio de una iteración si evita especulación.

El usuario no será usado para:

- copiar diffs;
- inspeccionar PR que ChatGPT puede leer;
- hacer merge manual por rutina;
- trasladar información entre ChatGPT, Codex y GitHub;
- ejecutar largas secuencias que pueden versionarse como script y lanzarse con una orden corta.

### Ruta D — Híbrida

Es la ruta normal para trabajo crítico.

Combina cada herramienta en la fase donde aporta mayor valor.

No se considera ineficiencia cambiar de ejecutor si cada cambio reduce incertidumbre o riesgo.

## 8.5 Gate de selección antes de ejecutar

Antes de empezar una unidad lógica, ChatGPT responderá internamente:

1. ¿Qué dato falta para decidir correctamente?
2. ¿Cuál es la fuente más autoritativa y barata de ese dato?
3. ¿Quién puede implementar este delta con el mejor bucle de feedback?
4. ¿Quién puede validar de forma más cercana al entorno real?
5. ¿La ruta elegida evita retrabajo probable?
6. ¿Estoy evitando Codex o Shell por una regla histórica, en lugar de por una razón actual?
7. ¿Estoy delegando algo que podría resolver trivialmente sin coste adicional?

No es necesario mostrar este checklist al usuario salvo que explique una decisión no obvia.

## 8.6 Política de intervención del usuario

La intervención humana se clasifica en dos tipos.

### A. Decisión humana de dominio

Sólo se solicita cuando una decisión material no está definida en fuentes, código ni Evidence.

### B. Operación de entorno

Puede solicitarse cuando el usuario tiene acceso al entorno real y una acción breve aporta Evidence decisiva.

La operación de entorno no se considera un fracaso de autonomía.

Se considera una herramienta de validación.

Requisitos:

- explicar en una frase qué se quiere demostrar;
- comandos breves y copiables;
- preferiblemente 1–5 órdenes;
- un único bloque;
- sin scripts gigantes pegados;
- indicar qué salida debe devolver el usuario;
- indicar qué no debe hacer si existe riesgo, por ejemplo “no hagas merge”.

Si hace falta un script largo, se versionará primero y el usuario ejecutará una orden corta.

## 8.7 GitHub y responsabilidad de integración

`main` sigue siendo la fuente dinámica de verdad del código.

ChatGPT debe, cuando las herramientas lo permitan:

- revisar PR y diff real;
- comprobar CI;
- comprobar threads y estado de merge;
- editar metadata o comentarios;
- decidir merge/corrección/cierre;
- ejecutar merge protegido;
- verificar `main` después del merge.

El hecho de que Codex implemente el delta no transfiere a Codex la autoridad de merge.

## 8.8 Fast Merge y DB Safe Merge

La clasificación de integración se mantiene, pero **no determina el ejecutor**.

### Fast Merge

UI/frontend o cambios de bajo riesgo sin DB, RLS, motor ni contratos críticos.

Puede ejecutarlo ChatGPT o Codex según la ruta más eficiente.

### DB Safe Merge

DB, RLS, modelos relacionales, motor, ORC, reglas hard, locks, contratos críticos o integración sensible.

Exige validación reforzada y merge gate correspondiente.

No implica automáticamente “usar Codex”, aunque en muchos cambios de este tipo Codex será la mejor herramienta de implementación por su bucle local.

---

# 9. EFICIENCIA DE CODEX

## 9.1 Principio

Cuando Codex sea la ruta elegida, se optimiza **créditos por cambio verificado y aceptado**, no créditos por mensaje.

No se reduce contexto si ello aumenta de forma material el retrabajo.

## 9.2 PR e hilo de Codex en el entorno real

En el flujo de Codex utilizado por OptiPlan, **abrir un hilo nuevo implica crear un PR nuevo**.

Por tanto:

- si el trabajo sigue perteneciendo a la misma unidad lógica y debe actualizar el mismo PR, se continúa en **el mismo hilo de Codex**;
- no existe un límite artificial de dos turnos por hilo cuando cambiar de hilo rompería la continuidad del PR;
- antes de cada nuevo turno se reduce igualmente el prompt al delta necesario para controlar contexto y créditos;
- sólo se abre un hilo nuevo cuando ChatGPT decide explícitamente que corresponde una nueva unidad lógica / nuevo PR, o cuando el PR anterior debe cerrarse/supersederse.

La optimización de contexto se realiza mediante prompts por delta, lectura dirigida y evitando repetir historia, no creando un hilo nuevo que fuerce un PR adicional.

## 9.3 `AGENTS.md`

Debe ser:

- breve;
- estable;
- orientado a invariantes, navegación, límites y validación;
- no una copia del PRD/SPEC/Evidence.

## 9.4 Prompt por delta

El prompt de Codex debe describir **el delta que debe ejecutarse**, no reproducir el estado completo del proyecto.

Formato preferido:

```text
Objetivo: ...
Evidencia causal: ...
Leer: ...
Cambiar: ...
No tocar: ...
Aceptar si: ...
Validar ahora: ...
Gate final: ...
```

Reglas:

- una sola unidad lógica;
- objetivo aproximado de hasta 350 palabras cuando sea viable;
- referenciar archivos y fuentes en vez de pegarlos;
- log causal mínimo;
- no repetir historia del PR;
- permitir lectura adicional si aparece una dependencia local real;
- no convertir el prompt en un inventario de SHA, PR, merges o estados que ya están resueltos por la rama seleccionada y pueden verificarse en GitHub.

### 9.4.1 Rama Codex obligatoria

Antes de entregar cualquier prompt destinado a Codex, ChatGPT debe verificar dinámicamente en GitHub la rama remota exacta sobre la que debe ejecutarse el trabajo.

La respuesta al usuario debe mostrar, **fuera del bloque Markdown del prompt**, una línea explícita con este formato:

```text
Rama Codex: `nombre-exacto-de-rama`
```

Esta línea es obligatoria siempre que la ruta elegida sea Codex, tanto si:

- se continúa un PR existente;
- se continúa una iteración anterior;
- se abre un hilo nuevo de Codex sobre el mismo PR;
- o se crea una nueva unidad lógica que ya dispone de rama remota.

No se permite:

- inferir la rama por memoria;
- reutilizar una rama de un mensaje anterior sin volver a verificar GitHub;
- dar sólo el número de PR;
- ocultar la rama únicamente dentro del prompt;
- pedir al usuario que descubra la rama si ChatGPT puede obtenerla desde GitHub.

Si todavía **no existe** una rama remota porque la tarea debe comenzar desde `main`, ChatGPT lo indicará explícitamente:

```text
Rama Codex: `main`
```

y el prompt deberá ordenar crear una rama de trabajo sólo si el flujo de Codex no lo hace automáticamente.

Cuando exista un PR abierto que continúe siendo la misma unidad lógica, se preferirá continuar sobre **su misma rama**. Abrir otra rama/PR exige una razón material: cambio de unidad lógica, camino supersedido, contaminación de historial o necesidad objetiva de aislamiento.

### 9.4.2 Contexto Git mínimo suficiente

Seleccionar correctamente la rama en Codex identifica el workspace de trabajo. Por tanto, el prompt no debe repetir por defecto un bloque extenso de “estado remoto”.

Dentro del prompt sólo se incluirán salvaguardas Git que cambien realmente la ejecución, por ejemplo:

- `Trabaja sobre la rama ya seleccionada del PR #NNN`;
- `incorpora origin/main sin perder el delta existente` cuando la rama esté detrás de `main`;
- `verifica árbol limpio` cuando exista riesgo de workspace contaminado;
- un `HEAD obligatorio` o stop condition cuando trabajar sobre otra revisión pueda invalidar el diagnóstico o producir un diff peligroso;
- una prohibición expresa de merge cuando Codex sólo deba implementar y validar.

No se incluirán de forma rutinaria:

- SHA de `main`;
- SHA del PR;
- lista de merges recientes;
- estado de otros PR;
- historial completo de la iteración;
- información que la selección de rama y GitHub ya resuelven sin ambigüedad.

El SHA deja de ser boilerplate. Se usa sólo como **salvaguarda causal**. Ejemplos válidos:

- una corrección depende de un head exacto ya diagnosticado;
- el workspace de Codex ha mostrado desincronizaciones;
- existe riesgo de aplicar el delta sobre una arquitectura supersedida;
- una migración o benchmark sólo es válido sobre una revisión concreta.

Si ninguna de esas condiciones existe, la rama verificada es suficiente y el prompt debe permanecer breve.

### 9.4.3 Continuación de un PR en Codex

Cuando se continúe un PR existente, se utilizará el **mismo hilo de Codex** que lo creó/actualiza. Un hilo nuevo sólo procede si se ha decidido abrir un PR nuevo.

Cuando se continúe un PR existente:

1. ChatGPT verifica número de PR, rama exacta, head, base, mergeability y CI relevante.
2. ChatGPT decide si el PR sigue siendo la unidad lógica correcta.
3. Si `main` avanzó, determina si la rama necesita actualización antes de implementar.
4. Muestra al usuario `Rama Codex: ...`.
5. El prompt se concentra en el nuevo delta y sólo menciona la sincronización Git necesaria.
6. Codex no decide merge.
7. Al terminar, ChatGPT vuelve a verificar head remoto, diff, CI y Evidence antes de decidir integración o siguiente delta.

## 9.5 Selección proporcional de modelo y razonamiento

- Documentación, mecánica, UI simple, tests triviales: opción de menor coste fiable.
- Multiarchivo normal con contratos claros: opción equilibrada.
- ORC, búsqueda, DB/RLS, restricciones e integración difícil: mayor capacidad cuando aporte ventaja demostrable.
- Fast/Ultra/multiagente/Best-of-N no son default.

## 9.6 Validación escalonada

Durante desarrollo:

- tests focales;
- typecheck/lint directamente afectados;
- benchmark causal cuando la capacidad sea funcional.

No repetir suite global tras cada corrección.

Sobre head candidato:

- merge gate completo una vez;
- CI;
- build;
- suite relevante;
- benchmark representativo;
- determinismo;
- Evidence;
- higiene del diff.

Si el head cambia por una corrección, el gate completo se repite cuando vuelva a existir candidato final.

## 9.7 Señales de consumo anómalo

- prompts largos que duplican fuentes;
- lectura total del repo por defecto;
- más de dos iteraciones en el mismo hilo para una unidad;
- grandes logs pegados;
- repetir merge gate prematuramente;
- modelo caro para tareas simples;
- Codex investigando estrategia ya resuelta;
- evitar un test Shell barato y consumir una tarea Codex especulativa.

---

## 10. Evidence, experimentos y código temporal

La Evidence prevalece sobre intuición, pero debe ser proporcional.

Todo experimento tendrá condición de salida:

- si demuestra capacidad necesaria → integrar sólo lo mínimo productivo;
- si sólo aporta comprensión → documentar y retirar instrumentación temporal;
- si no demuestra beneficio → no ampliarlo;
- benchmarks específicos sólo en tests/Evidence, nunca lógica genérica;
- no declarar optimalidad si la búsqueda terminó por presupuesto.

### 10.1 Diagnóstico causal de Planner Next

Cuando Planner Next o un benchmark representativo:

- agote presupuesto;
- se estanque en una misma profundidad o frontera;
- o libere ramas mediante una optimización sin convertirlas en progreso estructural;

no se autorizará otra modificación de búsqueda por intuición. Antes deberán consultarse o regenerarse las señales causales disponibles del head actual.

Cuando exista la capacidad `causalDiagnostic`, la revisión deberá incluir como mínimo:

1. `waterfallByDepth` o equivalente: dónde se consume el presupuesto por profundidad y fase;
2. `feederByDepth` o equivalente: alternativas evaluadas, válidas e inválidas;
3. causas canónicas de rechazo;
4. tareas/decisiones ya colocadas que actúan como blocker cuando puedan atribuirse sin trabajo oculto;
5. reconciliación del diagnóstico con el accounting autoritativo;
6. comparación antes/después para demostrar si el blocker disminuye, desaparece o sólo se desplaza.

La Evidence A2/Assisted del repositorio y sus diagnósticos causales son estado dinámico: se regeneran desde el benchmark canónico y nunca se copian sus IDs, conteos, porcentajes o recomendaciones como reglas permanentes.

La instrumentación causal sólo puede permanecer integrada si es read-only y está cubierta por pruebas que demuestren neutralidad de status, planificación, fingerprints, ramas, profundidad, podas/backtracks y stop reason. No puede añadir candidatos, reevaluaciones gratuitas, barridos ocultos ni consumo no reconciliado.

Antes de cambiar ordering, candidate domains, matching, Future Feasibility, backtracking o reparto de presupuesto, la pregunta obligatoria pasa a ser:

> **¿Qué decisión o autoridad concreta demuestra la Evidence actual que está cerrando la siguiente alternativa viable?**

Sólo después se formula un único delta causal y su criterio objetivo de aceptación.

---

## 11. Aprendizaje permanente y actualización del protocolo

Si el usuario debe corregir de nuevo el rumbo o recordar una regla ya establecida, se evaluará si el fallo procede de:

- fuente insuficiente;
- instrucción ambigua;
- gate mal diseñado;
- selección incorrecta de herramienta;
- Evidence insuficiente;
- o incumplimiento de una regla existente.

Toda corrección permanente documentará:

1. fallo observado;
2. señal que debía detectarlo;
3. regla preventiva;
4. comprobación que evita repetirlo;
5. versión del protocolo.

No se duplicará texto cuando el problema sea de aplicación y no de ausencia normativa.

---

## 12. Contrato de respuesta al iniciar un chat nuevo

Al recibir la referencia a este documento, ChatGPT deberá:

1. demostrar mediante su trabajo que revisó fuentes y GitHub;
2. resumir baseline, PR activo, aprendizaje reciente, riesgo principal y estado A2 cuando proceda;
3. si el objetivo activo es desbloquear Planner Next / Assisted A2 / Autopilot y existe `causalDiagnostic`/`diagnosticReport`, revisarlo antes de proponer otra modificación de búsqueda;
4. indicar si falta una validación imprescindible;
5. identificar un único siguiente paso;
6. indicar o aplicar la **ruta de ejecución elegida**;
7. si la ruta es Codex, verificar GitHub y mostrar antes del prompt `Rama Codex: <rama-exacta>`;
8. mantener dentro del prompt sólo el contexto Git mínimo necesario;
9. no preguntar “¿quieres que continúe?” cuando pueda continuar por la ruta decidida;
10. si necesita una acción del usuario, pedir sólo la operación de entorno o decisión humana concreta que aporte valor.

> **Frase recomendada para nuevos chats**  
> “Aplica el Protocolo Maestro de Continuidad, Iteración y Control de Rumbo de OptiPlan. Revisa las fuentes, GitHub y la Evidence, reconstruye el estado real, elige la mejor ruta de ejecución para el siguiente paso y continúa.”

---

## 13. Checklist final antes de una nueva unidad lógica

- [ ] He revisado fuentes relevantes.
- [ ] He reconstruido el estado real de GitHub.
- [ ] Sé qué comportamiento debe cambiar.
- [ ] La Evidence demuestra el problema o he decidido la comprobación mínima que falta.
- [ ] Si el planificador está estancado o agota presupuesto, he revisado/regenerado el diagnóstico causal vigente antes de modificar la búsqueda.
- [ ] El cambio es causal y simple.
- [ ] No estoy añadiendo infraestructura sin valor operativo.
- [ ] La unidad es única.
- [ ] El criterio de aceptación es objetivo.
- [ ] Si afecta al planificador, sé qué gate A2-ASSIST, blocker causal o KPI posterior a Assisted Completion pretende mejorar.
- [ ] He elegido explícitamente la ruta `ChatGPT | Codex | Shell/Replit | híbrida`.
- [ ] La elección se basa en coste total, feedback, autoridad de Evidence y riesgo; no en una jerarquía rígida.
- [ ] Si uso Codex, he verificado en GitHub la rama remota exacta y la he mostrado fuera del prompt como `Rama Codex: ...`.
- [ ] Si uso Codex, el prompt es por delta, la lectura es dirigida y el contexto Git es el mínimo suficiente.
- [ ] Si uso Codex, sólo he incluido SHA/HEAD obligatorio cuando cumple una función real de salvaguarda.
- [ ] Si continúo un PR, sigo en su rama salvo que exista una razón material para abrir otra unidad.
- [ ] Si uso Shell/Replit, la petición es breve y responde una pregunta concreta.
- [ ] El merge gate está reservado al head candidato.
- [ ] La siguiente iteración acerca OptiPlan al siguiente gate A2-ASSIST o, tras completar el día, a `PARITY`/`PARETO_BETTER`, sin overfitting A2.

---

## Referencias normativas

`00_INDICE_Y_AUTORIDAD_FUENTES_OPTIPLAN_v2.4.md` · `01_PRODUCTO_DOMINIO_OPERACION_v5.2.md` · `02_ORC_CORE_CONSOLIDADO_v2.2.md` · `03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.2.md` · `04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.4.md` · `05_VALIDACION_CALIDAD_BENCHMARK_v2.2.md` · `06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.2.md` · este Protocolo · los dos PDFs A2 originales.

Puntos especialmente vinculantes: Fuentes 01, 03, 04, 05 y 06 del índice consolidado.

---

## Anexo A — Texto mínimo para las instrucciones del proyecto

> Aplica siempre el Protocolo Maestro de Continuidad vigente y el corpus consolidado definido por `00_INDICE_Y_AUTORIDAD_FUENTES_OPTIPLAN_v2.4.md`, en especial la Fuente 05 de validación/benchmark y la Fuente 06 del canon A2. ChatGPT es responsable de reconstruir el contexto, decidir el problema, el delta y los criterios de aceptación, pero no existe una jerarquía fija de ejecutores. Para cada unidad lógica elige entre ChatGPT/GitHub, Codex, Shell/Replit/Supabase operado por el usuario o una ruta híbrida según autoridad de la Evidence, necesidad de bucle edit-test, interdependencia, riesgo, tiempo, créditos, esfuerzo humano y retrabajo esperado. Codex puede ser la primera opción de implementación aunque ChatGPT pudiera editar el código si ofrece un bucle local más fiable. Antes de cada prompt de Codex, verifica dinámicamente en GitHub la rama remota exacta y muéstrala al usuario fuera del bloque como `Rama Codex: <rama>`. No reutilices una rama de memoria. Dentro del prompt usa contexto Git mínimo suficiente: rama/PR y sincronización con `main` cuando proceda; SHA/HEAD obligatorio sólo si funciona como salvaguarda real. Una comprobación corta en Shell/Replit puede pedirse tempranamente cuando sea la forma más rápida y autoritativa de resolver una incertidumbre. El usuario no actuará como mensajero ni hará tareas administrativas de GitHub que ChatGPT pueda resolver. Mantén prompts por delta, lectura dirigida y validación escalonada; reserva el merge gate completo para el head candidato. Nunca relajes viabilidad, hard constraints, determinismo, Evidence, benchmarks ni control de rumbo por ahorrar créditos o evitar intervención humana.

---

## Regla final

> **ChatGPT decide y orquesta. El ejecutor se elige por evidencia, feedback, riesgo y coste total. No se maximiza autonomía; se maximiza progreso verificado.**
