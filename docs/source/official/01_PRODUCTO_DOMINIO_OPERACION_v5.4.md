# OPTIPLAN — PRODUCTO, DOMINIO Y OPERACIÓN

**Versión:** 5.4<br>
**Fecha:** 24 de octubre de 2026<br>
**Estado:** Fuente oficial consolidada  
**Sustituye:** PRD v2.1, Especificación Maestra de Dominio y Operación v4, Documento de Operativa/UI/Inteligencia v0.1 y el contrato estable del Reenfoque Assisted v1.0.

## Aclaración v5.4 — obligaciones posteriores y restauración (24/10/2026)

Aclara §§3.5 y 3.10 según decisión humana P0-U00n: el checkpoint histórico permanece literal; la proyección operativa conserva las altas posteriores pendientes. No altera configuración, locks ni realidad de ejecución.

## Aclaración v5.3 — continuidad y setup independientes (22/10/2026)

**Decisión explícita de producción:** cada espacio configura dos autoridades ortogonales, **continuidad temporal** y **agrupación por setup**, ambas con `OFF | PREFERRED | REQUIRED`.

- Continuidad: `REQUIRED` exige que, desde la primera hasta la última actividad del tramo, no haya huecos internos salvo pausas operativas explícitamente autorizadas (por ejemplo cinco minutos entre actividades de Totales); `PREFERRED` minimiza y penaliza huecos sin declararlos inválidos; `OFF` es indiferente a los huecos. No obliga a ocupar antes del comienzo ni después del final.
- Setup: es el **estado/familia de actividad del espacio**, no su contigüidad temporal. `REQUIRED` prohíbe cambiar a otra familia hasta terminar la anterior y prohíbe regresar; `PREFERRED` prefiere agrupar, pero **permite reentradas** con penalización de cambios; `OFF` no limita ni favorece agrupar por familia.
- Preparación física: si se declara un montaje al cambiar de familia, ocupa el espacio antes de la primera tarea de **cada nueva entrada o reentrada permitida**, también en `PREFERRED`. La preparación es hard; la preferencia de orden no convierte el montaje en algo opcional. La primera entrada del día sólo lleva montaje previo si la configuración lo exige. `OFF` no inventa preparaciones por defecto y no elimina operaciones físicas independientes declaradas.
- Una espera entre dos actividades de una misma familia **no es reentrada de setup**. Puede incumplir continuidad REQUIRED si no está autorizada, aunque el setup sea REQUIRED.
- No inferir una autoridad a partir de otra. Mantener explícitas severidades, provenance, snapshots, validación y penalizaciones, sin reinterpretar silenciosamente días o Stages anteriores.

## 1. Misión de producto

OptiPlan es el sistema operativo de un día de producción audiovisual. Su producto principal es **planificación asistida por etapas**: el jefe de producción gobierna la construcción del día y OptiPlan elimina trabajo combinatorio, analiza el estado, propone un scope, valida consecuencias, conserva checkpoints y protege decisiones aceptadas frente a movimientos automáticos posteriores.

El one-click/Autopilot queda como nivel futuro de automatización. No constituye el gate inicial del producto y, cuando exista, deberá reutilizar las mismas capacidades Assisted sobre scopes mayores.

## 2. Principios no negociables

- La producción tiene que salir.
- Producción primero: una solución técnicamente elegante pero inejecutable no es aceptable.
- El motor propone; el humano decide.
- `done` e `in_progress` no se mueven ni reasignan.
- La replanificación automática actúa sólo sobre trabajo permitido.
- Configuración antes que hardcode.
- Relaciones por IDs/contratos estructurados, nunca por nombres del benchmark.
- Determinismo y Evidence reproducible para toda decisión automática.
- La verdad de validación nunca se oculta para acomodar una decisión humana.

## 3. Modelo Assisted autoritativo

### 3.1 WorkingPlan
Estado de trabajo visible y editable del día. Puede estar incompleto o contener conflictos durante edición.

### 3.2 PlanningScope
Conjunto explícito de obligaciones que se pide resolver en una iteración. Puede ser un espacio, bloque, unidad, grupo de tareas o el día completo. Antes de ejecutar se resuelve a IDs concretos.

### 3.3 ScopeProposal
Única propuesta automática para el scope solicitado. No modifica el plan aceptado hasta incorporarse al Draft y aceptar el Stage.

### 3.4 Draft
Estado mutable entre el último Stage aceptado y el siguiente checkpoint.

### 3.5 Stage
Checkpoint inmutable del **planning completo** después de propuesta, edición, validación y aceptación humana. No es un delta ni pertenece a un scope: el scope describe qué se pidió resolver y el Stage conserva el estado completo resultante, su `snapshotFingerprint`, la revisión de configuración usada como provenance, la validación y la Evidence aplicable.

Rollback a un Stage restaura exactamente su snapshot de planning. Los Stages posteriores permanecen en historial. Puede existir redo mientras no se haya aceptado una nueva rama; si desde un Stage antiguo se acepta un nuevo hijo, el futuro anterior queda archivado como otra rama histórica.

Cuando existen obligaciones admitidas después del Stage restaurado, se restauran exactamente sus decisiones de planning y se conservan las obligaciones posteriores pendientes, sin placement aceptado. El estado operativo resultante es una proyección explícita del Stage y esas obligaciones, con origen y provenance propios; no es el snapshot histórico del Stage ni modifica su identidad o fingerprint. El Draft y el origen vigente contienen todas las obligaciones actuales. Redo restaura las decisiones del hijo y conserva pendientes las obligaciones posteriores que aún no existían en él. La divergencia archiva el futuro anterior sin borrar obligaciones. Una restauración incompatible con tareas `done` o `in_progress` se bloquea con diagnóstico específico.

### 3.6 AutomaticProtection
Una posición aceptada queda fija para **movimientos automáticos posteriores**. El humano puede editarla de nuevo en otro Stage. No se materializan cientos de locks sólo por aceptar un Stage.

### 3.7 Lock
Restricción explícita de tiempo, espacio, recurso o combinación, creada porque producción desea impedir cambios de esa dimensión. El motor no lo degrada a preferencia.

### 3.8 AcceptedException
Registro local, estructurado y auditable de una desviación `HARD` o `REQUIRED` concreta aceptada por el jefe. No desactiva la regla global ni autoriza al motor a crear nuevas violaciones.

Una excepción `ACTIVE` puede hacer grandfathering únicamente de la misma identidad material de violación mientras sus tareas afectadas permanezcan materialmente intactas. Si una tarea afectada se modifica, la excepción deja de ser aplicable (`STALE`/`SUPERSEDED`) y el nuevo estado se valida con la configuración vigente. Una nueva revisión de configuración no reabre por sí sola decisiones antiguas intactas.

### 3.9 OfficialPlan
Plan completo que producción decide publicar. Debe mostrar su estado real: válido, con preferencias incumplidas o con excepciones críticas aceptadas.

### 3.10 Configuración, rollback y producto consolidado

Rollback de planning **no** revierte la configuración vigente del día. Cada Stage conserva la revisión que utilizó para auditoría, pero una nueva intervención desde un Stage restaurado usa la EffectiveConfig actual.

`daily_tasks` representa el último planning aceptado/consolidado, nunca el Draft. Aceptar Stage y hacer rollback actualizan/restauran `daily_tasks` desde el snapshot del Stage de forma atómica según 04.

## 4. Reglas y severidades

