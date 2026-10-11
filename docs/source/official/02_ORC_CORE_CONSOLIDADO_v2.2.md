# OPTIPLAN — ORC CORE CONSOLIDADO

**Versión:** 2.2  
**Fecha:** 19 de septiembre de 2026  
**Estado:** Fuente oficial consolidada  
**Absorbe:** Operational Reasoning Core + SPEC-00, SPEC-01, SPEC-02, SPEC-03 y SPEC-04.

## Frontera con Assisted Planning

El ORC conserva su semántica interna de estados, validación de candidatos automáticos, evaluación y commit/reject. `WorkingPlan`, `Draft`, `Stage`, `AutomaticProtection` y `AcceptedException` viven en la capa de producto Assisted y no se fuerzan dentro de `OperationalState`.

Un estado humano con una excepción aceptada no se presenta falsamente como `VALID` del ORC. La capa de producto puede conservarlo como WorkingPlan/OfficialPlan con `hardValid=false` y Evidence de aceptación.

Los capítulos históricos siguientes se incorporan como secciones internas de esta única Fuente. Ya no deben cargarse por separado.


---

## 0. Límite de autoridad del ORC

Este documento gobierna **estados y decisiones internas del solver**, no el workflow de producto. `OperationalState`, `COMMIT/REJECT` y “consolidación” aquí no significan `WorkingPlan`, `Draft`, `Stage`, `AcceptedException`, escritura en `daily_tasks` ni publicación de `OfficialPlan`.

En `IMPROVEMENT`, un commit interno exige mejora objetiva según el evaluador. En construcción Assisted/DAY, el criterio de avance es completar correctamente el scope/estructura conforme a 03; no se exige que cada paso constructivo sea “mejor” que un planning ya completo que todavía no existe.

# PARTE I — Arquitectura conceptual ORC

# Operational Reasoning Core (ORC). Architecture Specification v1.0

## Arquitectura definitiva

---

¡ATENCIÓN!

Este documento describe la arquitectura del ORC. No prescribe estructuras de código, carpetas, clases o tecnologías concretas. Las decisiones de implementación pertenecen a las ORC Implementation Specifications.

---

# PARTE I — VISIÓN, PRINCIPIOS Y MODELO OPERATIVO

## 1. Propósito

El Motor V4 PRO es un sistema de razonamiento operativo diseñado para construir, mejorar y mantener planificaciones de producción audiovisual complejas.

Su objetivo no es simplemente generar un calendario válido.

Su objetivo es producir el mejor Estado Operativo posible para una jornada real de producción.

Una planificación válida no es necesariamente una buena planificación.

Una planificación puede cumplir todas las restricciones técnicas y, aun así, ser mala desde el punto de vista operativo:

* talentos esperando demasiado;
* coaches fragmentados;
* recursos críticos saturados;
* plató principal detenido;
* jornada innecesariamente larga;
* poca capacidad de reacción ante retrasos;
* cambios locales que obligan a replanificar media jornada.

El Motor V4 PRO existe para evitar ese tipo de resultados.

No busca únicamente una solución que funcione.

Busca una solución que tenga sentido para producción.

---

## 2. Lección principal del desarrollo V3/V4

El aprendizaje más importante obtenido durante el desarrollo del Motor V3 y las primeras iteraciones del V4 es el siguiente:

> El problema principal no era evaluar mal los candidatos.
> El problema principal era no generar candidatos suficientemente buenos.

Durante las iteraciones del V4 se construyeron sistemas de benchmark, evidence report, validación, comparación con V3, diagnóstico de gaps, resolución de recursos `ANY_OF` y análisis de blockers.

Estas herramientas revelaron que el motor podía detectar problemas reales, pero a menudo no sabía construir el conjunto correcto de alternativas para resolverlos.

El fallo no estaba sólo en la calidad del evaluador.

Estaba en la exploración.

Un motor puede tener un evaluador excelente, pero si nunca genera el candidato correcto, jamás alcanzará una buena solución.

Por tanto, el corazón del Motor V4 PRO no será únicamente un Reasoning Engine.

Será un sistema completo de:

```text
Comprensión del estado
        ↓
Detección de oportunidades
        ↓
Construcción del espacio de búsqueda
        ↓
Generación inteligente de candidatos
        ↓
Exploración acotada
        ↓
Evaluación multicriterio
        ↓
Consolidación
        ↓
Aprendizaje intraejecución
```

Esta es la diferencia esencial respecto a los intentos anteriores.

---

## 3. Cambio de paradigma

Los motores clásicos de planificación suelen pensar así:

```text
Seleccionar tarea
        ↓
Buscar hueco
        ↓
Colocar
        ↓
Validar conflictos
        ↓
Reparar
```

Ese enfoque es insuficiente para una producción audiovisual compleja.

El Motor V4 PRO debe pensar así:

```text
Observar el Estado Operativo
        ↓
Detectar dónde existe oportunidad o riesgo
        ↓
Construir un vecindario de alternativas relevantes
        ↓
Generar candidatos diversos y viables
        ↓
Evaluar impacto global
        ↓
En IMPROVEMENT: consolidar sólo si mejora; en construcción: consolidar sólo un avance válido del scope
```

La diferencia no es cosmética.

El motor no debe empezar preguntando:

> ¿Qué tarea puedo mover?

Debe empezar preguntando:

> ¿Dónde merece la pena invertir razonamiento?

---

## 4. Principio central

El principio central del Motor V4 PRO es:

> El motor no busca soluciones directamente.
> Busca oportunidades de mejora y explora candidatos prometedores dentro de ellas.

Esto implica tres consecuencias:

1. El motor no explora todo el espacio posible.
2. El motor no se limita al primer movimiento válido.
3. El motor invierte su presupuesto de cálculo donde existe mayor potencial operativo.

La inteligencia del sistema no consiste en probar muchas cosas.

Consiste en saber qué merece la pena probar.

---

## 5. Estado Operativo

La unidad fundamental del motor es el Estado Operativo.

Un Estado Operativo representa la situación completa de una producción en un instante determinado.

Incluye, como mínimo:

* planificación actual;
* tareas planificadas y pendientes;
* recursos asignados;
* espacios ocupados;
* dependencias;
* disponibilidad restante;
* tensiones;
* conflictos;
* continuidad;
* permanencias;
* makespan;
* compactación;
* robustez;
* estabilidad;
* libertad futura;
* configuración activa;
* restricciones duras y blandas.

La planificación es sólo una parte del Estado Operativo.

El motor no compara tareas.

Compara Estados Operativos completos.

---

## 6. Estado Cognitivo

Además del Estado Operativo, el motor mantiene un Estado Cognitivo.

El Estado Cognitivo no describe la producción.

Describe lo que el motor sabe, cree, ha intentado y ha aprendido durante una sesión de planificación.

Incluye:

* oportunidades detectadas;
* objetivos activos;
* hipótesis generadas;
* candidatos explorados;
* candidatos descartados;
* causas detectadas;
* blockers recurrentes;
* conocimiento temporal;
* nivel de confianza;
* memoria de exploración;
* evidencia acumulada.

El Estado Cognitivo existe sólo durante la ejecución.

No modifica permanentemente el comportamiento del motor.

Su función es evitar exploraciones redundantes y orientar mejor las siguientes decisiones.

---

## 7. Valor Operativo

Todo Estado Operativo posee un Valor Operativo.

El Valor Operativo representa la calidad global de una planificación desde el punto de vista de producción.

No es una única métrica.

Es una evaluación multicriterio.

Debe considerar, como mínimo:

