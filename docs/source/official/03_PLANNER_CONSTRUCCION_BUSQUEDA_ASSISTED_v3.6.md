# OPTIPLAN — CONSTRUCCIÓN, BÚSQUEDA Y PLANIFICACIÓN ASSISTED

**Versión:** 3.6  
**Fecha:** 30 de septiembre de 2026  
**Estado:** Fuente oficial consolidada  
**Absorbe:** SPEC-06, SPEC-07 v2.2, SPEC-08 v1.1 y SPEC-09 v1.1.

## Actualización v3.6 — margen de participante configurable por frontera

Se consolida el contrato de margen hard entre obligaciones consecutivas de un mismo participante. El margen general del día es configurable y cada tarea puede declarar overrides específicos de entrada y salida. Para una frontera temporal `A → B` se resuelve una única separación efectiva:

```text
explicit = valores definidos entre A.participantMarginAfterMinutes y B.participantMarginBeforeMinutes
participantGap(A,B) = max(explicit) si existe al menos un valor explícito
participantGap(A,B) = defaultParticipantTransitionMinutes en otro caso

inicio(B) >= fin(A) + participantGap(A,B)
```

Un `0` explícito es un valor real y sustituye el default; no equivale a campo ausente. Si sólo existe uno de los dos overrides, ese valor gobierna la frontera. Si existen ambos, se usa el mayor y **no se suman**. La resolución debe ser idéntica en generación de dominio, `canPlaceTask`, Future Feasibility, validación y Evidence. Las fases internas de una operación compuesta con `internalTransition = INCLUDED` continúan sin margen adicional entre sí. Los márgenes de participante, recurso, coach, itinerante, holds y preparaciones se validan por sus contratos respectivos; un override de participante no relaja otras autoridades.

La capacidad es de producto: la configuración general, snapshot del día y override de tarea/instancia deben proyectarla sin pérdida. No se permite un hardcode específico de A2 ni una implementación exclusiva del benchmark.

## Actualización v3.5 — reserva virtual de prerrequisitos, presión de participante y witnesses estructurales futuros

Esta versión cierra la ambigüedad entre **demostrar capacidad de alimentación** y **materializar horas nominales** de prerrequisitos breves durante la construcción progresiva. El objetivo es preservar libertad futura sin convertir un witness provisional en una decisión aceptada accidental.

1. Un prerrequisito breve fuera del scope visible —por ejemplo transporte de entrada, preparación personal o styling de entrada— puede participar en la prueba de factibilidad como **reserva virtual, spot anónimo, intervalo de capacidad o witness reparable**. Su uso como supporting obligation no lo convierte por sí solo en placement persistente, protegido ni definitivo.
2. Cuando una estructura productiva posterior dependa de esos prerrequisitos, la construcción debe probar primero una capacidad de alimentación que **maximice libertad futura**. Si hace falta una geometría concreta para certificar capacidad, se usa una representación temprana/capacity-maximizing —por ejemplo left-justified, matching por deadlines o equivalente exacto— y no un horario nominal tardío que reduzca artificialmente el dominio de la estructura posterior. Esta representación es un witness, no una preferencia de hora final.
3. Tras cerrar la estructura productiva y el matching nominal necesario, la materialización de prerrequisitos de apertura conserva una preferencia operativa **temprana** salvo configuración explícita en contrario: `IN` se construye en grupos desde el inicio hard-válido más temprano conforme a su policy; Estilismo entrada y preparaciones equivalentes ocupan los primeros spots hard-válidos compatibles con dependencias y recursos. El objetivo es maximizar slack y capacidad del resto de la jornada, no minimizar por defecto la permanencia del participante. Estilismo salida/OUT se materializan al extremo final conforme a su contrato. Una preferencia de compactación o permanencia nunca puede reutilizarse como prueba de inviabilidad de una estructura que era alimentable con otra materialización autorizada.
4. Cuando varios participantes compitan por spots escasos y ya no sean operacionalmente equivalentes, el orden de matching/búsqueda debe usar **presión efectiva**: fin de disponibilidad, carga mínima restante, slack, cardinalidad de dominio, dependencias, comidas/transiciones y participación en unidades futuras críticas. El ID sólo puede actuar como desempate determinista después de agotar señales operativas materiales. “Más tareas” aislado no es autoridad suficiente.
5. Antes de aceptar un Stage, toda unidad estructural futura `REQUIRED` que el Stage pueda comprometer debe conservar **al menos un witness estructural sound** en contexto analítico: geometría, capacidad y matching/reservas suficientes para demostrar que sigue siendo realizable. Esto incluye rondas sincronizadas, cadenas técnicas, unidades itinerantes, setups y pipelines. Conservar el witness no significa materializar ni aceptar prematuramente la unidad futura.
6. Si una prueba exacta necesita materializar temporalmente una supporting obligation, ese placement es **ephemeral/reparable** salvo que el `PlanningScope`, `includePrerequisites`, una decisión humana aceptada o una autoridad explícita exijan incorporarlo. No debe convertirse en `AutomaticProtection` ni restringir Stages posteriores sólo por haber servido de witness interno.
7. Evidence debe separar explícitamente `virtualSupportingReservations`, `ephemeralSupportingPlacements`, `acceptedSupportingPlacements`, presión usada para desempates y `futureStructuralWitnesses`. Un `PRUNE` deberá indicar si procede de una autoridad hard real o de la pérdida demostrada del último witness estructural; nunca de una materialización provisional elegida por conveniencia.

## Actualización v3.4 — orquestación de scopes por unidad operativa y gate global de futuro

Esta versión cierra una ambigüedad entre la búsqueda interna y la orquestación Assisted: **elegir el siguiente `PlanningScope` también es una decisión de planificación** y no puede reducirse a recorrer espacios por ID, nombre o posición en una lista.

1. El recomendador de scope, un encadenador Assisted o un benchmark de completitud debe construir candidatos a partir de **unidades operativas configuradas**: flujo principal/pipeline, plató multi-espacio, sincronización de rondas, equipo itinerante, cadena técnica, familia de setup u otra identidad explícita. Un scope puede abarcar varios espacios.
2. La siguiente unidad se ordena por criticidad efectiva: duración/carga pendiente, slack y cardinalidad de dominio, dependencias, recursos compartidos, ventanas futuras, transiciones, comidas/descansos, impacto sobre el flujo principal y capacidad de bloquear completitud. **Queda prohibido usar el ID de espacio como autoridad de prioridad.**
3. Si varias tareas pertenecen a la misma unidad operacional declarada, dividirlas en Stages distintos sólo porque tengan `spaceId` diferente requiere una razón operativa objetiva. La unidad conserva internamente sus restricciones de simultaneidad, independencia o setup; agrupar el scope no significa serializar artificialmente sus subespacios.
4. La asignación nominal de trabajo a recursos/equipos materialmente equivalentes se decide mediante matching/balanceo bajo restricciones hard. Una asignación observada en un benchmark humano no puede convertirse en binding fijo si la Fuente de dominio declara equivalencia.
5. Las comprobaciones incrementales de Future Feasibility pueden limitarse a las obligaciones causalmente afectadas durante la exploración si esa reducción es sound. **Antes de aceptar un Stage**, el candidato debe demostrar de nuevo la viabilidad global de todas las obligaciones hard futuras que el Stage puede comprometer, incluidas comidas individuales pendientes, cierres finales y unidades estructurales REQUIRED. Un `Stage` no se acepta por haber validado sólo el último participante tocado.

## Actualización v3.3 — estructuras parcialmente ordenadas y reserva de ventanas críticas

Esta versión hace operativos dos principios que ya eran normativos: **no inventar precedencias** y **proteger libertad futura antes de ocupar ventanas escasas**.

1. Una estructura continua puede estar formada por fases REQUIRED cuyo orden sea fijo mientras el orden interno de sus miembros sea flexible. Un benchmark humano no transforma una permutación observada en precedencia hard.
2. El motor debe medir la presión temporal futura de tareas, participantes, recursos y unidades completas. Para una obligación o unidad con ventana efectiva `W` y carga mínima necesaria `D`, puede derivarse `slack = W - D`, `slackRatio = slack / W` y/o `loadRatio = D / W`, junto con cardinalidad de dominio, recursos compartidos y dependencias. Estas magnitudes ordenan y priorizan la búsqueda; ningún umbral numérico concreto constituye por sí solo una regla HARD salvo configuración explícita.
3. Al colocar una tarea del flujo principal, el motor debe preferir posiciones que conserven holgura de las unidades futuras críticas y evitar consumir sus ventanas si existen alternativas equivalentes. La regla HARD es más fuerte y no depende de un umbral: una colocación se rechaza si elimina **todas** las realizaciones hard-posibles de una obligación/unidad futura REQUIRED.
4. La reserva futura se refiere a la **unidad completa y a su conjunto de realizaciones autorizadas**, no a una hora ni a una permutación nominal concreta.

## 1. Modos oficiales

### SCOPE_CONSTRUCTION — modo primario de producto
Construye una propuesta completa para el scope solicitado sobre un baseline de Stages/placements aceptados. Lo aceptado actúa como contexto fijo para movimientos automáticos, sin convertirse por ello en lock humano.

### DAY_CONSTRUCTION
Caso particular de `SCOPE_CONSTRUCTION` con `scope = DAY`. Conserva el método de construcción global de SPEC-06/07 y constituye base futura de Autopilot.

### REPLANNING
Preserva `done`, `in_progress`, locks y demás contexto protegido; reconsidera sólo trabajo permitido.

### IMPROVEMENT
Optimiza un plan ya construido cuando se solicita explícitamente y sin confundir mejora con construcción.

## 2. Regla de prioridad interna

Cuando los capítulos heredados discrepen:

1. este prefacio Assisted;
2. método constructivo SPEC-07 v2.2;
3. contratos específicos de SPEC-08 y policy/accounting de SPEC-09;
4. SPEC-06 como marco general.

Los ejemplos A2 de SPEC-08 quedan subordinados a `06_A2_CANONICO...`; las reglas genéricas de itinerancia y acompañamiento permanecen vigentes.

## 3. Método rector

Construir primero la estructura que condiciona el scope/día, demostrar que puede ser alimentada por sus prerrequisitos y capacidades compartidas, asignar identidades sólo cuando sea sound, colocar después trabajo difícil/escaso, rellenar trabajo flexible y retroceder causalmente cuando una decisión cierra la solución.

La primera solución completa hard-valid **respecto al scope resuelto y a sus witnesses/supporting obligations necesarios** puede cerrar la petición interactiva. La optimización intensiva de calidad es una fase/petición separada.

## 4. Scope y contexto futuro

El problema proyectado a un scope no puede olvidar interacciones hard materialmente relevantes con trabajo ya aceptado o futuro. Las tareas fuera del scope pueden aparecer como:

- contexto fijo/protegido;
- supporting obligations necesarias;
- contexto analítico de capacidad/factibilidad futura;

sin convertirse automáticamente en variables editables del scope.

Un fallo aproximado/greedy nunca demuestra inviabilidad. Sólo una autoridad hard, una prueba estructural sound o una búsqueda exacta suficiente permite podar como imposible.

## 5. Presupuesto interactivo

En Assisted, el contrato vigente de SPEC-07 v2.2 fija como objetivo operativo una propuesta **hard-valid para el scope en ≤2 minutos** y un techo de cálculo bloqueante de **5 minutos por Stage**. Al alcanzar el techo se devuelve un resultado explícito de presupuesto/tiempo con Evidence causal; nunca se continúa indefinidamente ni se aumenta presupuesto para ocultar un modelo incorrecto.

Objetivos de UX más agresivos pueden medirse como PREFERRED/SLO, pero no sustituyen este contrato de seguridad de la búsqueda.


---

## 6. Scope, prerequisites y visibilidad

El `PlanningScope` contiene las obligaciones que el usuario pidió resolver. Los prerequisites/feeders que hacen falta para demostrar factibilidad pueden ser **supporting obligations internas** sin aparecer como obligaciones seleccionadas ni como tareas visibles de la propuesta.

- Por defecto: el solver puede considerar/reservar prerequisites internamente; eso no expande el scope visible. Una reserva interna no se convierte por sí sola en placement persistente.
- Con `includePrerequisites`: las obligaciones concretas seleccionadas por el contrato pasan a la propuesta visible/editable y pueden consolidarse al aceptar el Stage.
- Un placement supporting creado únicamente para un witness exacto es efímero/reparable salvo autoridad explícita; no recibe `AutomaticProtection` ni debe estrechar Stages posteriores como si hubiese sido aceptado.
- `AutomaticProtection` de placements aceptados no es lock.
- Una tarea fuera del scope puede permanecer como contexto fijo o analítico sin convertirse en variable editable.

### 6.1 Orquestación del siguiente scope Assisted

El `PlanningScope` puede ser elegido por el humano o recomendado/encadenado automáticamente. Cuando la selección sea automática o forme parte de un benchmark de completitud, se aplica esta autoridad:

1. enumerar **unidades operativas elegibles**, no una lista plana de espacios;
2. excluir sólo unidades imposibles por una autoridad hard demostrada;
3. estimar presión efectiva de cada unidad mediante carga/duración pendiente, slack, dominio, recursos, dependencias, transiciones, comidas y efecto sobre otras unidades;
4. elegir la unidad más crítica de forma determinista;
5. resolverla como conjunto estructural y volver a calcular la criticidad sobre el nuevo Stage.

Una unidad puede abarcar varios espacios. Ejemplos genéricos: un plató con varios subespacios que comparte descanso/recursos, dos salas sincronizadas, una agenda de equipos itinerantes o una cadena técnica que atraviesa varios espacios.

No es válido un encadenador que haga, por ejemplo:

```text
main primero
→ resto de spaceId en orden ascendente
```

salvo que ese mismo orden haya emergido de la autoridad de criticidad y pueda demostrarse con Evidence.

La Fuente de dominio específica puede declarar relaciones de prioridad entre unidades para un benchmark concreto. Esas relaciones ordenan **qué estructura debe cerrarse antes**, no copian horas humanas ni convierten el benchmark en seed.


## 7. Invariantes SPEC-07 v2.2 que no pueden degradarse

Para una unidad estructural cuyo eje depende de alimentación previa, la secuencia obligatoria es:

```text
arquitectura mínima de bloques
→ capacidad necessary-only
→ witness estructural anónimo de pipeline
→ matching nominal por bundles
→ materialización / compactación
```

Obligaciones:

1. una cota de capacidad suficiente permite continuar, pero no construye por sí sola el eje;
2. IN, Estilismo Entrada u otras tareas breves que alimentan estructuralmente el eje **no** pueden caer a un DFS standalone para “descubrir” tarde la geometría;
3. las familias con menos bloques factibles se agotan antes de abrir familias con más bloques;
4. identidades operacionalmente equivalentes permanecen contraídas hasta que una autoridad hard las distinga;
5. asignar una identidad a un spot asigna/rematerializa coherentemente su **bundle dependiente**; un cambio nominal exige rematching/rematerialización del bundle afectado, no una permutación nominal aislada;
6. la primera solución completa hard-valid del scope termina la construcción interactiva; mejora/optimización secundaria requiere otra petición/fase;
7. las horas humanas A2 nunca forman el witness ni el matching.

Estas reglas son de método, no una descripción de una implementación experimental concreta.

# PARTE I — SPEC-06 Planificación inicial y búsqueda constructiva

# ORC IMPLEMENTATION SPECIFICATION

# SPEC-06 — Planificación Inicial y Búsqueda Constructiva

Versión 1.0

---

# 1. Objetivo

Esta especificación define cómo el Operational Reasoning Core construye una planificación inicial.

Su finalidad es impedir que la inteligencia del motor se reduzca a reparar u optimizar una planificación generada previamente por otro planificador.

Durante la planificación inicial, el ORC deberá construir la jornada desde el Estado Operativo de origen mediante:

* comprensión global;
* mapa de dependencias;
* detección dinámica de cuellos de botella;
* selección de tareas ancla;
* construcción provisional;
* exploración acotada;
* backtracking;
* simulación;
* validación;
* evaluación;
* consolidación.

La planificación inicial deberá surgir del razonamiento operativo.

No de una secuencia previa heredada.

---

# 2. Alcance

Esta especificación regula:

* planificación inicial;
* construcción provisional;
* priorización dinámica;
* búsqueda constructiva;
* gestión de ramas;
* backtracking;
* completitud;
* Evidence de construcción.

No redefine:

* entidades de dominio;
* severidad de restricciones;
* arquitectura física;
* Valor Operativo;
* persistencia;
* interfaz de usuario.

Esas materias continúan reguladas por los documentos oficiales correspondientes.

---

# 3. Modos oficiales de planificación

El ORC deberá distinguir tres modos.

## DAY_CONSTRUCTION

Se utiliza cuando la petición automática tiene `scope = DAY` y no existe todavía una construcción completa para todas las tareas planificables. Es un modo del solver y base futura de Autopilot; **no** es el modo primario del producto.

El ORC construye el día desde el Estado Operativo de origen.

## REPLANNING

Se utiliza cuando existe una jornada parcialmente planificada, ejecutada o bloqueada.

El ORC preserva lo inamovible y reconstruye únicamente lo pendiente afectado.

## IMPROVEMENT

Se utiliza cuando existe una planificación completa apropiada como incumbente para optimización. El ORC puede proponer mejoras sin confundirlas con construcción. En Assisted, no convierte la ausencia de mejora en impedimento para aceptar un Stage construido/editado por el humano.

Los tres modos utilizan la misma arquitectura física.

No utilizan necesariamente el mismo espacio de búsqueda.

---

# 4. Principio fundamental

El ORC no debe comenzar preguntando:

> ¿Qué tarea puedo colocar primero?

Debe comenzar preguntando:

> ¿Qué decisiones condicionan la viabilidad y la calidad de toda la jornada?

La planificación inicial deberá construirse alrededor de:

* tareas que originan cuellos de botella;
* cadenas de dependencias críticas;
* concursantes con menor holgura;
* recursos escasos;
* espacios saturados;
* equipos itinerantes;
* límites de bloques y cambios;
* continuidad del flujo principal configurado;
* libertad futura.

La primera colocación localmente válida no constituye una decisión suficiente.

Toda decisión provisional deberá evaluarse por su impacto sobre lo que todavía queda por planificar.

---

# 5. Separación obligatoria de modos

DAY_CONSTRUCTION no podrá implementarse como:

```text
Generar planificación completa con otro motor
        ↓
Cargarla como baseline del ORC
        ↓
Reparar conflictos
        ↓
Cerrar huecos
        ↓
Publicar el resultado
```

Esa secuencia pertenece a una estrategia de reparación o mejora.

No constituye planificación inicial ORC.

REPLANNING tampoco podrá reconstruir tareas ya ejecutadas o bloqueadas.

IMPROVEMENT no podrá sustituir DAY_CONSTRUCTION cuando todavía no existe un plan ORC completo y válido.

---

# 6. Papel de motores anteriores

Durante DAY_CONSTRUCTION, una planificación generada por V3, V4 o cualquier otro motor no podrá utilizarse como:

* semilla cognitiva;
* incumbente inicial;
* orden de tareas;
* mapa de prioridades;
* fuente de tareas ancla;
* reducción autoritativa del espacio de búsqueda.

Los motores anteriores podrán utilizarse únicamente como:

* benchmark;
* comparación externa;
* fallback seguro;
* fuente diagnóstica no autoritativa.

El fallback sólo podrá activarse después de que el ORC no consiga una planificación completa y válida dentro del presupuesto configurado.

El fallback nunca deberá confundirse con el razonamiento constructivo del ORC.

---

# 7. Estado inicial constructivo

DAY_CONSTRUCTION parte de un Estado Operativo que contiene, como mínimo:

* jornada y límites temporales;
* tareas y duraciones;
* concursantes;
* auxiliares y equipos itinerantes;
* espacios y zonas;
* recursos;
* disponibilidades;
* dependencias;
* comidas;
* descansos;
* transporte;
* locks;
* estados de ejecución;
* configuración;
* severidad de reglas;
* prioridades operativas.

Las tareas pendientes no protegidas podrán carecer de asignación temporal definitiva.

Las asignaciones existentes se conservarán únicamente cuando estén protegidas por:

* estado de ejecución;
* lock;
* decisión humana explícita;
* contrato de dominio equivalente.

No se eliminará información operacional para simplificar la construcción.

---

# 8. Comprensión previa a la colocación

Antes de generar la primera colocación provisional, el SEE deberá construir una visión global de la jornada.

Como mínimo deberá analizar:

* grafo de dependencias;
* cadenas de prerrequisitos;
* cadenas de dependientes;
* ventanas temporales;
* carga pendiente;
* disponibilidad efectiva;
* presión de recursos;
* presión de espacios;
* presión de equipos itinerantes;
* flujo principal;
* comidas y descansos;
* transporte;
* límites de bloques;
* cambios de actividad;
* setups;
* locks;
* libertad futura.

Esta comprensión no depende de una planificación previa completa.

Debe derivarse del dominio, la configuración y las restricciones del día.

---

# 9. Grafo de dependencias

Las dependencias constituyen una estructura central de la planificación.

Si la tarea A depende de la tarea B:

* B es prerrequisito de A;
* B deberá finalizar antes de que A pueda comenzar;
* A no podrá materializarse temporalmente antes de B.

El ORC deberá distinguir:

* orden de razonamiento;
* orden de ejecución.

Puede seleccionar primero A como tarea ancla.

Eso no significa ejecutar A antes que B.

El proceso correcto será:

```text
Seleccionar A como ancla
        ↓
Proponer una ventana provisional para A
        ↓
Calcular el cierre de prerrequisitos
        ↓
Colocar B y los demás prerrequisitos antes de A
        ↓
Validar la cadena completa
        ↓
Mantener, desplazar o descartar la ventana de A
```

No se permitirá invertir la semántica de dependencia.

---

# 10. Cierre de dependencias

Toda tarea ancla deberá analizarse junto con su cierre relevante.

El cierre podrá incluir:

* prerrequisitos directos;
* prerrequisitos transitivos;
* tareas que comparten recursos críticos;
* tareas del mismo concursante;
* tareas del mismo equipo itinerante;
* tareas que consumen el mismo espacio exclusivo;
* dependientes que limitan la posición del ancla.

El cierre deberá permanecer acotado por el presupuesto de búsqueda.

Una tarea ancla no podrá considerarse viable observándola de forma aislada.

---

# 11. Criticidad dinámica

La criticidad no será una categoría fija de personas, tareas, espacios o recursos.

Se calculará para cada jornada y para cada estado de búsqueda.

Como mínimo deberá considerar:

* duración pendiente;
* disponibilidad efectiva;
* ratio carga/disponibilidad;
* holgura;
* hora de llegada;
* hora límite de salida;
* longitud y duración de la cadena de dependencias;
* número de dependientes;
* capacidad de desbloqueo;
* pertenencia al flujo principal;
* escasez de recursos;
* saturación de espacios;
* presión de equipos itinerantes;
* riesgo de fragmentación;
* límites de bloques o cambios;
* setups necesarios;
* alternativas disponibles;
* capacidad de recuperación;
* libertad futura.

Una persona o recurso podrá ser crítico en una jornada y no crítico en otra.

### 11.1 Presión temporal y holgura relativa

Cuando exista una ventana efectiva suficientemente acotada para una obligación o unidad, el ORC deberá poder derivar, como diagnóstico genérico:

```text
W = amplitud de la ventana hard todavía utilizable
D = carga mínima necesaria dentro de W
S = W - D
slackRatio = S / W
loadRatio = D / W
```

Estas magnitudes no sustituyen el dominio exacto. Se combinan con, entre otros:

- número de starts/posiciones todavía factibles;
- número de permutaciones/matchings autorizados;
- recursos y espacios compartidos;
- dependencias anteriores y posteriores;
- transiciones;
- obligaciones del mismo participante;
- capacidad de recuperación si una alternativa desaparece.

Una `slackRatio` pequeña o un `loadRatio` alto incrementan la prioridad y la necesidad de preservar capacidad. Un valor como 25% puede usarse como **umbral configurable de alerta, visualización o activación de una heurística**, pero nunca como constante hard universal del motor.

El criterio hard permanece independiente del umbral: si una decisión provisional hace que el dominio completo de una obligación/unidad futura REQUIRED pase a cero, esa rama debe rechazarse.

No se hardcodearán identidades ni categorías estructurales permanentes.

---

# 12. Cuellos de botella

Un cuello de botella es cualquier elemento cuya mala colocación pueda:

* hacer imposible completar la jornada;
* bloquear el flujo principal;
* consumir una ventana escasa;
* impedir una cadena de dependencias;
* saturar un recurso;
* superar un límite de cambios o setups;
* aumentar significativamente el makespan;
* provocar permanencias evitables;
* reducir excesivamente la libertad futura.

Podrán actuar como cuellos de botella:

* tareas;
* concursantes;
* recursos;
* espacios;
* equipos itinerantes;
* ventanas;
* cadenas de dependencias;
* setups;
* bloques de actividad.

El SEE deberá detectar y ordenar los cuellos de botella antes de consumir presupuesto en tareas flexibles.

---

# 13. Precedencia de prioridades

La construcción deberá respetar la siguiente precedencia conceptual.

## Nivel 1 — Viabilidad hard

Nunca podrán violarse:

* disponibilidades;
* dependencias;
* ocupación de concursantes;
* ocupación de espacios;
* capacidad de recursos;
* equipos itinerantes;
* comidas;
* descansos;
* transporte;
* locks;
* tareas `done`;
* tareas `in_progress`;
* demás restricciones hard configuradas.

## Nivel 2 — Riesgo de imposibilidad futura

Deberán explorarse antes las decisiones con:

* menor holgura;
* menor número de alternativas;
* ventana más estrecha;
* mayor carga relativa;
* recurso más escaso;
* cadena más larga;
* mayor efecto de desbloqueo;
* mayor riesgo de bloquear la completitud.

## Nivel 3 — Flujo principal configurado

Las tareas del flujo principal serán candidatas preferentes a tareas ancla.

Dentro del flujo principal deberán priorizarse dinámicamente:

* concursantes más críticos;
* cadenas con menor holgura;
* tareas que pueden alimentar antes la continuidad;
* tareas dependientes de recursos escasos;
* tareas cuya demora cierre opciones posteriores.

## Nivel 4 — Estructura operativa

Deberán respetarse según configuración:

* máximos de bloques;
* máximos de cambios de actividad;
* familias de setup;
* continuidad de equipos;
* agrupaciones;
* logística de zonas.

## Nivel 5 — Calidad global

Después de preservar los niveles anteriores, el ORC optimizará:

* hora de finalización;
* continuidad;
* permanencias;
* esperas;
* compactación;
* cambios de zona;
* robustez;
* margen operativo;
* estabilidad;
* explicabilidad.

La precedencia no autoriza a convertir reglas soft en hard.

La severidad oficial de cada regla deberá preservarse.

---

# 14. Tareas ancla

Una tarea ancla es una decisión provisional que organiza una región de la jornada.

Podrán ser candidatas:

* tareas del flujo principal;
* tareas de concursantes con baja holgura;
* tareas con ventana estrecha;
* tareas asociadas a recursos escasos;
* tareas de cadenas críticas;
* tareas que desbloquean trabajo posterior;
* tareas condicionadas por setups o límites de cambios;
* tareas cuya colocación tardía pueda hacer imposible la jornada.

Una tarea ancla no es un lock.

No es definitiva.

Su posición podrá mantenerse, desplazarse, sustituirse o deshacerse.

Sólo el Commit Engine consolida el `OperationalState` interno de esa ejecución; no crea por sí mismo `Stage`, `daily_tasks` ni `OfficialPlan`.

---

# 15. Orden de anclas

El orden de tareas ancla deberá ser determinista y dinámico.

No podrá basarse únicamente en:

* orden de creación;
* ID;
* hora más temprana;
* primera tarea de la lista;
* primer hueco disponible;
* orden heredado de V4;
* nombre del espacio;
* tipo nominal de tarea.

El orden deberá derivarse de la criticidad operativa.

Cuando dos anclas posean criticidad equivalente, el desempate utilizará reglas deterministas y estables.

---

# 16. PartialPlan — artefacto interno del solver

Un `PartialPlan` representa una construcción provisional **interna** de una parte del problema automático. No es `WorkingPlan`, `Draft`, `ScopeProposal` ni `Stage` de producto.

Pertenece al Estado Cognitivo.

Nunca constituye `ScopeProposal`, `Draft`, `Stage` ni `OfficialPlan`; es sólo un artefacto interno del solver.

Podrá contener:

* tareas ancla;
* prerrequisitos colocados;
* dependientes condicionados;
* reservas temporales;
* recursos y espacios comprometidos;
* decisiones provisionales;
* tareas todavía pendientes;
* alternativas abiertas;
* restricciones propagadas;
* libertad restante;
* Evidence de la rama.

Un PartialPlan deberá ser:

* inmutable;
* comparable;
* trazable;
* determinista;
* reversible mediante otra rama.

No se publicará como resultado final.

---

# 17. Ciclo constructivo

DAY_CONSTRUCTION deberá seguir un ciclo equivalente a:

```text
Comprender el Estado Operativo
        ↓
Construir mapa de criticidad
        ↓
Seleccionar cuello de botella
        ↓
Seleccionar tarea ancla o cadena
        ↓
Generar ventanas plausibles
        ↓
Propagar prerrequisitos y restricciones futuras
        ↓
Construir PartialPlans alternativos
        ↓
Filtrar inviables
        ↓
Estimar Future Feasibility
        ↓
Ordenar ramas
        ↓
Profundizar o retroceder
        ↓
Completar jornada
        ↓
Validar planificación completa
        ↓
Evaluar Estados completos válidos
        ↓
Consolidar
```

No se permitirá una secuencia irreversible de primera tarea y primer hueco válido.

---

# 18. Propagación

## Hacia atrás

Seleccionada una tarea ancla, el ORC deberá propagar:

* prerrequisitos directos y transitivos;
* ventanas mínimas;
* necesidades de recurso;
* necesidades de espacio;
* disponibilidad del concursante;
* transporte;
* comidas y descansos;
* límites estructurales aplicables.

La propagación deberá demostrar que el ancla puede alimentarse realmente.

## Hacia delante

Toda colocación provisional deberá propagar:

* dependientes;
* consumo futuro de recursos;
* ocupación futura de espacios;
* carga restante del concursante;
* presión de equipos itinerantes;
* bloques y cambios restantes;
* setups pendientes;
* continuidad del flujo principal;
* makespan mínimo posible;
* libertad futura.

Una decisión localmente válida deberá rechazarse cuando haga inviable el resto de la jornada.

---

# 19. Future Feasibility

Future Feasibility representa la capacidad estimada de completar correctamente todo lo pendiente después de una decisión provisional.

Como mínimo deberá analizar:

* duración pendiente frente a ventanas restantes;
* carga de cada concursante frente a su disponibilidad;
* carga de recursos críticos;
* capacidad restante de espacios;
* cadenas todavía pendientes;
* ventanas de salida temprana;
* tareas del flujo principal todavía no alimentadas;
* bloques disponibles;
* cambios de actividad restantes;
* setups restantes;
* margen ante pequeños retrasos;
* alternativas todavía disponibles.

Future Feasibility no sustituye a la validación final.

Es un criterio de búsqueda y poda.

No forma parte del Validation Engine.

---

# 20. Libertad futura

La libertad futura deberá tratarse como una dimensión operativa explícita.

Una rama posee mayor libertad futura cuando conserva:

* más ventanas compatibles;
* más alternativas de recurso;
* más alternativas de secuencia;
* más margen temporal;
* menos saturación;
* mayor capacidad de absorber retrasos;
* menor dependencia de una única decisión posterior.

El ORC no deberá consumir temprano una ventana crítica con trabajo flexible cuando pueda ser necesaria para una tarea estructural.

---

# 21. Ramas, backtracking y poda

El SEE deberá conservar varias ramas prometedoras cuando una decisión crítica admita alternativas relevantes.

Las ramas podrán diferir en:

* tarea ancla;
* ventana del ancla;
* orden de cadenas;
* asignación de recurso permitida;
* distribución de bloques;
* estrategia de setup;
* compromiso de continuidad.

El backtracking deberá activarse cuando una rama produzca:

* violación hard;
* imposibilidad de completar una cadena;
* pérdida crítica de libertad futura;
* saturación de recurso;
* bloqueo del flujo principal;
* superación de límites estructurales;
* incapacidad de planificar un concursante crítico;
* dependencia sin ventana posible;
* dominancia clara por otra rama.

El ORC deberá poder volver al último punto de decisión y probar otra alternativa.

Una rama podrá podarse cuando:

* sea hard-invalid;
* no pueda completar todas las tareas;
* repita un estado explorado;
* sea dominada;
* exceda el presupuesto;
* contradiga locks o tareas protegidas.

Backtracking y poda deberán ser deterministas, acotados y explicables.

---

# 22. Compromiso progresivo

El ORC podrá aumentar la estabilidad cognitiva de una decisión provisional cuando:

* su criticidad sea alta;
* su ventana sea estrecha;
* desbloquee cadenas importantes;
* múltiples ramas converjan en la misma posición;
* moverla tenga un coste operativo elevado.

El compromiso progresivo:

* reduce reconsideraciones innecesarias;
* no crea locks;
* no modifica el `OperationalState` interno vigente;
* no impide el backtracking;
* permanece reversible hasta el commit.

---

# 23. Fronteras operativas

La construcción no explorará minuto a minuto.

Las posiciones candidatas deberán derivarse de fronteras reales.

Como mínimo:

* inicio y fin de jornada;
* inicio y fin de disponibilidad;
* inicio y fin de tareas protegidas;
* final de prerrequisitos;
* inicio de dependientes;
* liberación de concursantes;
* liberación de espacios;
* liberación de recursos;
* comienzo y fin de comidas;
* comienzo y fin de descansos;
* comienzo y fin de transporte;
* comienzo y fin de locks;
* fronteras de setup;
* granularidad configurada.

La granularidad deberá ser configurable.

---

# 24. Flujo principal y concursantes críticos

El flujo principal configurado constituye una prioridad máxima de continuidad.

Durante la construcción, el ORC deberá:

* identificar sus tareas pendientes;
* tratarlas como candidatas preferentes a ancla;
* ordenar primero las más críticas;
* preparar antes sus prerrequisitos;
* reservar capacidad de recursos y espacios feeder;
* evitar consumir sus ventanas con trabajo flexible;
* mantenerlo activo salvo imposibilidad demostrada;
* explicar cualquier hueco inevitable.

Dentro del flujo principal y de las demás cadenas relevantes, el ORC deberá detectar dinámicamente los concursantes con mayor riesgo según:

* hora límite de salida;
* hora de llegada;
* carga total pendiente;
* disponibilidad efectiva;
* número y duración de tareas;
* cadena de dependencias;
* recursos escasos;
* desplazamientos;
* comidas y descansos;
* holgura restante.

La prioridad del flujo principal no autoriza a incumplir dependencias.

Antes de aceptar una posición concreta del flujo principal para un participante que pertenece a una obligación/unidad futura de alta presión temporal, el ORC deberá considerar el impacto sobre el dominio completo de esa unidad:

- preferir posiciones que no intersecten su ventana crítica cuando existan alternativas equivalentes;
- preferir decisiones que eliminen menos realizaciones futuras;
- conservar al menos una realización hard-posible del bloque/unidad completa;
- si la unidad admite orden interno flexible, conservar cualquiera de sus realizaciones autorizadas, no una permutación predeterminada;
- rechazar la posición únicamente cuando la Future Feasibility sound demuestre dominio cero.

Una tarea feeder podrá ejecutarse antes porque alimenta temporalmente una tarea principal seleccionada como ancla.

---

# 25. Recursos, espacios y equipos críticos

El ORC deberá estimar la presión real de:

* recursos;
* espacios;
* zonas;
* equipos itinerantes;
* desplazamientos;
* ventanas compartidas.

Las tareas flexibles no deberán consumir primero las únicas ventanas viables de un recurso crítico.

Una solución temporalmente válida pero logísticamente inviable deberá descartarse.

El motor deberá preservar:

* exclusividad;
* capacidad;
* disponibilidad;
* tiempos de transición;
* prioridades configuradas;
* relaciones entre espacios feeder y flujo principal.

---

# 26. Bloques, cambios, setups, comidas y transporte

Los límites de bloques, cambios de actividad y setups forman parte del razonamiento constructivo.

El ORC deberá mantener:

* bloques utilizados;
* cambios utilizados;
* setup activo;
* setups pendientes;
* capacidad estructural restante;
* tareas compatibles con el bloque actual.

No deberá consumir de forma prematura la capacidad de cambio con tareas flexibles cuando existan cadenas críticas pendientes.

La severidad de estas reglas será la configurada por el dominio.

El ORC no podrá hardcodear máximos, espacios o setups.

Las comidas, descansos y transportes deberán incorporarse desde el inicio.

No se tratarán como huecos productivos disponibles cuando su contrato los proteja.

En `SCOPE_CONSTRUCTION`, la aceptación de un Stage debe conservar un witness global de las comidas individuales y demás obligaciones futuras hard relevantes bajo el snapshot completo resultante. Durante la DFS pueden utilizarse probes incrementales sobre el subconjunto causalmente afectado para ahorrar coste, pero esa optimización no sustituye el gate global de aceptación ni autoriza a consolidar un Stage si cualquier obligación pendiente queda sin dominio.

---

# 27. Locks y estados de ejecución

Las tareas `done` e `in_progress` nunca podrán modificarse.

Los locks activos deberán preservarse.

Durante REPLANNING:

* sólo se reconstruirá lo pendiente;
* las tareas protegidas formarán parte del estado inicial fijo;
* su posición condicionará las ramas;
* no se tratarán como decisiones provisionales reversibles.

Una edición humana relevante deberá convertirse en una restricción explícita y trazable.

---

# 28. Responsabilidades de los componentes

## Search & Exploration Engine

Durante DAY_CONSTRUCTION, el SEE deberá:

* comprender el estado sin planning completo;
* construir el mapa de criticidad;
* detectar cuellos de botella;
* priorizar tareas ancla;
* construir Search Spaces constructivos;
* generar estrategias de PartialPlan;
* ordenar ramas;
* asignar presupuesto;
* decidir cuándo podar o retroceder.

El SEE nunca materializa directamente una planificación.

## Transformation Engine

Convierte una estrategia constructiva en CandidateState.

Puede materializar mecánicamente anclas, cadenas, reservas o desplazamientos provisionales.

Nunca calcula criticidad ni decide calidad.

## Simulation Engine

Aplica cada CandidateState sobre una copia.

Nunca modifica el `OperationalState` interno vigente.

## Validation Engine

La validación de rama descarta violaciones hard demostrables.

La validación final comprueba la planificación completa materializada.

Un PartialPlan válido no implica un Estado Operativo final válido.

## Operational Evaluator

Compara Estados Operativos completos y válidos.

Las estimaciones del SEE sólo ordenan la búsqueda.

No sustituyen OperationalValue ni deciden el commit.

## Commit Engine

En `DAY_CONSTRUCTION`, sólo consolida como resultado automático final una construcción completa, válida, coherente, explicable y determinista para el día.

Esta regla no describe ScopeProposal/Draft/Stage Assisted: un Stage puede representar progreso parcial respecto al día.

---

# 29. Completitud y fallback

Una planificación inicial se considera completa cuando:

* todas las tareas planificables poseen asignación válida;
* no existen omisiones silenciosas;
* toda exclusión posee una razón oficial;
* todas las dependencias están resueltas;
* el Estado Operativo puede ejecutarse;
* la validación canónica final es válida.

Si el presupuesto se agota sin una solución ORC completa y válida:

* no se publicará una rama parcial;
* no se forzará una validación;
* no se ocultarán tareas pendientes;
* se utilizará el fallback configurado;
* se registrará que no fue la semilla del ORC;
* se explicará dónde se agotó la construcción;
* se conservará Evidence de los blockers.

El fallback es un mecanismo de seguridad.

No es la estrategia cognitiva del ORC.

---

# 30. Replanificación y mejora

REPLANNING utiliza el mismo razonamiento constructivo sobre un Estado Operativo parcialmente fijado.

Deberá preservar:

* `done`;
* `in_progress`;
* locks;
* placements aceptados protegidos por `AutomaticProtection`;
* decisiones válidas no afectadas cuando proceda.

Sólo explorará tareas pendientes afectadas.

En el solver automático, `IMPROVEMENT` comienza después de disponer de un incumbent completo, hard-valid, explicable y consolidado. Esto no impide operar sobre un `Stage` Assisted con excepciones humanas aceptadas: esas excepciones se tratan como baseline explícita conforme a la Fuente 04 y no autorizan nuevas violaciones.

Puede:

* cerrar huecos;
* reducir permanencias;
* compactar recursos;
* mejorar robustez;
* reducir cambios;
* mejorar logística.

Estas capacidades no sustituyen DAY_CONSTRUCTION.

Una mala construcción inicial no deberá tratarse indefinidamente como un problema de optimización posterior.

---

# 31. Evidence y explicabilidad

DAY_CONSTRUCTION deberá registrar, como mínimo:

* modo de planificación;
* Estado Operativo inicial;
* tareas protegidas;
* mapa de dependencias;
* mapa de criticidad;
* cuellos de botella;
* tareas ancla consideradas;
* orden de exploración;
* ventanas candidatas;
* cierres de prerrequisitos;
* PartialPlans generados;
* ramas abiertas y podadas;
* backtracks;
* causas de poda y backtracking;
* Future Feasibility;
* libertad futura;
* primera solución completa;
* soluciones completas alternativas;
* candidato final;
* validación final;
* motivo de commit;
* motivo de fallback.

La explicación deberá responder en términos operativos:

* qué condicionaba la jornada;
* qué concursantes tenían menor holgura;
* qué tareas actuaron como anclas;
* qué prerrequisitos se colocaron antes;
* qué recursos o espacios limitaron opciones;
* por qué se descartaron ramas;
* por qué se eligió la planificación final;
* qué riesgos permanecen.

---

# 32. Presupuesto, determinismo y configuración

La búsqueda constructiva deberá operar con un presupuesto explícito.

Como mínimo podrá limitar:

* tareas ancla;
* ventanas por ancla;
* profundidad;
* anchura de búsqueda;
* PartialPlans activos;
* candidatos simulados;
* backtracks;
* tiempo total;
* memoria temporal.

Todos los límites deberán ser configurables.

Con el mismo Estado Operativo, configuración, locks y presupuesto, el ORC deberá producir exactamente:

* el mismo mapa de criticidad;
* el mismo orden de anclas;
* las mismas ramas;
* las mismas podas;
* los mismos backtracks;
* las mismas soluciones completas;
* la misma planificación final;
* la misma Evidence.

No se permite aleatoriedad.

No se hardcodearán nombres, identidades, máximos, pesos, ventanas, profundidad, anchura o presupuestos.

---

# 33. Antipatrones prohibidos

Durante DAY_CONSTRUCTION queda prohibido:

* utilizar V4 como semilla autoritativa;
* ordenar únicamente por ID;
* ordenar únicamente por hora de disponibilidad;
* colocar tareas flexibles antes de analizar cuellos de botella;
* utilizar la primera posición válida;
* ignorar Future Feasibility;
* posponer dependencias para una reparación final;
* cerrar huecos como sustituto de construcción;
* consolidar PartialPlans;
* crear locks implícitos;
* modificar `done` o `in_progress`;
* ocultar tareas no planificadas;
* usar fuerza bruta minuto a minuto;
* aceptar una solución no determinista;
* optimizar una única métrica local;
* añadir heurísticas específicas para un plan concreto.

---

# 34. Tests obligatorios

Toda implementación deberá demostrar:

## Planificación inicial sin V4

La planificación ORC se construye sin ejecutar V4 previamente.

V4 no aparece como seed ni incumbente inicial.

## Criticidad dinámica

El mismo recurso o concursante es crítico en una jornada y no crítico en otra.

## Concursante con baja holgura

Se explora antes que otro con gran libertad cuando condiciona la completitud.

## Flujo principal

Sus tareas actúan como anclas preferentes.

Sus prerrequisitos se ejecutan antes temporalmente.

## Dependencias

Si A depende de B, nunca se materializa A antes de finalizar B.

## Cadena crítica

Se protege antes que trabajo flexible.

## Tarea alternativa

Cuando un ancla no puede alimentarse, se prueba otra ventana o cadena.

## Backtracking

Una decisión inicialmente válida bloquea una cadena posterior.

El ORC retrocede y encuentra otra solución.

## Recurso escaso

Sus únicas ventanas no se consumen primero con tareas flexibles.

## Bloques y cambios

Se respetan máximos y severidades configurados.

## Comidas y descansos

No se utilizan como ventanas productivas protegidas.

## Locks y estados

`done`, `in_progress` y locks permanecen intactos.

## Completitud

Un `PartialPlan` interno nunca se presenta como resultado automático completo. Esto no prohíbe un `ScopeProposal` o `Draft` parcial respecto al día.

## Fallback

Sólo se activa después del fracaso constructivo y nunca actúa como semilla.

## Determinismo

Misma entrada produce exactamente la misma construcción y Evidence.

---

# 35. Benchmarks obligatorios

Los benchmarks de planificación inicial deberán registrar, como mínimo:

* modo DAY_CONSTRUCTION;
* motor externo usado como seed;
* mapa de criticidad;
* orden de anclas;
* tiempo hasta la primera solución completa;
* número de PartialPlans;
* número de ramas;
* número de podas;
* número de backtracks;
* profundidad máxima;
* candidatos simulados;
* soluciones completas encontradas;
* conflictos hard;
* tareas no planificadas;
* continuidad del flujo principal;
* makespan;
* permanencia;
* uso de recursos críticos;
* bloques y cambios;
* robustez;
* determinismo;
* comparación externa con V4;
* explicación operacional.

Un benchmark que sólo mida mejoras aplicadas sobre una planificación V4 no valida DAY_CONSTRUCTION.

---

# 36. Criterios de aceptación

Una implementación de DAY_CONSTRUCTION sólo podrá aceptarse cuando:

* no utiliza una planificación externa como seed;
* construye el mapa de criticidad antes de colocar;
* prioriza dinámicamente cuellos de botella;
* utiliza tareas ancla provisionales;
* respeta dependencias;
* conserva alternativas relevantes;
* utiliza backtracking;
* evalúa Future Feasibility;
* preserva hard constraints;
* preserva locks y estados;
* respeta bloques, cambios y setups configurados;
* produce una planificación completa;
* supera la validación final;
* genera Evidence completa;
* es determinista;
* demuestra calidad operativa en benchmarks representativos.

Compilar no constituye evidencia suficiente.

Encontrar una solución válida no constituye por sí solo evidencia de inteligencia operativa.

---

# 37. Relación con otras SPEC

La Fuente 02 consolida la arquitectura física, el modelo general de estados, SEE, Decision Engine y Cognitive Memory/Evidence antes descritos por SPEC-00…04.

La Fuente 05 gobierna validación, benchmarks y regresiones.

Esta Parte I conserva dentro de la Fuente 03 la semántica general antes descrita por SPEC-06; la Parte II/SPEC-07 v2.2 prevalece para el método constructivo por bloques cuando sea aplicable.

En caso de conflicto:

* las restricciones de dominio prevalecen;
* los principios no negociables del ORC prevalecen;
* esta SPEC prevalece sobre implementaciones anteriores de planificación inicial.

---

# 38. Regla de evolución

Toda evolución de DAY_CONSTRUCTION deberá responder:

* ¿mejora la detección de cuellos de botella?
* ¿mejora la selección de anclas?
* ¿mejora la propagación de dependencias?
* ¿preserva más libertad futura?
* ¿reduce ramas inútiles?
* ¿mejora el backtracking?
* ¿produce mejores Estados completos?
* ¿mantiene determinismo y Evidence?

No se añadirán capacidades por elegancia arquitectónica.

La evidencia prevalece sobre la intuición.

---

# 39. Definición de éxito

DAY_CONSTRUCTION será exitosa cuando el ORC sea capaz de:

* comprender la jornada antes de colocar tareas;
* detectar dinámicamente sus cuellos de botella;
* utilizar el flujo principal como estructura operativa;
* priorizar concursantes y recursos con menor holgura;
* colocar antes temporalmente los prerrequisitos necesarios;
* conservar alternativas;
* retroceder cuando una decisión cierre opciones futuras;
* completar todas las tareas planificables;
* respetar todas las restricciones hard;
* respetar bloques, cambios y setups configurados;
* producir una planificación operativamente sólida;
* explicar cómo la construyó;
* superar consistentemente benchmarks representativos.

---

# 40. Principio rector

El ORC no debe reparar al final una jornada que construyó sin criterio.

Debe construirla desde el principio alrededor de aquello que realmente condiciona la producción.

Primero comprende.

Después prioriza.

Después construye provisionalmente.

Después simula y valida.

Retrocede cuando sea necesario.

Sólo consolida cuando la jornada completa es viable, explicable y operativamente sólida.

La producción tiene que salir.


---

# PARTE II — SPEC-07 Método constructivo por bloques v2.2 (promovido)

# OPTIPLAN — ESPECIFICACIÓN OPERATIVA DEL PLANIFICADOR

# SPEC-07 — Método Operativo de Planificación Constructiva por Bloques

Versión 2.2

Provenance histórica: antigua propuesta SPEC-07; su contenido vigente queda incorporado y promovido por esta Fuente consolidada. No existe como autoridad paralela.

Actualización v2.2: cierra de forma normativa la diferencia entre **certificado de capacidad** y **witness estructural de pipeline**. Una cota `requiredCount(T) <= maximumFeedableCount(T)` sólo puede demostrar imposibilidad o permitir continuar; no constituye por sí sola una construcción suficiente del eje productivo cuando IN, preparaciones personales, feeders y flujo principal determinan conjuntamente su geometría temporal. Antes de asignar identidades concretas, el planificador deberá construir un **witness estructural anónimo de pipeline**: spots temporales concretos y mutuamente compatibles para las etapas necesarias de alimentación y producción, sin convertir todavía esos spots en horarios nominales definitivos. La secuencia obligatoria pasa a ser `arquitectura mínima de bloques → capacidad necessary-only → witness anónimo de pipeline → matching nominal por bundles → materialización/compactación`. Las tareas breves que forman parte de ese pipeline —por ejemplo IN o Estilismo Entrada cuando condicionan la disponibilidad productiva— no podrán delegarse a un DFS genérico de tareas para que descubra tarde una geometría que debía cerrarse estructuralmente. Las familias de arquitecturas se exploran por **mínimo número de bloques factible**, y la primera solución completa hard-valid termina la petición de construcción interactiva; la optimización de calidad posterior requiere una fase o petición separada. En planificación Assisted interactiva, el objetivo operativo es obtener la propuesta en ≤2 minutos y el techo de cálculo bloqueante es 5 minutos por Stage; al alcanzar ese techo se devuelve un resultado explícito de presupuesto/tiempo, nunca se continúa indefinidamente.

Actualización v2.1: explicita la **capacidad colectiva de alimentación previa a la asignación nominal**. La geometría de una unidad estructural puede construirse como spots temporales antes de fijar qué participante ocupa cada uno, pero esos spots sólo son admisibles si la demanda acumulada hasta cada horizonte no supera la capacidad hard-posible de sus prerrequisitos compartidos. IN, preparaciones personales como Estilismo Entrada, feeders, espacios y recursos compartidos se proyectan mediante dominios, capacidad agregada, matching o certificados equivalentes reutilizando las autoridades estructurales existentes; no se crea un segundo scheduler ni una planificación nominal temprana. La capacidad temprana sirve para demostrar que una geometría puede ser alimentada y no constituye el horario final de los prerrequisitos. Las identidades operacionalmente equivalentes permanecen contraídas hasta que una autoridad hard las distinga; después se asignan mediante matching o búsqueda exacta. Un certificado de capacidad suficiente sólo permite continuar; únicamente una insuficiencia necessary-only o exacta sound autoriza la poda.

Actualización v2.0: eleva a invariante universal la **alimentación factible previa a toda posición productiva**. Ninguna tarea, slot, ronda, bloque o geometría estructural puede considerarse temporalmente candidata sólo porque el espacio esté libre: debe conservar una cadena hard-posible desde sus prerrequisitos pendientes y desde el estado efectivo del participante, recursos y unidades implicadas. En unidades con varios miembros, la viabilidad individual no basta cuando compiten por transporte, espacios, recursos o prerrequisitos compartidos: antes de consumir búsqueda combinatoria debe demostrarse capacidad/matching conjunto necessary-only o exacto suficiente. Las horas concretas no se hardcodean; el primer inicio realmente candidato emerge de las disponibilidades, dependencias, ocupaciones, transiciones y capacidades del Estado Operativo. Esta regla es genérica y se aplica por igual al flujo principal, tareas largas, bloques continuos, setups, rondas sincronizadas, equipos itinerantes y tareas individuales.

Actualización v1.9: aclara de forma normativa la semántica de los bloques por setup. Un bloque de setup es una única permanencia en la misma familia/estado de montaje: prohíbe abandonar la familia para ejecutar otra familia y regresar, pero no exige adyacencia temporal absoluta entre todas sus tareas. La ejecución debe intentar primero la versión compacta sin huecos; si las agendas o demás autoridades hard impiden ocupar un slot, puede conservarse un hueco interno mínimo sin crear un segundo bloque ni reentrada. Los huecos internos son PREFERRED a minimizar, no causa hard de inviabilidad. La preparación entre familias comienza inmediatamente después de la última tarea de la familia saliente y termina al comenzar la primera tarea de la siguiente. Asimismo, la compresión por matching sólo puede colapsar asignaciones de participantes cuando exista equivalencia operacional contextual sound; si dependencias, ventanas o trabajo pendiente distinguen las identidades, deben preservarse alternativas reparables/exactas.