### HARD / conflicto crítico
Incompatibilidad física, contractual o de integridad: solape imposible, recurso exclusivo duplicado, espacio incompatible, disponibilidad real, capacidad, dependencia dura, transición dura, conflicto con `done/in_progress` o lock real.

- El generador automático no puede crear conscientemente un nuevo HARD.
- El usuario puede producir temporalmente un estado conflictivo al editar.
- El jefe puede aceptar el Stage con confirmación explícita.
- La excepción queda auditada y `hardValid` permanece `false` mientras exista la condición.

### REQUIRED
Policy que el generador automático debe cumplir al 100 %. Si no puede, devuelve blocker; no la relaja silenciosamente. El humano puede desviarse manualmente y aceptar tras aviso. Esa aceptación no cambia la policy global.

### PREFERRED
Objetivo soft cuantificable. Puede incumplirse para obtener una solución global mejor o viable y debe quedar explicado.

### OFF
La policy no participa.

### QUALITY
Métricas comparativas sin enforcement directo: makespan, permanencia, gaps, cambios, desplazamientos, robustez, fragmentación, libertad futura.

## 5. Dominio del día

Un día contiene, como mínimo:

- intervalo operativo editable;
- participantes y disponibilidad;
- zonas y espacios;
- plantillas e instancias de tareas;
- recursos humanos/técnicos y capacidades;
- asignaciones efectivas;
- dependencias y operaciones conjuntas;
- transiciones, setups, blocks y unidades itinerantes;
- comidas/pausas por entidad o unidad aplicable;
- estados de ejecución, locks, Stages y AcceptedExceptions;
- configuración efectiva versionada.

No existe una comida global implícita que bloquee todo el sistema.

## 6. Configuración general, snapshot y override

Al crear un día se materializa un snapshot reproducible. Cambios posteriores en configuración general **no modifican silenciosamente** días existentes. El usuario puede actualizar de forma explícita una categoría o toda la configuración tras comparar diferencias; esa operación crea una nueva revisión de configuración del día.

Precedencia conceptual:

`lock/estado protegido > override de instancia > configuración efectiva del día > snapshot heredado > configuración general > default documentado`.

## 7. Entidades operativas

### Zonas y espacios
Cada espacio posee disponibilidad, capacidad, comida/pausa aplicable, setups, continuidad y recursos asignados. La zona expresa relaciones operativas configuradas; no se deduce por nombre.

### Participantes
No pueden solaparse consigo mismos. Disponibilidad, transiciones, transporte, comidas y overrides son datos efectivos del día.

### Tareas
Plantilla configurable + instancia diaria. Una instancia conserva identidad, duración productiva, espacio o alternativas, participantes, dependencias, recursos, setup, ventana y reglas efectivas. Preparaciones, holds o transiciones no se suman silenciosamente a la duración productiva: se representan como ocupaciones/operaciones separadas cuando corresponda.

### Recursos
Un recurso concreto tiene identidad, disponibilidad, capacidad, compatibilidad, transición, comida/presencia y asignaciones efectivas. Una asignación concreta no puede sustituirse silenciosamente por “otro del mismo tipo”. Requisitos genéricos y asignaciones concretas son contratos distintos.

### Auxiliares
Sólo son requeridos cuando la tarea/configuración efectiva lo indique. La simultaneidad y atención exclusiva son configurables; no existe la regla universal antigua “toda tarea requiere 1 auxiliar”.

### Banda e instrumento
`requiresBand` tiene efecto operativo. `usesInstrument` e `instrumentAnnotation` son informativos salvo que producción configure explícitamente otra operación/recurso. La Banda se representa como recurso genérico, nunca mediante hardcodes de nombre.

## 7A. Contrato de dominio detallado vigente

Este apartado reintegra semántica estable de la Especificación Maestra v4 que no debe perderse por la consolidación. Las antiguas reglas “toda edición crea lock” y “HARD/REQUIRED jamás puede aceptarse” quedan sustituidas por Assisted y **no** forman parte de este contrato.

### Escala de referencia
La aplicación debe comportarse defensivamente con jornadas del orden de 20–25 participantes, aproximadamente 25 espacios activos, 5–10 tareas por participante, 8–15 auxiliares, varias cámaras/coaches y cientos de obligaciones. Son magnitudes de diseño, no hardcodes.

### Zonas
En el MVP, compartir zona representa cercanía operacional. La zona puede limitar simultaneidad de auxiliares y ayudar a minimizar desplazamientos. Los nombres concretos de platós nunca forman parte de las reglas. Subzonas o una matriz explícita de distancias quedan como evolución futura.

### Auxiliar y ayudante
Un Auxiliar sólo es requerido por tareas cuya configuración efectiva lo declare. Puede simultanear **hasta tres** tareas únicamente cuando están en la misma zona y ninguna exige atención exclusiva; afinidades/preferencias son soft y la atención exclusiva es configurable.

Un Ayudante puede ver, marcar estados y editar según permisos. Toda modificación auditable identifica quién, qué y cuándo. Una edición no crea lock automáticamente; el lock sólo nace de una decisión explícita.

### Plantilla e instancia de tarea
Campos mínimos de plantilla, cuando apliquen: nombre, duración por defecto, espacio fijo o alternativas, ventana típica, dependencia típica, coach/presentador, cámaras/recursos, simultaneidad, atención exclusiva de auxiliar, setup/familia y elegibilidad para operación técnica sin participante.

La instancia diaria puede aplicar overrides de duración, espacio, dependencia, recursos efectivos, setup/condición operativa, participantes, ventana, locks explícitos y grupo sincronizado. Las obligaciones técnicas sin participante son válidas cuando están modeladas explícitamente.

### Recursos y presencia
Todo recurso usa un contrato genérico: identidad, disponibilidad, capacidad, compatibilidad, asignaciones, transición, comida aplicable y política de presencia. La Banda es un recurso genérico y no una excepción del motor.

`presenceConcentrationPolicy = OFF | PREFERRED | REQUIRED`:

- `OFF`: no optimiza concentración, manteniendo el resto de restricciones.
- `PREFERRED`: intenta minimizar, por orden, bloques de intervención, intervalo entre primera/última intervención, huecos internos y salidas/regresos innecesarios.
- `REQUIRED`: para una **propuesta automática**, las tareas que requieren el recurso forman el bloque operativo exigido por la policy; pausas autorizadas configuradas no cuentan como hueco/reentrada. Una desviación manual sólo puede sobrevivir mediante el contrato de aceptación humana de Assisted y sin falsear la policy.

Para recursos con concentración se derivan, como mínimo, `requiredTaskCount`, `plannedTaskCount`, `presenceStart`, `presenceEnd`, `presenceSpanMinutes`, `operationalBlockCount`, `internalGapMinutes`, `crossesAuthorizedMeal`, policy efectiva, cumplimiento y penalización preferente. Evidence explica por qué empieza/termina la presencia y qué impidió compactarla más.

### Robustez de datos
Relaciones incompletas producen placeholders/diagnósticos, no crash. Los datos críticos se validan antes de planificar y los reason codes son estables, ordenados y deterministas.

## 8. Asignación efectiva de recursos

Una tarea consume la unión determinista de recursos asignados explícitamente a:

1. la tarea;
2. su espacio efectivo;
3. su zona/unidad cuando exista un contrato explícito de herencia.

Las reglas de autocreación sólo inicializan datos. Después manda el estado efectivo editado por el usuario.

## 9. Flujo operativo Assisted