* cumplimiento de restricciones duras;
* continuidad del flujo principal;
* duración total de la jornada;
* permanencia de talentos;
* compactación de coaches y recursos;
* presión de recursos críticos;
* robustez ante pequeños retrasos;
* estabilidad frente a cambios;
* libertad futura;
* explicabilidad.

El motor no debe optimizar únicamente makespan.

Tampoco debe optimizar únicamente permanencia.

Debe optimizar el equilibrio operativo global.

---

## 8. Restricciones y calidad

El motor debe separar estrictamente dos conceptos.

### Restricciones duras

Definen lo permitido.

Si se incumplen, el Estado Operativo es inválido.

Ejemplos:

* solapamiento imposible de un recurso;
* dependencia incumplida;
* tarea fuera de disponibilidad;
* espacio ocupado por dos tareas incompatibles;
* lock manual violado;
* tarea `in_progress` o `done` modificada indebidamente.

Un estado inválido nunca se evalúa por calidad.

Se descarta.

### Calidad operativa

Define lo deseable.

Ejemplos:

* terminar antes;
* reducir esperas;
* compactar agendas;
* cerrar huecos;
* proteger continuidad;
* conservar margen;
* reducir fragmentación.

La calidad sólo se evalúa después de comprobar la validez.

---

## 9. Prioridades operativas

Las prioridades deben ser configurables.

El núcleo nunca debe hardcodear nombres de espacios, recursos, programas, coaches o tipos de tarea.

No obstante, el motor deberá soportar una prioridad especial:

### Flujo principal continuo

La aplicación podrá configurar un único espacio o flujo como prioridad máxima de continuidad.

Ese flujo debe permanecer activo sin huecos salvo imposibilidad demostrada.

Puede haber otros espacios o recursos importantes, pero sólo uno podrá tener este nivel máximo de criticidad.

Esta regla existe por una razón operativa: si todo es máximo, nada es máximo.

---

## 10. Principios no negociables

El Motor V4 PRO deberá respetar siempre los siguientes principios.

### 10.1 Viabilidad antes que optimización

Ninguna mejora de calidad puede justificar una violación de restricciones duras.

### 10.2 Lo ejecutado no se toca

Las tareas `in_progress` y `done` no deben modificarse.

La replanificación actúa sobre lo pendiente.

### 10.3 El humano decide, el motor revalida

Cualquier edición manual debe crear un nuevo estado que el motor revalida.

El motor no debe asumir que una decisión humana mantiene la viabilidad.

### 10.4 Locks explícitos

El ORC respeta los locks explícitos recibidos en su entrada. Una edición humana no se transforma automáticamente en lock: la capa Assisted decide si existe `AutomaticProtection`, un lock explícito o una nueva decisión editable.

### 10.5 Configuración sobre hardcode

El dominio se configura.

No se programa.

### 10.6 Determinismo

Misma entrada, misma configuración y mismas restricciones deben producir el mismo resultado.

No se permite aleatoriedad.

### 10.7 Simulación antes de consolidación

Ninguna transformación modifica directamente el `OperationalState` interno vigente de la ejecución.

Todo cambio se simula antes.

### 10.8 Evidencia obligatoria

Toda decisión importante debe dejar evidencia.

El motor debe poder explicar qué intentó, qué rechazó y por qué aceptó una solución.

### 10.9 Exploración acotada

El motor no debe intentar fuerza bruta.

Debe explorar de forma inteligente, limitada y priorizada.

### 10.10 Producción real por encima de elegancia matemática

Si una solución es matemáticamente elegante pero operativamente mala, debe rechazarse.

---

## 11. Definición oficial

El ORC es un sistema determinista de razonamiento operativo que mantiene un Estado Operativo, detecta oportunidades, construye un espacio de búsqueda acotado, genera candidatos, simula y valida. En `IMPROVEMENT` consolida internamente sólo mejoras objetivas; en construcción actúa conforme al método constructivo de 03 y puede consolidar internamente avances de completitud que formen parte de una solución válida del scope.

La clave de esta definición es que el motor no sólo evalúa.

Explora.

Y la calidad de esa exploración determina la calidad final del planning.

---

## 12. Criterio de éxito

El Motor V4 PRO será exitoso cuando, ante una jornada compleja, consiga:

* cumplir todas las restricciones duras;
* proteger el flujo principal configurado;
* terminar la jornada antes o igual que V3;
* reducir permanencias cuando sea posible;
* compactar recursos sin bloquear el día;
* mantener robustez operativa;
* explicar sus decisiones;
* superar consistentemente al V3 en escenarios representativos;
* hacerlo dentro de un presupuesto temporal razonable.

El objetivo no es construir un sistema conceptualmente brillante.

El objetivo es construir un motor que planifique mejor que V3 y mejor que un humano medio en condiciones reales de producción.

Si no mejora el resultado operativo real, la arquitectura no habrá cumplido su función.

# PARTE II — EL NÚCLEO DE EXPLORACIÓN

## 13. El verdadero problema

La calidad del motor no depende principalmente del evaluador.

Depende de la calidad del espacio de búsqueda que construye.

El objetivo del motor no es explorar todas las soluciones posibles.

Es explorar únicamente aquellas regiones donde exista una probabilidad razonable de mejorar el Valor Operativo.

El presupuesto de razonamiento siempre es limitado.

La exploración debe ser inteligente.

---

# 14. Filosofía de exploración

El motor nunca busca directamente una planificación mejor.

Busca oportunidades de mejora.

Cada oportunidad genera un espacio local de búsqueda.

El conjunto de todos esos espacios constituye el Espacio de Exploración de la iteración.

El motor nunca explora el universo completo.

Explora únicamente vecindarios prometedores.

---

# 15. Oportunidades

Una oportunidad representa una situación donde existe potencial de mejora.

Ejemplos:

* hueco en el flujo principal;
* talento con permanencia excesiva;
* coach fragmentado;
* recurso crítico saturado;
* cadena con poca robustez;
* makespan excesivo;
* recurso ANY_OF mal resuelto;
* cuello de botella;
* espacio infrautilizado.

Una oportunidad no propone una solución.

Únicamente identifica dónde merece la pena invertir razonamiento.

---

# 16. Priorización de oportunidades

No todas las oportunidades tienen el mismo valor.

Cada una recibe una prioridad dinámica calculada a partir de:

* impacto operativo esperado;
* criticidad;
* urgencia;
* dependencia respecto a otras oportunidades;
* coste estimado de exploración;
* conocimiento obtenido durante la sesión;
* probabilidad estimada de éxito.

El motor dedica primero su presupuesto a las oportunidades más prometedoras.

---

# 17. Construcción del espacio de búsqueda

Seleccionada una oportunidad, el motor construye un espacio local de búsqueda.

Este espacio está formado por todas las transformaciones plausibles relacionadas con dicha oportunidad.

No se generan todavía candidatos completos.

Se generan posibilidades.

Cada espacio debe permanecer pequeño, relevante y acotado.

---

# 18. Search & Exploration Engine (SEE)

El Search & Exploration Engine (SEE) constituye el núcleo cognitivo del Operational Reasoning Core.

Su responsabilidad consiste en comprender el Estado Operativo, construir espacios de búsqueda locales, generar candidatos diversos y seleccionar cuáles merecen ser simulados.

No genera candidatos aleatorios.

No explora todo el espacio de soluciones.

Construye un conjunto reducido de candidatos de alta calidad.

Es el componente que más influye en la calidad final del ORC.
---

# 19. Generación de candidatos

Cada candidato representa un Estado Operativo potencial.

Los candidatos deben presentar diversidad suficiente.

No tiene sentido generar diez variantes prácticamente idénticas.

El objetivo consiste en cubrir distintas alternativas plausibles.

