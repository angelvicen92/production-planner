# OPTIPLAN — VALIDACIÓN, CALIDAD Y BENCHMARK

**Versión:** 2.6  
**Fecha:** 30 de septiembre de 2026  
**Estado:** Fuente oficial consolidada  
**Sustituye:** SPEC-05 como Fuente separada y Objetivo Maestro de Calidad/Benchmark A2 v1.0.

## Actualización v2.6 — regresión de márgenes específicos y disponibilidad A2 corregida

Todo camino productivo que soporte transición de participante debe demostrar el contrato completo de overrides: sin override se aplica el margen general; un único `before` o `after` lo sustituye; con ambos se aplica el mayor; `0` es explícito y no se confunde con ausencia; los valores no se suman. El mismo resultado debe observarse en dominios, colocación, validación, fingerprints y Evidence.

Para el A2 canónico vigente, el benchmark debe verificar además:

- C01 conserva disponibilidad `09:00–15:30`;
- C02–C19 conservan disponibilidad `09:00–19:00`;
- el día global continúa `09:00–21:00`;
- el margen general de participante continúa en `5` minutos;
- cada `Estilismo salida` declara `participantMarginAfterMinutes = 0`;
- cada `OUT` declara `participantMarginBeforeMinutes = 0`;
- por tanto, la frontera `Estilismo salida → OUT` tiene gap de participante efectivo `0`;
- la capacidad/exclusividad de Estilismo no cambia y sigue siendo `1`;
- ninguna Evidence nueva puede reutilizar `18:40` como fin de disponibilidad de C02–C19 ni aplicar 5 minutos entre Estilismo salida y OUT.

A2-ASSIST-8 debe volver a ejecutarse desde un estado limpio tras esta corrección antes de aceptar conclusiones causales anteriores sobre P15 o participant closure. Un resultado histórico obtenido con la disponibilidad `18:40` o sin los overrides terminales queda obsoleto para el canon actualizado.

## Actualización v2.5 — supporting virtual, presión y witness futuro de unidad

La completitud Assisted debe distinguir entre **capacidad reservada** y **placement aceptado**. Para cualquier Stage que use prerrequisitos breves fuera del scope visible, el benchmark debe demostrar que dichos prerrequisitos permanecen virtuales/reparables hasta su materialización autorizada y que no reducen artificialmente el dominio de unidades posteriores.

- Evidence separa reservas virtuales, placements supporting efímeros y placements realmente aceptados/protegidos.
- Un supporting placement usado sólo para certificar capacidad no puede sobrevivir como restricción de Stages posteriores salvo `includePrerequisites`, aceptación humana o contrato explícito.
- Cuando identidades compitan por spots escasos, Evidence registra la presión efectiva que ordenó el matching: disponibilidad, carga restante, slack/dominio, dependencias, comidas/transiciones y unidades futuras críticas; el ID sólo desempata equivalencia material.
- Antes de aceptar un Stage que pueda comprometer una unidad estructural `REQUIRED`, debe existir un witness futuro sound de esa unidad completa. Para una sincronización de rondas, el gate debe cubrir como mínimo geometría autorizada, preparación/transición aplicable, pausa operativa, compatibilidad nominal suficiente y Future Feasibility necesaria, sin materializar todavía el Stage futuro.
- En A2, los 19 `IN` y 19 `Estilismo entrada` no pueden quedar fijados como placements nominales sólo para construir Totales; su capacidad se conserva mediante reservas/spots reparables hasta que la estructura productiva relevante quede cerrada.
- Cuando llegue su materialización, `IN` y Estilismo entrada deben usar los primeros spots hard-válidos compatibles con la presión de participantes y la configuración efectiva. En A2, `IN` mantiene `targetGroupSize=3`, `maximumGroupSize=3` y `minGapMinutes=30`; el benchmark debe demostrar que los grupos no se retrasan por una preferencia implícita de “just in time”.

## Actualización v2.4 — A2 Assisted por unidades y certificación global de comidas

A2-ASSIST-8 deja de considerar suficiente un encadenamiento que recorra espacios por ID. La completitud Assisted debe demostrar también que la **orquestación de scopes** respeta las unidades y criticidad del A2 canónico.

Regresiones nuevas:

- el siguiente scope no puede seleccionarse por `spaceId` ascendente, nombre o posición de catálogo;
- Plató 14, Plató 15, Salas Totales y las agendas Reality se auditan como unidades operativas conforme a Fuente 06, aunque internamente contengan varios espacios;
- la cadena Reality C + EVA → Alfombra debe cerrarse/protegerse antes de permitir que las agendas A/B consuman la ventana compartida de sus recursos;
- Totales, por sus rondas sincronizadas de 30 min y baja flexibilidad, debe conservar prioridad sobre trabajo corto/flexible de P14/P15 salvo que Evidence hard del estado concreto justifique lo contrario;
- las operaciones Reality A/B intercambiables no pueden quedar fijadas a A o B por copiar la asignación humana;
- antes de aceptar **cada Stage**, debe existir un witness global válido para todas las comidas Sodexo pendientes bajo el snapshot resultante, incluida capacidad conjunta; no basta con comprobar sólo participantes directamente tocados por el último placement;
- A2-ASSIST-8 debe registrar por Stage la unidad elegida, razones de prioridad, meals pendientes/certificadas y cualquier obligación que pierda su último witness.

## Actualización v2.3 — regresión de orden parcial y criticidad futura

Todo cambio que afecte a estructuras continuas, Future Feasibility o matching nominal deberá demostrar:

- que una permutación humana observada no se convierte en precedencia HARD si la Fuente de dominio declara orden interno flexible;
- que una estructura por fases sólo se declara inviable tras agotar/certificar todas las realizaciones materialmente distintas autorizadas;
- que una colocación del flujo principal que elimina el último witness de una unidad futura REQUIRED se poda causalmente;
- que una colocación que conserva al menos un witness no se rechaza por haber invalidado una permutación concreta;
- que el diagnóstico de criticidad/holgura no depende de IDs A2 ni de un umbral hard oculto.

## 1. Objetivo rector

El éxito inicial del producto no es conseguir una jornada one-click. Es demostrar que un jefe de producción puede **completar A2 de forma Assisted**, mediante scopes y Stages, con un sistema rápido, explicable, reversible y seguro. Después se compara la calidad final con la referencia humana. Autopilot es un nivel posterior.

## 2. Universo A2 vigente

- 19 concursantes.
- 266 obligaciones canónicas.
- Los horarios humanos son referencia de calidad, nunca seed/hint/lock.
- El problema de entrada y la referencia humana permanecen separados.

## 3. Progresión A2-ASSIST — gates no diluibles

Los siguientes IDs son contratos de benchmark estables. Una formulación genérica no sustituye sus condiciones observables.

### A2-ASSIST-0 — Representability
Todo el día A2 canónico puede materializarse sin pérdida material en el modelo/configuración efectiva y atravesar preflight/adaptación con identidades, restricciones y 266 obligaciones preservadas.

### A2-ASSIST-1 — Scope main
Seleccionar **todas las obligaciones de Estudio 7** como scope y generar una propuesta sin mover placements aceptados previos. El motor puede considerar feeders/prerequisites internamente aunque `includePrerequisites=false`; esos supporting tasks no pasan por ello a ser selección visible del usuario.

Para el A2 vigente, este gate debe además conservar Future Feasibility de la estructura Reality C + EVA → Alfombra conforme a la Fuente 06 vigente: el benchmark no podrá exigir ni asumir la permutación humana dentro de las fases. Debe aceptar cualquier orden interno hard-válido y rechazar únicamente posiciones de Estudio 7 que eliminen todas las realizaciones permitidas.

### A2-ASSIST-2 — Edición humana
Sobre el Draft demostrar, como mínimo:

- swap de dos tareas compatibles;
- shift/movimiento de un bloque;
- split de bloque.

La UI refleja el cambio de forma inmediata y la validación detecta/explica el nuevo estado sin escribir `daily_tasks` por el mero drag/edit.

### A2-ASSIST-3 — Stage acceptance
Aceptar S1 y demostrar conjuntamente:

- snapshot completo del planning;
- `snapshotFingerprint` determinista;
- AutomaticProtection de placements aceptados para posteriores movimientos automáticos;
- Evidence/provenance;
- `daily_tasks` consolidado desde el Stage aceptado.

### A2-ASSIST-4 — Segundo scope
Resolver un segundo scope alrededor de S1 sin mover automáticamente placements aceptados de S1.

### A2-ASSIST-5 — Config update
Aplicar una actualización de configuración del día y demostrar que:

- S1 permanece intacto;
- la nueva revisión queda trazada;
- la siguiente propuesta/decisión nueva usa la configuración vigente del día.