Actualización v1.8: aclara que la identidad de una unidad operativa no es la componente conexa del grafo de conflictos por recursos y que “cerrar una unidad” exige construir una geometría de bloque, no sólo bloquear el selector mientras se siguen colocando tareas individuales. Preserva como identidades distintas las composiciones itinerantes explícitas aunque compartan miembros; los recursos compartidos crean incompatibilidades y acoplamientos, no fusiones transitivas de identidad.

Actualización v1.7: hace explícito como invariante normativo el avance progresivo por fases y unidades operativas. El selector global no puede intercalar tareas individuales de unidades posteriores sólo por tener menor dominio; MRV, criticidad y matching se aplican dentro de la fase/unidad actualmente elegible. Cada bloque se construye primero como geometría temporal y después se asignan identidades cuando sea sound, actualizando tras cada decisión las envolventes hard temprana/tardía de participantes, prerrequisitos y dependientes. Los prerrequisitos breves y terminales —incluidos IN y Estilismo entrada cuando el dominio aplicable lo permita— se mantienen como reservas virtuales y se materializan sólo después de cerrar la estructura productiva, tan tarde como sea hard-válido; Estilismo salida y OUT se materializan al final tan pronto como sea hard-válido. Se prohíbe usar un MRV global de tareas individuales como sustituto del método constructivo por bloques.

Se mantienen todas las reglas no sustituidas de v1.6, incluida la reserva virtual reparable de comidas `REQUIRED`, la compresión por equivalencia operacional contextual, los dominios de huecos libres, Future Feasibility escalonada, backtracking causal y primera solución hard-valid antes de optimización.

Ámbito: planificación inicial, replanificación de tareas pendientes, configuración operativa, evaluación y benchmark

---

# 1. Propósito

Esta especificación conserva y formaliza el método real utilizado por un jefe de producción para construir una planificación audiovisual.

Su finalidad es impedir que el nuevo planificador vuelva a evolucionar como una acumulación de heurísticas, reparaciones, capas cognitivas o mecanismos internos que no mejoran el resultado operativo.

El método oficial es deliberadamente sencillo:

```text
Construir primero la estructura que condiciona el día
        ↓
Alimentarla con sus dependencias
        ↓
Colocar después lo difícil y poco flexible
        ↓
Rellenar finalmente con lo corto y flexible
        ↓
Retroceder cuando una decisión cierre la solución
```

La dificultad no se resuelve haciendo el motor conceptualmente más complejo.

Se resuelve expresando correctamente:

* las restricciones;
* los bloques de trabajo;
* las disponibilidades;
* los recursos;
* las dependencias;
* los objetivos de eficiencia;
* y unas pocas alternativas que permitan retroceder.

La producción tiene que salir.

Cuando una tarea feeder y su dependiente del flujo principal requieren el mismo recurso escaso —por ejemplo, un Vocal Coach que trabaja primero en una sala de preparación y después en el plató principal— la estructura no se construye como una sucesión de tareas aisladas. El feeder y el flujo principal forman una **tubería coordinada de bloques**. La viabilidad del bloque aguas abajo depende de que el bloque feeder correspondiente haya sido completado, de que el recurso pueda trasladarse y de que la alternancia entre recursos permita mantener la continuidad de la unidad principal.

Esta regla es estructural. Las preferencias de calidad, permanencia o compactación de tareas secundarias no pueden evaluarse por delante de la viabilidad de esa tubería.

---

# 2. Fuente del conocimiento operativo

Este documento se deriva de:

* la explicación detallada del procedimiento seguido por un jefe de producción real;
* los diagramas progresivos de construcción del día de grabación;
* las vistas por espacios y por concursantes;
* las planificaciones reales `ENSAYO_A2_LV.pdf` y `ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf`;
* la documentación oficial de dominio, producto y ORC;
* la evidencia acumulada durante las versiones anteriores del planificador.

Los ejemplos de La Voz sirven como evidencia y casos de prueba.

No constituyen hardcodes del producto.

El nuevo planificador deberá reproducir la lógica general que contienen, de forma configurable y utilizable en otros formatos audiovisuales.

---

# 3. Relación con el resto de documentación

Este bloque integrado debe leerse conjuntamente con:

* Fuente 01 para producto, dominio y operación;
* Fuente 02 para ORC interno;
* Parte I de esta Fuente 03 como marco constructivo general;
* Fuente 04 para integración/configuración efectiva;
* Fuente 05 para validación/benchmark;
* Fuente 06 para cualquier hecho A2 específico.

SPEC-06 continúa definiendo que la planificación inicial debe construirse desde el estado de origen, sin utilizar V3, V4 u otro planificador como semilla autoritativa.

SPEC-07 concreta **cómo debe construirse operativamente** esa planificación.

En caso de conflicto:

1. prevalecen las restricciones de dominio y seguridad operativa;
2. prevalece la prohibición de modificar tareas `in_progress`, `done` o protegidas por locks;
3. SPEC-07 prevalece sobre interpretaciones abstractas anteriores de la estrategia constructiva;
4. ninguna implementación puede contradecir una configuración explícita del usuario.

---

# 4. Definición del problema

El planificador recibe un día sin horas definitivas para sus tareas pendientes.

Debe asignar:

* hora de inicio;
* hora de fin;
* espacio;
* recurso o recursos;
* posición dentro de un bloque;
* relaciones temporales con otras tareas.

El resultado debe ser:

* completo;
* hard-valid;
* ejecutable;
* compacto;
* comprensible;
* configurable;
* determinista;
* y operativamente similar o mejor que una planificación humana experta.

El planificador no debe buscar únicamente una combinación matemáticamente válida.

Debe construir un día con sentido para producción.

---

# 5. Principio rector

La unidad principal de razonamiento no es la tarea aislada.

Es el **bloque operativo**.

Un bloque operativo es una secuencia de tareas compatibles que se realizan consecutivamente en una misma unidad de producción.

Ejemplos ilustrativos:

```text
Plató principal
├── bloque Vocal Coach A
├── bloque Vocal Coach B
├── bloque Vocal Coach A
└── bloque Vocal Coach B
```

```text
Plató principal
├── concursantes sin Banda
├── concursantes con Banda
└── concursantes sin Banda
```

```text
Plató secundario
├── preparación setup A
├── tareas A
├── preparación setup B
├── tareas B
├── preparación setup C
└── tareas C
```

Primero se decide una estructura plausible de bloques.

Después se decide qué tarea o concursante ocupa cada posición.

Esta separación reduce el espacio de búsqueda y reproduce el procedimiento humano observado.

Las etiquetas informativas del concursante, como el instrumento propio que utiliza, no definen bloques salvo que exista una necesidad operativa independiente y explícitamente configurada.

Cuando el mismo recurso participa en una dependencia feeder y en su tarea dependiente del flujo principal, los bloques de ambas unidades deben razonarse conjuntamente. No basta con generar un patrón de bloques en el plató principal y, después, intentar insertar feeders uno por uno. El patrón es válido únicamente si existe una **alimentación por bloques** capaz de sostenerlo.

---

# 6. Vocabulario operativo

## 6.1 Unidad operativa

Elemento cuya agenda se construye como una secuencia temporal.

Puede ser:

* plató;
* espacio;
* sala;
* equipo itinerante;
* recurso humano;
* recurso técnico;
* flujo lógico configurado.

## 6.2 Flujo principal

Unidad operativa que estructura la jornada.

Suele ser el plató donde se realiza la actividad central del día.

No se identifica por un nombre hardcodeado.

El usuario lo configura.

## 6.3 Tarea feeder o alimentadora

Tarea que debe haberse completado para que otra pueda comenzar.

Ejemplos:

* prueba vocal antes del ensayo;
* estilismo antes de una grabación;
* preparación técnica antes de una actividad;
* transporte antes de la primera tarea del concursante.

## 6.4 Bloque

Secuencia consecutiva de tareas que comparten una propiedad operativa.

La propiedad puede ser:

* plantilla;
* setup;
* Vocal Coach;
* uso de Banda;
* equipo;
* cámara;
* localización;
* familia de actividad;
* cualquier clave de agrupación configurada.

## 6.5 Posición

Intervalo disponible dentro de un bloque para una tarea compatible.

## 6.6 Setup

Preparación necesaria antes de comenzar un bloque de una familia de tareas.

Su duración pertenece al setup que va a comenzar.

No depende de la pareja setup anterior → setup nuevo.

## 6.7 Margen entre platós

Tiempo mínimo obligatorio entre dos tareas consecutivas de una misma persona o recurso cuando cambian de plató.

Funciona simultáneamente como:

* tiempo de desplazamiento;
* tiempo de preparación;
* margen de seguridad frente a pequeños retrasos.

## 6.8 Grupo sincronizado

Conjunto de tareas individuales de distintos concursantes que representan una única operación conjunta.

Deben compartir inicio, fin y espacio.

## 6.9 Operación técnica

Tarea que puede no pertenecer a ningún concursante.

Ejemplos:

* preparación;
* prueba técnica;
* grabación de plató vacío;
* movimiento de cámara;
* desmontaje;
* posicionamiento de un equipo;
* ensayo con figuración.

## 6.10 Permanencia

Intervalo entre la primera obligación y la última obligación de una persona durante el día.

## 6.11 Intervalo de presencia de un recurso

Tiempo transcurrido entre el inicio de su primera tarea y el final de su última tarea.

Si el recurso sale y regresa, el intervalo intermedio continúa contando cuando la contratación es continua.

## 6.12 Firma operativa compuesta

Conjunto estructurado de condiciones que una tarea necesita para poder ejecutarse.

Puede incluir, entre otros:

* recursos requeridos;
* coach;
* familia de setup u otra condición operativa explícita;
* espacio;
* participantes;
* dependencias;
* grupo sincronizado;
* ventanas y márgenes.

La firma se deriva de la configuración. Nunca se deduce del nombre del concursante, del programa, del recurso o del plató.

## 6.13 Bloque operativo de un recurso

Secuencia de tareas que requieren el mismo recurso y que se ejecutan sin huecos operativos intermedios.

Una comida autorizada del espacio al que está asignado el recurso puede quedar dentro del bloque sin dividirlo.

Una tarea intermedia que no requiere el recurso sí constituye un hueco operativo y divide el bloque, salvo que exista otra interrupción autorizada y configurada.

## 6.14 Cohorte de bloque

Conjunto de tareas o participantes asignados a una misma entrada de bloque operativo.

La pertenencia a la cohorte es una decisión estructural distinta del orden interno de ejecución. Dos unidades relacionadas pueden compartir la misma cohorte y utilizar órdenes internos diferentes cuando las dependencias individuales, disponibilidades y recursos lo permitan.

## 6.15 Pipeline feeder→flujo principal

Relación estructural entre uno o varios bloques feeder y los bloques dependientes del flujo principal cuando comparten un recurso escaso.

Para cada cohorte del flujo principal debe existir una alimentación previa suficiente:

```text
Bloque feeder del recurso R
        ↓
transición efectiva de R
        ↓
Bloque dependiente de R en el flujo principal
```

Con varios recursos compatibles o alternantes, la producción puede formar una tubería:

```text
Feeder A → Main A
             mientras Feeder B se prepara
          → Main B
             mientras Feeder A2 se prepara
          → Main A2
          → ...
```

El objetivo es mantener viva y continua la unidad principal sin obligar al recurso compartido a desplazamientos o cambios de unidad innecesarios.

El número de bloques no se deriva de una fórmula fija como `2 × número de recursos`. Surge de la carga, las ventanas, la comida, las transiciones, la continuidad, la disponibilidad y el objetivo de compactación.

## 6.16 Spot estructural anónimo

Posición temporal concreta perteneciente a una etapa del pipeline cuya capacidad y relaciones hard están definidas, pero cuya identidad nominal todavía no ha sido asignada.

Un spot estructural anónimo puede representar, entre otros:

* una plaza dentro de un grupo de IN;
* un servicio de Estilismo Entrada;
* una posición de Prueba Vocal dentro de una cohorte;
* una posición de Main dentro de un bloque;
* una preparación o feeder equivalente cuando forme parte de la alimentación estructural.

Un spot no es una simple cota de capacidad. Tiene una posición temporal o dominio estructural concreto y relaciones de precedencia/capacidad suficientes para formar parte de un witness. Tampoco es todavía una asignación a `participantId`.

## 6.17 Witness estructural anónimo de pipeline

Construcción temporal concreta, completa respecto al pipeline que se está cerrando y todavía no necesariamente nominal, formada por spots estructurales anónimos mutuamente compatibles.

Debe demostrar que la arquitectura de bloques elegida puede ser alimentada de extremo a extremo sin depender de que un DFS posterior descubra por casualidad los huecos necesarios.

Conceptualmente:

```text
spots IN
   ↓
spots de preparaciones compartidas necesarias
   ↘
     spots feeder por recurso/coach
            ↓ transición
         spots Main
```

El grafo real de dependencias prevalece sobre el dibujo. Dos prerrequisitos que ambos preceden al Main no adquieren entre sí una precedencia inexistente.

## 6.18 Bundle nominal de pipeline

Conjunto de spots y obligaciones estructuralmente relacionadas que pasan a pertenecer a una misma identidad cuando el matching nominal asigna un participante al pipeline.

El bundle conserva las relaciones reales del dominio —no una secuencia serial inventada— e incluye las obligaciones necesarias para que ese participante ocupe su posición productiva: llegada, preparaciones personales aplicables, feeder, Main y demás obligaciones estructurales del cierre activo.

Cambiar la identidad asignada a una posición de Main no se interpreta como mover únicamente esa tarea. Se rematchea o rematerializa el bundle afectado de forma coherente.

---

# 7. Configuración general y configuración del día

## 7.1 Instantánea al crear el día

Al crear un día de producción, la aplicación copia la configuración general vigente.

El día conserva una instantánea independiente.

Los cambios posteriores en la configuración general no alteran automáticamente días ya creados.

Esto se aplica, como mínimo, a:

* tareas;
* recursos;
* espacios;
* disponibilidades;
* reglas;
* objetivos;
* bloques;
* setups;
* comidas;
* márgenes;
* atributos de concursante que proyectan requisitos sobre tareas;
* políticas de concentración de presencia de recursos;
* pesos.

## 7.2 Overrides diarios

El usuario puede modificar la copia del día sin alterar la configuración general.

La UI debe distinguir claramente:

* valor copiado de la configuración general;
* valor modificado para ese día.

## 7.3 Actualización manual

El día podrá ofrecer acciones explícitas como:

* copiar configuración general de tareas;
* copiar configuración general de recursos;
* copiar configuración general de espacios;
* copiar configuración general de planificación;
* actualizar toda la configuración.

Antes de actualizar se mostrará una comparación.

Nunca existirá sincronización silenciosa.

## 7.4 Regla de reproducibilidad

Todo planning debe poder reconstruirse utilizando la configuración efectiva que tenía el día cuando fue generado.

---

# 8. Severidad de las reglas

Toda regla deberá pertenecer a una de estas categorías.

## 8.1 REQUIRED

Obligatoria.

Una solución que la incumple es inválida.

Ejemplos:

* disponibilidad;
* no solapamiento;
* dependencias;
* locks;
* continuidad obligatoria;
* margen obligatorio entre platós;
* orden de bloques configurado;
* máximo de bloques configurado;
* mínimo de tareas configurado;
* comida aplicable a cada espacio, recurso o persona;
* concentración de presencia declarada `REQUIRED`;
* sincronización de tareas conjuntas.

## 8.2 PREFERRED

Preferencia cuantificable.

Puede incumplirse si permite una solución global mejor o si resulta necesario para completar el día.

Debe generar penalización y explicación.

Ejemplos:

* mantener el mismo orden entre ensayo y prueba vocal;
* finalizar el flujo principal antes de la comida;
* minimizar permanencia;
* minimizar presencia de Banda u otro recurso continuo;
* concentración de presencia declarada `PREFERRED`;
* evitar huecos en un espacio de continuidad preferente;
* terminar antes;
* minimizar desplazamientos.

## 8.3 OFF

La regla no participa en esa configuración.

## 8.4 Límites definidos por el usuario

Cuando el usuario configura expresamente:

* un orden;
* un máximo;
* un mínimo;
* una ventana;
* una duración;
* una capacidad;

ese valor se considera obligatorio salvo que la propia UI permita declarar explícitamente otra severidad.

El planificador nunca relajará silenciosamente una configuración.

---

# 9. Datos de entrada obligatorios

El planificador no puede deducir restricciones operativas a partir del nombre de las tareas.

Toda información que condicione la planificación debe estar estructurada.

Como mínimo, el problema efectivo debe contener:

## Día

* inicio y fin;
* granularidad temporal;
* comidas y ventanas;
* configuración efectiva;
* presupuesto técnico de búsqueda.

## Tareas

* duración;
* concursante o participantes;
* espacio fijo o alternativas permitidas;
* setup o familia de bloque;
* dependencias;
* recursos requeridos proyectados desde la configuración efectiva;
* requisito de setup u otra condición operativa explícita cuando corresponda;
* ventana;
* estado;
* locks;
* posibilidad de simultaneidad;
* grupo sincronizado;
* elegibilidad;
* si es operación técnica sin concursante.

## Concursantes

* disponibilidad;
* tareas asignadas;
* atributos que determinan elegibilidad o agrupación;
* `requiresBand` para la tarea principal o de ensayo;
* `usesInstrument` e `instrumentAnnotation` como metadata informativa del concursante;
* overrides diarios de esos atributos;
* margen entre platós;
* transporte;
* comida;
* locks.

## Espacios

* disponibilidad;
* continuidad;
* comida;
* setup;
* políticas de bloque;
* capacidad;
* recursos asignados.

## Recursos

* disponibilidad;
* capacidad;
* asignaciones;
* margen entre platós;
* política de presencia;
* `presenceConcentrationPolicy = OFF | PREFERRED | REQUIRED`;
* espacio o unidad operativa a la que están asignados;
* comida;
* compatibilidades.

## Equipos itinerantes

* recursos que consumen;
* disponibilidad;
* posiciones permitidas;
* tareas que envuelven o acompañan;
* desplazamientos;
* comidas.

La ausencia de un dato necesario debe detectarse antes de planificar.

No se sustituirá por un hardcode o una suposición silenciosa.

---

# 10. Orden oficial de construcción

La planificación inicial se construye por capas, pero las capas estructuralmente acopladas se cierran conjuntamente.

El orden general es:

```text
1. Tareas fijas, locks y operaciones protegidas
2. Arquitectura de bloques del flujo principal
3. Pipeline de dependencias estructurales que alimenta esos bloques
4. Recursos, equipos y ventanas escasas
5. Tareas largas y bloques continuos secundarios
6. Resto de bloques estructurados
7. Tareas breves y flexibles
8. Comidas individuales, transportes y operaciones auxiliares restantes
9. Validación global y mejora limitada
```

Los puntos 2 y 3 no son dos planificaciones independientes. Cuando flujo principal y feeder comparten un recurso crítico, el patrón main y su alimentación feeder se construyen como una única estructura causal. Temporalmente el feeder ocurre antes; cognitivamente el planificador puede partir del eje principal y cerrar hacia atrás todos los bloques que lo alimentan.

Este orden no significa que una capa ignore las posteriores. Al construir una capa debe comprobarse que quedan opciones suficientes para completar las siguientes.

En particular, una estructura del flujo principal no puede aceptarse si:

* alguno de sus bloques no puede ser alimentado por sus feeders;
* el recurso compartido no puede respetar las transiciones entre unidades;
* un bloque futuro del flujo principal queda sin cohorte viable;
* una comida obligatoria de un participante pierde toda posición;
* una tarea larga o un recurso de ventana estrecha queda sin posición compatible;
* la decisión obliga a romper una continuidad `REQUIRED`.

La viabilidad estructural se evalúa antes que la calidad secundaria.

## 10.1 Invariante de avance progresivo por unidades operativas

El orden anterior es un **invariante del método constructivo**, no una simple sugerencia de scoring.

Después de cerrar la columna vertebral y sus feeders acoplados, el planificador repite este ciclo:

```text
seleccionar la fase estructural actualmente elegible
        ↓
seleccionar dentro de ella la unidad operativa más crítica
        ↓
construir una o varias geometrías de bloque hard-válidas
        ↓
asignar tareas/participantes a las posiciones del bloque
        ↓
propagar envolventes temporales y reservas futuras
        ↓
rechazar inmediatamente la rama si pierde una obligación hard
        ↓
aceptar provisionalmente el bloque y pasar a la siguiente unidad
```

Una **unidad operativa** conserva el significado de §6.1. Puede estar definida por un plató/espacio, recurso, equipo itinerante, flujo lógico u otra autoridad configurada. La implementación no puede inferir una unidad a partir del nombre visible del plató o de una tarea.

No existe un orden hardcodeado `Plató 15 → Plató 14 → ...`. Después del pipeline principal, la siguiente unidad surge de la criticidad efectiva del día y de las fases 3–6. Lo obligatorio es que, una vez elegida una unidad estructural, la búsqueda razone su bloque como una decisión de conjunto antes de volver a mezclar trabajo flexible de otras unidades.

### 10.1.1 Identidad de unidad frente a grafo de conflictos

La identidad de una unidad operativa **no** se obtiene tomando la clausura transitiva de todas las tareas u operaciones que comparten algún recurso. Compartir un recurso crea una restricción de compatibilidad, capacidad o transición; no convierte automáticamente dos unidades configuradas en la misma unidad.

Si existen identidades explícitas de unidad —por ejemplo `itinerantUnitId`, un bloque de setup, una sincronización de rondas o una cadena técnica— deben conservarse. Dos unidades itinerantes distintas que comparten un miembro siguen siendo dos unidades distintas. Una tercera composición que use miembros de ambas tampoco fusiona transitivamente las tres agendas. **La regla genérica de identidad es normativa; los hechos A2 específicos se toman de la Fuente 06.** Bajo el canon A2 vigente, Reality A, Reality B y la composición Reality C conservan identidades distintas; A y B pueden operar simultáneamente cuando sus miembros están libres y C entra en conflicto con las unidades cuyos recursos efectivos comparte.

Cuando una tarea consume varios recursos o relaciona varias unidades, esa tarea actúa como **acoplamiento** entre agendas. El solver debe comprobar la compatibilidad conjunta, pero no colapsar las identidades salvo que una autoridad configurada declare expresamente que forman una única unidad.

### 10.1.2 Cierre de unidad significa geometría de bloque

“Cerrar” una unidad no significa únicamente mantener un `activeUnitId` y prohibir que el selector elija trabajo externo mientras se siguen asignando starts individuales. Debe existir una decisión estructural de conjunto: derivar uno o varios huecos o geometrías de bloque candidatos para la carga de la unidad, comprobar su capacidad y Future Feasibility y, después, asignar tareas o identidades dentro de esa geometría mediante matching, MRV u otra búsqueda exacta autorizada.

Un bloqueo del selector sin geometría de bloque no satisface por sí solo el método constructivo de esta SPEC.

## 10.2 MRV y criticidad acotados a la fase/unidad elegible

MRV, tamaño de dominio, dificultad dinámica y presión de recursos son instrumentos de **ordenación interna**, no una licencia para ignorar el orden oficial de construcción.

Queda prohibido formar una única bolsa con todas las tareas y macro-unidades pendientes y seleccionar globalmente la de menor dominio cuando eso permita que una tarea individual de una fase posterior desplace a un bloque estructural de la fase actualmente elegible.

El uso autorizado es:

1. determinar qué fases/unidades son estructuralmente elegibles;
2. elegir la unidad más crítica entre ellas mediante información hard y Future Feasibility;
3. dentro de esa unidad, utilizar MRV/matching/ordenación exacta para elegir geometrías, posiciones o identidades;
4. conservar backtracking hacia otra unidad o geometría cuando la rama cierre la solución.

Un dominio cero demostrado conserva prioridad absoluta porque es un certificado de inviabilidad. Esta regla no obliga a ignorar un blocker hard ya demostrado.

## 10.3 Envolventes temporales bidireccionales

Cada colocación estructural debe actualizar para las obligaciones aún no materializadas una **envolvente temporal hard** suficiente para responder, como mínimo:

* cuál es su inicio/fin más temprano todavía posible;
* cuál es su inicio/fin más tardío todavía posible;
* qué dependencias deben caber antes;
* qué dependientes deben caber después;
* qué recursos, espacios, comidas, transporte y transiciones limitan esos extremos.

Estas cotas son reservas y propagaciones, no horas elegidas. Deben ser optimistas cuando la información pendiente no permita una conclusión exacta y sólo pueden podar mediante una prueba necessary-only o exacta sound.

Ejemplo conceptual:

```text
IN reservado
   ↓
Estilismo entrada reservado
   ↓
primera obligación productiva ya colocada
```

La hora del bloque productivo fija un límite tardío aguas arriba. La disponibilidad de transporte y del concursante fija un límite temprano. Si el intervalo restante no permite materializar toda la cadena, la decisión productiva se rechaza antes de seguir rellenando el día.

### 10.3.1 Invariante universal de alimentación factible

La disponibilidad de un espacio, recurso o slot **no implica por sí sola disponibilidad productiva**. Una posición temporal sólo entra en el dominio constructivo de una tarea cuando, con la información hard disponible en ese estado de búsqueda, no está demostrado que sea imposible alimentar al participante y a sus recursos hasta esa posición.

Para cada tarea candidata, el motor deberá considerar su **cierre de alimentación**: todos los prerrequisitos directos y transitivos todavía pendientes, las obligaciones previas del mismo participante, transporte o llegada, preparaciones personales, disponibilidad, transiciones entre espacios, recursos compartidos, comidas y cualquier otra autoridad hard necesaria para poder comenzar la tarea.

Esta regla es universal. Se aplica aunque la tarea no pertenezca al flujo principal y aunque sus prerrequisitos todavía no estén materializados. El orden de razonamiento puede seleccionar una obligación futura como ancla; el dominio temporal de esa obligación debe seguir respetando la posibilidad real de completar antes su cierre de alimentación.

Si una tarea no tiene prerrequisitos pendientes ni otra autoridad que retrase su inicio, su dominio puede comenzar en el primer instante permitido por jornada, disponibilidad y ocupaciones. Cuando existe una cadena previa, el inicio más temprano emerge de esa cadena y nunca se sustituye por `day.start` por conveniencia algorítmica.

En una unidad de varias tareas o participantes, no basta con que cada miembro tenga aisladamente alguna cadena posible. Cuando varios miembros compiten por un mismo transporte, espacio, recurso, preparación o ventana, el motor deberá comprobar antes de abrir búsqueda combinatoria que la **geometría completa** conserva capacidad o matching conjunto suficiente. La comprobación se realizará de forma escalonada: dominio individual, capacidad agregada, matching residual y sólo después búsqueda combinatoria cuando los certificados anteriores sean inconclusos.

Para bloques compactables, el orden de exploración preferente será:

1. primera geometría completamente compacta cuya alimentación conjunta no esté demostrada como imposible;
2. geometrías compactas posteriores en orden temporal determinista;
3. únicamente si la compactación completa no es viable, geometrías con el hueco interno mínimo permitido por la autoridad de bloque.

La compactación sigue siendo `PREFERRED` salvo configuración distinta. La inviabilidad de una geometría temprana no autoriza a declarar inviable la unidad: obliga a avanzar a la siguiente geometría temporalmente alcanzable.