La diversidad es un criterio de calidad.

---

# 20. Filtrado

Antes de simular un candidato el motor realiza un filtrado rápido.

Descarta inmediatamente candidatos que:

* incumplen restricciones evidentes;
* repiten estados ya explorados;
* poseen una expectativa muy baja de mejora;
* requieren un coste desproporcionado;
* contradicen locks activos.

La simulación nunca debe utilizarse como filtro primario.

---

# 21. Exploración

Los candidatos supervivientes pasan a exploración.

La exploración no sigue un orden fijo.

El motor selecciona primero aquellos candidatos cuya relación entre impacto esperado y coste de exploración resulte más favorable.

El orden de exploración forma parte del razonamiento.

---

# 22. Aprendizaje durante la exploración

Mientras explora candidatos, el motor aprende.

Por ejemplo:

* regiones poco prometedoras;
* recursos especialmente conflictivos;
* transformaciones ineficaces;
* combinaciones que producen mejoras repetidamente.

Este conocimiento modifica únicamente la sesión activa.

Su objetivo es evitar exploraciones redundantes.

---

# 23. Poda

La exploración debe detenerse cuando continuar deja de aportar valor.

El motor podrá abandonar una rama cuando:

* la mejora potencial sea insuficiente;
* el coste restante resulte excesivo;
* la región ya haya sido suficientemente explorada;
* existan oportunidades claramente más prometedoras.

La poda constituye una decisión estratégica.

No un fallo.

---

# 24. Economía del razonamiento

El tiempo de cálculo es un recurso limitado.

Cada milisegundo invertido explorando una región implica dejar de explorar otra.

Por tanto, el motor debe gestionar explícitamente un presupuesto de razonamiento.

La pregunta constante es:

> ¿Dónde produce mayor retorno el siguiente segundo de cálculo?

---

# 25. Principio de exploración inteligente

La inteligencia del Motor V4 PRO no reside en evaluar millones de soluciones.

Reside en construir un pequeño conjunto de candidatos extraordinariamente buenos.

El objetivo del motor no es buscar mucho.

Es buscar donde realmente merece la pena.

# PARTE III — EL MOTOR COGNITIVO

## 26. Principio fundamental

El Motor Cognitivo es el cerebro del sistema.

Su responsabilidad no consiste en construir planificaciones.

Su responsabilidad consiste en comprender el Estado Operativo y decidir qué problema merece resolverse a continuación.

El razonamiento siempre gira alrededor de problemas operativos, no de tareas individuales.

---

# 27. Ciclo cognitivo

Cada iteración sigue siempre el mismo proceso:

```text
Estado Operativo

↓

Comprender

↓

Detectar oportunidades

↓

Seleccionar una oportunidad

↓

Diagnosticar

↓

Construir espacio de búsqueda

↓

Search & Exploration Engine (SEE)

↓

Explorar candidatos

↓

Evaluar

↓

Consolidar

↓

Aprender

↓

Nuevo Estado Operativo
```

Este ciclo constituye el algoritmo conceptual del motor.

---

# 28. Comprensión

La comprensión transforma datos en conocimiento operativo.

No responde a preguntas como:

* ¿Qué tarea empieza a las 11:00?

Responde a preguntas como:

* ¿Qué recurso está bajo presión?
* ¿Qué cadena es frágil?
* ¿Qué talento corre riesgo?
* ¿Dónde existe margen?
* ¿Qué continuidad peligra?

La comprensión es global.

Nunca local.

---

# 29. Diagnóstico

Toda oportunidad debe tener una causa.

El diagnóstico intenta responder:

> ¿Qué está provocando este problema?

No basta con detectar un hueco.

Debe comprender por qué existe.

Sólo entonces podrá decidir cómo explorarlo.

---

# 30. Estrategia antes que movimiento

El motor nunca decide directamente mover una tarea.

Primero decide una estrategia.

Ejemplos:

* adelantar una cadena;
* compactar una agenda;
* reducir permanencia;
* aliviar presión;
* cerrar un hueco;
* intercambiar recursos;
* redistribuir carga.

Después buscará candidatos compatibles con esa estrategia.

---

# 31. Transformaciones operativas

Una estrategia puede materializarse mediante distintas transformaciones.

Por ejemplo:

"Cerrar un hueco" puede resolverse mediante:

* adelantar una tarea;
* retrasar otra;
* mover una cadena completa;
* cambiar un recurso;
* cambiar una elección ANY_OF;
* reorganizar una secuencia.

El razonamiento trabaja con estrategias.

Las transformaciones implementan dichas estrategias.

---

# 32. Operaciones elementales

Las transformaciones se implementan mediante operaciones elementales.

Entre ellas:

* mover tarea;
* mover cadena;
* intercambiar tareas;
* insertar;
* eliminar espera;
* reasignar recurso;
* resolver ANY_OF;
* modificar orden.

Estas operaciones no contienen inteligencia.

Son herramientas.

---

# 33. Resolución inteligente de recursos

Los recursos alternativos (`ANY_OF`) no deben resolverse de forma arbitraria.

La elección deberá favorecer el Valor Operativo Global.

Como criterio general, el motor tenderá a elegir aquellos recursos que:

* reduzcan presión futura;
* preserven recursos escasos;
* aumenten la robustez;
* disminuyan conflictos;
* mantengan libertad futura.

La elección de un recurso forma parte del razonamiento.

No de la validación.

---

# 34. Memoria de exploración

El motor mantiene memoria durante la sesión.

Entre otros elementos:

* oportunidades ya exploradas;
* candidatos rechazados;
* regiones agotadas;
* transformaciones eficaces;
* transformaciones ineficaces.

El objetivo es evitar repetir trabajo.

---

# 35. Aprendizaje intraejecución

Cada iteración modifica únicamente el Estado Cognitivo.

El motor aprende:

* dónde merece la pena explorar;
* qué transformaciones producen mejores resultados;
* qué regiones generan bloqueos;
* qué candidatos suelen fracasar.

Este aprendizaje desaparece al finalizar la sesión.

No constituye aprendizaje permanente.

---

# 36. Criterio de parada

El razonamiento termina cuando ocurre alguna de las siguientes situaciones:

* no quedan oportunidades relevantes;
* no aparecen candidatos mejores;
* el presupuesto se ha agotado;
* la mejora esperada es despreciable;
* el Estado Operativo es suficientemente estable.

El motor no persigue la perfección absoluta.

Persigue el mejor equilibrio entre calidad y coste computacional.

---

# 37. Principio de inteligencia operativa

El Motor Cognitivo no es inteligente porque conozca muchas transformaciones.

Es inteligente porque sabe:

* qué problema resolver;
* cuándo merece la pena hacerlo;
* cuánto esfuerzo invertir;
* cuándo dejar de explorar.

Ésta es la diferencia entre un optimizador clásico y un verdadero sistema de razonamiento operativo.

# PARTE IV — PIPELINE DE EJECUCIÓN

## 38. Filosofía

El motor no modifica directamente una planificación.

Construye continuamente nuevos Estados Operativos candidatos y decide si alguno merece sustituir al estado actual.

Toda ejecución consiste en repetir este proceso.

No existen atajos.

---

# 39. Pipeline completo

Toda iteración sigue exactamente el siguiente flujo.

```text
Estado Operativo

↓

Comprensión

↓

Detección de oportunidades

↓

Priorización

↓

Construcción del espacio de búsqueda

↓

Search & Exploration Engine (SEE)

↓

Filtrado rápido

↓

Exploración

↓

Simulación

↓

Validación

↓

Evaluación multicriterio

↓

Consolidación

↓

Actualización del Estado Cognitivo

↓

Siguiente iteración
```