1. Crear/abrir día y configuración efectiva.
2. Analizar el estado y riesgos.
3. Elegir o aceptar un scope recomendado.
4. Solicitar una propuesta automática.
5. Incorporarla al Draft.
6. Editar libremente.
7. Validar el Stage.
8. Aceptar Stage o seguir editando.
9. Repetir con otro scope alrededor de lo ya aceptado.
10. Publicar el OfficialPlan cuando producción lo decida.

El motor no debe recalcular después de cada drag. La generación se solicita explícitamente.

## 10. Planning Workspace

La vista de planificación debe contener como mínimo:

- barra de Stages/checkpoints y rollback;
- árbol/selector de scopes;
- timeline global central;
- highlight de la propuesta actual;
- panel del scope y blockers;
- validación con HARD/REQUIRED/PREFERRED diferenciados;
- pendientes y completitud del día;
- origen/versión de configuración efectiva.

La UI nunca muestra IDs técnicos ni errores crudos cuando puede expresar el problema en lenguaje operativo.

## 11. Ejecución en vivo

Estados: `pending | in_progress | done | interrupted | cancelled`.

- Start fija el inicio real.
- Finish fija el final real.
- Interrupt conserva la parte ejecutada y crea/reabre trabajo pendiente según contrato.
- `done/in_progress` son inmutables para replanificación.
- La realidad manda sobre el plan; las vistas deben diferenciar plan vs ejecución.

## 12. Roles

- **Admin:** configuración, permisos, estructura del día, diagnósticos y operaciones críticas.
- **Producción/jefe:** scopes, propuestas, edición, validación, aceptación de Stages, excepciones, publicación y control en vivo.
- **Ayudante:** edición/operación según permisos y flujo de validación.
- **Auxiliar:** ejecución y estados, sin autoridad global de planning salvo permiso explícito.
- **Responsables de plató/recursos:** vistas operativas focales y estado de bloqueos/riesgos.
- **Viewer/dirección:** visibilidad sin edición según permisos.

## 13. Pre-día, día en vivo y post-día

El MVP prioritario cubre preparación, planificación Assisted, ejecución en vivo y vistas operativas. Histórico, informes avanzados, analítica predictiva y planificación multi-día no deben bloquear el MVP; pueden incorporarse posteriormente cuando existan datos reales fiables.

## 14. Publicación

Un ScopeProposal o Draft parcial puede ser útil dentro del workspace, pero **no es un OfficialPlan**.

La publicación final debe:

- representar el planning completo que producción decide ejecutar;
- preservar identidades y decisiones aceptadas;
- mostrar si existen HARD activos y AcceptedExceptions;
- no etiquetar como hard-valid un plan que no lo sea;
- conservar Evidence y revisión de configuración usada.

## 15. Antipatrones

Queda prohibido:

- hardcodear nombres/IDs/horas del benchmark;
- convertir toda edición en lock;
- inferir recursos por categoría o nombre;
- ocultar parciales como OfficialPlan;
- falsear `hardValid` por una excepción humana;
- sincronizar configuración general con días existentes sin acción explícita;
- crear un rule engine genérico opaco en lugar de contratos tipados;
- duplicar Planner/validator en la capa Assisted.

## 16. Regla final

OptiPlan no sustituye el criterio del jefe de producción. Sustituye el trabajo combinatorio que no debería tener que hacer a mano.


---

# ANEXO A — Catálogo detallado de operación/UI heredado

Este anexo conserva únicamente detalle operativo/UI útil. Los encabezados y metadatos de la antigua pieza se mantienen sólo como provenance editorial y **no identifican una Fuente separada**. Sus referencias al antiguo flujo de planificación han sido normalizadas al contrato Assisted; no se debe inferir de este anexo lock automático, one-click obligatorio, aceptación exclusivamente hard-valid ni consolidación automática. Día en vivo, roles, Control Room, métricas y post-día mantienen su valor de producto.

# Documento de Operativa, UI e Inteligencia de Producción

Versión: 0.1
Estado: Documento estratégico de producto
Ámbito: UI, operación en vivo, medición, seguimiento, comunicación e informes futuros
Relación documental vigente: este catálogo está integrado en la Fuente 01; producto/dominio se rigen por sus capítulos 1–16 y la arquitectura ORC por la Fuente 02.

---

# 1. Propósito del documento

Este documento define cómo debe evolucionar OptiPlan desde una aplicación de planificación hacia un verdadero sistema operativo del día de producción audiovisual.

OptiPlan no debe limitarse a generar una planificación válida.

Debe permitir:

* preparar el día;
* ejecutar el día en tiempo real;
* saber qué está ocurriendo;
* detectar riesgos antes de que rompan la jornada;
* comunicar claramente a cada persona qué tiene que hacer;
* reaccionar ante retrasos, bajas, interrupciones y cambios;
* conservar evidencia de lo que ocurrió;
* extraer conclusiones para mejorar futuras jornadas.

El objetivo final no es solo que el motor planifique mejor que una persona.

El objetivo es que toda la producción funcione mejor porque la información está ordenada, es visible, es accionable y se convierte en aprendizaje operativo.

La producción tiene que salir.

---

# 2. Principio central

OptiPlan es el sistema operativo del día de producción.

Esto implica una diferencia fundamental:

* Un planificador responde: “¿A qué hora va cada tarea?”
* Un sistema operativo responde: “¿Está el día bajo control?”

OptiPlan debe responder continuamente a cinco preguntas:

1. ¿Qué está pasando ahora?
2. ¿Qué debería estar pasando ahora?
3. ¿Qué va a pasar después?
4. ¿Qué riesgo amenaza el día?
5. ¿Qué decisión humana hace falta?

La UI debe estar al servicio de esas preguntas.

Una pantalla bonita que no ayude a decidir es ruido.

Un indicador que no cambia ninguna acción es decoración.

Un informe que no permite mejorar la siguiente jornada es archivo muerto.

---

# 3. Alcance estratégico

Este documento cubre tres momentos del ciclo operativo.

## 3.1 Pre-día

Fase de preparación.

Objetivo: construir una jornada viable antes de que empiece la producción.

Incluye:

* configuración del día;
* selección de talents;
* asignación de tareas;
* definición de recursos disponibles;
* disponibilidad de espacios;
* restricciones particulares del día;
* generación del plan;
* edición manual;
* locks;
* validación del plan;
* publicación de vistas por rol.

## 3.2 Día en vivo

Fase de ejecución.

Objetivo: controlar la realidad, no solo visualizar el plan.

Incluye:

* inicio y fin real de tareas;
* interrupciones;
* cancelaciones;
* retrasos;
* incidencias;
* replanificación de lo pendiente;
* comunicación a equipos;
* seguimiento de desviaciones;
* control de recursos críticos;
* alertas operativas;
* estado del día en tiempo real.

## 3.3 Post-día

Fase de análisis.

Objetivo: convertir la ejecución real en conocimiento útil.

Incluye:

* comparación plan vs realidad;
* causas de retraso;
* duración real por tipo de tarea;
* rendimiento por espacio;
* rendimiento por recurso;
* incidencias recurrentes;
* fiabilidad de la planificación;
* recomendaciones para siguientes jornadas;
* exportes e informes.

El post-día no debe implementarse antes de tener datos fiables de ejecución. Primero se mide bien. Después se informa.

---

# 4. Principios no negociables de UI y operación

## 4.1 Claridad antes que estética