No se hardcodearán horas, identidades, nombres de tareas, tamaños objetivo de transporte ni patrones observados en benchmarks. Todos los límites deben derivarse del problema efectivo y de autoridades hard genéricas.

### 10.3.2 Capacidad colectiva previa a la asignación nominal

La alimentación factible de una geometría estructural no exige asignar identidades concretas antes de tiempo. Cuando una unidad pueda razonarse todavía mediante posiciones o `spots` temporales, el planificador deberá separar explícitamente:

1. **geometría de spots**: posiciones temporales productivas todavía no necesariamente nominales;
2. **capacidad colectiva de alimentación**: número máximo de posiciones que pueden ser alimentadas hasta cada horizonte por los prerrequisitos y autoridades compartidos;
3. **matching nominal**: asignación posterior de participantes concretos a los spots compatibles;
4. **materialización**: elección final de horas para los prerrequisitos flexibles una vez conocida la identidad y la estructura que deben alimentar.

La comprobación estructural deberá poder responder, para cada horizonte temporal relevante `T`, a una condición necesaria equivalente a:

```text
requiredCount(T) <= maximumFeedableCount(T)
```

`requiredCount(T)` representa la demanda acumulada de spots que deben estar alimentados antes de `T`. `maximumFeedableCount(T)` representa una cota superior hard-posible de participantes que podrían haber completado los prerrequisitos compartidos necesarios antes de ese horizonte.

Esta frontera de capacidad es un **certificado estructural**, no una agenda provisional. No asigna por sí sola `taskId`, `participantId`, grupo nominal ni hora final cuando esas identidades o posiciones todavía sean intercambiables.

La comprobación se integrará en las autoridades estructurales existentes —geometrías de bloque, prefix-capacity, matching residual, cierre de prerrequisitos, Future Feasibility y certificados equivalentes— antes de justificar una capacidad paralela. No se creará un segundo scheduler, un segundo motor de matching ni una copia independiente de reglas hard.

#### Transporte de entrada como capacidad compartida

Cuando el transporte de entrada todavía no necesite identidad nominal, su capacidad acumulada se derivará de la configuración efectiva y de las autoridades hard aplicables, incluidas disponibilidad, duración, `minimumGroupSize`, `maximumGroupSize` y `minGapMinutes`.

`targetGroupSize` podrá ordenar la construcción preferente, pero no reducirá por sí solo la capacidad hard ni servirá como prueba negativa.

Si los participantes son operacionalmente equivalentes para transporte, cambiar IDs u orden de entrada no crea estados distintos. La capacidad se expresa mediante grupos/spots anónimos o una representación canónica equivalente. Si ventanas, dependencias, locks, recursos, distinta duración u otra autoridad hard rompe la equivalencia, la diferencia se conserva y la comprobación estructural deberá abstenerse o escalar a matching/búsqueda exacta en vez de producir una falsa poda.

#### Preparaciones compartidas y Estilismo Entrada

Los prerrequisitos breves que comparten un espacio o recurso exclusivo no pueden reducirse a la existencia de un dominio individual para cada participante. Su capacidad de proceso acumulada debe combinarse con la capacidad de las etapas previas que los alimentan.

En el caso A2, Estilismo Entrada es un ejemplo de esta regla: la disponibilidad individual de diecinueve tareas no implica que diecinueve participantes puedan haber completado Estilismo antes del mismo horizonte si compiten por un único espacio exclusivo.

La proyección deberá respetar el grafo real de dependencias y no inventará una cadena serial adicional. En particular, que dos prerrequisitos deban estar cerrados antes de una obligación posterior no implica que exista un orden hard entre ellos si el dominio no lo establece.


### 10.3.3 Estructuras continuas parcialmente ordenadas

Cuando el dominio declare continuidad entre grupos o fases pero no un orden nominal dentro de cada grupo, el contrato deberá conservar ambas cosas simultáneamente:

- **orden entre fases** cuando sea REQUIRED;
- **continuidad/adyacencia** de la unidad;
- **conjunto de miembros de cada fase**;
- **orden interno flexible** dentro de la fase.

El solver no podrá representar esa estructura como un único `orderedTaskIds` si hacerlo añade precedencias inexistentes. Deberá explorar o resolver mediante matching/permutación sólo las alternativas materialmente distintas, aplicando reducción de simetría cuando las identidades sean operacionalmente equivalentes.

Para una estructura por fases:

```text
Fase A {a1, a2, a3} — orden interno flexible
        ↓ REQUIRED / sin hueco
Fase B {b1, b2} — orden interno flexible
        ↓ REQUIRED / sin hueco
Fase C {c1, c2} — orden interno flexible
```

una prueba de Future Feasibility es positiva si existe **al menos una** geometría y asignación autorizada de A+B+C. Sólo puede devolver imposibilidad si todas las permutaciones/matchings materialmente distintos han sido descartados por autoridades hard o por un certificado sound.

La permutación de un plan humano, fixture o primer witness no crea una precedencia de dominio.

#### Resultado de la prueba estructural

Una insuficiencia demostrada permite rechazo inmediato de la geometría. Ejemplo conceptual:

```text
requiredCount(10:30) = 8
maximumFeedableCount(10:30) = 6
=> geometría imposible
```

En cambio:

```text
requiredCount(10:30) = 6
maximumFeedableCount(10:30) = 8
=> CONTINUE / NOT_PROVEN
```

Capacidad suficiente no demuestra por sí sola la viabilidad completa. Deben seguir siendo autoritativos el matching nominal, la búsqueda exacta necesaria y la validación final.

#### Asignación nominal tardía

Después de superar la capacidad estructural, las identidades concretas se asignarán mediante el matching o búsqueda exacta ya aplicables a la unidad. Las identidades operacionalmente equivalentes no deberán generar ramas nominales; cuando una autoridad activa las distinga, las alternativas materialmente distintas permanecerán alcanzables.

La geometría, la capacidad colectiva y el matching nominal son por tanto fases lógicas distintas aunque puedan implementarse dentro de la misma autoridad estructural y compartir datos, cachés y ledger.

### 10.3.3 Witness estructural anónimo obligatorio cuando la alimentación determina la geometría

La capacidad agregada es una **prueba necessary-only**. No sustituye la construcción estructural.

Cuando uno o varios prerrequisitos compartidos determinan cuándo puede comenzar o mantenerse continuo un bloque productivo, toda arquitectura que supere las cotas de capacidad deberá cerrarse mediante un **witness estructural anónimo de pipeline** antes de abrir búsqueda nominal de detalle.

El witness deberá contener spots temporales concretos, mutuamente compatibles y suficientes para sostener la arquitectura evaluada. Incluirá las etapas que sean estructuralmente necesarias en ese problema efectivo, por ejemplo:

```text
IN anónimo por grupos/capacidad temporal
        ↓
spots de Estilismo Entrada u otra preparación compartida
        ↘
          spots feeder por coach/recurso
                 ↓ transición efectiva
              spots Main por bloque
```

La representación puede usar intervalos, slots, matching, DP, flujo, cohortes o certificados exactos equivalentes. Lo obligatorio es el significado: **debe existir una realización conjunta concreta de la tubería**, no sólo cotas individuales o agregadas compatibles por separado.

El witness no fija todavía nombres cuando las identidades son intercambiables y tampoco obliga a que las horas de IN o de preparaciones flexibles sean las horas finales. Es una construcción de viabilidad temporal.

En planificación Assisted, el witness interno no amplía por sí mismo el `PlanningScope`. Los prerrequisitos usados únicamente para demostrar factibilidad permanecen internos, no aparecen en la propuesta visible y no se consolidan en el Stage salvo que el usuario haya activado explícitamente su inclusión en scope. La existencia de horas internas de witness no convierte esas obligaciones en tareas aceptadas.

Si una familia de arquitectura no admite ningún witness estructural, esa familia se rechaza antes de explorar órdenes nominales. Si lo admite, se conserva el witness o una representación canónica equivalente y se pasa al matching nominal.

Queda prohibido considerar “cerrado” el pipeline y enviar después a un buscador genérico tareas estructurales pendientes cuya colocación pueda determinar si el pipeline existe. En particular, una preparación breve no se convierte en tarea de relleno por el mero hecho de ser corta cuando forma parte del cierre de alimentación de la unidad activa.

### 10.3.4 Capacidad no equivale a witness

La siguiente inferencia es inválida:

```text
requiredCount(T) <= maximumFeedableCount(T)
        ↓
la arquitectura está alimentada
```

La inferencia autorizada es:

```text
requiredCount(T) > maximumFeedableCount(T)
        ↓
IMPOSSIBLE

requiredCount(T) <= maximumFeedableCount(T)
        ↓
CONTINUE
        ↓
construir witness estructural anónimo
```

Cuando el witness pueda construirse con un algoritmo exacto polinómico, matching, flujo, DP o búsqueda acotada por bloques, se utilizará esa representación antes de recurrir a DFS nominal de tareas.

## 10.4 Materialización terminal de prerrequisitos y salidas

No se confunde **reservar** con **materializar**.

Cuando IN, Estilismo entrada u otros prerrequisitos breves conservan suficiente flexibilidad, pueden permanecer **sin hora nominal definitiva** durante la construcción productiva. Esto no autoriza a ignorar su geometría cuando condiciona el pipeline: en ese caso deberán existir como spots anónimos o como otra representación exacta dentro del witness estructural de §10.3.3.

La capacidad temprana y los spots anónimos utilizados para construir no constituyen necesariamente el horario nominal final de esos prerrequisitos. Una construcción que use la máxima capacidad temprana posible para demostrar viabilidad podrá materializar después IN, Estilismo u obligaciones equivalentes más tarde, siempre que el resultado nominal siga siendo hard-valid. **Capacidad/witness para construir** y **hora final materializada** son conceptos distintos.

Cuando esa capacidad alimente una estructura posterior todavía no cerrada, el witness debe conservar el mayor dominio futuro posible: se prefiere una representación temprana/capacity-maximizing, por intervalos, spots anónimos o matching por deadlines. No se utilizará un bloque nominal “lo más tarde posible” como si fuese una restricción hard sobre la estructura posterior. Si por necesidad de una autoridad exacta se generan starts concretos, siguen siendo placements efímeros/reparables hasta que entren explícitamente en el scope aceptado.

Al asignar spots de prerrequisitos a identidades no equivalentes, la prioridad se deriva de presión efectiva —disponibilidad restante, carga futura mínima, slack, dominio, dependencias, comidas/transiciones y unidades críticas pendientes— y sólo después de equivalencia material puede usarse un desempate canónico por ID.

Una vez cerrado el witness estructural y resuelto el matching nominal necesario:

1. se materializan los prerrequisitos breves respetando dependencias y autoridades hard;
2. para `IN` se aplica la política canónica de transporte vigente y, salvo override explícito, se colocan los grupos **desde el primero hacia el último en sus inicios hard-válidos más tempranos**, preservando `minGapMinutes` como mínimo y priorizando en los grupos tempranos a participantes con mayor presión efectiva;
3. Estilismo entrada se coloca dentro de su dominio hard en los primeros spots disponibles compatibles con `IN`, Prueba vocal, recursos y transiciones, asignando antes los spots escasos a mayor presión efectiva;
4. ninguna compactación posterior puede mover la estructura productiva ya aceptada salvo backtracking explícito. Una futura policy de permanencia/just-in-time deberá ser configuración explícita, no un default oculto.

Al extremo final se aplica el principio simétrico:

1. Estilismo salida conserva su condición de penúltima obligación cuando así lo establezca el dominio;
2. OUT se materializa después de cerrar el resto del día;
3. se aplica la política canónica de transporte de salida y se busca la salida más temprana hard-válida;
4. la compactación final optimiza permanencia sólo después de demostrar completitud y viabilidad.

Estas reglas son genéricas: IN/OUT y Estilismo son el caso A2 de una categoría de prerrequisitos/salidas terminales. No se hardcodean nombres de benchmark.

---

# 11. Fase 0 — Estado protegido

Antes de construir:

* las tareas `done` permanecen intactas;
* las tareas `in_progress` permanecen intactas;
* los locks permanecen intactos;
* las tareas con hora fija permanecen intactas;
* los bloques manuales permanecen intactos;
* las operaciones técnicas fijas permanecen intactas.

Estos elementos forman parte del calendario ocupado y condicionan todas las posiciones restantes.

En planificación inicial sin elementos protegidos, esta fase podrá estar vacía.

---

# 12. Fase 1 — Construcción del flujo principal

## 12.1 Objetivo

Crear primero la columna vertebral temporal del día.

## 12.2 Hora preferida de finalización de mañana

El flujo principal puede configurarse con una hora preferida de finalización del bloque de mañana.

Ejemplo:

```text
preferredMorningBlockEnd = 15:00
```

Si las tareas duran quince minutos, las posiciones se construyen hacia atrás:

```text
14:45–15:00
14:30–14:45
14:15–14:30
...
```

El objetivo no es comenzar lo antes posible.

Es concentrar el flujo principal y, cuando sea viable, terminar antes de la comida para liberar al equipo.

## 12.3 Prueba de cabida por la mañana

“No caber” no significa únicamente que la suma de las tareas principales exceda la mañana.

Debe comprobarse que pueden completarse antes de cada posición:

* sus dependencias;
* sus preparaciones;
* sus tareas feeder relevantes;
* los márgenes de desplazamiento;
* las disponibilidades del concursante y los recursos.

La estrategia de mañana se acepta sólo si existe una alimentación viable del bloque completo. La prueba no se limita a comprobar cada feeder de forma independiente: cuando varios feeders comparten un recurso con el flujo principal, debe existir un patrón de bloques feeder y transiciones capaz de alimentar consecutivamente todos los bloques main previstos.

## 12.4 División mañana/tarde

Si el flujo completo no cabe antes de la comida, el sistema busca una división válida:

```text
bloques de mañana
        ↓
comida
        ↓
bloques de tarde
```

El punto de corte debe:

* respetar las reglas de bloques;
* evitar partir una cadena cuando haya alternativas;
* minimizar recursos obligados a regresar;
* minimizar permanencias;
* reducir cambios de setup;
* conservar continuidad dentro de cada tramo.

## 12.5 Continuidad

Si la continuidad es `REQUIRED`, una vez comienza un tramo del flujo principal:

```text
fin tarea N = inicio tarea N+1
```

No puede haber huecos accidentales.

La comida configurada es un corte autorizado y no cuenta como parada.

Si la continuidad es `PREFERRED`, cada hueco genera penalización.

## 12.6 Generación de patrones de bloques

El planificador construirá un conjunto pequeño de patrones plausibles según la configuración.

Ejemplos:

```text
Coach A → Coach B → Coach A → Coach B
```

```text
Sin Banda → Banda → Sin Banda
```

```text
Sin recurso continuo → Recurso continuo → Sin recurso continuo
```

```text
Setup A → Setup B → Setup C
```

El planificador no probará todas las permutaciones posibles.

Generará únicamente patrones compatibles con:

* orden configurado;
* máximo de bloques;
* mínimo de tareas por bloque;
* distribución de carga;
* comida;
* recursos;
* setup;
* firma operativa compuesta;
* política de concentración de presencia;
* capacidad de alimentar cada bloque mediante sus dependencias estructurales;
* transiciones del recurso compartido entre la unidad feeder y el flujo principal.

Cuando un patrón alterna recursos que trabajan tanto en feeder como en main, la generación debe considerar el **pipeline completo**, no sólo la secuencia de etiquetas del flujo principal. Un patrón `A → B → A → B` no está demostrado por haber creado cuatro bloques main: debe existir una secuencia feeder compatible que prepare cada cohorte a tiempo y permita los desplazamientos de A y B.

El planificador buscará el **mínimo número de bloques factible** compatible con la producción. No impondrá `2 × recursos`, ni copiará el número observado en un benchmark. En un día con dos coaches puede emerger `A → B → comida → A → B`; con tres coaches, otra distribución de carga y ventanas puede producir cinco bloques en vez de seis. La configuración y la viabilidad determinan el patrón.

`requiresBand` y `usesInstrument` son atributos independientes, pero no tienen la misma semántica.

* `requiresBand` es operativo y determina si la tarea consume el recurso configurado como Banda.
* `usesInstrument` e `instrumentAnnotation` son metadata informativa del concursante y no modifican el problema de planificación.

Las cuatro combinaciones de flags son válidas. A efectos del motor, `BAND_ONLY` y `BAND_AND_INSTRUMENT` tienen la misma demanda operativa, mientras que `NEITHER` e `INSTRUMENT_ONLY` no consumen recursos adicionales.

La agrupación visual observada como “instrumento → Banda → instrumento” se deriva operativamente de “sin Banda → Banda → sin Banda”. El instrumento no define el bloque.

## 12.7 Asignación de concursantes a posiciones

Para cada posición se filtran primero los candidatos hard-valid.

La asignación se realiza dentro de la arquitectura de bloques ya considerada y no se considera estructuralmente aceptada hasta demostrar que conserva el pipeline de feeders del bloque actual y de los siguientes.

Antes de comparar calidad secundaria debe considerarse:

* posibilidad real de completar dependencias;
* número de posiciones feeder que permanecen para la cohorte;
* presión y transiciones del recurso compartido;
* viabilidad del siguiente bloque del flujo principal;
* ventanas de Reality, Presentadora u otros recursos;
* disponibilidad;
* margen entre platós;
* existencia de al menos una posición de comida para cada concursante obligado;
* tareas largas pendientes;
* límites de bloques y setups;
* libertad futura.

Entre alternativas con viabilidad estructural comparable se aplican permanencia, presencia de recursos y demás preferencias de calidad.

El flujo principal se coloca primero, pero no a ciegas y no como una colección de decisiones independientes.

## 12.8 Firma estructural activa y equivalencia operacional contextual

La identidad de un concursante no constituye por sí sola una decisión material de búsqueda.

Para una decisión estructural concreta, el planificador debe derivar una **firma estructural activa** que contenga únicamente las autoridades capaces de distinguir realmente a ese concursante en ese punto de la construcción. Como mínimo, cuando sean aplicables, puede incluir:

* pertenencia a la familia o clave del bloque;
* recurso o coach compartido;
* requisito de recurso continuo, incluida Banda cuando `requiresBand=true`;
* ventana efectiva de la tarea main y de su feeder;
* disponibilidad efectiva del concursante y límite de salida;
* operación anclada o cadena que rodee a la tarea main;
* transiciones efectivas que puedan cerrar posiciones;
* dependencias estructurales;
* políticas `REQUIRED` o `PREFERRED` capaces de distinguir el orden;
* perfil de ventanas futuras críticas que pueda quedar sin posición por la decisión actual.

Dos concursantes son **operacionalmente equivalentes para esa decisión** cuando intercambiarlos dentro de la misma posición o cohorte no puede cambiar:

* hard-validity;
* completitud;
* pertenencia o número de bloques;
* una política configurada;
* la disponibilidad de una obligación futura crítica;
* ni un KPI autorizado que el planificador esté evaluando en esa fase.

La equivalencia es contextual, no permanente. Un concursante puede ser equivalente a otros al construir un bloque y dejar de serlo cuando una ventana, una operación anclada, Banda, EVA, una salida temprana u otra autoridad activa lo distinga.

Cuando varios concursantes sean equivalentes, el motor **no generará ramas distintas sólo por permutar sus identidades**. Utilizará una representación canónica, una clase/multiconjunto equivalente o un representante determinista. La clase sólo se divide cuando aparezca una diferencia operativa demostrable.

Un identificador estable puede usarse para materializar una salida determinista dentro de una clase equivalente. No convierte ese identificador en una razón para explorar otra rama.

Este principio es especialmente importante en bloques con muchos participantes y pocos perfiles realmente distintos. La complejidad de la búsqueda debe crecer con las **decisiones materialmente distintas**, no con el factorial del número de nombres.

## 12.9 Dominios de huecos libres y fronteras operativas

La unidad primaria para buscar una posición temporal es el **dominio de huecos libres**, no la lista completa de puntos de la grid.

Para una tarea o una operación, el dominio se deriva mediante intersección y sustracción de intervalos a partir de las autoridades aplicables, entre ellas:

* disponibilidad de tarea, concursante, espacio y recursos;
* ocupación ya consolidada o provisional del concursante, espacio y recursos;
* dependencias y deadlines;
* márgenes y transiciones;
* comidas y pausas;
* locks y estados protegidos;
* setup, sincronización y demás reglas hard activas.

El planificador no generará posiciones dentro de intervalos ya ocupados o estructuralmente imposibles para después descubrir mediante `canPlaceTask` que no eran huecos. Primero calcula los intervalos libres; sólo materializa puntos de grid dentro de esos intervalos cuando una decisión temporal exacta lo requiera.

Las regiones completas eliminadas por una misma prueba se saltan mediante aritmética de intervalos. No se recorrerán punto a punto, aunque ese recorrido no consuma branch budget. La contabilidad distinguirá:

* tamaño lógico del dominio completo;
* posiciones eliminadas analíticamente;
* posiciones realmente materializadas/evaluadas;
* y ramas realmente consumidas.

Queda prohibido mejorar artificialmente la métrica de ramas trasladando trabajo a bucles, scans o enumeraciones no contabilizadas.

---

# 13. Fase 2 — Dependencias del flujo principal y pipeline de alimentación

La tarea principal es el eje de la decisión, pero una posición main sólo es viable si toda su cadena puede alimentarse temporalmente.

Cuando la dependencia feeder comparte un recurso escaso con el dependiente, la planificación se realiza por **bloques emparejados** y no por feeders aislados.

## 13.1 Acoplamiento de bloque feeder y bloque main

Para cada cohorte asignada a un bloque main que requiere el recurso `R`, el planificador debe demostrar un bloque feeder previo que complete las dependencias de esa cohorte y permita la transición efectiva de `R` al flujo principal.

Ejemplo conceptual:

```text
Feeder R — cohorte 1
        ↓
transición R
        ↓
Main R — cohorte 1
```

La fecha límite de cada feeder individual sigue derivándose de su tarea dependiente, pero la viabilidad se cierra también a nivel de cohorte y bloque.

## 13.2 Pipeline alternado entre recursos

Cuando dos o más recursos se alternan entre una unidad feeder y el flujo principal, el planificador debe aprovechar el paralelismo estructural disponible.

Con dos recursos A y B, una forma general es:

```text
Feeder A1
    ↓ transición A
Main A1 ───────────────┐
                       │ mientras B prepara Feeder B1
                       ↓
                    Main B1
                       │ mientras A prepara Feeder A2 o aprovecha un corte autorizado
                       ↓
                    Main A2
                       │ mientras B prepara Feeder B2
                       ↓
                    Main B2
```

La secuencia exacta depende de las ventanas, la comida, la carga y las transiciones. Lo obligatorio es razonar sobre la capacidad de la tubería para sostener la continuidad del flujo principal.

## 13.3 Número de bloques

El número de bloques es una consecuencia de la configuración y la viabilidad.

El planificador debe minimizar bloques y desplazamientos sin romper:

* continuidad;
* dependencias;
* capacidad feeder;
* disponibilidades;
* transiciones;
* comidas;
* ventanas de recursos;
* completitud.

No se hardcodea un número por programa, fixture, coach o benchmark.

Sin embargo, cuando la configuración efectiva y la carga de un día hacen necesario un patrón de cuatro, cinco u otro número de bloques, la búsqueda debe tratar ese patrón como estructura de producción y no degradarlo a decisiones posición-a-posición.

### 13.3.1 Orden obligatorio de búsqueda por mínimo número de bloques factible

El mínimo número de bloques factible se resolverá a nivel de **familias de arquitectura**, no mediante permutaciones de tareas.

La búsqueda seguirá este orden lógico:

```text
1. derivar el menor número de runs/bloques que no contradiga la configuración
2. generar únicamente las familias estructuralmente distintas con ese número
3. aplicar capacidad necessary-only
4. construir witness anónimo de pipeline
5. ejecutar matching nominal/bundles sólo sobre familias con witness
6. si ninguna familia es viable, incrementar el número de bloques y repetir
7. en cuanto una familia produce la primera solución completa hard-valid, aceptar esa construcción
```

No se explorarán patrones con más bloques mientras quede una familia con menos bloques cuya inviabilidad estructural no haya sido resuelta, salvo que una autoridad hard permita demostrar directamente que dicha familia no puede completar la producción.

Dentro del mismo número de bloques podrán ordenarse primero las arquitecturas más compactas, con menos desplazamientos o mejor concentración PREFERRED. Ese orden es de exploración; no convierte la preferencia en hard.

La referencia A2 de cuatro bloques es benchmark de calidad y evidencia de una familia viable. No es una constante del producto. El motor debe ser capaz de demostrar por qué una familia de dos o tres bloques no es viable antes de pasar a cuatro cuando ese sea el resultado del día efectivo.

## 13.4 Pertenencia de bloque frente a orden interno

La cohorte feeder que alimenta un bloque main debe corresponder a los participantes que necesitan esa dependencia y ese recurso.

No se exige que el **orden interno** de las tareas feeder sea idéntico al orden interno del main salvo que la configuración lo declare `REQUIRED`.

La política existente puede expresarse como:

```text
mirrorMainFlowOrder = PREFERRED | REQUIRED | OFF
```

Esta política afecta al orden dentro de los bloques. No sustituye el acoplamiento estructural entre la cohorte feeder y la cohorte main.

En `PREFERRED`, el planificador puede cambiar el orden cuando preserve mejor la viabilidad, las transiciones, la compactación o las ventanas futuras. Nunca debe crear más bloques o cerrar una solución sólo para mantener un espejo de orden que no sea hard.

### 13.4.1 Orden estructural obligatorio dentro del pipeline

La búsqueda constructiva debe respetar este orden de decisión:

```text
1. Derivar la arquitectura mínima plausible de bloques
2. Demostrar que esa arquitectura conserva capacidad hard suficiente
3. Asignar pertenencia a cohortes de bloque
4. Explorar el orden interno sólo cuando pueda cambiar la viabilidad o la calidad autorizada
```

La arquitectura mínima plausible se deriva de la carga, las disponibilidades, las comidas, las transiciones, los recursos compartidos, la continuidad y los límites configurados. Si una arquitectura puede demostrarse imposible mediante estas autoridades estructurales, se descarta como familia antes de gastar presupuesto relevante en permutaciones internas. La búsqueda continúa con la siguiente arquitectura plausible derivada por las mismas reglas; nunca con un número de bloques hardcodeado a partir del benchmark.

La pertenencia a una cohorte se decide después de demostrar que la arquitectura puede sostener la carga y antes de decidir su orden interno. `FEEDER_ORDER`, o cualquier mecanismo equivalente de ordenación interna, no sustituye la prueba de capacidad de la arquitectura ni debe utilizarse para descubrir por fuerza bruta una imposibilidad que ya pueda demostrarse a nivel de bloque o cohorte.

La exactitud exige conservar todas las alternativas materialmente distinguibles que puedan cambiar hard-validity, completitud, una preferencia configurada o un desempate autorizado. No exige enumerar por separado permutaciones operacionalmente equivalentes cuando ninguna autoridad activa puede distinguirlas. En esos casos deberá emplearse una representación canónica, una contracción equivalente o una poda demostrablemente segura.