Éste constituye el pipeline oficial del Motor V4 PRO.

---

# 40. Simulación

Toda transformación se ejecuta inicialmente sobre una copia del Estado Operativo.

Nunca sobre el `OperationalState` interno vigente.

La simulación genera un nuevo Estado Operativo candidato.

Ese candidato es completamente independiente.

Mientras no exista consolidación ORC, el `OperationalState` interno vigente permanece intacto; esto no describe Stage ni OfficialPlan.

---

# 41. Validación

Antes de evaluar un candidato se verifica su viabilidad.

Como mínimo deberán comprobarse:

* restricciones duras;
* disponibilidad de recursos;
* precedencias;
* dependencias;
* conflictos temporales;
* locks activos;
* integridad del Estado Operativo.

Los candidatos inválidos se descartan inmediatamente.

No llegan al evaluador.

---

# 42. Evaluación multicriterio

Todos los candidatos válidos se comparan utilizando el Valor Operativo.

La evaluación considera simultáneamente:

* continuidad del flujo principal;
* makespan;
* permanencia;
* compactación;
* presión sobre recursos;
* robustez;
* estabilidad;
* libertad futura;
* calidad global.

El evaluador nunca conoce:

* estrategias;
* oportunidades;
* candidatos descartados;
* razonamiento.

Sólo compara Estados Operativos.

---

# 43. Consolidación

Finalizada la evaluación existen únicamente dos posibilidades.

### El candidato satisface el criterio del modo interno

En `IMPROVEMENT`, debe mejorar el OperationalState. En construcción, debe constituir un avance constructivo válido conforme a 03. En ambos casos sustituye al **OperationalState interno** vigente de esa ejecución; no crea un Stage ni un OfficialPlan.

### El candidato no satisface el criterio

Se rechaza.

El `COMMIT/REJECT` de una iteración ORC es atómico respecto al OperationalState interno. Esta atomicidad no prohíbe `ScopeProposal`, `Draft` o `Stage` que sean parciales respecto al día completo.

---

# 44. Evidencia

Toda iteración genera evidencia.

Como mínimo deberá registrarse:

* oportunidad seleccionada;
* diagnóstico;
* estrategia utilizada;
* candidatos generados;
* candidatos descartados;
* candidato consolidado;
* motivos del descarte;
* Valor Operativo inicial;
* Valor Operativo final;
* tiempo empleado.

La evidencia no es una herramienta de depuración.

Forma parte del funcionamiento normal del motor.

---

# 45. Replanificación

Una replanificación no constituye un algoritmo distinto.

Es exactamente el mismo pipeline aplicado sobre un Estado Operativo parcialmente bloqueado.

La diferencia es que:

* existen tareas protegidas;
* existen locks activos;
* existen decisiones humanas previas.

El razonamiento permanece idéntico.

Únicamente cambia el espacio de búsqueda disponible.

---

# 46. Determinismo

Con:

* mismo Estado Operativo;
* misma configuración;
* mismas restricciones;
* mismo presupuesto de razonamiento;

el motor deberá producir exactamente el mismo resultado.

No se permite ningún comportamiento aleatorio.

Esto garantiza:

* reproducibilidad;
* benchmarking fiable;
* depuración sencilla;
* confianza del usuario.

---

# 47. Observabilidad

En cualquier momento deberá poder inspeccionarse:

### Estado Operativo

La realidad actual de la producción.

### Estado Cognitivo

El razonamiento del motor.

### Espacios de búsqueda

Qué oportunidades se están explorando.

### Search & Exploration Engine (SEE)

Qué candidatos se han generado.

### Pipeline

En qué fase se encuentra la iteración.

### Evidencia

Por qué se ha tomado cada decisión.

Nada del razonamiento debe permanecer oculto.

---

# 48. Arquitectura de referencia

Toda implementación deberá contener, como mínimo, los siguientes componentes conceptuales:

* Estado Operativo
* Estado Cognitivo
* Detector de oportunidades
* Constructor del espacio de búsqueda
* Search & Exploration Engine (SEE)
* Transformaciones operativas
* Simulador
* Validador
* Evaluador multicriterio
* Consolidador
* Generador de evidencia

La implementación podrá utilizar clases, funciones, servicios o cualquier otra organización interna.

Lo importante es respetar las responsabilidades.

---

# 49. Definición final

El Motor V4 PRO puede resumirse mediante una única frase.

> Comprender el Estado Operativo, construir/explorar candidatos válidos y aplicar el criterio del modo: avance constructivo válido en construcción; mejora objetiva en IMPROVEMENT. La aceptación de producto permanece fuera del ORC.

Ésta constituye la definición oficial del motor.

Todo desarrollo futuro deberá ser coherente con este principio.


# PARTE V — GOBIERNO DEL MOTOR Y REGLAS DE IMPLEMENTACIÓN

## 50. Propósito

Este documento no termina definiendo cómo funciona el motor.

Termina definiendo cómo debe evolucionar.

El objetivo es garantizar que cualquier modificación futura mantenga la coherencia arquitectónica del Motor V4 PRO.

Toda implementación, refactorización o nueva capacidad deberá respetar las reglas descritas en este capítulo.

---

# 51. Principio de evolución

El motor evolucionará mediante incorporación de capacidades.

Nunca mediante acumulación de excepciones.

Cada nueva funcionalidad deberá responder a una de estas preguntas:

* ¿permite comprender mejor el Estado Operativo?
* ¿permite detectar mejores oportunidades?
* ¿permite construir un espacio de búsqueda mejor?
* ¿permite generar mejores candidatos?
* ¿permite evaluar mejor?
* ¿permite explicar mejor?

Si la respuesta es negativa, probablemente no pertenece al núcleo del motor.

---

# 52. Qué nunca debe hacerse

Nunca deberá aceptarse una implementación que:

* hardcodee reglas del dominio;
* introduzca aleatoriedad;
* degrade la explicabilidad;
* mezcle razonamiento con ejecución;
* modifique directamente el Estado Operativo;
* evite la simulación;
* introduzca dependencias circulares;
* convierta el evaluador en un razonador;
* convierta las transformaciones en heurísticas inteligentes;
* haga crecer el espacio de búsqueda sin control.

Estos principios tienen prioridad sobre cualquier optimización local.

---

# 53. Qué sí debe fomentarse

Siempre será bienvenida cualquier mejora que:

* reduzca el espacio de búsqueda;
* mejore la calidad de los candidatos;
* aumente la diversidad de exploración;
* reduzca simulaciones innecesarias;
* mejore la comprensión del estado;
* detecte antes oportunidades relevantes;
* incremente la robustez;
* reduzca el tiempo de cálculo;
* genere mejor evidencia.

El objetivo nunca es escribir más código.

Es aumentar la inteligencia efectiva del motor.

---

# 54. Incorporación de nuevas capacidades

Toda nueva capacidad seguirá siempre el mismo ciclo.

```text
Problema observado

↓

Hipótesis de mejora

↓

Diseño conceptual

↓

Implementación

↓

Benchmark

↓

Evidence Report

↓

Aceptación o rechazo
```

Ninguna mejora llegará al núcleo únicamente porque "parece razonable".

Toda mejora deberá demostrarlo.

---

# 55. Benchmark como juez

Las decisiones arquitectónicas no se validan mediante opiniones.

Se validan mediante escenarios representativos.

Toda nueva capacidad deberá ejecutarse contra un conjunto estable de benchmarks.

Como mínimo deberá demostrar que:

* no rompe restricciones;
* mantiene determinismo;
* no degrada rendimiento de forma injustificada;
* mejora algún aspecto operativo real.