La UI puede y debe ser llamativa, pero nunca a costa de la comprensión.

Un usuario debe saber en menos de cinco segundos:

* dónde está;
* qué está viendo;
* qué va bien;
* qué va mal;
* qué necesita acción.

## 4.2 La realidad manda sobre el plan

El plan es una intención.

La ejecución real es la verdad operativa.

Cuando una tarea empieza, termina, se retrasa o se interrumpe, la UI debe reflejarlo inmediatamente.

## 4.3 Lo ejecutado no se toca

Toda pantalla, acción o replanificación debe respetar que las tareas en curso o terminadas no se modifican.

La UI debe proteger este principio visual y funcionalmente.

## 4.4 El humano decide

El motor propone.

La UI debe explicar.

El humano decide; su aceptación puede registrar una `AcceptedException` sin alterar la policy global.

Ninguna acción crítica debe quedar escondida detrás de automatización opaca.

## 4.5 No mostrar complejidad técnica al usuario operativo

No deben mostrarse IDs técnicos, errores crudos ni mensajes internos.

El sistema debe traducir problemas técnicos a lenguaje operativo.

Incorrecto:

“Missing prereq task_id 54”

Correcto:

“No se puede colocar ‘Ensayo en Plató’ porque falta completar antes ‘Vocal’ para Cristina.”

## 4.6 Cada rol ve lo que necesita

No todas las personas necesitan una vista global.

Un auxiliar necesita saber qué hacer ahora.

Producción necesita ver riesgos.

Dirección necesita estado global.

Un responsable de plató necesita saber si su espacio está bloqueando el día.

## 4.7 Todo indicador debe ser accionable

Un KPI solo debe existir si ayuda a tomar una decisión.

Ejemplos de indicadores accionables:

* “Plató principal parado 12 minutos”
* “Talent con salida temprana en riesgo”
* “Coach fragmentado en 5 bloques”
* “ETA fin del día +38 min”
* “3 tareas pendientes dependen de recurso no disponible”

Ejemplos de indicadores débiles:

* “Número total de tareas”
* “Porcentaje de uso” sin contexto
* “Media general” sin causa ni acción

---

# 5. Perfiles operativos

## 5.1 Admin

Responsabilidad:

Configurar el sistema, mantener reglas, validar estructura del día y resolver bloqueos críticos.

Necesita ver:

* configuración general;
* catálogo de tareas;
* zonas y espacios;
* recursos;
* reglas;
* locks activos;
* errores estructurales;
* permisos;
* validación del plan;
* estado completo del sistema.

Puede hacer:

* configurar entidades;
* generar planificación;
* editar todo;
* liberar locks;
* aceptar o rechazar cambios críticos;
* revisar diagnósticos;
* activar vistas y modos.

Pantallas prioritarias:

* Settings;
* Day Setup;
* Planning;
* Locks;
* Control Room;
* Diagnóstico ORC;
* War Room.

## 5.2 Producción

Responsabilidad:

Operar el día, tomar decisiones, coordinar cambios y mantener la jornada viva.

Necesita ver:

* estado global;
* tareas en curso;
* próximas tareas críticas;
* retrasos;
* ETA de finalización;
* conflictos;
* incidencias;
* recursos saturados;
* talentos en riesgo;
* cambios pendientes de validación;
* locks relevantes.

Puede hacer:

* marcar estados;
* editar planificación según permisos;
* retrasar tareas;
* solicitar o aplicar replanificación;
* registrar incidencias;
* asignar causas de retraso;
* comunicar cambios;
* pedir validación al Admin si procede.

Pantallas prioritarias:

* Control Room;
* Dashboard;
* Timeline;
* War Room;
* Planning;
* Mi Día;
* Vista Plató;
* Vista Talent.

## 5.3 Auxiliar

Responsabilidad:

Ejecutar tareas, acompañar personas, marcar estados y mantener el flujo real.

Necesita ver:

* su próxima tarea;
* ubicación;
* hora prevista;
* hora real si cambia;
* talent implicado;
* espacio;
* con quién va;
* recursos necesarios;
* si va tarde;
* cambios de última hora.

Puede hacer:

* Start;
* Finish;
* Interrupt;
* Cancel si tiene permiso;
* reportar incidencia simple;
* indicar retraso;
* ver su agenda.

No debe necesitar:

* entender el motor;
* ver todo el día completo;
* resolver conflictos globales;
* gestionar locks complejos.

Pantalla prioritaria:

* Mi Día.

## 5.4 Ayudante

Responsabilidad:

Coordinar ejecución y realizar ajustes operativos controlados.

Necesita ver:

* su agenda;
* agenda de auxiliares asociados;
* estado de espacios;
* cambios recientes;
* tareas con riesgo;
* incidencias;
* locks que afectan a su área.

Puede hacer:

* marcar estados;
* editar planificación según permisos;
* aplicar cambios menores;
* pedir validación;
* registrar incidencias;
* comunicar retrasos.

Pantallas prioritarias:

* Mi Día;
* Dashboard;
* Timeline;
* Vista Plató;
* War Room.

## 5.5 Responsable de plató

Responsabilidad:

Garantizar que un espacio o flujo concreto se mantiene operativo.

Necesita ver:

* tareas de su plató;
* tarea actual;
* siguiente tarea;
* huecos;
* retraso acumulado;
* recursos que faltan;
* talent que debe llegar;
* si el plató está bloqueando el día;
* continuidad del flujo.

Puede hacer:

* marcar disponibilidad del espacio;
* reportar bloqueo;
* indicar retraso;
* confirmar que el plató está listo;
* ver dependencias entrantes y salientes.

Pantalla prioritaria:

* Vista Plató.

## 5.6 Dirección / Producción ejecutiva

Responsabilidad:

Entender si el día está bajo control sin entrar en microgestión.

Necesita ver:

* estado global;
* avance del día;
* ETA fin de jornada;
* desviación respecto al plan;
* riesgos críticos;
* espacios parados;
* principales causas de retraso;
* decisiones pendientes;
* resumen de rendimiento.

No necesita ver:

* edición granular;
* IDs;
* configuración;
* detalles de motor salvo diagnóstico resumido.

Pantalla prioritaria:

* Control Room modo Director.

## 5.7 Redacción / Reality

Responsabilidad:

Seguir tareas relacionadas con contenido, entrevistas, recursos narrativos y necesidades editoriales.

Necesita ver:

* talents relacionados;
* tareas propias;
* localizaciones;
* recursos necesarios;
* ventanas de disponibilidad;
* dependencias;
* cambios de orden;
* incidencias de contenido.

Pantallas prioritarias:

* Mi Día;
* Vista Talent;
* Vista Recurso;
* Call Sheet por área.

## 5.8 Cámara / Sonido / Equipos técnicos

Responsabilidad:

Saber dónde deben estar los equipos y qué necesidades técnicas tiene cada tarea.

Necesita ver:

* cámara asignada;
* sonido asignado;
* ubicación;
* tarea actual;
* próxima tarea;
* setup requerido;
* si hay audio o no;
* si hay cambio de espacio;
* posibles solapes.

Pantallas prioritarias:

* Mi Día;
* Vista Recurso;
* Vista Plató.

## 5.9 Coach / Presentadora / Recurso crítico

Responsabilidad:

Ejecutar bloques de trabajo que condicionan muchas dependencias.

Necesita ver:

* agenda propia;
* próximos talents;
* descansos;
* retrasos;
* cambios de orden;
* tareas que dependen de él/ella;
* tiempo estimado restante.