### A2-ASSIST-6 — Conflicto HARD aceptado
Crear manualmente un conflicto HARD, validarlo y aceptarlo conscientemente. Debe demostrarse:

- Stage aceptado;
- `hardValid=false` mientras la condición exista;
- AcceptedException estructurada registrada con provenance/fingerprint;
- indicador crítico rojo persistente en las entidades afectadas;
- la regla global continúa activa;
- el siguiente solver puede grandfather exactamente el conflicto antiguo aceptado pero **no introducir nuevos conflictos** por esa excepción/override.

### A2-ASSIST-7 — Rollback y rama
Desde una línea con varios Stages, volver a un checkpoint anterior y demostrar:

- restauración exacta del snapshot y de `daily_tasks`;
- Stages posteriores preservados en historial;
- redo mientras no exista divergencia;
- al aceptar un nuevo hijo desde el Stage restaurado, creación de una nueva rama y archivo del futuro antiguo.

### A2-ASSIST-8 — Assisted completion
Completar las **266 obligaciones canónicas** mediante una secuencia real de scopes/Stages sin duplicados ni omisiones y con identidad preservada. El benchmark debe usar el flujo de producto request/run/apply → validate → accept, no un atajo de test que bypassée el contrato Assisted.

La selección automática del siguiente scope forma parte del benchmark y debe seguir la autoridad de unidades/criticidad de 03 + 06. Está expresamente prohibido usar como policy canónica `main primero → resto de espacios por ID ascendente`.

Para A2 se verifican, como relaciones de orden operativo y no como horas copiadas:

- el pipeline Estudio 7/Caracola se construye primero y protege sus feeders/transiciones;
- la estructura Reality C + EVA → Alfombra se trata como una unidad futura crítica y se cierra antes de programar las operaciones standalone de Reality A/B que comparten sus recursos;
- Salas Totales se tratan como una única unidad sincronizada y se priorizan frente a las tareas breves/flexibles de Plató 14 y frente a familias de setup menos críticas cuando no exista Evidence hard que invierta esa prioridad;
- Plató 14 se solicita como una unidad que comprende Recursos + Pasillo + Giratuto; Plató 15 como Croma + Estrellas/Sillón; agrupar scope no elimina el paralelismo interno autorizado;
- Reality A/B se evalúa como una agenda coordinada de dos equipos, no como un Stage independiente por localización;
- Estilismo salida/OUT no deben convertirse en el primer momento en que se descubran obligaciones largas o comidas que debieron reservarse antes.
- Los supporting prerequisites breves fuera del scope visible deben permanecer como reserva virtual/reparable durante la construcción estructural. A2-ASSIST-8 falla si `IN`/Estilismo entrada se materializan prematuramente y esa elección es la causa de perder la última geometría de una unidad posterior.
- Antes de aceptar S1, S2 o S3, si sus placements pueden reducir el dominio de Salas Totales, debe registrarse al menos un `futureStructuralWitness` sound para la unidad sincronizada completa; no hace falta materializar Totales ni copiar horas humanas.
- Cuando un matching de spots escasos distinga participantes, la Evidence debe mostrar la presión operacional usada y demostrar que un participante con menor slack/fin de disponibilidad no perdió una alternativa sólo por orden nominal/ID.
- La materialización de `IN`/Estilismo entrada debe ser temprana por defecto: para A2 se esperan los primeros grupos/slots hard-válidos desde el inicio de jornada, sin interpretar `minGapMinutes=30` como parrilla fija y sin copiar horas humanas. Un desplazamiento posterior necesita una causa hard, una dependencia real o configuración explícita.

**Gate Sodexo por Stage:** antes de `validate → accept`, el candidato debe demostrar un witness global para todas las comidas individuales pendientes: intervalo completo dentro de ventana, sin solape del participante, respetando dependencias y capacidad simultánea. La Evidence debe identificar el número de comidas pendientes, dominios cero y, cuando proceda, inviabilidad conjunta. Un Stage con cualquier Sodexo pendiente sin witness no puede aceptarse.

### A2-ASSIST-9 — Quality vs human
Sobre el plan final comparable, calcular los mismos KPIs que sobre la referencia humana normalizada y clasificar el resultado `INVALID | WORSE | TRADEOFF | PARITY | PARETO_BETTER` conforme a las tolerancias oficiales.