Si no existe evidencia objetiva, la mejora no se incorporará.

---

# 56. Evidence Report

Toda capacidad nueva deberá explicar:

* qué problema intentaba resolver;
* qué oportunidades detectó;
* qué candidatos generó;
* cuáles descartó;
* cuál consolidó;
* qué mejoró;
* qué empeoró;
* por qué merece permanecer.

La evidencia forma parte del producto.

No del proceso de desarrollo.

---

# 57. Criterios para aceptar un Pull Request

Un cambio en el núcleo del motor sólo podrá aceptarse si cumple simultáneamente todos los siguientes criterios.

### Correctitud

No rompe restricciones.

### Determinismo

Produce siempre el mismo resultado.

### Explicabilidad

Puede justificar sus decisiones.

### Evidencia

Dispone de benchmark y Evidence Report.

### Arquitectura

Respeta las responsabilidades definidas en este documento.

### Rendimiento

El coste computacional resulta proporcional a la mejora obtenida.

---

# 58. Criterios para rechazar un Pull Request

Un cambio deberá rechazarse cuando:

* aumenta el espacio de búsqueda sin mejorar resultados;
* introduce heurísticas difíciles de justificar;
* degrada el razonamiento;
* aumenta complejidad sin aportar capacidad nueva;
* rompe separación de responsabilidades;
* mejora un benchmark aislado empeorando el comportamiento general.

La prioridad es el motor.

No una métrica concreta.

---

# 59. Evolución del razonamiento

El razonamiento deberá evolucionar principalmente en cuatro áreas.

## Comprensión

Detectar mejor los problemas.

## Exploración

Elegir mejor dónde invertir cálculo.

## Search & Exploration Engine (SEE)

Comprender mejor el estado, construir mejores espacios de búsqueda y generar candidatos cada vez más prometedores.

## Evaluación

Comparar con mayor precisión Estados Operativos.

Toda mejora futura debería poder clasificarse dentro de una de estas cuatro categorías.

---

# 60. Definición de éxito del proyecto

El proyecto no se considerará exitoso porque el motor utilice técnicas sofisticadas.

Se considerará exitoso cuando, de forma consistente, consiga planificar jornadas reales mejor que:

* el Motor V3;
* un conjunto de heurísticas simples;
* un planificador humano medio.

Y lo haga:

* respetando todas las restricciones;
* explicando sus decisiones;
* manteniendo tiempos compatibles con producción.

La sofisticación nunca constituye un objetivo.

La calidad operativa sí.

---

# 61. Visión a largo plazo

El Motor V4 PRO no debe entenderse como una versión del planificador.

Debe entenderse como el núcleo permanente de razonamiento de OptiPlan.

Los algoritmos evolucionarán.

Las estrategias cambiarán.

La tecnología podrá reemplazarse.

Pero los principios definidos en este documento deberán permanecer estables.

Ellos constituyen la identidad del motor.

---

# 62. Conclusión

El desarrollo del Motor V4 PRO ha demostrado una lección fundamental.

La diferencia entre un planificador convencional y un sistema de razonamiento operativo no reside en cómo mueve tareas.

Reside en cómo decide dónde merece la pena pensar.

Toda la arquitectura presentada en este documento puede resumirse mediante una única idea.

> Comprender antes de explorar.
> Explorar antes de transformar.
> Transformar antes de evaluar.
> Evaluar antes de consolidar.
> Aprender antes de volver a empezar.

Éste es el ciclo que deberá guiar todas las implementaciones presentes y futuras del Motor V4 PRO.

Si una futura evolución mejora este ciclo, deberá incorporarse.

Si lo degrada, deberá rechazarse, independientemente de cualquier otra consideración.

Resumen final clave: El Operational Reasoning Core no intenta encontrar la mejor planificación posible. Intenta encontrar la mejor planificación que justifique el presupuesto de razonamiento invertido para obtenerla. La inteligencia del ORC no se mide por la cantidad de soluciones exploradas, sino por la calidad de las decisiones sobre dónde explorar.


---

# PARTE II — SPEC-00 Arquitectura Física

# ORC IMPLEMENTATION SPECIFICATION

# SPEC-00 — Arquitectura Física

Versión 1.0

---

# 1. Objetivo

Esta especificación define la arquitectura física del Operational Reasoning Core (ORC).

No describe algoritmos.

No describe heurísticas.

No describe implementación TypeScript.

Define exclusivamente los componentes, sus responsabilidades y los contratos de comunicación entre ellos.

Toda implementación del ORC deberá respetar esta arquitectura.

---

# 2. Principios

Toda implementación deberá cumplir obligatoriamente:

* determinismo;
* inmutabilidad del Estado Operativo;
* separación de responsabilidades;
* ausencia de dependencias circulares;
* simulación antes de consolidación;
* configuración antes que hardcode;
* explicabilidad de toda decisión.

---

# 3. Componentes

El ORC estará formado por los siguientes subsistemas.

```
Operational State

↓

Search & Exploration Engine (SEE)

↓

Transformation Engine

↓

Simulation Engine

↓

Validation Engine

↓

Operational Evaluator

↓

Commit Engine

↓

Evidence Engine
```

Todos los componentes son independientes.

Cada uno posee una única responsabilidad.

---

# 4. Operational State

Responsabilidad

Representar el estado completo de la producción.

Entrada

Ninguna.

Salida

OperationalState.

Nunca contiene lógica.

Nunca modifica su contenido.

Es únicamente un modelo de datos.

---

# 5. Cognitive State

Responsabilidad

Representar el estado interno del razonamiento.

Contiene únicamente información temporal.

Ejemplos:

* oportunidades;
* exploraciones;
* memoria;
* conocimiento;
* presupuesto;
* candidatos;
* evidencia parcial.

Nunca forma parte del dominio.

---

# 6. Search & Exploration Engine (SEE)

Responsabilidad

Decidir dónde invertir el presupuesto de razonamiento.

No mueve tareas.

No valida.

No evalúa.

Su única salida es un conjunto priorizado de candidatos.

Entrada

OperationalState

CognitiveState

Salida

Candidate[]

---

# 7. Transformation Engine

Responsabilidad

Construir nuevos Estados Operativos candidatos.

Entrada

OperationalState

Candidate

Salida

CandidateState

Nunca decide si una transformación es buena.

Sólo la ejecuta.

---

# 8. Simulation Engine

Responsabilidad

Ejecutar transformaciones sobre copias del Estado Operativo.

Nunca modifica el `OperationalState` interno vigente.

Entrada

CandidateState

Salida

SimulatedState

---

# 9. Validation Engine

Responsabilidad

Verificar viabilidad.

Comprueba:

* restricciones duras;
* recursos;
* dependencias;
* locks;
* integridad.

Devuelve únicamente:

VALID

INVALID

No puntúa.

---

# 10. Operational Evaluator

Responsabilidad

Comparar Estados Operativos.

Nunca conoce:

* oportunidades;
* estrategias;
* transformaciones.

Recibe únicamente estados.

Devuelve:

OperationalValue

---

# 11. Commit Engine

Responsabilidad

Decidir si un Estado Operativo candidato sustituye al `OperationalState` interno vigente de esa ejecución.

Sólo existen dos resultados.

COMMIT

REJECT

No existen estados intermedios.

---

# 12. Evidence Engine

Responsabilidad

Registrar toda decisión tomada por el ORC.

Debe permitir reconstruir completamente una sesión.

Nunca modifica el razonamiento.

Nunca modifica el Estado Operativo.

---

# 13. Pipeline oficial

Toda iteración seguirá exactamente este flujo.