Pantallas prioritarias:

* Mi Día;
* Vista Recurso.

## 5.10 Viewer

Responsabilidad:

Consultar información sin alterar el día.

Necesita ver:

* vistas permitidas;
* estado general o individual según permisos;
* sin controles de edición;
* sin configuración.

Pantallas prioritarias:

* Mi Día;
* Control Room limitado;
* Vista Plató limitada.

---

# 6. Arquitectura de pantallas

## 6.1 Home / Selector de día

Objetivo:

Entrar rápidamente al día correcto y saber su estado.

Debe mostrar:

* días configurados;
* estado del día: borrador, planificado, en ejecución, finalizado;
* último planning activo;
* estado de validación;
* incidencias abiertas;
* acceso rápido a “continuar día”.

Acciones:

* crear día;
* abrir día;
* duplicar estructura si procede;
* validar configuración;
* acceder a planning activo.

Prioridad:

Media. No es el centro operativo, pero debe ser clara.

## 6.2 Day Setup

Objetivo:

Preparar la jornada.

Debe mostrar:

* horario base;
* comida global;
* recursos disponibles;
* espacios disponibles;
* talents del día;
* tareas asignadas;
* restricciones particulares;
* reglas activas;
* validación de datos mínimos.

Debe evitar:

* generar planificación con datos estructuralmente incompletos;
* permitir configuración ambigua sin aviso;
* ocultar relaciones faltantes.

Acciones:

* añadir talents;
* asignar tareas;
* ajustar duración;
* definir disponibilidad;
* definir recursos;
* validar día;
* generar planning.

Prioridad:

Alta en pre-día.

## 6.3 Planning / Timeline global

Objetivo:

Ver la planificación completa con detalle suficiente para revisar, editar y validar.

Debe mostrar:

* tareas por tiempo;
* espacios;
* talents;
* auxiliares;
* locks;
* estado de cada tarea;
* dependencias;
* conflictos;
* desviaciones si el día ya está en vivo.

Modos mínimos:

* por espacios;
* por talents;
* por recursos;
* vista compacta;
* vista detallada.

Acciones:

* editar tarea;
* crear lock;
* liberar lock;
* replanificar pendiente;
* inspeccionar conflicto;
* abrir detalle.

Prioridad:

Alta.

## 6.4 Mi Día

Objetivo:

Pantalla principal para usuarios operativos.

Debe responder:

* ¿qué tengo que hacer ahora?
* ¿dónde tengo que estar?
* ¿con quién?
* ¿qué viene después?
* ¿voy tarde?
* ¿ha cambiado algo?

Debe mostrar:

* tarjeta de tarea actual;
* próxima tarea;
* agenda del día;
* cambios recientes relevantes;
* ubicación;
* talent;
* recurso;
* hora planificada;
* hora real;
* estado;
* acciones permitidas;
* avisos.

Diseño:

* móvil primero;
* botones grandes;
* poco texto;
* jerarquía muy clara;
* modo oscuro útil en set;
* estados visibles por color e icono.

Acciones:

* Start;
* Finish;
* Interrupt;
* Cancel si procede;
* Reportar retraso;
* Reportar incidencia;
* Ver detalle.

Prioridad:

Muy alta.

Esta debe ser la primera gran pantalla operativa de la fase UI.

## 6.5 Control Room

Objetivo:

Centro de mando global del día.

Debe responder:

* ¿el día está bajo control?
* ¿qué va mal?
* ¿qué puede ir mal pronto?
* ¿qué decisión hay que tomar?

Debe mostrar:

* reloj operativo;
* avance general;
* tareas pending / in_progress / done / interrupted / cancelled;
* ETA fin de jornada;
* desviación respecto al plan;
* tareas críticas próximas;
* platós parados;
* recursos saturados;
* incidencias abiertas;
* locks activos;
* cambios recientes;
* estado de realtime;
* salud del sistema.

Modos:

* Producción: accionable.
* Dirección: resumen ejecutivo.
* Técnico: diagnóstico de datos/realtime.

Acciones:

* abrir War Room;
* abrir tarea crítica;
* abrir vista de plató;
* lanzar replanificación;
* registrar incidencia;
* filtrar por zona;
* ver cambios recientes.

Prioridad:

Muy alta, pero después de consolidar Mi Día.

## 6.6 Vista Plató

Objetivo:

Dar a cada espacio una pantalla clara de operación.

Debe mostrar:

* estado del espacio;
* tarea actual;
* siguiente tarea;
* cola de tareas;
* hora prevista;
* retraso;
* talent entrante;
* recursos necesarios;
* dependencias pendientes;
* si el espacio está bloqueando el día;
* continuidad del flujo.

Para el plató o flujo principal:

* mostrar continuidad;
* detectar huecos;
* mostrar tiempo parado;
* alertar si se rompe la cadena;
* explicar causa.

Acciones:

* marcar espacio listo/no listo;
* reportar retraso;
* abrir tarea;
* ver dependencias;
* solicitar replanificación si procede.

Prioridad:

Alta.

## 6.7 Vista Talent

Objetivo:

Ver la jornada desde la perspectiva de una persona concursante/talent.

Debe mostrar:

* agenda completa;
* tarea actual;
* próximas tareas;
* esperas;
* desplazamientos;
* dependencias;
* recursos necesarios;
* hora estimada de finalización;
* tiempo de permanencia;
* riesgo por salida temprana;
* cambios de orden.

Acciones:

* abrir tarea;
* ver conflictos;
* marcar incidencia de talent;
* filtrar por estado.

Prioridad:

Alta para producción y redacción.

## 6.8 Vista Recurso

Objetivo:

Ver agenda, carga y presión de un recurso humano o técnico.

Recursos posibles:

* auxiliar;
* ayudante;
* coach;
* presentadora;
* cámara;
* sonido;
* equipo itinerante;
* pool genérico.

Debe mostrar:

* agenda del recurso;
* solapes;
* zona;
* huecos;
* presión;
* próximas tareas;
* tareas que dependen de ese recurso;
* si es cuello de botella.

Acciones:

* filtrar por recurso;
* reasignar si el rol lo permite;
* reportar baja;
* registrar retraso;
* ver impacto.

Prioridad:

Media-alta.

## 6.9 War Room

Objetivo:

Gestionar incidencias, riesgos y decisiones.

Debe mostrar:

* incidencias abiertas;
* incidencias resueltas;
* severidad;
* causa;
* tarea afectada;
* talent afectado;
* espacio afectado;
* recurso afectado;
* responsable;
* hora de creación;
* impacto estimado;
* decisión tomada;
* relación con retrasos.

Tipos de incidencia:

* retraso;
* recurso no disponible;
* espacio bloqueado;
* talent no localizado;
* tarea interrumpida;
* cambio editorial;
* problema técnico;
* cambio de prioridad;
* comida/descanso;
* otro.

Acciones:

* crear incidencia;
* asignar responsable;
* vincular a tarea;
* resolver;
* escalar;
* convertir en causa de retraso;
* solicitar replanificación.

Prioridad:

Alta, pero requiere persistencia en base de datos para ser útil de verdad.

## 6.10 Panel de Locks

Objetivo:

Convertir los locks en herramienta gestionable, no en un detalle oculto.

Debe mostrar:

* locks activos;
* tipo de lock;
* tarea afectada;
* quién lo creó;
* cuándo;
* motivo;
* impacto;
* si bloquea una replanificación;
* sugerencia de liberación si hay inviabilidad.