Si el orden interno sí afecta a dependencias individuales, ventanas, transiciones, recursos o cualquier otra autoridad activa, el motor debe conservar el backtracking exacto necesario. La poda estructural no autoriza una decisión greedy a actuar como prueba negativa.

### 13.4.2 Exactitud sin enumeración factorial

En `EXACT_CONSTRUCTIVE`, exactitud significa que ninguna alternativa **materialmente distinguible** se descarta sin una prueba autorizada. No significa enumerar todas las permutaciones nominales antes de obtener una solución.

La búsqueda exacta deberá trabajar sobre el cociente operacional del problema siempre que exista una equivalencia demostrable:

```text
permutaciones nominales
        ↓ contraer equivalentes
decisiones operativas distintas
        ↓ explorar exacto
soluciones materialmente distintas
```

Una expansión de identidades equivalente puede diferirse hasta la materialización del resultado. Si dos asignaciones sólo intercambian concursantes cuya firma activa es equivalente, constituyen el mismo estado estructural de búsqueda salvo que una autoridad posterior las distinga.

Cuando una autoridad posterior rompa la equivalencia, la clase se refina en ese momento y se conservan las alternativas que pasan a ser materialmente distintas. Esta refinación tardía no autoriza a olvidar restricciones existentes: la firma debe incluir desde el principio toda ventana o obligación crítica ya conocida que pueda distinguir a los miembros.

### 13.4.3 Matching nominal por bundles de pipeline

La asignación nominal posterior al witness no se realizará como decisiones independientes de `Main`, `Feeder`, preparación e IN cuando esas obligaciones pertenecen al mismo cierre estructural.

Asignar un participante a un spot Main significa asignarlo a un **bundle compatible del pipeline** que contenga o referencie todas las obligaciones necesarias de ese participante para llegar hard-valid a dicho spot. El bundle puede contener un orden parcial: por ejemplo, si Estilismo Entrada y Prueba Vocal deben preceder al Main pero no tienen precedencia hard entre sí, el bundle preserva ambas alternativas.

El matching deberá responder a preguntas del tipo:

```text
¿qué identidad puede ocupar este pipeline bundle completo?
```

y no únicamente:

```text
¿qué identidad puede ocupar este slot Main aislado?
```

Un swap nominal entre participantes rematchea/rematerializa los bundles afectados. No obliga a reconstruir la arquitectura de bloques si ambos bundles siguen siendo compatibles con el mismo witness estructural.

Las restricciones de coach, Banda, operaciones ancladas, disponibilidades, recursos, comidas, locks y demás autoridades conocidas forman parte de la compatibilidad del bundle y de sus aristas de matching cuando sean materialmente relevantes.

## 13.5 Dependencias breves

Una dependencia breve, como IN, estilismo o una preparación flexible, sigue siendo obligatoria antes de su dependiente cuando así lo establece el dominio.

Si dispone de muchas posiciones válidas, no necesita materializarse antes que el feeder estructural escaso. El planificador debe reservar su viabilidad y puede colocarla después en la construcción.

No se confunde prioridad de razonamiento con orden temporal.

## 13.6 Dependencias transitivas

Si A depende de B y B depende de C:

```text
C → B → A
```

Las tres deben poder materializarse.

No basta con comprobar únicamente la dependencia directa.

## 13.7 Cierre estructural antes de trabajo secundario

Después de aceptar provisionalmente una cohorte o un bloque, el planificador debe comprobar primero si existe continuación hard del pipeline principal.

En particular, antes de consumir presupuesto relevante en calidad secundaria, comidas materializadas, tareas standalone o relleno flexible, debe descartarse cualquier rama en la que:

* el siguiente bloque main no tenga cohorte viable;
* el feeder estructural pendiente no disponga de ninguna posición;
* el recurso compartido no pueda realizar la transición;
* la continuidad `REQUIRED` ya no pueda sostenerse.

Las comidas individuales y las tareas críticas posteriores sí participan como **reservas de viabilidad**: debe conservarse al menos una posición compatible para cada obligación hard pendiente. Esto no obliga a materializarlas antes de cerrar la columna vertebral.

---

# 14. Fase 3 — Recursos, equipos y ventanas escasas

Después del flujo principal y sus feeders, se colocan las operaciones con menor libertad.

No se priorizan por nombre.

Se priorizan por configuración y situación del día.

Una tarea es más difícil cuando combina:

* pocas posiciones válidas;
* ventana estrecha;
* recurso muy solicitado;
* equipo itinerante;
* gran duración;
* muchas dependencias;
* recurso compartido;
* necesidad de desplazamiento;
* sincronización de varias personas;
* riesgo de bloquear tareas futuras.

Esto hace que, en determinados formatos, Reality o Presentadora aparezcan pronto sin introducir reglas específicas para esos nombres.

## 14.1 Dificultad dinámica

La dificultad deberá recalcularse conforme se ocupa el día.

Una forma mínima de estimarla será:

```text
dificultad aproximada =
  carga obligatoria
  / capacidad temporal compatible restante
```

Complementada por:

* número de posiciones válidas;
* duración;
* dependientes;
* escasez de recursos;
* vencimiento de ventana.

No existirá una categoría manual y permanente de “recurso crítico”.

## 14.2 Recursos de presencia continua

Un recurso como Banda, músicos, presentador, cámara especial o equipo externo se modela mediante el contrato general de recursos.

La configuración de cada tarea indica si lo requiere.

La política de concentración de presencia del recurso participa desde la construcción de patrones, no como una reparación posterior.

Cuando una tarea requiere simultáneamente varios recursos operativos explícitos, todos deben satisfacerse en la misma posición. El instrumento propio del concursante no se considera uno de esos recursos.

---

# 15. Fase 4 — Tareas largas y bloques continuos secundarios

Después se construyen espacios o actividades cuyas tareas son difíciles de insertar por duración o estructura.

Ejemplo:

```text
Totales 1
10:00–10:30
10:30–11:00
11:00–11:30
11:30–12:00
```

La tarea de treinta minutos se coloca antes que una tarea flexible de cinco minutos porque tiene menos huecos compatibles.

## 15.1 Inicio del bloque

Un espacio continuo no tiene que comenzar a primera hora.

Debe comenzar en el primer momento constructivamente razonable que permita ejecutar su carga de forma compacta y compatible con las agendas de los concursantes, aplicando el invariante universal de alimentación factible de §10.3.1.

No se considera candidato un inicio temprano si el espacio está libre pero todavía no existe una asignación hard-posible de participantes a la geometría debido a prerrequisitos, transporte, preparaciones, ocupaciones ya colocadas, recursos o transiciones. El motor debe avanzar al siguiente inicio alcanzable antes de abrir permutaciones o ramas nominales.

## 15.2 Selección de participantes

Para cada posición se selecciona al participante hard-valid que menos empeora:

* su permanencia;
* la disponibilidad de tareas posteriores;
* los recursos escasos;
* el makespan;
* las ventanas futuras.

## 15.3 Espacios paralelos

Dos salas independientes pueden construir bloques paralelos.

Cada una conserva su propia continuidad, disponibilidad, recursos y comida.

---

# 16. Fase 5 — Bloques por setup

Cuando un espacio realiza varias familias de actividad:

```text
Setup A → tareas A
Setup B → tareas B
Setup C → tareas C
```

se aplican estas reglas.

## 16.1 Orden

Si el usuario define un orden, debe cumplirse.

Si no lo define, el planificador podrá elegir el que produzca menor coste global.

## 16.2 Máximo de bloques

Si se configura `maxBlocks`, no podrá superarse.

## 16.3 Mínimo de tareas por bloque

Si se configura `minTasksPerBlock`, todos los bloques deberán cumplirlo, salvo el tratamiento explícito y configurable de un resto inevitable.

No se inventará automáticamente una excepción.

## 16.4 Preparación del setup

Antes de la primera tarea de cada entrada en un setup se inserta su preparación.

```text
Preparación B
B1
B2
B3
```

Si el sistema abandona B y regresa después, deberá preparar B de nuevo.

## 16.5 Semántica de bloque lógico, compactación y huecos internos

`oneBlockPerFamily` y la prohibición de reentrada describen la **continuidad del estado de setup**, no una obligación de ocupar cada punto temporal sin espera.

Para una familia activa:

- la primera alternativa constructiva debe ser completamente compacta cuando exista;
- si ningún miembro pendiente puede ocupar el siguiente slot por una autoridad hard, puede dejarse el **hueco interno mínimo necesario** y continuar con la misma familia;
- un hueco sin trabajo productivo no crea por sí solo un segundo bloque;
- ejecutar otra familia y regresar posteriormente sí constituye reentrada y está prohibido cuando `reentry = FORBIDDEN`;
- los huecos internos incrementan `span`/idle y deben minimizarse como preferencia de calidad;
- la imposibilidad de lograr contigüidad absoluta nunca puede utilizarse por sí sola para declarar inviabilidad si sigue existiendo una solución de un único bloque lógico.

La preparación para cambiar a la siguiente familia debe comenzar inmediatamente después de la última tarea de la familia saliente y terminar al comenzar la primera tarea de la familia entrante, salvo una interrupción hard explícitamente autorizada por otra regla.

La asignación `participante → slot` puede usar matching para evitar permutaciones nominales únicamente cuando las identidades sean operacionalmente equivalentes bajo todas las autoridades activas y futuras ya demostrables. Si ventanas, dependencias, recursos, prerrequisitos, comidas u obligaciones pendientes distinguen dos participantes, las asignaciones materialmente distintas deben permanecer alcanzables mediante exploración o reparación exacta.

Antes de enumerar reparaciones de matching dentro de una geometría, cada arista `tarea/participante → slot` debe incorporar, además de la colocación local, la alimentación hard necesaria demostrable conforme a §10.3.1. Si con esas aristas no existe matching perfecto para la geometría, se descarta esa geometría y se avanza al siguiente inicio/forma sin consumir ramas nominales equivalentes.

## 16.6 Recursos bloqueados

Durante la preparación queda bloqueado el espacio.

Los recursos operativos de las tareas no quedan bloqueados, salvo que la configuración indique expresamente que participan en la preparación.

---

# 17. Fase 6 — Tareas breves y flexibles

Las tareas con gran cantidad de posiciones válidas se dejan para el relleno final **sólo cuando no formen parte del cierre estructural de una unidad todavía abierta**.

Ejemplos habituales:

* estilismo breve que no alimente el pipeline activo;
* pasillo;
* recurso breve;
* actividades de cinco minutos;
* tareas sin dependencias ni recursos escasos.

Una tarea no se clasifica como flexible únicamente por ser corta. Si IN, Estilismo Entrada, una preparación u otra obligación breve determina cuándo un participante puede alimentar un feeder o un bloque Main todavía no cerrado, esa obligación pertenece al witness estructural de la unidad y **no puede enviarse a un DFS genérico de relleno para descubrir su posición después**.

El buscador standalone/genérico recibe únicamente trabajo realmente residual: tareas cuya geometría ya no puede alterar la existencia de la tubería estructural aceptada.

El planificador utiliza los huecos existentes sin alargar innecesariamente la presencia de las personas.

No colocará una tarea breve a primera hora para un concursante cuya siguiente obligación importante es muchas horas después, salvo que exista una razón configurada.

---

# 18. Márgenes de transición

## 18.1 Regla general de participante

Entre dos actividades independientes consecutivas de un mismo participante se aplica el margen general efectivo del día, salvo que exista un override explícito en la salida de la tarea anterior o en la entrada de la siguiente. El contrato no depende de que ambas tareas estén en el mismo espacio: la configuración decide la separación operativa requerida.

Para una frontera `A → B`:

```text
explicit = defined(A.participantMarginAfterMinutes) ∪ defined(B.participantMarginBeforeMinutes)
participantGap(A,B) = max(explicit) si explicit no está vacío
participantGap(A,B) = defaultParticipantTransitionMinutes en otro caso

inicio(B) >= fin(A) + participantGap(A,B)
```

Un `0` explícito sustituye el default. Los valores de ambos lados nunca se suman.

## 18.2 Márgenes de otras entidades

Existirán, como mínimo, contratos diferenciados para participante y recurso. Coach, unidad itinerante, holds y preparaciones conservan sus autoridades específicas cuando proceda. Varias restricciones aplicables se satisfacen simultáneamente; reducir el margen de participante no reduce automáticamente el de otra entidad.

## 18.3 Overrides, precedencia y trazabilidad

Los overrides pueden definirse por plantilla o instancia conforme a la configuración efectiva. Un override de instancia prevalece sobre el valor heredado de plantilla; la ausencia de override conserva el valor heredado o, en último término, el margen general del día. Todo valor efectivo debe exponer origen y participar en fingerprint/Evidence.

## 18.4 Naturaleza hard

El margen resuelto es una restricción hard. Representa movimiento, preparación y seguridad frente a retrasos. Las fases internas de una operación compuesta con `internalTransition = INCLUDED` no reciben margen adicional entre sí.

## 18.5 Traslado técnico explícito

Un margen genérico no sustituye una operación técnica real. Cuando sea necesario desmontar, transportar o volver a montar con identidad, recursos o duración propios, se crea una tarea explícita.

---

# 19. Comidas

## 19.1 Comida de espacios

Cada espacio o unidad operativa puede tener:

* ventana permitida;
* duración;
* hora preferida;
* tarea de comida asociada.

La comida bloquea únicamente el intervalo elegido, no toda la ventana.

Cuando la comida está configurada como `REQUIRED`, su duración y su ventana forman parte de la viabilidad hard del día desde el inicio de la construcción. No es válido llenar primero el trabajo de la unidad y comprobar después si queda sitio para comer.

Durante la construcción debe conservarse, para cada comida operacional pendiente, **al menos un intervalo completo compatible** con su duración, ventana y disponibilidad conjunta de los espacios y recursos afectados. La hora exacta puede permanecer sin materializar mientras exista ese intervalo.

## 19.2 Continuidad y posición del descanso

Una comida planificada no se considera hueco ni ruptura de continuidad.

La comida nunca puede interrumpir una tarea en curso.

Para elegir su posición se aplica este orden de **preferencia**, no de validez hard:

1. hueco que comienza en una frontera estructural natural —cambio de bloque, setup, escenario o espacio— cuando la semántica activa permite identificarla;
2. frontera entre dos tareas productivas;
3. cualquier otro inicio libre válido dentro de la ventana, sobre la granularidad temporal efectiva del problema.

Las opciones 1 y 2 ordenan candidatos; nunca eliminan la opción 3. Por tanto, una comida operacional no requiere como condición hard comenzar exactamente en una frontera productiva.

Si el descanso se inserta dentro del intervalo cronológico de un bloque lógico, el bloque continúa después de la comida y no aumenta su `runCount`.

## 19.3 Recursos asignados

Un recurso asignado a un plató descansa durante la comida de ese plató.

Durante ese intervalo no puede realizar tareas.

La comida autorizada:

* no cuenta como hueco operativo;
* no crea un segundo bloque de presencia;
* sí forma parte del intervalo cronológico entre la primera y la última intervención cuando el recurso trabaja antes y después.

La comida del recurso no se aplicará globalmente a espacios o recursos no asignados a esa unidad.

## 19.4 Recursos compartidos

Un recurso compartido entre varios platós come una sola vez.

El planificador debe encontrar un intervalo común compatible.

No puede bloquearlo con dos comidas independientes.

Si la configuración exige comidas simultáneas y no existe intersección válida, el día es inviable.

## 19.5 Concursantes

La comida de cada concursante puede situarse dentro de su ventana, con su duración, respetando capacidad y resto de obligaciones.

Durante la construcción del flujo principal no es necesario fijar prematuramente la hora exacta de la comida, pero sí es obligatorio preservar **al menos un intervalo completo compatible** de la duración requerida. Una decisión estructural que deja a un concursante sin ningún hueco de comida es inviable y debe podarse antes de profundizar.

La reserva de viabilidad de comida no debe competir en prioridad con la comprobación de que el siguiente bloque estructural puede existir; ambas son hard-feasibility, pero se evitará explorar en profundidad preferencias o materializaciones flexibles de comida cuando la tubería main/feeder ya está muerta.


## 19.6 Reserva operacional reparable durante la construcción

Para toda comida operacional `REQUIRED`, el planificador mantendrá una reserva de viabilidad existencial y reparable.

La reserva no significa fijar una hora. Significa:

```text
existe al menos un intervalo completo todavía disponible
```

Después de cada decisión que añada ocupación a un espacio o recurso afectado por la comida:

1. se intersecta la ventana de comida con las disponibilidades efectivas de todos los espacios y recursos de la unidad;
2. se resta la unión de las ocupaciones ya fijadas que conflictúan con esa unidad;
3. se comprueba si queda algún intervalo continuo de longitud al menos igual a la duración requerida.

Si el intervalo testigo anterior ha sido ocupado pero existe otro, la reserva se repara y la rama continúa.

Sólo cuando **no existe ningún intervalo completo** puede emitirse un certificado negativo y podarse la rama.

Añadir tareas futuras sólo puede mantener o reducir el espacio libre; nunca puede restaurar un intervalo que ya ha desaparecido por ocupaciones hard fijadas. Por ello esta prueba negativa es sound.

La misma autoridad se aplica genéricamente a todas las unidades operativas con comida, sin hardcodes por nombre de plató.

Cuando varias comidas comparten espacios o recursos, la viabilidad individual es necesaria pero no siempre suficiente. La búsqueda no declarará factibilidad conjunta sólo por disponer de witnesses independientes; deberá conservar la autoridad conjunta correspondiente o mantener el estado como inconcluso hasta su materialización exacta.

## 19.7 Reserva analítica y materialización exacta

La comprobación de existencia de un intervalo puede realizarse mediante aritmética de intervalos —intersección, unión y resta— sin enumerar cada punto de la grid y sin consumir ramas.

La materialización final sí puede distinguir varios inicios válidos. Cuando el motor enumere alternativas temporalmente distinguibles sobre la grid, esas alternativas pertenecen a la búsqueda exacta y su trabajo debe quedar contabilizado en el ledger compartido.

La reserva virtual nunca convierte el primer witness encontrado en una elección greedy ni elimina otros intervalos hard-válidos.

---

# 20. Minimización de permanencia

La permanencia de un concursante se calcula entre:

* su llegada o primera obligación efectiva;
* su salida o última obligación efectiva.

El planificador debe evitar:

* hacerle llegar demasiado pronto para una tarea breve;
* grandes huecos evitables;
* prolongar su salida por una actividad flexible;
* separaciones innecesarias entre tareas.

La permanencia es una preferencia de calidad, no una restricción que pueda romper dependencias o continuidad obligatoria.

---

# 21. Intervalo de presencia de recursos

## 21.1 Banda operativa e instrumento informativo

Cada concursante podrá configurar para su tarea principal o de ensayo:

* `requiresBand`;
* `usesInstrument`;
* `instrumentAnnotation` cuando proceda.

Los atributos son independientes y no forman un enum mutuamente excluyente, pero sólo `requiresBand` tiene efecto operativo sobre el planificador.

Son configuraciones válidas:

* sin Banda y sin instrumento;
* con Banda y sin instrumento;
* sin Banda y con instrumento;
* con Banda y con instrumento.

`usesInstrument` y `instrumentAnnotation` describen una característica propia del concursante. No generan recurso, setup, disponibilidad, transición, dependencia, bloque, scoring ni validación hard.

Cuando `requiresBand = true`, la tarea consume el recurso Banda con independencia del valor informativo de `usesInstrument`. Por ello, a efectos de planificación, “con Banda y con instrumento” es equivalente a “con Banda y sin instrumento”.

Los valores pertenecen a la configuración efectiva del día. Podrán copiarse desde la configuración general y modificarse mediante override diario.

## 21.2 Proyección genérica del requisito de Banda

`requiresBand` es un atributo de configuración orientado al usuario.

Antes de planificar se proyecta sobre la instancia de tarea como requisito del recurso configurado.

`usesInstrument` e `instrumentAnnotation` no se proyectan sobre `requiredResourceIds` ni sobre ninguna otra restricción del planificador. Permanecen como metadata para visualización, información de producción y Evidence.

Cuando un instrumento origine una necesidad operativa real —preparación, afinación, montaje, traslado, músico, prueba técnica o cambio de setup— esa necesidad deberá configurarse explícitamente como recurso, tarea, setup o dependencia independiente. Nunca se inferirá automáticamente del flag informativo.

La Banda no se representa mediante:

* un tipo especial de tarea;
* una tarea ficticia;
* un participante ficticio;
* una excepción propia de un programa.

El motor utiliza los mecanismos generales de recursos requeridos, disponibilidad, capacidad, comida, continuidad, scoring y Evidence.

## 21.3 Configuración y disponibilidad del recurso

La Banda es un recurso operativo genérico.

Su configuración debe permitir, como mínimo:

* identificador;
* disponibilidad;
* capacidad;
* tareas o espacios compatibles;
* espacio o unidad operativa a la que está asignada;
* comida aplicable;
* margen de transición cuando corresponda;
* política de concentración de presencia.

Aunque la UI pueda denominarlo “Banda”, el motor no dependerá de ese nombre.

La misma lógica deberá servir para músicos, acompañamientos, equipos artísticos, grupos técnicos y otros recursos continuos.

La disponibilidad se configura por día. No se presupone que siempre coincida con toda la jornada.

## 21.4 Política de concentración

Todo recurso continuo podrá configurar:

```text
presenceConcentrationPolicy = OFF | PREFERRED | REQUIRED
```

### OFF

La concentración no participa en la decisión.

Se mantienen todas las restricciones hard generales del recurso.

### PREFERRED

El planificador debe intentar, por este orden:

1. minimizar el número de bloques de intervención;
2. minimizar el intervalo entre la primera y la última intervención;
3. minimizar los huecos internos;
4. evitar salidas y regresos innecesarios.

La separación en varios bloques es válida cuando resulta necesaria para completar el día, pero debe generar penalización y explicación.

### REQUIRED

Todas las tareas que requieren el recurso deben formar un único bloque operativo continuo.

Una solución con más de un bloque es inválida.

La comida autorizada del espacio al que está asignado el recurso no divide el bloque.

Una tarea intermedia que no requiere el recurso sí crea un hueco y divide el bloque, salvo que exista una interrupción autorizada explícitamente configurada.

La política `REQUIRED` nunca podrá romper disponibilidades, dependencias, no solapamientos, locks, comidas, márgenes u otras reglas hard superiores.

## 21.5 Comida del recurso asignado

Un recurso asignado al flujo principal utiliza la comida configurada para ese espacio.

Durante la comida:

* el recurso no realiza tareas;
* el espacio permanece bloqueado por su comida;
* la comida no cuenta como hueco de continuidad;
* la comida no crea un segundo bloque;
* la comida sí cuenta dentro del intervalo total de presencia cuando hay intervenciones antes y después.

La comida no se aplicará globalmente a recursos o espacios no asignados.

## 21.6 Intervalo de presencia

Para un recurso contratado de forma continua:

```text
presenceSpan = fin última tarea requerida - inicio primera tarea requerida
```

Los huecos y comidas comprendidos entre ambos extremos cuentan dentro de `presenceSpan`.

La continuidad operativa se calcula por separado.

Por tanto, una comida autorizada puede mantener un único bloque operativo y, al mismo tiempo, formar parte de la jornada contratada.

## 21.7 Orden de decisión

La demanda de Banda u otro recurso continuo debe participar al construir los patrones del flujo principal.

El procedimiento será:

1. identificar tareas que requieren el recurso operativo;
2. construir patrones o bloques compuestos compatibles con la política configurada;
3. ordenar las tareas dentro de cada bloque sin perder viabilidad futura;
4. cerrar feeders y demás dependencias;
5. comprobar disponibilidad y comida;
6. evaluar continuidad y presencia;
7. conservar alternativas completas y hard-valid;
8. comparar soluciones mediante métricas operativas.

No se consolidará un bloque si sus dependencias o recursos asociados no pueden completarse.

## 21.8 Métricas y explicabilidad

Para cada recurso con política de concentración deben publicarse, como mínimo:

* `requiredTaskCount`;
* `plannedTaskCount`;
* `presenceStart`;
* `presenceEnd`;
* `presenceSpanMinutes`;
* `operationalBlockCount`;
* `internalGapMinutes`;
* `crossesAuthorizedMeal`;
* `presenceConcentrationPolicy`;
* `requiredPolicySatisfied`;
* `preferredPolicyPenalty`.

La Evidence deberá explicar:

* por qué comienza la primera intervención;
* por qué termina la última;
* por qué se eligió uno o varios bloques;
* qué restricciones impidieron una concentración mayor;
* si una comida autorizada queda dentro del bloque.

---

# 22. Tareas conjuntas

La UI podrá vincular tareas compatibles de distintos concursantes.

Internamente formarán un grupo sincronizado.

El grupo se planifica como una única operación con varios participantes.

Todas sus tareas deben compartir:

* inicio;
* fin;
* espacio;
* setup;
* recursos comunes.

Cada tarea individual permanece visible en la agenda de su concursante.

Antes de vincular se validará:

* misma plantilla o compatibilidad declarada;
* misma duración efectiva;
* espacio compatible;
* setup compatible;
* recursos compatibles;
* ausencia de locks contradictorios.

Una edición temporal afectará al grupo completo.

---

# 23. Operaciones técnicas y cadenas compuestas

No todas las operaciones pertenecen a un concursante.

El modelo debe admitir tareas como:

* pruebas técnicas;
* preparación de pulsadores;
* grabaciones de espacios vacíos;
* movimiento de cámaras;
* preparación de figuración;
* desmontaje;
* traslado;
* posicionamiento de un equipo.

Una actividad compuesta con fases que consumen recursos distintos debe representarse como una cadena sencilla:

```text
Actividad principal
        ↓
Desmontaje y traslado
        ↓
Actividad posterior
```

No se requiere un modelo de fases complejo mientras una cadena de tareas exprese correctamente la operación.

Una subactividad incluida en la duración y sin recursos o estado independiente puede permanecer como metadata informativa.

---

# 24. Equipos itinerantes y Reality

Los equipos itinerantes se modelan como unidades operativas con agenda propia.

Pueden:

* consumir recursos compartidos;
* necesitar al concursante;
* desplazarse;
* envolver o acompañar otra tarea;
* tener tareas propias;
* trabajar en localizaciones diferentes;
* compartir comida y disponibilidad.

Su criticidad no se hardcodea.

Surge de la cantidad de trabajo, la disponibilidad, los recursos compartidos, los desplazamientos y las ventanas compatibles.

El comportamiento existente de Reality deberá conservarse mientras respete este contrato.

---

# 25. Elegibilidad y tareas opcionales

No todos los concursantes tienen todas las tareas.

La configuración debe expresar:

* tareas aplicables;
* tareas excluidas;
* tareas alternativas;
* atributos que determinan setup o recursos;
* Banda, setup u otras condiciones operativas explícitas.

El instrumento propio del concursante puede formar parte de su ficha informativa, pero no modifica elegibilidad, recursos ni posiciones.