```
OperationalState

↓

Search & Exploration Engine (SEE)

↓

Transformation Engine

↓

Simulation Engine

↓

Validation Engine

↓

Operational Evaluator

↓

Commit Engine

↓

Evidence Engine

↓

Nuevo OperationalState
```

Ningún componente podrá alterar este orden.

---

# 14. Dependencias permitidas

Cada componente únicamente podrá depender del inmediatamente anterior.

No se permiten llamadas cruzadas.

Ejemplos prohibidos.

Operational Evaluator

↓

Search & Exploration Engine (SEE)

Transformation Engine

↓

Commit Engine

Evidence Engine

↓

Simulation Engine

Toda dependencia deberá respetar el flujo del pipeline.

---

# 15. Reglas de implementación

Cada componente deberá cumplir:

una responsabilidad;

una entrada claramente definida;

una salida claramente definida;

sin efectos secundarios ocultos;

sin modificar directamente OperationalState.

---

# 16. Reglas de evolución

La incorporación de nuevas capacidades sólo podrá realizarse mediante:

* ampliación del Search & Exploration Engine (SEE);
* incorporación de nuevas transformaciones;
* mejora del evaluador;
* mejora de Evidence.

Nunca modificando el pipeline.

---

# 17. Reglas para CODEX

Toda implementación deberá preguntarse siempre:

¿Este cambio modifica la arquitectura?

Si la respuesta es sí:

Detener la implementación.

Revisar la arquitectura.

Si la respuesta es no:

Continuar.

La arquitectura posee prioridad absoluta sobre cualquier optimización local.

---

# 18. Definición final

El ORC es una tubería determinista de razonamiento.

Cada componente posee una única responsabilidad.

Cada componente puede evolucionar independientemente.

La inteligencia global emerge de la cooperación entre todos ellos.

Ningún componente individual constituye el "motor".

El motor es el conjunto.


---

# PARTE III — SPEC-01 Modelo de Estados

# ORC IMPLEMENTATION SPECIFICATION

# SPEC-01 — Modelo de Estados

Versión 1.0

---

# 1. Objetivo

Esta especificación define todos los modelos de datos utilizados por el ORC.

Estos modelos constituyen el lenguaje común entre todos los componentes del motor.

Ningún componente podrá intercambiar información fuera de estos contratos.

---

# 2. Principios

Todos los modelos deberán cumplir:

* inmutabilidad;
* determinismo;
* serialización completa;
* comparabilidad;
* trazabilidad.

Ningún modelo contendrá lógica de negocio.

---

# 3. OperationalState

## Responsabilidad

Representar completamente el estado actual de una producción.

## Invariantes

Debe ser autosuficiente.

Debe poder evaluarse sin consultar información externa.

Debe representar exactamente una situación posible.

## Contenido mínimo

* planificación;
* tareas;
* recursos;
* espacios;
* disponibilidad;
* dependencias;
* locks;
* restricciones;
* configuración;
* métricas operativas.

## Prohibiciones

No contiene métodos de optimización.

No contiene decisiones.

No contiene memoria temporal.

---

# 4. CognitiveState

## Responsabilidad

Representar el conocimiento temporal generado durante una sesión.

## Contenido

* oportunidades;
* exploraciones;
* regiones descartadas;
* presupuesto restante;
* memoria de búsqueda;
* candidatos explorados;
* conocimiento temporal;
* confianza.

## Invariantes

Nunca modifica el OperationalState.

Nunca persiste entre ejecuciones.

---

# 5. Opportunity

## Responsabilidad

Representar una oportunidad de mejora.

No representa una solución.

No representa una transformación.

## Contenido

Como mínimo:

* identificador;
* tipo;
* prioridad;
* impacto esperado;
* urgencia;
* criticidad;
* causa;
* región afectada;
* confianza.

## Ciclo de vida

Detectada

↓

Priorizada

↓

Explorada

↓

Resuelta

o

Descartada

---

# 6. SearchSpace

## Responsabilidad

Representar el conjunto de alternativas plausibles asociadas a una oportunidad.

No contiene candidatos completos.

Contiene posibilidades de exploración.

## Contenido

* región;
* profundidad;
* transformaciones permitidas;
* presupuesto;
* restricciones locales.

---

# 7. Candidate

## Responsabilidad

Representar una propuesta concreta de modificación.

Un candidato todavía no constituye un OperationalState.

Representa únicamente una posible transformación.

## Contenido

* oportunidad origen;
* estrategia;
* transformaciones;
* coste estimado;
* impacto esperado;
* confianza.

---

# 8. CandidateState

## Responsabilidad

Representar el resultado de aplicar un Candidate sobre un OperationalState.

Este estado todavía no ha sido validado.

---

# 9. SimulatedState

## Responsabilidad

Representar un CandidateState completamente simulado.

Este estado puede pasar al Validation Engine.

---

# 10. ValidationResult

Valores permitidos.

VALID

INVALID

## Contenido

* resultado;
* restricciones incumplidas;
* conflictos detectados;
* explicación.

No contiene puntuaciones.

---

# 11. OperationalValue

## Responsabilidad

Representar la calidad de un OperationalState.

No representa una única puntuación.

Representa una evaluación multicriterio.

## Dimensiones mínimas

* continuidad;
* makespan;
* permanencia;
* compactación;
* presión de recursos;
* robustez;
* estabilidad;
* libertad futura.

La implementación concreta del cálculo podrá evolucionar.

El contrato permanece.

---

# 12. CommitDecision

Valores posibles.

COMMIT

REJECT

## Contenido

* decisión;
* motivo;
* diferencias respecto al estado anterior;
* evidencia asociada.

---

# 13. Evidence

## Responsabilidad

Permitir reconstruir completamente una iteración.

Debe contener como mínimo:

* oportunidad;
* espacio de búsqueda;
* candidatos generados;
* candidatos descartados;
* candidato seleccionado;
* validación;
* evaluación;
* decisión final;
* tiempos.

---

# 14. Relaciones

```text
OperationalState

↓

Opportunity

↓

SearchSpace

↓

Candidate

↓

CandidateState

↓

SimulatedState

↓

ValidationResult

↓

OperationalValue

↓

CommitDecision

↓

Evidence
```

Todos los modelos siguen esta dirección.

Nunca al contrario.

---

# 15. Reglas de inmutabilidad

Toda modificación genera un nuevo objeto.

Nunca se modifica uno existente.

Esto garantiza:

* simulación segura;
* rollback trivial;
* paralelización futura;
* reproducibilidad.

---

# 16. Reglas de igualdad

Todos los modelos deberán implementar igualdad estructural.

No igualdad por referencia.

Dos OperationalState equivalentes deberán compararse como iguales independientemente de su implementación.

---

# 17. Casos borde obligatorios

La implementación deberá soportar correctamente:

* OperationalState vacío;
* una única tarea;
* múltiples oportunidades simultáneas;
* SearchSpace sin candidatos;
* Candidate inválido;
* simulación sin mejoras;
* empate entre candidatos;
* ausencia de oportunidades.

Todos estos casos deberán estar cubiertos mediante pruebas.

---

# 18. Complejidad

La creación de modelos deberá ser de coste constante o lineal respecto a la información contenida.

Ningún constructor realizará cálculos complejos.

Toda inteligencia pertenece al ORC.

Nunca a los modelos.

---

# 19. Tests obligatorios

Cada modelo deberá verificarse mediante:

* creación;
* serialización;
* deserialización;
* igualdad;
* inmutabilidad;
* copia;
* comparación.

Estos tests constituyen una regresión permanente.

---

# 20. Principio rector

Los modelos representan información.

Nunca comportamiento.

El ORC razona sobre modelos.

Los modelos nunca razonan sobre sí mismos.


---