### A2-ASSIST-10 — Autopilot
Scope `DAY` / encadenamiento autónomo futuro reutilizando las mismas capacidades Assisted. **No es gate del MVP Assisted** ni autoriza a reinterpretar el producto como one-click global.

## 4. Gates y verdad automática

- Un candidato automático con violación HARD o REQUIRED aplicable no puede presentarse como propuesta normal válida.
- Un WorkingPlan humano puede contener conflictos durante edición.
- Una AcceptedException no cambia la validación objetiva del hecho subyacente.
- Para comparación de calidad contra humano, ningún KPI compensa una violación hard del escenario que deba considerarse válida.

## 5. Desarrollo y regresión

Durante desarrollo se usan tests focales/benchmarks causales mínimos. Sobre un head candidato se ejecuta el merge gate proporcional, incluyendo determinismo, build/tests, migraciones cuando proceda, Evidence y benchmark representativo. A2 completo no debe ejecutarse tras cada microcambio si no aporta información nueva.


---

# PARTE I — Marco general de validación y regresión (SPEC-05 consolidada)

> **Ámbito:** esta Parte regula validación/regresión del ORC y de candidatos automáticos. “Mejora” o “correctitud” aquí no significa que todo Stage humano deba ser hard-valid ni que cada PR de infraestructura tenga que mejorar por sí solo el KPI A2; los gates de producto Assisted son los de las secciones 1–5 de esta Fuente.

# ORC IMPLEMENTATION SPECIFICATION

# SPEC-05 — Validation, Benchmark & Regression

Versión 1.0

---

¡¡ATENCIÓN!!
Este documento describe la arquitectura del ORC. No prescribe estructuras de código, carpetas, clases o tecnologías concretas. Las decisiones de implementación pertenecen a las ORC Implementation Specifications.

---

# 1. Objetivo

Esta especificación define cómo se valida la evolución del ORC.

Su finalidad es garantizar que toda modificación del motor produce una mejora objetiva y verificable.

Ninguna implementación podrá incorporarse únicamente por intuición.

Toda mejora deberá demostrarse mediante evidencia.

---

# 2. Principio fundamental

El benchmark no evalúa el código.

Evalúa el comportamiento del ORC.

Dos implementaciones distintas serán equivalentes si producen el mismo comportamiento operativo.

---

# 3. Tipos de validación

Toda modificación deberá superar cuatro niveles de validación.

## Correctitud

Respeta todas las restricciones.

---

## Calidad

Mejora o mantiene el Valor Operativo.

---

## Rendimiento

Respeta el presupuesto de tiempo definido para el ORC.

---

## Determinismo

Produce exactamente el mismo resultado para la misma entrada.

---

# 4. Escenarios

Todo benchmark deberá ejecutarse sobre un conjunto estable de escenarios representativos.

Como mínimo deberán existir escenarios para:

* planificación inicial;
* replanificación;
* flujo principal continuo;
* recursos críticos;
* múltiples ANY_OF;
* alta presión de recursos;
* alta fragmentación;
* múltiples locks;
* jornadas simples;
* jornadas complejas.

Cada escenario representa un comportamiento esperado.

No un caso aislado.

---

# 5. Métricas obligatorias

Toda ejecución deberá registrar, como mínimo:

* makespan;
* permanencia total;
* permanencia por talento;
* continuidad del flujo principal;
* utilización de recursos;
* número de conflictos;
* número de simulaciones;
* candidatos generados;
* candidatos simulados;
* candidatos consolidados;
* tiempo total;
* tiempo por iteración.

Estas métricas constituyen la base objetiva para comparar versiones del ORC.

---

# 6. Criterios de aceptación

Una modificación sólo podrá aceptarse cuando:

* mantiene la correctitud;
* no degrada el determinismo;
* no incrementa injustificadamente el tiempo de cálculo;
* mejora alguna dimensión operativa de forma consistente.

Una mejora puntual en un único escenario no constituye evidencia suficiente.

---

# 7. Regresiones

Se considera regresión cualquier modificación que:

* reduzca el Valor Operativo;
* aumente conflictos;
* rompa el determinismo;
* incremente significativamente el tiempo sin aportar beneficios;
* reduzca la explicabilidad;
* genere candidatos redundantes.

Toda regresión deberá bloquear la integración del cambio.

---

# 8. Evidence Report

Cada benchmark deberá producir un Evidence Report.

Como mínimo contendrá:

* resumen de la ejecución;
* oportunidades exploradas;
* Search Spaces construidos;
* candidatos generados;
* candidatos descartados;
* candidatos simulados;
* candidato consolidado;
* OperationalValue inicial;
* OperationalValue final;
* explicación de la decisión.

El formato del informe será estable entre versiones.

---

# 9. Performance Budget

El ORC trabaja siempre con un presupuesto de razonamiento.

Toda nueva capacidad deberá indicar:

* coste esperado;
* impacto esperado;
* frecuencia de ejecución.

Una capacidad cuyo coste exceda sistemáticamente su beneficio deberá eliminarse o rediseñarse.

---

# 10. Benchmark continuo

Todo cambio en el ORC deberá ejecutarse automáticamente contra la batería oficial de benchmarks.

No se aceptarán cambios sin validación completa.

El benchmark forma parte del ciclo de desarrollo.

No constituye una fase opcional.

---

# 11. Comparabilidad

Todas las versiones del ORC deberán poder compararse utilizando exactamente los mismos escenarios.

El benchmark nunca cambiará para favorecer una implementación concreta.

Si el benchmark evoluciona, deberá mantenerse la compatibilidad con las versiones anteriores.

---

# 12. Explicabilidad

El benchmark no deberá responder únicamente:

"¿Ha mejorado?"

También deberá responder:

"¿Por qué ha mejorado?"

La explicación constituye parte del resultado.

---

# 13. Casos límite

Toda batería de pruebas deberá incluir:

* escenarios mínimos;
* escenarios extremos;
* escenarios con imposibilidad demostrada;
* escenarios altamente ambiguos;
* escenarios con múltiples soluciones equivalentes.

El ORC deberá comportarse correctamente en todos ellos.

---

# 14. Regla de evolución

Toda nueva capacidad del ORC deberá ir acompañada de:

* nuevos tests;
* nuevos benchmarks, si procede;
* nueva evidencia.

Nunca podrá introducirse una capacidad sin un mecanismo objetivo para validar su comportamiento.

---

# 15. Definición de éxito

El ORC evoluciona correctamente cuando cada nueva versión:

* mantiene la estabilidad;
* mejora la calidad operativa;
* conserva el determinismo;
* reduce o mantiene el coste computacional;
* aumenta la capacidad de explicación.

Si cualquiera de estos principios deja de cumplirse, la evolución deberá detenerse y revisarse antes de continuar.

Éste constituye el criterio oficial de aceptación del Operational Reasoning Core.


---

# PARTE II — KPIs y comparación humana A2 vigentes

# 5. Regla fundamental de evaluación

No existirá una única puntuación capaz de compensar un fallo grave.

La evaluación tiene dos capas:

```text
CAPA 1 — GATES NO COMPENSABLES
        ↓
Sólo si todos pasan
        ↓
CAPA 2 — CALIDAD OPERATIVA MULTICRITERIO
```

Para una comparación automática limpia contra la referencia humana, una violación HARD no aceptable por el contrato del benchmark impide declarar superioridad aunque existan mejores KPIs. Un OfficialPlan humano puede contener HARD aceptados y seguir siendo publicable, pero conserva `hardValid=false` y su informe de calidad debe separar esa realidad de cualquier comparación clean/parity.

---

# 6. Gates no compensables

Una planificación será `INVALID` para comparación de calidad si falla cualquiera de estos gates aplicables.

## 6.1 Completitud

- 100 % de obligaciones canónicas planificables representadas;
- ninguna tarea REQUIRED omitida;
- ninguna operación sincronizada incompleta;
- ninguna operación anclada incompleta;
- ningún `PartialPlan` publicado como solución final.

## 6.2 Integridad temporal

- cero solapes incompatibles de concursante;
- cero solapes incompatibles de recurso;
- cero solapes incompatibles de espacio;
- todas las disponibilidades respetadas;
- todos los locks respetados;
- ventanas hard respetadas.

## 6.3 Dependencias

- precedencias hard respetadas;
- feeders completados antes de la tarea dependiente;
- cadenas transitivas respetadas;
- sincronizaciones hard respetadas;
- operaciones conjuntas con intervalo y espacio correctos.

## 6.4 Márgenes, desplazamientos y preparaciones

- márgenes entre espacios respetados;
- desplazamientos explícitos respetados;
- setups y preparaciones materializados cuando corresponda;
- holds y ocupaciones derivadas respetados;
- ninguna mejora aparente obtenida eliminando tiempo operativo obligatorio.