Tipos:

* lock horario;
* lock espacio;
* lock recurso;
* lock auxiliar;
* lock total;
* lock de ejecución;
* lock por decisión humana.

Acciones:

* liberar lock;
* confirmar liberación;
* ver impacto;
* revalidar planificación;
* abrir tarea.

Prioridad:

Alta. Forma parte de la confiabilidad.

## 6.11 Diagnóstico ORC

Objetivo:

Explicar qué ha hecho el motor y por qué.

No debe ser una pantalla para todos.

Debe servir a Admin, Producción avanzada y desarrollo.

Debe mostrar:

* estado inicial;
* oportunidades detectadas;
* candidatos generados;
* candidatos rechazados;
* candidato consolidado;
* métricas antes/después;
* restricciones que bloquearon opciones;
* evidence report;
* benchmark si aplica;
* diferencia entre planificación anterior y nueva.

Debe evitar:

* lenguaje críptico;
* listas enormes sin prioridad;
* detalles internos sin traducción operativa.

Prioridad:

Media para UI general, alta para evolución ORC.

## 6.12 Informes post-día

Objetivo:

Medir para mejorar.

No deben implementarse como primera fase. Requieren datos persistidos fiables.

Deben responder:

* ¿qué se planificó?
* ¿qué ocurrió?
* ¿dónde se desviaron los tiempos?
* ¿por qué?
* ¿qué recursos fueron cuello de botella?
* ¿qué tareas duran más de lo estimado?
* ¿qué espacios generaron esperas?
* ¿qué tipo de incidencias se repiten?
* ¿cómo mejorar el siguiente día?

Informes mínimos futuros:

* resumen ejecutivo del día;
* comparación plan vs real;
* rendimiento por espacio;
* rendimiento por tipo de tarea;
* rendimiento por recurso;
* causas de retraso;
* tareas más desviadas;
* uso de plató principal;
* permanencia de talents;
* histórico de incidencias;
* fiabilidad del motor.

Prioridad:

Fase PRO posterior.

---

# 7. Indicadores en vivo

## 7.1 Estado global del día

Indicador principal.

Debe sintetizar si el día está:

* en hora;
* con retraso leve;
* en riesgo;
* crítico;
* bloqueado;
* finalizado.

Debe calcularse combinando:

* retraso acumulado;
* tareas críticas afectadas;
* ETA fin;
* incidencias abiertas;
* espacios parados;
* recursos críticos saturados.

## 7.2 ETA de finalización

Estimación de hora de finalización del día.

Debe distinguir:

* fin planificado original;
* fin estimado actual;
* diferencia;
* confianza de la estimación;
* causa principal de variación.

No debe vender falsa precisión.

## 7.3 Desviación plan vs real

Debe mostrar:

* tarea empezó antes/tarde;
* tarea terminó antes/tarde;
* duración real vs estimada;
* retraso propagado;
* retraso absorbido.

## 7.4 Tareas en curso

Debe mostrar:

* cuántas hay;
* cuáles;
* desde cuándo;
* si exceden duración prevista;
* quién está implicado;
* dónde están.

## 7.5 Próximas tareas críticas

Una tarea es crítica si:

* pertenece al flujo principal;
* desbloquea varias tareas;
* usa recurso escaso;
* afecta a talent con ventana limitada;
* está asociada a un espacio prioritario;
* tiene dependencia rígida;
* si se retrasa impacta en ETA.

## 7.6 Espacios parados

Debe mostrar:

* espacio;
* tiempo parado;
* causa si se conoce;
* siguiente tarea esperada;
* recurso faltante;
* impacto.

Especial atención al flujo principal configurado.

## 7.7 Recursos saturados

Debe mostrar recursos con:

* demasiadas tareas consecutivas;
* solapes;
* baja holgura;
* dependencia alta;
* fragmentación;
* riesgo de retraso.

## 7.8 Talents en espera

Debe mostrar:

* tiempo de espera acumulado;
* próxima tarea;
* causa de espera;
* hora estimada de liberación;
* si supera umbral configurable.

## 7.9 Incidencias abiertas

Debe mostrar:

* número;
* severidad;
* impacto;
* responsable;
* tiempo abiertas;
* relación con tareas afectadas.

## 7.10 Locks activos

Debe mostrar:

* número total;
* locks críticos;
* locks que impiden replanificación;
* locks recientes;
* locks explícitos activos; una edición manual por sí sola no crea un lock.

---

# 8. Indicadores post-día

## 8.1 Duración real por tipo de tarea

Objetivo:

Saber si las duraciones configuradas son realistas.

Debe comparar:

* duración estimada;
* duración real media;
* desviación;
* variabilidad;
* casos extremos.

Uso:

* ajustar plantillas;
* mejorar planificación futura;
* detectar tareas subestimadas.

## 8.2 Rendimiento por espacio

Objetivo:

Entender qué espacios producen, esperan o bloquean.

Debe mostrar:

* tiempo activo;
* tiempo parado;
* tareas completadas;
* retraso acumulado;
* causas de bloqueo;
* utilización real;
* continuidad.

## 8.3 Rendimiento por recurso

Objetivo:

Detectar presión, saturación o infrautilización.

Debe mostrar:

* tareas asignadas;
* tiempo activo;
* tiempo de espera;
* solapes;
* cambios de zona;
* retrasos asociados;
* incidencias.

Debe evitar interpretaciones injustas: el rendimiento de una persona no siempre depende de ella.

## 8.4 Fiabilidad del plan

Objetivo:

Medir si el planning era realista.

Debe mostrar:

* porcentaje de tareas iniciadas en hora;
* porcentaje terminadas en hora;
* desviación media;
* desviación por tipo de tarea;
* replanificaciones necesarias;
* locks que condicionaron el día;
* tareas no realizadas.

## 8.5 Causas de retraso

Objetivo:

Saber por qué se pierde tiempo.

Categorías iniciales:

* talent no disponible;
* recurso humano no disponible;
* espacio no disponible;
* problema técnico;
* tarea anterior se alarga;
* cambio editorial;
* espera por dependencia;
* comida/descanso;
* decisión manual;
* otro.

Cada causa debe vincularse, cuando sea posible, a:

* tarea;
* espacio;
* recurso;
* talent;
* hora;
* impacto estimado.

## 8.6 Permanencia de talents

Objetivo:

Reducir tiempo innecesario de estancia.

Debe mostrar:

* hora de llegada;
* primera tarea;
* última tarea;
* hora de liberación;
* tiempo activo;
* tiempo de espera;
* esperas largas;
* permanencia total.

## 8.7 Continuidad del flujo principal

Objetivo:

Evaluar si el espacio/flujo principal se mantuvo en marcha.

Debe mostrar:

* tiempo total activo;
* huecos;
* duración de huecos;
* causas de paradas;
* tareas críticas afectadas;
* impacto sobre fin de jornada.

---

# 9. Modelo conceptual de datos operativos

Este apartado no define todavía migraciones. Define qué información debe existir para que la UI y los informes sean reales.

## 9.1 Plan

Representa la intención.

Debe conservar:

* tareas planificadas;
* horarios previstos;
* recursos asignados;
* espacios asignados;
* dependencias;
* locks;
* versión del motor;
* fecha de generación;
* usuario que aprueba;
* estado del plan.

## 9.2 Ejecución real

Representa lo ocurrido.