# PARTE IV — SPEC-02 Search & Exploration Engine

# ORC IMPLEMENTATION SPECIFICATION

# SPEC-02 — Search & Exploration Engine (SEE)

Versión 1.0

---

# 1. Objetivo

El Search & Exploration Engine (SEE) constituye el núcleo cognitivo del ORC.

Su responsabilidad consiste en decidir dónde invertir el presupuesto de razonamiento.

No construye planificaciones.

No mueve tareas.

No evalúa estados.

Su única misión consiste en encontrar las regiones del Estado Operativo con mayor potencial de mejora y generar un conjunto reducido de candidatos de alta calidad.

---

# 2. Responsabilidades

El SEE realiza exactamente seis funciones.

1. Comprender el Estado Operativo.

2. Detectar oportunidades.

3. Priorizar oportunidades.

4. Construir espacios locales de búsqueda.

5. Generar candidatos.

6. Seleccionar qué candidatos merecen simulación.

Todo lo demás pertenece a otros componentes.

---

# 3. Entradas

OperationalState

CognitiveState

Configuración

Presupuesto de razonamiento

---

# 4. Salidas

Candidate[]

Evidence parcial

Actualización del CognitiveState

---

# 5. Restricciones

El SEE nunca:

* modifica OperationalState;
* ejecuta transformaciones;
* valida restricciones;
* calcula OperationalValue;
* consolida resultados.

Únicamente razona.

---

# 6. Etapa 1 — Comprensión

El SEE analiza el OperationalState como un sistema completo.

No inspecciona tareas aisladas.

Calcula una visión global de la producción.

Como mínimo identifica:

* presión sobre recursos;
* continuidad;
* permanencias;
* fragmentación;
* dependencias críticas;
* utilización de espacios;
* margen operativo;
* conflictos latentes.

El resultado es un mapa operativo de la jornada.

---

# 7. Etapa 2 — Detección de oportunidades

A partir del mapa operativo se generan oportunidades.

Cada oportunidad representa una posibilidad real de incrementar el Valor Operativo.

Ejemplos.

* cerrar un hueco;
* reducir permanencia;
* compactar un coach;
* aliviar presión;
* resolver ANY_OF;
* eliminar cuello de botella;
* aumentar robustez.

Las oportunidades nunca contienen acciones.

Sólo describen problemas.

---

# 8. Etapa 3 — Priorización

Cada oportunidad recibe una prioridad dinámica.

La prioridad dependerá de:

* impacto esperado;
* criticidad;
* urgencia;
* propagación potencial;
* coste estimado;
* confianza.

La prioridad nunca es fija.

Se recalcula continuamente.

---

# 9. Etapa 4 — Construcción del Search Space

Seleccionada una oportunidad, el SEE construye un Search Space local.

El Search Space contiene únicamente alternativas plausibles.

Nunca contiene el universo completo de soluciones.

Debe ser:

* pequeño;
* relevante;
* diverso;
* acotado.

El tamaño del espacio constituye un parámetro crítico del motor.

---

# 10. Etapa 5 — Generación de candidatos

Cada candidato representa una estrategia concreta.

Un candidato nunca representa únicamente un movimiento.

Debe responder a una intención.

Ejemplos.

"Cerrar hueco"

↓

Mover cadena

↓

Reasignar recurso

↓

Modificar ANY_OF

↓

Compactar agenda

Todos esos movimientos forman un único candidato.

---

# 11. Diversidad

La diversidad constituye un objetivo explícito.

No deben generarse múltiples candidatos equivalentes.

El SEE favorecerá:

* distintas estrategias;
* distintos recursos;
* distintas secuencias;
* distintas propagaciones.

La exploración pierde calidad cuando todos los candidatos son parecidos.

---

# 12. Filtrado

Antes de simular candidatos se realiza un filtrado rápido.

Se descartan inmediatamente aquellos candidatos que:

* incumplen restricciones evidentes;
* repiten regiones ya exploradas;
* poseen impacto muy bajo;
* presentan coste excesivo.

El objetivo es reducir el número de simulaciones.

---

# 13. Presupuesto

Toda exploración consume presupuesto.

El presupuesto podrá limitar:

* número de oportunidades;
* tamaño del Search Space;
* profundidad;
* candidatos;
* simulaciones.

El presupuesto constituye una entrada del SEE.

Nunca una constante hardcodeada.

---

# 14. Poda

El SEE abandonará una región cuando:

* no aparezcan mejoras;
* el coste aumente;
* la confianza disminuya;
* otra región resulte claramente superior.

La poda constituye un comportamiento esperado.

No un fallo.

---

# 15. Memoria

El SEE mantiene memoria únicamente durante la sesión.

Recuerda:

* regiones agotadas;
* candidatos repetidos;
* transformaciones improductivas;
* oportunidades resueltas;
* bloqueos frecuentes.

Esta memoria desaparece al finalizar la ejecución.

---

# 16. Determinismo

Con la misma entrada.

El SEE deberá generar exactamente el mismo Search Space y exactamente los mismos candidatos.

No se permite aleatoriedad.

La diversidad debe conseguirse mediante reglas deterministas.

---

# 17. Complejidad

El SEE no debe intentar explorar todas las posibilidades.

Su complejidad deberá crecer aproximadamente con el tamaño del Search Space construido.

Nunca con el espacio total de soluciones.

Éste constituye uno de los principales objetivos del diseño.

---

# 18. Tests obligatorios

Toda implementación deberá demostrar mediante pruebas que:

* detecta correctamente oportunidades;
* prioriza de forma estable;
* construye Search Spaces pequeños;
* genera candidatos diversos;
* evita candidatos repetidos;
* respeta el presupuesto;
* poda correctamente.

Estos tests constituyen la validación principal del ORC.

---

# 19. Regla de oro

La calidad del ORC depende principalmente de la calidad del Search & Exploration Engine.

Una mejora en este componente suele producir mejoras globales.

Una degradación en este componente suele inutilizar el resto del sistema.

Toda modificación del SEE deberá tratarse como una modificación crítica.

---

# 20. Definición oficial

El Search & Exploration Engine es el sistema responsable de transformar un Estado Operativo en un conjunto pequeño, diverso y prometedor de candidatos que justifiquen el coste de ser simulados.

Ésta constituye la función cognitiva principal del Operational Reasoning Core.


---

# PARTE V — SPEC-03 Decision Engine

# ORC IMPLEMENTATION SPECIFICATION

# SPEC-03 — Decision Engine

Versión 1.0

---

# 1. Objetivo

El Decision Engine transforma candidatos en decisiones.

Su responsabilidad consiste en determinar si un candidato merece convertirse en el nuevo OperationalState.

Nunca genera candidatos.

Nunca detecta oportunidades.

Nunca construye Search Spaces.

Recibe candidatos.

Devuelve decisiones.

---

# 2. Entradas

OperationalState

Candidate[]

Configuración

---

# 3. Salidas

Nuevo OperationalState

CommitDecision

Evidence

---

# 4. Pipeline interno

Todo candidato atraviesa obligatoriamente las siguientes fases.

```text
Candidate

↓

Transformation

↓

Simulation

↓

Validation

↓

Evaluation

↓

Ranking

↓

Commit

↓

Evidence
```

Ninguna fase puede omitirse.

---

# 5. Transformation

La transformación convierte un Candidate en un CandidateState.

Las transformaciones son operaciones mecánicas.

Ejemplos.

* mover tarea;
* mover cadena;
* intercambiar tareas;
* resolver ANY_OF;
* cambiar recurso;
* desplazar secuencia.

Las transformaciones nunca contienen razonamiento.

---

# 6. Simulation