La elegibilidad se resuelve antes de buscar posiciones.

El planificador nunca crea ni omite tareas basándose en el nombre del concursante o del programa.

---

# 26. Selección de candidatos

La selección no mezcla viabilidad estructural con calidad. Se ejecuta en niveles.

## 26.1 Filtro hard

Se descarta cualquier candidato que incumpla:

* disponibilidad;
* solapamientos;
* dependencias;
* recursos;
* espacio;
* capacidad;
* margen entre platós;
* comida;
* locks;
* setup;
* grupo sincronizado;
* orden o límites de bloques;
* continuidad obligatoria;
* elegibilidad.

Un candidato hard-invalid nunca se puntúa.

Para decidir si una posición entra siquiera en el dominio candidato, se aplica primero §10.3.1: un slot localmente libre pero no alimentable por sus prerrequisitos hard no constituye un candidato productivo válido. En bloques o grupos sincronizados, la alimentación se evalúa sobre la geometría completa cuando existan competencias compartidas.

## 26.2 Prioridad estructural y libertad futura

Entre candidatos hard-valid, antes de evaluar calidad se debe favorecer la alternativa que preserve la capacidad de completar la estructura.

Como mínimo se consideran:

1. existencia del feeder y de sus dependencias;
2. número de posiciones válidas restantes del feeder estructural;
3. capacidad del recurso compartido para completar el bloque y trasladarse;
4. viabilidad de la siguiente cohorte o bloque del flujo principal;
5. comidas obligatorias todavía posibles;
6. ventanas de recursos escasos;
7. tareas largas con pocas posiciones;
8. límites de bloques/setups y continuidad futura.

Una alternativa que deja cero posibilidades estructurales se poda; no se compensa con una mejor permanencia, gap o puntuación.

Cuando ninguna alternativa está demostrada como inviable, estos indicadores pueden ordenar la exploración sin eliminar soluciones exactas.

## 26.3 Penalización incremental de calidad

Sólo entre alternativas estructuralmente viables o no descartables se compara el coste que añaden.

La versión inicial utilizará pocas dimensiones:

```text
penalización incremental =
  permanencia añadida de concursantes
+ intervalo añadido de presencia de recursos
+ bloques adicionales de recursos con concentración PREFERRED
+ huecos internos de recursos con concentración PREFERRED
+ huecos en continuidad preferente
+ desviación de hora objetivo
+ cambios o bloques adicionales
+ desplazamientos evitables
+ finalización tardía
+ consumo de ventanas escasas
+ pérdida de margen operativo
```

Las dimensiones podrán activarse, desactivarse y ponderarse.

La calidad nunca precede a la viabilidad del pipeline estructural.

## 26.4 Configuración comprensible

La UI no debe exigir números técnicos arbitrarios.

Podrá utilizar niveles:

* desactivado;
* bajo;
* medio;
* alto;
* máximo.

Internamente se traducirán a pesos deterministas y documentados.

## 26.5 Desempates

Los desempates deberán ser estables y deterministas.

Nunca dependerán del orden accidental de base de datos.

Criterio inicial recomendado:

1. mayor libertad estructural futura;
2. menor penalización total;
3. menor permanencia añadida;
4. menor makespan estimado;
5. clave estable configurada o identificador canónico.

## 26.6 Scope obligatorio del selector

La selección de candidatos opera en dos niveles:

```text
NIVEL 1 — fase/unidad estructural elegible
NIVEL 2 — alternativas dentro de esa unidad
```

El selector del nivel 2 puede usar MRV y otras medidas exactas o semánticas. No puede utilizarse como selector global del nivel 1 salvo que se haya demostrado que todas las unidades comparadas pertenecen a la misma fase estructural y son alternativas equivalentes de la misma decisión de producción.

Una tarea individual que requiere un recurso no se convierte por ese solo hecho en una unidad estructural independiente si forma parte de un bloque operativo del espacio, recurso o equipo configurado. La autoridad de bloque debe resolverse antes de convertir sus miembros en decisiones aisladas.

---

# 27. Libertad futura sin complejidad innecesaria

El planificador no necesita un subsistema abstracto independiente para representar la libertad futura.

Después de cada decisión estructural debe estimar, como mínimo:

* cuántas posiciones válidas quedan para cada tarea pendiente;
* cuántas posiciones feeder quedan para cada cohorte main pendiente;
* si el siguiente bloque del pipeline tiene al menos una alimentación posible;
* si el recurso compartido conserva una transición temporal posible entre feeder y main;
* si alguna tarea queda sin posición;
* si cada comida hard pendiente —de concursante, recurso, espacio o unidad operativa— conserva al menos un intervalo completo compatible;
* si la carga pendiente cabe en las ventanas restantes;
* si un recurso crítico queda saturado;
* si una cadena ya no puede alimentarse;
* si una tarea larga pierde todos sus huecos;
* si se supera un límite de bloques;
* si la continuidad futura queda rota;
* si un setup pendiente deja de poder agruparse.

Si una obligación hard pendiente pasa a tener cero posiciones válidas, la rama se descarta inmediatamente.

La comprobación se ordena de lo estructural y barato a lo secundario y costoso. No se gastará presupuesto significativo evaluando tareas flexibles de una rama cuyo siguiente bloque main/feeder ya es imposible.

## 27.1 Certificados escalonados de Future Feasibility

Future Feasibility debe empezar por la prueba necesaria más barata y sólo escalar cuando sea inconclusa. El orden recomendado es:

```text
1. dominio no vacío de cada obligación hard pendiente relevante
2. carga agregada frente a capacidad/ventanas
3. capacidad del siguiente bloque y de sus feeders
4. competencia por recursos o posiciones compartidas
5. matching residual cuando la competencia no puede resolverse por intervalos/capacidad
6. búsqueda combinatoria sólo si los certificados anteriores no deciden
```

Que cada tarea tenga al menos un hueco libre es una condición necesaria, no siempre suficiente: varias tareas pueden competir por el mismo hueco o recurso. En ese caso se escala a una prueba de capacidad o matching. Pero el matching no deberá ejecutarse por costumbre cuando los dominios independientes y la estructura ya permiten una conclusión suficiente.

La misma jerarquía se aplica **antes de construir una geometría**, no sólo después de colocarla. Un inicio que ya es imposible por el cierre de alimentación de sus miembros se elimina analíticamente; un inicio individualmente posible pero colectivamente imposible se descarta mediante capacidad o matching conjunto; sólo las geometrías no descartadas llegan a la exploración de asignaciones materialmente distintas.

Después de colocar provisionalmente una obligación de un concursante, el motor debe actualizar de forma barata los dominios de sus demás obligaciones hard y de las obligaciones críticas que puedan verse afectadas. Si alguna pierde su última posición, no se profundiza en esa rama.

## 27.2 Reserva frente a materialización anticipada

Considerar una tarea futura no significa necesariamente asignarle ya una hora.

Durante las primeras capas del día, las unidades todavía no construidas pueden representarse mediante reservas de viabilidad:

* dominio no vacío;
* carga que cabe en capacidad restante;
* ventana crítica protegida;
* comida `REQUIRED` con al menos un intervalo completo reparable;
* recurso escaso no saturado;
* cadena todavía alimentable.

El planificador cierra materialmente primero la estructura operativa de mayor prioridad —incluidos sus feeders acoplados— y mantiene las unidades posteriores como dominios/reservas suficientes hasta que llegue su fase de construcción. Esto reproduce la visión global del jefe de producción sin obligar a planificar todo simultáneamente.

---

# 28. Alternativas y backtracking

Una estrategia puramente voraz puede elegir la mejor opción inmediata y bloquear una solución posterior.

El planificador conservará un número pequeño de alternativas.

## 28.1 Puntos de decisión principales

Se conservarán alternativas especialmente en:

* patrón de bloques del flujo principal;
* emparejamiento de bloques feeder↔main y composición de sus cohortes;
* orden de concursantes dentro de cada bloque **sólo cuando una autoridad activa haga ese orden materialmente distinguible**;
* división mañana/tarde;
* asignación de recursos escasos;
* inicio de bloques largos;
* orden de setups;
* decisiones que consumen la última ventana de una tarea.

## 28.2 Best-K acotado y alternativas diferidas

En cada punto relevante puede mantenerse una frontera activa de las mejores `K` alternativas hard-valid para decidir cuál explorar primero.

`K` será un parámetro técnico acotado y no debe formar parte de la configuración operativa habitual.

En una ruta `EXACT_CONSTRUCTIVE`, `Best-K` **no autoriza a eliminar de forma irreversible una alternativa materialmente distinta únicamente por quedar fuera de K**. Las alternativas no activas podrán quedar diferidas, comprimidas o representadas por una clase equivalente y recuperarse si las opciones prioritarias fallan.

Sólo se elimina definitivamente una alternativa mediante restricción hard, prueba estructural, equivalencia/simetría sound o agotamiento explícito correctamente clasificado. De este modo, `Best-K` controla la prioridad y la memoria de frontera sin convertir una heurística de ranking en una prueba falsa de inviabilidad.

## 28.3 Retroceso causal

Cuando una rama llega a:

* tarea sin posición válida;
* recurso saturado;
* cadena imposible;
* violación hard;
* pérdida de completitud;

se identifica, cuando sea posible de forma barata y determinista, la decisión más reciente que **consumió o cerró la última alternativa necesaria** del blocker y se retrocede hasta ese punto.

Ejemplos:

* si una tarea futura pierde su único hueco porque se colocó otra tarea en ese intervalo, se reabre la decisión que ocupó ese hueco;
* si una cohorte feeder deja de caber por una elección de pertenencia de bloque, se reabre esa pertenencia antes de permutar órdenes internos irrelevantes;
* si un recurso escaso pierde su última ventana por una asignación anterior, se reabre la asignación causal.

Si no puede demostrarse un culpable concreto con información ya disponible, se vuelve al último punto de decisión materialmente relevante. No se requiere construir un subsistema causal complejo para aplicar esta regla.

## 28.4 Primera solución completa antes de optimización intensiva

DAY_CONSTRUCTION separa estrictamente dos objetivos:

```text
FASE A — VIABILIDAD / CONSTRUCCIÓN
obtener cuanto antes la primera planificación completa y hard-valid

FASE B — MEJORA
optimizar KPIs sobre una planificación ya válida
```

Durante la Fase A se priorizan:

* arquitectura mínima plausible;
* witness estructural anónimo del pipeline;
* dominios libres;
* participantes realmente críticos;
* clases equivalentes para el resto;
* cierres de dependencias;
* Future Feasibility barata;
* y backtracking causal.

No se consume presupuesto relevante intentando decidir entre permutaciones equivalentes para “optimizar” antes de haber demostrado una jornada completa.

### Regla de parada de construcción

En una petición interactiva de planificación inicial o de propuesta Assisted, la **primera solución completa hard-valid termina la Fase A y se devuelve inmediatamente**. En Assisted, “completa” significa completa respecto al `PlanningScope` solicitado y a todos los witnesses internos necesarios para demostrar su factibilidad; no significa planificar el resto de obligaciones del día que están fuera de scope. La misma petición bloqueante no continúa explorando planes completos alternativos para mejorar KPIs.

La Fase B requiere una operación de `IMPROVEMENT`, una acción explícita equivalente o un proceso separado que ya disponga de incumbente hard-valid. Nunca debe retrasar la entrega de la primera propuesta utilizable.

Esta regla no impide ordenar correctamente las alternativas antes de encontrar la primera solución: se prueban primero las arquitecturas con menor número de bloques y, dentro de ellas, las más compactas según las preferencias autorizadas.

### Presupuesto temporal de producto

Para planificación Assisted interactiva:

* objetivo operativo: propuesta hard-valid en **≤ 2 minutos**;
* techo de cálculo bloqueante: **5 minutos por Stage**;
* al alcanzar el techo sin solución, la ejecución termina de forma explícita con Evidence del blocker/presupuesto y no continúa en segundo plano ni de forma indefinida.

Los benchmarks deberán medir `timeToFirstHardValidMs` por separado del tiempo de cualquier fase de mejora. Una reducción de ramas que no reduzca el tiempo hasta la primera solución no constituye por sí sola éxito de producto.

## 28.5 Simplicidad obligatoria

La primera implementación no incorporará:

* ledgers causales complejos;
* memorias cognitivas generales;
* macrotransformaciones;
* reparación multinivel;
* cientos de contadores de Evidence;
* componentes sin efecto demostrado en benchmark.

Sólo se añadirán mecanismos nuevos cuando un escenario real demuestre que el Best-K y el backtracking básico son insuficientes.

---

# 29. Comparación de planificaciones completas

Esta sección compara incumbentes automáticos completos; no presenta un `PartialPlan` interno como planning completo. No limita la aceptación de Stages Assisted parciales respecto al día.

Las soluciones completas y hard-valid se comparan mediante pocas métricas operativas.

Orden de prioridad:

1. cero violaciones hard;
2. todas las tareas planificables colocadas;
3. cumplimiento de continuidad obligatoria;
4. cumplimiento de órdenes y límites configurados;
5. minimización ponderada de permanencias;
6. minimización ponderada de presencia de recursos;
7. continuidad preferente;
8. hora de finalización;
9. cambios de setup y bloques;
10. desplazamientos y margen operativo.

Las preferencias se ponderan según la configuración efectiva del día.

---

# 30. Explicabilidad útil

El planificador debe explicar decisiones en lenguaje operativo.

Ejemplos correctos:

> “Este concursante ocupa la posición de las 12:00 porque ya se encuentra en el recinto, puede completar su prueba vocal antes y colocarlo más tarde aumentaría su permanencia.”

> “El bloque del recurso se concentra entre las 11:00 y las 13:00 porque cinco tareas lo requieren y esa alternativa reduce su intervalo de presencia sin comprometer feeders ni disponibilidades.”

> “La tarea requiere Banda; la anotación de instrumento es informativa y no ha modificado sus posiciones válidas.”

> “El recurso se divide en dos bloques porque la política es PREFERRED y una dependencia hard impide mantener un único bloque. La división añade una penalización explicable.”

> “El flujo principal comienza a las 10:00 porque empezar antes dejaría sin alimentar la tercera posición.”

> “La tarea de Totales se colocó antes que Estilismo porque dura 30 minutos y sólo conserva tres posiciones compatibles.”

> “No se encontró solución porque el máximo de un bloque de setup B, la disponibilidad del espacio y el lock de las 12:00 son incompatibles.”

No es obligatorio exponer todos los pasos internos de búsqueda.

La evidencia debe ayudar a producción a entender y decidir.

---

# 31. Dos vistas obligatorias de calidad

La calidad debe comprobarse desde dos perspectivas.

## 31.1 Vista por espacios

Permite verificar:

* continuidad;
* bloques;
* setups;
* comidas;
* huecos;
* utilización;
* secuencia de recursos;
* hora de finalización.

## 31.2 Vista por concursantes

Permite verificar:

* dependencias;
* permanencia;
* esperas;
* desplazamientos;
* comida;
* primera y última obligación;
* compactación individual.

Una solución puede ser buena por espacios y mala por concursantes.

El planificador debe equilibrar ambas vistas.

---

# 32. Patrones confirmados por las planificaciones reales

Los ejemplos de referencia confirman:

* el plató principal se construye primero y funciona en tramos continuos;
* la comida separa tramos sin contar como parada;
* las salas vocales alimentan posiciones concretas del ensayo;
* los coaches trabajan por bloques y turnos;
* los recursos continuos deben concentrarse cuando su política lo exige o lo prefiere;
* `requiresBand` es operativo y `usesInstrument` es informativo; ambos flags son independientes, pero sólo Banda condiciona la planificación;
* una comida autorizada puede quedar dentro del bloque de un recurso asignado sin dividirlo;
* Reality utiliza equipos compartidos, localizaciones y transiciones;
* las salas de Totales se construyen como bloques continuos de tareas largas;
* los espacios con varios setups agrupan tareas y evitan alternancias;
* una cámara o recurso puede terminar un bloque en un espacio y continuar en otro;
* existen operaciones sin concursante;
* existen tareas fijas y eventos especiales;
* la vista final por concursantes muestra agendas compactadas, aunque no necesariamente sin toda espera;
* tareas breves se insertan alrededor de las estructuras principales;
* el orden final no responde a un único criterio, sino al menor coste compatible con las reglas.

Estos patrones son criterios de benchmark.

No son nombres ni secuencias hardcodeadas.

---

# 33. Benchmark humano oficial

## 33.1 Escenarios

Las planificaciones reales proporcionadas se convertirán en escenarios oficiales.

Para cada escenario se conservarán:

* configuración;
* tareas sin horas;
* disponibilidades;
* recursos;
* dependencias;
* locks y eventos fijos;
* planning humano de referencia;
* ambas vistas finales.

## 33.2 Experimento de reconstrucción

El test correcto será:

1. eliminar las horas de las tareas planificables;
2. mantener todos los datos operativos de entrada;
3. ejecutar el nuevo planificador;
4. comparar el resultado con la referencia humana.

## 33.3 No se exige identidad exacta

Pueden existir varias soluciones de calidad equivalente.

No se exigirá la misma hora y el mismo orden cuando no sean obligatorios.

Se exigirá:

* completitud;
* hard-validity;
* estructura operativa correcta;
* continuidad;
* dependencias;
* uso correcto de recursos;
* permanencia equivalente o mejor;
* presencia de recursos equivalente o mejor;
* makespan equivalente o mejor;
* tiempo de cálculo compatible con el producto.

## 33.4 Métricas mínimas

Cada benchmark registrará:

* tareas totales y planificadas;
* conflictos hard;
* huecos en espacios REQUIRED;
* huecos en espacios PREFERRED;
* continuidad del flujo principal;
* hora de inicio y fin por unidad;
* permanencia total y por concursante;
* presence span por recurso configurado;
* número de bloques operativos por recurso continuo;
* huecos internos del recurso;
* cruce de comida autorizada;
* cumplimiento de `presenceConcentrationPolicy`;
* número de bloques por familia;
* cambios de setup;
* desplazamientos;
* cumplimiento de comidas;
* makespan;
* alternativas exploradas;
* backtracks;
* tiempo hasta el primer witness estructural de pipeline;
* tiempo hasta la primera solución completa hard-valid (`timeToFirstHardValidMs`);
* tiempo total de la petición de construcción;
* número de familias de bloques rechazadas antes de matching nominal;
* número de spots estructurales anónimos y bundles nominales materializados;
* determinismo.

## 33.5 Regla de integración

Un cambio del nuevo planificador no podrá integrarse porque:

* compile;
* pase tests unitarios;
* produzca más Evidence;
* parezca arquitectónicamente correcto.

Debe mantener o mejorar los escenarios representativos.

Una capacidad que no demuestra beneficio no se amplía.

---

# 34. Desarrollo incremental oficial

El nuevo planificador se construirá aislado de V3, V4 y el ORC actual.

No importará su lógica interna.

Los motores anteriores podrán utilizarse únicamente como:

* benchmark;
* fallback temporal;
* referencia histórica;
* fuente auditada de validadores reutilizables.

## Primera capacidad

El primer prototipo deberá planificar únicamente:

* flujo principal;
* bloques por coach;
* pipeline emparejado Prueba vocal → bloque de flujo principal;
* prueba vocal;
* dependencias;
* disponibilidad;
* márgenes entre platós;
* comida;
* continuidad;
* permanencia de concursantes;
* backtracking básico.

No se ampliará hasta superar el benchmark focal.

## Capacidades posteriores

Se añadirán una a una:

1. Banda e intervalo de presencia, con `requiresBand` operativo y `usesInstrument` informativo;
2. Reality y equipos itinerantes;
3. Presentadora y recursos con ventana;
4. Totales y tareas largas;
5. setups y bloques secundarios;
6. tareas conjuntas;
7. operaciones técnicas;
8. transportes y resto de reglas.

Cada capacidad tendrá escenario, métrica y criterio de aceptación.

---

# 35. Antipatrones prohibidos

Queda prohibido:

* añadir una capa arquitectónica sin una carencia demostrada;
* optimizar un planning heredado en lugar de construirlo;
* usar V3 o V4 como semilla del nuevo planificador;
* hardcodear nombres de programas, platós, recursos o tareas;
* confundir una preferencia con una restricción hard;
* puntuar opciones hard-invalid;
* elegir por ID o por orden de base de datos;
* colocar primero tareas breves por ser fáciles;
* sustituir el orden constructivo por un MRV global sobre todas las tareas/macro-unidades pendientes, permitiendo que una tarea individual de una fase posterior intercale o descomponga un bloque operativo todavía no cerrado;
* convertir automáticamente cada tarea con recurso en una macro-unidad individual cuando la configuración la integra en una unidad/bloque operativo mayor;
* tratar el patrón de coaches del flujo principal como decorativo y colocar feeders individualmente sin cerrar los bloques que lo alimentan;
* aceptar un bloque main porque cada feeder parece viable de forma aislada sin demostrar la viabilidad conjunta de la cohorte;
* confundir “misma cohorte feeder/main” con “mismo orden interno obligatorio”;
* hardcodear cuatro, cinco o cualquier número de bloques a partir de un benchmark en lugar de derivarlo de la configuración y la viabilidad;
* consumir presupuesto combinatorio en `FEEDER_ORDER` o en permutaciones internas para descubrir una imposibilidad que ya puede demostrarse mediante carga, ventanas, comidas, transiciones, recursos o continuidad a nivel de arquitectura o cohorte;
* enumerar separadamente permutaciones operacionalmente equivalentes cuando ninguna autoridad activa puede distinguirlas;
* consumir presupuesto relevante en comidas materializadas, standalone o calidad secundaria cuando el siguiente bloque estructural ya carece de feeder viable;
* comenzar todos los espacios lo antes posible;
* aceptar planes parciales;
* reparar indefinidamente una mala estructura inicial;
* integrar cambios críticos sin benchmark real;
* aumentar el espacio de búsqueda sin evidencia;
* crear Evidence que no ayude a decidir;
* permitir que el algoritmo se vuelva más importante que el resultado de producción.

---

# 36. Tests funcionales obligatorios

La implementación deberá demostrar, como mínimo:

## Flujo principal hacia atrás

Construye un tramo continuo terminado en la hora preferida cuando es viable.

## División por comida

Divide mañana y tarde sólo cuando no existe construcción completa antes de la comida.

## Alimentación feeder

Nunca asigna una tarea principal si sus dependencias y márgenes no pueden completarse.

## Bloques de coach

Respeta máximo, mínimo y orden configurados.

## Pipeline feeder→main por coach

Debe demostrar que:

1. cada cohorte main tiene previamente alimentados sus feeders estructurales;
2. el mismo coach respeta su transición efectiva entre la unidad feeder y el flujo principal;
3. con dos coaches puede mantener el flujo principal continuo alternando bloques mientras el otro coach prepara feeders;
4. una comida del flujo principal puede actuar como corte estructural sin convertirse en bloqueo global de unidades no configuradas;
5. la pertenencia de cohorte puede conservarse aunque el orden interno feeder y main sea diferente;
6. `mirrorMainFlowOrder=PREFERRED` no elimina una solución viable ni fuerza bloques adicionales;
7. una rama se poda antes de trabajo secundario si el siguiente bloque no puede alimentarse;
8. un escenario con diferente número de coaches deriva el número mínimo de bloques factible y no aplica una fórmula `2 × coaches`;
9. el resultado es determinista y la Evidence explica qué bloque o recurso cerró una alternativa.

## Poda estructural antes del orden interno

Debe demostrar que:

1. una arquitectura mínima plausible que sea demostrablemente imposible por carga, ventanas, comidas, transiciones, recursos o continuidad se descarta antes de explorar órdenes internos de sus cohortes;
2. una arquitectura descartada por una prueba estructural suficiente no consume ramas de `FEEDER_ORDER` ni de un mecanismo interno equivalente;
3. tras descartar esa arquitectura, el motor deriva la siguiente arquitectura plausible desde configuración y viabilidad, sin hardcodear el número observado en A2 u otro benchmark;
4. permutaciones operacionalmente equivalentes se contraen o canonicalizan cuando ninguna autoridad activa puede distinguirlas;
5. cuando el orden interno sí cambia la viabilidad, el motor conserva las alternativas exactas necesarias y retrocede sin usar una elección greedy como prueba de inviabilidad;
6. la Evidence distingue poda estructural de poda por orden interno y permite atribuir el ahorro de búsqueda a la autoridad causal correcta;
7. el resultado y la contabilidad de ramas son deterministas.

## Equivalencia operacional, dominios libres y primera solución

Debe demostrar que:

1. un bloque con múltiples concursantes que poseen la misma firma estructural activa no genera ramas factoriales por intercambiar identidades;
2. invertir el orden de entrada de participantes equivalentes conserva el mismo estado estructural canónico y un resultado determinista;
3. un concursante con una ventana futura estrecha, una operación anclada, un recurso continuo u otra autoridad activa se separa correctamente de la clase equivalente;
4. si dos concursantes son equivalentes para la estructura pero uno pierde después una ventana crítica conocida, esa diferencia ya estaba representada en la firma o el dominio y no se descubre mediante una enumeración tardía de todas las permutaciones;
5. un intervalo ocupado o imposible de gran tamaño se elimina mediante aritmética de dominios sin barrido punto a punto de la grid;
6. la Evidence distingue tamaño lógico del dominio, posiciones eliminadas analíticamente, posiciones evaluadas y ramas consumidas;
7. después de una colocación provisional, una obligación futura que conserva huecos sigue abierta sin materializarse; si pierde su último hueco, la rama se poda inmediatamente;
8. cuando varias tareas compiten por los mismos pocos huecos, el motor escala de dominio individual a capacidad/matching en vez de aceptar falsamente la rama;
9. un blocker causado por una decisión previa provoca retroceso al punto causal relevante antes de permutar decisiones equivalentes no relacionadas;
10. en un escenario representativo se obtiene una primera planificación completa hard-valid antes de consumir presupuesto relevante en alternativas de calidad equivalentes.

## Witness anónimo de pipeline y matching por bundles

Debe demostrarse que:

1. una cota de capacidad suficiente no marca una arquitectura como alimentada sin construir después un witness estructural conjunto;
2. una familia de bloques sin witness se rechaza antes de abrir DFS nominal de tareas;
3. las familias se prueban por número de bloques creciente y no se explora una familia más fragmentada mientras una familia menor siga sin resolver estructuralmente;
4. el primer número de bloques con witness + matching + hard-validity completa termina la construcción interactiva;
5. los spots de IN, Estilismo/preparación, feeder y Main pueden existir sin `participantId` mientras las identidades sean equivalentes;
6. Estilismo Entrada que alimenta el pipeline no aparece como tarea standalone residual antes de cerrar el witness;
7. asignar una identidad a un Main asigna/rematchea un bundle completo de pipeline, no sólo la tarea Main aislada;
8. un swap de dos identidades compatibles rematerializa sus bundles sin reconstruir innecesariamente la arquitectura;
9. una autoridad nominal real —coach, Banda, operación anclada, lock, disponibilidad crítica, recurso— refina las aristas del matching sin abrir permutaciones equivalentes;
10. el benchmark registra `timeToFirstHardValidMs` y una petición Assisted no continúa comparando soluciones completas después de encontrar la primera hard-valid;
11. un escenario de Stage que supera 5 minutos finaliza explícitamente por presupuesto temporal y no continúa ejecutándose;
12. en A2, cuatro bloques pueden emerger como primera familia factible tras demostrar que familias menores no sostienen el pipeline, sin hardcodear el número cuatro.