Debe conservar:

* inicio real;
* fin real;
* usuario que marcó cada estado;
* interrupciones;
* cancelaciones;
* reanudaciones;
* duración real;
* pausa real si existe;
* cambios de estado.

## 9.3 Eventos de estado

Representan la historia de cada tarea.

Eventos mínimos:

* created;
* planned;
* started;
* finished;
* interrupted;
* resumed;
* cancelled;
* delayed;
* manually_changed;
* replanned.

Cada evento debe guardar:

* tarea;
* timestamp;
* usuario;
* estado anterior;
* estado nuevo;
* comentario opcional;
* fuente: usuario, motor, sistema.

## 9.4 Incidencias

Representan problemas operativos.

Campos conceptuales:

* tipo;
* severidad;
* descripción;
* tarea vinculada;
* espacio vinculado;
* talent vinculado;
* recurso vinculado;
* responsable;
* estado;
* hora apertura;
* hora cierre;
* impacto estimado;
* causa raíz si se conoce;
* decisión tomada.

## 9.5 Causas de retraso

Representan aprendizaje.

No deben depender solo de texto libre.

Debe existir un catálogo configurable de causas.

Campos conceptuales:

* categoría;
* subcategoría;
* descripción;
* tarea afectada;
* minutos estimados;
* responsable de clasificación;
* certeza: baja/media/alta.

## 9.6 Cambios manuales

Representan decisiones humanas.

Debe conservar:

* qué cambió;
* antes;
* después;
* quién lo hizo;
* cuándo;
* motivo;
* si existe un lock explícito asociado;
* si requirió validación;
* si disparó replanificación.

## 9.7 Evidence del motor

Representa explicación.

Debe conservar, cuando aplique:

* motor usado;
* input relevante;
* restricciones;
* oportunidades detectadas;
* candidatos;
* validación;
* decisión;
* resultado;
* métricas antes/después;
* explicación humana.

---

# 10. Reglas de diseño visual

## 10.1 Jerarquía de información

Cada pantalla debe organizarse en tres niveles:

1. Estado principal.
2. Riesgos o próximas acciones.
3. Detalle consultable.

Nunca empezar una pantalla con tablas densas si el usuario necesita una respuesta inmediata.

## 10.2 Colores de estado

Estados operativos recomendados:

* Pending: neutro.
* In progress: activo.
* Done: completado.
* Interrupted: alerta.
* Cancelled: cerrado no realizado.
* Delayed: riesgo.
* Critical: atención inmediata.
* Locked: existe un **lock explícito**.
* Protected: placement aceptado protegido por `AutomaticProtection` frente a movimientos automáticos; no implica lock.

El color nunca debe ser el único canal. Debe combinarse con texto, iconos o etiquetas.

## 10.3 Modo móvil

Obligatorio para Mi Día.

Requisitos:

* tarjetas grandes;
* botones táctiles;
* texto mínimo;
* próxima acción evidente;
* no depender de hover;
* carga rápida;
* usable en movimiento.

## 10.4 Modo pantalla grande

Obligatorio para Control Room y Vista Plató.

Requisitos:

* lectura a distancia;
* métricas grandes;
* pocos elementos simultáneos;
* foco en riesgo y estado;
* refresco en tiempo real;
* sin interacción compleja.

## 10.5 Modo detalle

Obligatorio para Planning, Timeline y Diagnóstico.

Requisitos:

* filtros;
* zoom;
* búsqueda;
* inspección de tarea;
* explicación de conflicto;
* edición controlada.

## 10.6 Nunca mostrar IDs técnicos

Los IDs pueden existir en tooltips técnicos o logs de desarrollo, pero no en UI operativa.

La UI debe mostrar nombres humanos.

## 10.7 Estados vacíos, carga y error

Toda pantalla debe tener:

* loading;
* empty;
* error;
* partial data;
* no permission;
* realtime disconnected.

Nunca debe crashear por relaciones incompletas.

---

# 11. Reglas de acción

## 11.1 Start

Marca inicio real.

Debe:

* confirmar tarea;
* guardar timestamp;
* actualizar estado;
* bloquear tarea como in_progress;
* notificar en realtime;
* recalcular estado visual del día.

## 11.2 Finish

Marca fin real.

Debe:

* guardar timestamp;
* calcular duración real;
* actualizar estado a done;
* bloquear tarea;
* actualizar métricas;
* disparar evaluación de próximas tareas.

## 11.3 Interrupt

Interrumpe tarea.

Debe:

* guardar fin parcial;
* marcar tarea como interrupted;
* crear o preparar reanudación pendiente si aplica;
* bloquear lo ya ejecutado;
* disparar replanificación controlada de pendiente.

## 11.4 Cancel

Cancela tarea.

Debe:

* pedir confirmación;
* registrar motivo;
* actualizar estado;
* evaluar impacto en dependencias;
* advertir si rompe cadena.

## 11.5 Delay

Retrasa tarea o conjunto.

Debe:

* pedir minutos;
* pedir causa;
* mostrar impacto estimado;
* aplicar solo si es viable;
* mantener la edición en el Draft; crear un lock sólo cuando producción lo declare explícitamente;
* replanificar pendiente si procede.

## 11.6 Cerrar espacio temporalmente

Debe:

* indicar espacio;
* intervalo;
* causa;
* tareas afectadas;
* impacto;
* replanificar pendiente.

## 11.7 Baja de recurso

Debe:

* indicar recurso;
* desde cuándo;
* hasta cuándo o indefinido;
* tareas afectadas;
* sustituciones posibles;
* impacto en jornada.

---

# 12. Roadmap UI/Operativa

## P0 — Consolidación operativa mínima

Tipo: Fast Merge salvo detección de fallos estructurales.

Objetivo:

Ordenar y estabilizar lo ya existente sin añadir grandes modelos nuevos.

Incluye:

* revisar navegación;
* clarificar pantallas actuales;
* asegurar estados loading/empty/error;
* evitar duplicidades visuales;
* mejorar consistencia de estados;
* asegurar que no se muestran IDs técnicos;
* preparar terreno para Mi Día.

No incluye:

* nuevas migraciones;
* informes;
* analítica avanzada;
* cambios ORC;
* nuevos modelos de recursos.

Criterio de aceptación:

La app se entiende mejor sin alterar el comportamiento crítico.

## P1 — Mi Día real

Tipo: Fast Merge si usa datos existentes; DB Safe Merge si requiere user-resource mapping nuevo.

Objetivo:

Convertir Call Sheet en pantalla operativa personal.

Incluye:

* próxima tarea;
* tarea actual;
* agenda;
* ubicación;
* talent;
* recurso;
* botones de estado;
* avisos;
* cambios recientes;
* vista móvil.

No incluye:

* informes;
* rediseño global completo;
* nuevos algoritmos de planificación.

Criterio de aceptación:

Un auxiliar puede abrir la app y saber qué hacer sin mirar el planning global.

## P2 — Vista Plató / Vista Recurso / Vista Talent

Tipo: Fast Merge inicialmente.

Objetivo:

Crear pantallas enfocadas por entidad operativa.

Incluye:

* vista por espacio;
* vista por talent;
* vista por recurso;
* estados;
* próximas tareas;
* retrasos;
* dependencias;
* filtros.

Criterio de aceptación:

Producción puede resolver preguntas operativas sin navegar por tablas globales.

## P3 — War Room persistente

Tipo: DB Safe Merge.

Objetivo:

Convertir incidencias en datos reales.

Incluye:

* tabla de incidencias;
* tipos;
* severidad;
* vínculos a tarea/espacio/talent/recurso;
* estados;
* timestamps;
* usuario;
* RLS;
* UI de creación y resolución.

Criterio de aceptación:

Una incidencia registrada durante el día puede aparecer después en análisis post-día.

## P4 — Control Room PRO

Tipo: mixto; probablemente Fast Merge sobre datos existentes, DB Safe si requiere snapshots o agregados.

Objetivo:

Consolidar el centro de mando.

Incluye:

* estado global;
* ETA;
* riesgo;
* espacios parados;
* recursos saturados;
* tareas críticas;
* incidencias;
* locks;
* realtime status;
* modo director.

Criterio de aceptación:

Dirección puede saber si el día está controlado sin abrir el timeline.

## P5 — Informes post-día v1

Tipo: DB Safe Merge.

Objetivo:

Medir desempeño básico.

Incluye:

* plan vs real;
* duración por tipo de tarea;
* retrasos por causa;
* rendimiento por espacio;
* permanencia de talents;
* CSV;
* resumen por rol;
* resumen por espacio.

Criterio de aceptación:

El equipo puede revisar un día terminado y detectar tres mejoras concretas para el siguiente.

## P6 — Inteligencia operativa

Tipo: DB Safe Merge y/o ORC Safe.

Objetivo:

Usar datos históricos para mejorar configuración y decisiones.

Incluye:

* sugerencias de duración;
* detección de tareas subestimadas;
* tendencias de retraso;
* comparativa entre jornadas;
* recomendaciones de buffers;
* análisis de cuellos de botella.

No debe ser IA predictiva opaca.

Debe ser analítica explicable basada en datos medidos.

---

# 13. Clasificación de cambios

## Fast Merge

Aplicable a:

* ajustes visuales;
* reorganización de pantallas;
* componentes UI;
* filtros frontend;
* tarjetas;
* layout;
* copy operativo;
* estados visuales;
* reutilización de datos ya existentes.

No debe tocar:

* base de datos;
* RLS;
* motor;
* locks;
* modelos críticos;
* reglas hard.

## DB Safe Merge

Obligatorio para:

* nuevas tablas;
* cambios en RLS;
* cambios de modelo;
* persistencia de incidencias;
* causas de retraso;
* nuevos eventos;
* permisos;
* informes reales;
* locks;
* cambios de ejecución;
* cambios ORC.

Debe incluir:

* migraciones idempotentes;
* rollback conceptual;
* checklist operativo;
* validación con datos existentes;
* pruebas de permisos;
* estados vacíos/error.

## ORC Safe Merge

Obligatorio para:

* cambios en planificación;
* replanificación;
* validación;
* constraints;
* evidence;
* benchmark;
* evaluación;
* conectores entre UI y motor.

Debe incluir:

* tests;
* benchmark;
* evidence report;
* determinismo;
* comparación antes/después;
* prueba de no modificar in_progress/done.

---

# 14. Qué no hacer todavía

## 14.1 No construir informes sin datos fiables

Primero hay que persistir eventos, incidencias y causas.

Un dashboard post-día basado en datos incompletos genera falsa confianza.

## 14.2 No duplicar pantallas existentes

Antes de crear nueva pantalla, revisar si puede evolucionar:

* Dashboard;
* Call Sheet;
* Control Room;
* Timeline;
* War Room.

## 14.3 No meter analítica predictiva

OptiPlan debe medir, comparar y explicar.

La predicción futura solo tendrá sentido cuando existan datos suficientes y reglas claras.

## 14.4 No convertir la UI en un cockpit incomprensible

Más información no significa mejor control.

La pantalla correcta muestra menos cosas, pero mejores.

## 14.5 No hardcodear nombres de espacios o programas

La UI puede mostrar nombres configurados.

La lógica no debe depender de strings como “Plató 7”.

## 14.6 No mezclar ORC con informes

El ORC decide planificación.

Los informes analizan ejecución.

Pueden compartir evidencia, pero no deben confundirse.

---

# 15. Criterios de aceptación generales

Una nueva pantalla o utilidad solo debe aceptarse si cumple:

* resuelve una pregunta operativa clara;
* respeta roles;
* no muestra datos técnicos innecesarios;
* soporta loading/empty/error;
* no crashea por relaciones incompletas;
* funciona con datos parciales;
* mantiene coherencia visual con estados;
* no modifica tareas ejecutadas;
* no rompe locks;
* no oculta inviabilidades;
* es verificable manualmente;
* queda documentada en README o documentación correspondiente.

---

# 16. Criterios de éxito por fase

## Pre-día exitoso

* El día queda configurado.
* El plan es viable.
* Las restricciones están claras.
* Los locks son visibles.
* Las vistas por rol pueden publicarse.
* Los problemas se explican en lenguaje humano.

## Día en vivo exitoso

* Cada persona sabe qué hacer.
* Producción ve riesgos.
* Dirección ve estado global.
* Las tareas reales actualizan el sistema.
* Los retrasos se registran.
* Las incidencias se gestionan.
* Lo ejecutado no se mueve.
* La replanificación solo toca pendiente.
* El equipo confía en la app.

## Post-día exitoso

* Se sabe qué ocurrió.
* Se sabe por qué se retrasó.
* Se sabe qué duraciones estaban mal estimadas.
* Se sabe qué recursos fueron cuello de botella.
* Se obtienen decisiones concretas para mejorar el siguiente día.

---

# 17. Primera iteración recomendada

La primera iteración UI debe ser:

## P1.1 — Convertir Call Sheet en Mi Día operativo

Razón:

* Ataca una necesidad real inmediata.
* Aprovecha código existente.
* Tiene bajo riesgo si se limita a UI.
* No requiere tocar ORC.
* Aporta valor a usuarios no técnicos.
* Convierte OptiPlan en herramienta de ejecución, no solo de planificación.

Alcance recomendado:

* Crear o consolidar una ruta clara “Mi Día”.
* Mostrar tarea actual y próxima tarea.
* Mostrar agenda personal.
* Mostrar ubicación, talent, horario y estado.
* Añadir modo móvil-friendly.
* Respetar permisos.
* Usar datos existentes.
* No añadir nuevas tablas en la primera iteración salvo que sea estrictamente imprescindible.
* No tocar motor.
* No tocar locks.
* No tocar RLS salvo que el estado actual lo exija.

Criterios de aceptación:

* Un auxiliar ve solo la información que necesita para trabajar.
* Producción puede simular el uso de “Mi Día” desde distintos perfiles.
* Las acciones visibles respetan permisos.
* La vista no crashea con relaciones incompletas.
* La pantalla distingue claramente actual, siguiente y resto del día.
* La UI muestra empty/error/loading.
* README actualizado.

---

# 18. Definición final

OptiPlan debe evolucionar como una herramienta de control operativo real.

El motor genera y repara planes.

La UI convierte esos planes en acción coordinada.

Los eventos reales convierten la ejecución en evidencia.

Los informes convierten la evidencia en mejora.

La empresa mejora porque deja de depender solo de memoria, intuición y hojas dispersas.

La aplicación será verdaderamente valiosa cuando consiga que cada persona sepa qué hacer, que producción vea el riesgo antes de que explote y que dirección entienda por qué el día salió bien o mal.

La planificación es el inicio.

La ejecución es la verdad.

La medición es la mejora.