Toda transformación se ejecuta sobre una copia completa del OperationalState.

La simulación nunca modifica el `OperationalState` activo del ORC. Esta garantía es interna al ORC y no define ni modifica `Stage`, `WorkingPlan`, `daily_tasks` u `OfficialPlan` del producto Assisted.

Su única salida es un SimulatedState.

---

# 7. Validation

Todo SimulatedState deberá validarse.

Como mínimo deberán comprobarse.

* restricciones duras;
* recursos;
* espacios;
* precedencias;
* locks;
* integridad;
* coherencia temporal.

La validación devuelve únicamente.

VALID

o

INVALID

Los estados inválidos se descartan inmediatamente.

---

# 8. Evaluation

Todos los estados válidos se comparan utilizando OperationalValue.

La evaluación nunca conoce.

* oportunidades;
* estrategias;
* Search Spaces.

Sólo compara estados.

---

# 9. Ranking

Los candidatos válidos se ordenan según su OperationalValue.

El Decision Engine únicamente considera candidatos completamente evaluados.

No existen atajos.

---

# 10. Commit

En modo `IMPROVEMENT`, el mejor candidato sólo puede hacer `COMMIT` si mejora objetivamente el OperationalState vigente. En construcción, el criterio de commit interno es el avance constructivo válido definido por 03. Un `COMMIT` nunca equivale por sí solo a aceptar un Stage de producto.

Si ningún candidato cumple el criterio del modo, la iteración termina sin cambios; ese resultado es válido.

---

# 11. OperationalValue

OperationalValue representa la calidad global de un OperationalState.

Como mínimo deberá considerar.

* continuidad;
* makespan;
* permanencia;
* compactación;
* presión;
* robustez;
* estabilidad;
* libertad futura.

La ponderación concreta será configurable.

---

# 12. Comparación

El Decision Engine compara exclusivamente OperationalState.

Nunca compara tareas.

Nunca compara transformaciones.

Nunca compara estrategias.

Toda comparación se realiza a nivel de estado.

---

# 13. Explicabilidad

Toda decisión deberá responder.

¿Por qué se eligió este candidato?

¿Por qué se rechazaron los demás?

¿Qué mejoró?

¿Qué empeoró?

¿Qué restricciones condicionaron la decisión?

La explicación forma parte del contrato.

---

# 14. Determinismo

Con la misma entrada.

El Decision Engine deberá producir exactamente la misma decisión.

No se permite ningún comportamiento aleatorio.

---

# 15. Complejidad

La complejidad dependerá exclusivamente del número de candidatos recibidos.

Nunca del tamaño completo del espacio de búsqueda.

La reducción del espacio corresponde al SEE.

---

# 16. Casos borde

La implementación deberá soportar.

* cero candidatos;
* todos inválidos;
* empate entre candidatos;
* candidato idéntico al estado actual;
* múltiples candidatos equivalentes;
* ausencia de mejora.

Todos ellos deberán estar cubiertos mediante pruebas.

---

# 17. Tests obligatorios

Toda implementación deberá demostrar.

* simulación correcta;
* validación correcta;
* evaluación determinista;
* ranking estable;
* commit correcto;
* rollback automático;
* evidencia completa.

---

# 18. Principio rector

El Decision Engine nunca intenta encontrar soluciones.

Únicamente decide si los candidatos construidos por el SEE mejoran suficientemente el OperationalState como para sustituir el estado vigente.


---

# PARTE VI — SPEC-04 Cognitive Memory & Evidence

# ORC IMPLEMENTATION SPECIFICATION

# SPEC-04 — Cognitive Memory & Evidence

Versión 1.0

---

# 1. Objetivo

Esta especificación define cómo el ORC conserva, utiliza y explica el conocimiento generado durante una ejecución.

El objetivo no es aprender permanentemente.

El objetivo es evitar repetir razonamientos inútiles dentro de la misma sesión.

---

# 2. Principio

El ORC aprende durante la ejecución.

No aprende entre ejecuciones.

Toda la memoria es temporal.

Al finalizar una sesión desaparece completamente.

El motor comienza siempre desde el mismo conocimiento base.

---

# 3. Responsabilidades

Este subsistema mantiene:

* memoria de exploración;
* conocimiento temporal;
* historial de candidatos;
* evidencia;
* explicación del razonamiento.

Nunca modifica OperationalState.

Nunca modifica OperationalValue.

Nunca genera candidatos.

---

# 4. Entradas

OperationalState

CognitiveState

CommitDecision

Resultados de evaluación

---

# 5. Salidas

Nuevo CognitiveState

Evidence completo

---

# 6. Memoria temporal

El ORC deberá recordar, como mínimo:

## Oportunidades exploradas

Para evitar explorarlas continuamente.

---

## Search Spaces agotados

Regiones donde ya no merece la pena invertir cálculo.

---

## Candidatos descartados

Para impedir repetir simulaciones equivalentes.

---

## Transformaciones improductivas

Transformaciones que repetidamente no generan mejora.

---

## Patrones útiles

Situaciones donde determinadas estrategias producen buenos resultados.

---

# 7. Qué nunca debe almacenarse

Nunca deberá conservarse:

* información de otras sesiones;
* preferencias aprendidas;
* pesos ajustados automáticamente;
* conocimiento específico de una producción pasada.

El ORC debe ser completamente determinista.

---

# 8. Evidence

Toda iteración deberá registrar:

* oportunidad elegida;
* prioridad;
* Search Space construido;
* candidatos generados;
* candidatos filtrados;
* candidatos simulados;
* candidato consolidado;
* OperationalValue antes;
* OperationalValue después;
* tiempo empleado.

La evidencia constituye una salida oficial del motor.

---

# 9. Explicabilidad

El ORC deberá responder siempre:

¿Qué problema intentaba resolver?

¿Por qué eligió esa oportunidad?

¿Por qué descartó las demás?

¿Por qué eligió ese candidato?

¿Por qué rechazó los otros?

¿Qué mejoró?

¿Qué empeoró?

---

# 10. Trazabilidad

Toda decisión deberá poder reconstruirse.

Será posible recorrer cualquier iteración desde:

OperationalState inicial

↓

Oportunidad

↓

Search Space

↓

Candidato

↓

Simulación

↓

Evaluación

↓

Commit

↓

OperationalState final

Sin perder información.

---

# 11. Observabilidad

Durante cualquier momento de la ejecución deberá conocerse:

* qué oportunidad está activa;
* qué Search Space se está explorando;
* qué candidato se está simulando;
* cuánto presupuesto queda;
* qué regiones han sido descartadas.

Nada del razonamiento debe ser opaco.

---

# 12. Determinismo

La generación de evidencia nunca podrá modificar el comportamiento del motor.

La observación es completamente pasiva.

---

# 13. Complejidad

La gestión de memoria deberá tener un coste muy inferior al de la exploración.

Nunca deberá convertirse en el cuello de botella del ORC.

---

# 14. Casos borde

La implementación deberá soportar:

* sesiones sin mejoras;
* sesiones sin oportunidades;
* candidatos repetidos;
* Search Spaces vacíos;
* múltiples iteraciones consecutivas sin commit.

---

# 15. Tests obligatorios

Toda implementación deberá demostrar:

* reconstrucción completa de una iteración;
* consistencia del Evidence;
* memoria correctamente actualizada;
* memoria eliminada al finalizar la sesión;
* determinismo completo.

---

# 16. Principio rector

El conocimiento generado por el ORC existe únicamente para mejorar la calidad del razonamiento durante la ejecución actual.

Nunca constituye aprendizaje permanente.

El motor recuerda únicamente lo necesario para pensar mejor mientras planifica.