## Reserva de comida durante la columna vertebral

Una asignación main que elimina todos los intervalos de comida de un concursante se rechaza aunque la comida todavía no se haya materializado.

La misma regla se aplica a las comidas operacionales `REQUIRED`: cualquier decisión que elimine el último intervalo completo de una unidad, espacio o recurso afectado se rechaza inmediatamente aunque el descanso todavía sea una reserva virtual.

Debe demostrarse además que:

1. ocupar el witness anterior no provoca poda si existe otro intervalo completo;
2. una frontera natural de bloque/setup/espacio se prefiere cuando existe;
3. una frontera entre tareas es una preferencia secundaria;
4. si no existe ninguna frontera preferente adecuada, un hueco libre completo dentro de la ventana sigue siendo hard-válido;
5. ninguna comida interrumpe una tarea productiva;
6. el descanso autorizado no incrementa `runCount` ni rompe continuidad;
7. el test analítico de existencia no enumera la grid ni consume ramas;
8. la materialización de alternativas temporalmente distinguibles sí queda contabilizada.

## Banda e instrumento informativo

El benchmark debe incluir las cuatro combinaciones:

* `NEITHER`;
* `BAND_ONLY`;
* `INSTRUMENT_ONLY`;
* `BAND_AND_INSTRUMENT`.

Debe demostrar:

1. que `requiresBand` y `usesInstrument` son flags independientes;
2. que sólo `requiresBand` proyecta el recurso Banda;
3. que `INSTRUMENT_ONLY` no consume recursos adicionales;
4. que `BAND_ONLY` y `BAND_AND_INSTRUMENT` generan exactamente la misma demanda operativa;
5. que cambiar o eliminar la anotación de instrumento no modifica el problema ni el planning;
6. que la comida del espacio no rompe la continuidad del recurso Banda;
7. que `OFF` no fuerza concentración;
8. que `PREFERRED` prefiere un único bloque, pero puede dividirlo con penalización;
9. que `REQUIRED` rechaza una solución dividida;
10. que nunca se rompen dependencias ni disponibilidades para concentrar el recurso;
11. que el intervalo de presencia se reduce cuando existe una alternativa equivalente;
12. que el resultado es determinista y explicable.

## Tarea larga

Se planifica antes que trabajo flexible cuando dispone de menos posiciones.

## Permanencia

No adelanta innecesariamente una tarea breve de un concursante con obligaciones tardías.

## Setup

Bloquea el espacio durante la preparación y repite preparación al reentrar.

## Margen

Aplica margen al cambiar de plató y no lo aplica dentro del mismo.

## Recurso compartido

No solapa el recurso y utiliza una sola comida compatible.

## Tarea conjunta

Todas las tareas vinculadas comparten intervalo y espacio.

## Operación sin concursante

Consume correctamente espacio y recursos.

## Backtracking

Retrocede cuando la mejor decisión inmediata impide completar otra tarea.

## Determinismo

Misma entrada y configuración producen exactamente la misma solución.

## Completitud

Nunca publica un parcial como planning válido.

## Construcción progresiva por unidades y materialización terminal

Debe demostrarse que:

1. una tarea individual de una fase posterior con dominio menor no adelanta a un bloque estructural aún elegible sólo por MRV global;
2. dentro de la unidad elegida sí puede utilizarse MRV para ordenar geometrías o identidades materialmente distintas;
3. una unidad de varias tareas se construye primero como bloque/slots y el matching de identidades ocurre después cuando la equivalencia lo permite;
4. colocar un bloque actualiza los límites temprano/tardío de las cadenas pendientes sin materializar sus horas flexibles;
5. una cadena `IN → prerrequisito breve → obligación productiva` inviable se poda antes de construir unidades posteriores;
6. una cadena viable permanece sin hora exacta hasta la fase terminal y después se materializa dentro de la reserva;
7. IN se materializa tan tarde como permita la política hard aplicable y OUT tan pronto como permita la política hard aplicable;
8. la compactación terminal no altera la estructura productiva ni convierte una preferencia en hard;
9. cambiar IDs u orden de entrada no cambia la secuencia de fases/unidades ni el resultado canónico;
10. el benchmark A2 utiliza estas reglas sólo como caso de prueba: no existen nombres de plató/tarea A2 en la lógica genérica;
11. una tarea productiva localmente colocable a primera hora pero con un prerrequisito pendiente que no puede completarse antes no ofrece ese start como alternativa constructiva;
12. varios participantes con readiness distinta producen como primera alternativa el primer bloque compacto con matching conjunto alimentable, no `day.start` ni la primera disponibilidad individual aislada;
13. una ocupación ya colocada del participante o de un recurso compartido desplaza automáticamente la primera geometría alcanzable;
14. dos o más lanes sincronizadas no abren assignment branching hasta que la geometría completa conserva participantes alimentables para sus posiciones;
15. si la autoridad previa es inconclusa, la arista o geometría se conserva y la búsqueda exacta sigue siendo alcanzable;
16. eliminar una geometría temprana imposible no convierte la compactación en hard: una geometría posterior compacta o, si es necesario, un único bloque lógico con hueco mínimo continúa siendo alcanzable.

---

# 37. Criterios de aceptación del nuevo planificador

Una versión será aceptable cuando:

* construya desde tareas sin horas;
* no utilice otro motor como semilla;
* coloque todas las tareas planificables;
* respete todas las reglas hard;
* mantenga continuidad configurada;
* forme bloques coherentes;
* construya como una unidad causal los bloques del flujo principal y los feeders estructurales que comparten recurso;
* avance después por fases y unidades operativas, cerrando el bloque estructural elegible antes de mezclar tareas individuales de fases posteriores;
* mantenga y propague envolventes tempranas/tardías para prerrequisitos y salidas terminales sin materialización prematura;
* aplique universalmente la alimentación factible de §10.3.1: ninguna tarea, slot, ronda o geometría entra en búsqueda sólo porque el espacio esté libre si su cierre de prerrequisitos ya demuestra que no puede alcanzarse;
* para unidades multi-participante o sincronizadas, compruebe capacidad/matching conjunto de alimentación antes de consumir búsqueda combinatoria cuando existan recursos o prerrequisitos compartidos;
* distinga explícitamente geometría de spots, capacidad colectiva de alimentación, witness estructural anónimo, matching nominal por bundles y materialización final, evitando fijar identidades cuando aún sean operacionalmente equivalentes;
* compare demanda acumulada y capacidad máxima alimentable en los horizontes estructurales relevantes, usando una insuficiencia demostrada como poda y una suficiencia como `NOT_PROVEN/CONTINUE`;
* después de una capacidad suficiente, construya un witness anónimo conjunto de los spots que sostienen el pipeline antes de abrir DFS nominal o declarar cerrada la estructura;
* no delegue a búsqueda standalone tareas breves cuya geometría todavía pueda decidir la viabilidad del pipeline activo;
* asigne identidades sobre bundles completos del pipeline y rematchee/rematerialice el bundle cuando cambie la identidad, en vez de reparar tareas estructurales aisladas a posteriori;
* reutilice las autoridades existentes de capacidad, prefix-capacity, matching, cierre de prerrequisitos y Future Feasibility antes de introducir cualquier subsistema paralelo;
* derive el primer inicio candidato de las autoridades del Estado Operativo y nunca de una hora hardcodeada o de `day.start` cuando existan prerrequisitos que la retrasen;
* limite MRV/matching al scope de la fase/unidad elegible y nunca los use como sustituto del orden constructivo oficial;
* derive el número de bloques desde configuración, carga y viabilidad, sin hardcodes de benchmark, y explore primero las familias con menor número de bloques;
* no explore una familia con más bloques mientras una familia menor conserve una posibilidad estructural no resuelta;
* descarte una arquitectura demostrablemente imposible antes de consumir búsqueda combinatoria de orden interno y preserve el backtracking exacto cuando el orden sí sea material;
* contraiga o canonicalice identidades operacionalmente equivalentes y sólo abra ramas separadas cuando una autoridad activa haga la diferencia material;
* construya posiciones desde dominios de huecos libres y fronteras operativas, sin barridos ocultos ni enumeración de posiciones ya imposibles;
* aplique Future Feasibility escalonada, usando matching o búsqueda combinatoria sólo cuando las pruebas más baratas sean inconclusas;
* obtenga una primera solución completa hard-valid antes de invertir presupuesto relevante en optimización de alternativas equivalentes;
* en construcción/propuesta Assisted interactiva, devuelva inmediatamente esa primera solución hard-valid y deje cualquier mejora para una operación separada;
* cumpla un objetivo de ≤2 minutos y un techo bloqueante de 5 minutos por Stage, con terminación explícita al agotar dicho presupuesto;
* retroceda hacia decisiones causales cuando una obligación pierda su última alternativa, siempre que esa causalidad pueda identificarse de forma simple y determinista;
* cumpla dependencias y márgenes;
* conserve una posición de comida y de obligaciones hard futuras antes de aceptar una decisión estructural, incluida una reserva virtual reparable para toda comida operacional `REQUIRED`;
* compacte concursantes y recursos;
* proyecte correctamente `requiresBand` y preserve `usesInstrument` como metadata sin influencia en la planificación;
* cumpla la política `OFF | PREFERRED | REQUIRED` de recursos continuos;
* trate la comida autorizada como interrupción sin ruptura de bloque;
* retroceda ante puntos muertos;
* sea determinista;
* explique decisiones relevantes;
* supere benchmarks reales;
* responda en segundos;
* y permanezca suficientemente simple para ser auditado.

---

# 38. Definición de éxito

El nuevo planificador tendrá éxito cuando pueda recibir un día configurado sin horas de inicio y fin y construir una planificación que un jefe de producción considere utilizable sin tener que rehacer su estructura.

No se medirá por:

* número de componentes;
* sofisticación teórica;
* cantidad de candidatos;
* cantidad de Evidence;
* número de iteraciones de desarrollo.

Se medirá por:

* calidad real del planning;
* completitud;
* continuidad;
* compactación;
* respeto de recursos;
* capacidad de adaptación;
* explicación;
* velocidad;
* confianza del usuario.

---

# 39. Principio final

Planificar es construir primero lo que condiciona el día.

El flujo principal actúa como eje. Cuando necesita feeders que comparten recursos con él, esos feeders y el flujo principal se construyen como una tubería de bloques: primero se prepara una cohorte, el recurso se desplaza, esa cohorte alimenta el bloque main y, cuando existen varios recursos, se aprovecha la ejecución de uno para preparar el siguiente.

Después se protegen las operaciones con menos libertad: recursos de ventana estrecha, tareas largas, equipos itinerantes, comidas obligatorias y cadenas críticas.

Después se construyen los bloques por setup.

Finalmente se rellenan los huecos con lo corto y flexible.

En cada decisión se conserva la libertad futura. La calidad secundaria nunca justifica una estructura que ya no puede completar la producción.

Cuando una elección bloquea el futuro, se vuelve atrás y se prueba otra.

Todo lo demás debe existir únicamente si demuestra que mejora este proceso.

Regla de interpretación final:

> **OptiPlan no descubre el pipeline probando tareas nominales. Construye primero un pipeline factible de spots, demuestra que puede alimentarlo, y después descubre qué participantes ocupan esos spots.**

Una implementación que delega a búsqueda genérica la construcción tardía de spots estructurales no satisface esta SPEC aunque pueda encontrar eventualmente una solución.

La producción tiene que salir.


---

# PARTE III — SPEC-08 Unidades itinerantes y operaciones ancladas

# OPTIPLAN — ESPECIFICACIÓN OPERATIVA DEL PLANIFICADOR

# SPEC-08 — Unidades Itinerantes y Operaciones Ancladas de Acompañamiento

Versión 1.1

Provenance histórica: antigua SPEC-08. Su contrato genérico queda integrado en esta Fuente; los hechos y correcciones A2 concretos se rigen exclusivamente por la Fuente 06.

Ámbito: planificación inicial, replanificación pendiente, equipos itinerantes, recursos compartidos, ventanas efectivas, operaciones sincronizadas con tareas ancla, validación, Evidence y benchmark

**Cambio v1.1:** corrige la interpretación temporal del benchmark A2. Los horarios observados de los tres equipos Reality no son ventanas de disponibilidad. En A2 las tres composiciones están disponibles durante toda la jornada; su exclusividad se deriva de los recursos miembros compartidos.

---

# 1. Propósito

Esta especificación define cómo debe representar y planificar OptiPlan:

- equipos itinerantes formados por varios recursos;
- cambios de composición de esos equipos durante la jornada;
- operaciones independientes de dichos equipos;
- operaciones que comienzan antes de una tarea ancla, acompañan esa tarea y terminan después;
- ventanas efectivas propias de una operación o composición;
- sincronización temporal entre tareas realizadas en espacios operativos diferentes.

Su finalidad es evitar dos errores:

1. duplicar un equipo itinerante como si fuera un recurso adicional a sus miembros;
2. convertir una operación de acompañamiento en una ocupación prolongada del espacio de la tarea ancla.

La producción tiene que salir.

---

# 2. Relación con la documentación oficial

Este bloque integrado debe leerse conjuntamente con:

- Fuente 01 para producto, dominio y operación;
- Fuente 02 para ORC interno;
- Partes I–II de esta Fuente 03 para construcción;
- Fuente 04 para integración/configuración efectiva;
- Fuente 05 para validación/benchmark;
- Fuente 06 para cualquier hecho A2 específico.

Se mantienen plenamente vigentes:

- viabilidad antes que optimización;
- determinismo;
- simulación antes de consolidación;
- configuración antes que hardcode;
- tareas `in_progress` y `done` inamovibles;
- replanificación sólo de lo pendiente;
- Evidence obligatoria;
- benchmark como criterio de aceptación.

Cuando una operación itinerante acompaña a una tarea del flujo principal:

- SPEC-07 continúa regulando la construcción del flujo principal;
- SPEC-08 regula la sincronización del equipo itinerante alrededor de esa tarea;
- ninguna operación acompañante puede alterar silenciosamente la duración, el espacio o la identidad de la tarea ancla.

---

# 3. Evidencia operativa de referencia

Las planificaciones reales `ENSAYO_A2_LV.pdf` y `ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf` muestran tres operaciones de Reality que envuelven ensayos del flujo principal.

Referencia humana:

## Cristina Zuloaga

```text
Reality:       11:00–11:45
Ensayo main:   11:15–11:30
```

## Julio Gómez

```text
Reality:       12:00–12:45
Ensayo main:   12:15–12:30
```

## José Javier Cuenca

```text
Reality:       12:45–13:30
Ensayo main:   13:00–13:15
```

En los tres casos:

```text
15 minutos antes
        ↓
15 minutos de ensayo principal
        ↓
15 minutos después
```

La evidencia muestra además que los segmentos anteriores y posteriores coinciden temporalmente con ensayos de otros concursantes.

Ejemplos:

- el segmento posterior de Cristina coincide con el ensayo de Moisés;
- el segmento anterior de Julio coincide con el ensayo de Carmen;
- el segmento posterior de Julio coincide con el ensayo de Lina;
- el segmento anterior de José Javier coincide con el ensayo de Naomi;
- el segmento posterior de José Javier coincide con el ensayo de Luis.

Conclusión obligatoria:

> La operación de Reality dura 45 minutos para el concursante y para sus recursos, pero no ocupa durante 45 minutos el espacio exclusivo del flujo principal.

La etiqueta humana `LOC: PLATÓ` describe una localización general.

No significa que los segmentos anterior y posterior ocupen el mismo `spaceId` exclusivo que el ensayo principal.

---

# 4. Principio rector

Una operación anclada de acompañamiento es una operación compuesta y sincronizada.

No es:

- una tarea ficticia de duración total;
- una extensión de la duración del ancla;
- una reserva de 45 minutos del espacio principal;
- una excepción específica de Reality;
- una transformación posterior para reparar un planning.

Se representa mediante tareas reales:

```text
segmento anterior
        ↓ adyacencia REQUIRED
tarea ancla existente
        ↓ adyacencia REQUIRED
segmento posterior
```

Cada tarea conserva:

- identidad;
- duración;
- participante;
- espacio operativo;
- recursos;
- disponibilidad;
- estado;
- locks.

---

# 5. Unidad itinerante

## 5.1 Definición

Una unidad itinerante es una composición operativa de recursos que mantiene una agenda coordinada.

Puede incluir:

- cámaras;
- sonido;
- equipos técnicos;
- recursos humanos;
- vehículos;
- otros recursos configurables.

Ejemplo:

```text
Unidad A
├── Cámara 3
└── Sonido 1
```

## 5.2 Identidad

La unidad posee un identificador para:

- configuración;
- agenda;
- Evidence;
- métricas;
- agrupación de operaciones.

El identificador de la unidad no se añade automáticamente como recurso hard cuando ya se consumen sus miembros.

Queda prohibido exigir simultáneamente:

```text
unidad-A
cámara-3
sonido-1
```

cuando `unidad-A` sólo representa la agrupación de Cámara 3 y Sonido 1.

Eso duplicaría capacidad y produciría una restricción falsa.

## 5.3 Recursos miembros

Cada operación declara explícitamente los recursos miembros que consume.

La unidad no oculta la composición efectiva.

La composición debe ser auditable.

---

# 6. Disponibilidad de la unidad y disponibilidad de sus miembros

La disponibilidad de una composición puede ser más restrictiva que la de sus miembros únicamente cuando exista una restricción operativa **explícita** para esa composición.

Deben distinguirse:

- disponibilidad individual de cada recurso;
- disponibilidad explícita de la composición itinerante, si existe;
- ventana efectiva de cada operación.

La ventana efectiva de una operación será la intersección de:

```text
día
∩ disponibilidad del participante
∩ disponibilidad del espacio
∩ disponibilidad de cada recurso miembro
∩ disponibilidad explícita de la composición, si existe
∩ ventana propia de la tarea, si existe
∩ comidas y bloqueos aplicables
```

Regla de autoridad:

> La disponibilidad de una composición no se inferirá a partir del horario en que esa unidad apareció en una planificación humana, de reglas históricas, de etiquetas o de la secuencia observada en otro plan.

Si una composición no tiene ventana explícita configurada, **no introduce una restricción temporal adicional**: su disponibilidad queda determinada por la jornada y por la disponibilidad efectiva de sus recursos miembros y demás autoridades aplicables.

Esta regla es coherente con la disponibilidad temporal oficial de recursos: la ausencia de una ventana explícita no autoriza a inventar una ventana más estrecha.

---

# 7. Recomposición de recursos

Los mismos recursos pueden formar composiciones diferentes en momentos distintos.

Ejemplo hipotético:

```text
Composición A
Cámara 3 + Sonido 1

Composición B
Cámara 4 + Sonido 2

Composición C
Cámara 3 + Cámara 4 + Sonido 1
```

Las composiciones A y B pueden operar simultáneamente si no comparten recursos. La composición C no puede solaparse con A ni con B porque comparte miembros con ambas.

Una composición sólo queda limitada a un tramo concreto del día cuando esa ventana está configurada explícitamente. No se deducirá una ventana de mañana o tarde a partir de una planificación humana de referencia.

La reconfiguración puede requerir:

- finalización de unidades anteriores;
- comida;
- reunión física;
- preparación;
- traslado;
- cambio de personal;
- otra condición operativa.

Cuando esa condición tenga duración o recursos propios deberá representarse mediante una tarea explícita.

Cuando sólo limite el periodo en que la composición existe, se expresa mediante su ventana efectiva.

---

# 8. Tipos de operación itinerante

## 8.1 STANDALONE

Operación independiente.

Posee:

- participante cuando corresponda;
- duración;
- espacio propio;
- recursos miembros;
- ventana efectiva;
- dependencias;
- demás restricciones normales.

Se planifica como cualquier tarea operativa.

## 8.2 ANCHORED_ACCOMPANIMENT

Operación que acompaña a una tarea ancla existente.

Posee:

- `anchorTaskId`;
- uno o varios segmentos anteriores;
- uno o varios segmentos posteriores;
- adyacencia REQUIRED;
- participante común;
- recursos que deben permanecer durante toda la operación;
- espacios propios para cada segmento;
- ventanas efectivas.

La tarea ancla no se sustituye.

---

# 9. Contrato efectivo mínimo

El problema de planificación deberá poder expresar un contrato equivalente a:

```text
AnchoredAccompaniment
- id
- anchorTaskId
- beforeTaskIds[]
- afterTaskIds[]
- adjacency = REQUIRED
- internalTransition = INCLUDED
- resourceContinuity = REQUIRED
```

Las tareas referenciadas ya existen en el problema efectivo.

El contrato no contiene nombres de programa, plató, concursante o equipo.

---

# 10. Identidad del ancla

La tarea ancla conserva obligatoriamente:

- `id`;
- `kind`;
- `participantId`;
- duración;
- `spaceId`;
- coach;
- `blockKey`;
- dependencias;
- setup;
- estado;
- locks;
- demás propiedades operativas.

La operación acompañante puede añadir recursos efectivos al ancla antes de planificar.

No puede:

- cambiar su duración;
- convertirla en auxiliary;
- duplicarla;
- reemplazarla;
- desplazarla fuera del patrón normal del flujo principal.

---

# 11. Espacios de los segmentos

Cada segmento anterior o posterior conserva su propio `spaceId` configurado.

No hereda automáticamente el espacio exclusivo del ancla.

Puede ocurrir que:

- el ancla se realice en el espacio principal;
- los segmentos se realicen en otro espacio operativo de la misma localización;
- ambos espacios puedan trabajar simultáneamente.

Ejemplo:

```text
before.spaceId = reality-location-stage
anchor.spaceId = main-stage
after.spaceId  = reality-location-stage
```

La igualdad de una etiqueta humana de localización no implica igualdad de `spaceId`.

Si un caso real exige que un segmento use exactamente el espacio del ancla, deberá configurarse así explícitamente y asumirá todas sus consecuencias de exclusividad.

---

# 12. Adyacencia e internal transition

La adyacencia REQUIRED significa:

```text
fin del último before = inicio del anchor
fin del anchor = inicio del primer after
```

Los segmentos múltiples de cada lado también son consecutivos.

Cuando `internalTransition = INCLUDED`:

- no se añade el margen genérico entre los miembros internos de la operación;
- la propia operación representa el acompañamiento, movimiento o preparación entre fases;
- no existe tiempo libre entre fases.

El margen general vuelve a aplicarse:

- antes del primer segmento;
- después del último segmento;
- frente a cualquier tarea ajena a la operación.

Esto no constituye una relajación global.

Es una relación explícita y local entre miembros de una única operación compuesta.

---

# 13. Participante

Todos los segmentos de una operación anclada comparten participante con el ancla.

El participante queda ocupado durante:

```text
inicio del primer before
→
fin del último after
```

No puede realizar ninguna otra tarea solapada.

Su permanencia se calcula utilizando todas las fases.

---

# 14. Recursos durante la operación

Los recursos configurados para el acompañamiento deben estar presentes durante:

- todos los segmentos anteriores;
- la tarea ancla;
- todos los segmentos posteriores.

La proyección efectiva añade esos recursos explícitamente a cada miembro.

No se infieren desde:

- `unitId`;
- nombres;
- etiquetas;
- anotaciones;
- instrumentos;
- localizaciones.

Cada recurso debe cumplir:

- disponibilidad;
- exclusividad;
- transición;
- comida;
- capacidad;
- demás reglas hard.

---

# 15. Ventanas de tarea

El contrato de tarea debe admitir una ventana efectiva opcional.

Semántica equivalente:

```text
task.availability?: Window[]
```

La ausencia del campo mantiene el comportamiento histórico.

Cuando existe, una posición sólo es válida si toda la tarea cabe en una de sus ventanas.

Las ventanas deben:

- ser configurables;
- validarse en preflight;
- ser deterministas;
- aplicarse en todas las fases de placement;
- incluirse en Evidence.

No se utilizan horas humanas de referencia como ventanas salvo que la configuración operativa del escenario las declare expresamente.

---

# 16. Construcción del flujo principal

Las operaciones acompañantes participan al seleccionar y ordenar los anchors.

Sin embargo:

> No aumentan la duración de la posición del flujo principal.

El timeline principal continúa utilizando exclusivamente la duración del ancla.

Para cada posición candidata del ancla:

1. se calcula el horario normal del anchor;
2. se derivan hacia atrás los segmentos before;
3. se derivan hacia delante los segmentos after;
4. se materializan provisionalmente todas las fases;
5. se comprueban participante, espacios, recursos, ventanas, comidas y conflictos;
6. la rama se conserva o se descarta de forma atómica.

El espacio principal sólo queda ocupado por la tarea ancla.

Los segmentos pueden coincidir con otras tareas main cuando:

- utilizan otro espacio;
- no comparten participante;
- no comparten recursos incompatibles;
- cumplen el resto de restricciones hard.

---

# 17. Feeders

La fecha límite de los feeders se calcula respecto a la primera obligación real del participante dentro de la operación.

Con segmentos before:

```text
feederDeadlineBase = inicio del primer before
```

Sin segmentos before:

```text
feederDeadlineBase = inicio del anchor
```

Después se aplica el margen obligatorio correspondiente.

No es válido alimentar únicamente la hora del anchor cuando el participante ya debe estar ocupado antes.

---

# 18. Continuidad del flujo principal

La continuidad del flujo principal se calcula únicamente con:

- tareas main;
- comida autorizada del flujo principal.

Los segmentos acompañantes:

- no rellenan huecos del espacio principal;
- no crean huecos del espacio principal;
- no cuentan como tareas main;
- no cambian bloques de coach;
- no alteran `minTasksPerBlock`;
- no alteran `maxBlocksByKey`;
- no amplían la duración del tramo principal.

La continuidad de la operación acompañante se valida por separado mediante su adyacencia.

---

# 19. Colocación de tareas auxiliares

Los segmentos acompañantes son tareas reales, pero quedan materializados junto con el anchor.

La fase general de auxiliares no debe volver a colocarlos.

La exclusión se deriva de que sus IDs ya están programados.

No se utilizarán listas específicas por programa o tipo nominal.

---

# 20. Comidas

Una operación anclada REQUIRED es indivisible.

No puede atravesar una comida que bloquee:

- al participante;
- a uno de sus recursos;
- a uno de sus espacios;
- a la composición itinerante.

La comida del flujo principal puede quedar entre anchors.

No puede insertarse dentro de una operación acompañante.

---

# 21. Validación final

Para cada operación anclada debe comprobarse:

- anchor exactamente una vez;
- cada segmento exactamente una vez;
- ausencia de miembros extra;
- orden exacto;
- adyacencia exacta;
- participante común;
- espacios exactos según cada tarea;
- duración exacta;
- recursos exactos;
- ventana efectiva;
- disponibilidad;
- cero solapamientos incompatibles;
- cero transiciones externas inválidas;
- operación completa.