## 6.5 Comidas y pausas

- comidas de concursantes respetadas;
- comidas de espacios respetadas;
- comidas de recursos respetadas;
- pausas autorizadas correctamente diferenciadas de huecos no deseados.

## 6.6 Bloques y políticas REQUIRED

- máximo de bloques respetado;
- mínimos configurados respetados;
- orden de bloques/fases REQUIRED respetado;
- **ningún orden interno se considera REQUIRED cuando el contrato declara miembros permutables**;
- concentración REQUIRED de recursos respetada;
- continuidad REQUIRED respetada;
- coordinación REQUIRED respetada.

---

# 7. KPIs primarios de calidad

Los KPIs se calcularán mediante un único evaluador compartido entre benchmark y producto.

Cada KPI tendrá:

- identificador estable;
- unidad;
- dirección de mejora;
- fórmula;
- tolerancia de comparación;
- ámbito;
- fuente de datos;
- explicación.

Las tolerancias nunca se ocultarán dentro del código. Serán configuración o parte explícita de la versión del benchmark.

---

## 7.1 KPI-P01 — Continuidad del flujo principal

Para cada tramo de actividad en el flujo principal:

```text
gap_no_autorizado =
  tiempo entre fin de una obligación productiva
  e inicio de la siguiente
  excluyendo pausas autorizadas y ocupaciones explícitas
```

Registrar:

- minutos totales de gap no autorizado;
- número de gaps;
- gap máximo;
- ratio de continuidad;
- minutos productivos;
- minutos de pausa autorizada.

**Mejor:** menos gaps no autorizados.

Para A2, la referencia humana del Estudio 7 constituye una referencia especialmente fuerte de continuidad. El objetivo es igualar la ausencia de huecos internos no autorizados cuando sea operativamente viable.

---

## 7.2 KPI-P02 — Finalización y makespan operativo

Registrar:

- primera obligación efectiva;
- última obligación canónica;
- makespan total;
- hora final por unidad operativa;
- hora final del flujo principal.

**Mejor:** menor makespan, siempre que no empeore otros KPIs primarios ni reduzca robustez de forma material.

---

## 7.3 KPI-P03 — Permanencia de concursantes

Para cada concursante `c`:

```text
presence_span(c) =
  fin_de_última_obligación(c)
  - inicio_de_primera_obligación(c)
```

Registrar:

- total agregado;
- media;
- mediana;
- percentil 90;
- máximo;
- valor individual por concursante.

**Mejor:** menor permanencia.

No bastará con mejorar la media si se perjudica gravemente a uno o dos concursantes.

---

## 7.4 KPI-P04 — Espera evitable de concursantes

Para cada concursante:

```text
espera_bruta =
  presence_span
  - tiempo de obligaciones activas
```

La espera bruta se separará en:

- comida obligatoria;
- transición hard;
- preparación hard;
- espera estructural inevitable demostrada;
- espera evitable.

Registrar total, media, P90 y máximo de **espera evitable**.

**Mejor:** menor espera evitable.

Esta métrica evita penalizar al planificador por respetar correctamente pausas o desplazamientos obligatorios.

---

## 7.5 KPI-P05 — Presencia de recursos críticos

Para cada recurso configurado como relevante —por ejemplo coaches, presentadora/EVA, Banda u otros—:

```text
resource_presence_span(r) =
  fin_de_última_obligación(r)
  - inicio_de_primera_obligación(r)
```

Registrar:

- presence span;
- número de bloques operativos;
- huecos internos;
- minutos de hueco interno;
- salidas y regresos;
- espera evitable;
- cruces de comida autorizada;
- total agregado de horas-recurso.

**Mejor:** menor presencia y menor fragmentación, de acuerdo con su política `OFF | PREFERRED | REQUIRED`.

---

## 7.6 KPI-P06 — Continuidad y utilización de espacios

Por espacio o unidad:

- intervalo operativo;
- minutos productivos;
- minutos de setup;
- minutos de pausa autorizada;
- minutos de gap no autorizado;
- número de gaps;
- utilización productiva;
- utilización total incluyendo ocupaciones necesarias.

La continuidad sólo se penalizará donde exista política `REQUIRED` o `PREFERRED`.

No se premiará mantener artificialmente ocupado un espacio que no necesita continuidad.

---

## 7.7 KPI-P07 — Bloques, cambios y setups

Registrar:

- bloques por coach;
- bloques por familia;
- bloques por setup;
- reentradas;
- cambios de setup;
- minutos de preparación;
- alternancias evitables;
- violaciones o aproximaciones a máximos configurados.

**Mejor:** menos fragmentación y menos cambios innecesarios, sin degradar permanencia, recursos ni robustez.

---

## 7.8 KPI-P08 — Desplazamientos y cambios de zona

Por concursante y recurso:

- número de cambios de zona/espacio;
- minutos obligatorios de transición;
- desplazamientos evitables;
- secuencias de salida y regreso.

**Mejor:** menos desplazamiento evitable.

Los márgenes hard nunca se reducen para mejorar esta métrica.

---

## 7.9 KPI-P09 — Sincronización y operaciones especiales

Registrar:

- desviación de inicio y fin en tareas sincronizadas;
- cumplimiento de rondas coordinadas;
- operaciones conjuntas completas;
- operaciones ancladas completas;
- ocupaciones correctas de cada segmento;
- cero ocupación ficticia de espacios no utilizados.

Para políticas REQUIRED la desviación fuera de tolerancia es hard-invalid.

Para PREFERRED se registra como calidad.

---

## 7.10 KPI-P10 — Robustez y holgura operativa

Una planificación no debe parecer mejor sólo porque comprime todas las transiciones hasta el límite.

Registrar:

- holgura mínima;
- percentil bajo de holgura;
- número de transiciones por debajo del umbral de robustez configurado;
- cadenas críticas con margen cero;
- sensibilidad ante pequeños retrasos;
- capacidad de absorción de retraso antes de provocar una violación hard.

**Mejor:** mayor robustez, si no se compra mediante permanencias o makespan claramente peores.

El umbral de robustez será configurable. Nunca se hardcodeará un valor A2 en lógica genérica.

---

# 8. KPIs secundarios y diagnósticos del motor

Estos indicadores ayudan a entender el coste de obtener el planning, pero no compensan calidad operativa.

Registrar como mínimo:

- tiempo hasta primera solución completa;
- tiempo total;
- alternativas exploradas;
- candidatos generados;
- candidatos simulados;
- backtracks;
- podas;
- stop reason;
- fingerprint de entrada;
- fingerprint de configuración;
- fingerprint de resultado;
- determinismo entre repeticiones.

Una solución peor no se convierte en mejor por encontrarse más rápido.

El rendimiento se evalúa después de viabilidad y calidad, dentro del presupuesto de producto.

---

# 9. Comparación contra la referencia humana

## 9.1 Normalización previa

Los mismos cálculos KPI se ejecutarán sobre:

1. planning humano normalizado;
2. planning generado por OptiPlan.

No existirán fórmulas distintas para el humano y para el motor.

Las correcciones expresas incorporadas en la Fuente 06 prevalecen sobre errores de los PDFs A2.

## 9.2 Tolerancias

Cada KPI primario tendrá una tolerancia oficial.

Una diferencia dentro de tolerancia se considera equivalente.

Las tolerancias deben:

- ser explícitas;
- estar versionadas;
- ser iguales para humano y motor;
- no cambiar para favorecer una iteración.

## 9.3 Clasificación de resultado

### `INVALID`

Falla cualquier gate no compensable.

No se calcula victoria o derrota de calidad.

### `WORSE`

Pasa gates, pero empeora al menos una métrica primaria más allá de tolerancia y no existe una mejora material suficiente para considerarlo un trade-off relevante.

### `TRADEOFF`

Pasa gates y:

- mejora una o más métricas primarias;
- empeora una o más métricas primarias.

No podrá afirmarse que OptiPlan supera al humano.

El informe deberá mostrar claramente el compromiso.

### `PARITY`

Pasa gates y todas las métricas primarias quedan dentro de la banda de equivalencia respecto al humano.

### `PARETO_BETTER`

Pasa gates y:

- ninguna métrica primaria empeora más allá de tolerancia;
- al menos una métrica primaria mejora más allá de tolerancia.

Sólo `PARETO_BETTER` permite afirmar objetivamente que el planning generado supera a la referencia humana bajo este contrato.

---

# 10. Regla sobre puntuaciones agregadas

Puede existir una puntuación de resumen para visualización.

No podrá utilizarse para ocultar el detalle ni para declarar victoria si existe una regresión primaria.