Una operación parcial invalida el plan completo.

---

# 22. Métricas mínimas

Para cada unidad itinerante:

- operationCount;
- plannedOperationCount;
- memberResourceIds;
- availability;
- presenceStart;
- presenceEnd;
- presenceSpanMinutes;
- productiveMinutes;
- internalGapMinutes;
- operationalBlockCount;
- locationSequence;
- moveCount;
- compositionSatisfied;
- availabilitySatisfied.

Para cada operación anclada:

- anchorTaskId;
- beforeTaskIds;
- afterTaskIds;
- operationStart;
- anchorStart;
- anchorEnd;
- operationEnd;
- totalDuration;
- adjacencySatisfied;
- participantSatisfied;
- spacesSatisfied;
- resourcesSatisfied;
- taskWindowsSatisfied;
- complete.

---

# 23. Evidence

La Evidence debe explicar:

- qué unidad ejecuta la operación;
- qué recursos la componen;
- desde cuándo existe esa composición;
- qué tarea actúa como ancla;
- cuándo comienzan y terminan los segmentos;
- por qué los segmentos pueden coincidir con otras tareas del flujo principal;
- qué espacios se utilizan;
- qué ventanas limitan la operación;
- por qué se rechazaron otras posiciones;
- si una composición se desmonta y se forma otra posteriormente.

No debe afirmar soporte mediante constantes.

Toda capacidad se demuestra mediante ejecución o validación independiente.

---

# 24. Referencia Focal A2

## 24.0 Autoridad temporal del A2

Para el día A2 existen tres equipos Reality configurados como composiciones de recursos:

```text
Unidad A          = Cámara 3 + Sonido 1
Unidad B          = Cámara 4 + Sonido 2
Unidad combinada  = Cámara 3 + Cámara 4 + Sonido 1
```

**Disponibilidad de composición para este A2: jornada completa.**

No existe una ventana hard específica de mañana o tarde para ninguna de las tres composiciones.

Las horas que aparecen en la planificación humana son únicamente el resultado de esa planificación y sirven para cotejar una solución conocida. No constituyen disponibilidad, locks, seeds, ventanas de tarea ni ventanas de composición.

Conflictos de recursos:

- Unidad A y Unidad B pueden operar simultáneamente porque no comparten miembros.
- Unidad A y Unidad combinada no pueden operar simultáneamente porque comparten Cámara 3 y Sonido 1.
- Unidad B y Unidad combinada no pueden operar simultáneamente porque comparten Cámara 4.
- La propia exclusividad de los recursos miembros es la autoridad hard; no se añade un recurso hard duplicado por `unitId`.

Si en otro día una composición tiene una ventana propia real, deberá venir configurada explícitamente en el snapshot de ese día.

## 24.1 Unidad A

Recursos:

- Cámara 3;
- Sonido 1.

Disponibilidad A2:

```text
jornada completa
```

Operaciones observadas en la planificación humana de referencia:

- Cristina Zuloaga, 11:00–11:45, anchor 11:15–11:30;
- Luis Belda, 12:00–12:30;
- José Javier Cuenca, 12:45–13:30, anchor 13:00–13:15;
- Pere Portero, 13:30–14:00.

Minutos productivos:

```text
150
```

Los horarios anteriores **no** restringen el dominio del benchmark.

## 24.2 Unidad B

Recursos:

- Cámara 4;
- Sonido 2.

Disponibilidad A2:

```text
jornada completa
```

Operaciones observadas en la planificación humana de referencia:

- Gisela Montserrat, 11:15–11:45;
- Julio Gómez, 12:00–12:45, anchor 12:15–12:30;
- Nela García, 13:00–13:30.

Minutos productivos:

```text
105
```

Los horarios anteriores **no** restringen el dominio del benchmark.

## 24.3 Unidad combinada

Recursos:

- Cámara 3;
- Cámara 4;
- Sonido 1.

Disponibilidad A2:

```text
jornada completa
```

Operaciones observadas en la planificación humana de referencia:

- Lina Isabel García-Salcedo;
- Marta Fonrali;
- Linet Varela;
- Carmen María Saborido;
- Eva Martín Fernández.

Minutos productivos:

```text
120
```

La ubicación vespertina observada en el planning humano no constituye una ventana hard. La unidad combinada puede operar por la mañana o por la tarde si sus recursos miembros, participantes, espacios y demás autoridades están disponibles.

---
# 25. Benchmark focal

Este benchmark es **focal y técnico**: sus 53 tareas, 12 operaciones y 375 minutos pertenecen a la cobertura histórica de itinerancia/operaciones ancladas de esta Parte y **no** son el universo canónico A2 de 266 obligaciones. Ante cualquier hecho específico de A2 prevalece la Fuente 06.

El benchmark focal completo deberá:

1. eliminar las horas de las tareas planificables;
2. mantener únicamente las ventanas operativas explícitas de participantes, espacios, recursos, composiciones y tareas; no inferir ventanas de unidad desde los horarios del plan humano;
3. mantener composición de unidades;
4. mantener las tres relaciones de acompañamiento;
5. ejecutar Planner Next sin seed humana;
6. producir 53 tareas reales:
   - 19 main;
   - 19 vocal;
   - 9 standalone itinerantes;
   - 6 segmentos anclados;
7. conservar 3 anchors main existentes;
8. no crear tareas ficticias de 45 minutos;
9. completar 12 operaciones itinerantes;
10. producir 375 minutos de uso itinerante;
11. respetar la disponibilidad efectiva de las tres unidades; en A2, al no existir ventana explícita de composición, no añadir una restricción temporal adicional a la jornada y a sus recursos miembros;
12. mantener continuidad del flujo principal;
13. cumplir dependencias y feeds;
14. ser determinista;
15. ser invariante al orden;
16. mantener input inmutable;
17. permanecer dentro del presupuesto configurado.

No se exige identidad exacta del orden cuando existan soluciones equivalentes.

Sí se exige estructura operativa equivalente.

---

# 26. Tests obligatorios

Como mínimo:

## Unidad y ventanas

- composición exacta;
- `unitId` no duplica recursos;
- disponibilidad individual;
- disponibilidad de composición explícita cuando exista;
- ausencia de ventana de composición = sin restricción temporal adicional;
- ventana de tarea;
- recomposición posterior;
- A2: Unidad A y Unidad B pueden solaparse si sus demás autoridades lo permiten;
- A2: Unidad combinada no puede solaparse con A ni con B por recursos compartidos;
- A2: la unidad combinada puede operar por la mañana si sus miembros están libres;
- escenario genérico con ventana de composición explícita rechaza operaciones fuera de dicha ventana.

## Operación anclada

- before–anchor–after exactos;
- anchor conserva identidad y duración;
- segmentos conservan sus propios espacios;
- segmentos pueden coincidir con otros anchors en otro espacio;
- participante ocupado durante toda la operación;
- recursos presentes durante toda la operación;
- transición interna incluida;
- margen externo conservado;
- feeder antes del primer before;
- comida no atraviesa la operación;
- fallo atómico;
- auxiliares no se recolocan.

## Regresión

- ausencia de operaciones ancladas conserva fingerprints históricos;
- OFF, PREFERRED y REQUIRED permanecen congelados;
- escenario standalone permanece estable salvo corrección explícita de ventanas;
- determinismo;
- invariancia al orden;
- Evidence;
- manifest;
- publicación atómica.

---

# 27. Antipatrones prohibidos

Queda prohibido:

- tratar `LOC: PLATÓ` como prueba de que todos los segmentos ocupan `main-stage`;
- ampliar una posición main de 15 a 45 minutos;
- reservar el espacio principal durante before y after sin evidencia;
- contar segmentos como tareas de coach;
- duplicar la unidad como recurso hard;
- ignorar una disponibilidad propia de composición cuando esté explícitamente configurada;
- inventar una ventana de composición a partir de las horas observadas en una planificación humana;
- tratar la ubicación matinal o vespertina del ejemplo humano como una restricción hard;
- utilizar horas humanas como seed;
- crear una única tarea ficticia de duración total;
- aplicar margen genérico entre fases internas declaradas continuas;
- relajar márgenes frente a tareas externas;
- reparar adyacencia al final;
- aumentar presupuesto para compensar un modelo incorrecto;
- aceptar un benchmark parcial;
- publicar Evidence contradictoria.

---

# 28. Criterios de aceptación

La capacidad queda aceptada únicamente cuando:

- la semántica coincide con la operación humana observada;
- la tarea main conserva su slot normal;
- before y after no bloquean falsamente el espacio principal;
- cada segmento ocupa su espacio configurado;
- una ventana de composición se aplica sólo cuando está explícitamente configurada; su ausencia no genera una ventana inferida;
- las tareas poseen ventana efectiva cuando procede;
- los recursos están presentes durante toda la operación;
- el feeder alimenta el primer before;
- el plan completo es hard-valid;
- las 53 tareas se publican;
- las 12 operaciones están completas;
- se respetan 375 minutos itinerantes;
- en A2, las tres composiciones están disponibles durante toda la jornada y los solapes se resuelven por sus recursos miembros;
- no hay tareas ficticias;
- no hay hardcodes de producto;
- el resultado es determinista;
- el input permanece intacto;
- la Evidence es reproducible;
- el benchmark representativo queda superado.

---

# 29. Regla de evolución

La implementación se realizará en unidades lógicas.

Orden recomendado:

1. corregir el corpus y la auditoría según esta especificación;
2. añadir ventanas efectivas de tarea y composición cuando estén configuradas explícitamente, preservando jornada completa cuando no exista ventana propia;
3. corregir el contrato de operación anclada;
4. integrar acompañamiento durante la construcción main sin ampliar su timeline;
5. ejecutar benchmark focal completo;
6. consolidar Evidence y validator;
7. sólo después ampliar a anchors que no sean main.

Ninguna fase posterior se implementará si la anterior no queda demostrada.


---

# PARTE IV — SPEC-09 Políticas de búsqueda, compatibilidad y contabilidad

# OPTIPLAN — ESPECIFICACIÓN OPERATIVA DEL PLANIFICADOR

# SPEC-09 — Políticas de Búsqueda, Compatibilidad y Contabilidad

Versión 1.1

Provenance histórica: antigua SPEC-09 v1.1; su contrato vigente está integrado en esta Fuente y no constituye una Fuente separada.

Actualización: reconciliación explícita de EXACT_CONSTRUCTIVE con equivalencia/simetría sound, dominios analíticos y Best-K de prioridad; prohibición de trasladar trabajo lógico a barridos no contabilizados

Ámbito: Planner Next, planificación inicial, políticas de búsqueda, compatibilidad histórica, presupuestos, memoización, Evidence, benchmarks y regresión

---

# 1. Propósito

Esta especificación define cómo OptiPlan puede utilizar distintas políticas de exploración dentro de una misma arquitectura de planificación sin:

- hardcodear escenarios;
- ocultar trabajo computacional;
- alterar silenciosamente contratos históricos;
- confundir compatibilidad con razonamiento operativo;
- duplicar reglas de dominio;
- publicar resultados parciales;
- aumentar presupuestos para compensar un modelo incorrecto.

La producción tiene que salir.

La política de búsqueda es una configuración explícita del espacio de exploración.

No es:

- una regla de dominio;
- una excepción de producto;
- una detección por nombres o IDs;
- un segundo motor independiente;
- una relajación de restricciones;
- un permiso para utilizar trabajo no contabilizado.

---

# 2. Relación con la documentación oficial

Este bloque integrado debe leerse conjuntamente con:

- Fuente 01 para producto, dominio y operación;
- Fuente 02 para ORC interno;
- Partes I–II de esta Fuente 03 para construcción;
- Fuente 04 para integración/configuración efectiva;
- Fuente 05 para validación/benchmark;
- Fuente 06 para cualquier hecho A2 específico.

Se mantienen plenamente vigentes:

- viabilidad antes que optimización;
- producción primero;
- determinismo;
- simulación antes de consolidación;
- configuración antes que hardcode;
- Evidence obligatoria;
- presupuestos explícitos;
- publicación atómica;
- ausencia de `PartialPlan` como resultado automático final o publicación de producto; el `PartialPlan` interno de la Parte I sigue permitido;
- preservación de `done`, `in_progress` y locks;
- replanificación exclusiva de lo pendiente.

SPEC-06 y SPEC-07 continúan definiendo el método constructivo.

SPEC-08 continúa definiendo las unidades itinerantes y operaciones ancladas.

SPEC-09 regula únicamente:

- qué política de exploración se utiliza;
- cómo se selecciona;
- cómo se contabiliza;
- qué compatibilidad debe preservar;
- qué Evidence debe producir.

---

# 3. Evidencia que origina esta especificación

Los benchmarks y ablaciones han demostrado:

## 3.1 Ruta de compatibilidad histórica

La ruta histórica conserva:

- NEXT-001;
- escenario adversarial;
- NEXT-004 OFF;
- NEXT-004 HIGH;
- NEXT-007;
- NEXT-008;
- invariancia de historia de ramas;
- escenario standalone de 47 tareas;
- fingerprints y horarios congelados.

Con memoización canónica y contabilidad de `cache miss`, esos escenarios permanecen dentro de sus presupuestos configurados.

## 3.2 Límite de la ruta histórica

La ruta histórica no puede resolver de manera presupuestada el benchmark focal completo de operaciones ancladas.

Para Focal A2 combinado necesita aproximadamente:

```text
2.589.312 ramas efectivas
```

frente a:

```text
300.000 ramas configuradas
```

El coste dominante procede de exploraciones futuras únicas, no de repetición memoizable.

## 3.3 Ruta exacta

La ruta exacta basada en:

- matching residual main;
- cierre exacto de feeders;
- propagación de feeders;
- backtracking leaf-first;
- contabilidad única;

produce:

- 53 tareas;
- 19 main;
- 19 vocal;
- 9 operaciones standalone;
- 3 AnchoredAccompaniment;
- 6 segmentos;
- 12 operaciones itinerantes;
- 375 minutos productivos;
- cero operaciones parciales;
- 179.463 ramas;
- determinismo;
- invariancia;
- input inmutable.

## 3.4 Conclusión normativa

Una única política de exploración no preserva simultáneamente:

- todos los contratos históricos;
- el benchmark focal completo de itinerancia/operaciones ancladas integrado en esta Parte;
- el presupuesto oficial;
- la contabilidad íntegra.

Queda justificada una política de búsqueda explícita y configurable.

---

# 4. Contrato de política de búsqueda

Planner Next deberá declarar un contrato equivalente a:

```ts
type PlannerSearchPolicy =
  | "COMPATIBILITY_PRESERVING"
  | "EXACT_CONSTRUCTIVE";
```

La política deberá formar parte de la configuración oficial de ejecución.

No se derivará de:

- IDs de tareas;
- IDs de participantes;
- nombres de escenarios;
- nombres de producción;
- fingerprint esperado;
- presencia o ausencia implícita de un fixture;
- comparación con una planificación humana;
- orden del input.

---

# 5. Resolución explícita

Existirá una función pura equivalente a:

```ts
resolvePlannerSearchPolicy
```

La resolución deberá devolver:

- política solicitada;
- política efectiva;
- origen de la decisión;
- motivo;
- advertencias de compatibilidad;
- capacidades requeridas;
- capacidades soportadas.

Durante la migración, un caller sin política explícita podrá resolverse como:

```text
COMPATIBILITY_PRESERVING
```

para conservar el comportamiento público existente.

Esta resolución implícita deberá:

- quedar registrada en Evidence;
- considerarse temporal;
- no utilizarse en nuevos benchmarks;
- no utilizarse en nuevos tests de capacidades exactas.

Los nuevos callers deberán declarar la política expresamente.

---

# 6. Política COMPATIBILITY_PRESERVING

Su finalidad es preservar contratos históricos ya aceptados.

Debe conservar, cuando corresponda:

- tareas;
- horarios;
- fingerprints;
- Best-K histórico;
- compactación;
- invariancia de regiones aisladas;
- backtracking histórico;
- criterios de calidad previamente congelados.

No podrá conservar trabajo oculto.

Deberá incorporar:

- memoización canónica local a cada ejecución;
- claves completas y deterministas;
- cero estado global mutable;
- contabilización de cada `cache miss`;
- reutilización inmutable en `cache hit`;
- presupuesto único;
- publicación atómica.

Un `cache hit` consume:

```text
0 nuevas ramas
```

Un `cache miss` consume todas las posiciones realmente evaluadas.

La política no podrá utilizarse como ruta autoritativa para una capacidad que declare requerimiento de búsqueda exacta.

Cuando se solicite una capacidad no soportada deberá devolver un motivo explícito equivalente a:

```text
SEARCH_POLICY_CAPABILITY_UNSUPPORTED
```

No deberá intentar compensarla aumentando presupuesto.

---

# 7. Política EXACT_CONSTRUCTIVE

Es la política autoritativa para construcción exacta y nuevas capacidades operativas.

Deberá utilizar:

- construcción provisional;
- matching residual cuando proceda;
- cierre exacto de prerrequisitos;
- propagación de inviabilidad demostrada;
- backtracking leaf-first;
- alternativas diferidas;
- validación final canónica;
- presupuesto único;
- publicación atómica.

Un fallo aproximado o greedy nunca podrá probar inviabilidad.

Sólo podrá podarse cuando exista:

- prueba estructural;
- equivalencia o simetría operacional demostrablemente sound según el método constructivo de SPEC-07;
- exclusión analítica de un dominio por una autoridad hard;
- búsqueda completa del subproblema materialmente distinto;
- restricción hard;
- agotamiento explícito y correctamente clasificado.

Contraer permutaciones nominales que ninguna autoridad activa puede distinguir **no reduce la exactitud**: cambia la representación del espacio para explorar estados operativamente distintos en lugar de identidades equivalentes. Si una ventana, dependencia, recurso, KPI autorizado u otra autoridad rompe la equivalencia, las alternativas vuelven a ser distintas y deben preservarse.

`Best-K` puede ordenar o limitar la frontera activa, pero no eliminar definitivamente alternativas materialmente distintas por quedar fuera de K. Una alternativa exacta sólo desaparece mediante una de las pruebas anteriores.

La política exacta de esta Parte y su benchmark focal completo utilizarán obligatoriamente:

```text
EXACT_CONSTRUCTIVE
```

---

# 8. Compatibilidad de capacidades

Cada capacidad podrá declarar las políticas soportadas.

El contrato deberá ser genérico y configurable.

Ejemplo conceptual:

```ts
interface PlannerCapabilityRequirement {
  capability: string;
  supportedPolicies: PlannerSearchPolicy[];
  requiredPolicy?: PlannerSearchPolicy;
}
```

`AnchoredAccompaniment`, en su versión aceptada por SPEC-08, requiere:

```text
EXACT_CONSTRUCTIVE
```

La ausencia de operaciones ancladas no selecciona automáticamente una política.

El caller sigue siendo responsable de declararla.

---

# 9. Arquitectura compartida

Ambas políticas deberán compartir:

- contratos de dominio;
- preflight;
- validadores;
- `canPlaceTask`;
- materialización de operaciones;
- reglas de dependencias;
- ventanas;
- recursos;
- espacios;
- transiciones;
- comidas;
- locks;
- publicación final;
- fingerprint;
- Evidence base.

No se duplicarán reglas hard.

Las diferencias sólo podrán afectar:

- orden de exploración;
- conservación de alternativas;
- mecanismo de poda;
- backtracking;
- memoización;
- estrategia de cierre;
- asignación interna del presupuesto.

---

# 10. Contabilidad

`branchesExplored` será la autoridad global.

Deberá incluir:

- candidatos main;
- posiciones de feeders;
- matching cuando consuma exploración;
- auxiliares;
- future feasibility;
- operaciones técnicas;
- bloques;
- comidas;
- búsquedas de witness;
- `cache miss`;
- cualquier otro candidato simulado.

No se incluirán como ramas:

- lectura de métricas;
- comparación de resultados ya calculados;
- `cache hit`;
- serialización;
- creación de Evidence;
- retorno recursivo sin nueva evaluación;
- aritmética de intervalos o conjuntos que elimina en bloque una región sin materializar sus candidatos individuales.

La **cardinalidad lógica** de una región eliminada podrá registrarse en Evidence sin convertir cada elemento en una rama. Pero si la implementación recorre o evalúa individualmente esos elementos, existe trabajo real y deberá contabilizarse como corresponde o eliminarse mediante una representación analítica.

Ejemplo obligatorio:

```text
300.000 puntos de grid demostrablemente imposibles
≠ 300.000 ramas si se eliminan con una operación de intervalos
= trabajo individual real si se recorren uno a uno para comprobar la misma prueba
```

Queda prohibido reducir `branchesExplored` desplazando la misma enumeración a un bucle anterior a `consumeBranch`, a una función de diagnóstico o a cualquier scan no reflejado por la contabilidad.

Deberán existir contadores por fase.

La suma de trabajo por fase no podrá superar ni contradecir el contador global.

---

# 11. Motivos de agotamiento

El agotamiento deberá identificar:

- presupuesto global consumido;
- política activa;
- fase que consumió la última rama;
- profundidad;
- trabajo pendiente;
- si existía o no una solución parcial.

El resultado seguirá siendo atómico.

Un `PartialPlan` interno no se publicará como plan automático completo; los artefactos Assisted conservan su contrato propio.

Los antiguos motivos de agotamiento podrán actualizarse cuando se demuestre que dependían de trabajo previamente oculto.

No podrán modificarse únicamente para hacer pasar tests.

Toda actualización deberá:

- estar documentada;
- conservar el presupuesto;
- registrar la fase real;
- añadir regresión específica.

---

# 12. Evidence

La Evidence deberá registrar:

- política solicitada;
- política efectiva;
- origen de selección;
- resolución implícita o explícita;
- capacidades detectadas;
- compatibilidad;
- memoización;
- `cache hits`;
- `cache misses`;
- ramas por fase;
- podas;
- backtracks;
- hojas completas;
- política de cierre de feeders;
- stop reason;
- primera solución;
- fingerprint;
- validación final.

No se afirmará ausencia de trabajo oculto mediante una constante.

Deberá demostrarse mediante contadores y tests.

---

# 13. Tests obligatorios

## Resolución

- política explícita exacta;
- política explícita de compatibilidad;
- resolución temporal de un caller antiguo;
- input inmutable;
- orden independiente;
- rechazo de política incompatible.

## Compatibilidad histórica

- NEXT-001;
- adversarial;
- NEXT-004 OFF;
- NEXT-004 HIGH;
- NEXT-007;
- NEXT-008;
- branch-history control;
- branch-history isolated;
- standalone de 47 tareas;
- fingerprints congelados.

## Política exacta

- matching residual;
- feeder-prefix;
- backtracking leaf-first;
- presupuestos;
- estados triestado;
- ausencia de falsa poda;
- Focal A2 de 53 tareas;
- 12 operaciones;
- 375 minutos.

## Contabilidad

- cada `cache miss` consume trabajo;
- cada `cache hit` consume cero trabajo nuevo;
- no hay doble suma;
- no hay barridos ocultos;
- una región de grid enorme eliminada analíticamente no se enumera punto a punto;
- la Evidence distingue cardinalidad lógica eliminada de candidatos realmente materializados/evaluados;
- mover una comprobación antes de `consumeBranch` no puede disminuir el coste declarado si los candidatos siguen recorriéndose individualmente;
- agotamiento atómico;
- misma entrada y política producen mismo resultado.

## Exactitud y equivalencia

- participantes o tareas operacionalmente equivalentes pueden canonicalizarse sin multiplicar ramas nominales;
- una autoridad activa que rompa la equivalencia obliga a preservar las alternativas distintas;
- `Best-K` ordena la frontera exacta, no actúa como poda irreversible sin prueba;
- una permutación equivalente del input conserva el mismo espacio estructural canónico y determinismo.

## Separación

El mismo problema ejecutado con dos políticas podrá producir distinta exploración.

La Evidence deberá explicar la diferencia.

No se exige el mismo fingerprint entre políticas.

Sí se exige:

- hard-valid;
- determinismo;
- presupuesto;
- semántica de dominio;
- publicación atómica.

---

# 14. Benchmarks

Cada benchmark deberá declarar expresamente:

```text
searchPolicy
```

No se aceptará un benchmark cuyo resultado dependa de una resolución implícita.

El benchmark deberá incluir:

- política;
- presupuesto;
- ramas por fase;
- cache hits/misses;
- backtracks;
- hojas;
- stop reason;
- resultado operativo;
- fingerprint;
- determinismo;
- invariancia;
- input inmutable.

---

# 15. Antipatrones prohibidos

Queda prohibido:

- seleccionar política por IDs;
- seleccionar política por nombre de benchmark;
- detectar Focal A2;
- inferir política únicamente por `AnchoredAccompaniment`;
- ocultar trabajo para preservar fingerprints;
- aumentar presupuesto para mantener una ruta incorrecta;
- utilizar greedy como prueba negativa;
- eliminar alternativas exactas necesarias;
- confundir identidad distinta con estado operativo distinto cuando existe equivalencia demostrable;
- usar `Best-K` como corte irreversible de alternativas materialmente distintas;
- recorrer candidatos analíticamente eliminables fuera del ledger para aparentar una reducción de ramas;
- compartir caché entre ejecuciones;
- cambiar fingerprints sin Evidence;
- duplicar validadores;
- mantener dos implementaciones de reglas hard;
- publicar plan parcial al agotar presupuesto.

---

# 16. Orden de implementación

La implementación se realizará mediante unidades lógicas:

1. contrato y resolución de política;
2. extracción de la política de compatibilidad;
3. memoización canónica local;
4. contabilidad completa de compatibilidad;
5. conservación de fingerprints;
6. integración de la política exacta existente;
7. selección explícita en tests y benchmarks;
8. corrección documentada de stop reasons obsoletos;
9. suite completa;
10. Evidence y README.

No se mezclarán todas las fases en una sola iteración.

---

# 17. Criterios de aceptación

El contrato de políticas de búsqueda, compatibilidad y contabilidad integrado en esta Parte se considera satisfecho cuando:

- la política es explícita y configurable;
- no existen hardcodes de escenarios;
- las reglas de dominio son compartidas;
- la compatibilidad conserva fingerprints históricos;
- la compatibilidad no contiene trabajo oculto;
- el standalone queda dentro de 300.000;
- la política exacta conserva Focal A2 en 53 tareas;
- se producen 12 operaciones y 375 minutos;
- no se aumentan presupuestos;
- toda la suite queda verde;
- los stop reasons representan la fase real;
- ningún `PartialPlan` interno se publica como resultado automático completo; esta cláusula no impide `ScopeProposal`, `Draft`, `WorkingPlan` o `Stage` parciales respecto al día en Assisted;
- el resultado es determinista;
- el input permanece intacto;
- la Evidence explica la política y el coste real.

Compilar no constituye aceptación.

Conservar fingerprints ocultando trabajo no constituye compatibilidad válida.

Resolver Focal A2 rompiendo contratos históricos no constituye evolución aceptable.

La producción tiene que salir.