La jerarquía será siempre:

```text
hard gates
→ clasificación comparativa
→ KPIs individuales
→ score agregado opcional
```

Nunca al revés.

---

# 11. Informe de Calidad del Planning en producto

El mismo evaluador utilizado en benchmark deberá alimentar un informe visible en la aplicación.

Nombre recomendado:

> **Informe de Calidad del Planning**

## 11.1 Cabecera

Mostrar como mínimo:

- estado de completitud;
- estado hard-valid;
- clasificación comparativa si existe referencia;
- continuidad del flujo principal;
- makespan;
- permanencia total de concursantes;
- P90 y máximo de permanencia;
- espera evitable;
- presencia agregada de recursos críticos;
- bloques/setups;
- robustez.

## 11.2 Detalle por concursante

Mostrar:

- primera obligación;
- última obligación;
- permanencia;
- tiempo activo;
- comida;
- transición hard;
- espera evitable;
- número de cambios de espacio;
- comparación con referencia.

## 11.3 Detalle por recurso

Mostrar:

- primer uso;
- último uso;
- presence span;
- bloques;
- huecos;
- espera evitable;
- cambios de ubicación;
- comparación con referencia.

## 11.4 Detalle por espacio

Mostrar:

- intervalo operativo;
- tiempo productivo;
- setup;
- pausa autorizada;
- gap no autorizado;
- utilización;
- continuidad;
- comparación con referencia.

## 11.5 Evolución futura

El mismo modelo deberá poder comparar:

- plan generado vs. referencia humana;
- plan A vs. plan B;
- plan publicado vs. ejecución real;
- ejecución de hoy vs. históricos.

No se crearán fórmulas distintas para benchmark y producto.

---

# 12. Evidence mínima del benchmark A2

Cada ejecución oficial A2 integral deberá conservar:

- versión del corpus A2;
- fingerprint de input;
- versión de configuración efectiva;
- SHA del código;
- motor y modo;
- seed, si existe y es parte explícita del contrato;
- resultado de hard gates;
- KPIs humanos;
- KPIs OptiPlan;
- delta por KPI;
- clasificación `INVALID | WORSE | TRADEOFF | PARITY | PARETO_BETTER`;
- tiempo;
- backtracks;
- stop reason;
- explicación de las principales diferencias;
- para estructuras futuras críticas: amplitud de ventana efectiva, carga mínima, holgura/ratio, tamaño del dominio y witness conservado o causa de dominio cero;
- para estructuras parcialmente ordenadas: fase, permutación/matching elegido y evidencia de que no se impuso una permutación humana como hard;
- artefacto de planning resultante.

La Evidence debe permitir reproducir la comparación.

---

# 13. Benchmark focal vs. A2 integral

No toda iteración necesita ejecutar el A2 integral si una capacidad todavía se valida mejor con un escenario focal.

Se aplicará esta estrategia:

```text
test unitario / contrato
→ benchmark focal causal
→ suite representativa
→ A2 integral candidato
→ merge gate
```

Sin embargo:

- una cadena prolongada de iteraciones del motor no puede considerarse exitosa sin comprobar periódicamente A2 integral;
- antes de declarar una fase del planificador completada, A2 integral será obligatorio;
- ninguna mejora focal podrá aceptarse como “mejora del producto” si A2 integral demuestra una regresión relevante.

---

# 14. Regla anti-overfitting

A2 es el benchmark humano oficial inicial.

No es el producto.

Queda prohibido introducir en lógica genérica:

- IDs A2;
- nombres de concursantes;
- nombres de platós;
- horas humanas;
- orden humano;
- número concreto de participantes;
- duraciones específicas salvo que procedan de configuración;
- pesos ajustados exclusivamente para obtener el planning A2;
- excepciones por nombre o escenario.

Una mejora válida debe proceder de una regla operativa general, configuración explícita o mecanismo de búsqueda generalizable.

---


---

# PARTE III — Control de rumbo

La pregunta rectora es:

> ¿Cuál es el siguiente paso de mayor valor y menor riesgo para avanzar el nivel A2-ASSIST actualmente bloqueado y, una vez completado el día, mejorar la calidad final frente a la referencia humana?

Si varias iteraciones no mejoran el resultado causal, se detiene la expansión, se revisa Evidence y se simplifica o retira el mecanismo improductivo.

A2 nunca autoriza hardcodes de nombres, IDs, horas o posiciones humanas.
