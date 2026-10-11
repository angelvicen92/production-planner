# OPTIPLAN — INTEGRACIÓN Y CONFIGURACIÓN OPERATIVA EFECTIVA

**Versión:** 2.5  
**Fecha:** 30 de septiembre de 2026  
**Estado:** Fuente oficial consolidada  
**Absorbe:** SPEC-10, SPEC-11 y Addenda oficiales consolidados de dominio/operación.

## Actualización v2.5 — contrato end-to-end de márgenes específicos de participante

La configuración efectiva debe representar el margen general de participante del día y los overrides opcionales de cada tarea:

```text
defaultParticipantTransitionMinutes: number >= 0
participantMarginBeforeMinutes?: number >= 0
participantMarginAfterMinutes?: number >= 0
```

Para una frontera `A → B`, si existe al menos uno de `A.after` o `B.before`, el margen de participante efectivo es el **máximo de los valores explícitos definidos**. Si ninguno existe, se usa `defaultParticipantTransitionMinutes`. Un `0` explícito es distinto de `undefined`; los dos lados nunca se suman.

La capacidad debe existir sin pérdida en configuración general, snapshot/revisión diaria, plantilla, instancia, EngineInput, preflight, adaptación a Planner Next, búsqueda, validador, publicación y Evidence. El motor y el validador deben reutilizar una única resolución semántica o demostrar equivalencia exacta. Si una ruta productiva no puede proyectar un override configurado, debe devolver `UNSUPPORTED`/readiness incompatible antes de planificar; queda prohibido ignorarlo y aplicar el default.

## 1. Flujo autoritativo Assisted

```text
Configuración general
  -> snapshot/revisión explícita del día
  -> EngineInput
  -> preflight de representabilidad
  -> resolución de PlanningScope + contexto protegido/analítico
  -> adaptación a Planner Next / ORC
  -> ejecución read-only
  -> validación canónica
  -> ScopeProposal
  -> Draft
  -> validación de Stage
  -> aceptación humana / AcceptedException
  -> checkpoint Stage
  -> publicación explícita de OfficialPlan
```

El motor no escribe en DB ni consolida decisiones humanas por sí solo.

## 2. Enmiendas que sustituyen cláusulas legacy

### 2.1 “No partial result”
La prohibición significa: **no publicar un plan parcial como OfficialPlan completo**. No prohíbe `ScopeProposal`, Draft o WorkingPlan parciales respecto al día.

### 2.2 Hard-valid y publicación
Todo candidato automático debe respetar sus gates HARD/REQUIRED. La publicación humana puede contener AcceptedExceptions explícitas. Esa publicación conserva la verdad automática (`hardValid=false` si existe HARD activo) y nunca transforma la excepción en regla soft global.

### 2.3 Locks vs AutomaticProtection
Un Stage aceptado protege placements frente a movimientos automáticos posteriores. Esto no crea locks. Locks de tiempo/espacio/recurso/full siguen siendo restricciones explícitas y se traducen sin pérdida.

### 2.4 REQUIRED
`REQUIRED` invalida una propuesta automática que lo incumpla. Un humano puede crear/aceptar manualmente una desviación tras aviso. La policy global continúa siendo REQUIRED.

### 2.5 Scope
En construcción Assisted, “completitud” se evalúa a dos niveles: propuesta completa para el scope resuelto y completitud global del WorkingPlan/OfficialPlan. No se exige resolver las 266 obligaciones A2 en cada petición local.

## 3. Configuración efectiva

Todo comportamiento que altere viabilidad, ocupación, orden, coste o explicación debe existir como dato estructurado con contrato tipado. No se crea un lenguaje universal de reglas opaco.

Precedencia:

`lock/estado protegido > override de instancia > configuración efectiva del día > snapshot > configuración general > default documentado`.

Cambios generales posteriores no modifican días existentes sin refresh explícito y versionado.

## 4. Asignación efectiva de recursos

El consumo de un recurso proviene de asignaciones efectivas vigentes, no de nombres, categorías, reglas de autocreación ni benchmarks. La unión de asignación directa de tarea, espacio y zona/unidad explícita define los recursos obligatorios.

Una asignación a un recurso concreto no autoriza sustitución silenciosa. Los requisitos genéricos (`anyOf`, tipo/capacidad) se resuelven mediante su contrato propio.

## 5. Tiempo, disponibilidad y ocupaciones derivadas

- Conversión temporal exacta y reversible.
- Ausencia de ventana no inventa una restricción más estrecha.
- Preparaciones, holds, transición y ocupación derivada no alteran silenciosamente la duración productiva.
- Toda ocupación adicional declara entidad afectada, intervalo, severidad, origen y Evidence.

### 5.1 Margen general y overrides de participante

El margen general de participante pertenece a la configuración efectiva del día. Las tareas pueden heredar overrides de plantilla y recibir override de instancia. La resolución por frontera usa `max(A.after, B.before)` entre los valores explícitos existentes; si no existe ninguno, usa el margen general. Un valor explícito `0` desactiva el buffer de participante sólo para esa frontera y no desactiva transiciones de coach/recurso/unidad, holds, setups ni otras autoridades hard.

El snapshot de plantilla debe preservar ambos campos incluso cuando valgan `0`. La instancia diaria puede almacenar `null/undefined` para heredar o un entero no negativo para sustituir. La UI debe distinguir visualmente `Heredado` de `0 min`.

## 6. Identidad, fingerprints y Evidence

La identidad productiva original es autoridad para publicación. Los IDs internos del planner son reversibles y no sustituyen IDs de producto. Snapshot de configuración, fingerprint de input/proposal/stage y validación deben permitir replay determinista.

## 7. Publicación

Aceptar un Stage actualiza el estado consolidado de forma atómica según el contrato del servicio Assisted. Publicar OfficialPlan es una acción humana separada. La publicación debe conservar:

- identidad original;
- configuración/revisión efectiva;
- placements aceptados;
- locks;
- AcceptedExceptions;
- estado de validación real;
- Evidence/fingerprint correspondientes.

## 8. Lectura de los anexos

Las secciones detalladas siguientes están **integradas** en esta única Fuente por su detalle técnico. Sus antiguos nombres, números de SPEC o metadatos se conservan sólo como provenance y navegación interna: no crean Fuentes paralelas. Las referencias normativas activas se resuelven contra 00–07. Toda frase incompatible con 2.1–2.5 queda sustituida por estas enmiendas.


---

## 9. Stage, branch history, rollback y `daily_tasks`

Un Stage aceptado contiene el **snapshot completo** del planning, no un delta. Debe conservar al menos identidad de sesión/plan, parent, scope/provenance, `configRevisionId`, snapshot, `snapshotFingerprint`, validación, autor/fecha y referencias de Evidence/proposal cuando procedan.

Con una línea `S0 → S1 → … → S6`, rollback `S6 → S3`:

- restaura exactamente el snapshot de S3 como planning activo y Draft base;
- restaura `daily_tasks` desde ese snapshot;
- conserva S4–S6 en historial/auditoría;
- permite redo hacia el futuro anterior mientras no haya divergencia;
- si desde S3 se acepta S4′, la línea antigua S4–S6 queda archivada como rama histórica y deja de ser redo normal.

`daily_tasks` representa **el último planning aceptado**, nunca el Draft. Aplicar una ScopeProposal al Draft no escribe `daily_tasks`; aceptar Stage sí lo actualiza de forma atómica.

## 10. Configuración, provenance y grandfathering

Rollback de planning no revierte la configuración vigente del día. Cada Stage conserva `configRevisionId` y fingerprint/provenance de la EffectiveConfig con la que se validó/aceptó.

- una nueva intervención desde un Stage restaurado usa la configuración vigente del día;
- una nueva revisión de configuración no revalida automáticamente ni invalida decisiones antiguas intactas;
- si una decisión antigua se toca, el nuevo estado se valida con la configuración vigente;
- una validación de Draft queda stale si cambian Draft/base/config según su contrato;
- el origen del valor efectivo debe ser reconstruible: general → snapshot diario → override/decisión posterior.

## 11. `AcceptedException` — contrato mínimo y ciclo de vida

Una excepción aceptada identifica una violación material concreta; no es un suppress global ni una relajación de policy. Como mínimo conserva:

```text
ruleCode
severity = HARD | REQUIRED
violationKey
stageId
configRevisionId
affectedTaskIds[]
affectedResourceIds[] cuando proceda
affectedSpaceIds[] cuando proceda
details
snapshotFingerprint
acceptedBy
acceptedAt
status = ACTIVE | RESOLVED | STALE | SUPERSEDED
resolvedAt cuando proceda
```

`violationKey` debe ser identidad estructurada, determinista e independiente del mensaje humano; incluye las entidades/dimensiones materiales necesarias para distinguir dos violaciones distintas.

Reglas:

1. aceptar un conflicto **no desactiva** la regla global;
2. sólo una excepción `ACTIVE`, con misma `severity + violationKey` y tareas afectadas materialmente intactas, puede grandfather la misma violación;
3. el solver puede trabajar alrededor de una violación antigua aceptada, pero no crear nuevas HARD/REQUIRED escudándose en ella;
4. una revisión de configuración diferente es provenance y no vuelve automáticamente inválida una decisión antigua intacta; si la identidad material de la violación cambia, no hereda la excepción;
5. si se mueve/modifica materialmente una tarea afectada, la excepción anterior deja de ser aplicable y pasa a `STALE` o `SUPERSEDED` según el lifecycle; el nuevo estado se revalida;
6. `RESOLVED`, `STALE` y `SUPERSEDED` nunca grandfather nuevas validaciones;
7. una Stage con HARD aceptado conserva `hardValid=false` mientras la violación exista; la UI mantiene el indicador crítico correspondiente.

## 12. Aceptación atómica y publicación

Aceptar Stage debe verificar fingerprint, base Stage, configuración/validación vigentes y confirmación humana requerida; persistir Stage + excepciones; actualizar `daily_tasks`; mover la línea activa y dejar un Draft nuevo de forma atómica.

Una `ScopeProposal` automática debe cumplir sus gates HARD/REQUIRED. Una Stage humana puede contener desviaciones aceptadas conforme a 11. Publicar `OfficialPlan` es una decisión humana posterior y **no** cambia `hardValid` ni la policy global.

# PARTE I — Contratos detallados de integración normalizados

# OPTIPLAN — ESPECIFICACIÓN OPERATIVA DE INTEGRACIÓN

# SPEC-10 — Integración de Planner Next con EngineInput, ORC y publicación de producto

**Versión:** 1.0  
**Provenance:** antigua SPEC-10 v1.0, hoy integrada en esta Fuente; no es una Fuente separada.  
**Clasificación histórica de implementación:** DB Safe Merge

---

## 1. Propósito

Esta especificación define el contrato de integración entre:

- la entrada productiva de la aplicación, representada por `EngineInput`;
- el dominio de Planner Next, representado por `PlannerNextProblem`;
- el dispatcher autoritativo `executePlannerNext`;
- las rutas `COMPATIBILITY_PRESERVING` y `EXACT_CONSTRUCTIVE`;
- ORC;
- la publicación de resultados hacia la aplicación.

Su objetivo es permitir que Planner Next pueda ejecutarse sobre datos productivos reales sin:

- inventar relaciones;
- modificar tareas protegidas;
- perder locks;
- utilizar una planificación previa como semilla indebida;
- mezclar contratos de resultados;
- publicar planes parciales;
- introducir fallbacks ocultos;
- consolidar automáticamente una propuesta no revisada.

Este bloque no modifica las reglas de construcción de la Fuente 03; para cualquier hecho A2 específico prevalece la Fuente 06.

---

## 2. Principios obligatorios

Toda integración deberá preservar:

1. **La producción tiene que salir.**
2. El motor propone y el humano decide.
3. Las tareas `in_progress` y `done` son inmutables.
4. La replanificación afecta exclusivamente a trabajo pendiente o interrumpido.
5. Los locks son restricciones explícitas, nunca preferencias.
6. Ninguna relación de dominio se deduce mediante nombres, textos o IDs conocidos.
7. Ningún plan parcial puede publicarse como `OfficialPlan` completo. `ScopeProposal`, `Draft` y `WorkingPlan` parciales respecto al día son artefactos válidos del flujo Assisted.
8. La política de búsqueda debe resolverse antes de ejecutar el motor.
9. No existe fallback implícito entre políticas.
10. La ejecución debe ser determinista, explicable y reproducible.
11. Toda publicación debe conservar la identidad de las entidades originales.
12. La integración se validará primero en simulación read-only.

---

## 3. Límite arquitectónico

El flujo autoritativo será:

```text
EngineInput
        ↓
Preparación del origen operativo
        ↓
Preflight de representabilidad
        ↓
Adaptación a PlannerNextProblem
        ↓
executePlannerNext
        ↓
Validación canónica
        ↓
Adaptación de publicación
        ↓
Propuesta read-only
        ↓
Revisión humana
        ↓
Consolidación explícita posterior
```

Cada etapa tendrá una responsabilidad única.

No se permitirá que:

- el adaptador de entrada planifique;
- el dispatcher transforme dominio;
- el motor escriba en DB;
- el adaptador de salida modifique decisiones del motor;
- la capa de producto interprete silenciosamente Evidence interna.

---

## 4. Modos operativos

### 4.1. Construcción inicial

En construcción inicial:

- las tareas planificables parten del origen operativo;
- no se utilizarán horarios previos de tareas pendientes como semilla;
- se conservarán identidades, dependencias, requisitos y disponibilidad;
- los locks y las tareas protegidas se materializarán como obligaciones fijas;
- el resultado será una propuesta completa para lo planificable.

Planner Next sólo podrá ejecutarse si todas las restricciones fijas relevantes pueden representarse sin pérdida dentro de su contrato.

En caso contrario, la ejecución será rechazada antes de entrar en el motor.

### 4.2. Replanificación

En replanificación:

- `done` e `in_progress` no podrán moverse;
- las tareas canceladas no se reincorporarán;
- sólo podrán reconsiderarse tareas `pending` o `interrupted`;
- los locks existentes seguirán siendo obligatorios;
- las ocupaciones producidas por tareas protegidas formarán parte del estado fijo;
- no se reemplazará la planificación consolidada completa por un resultado parcial.

La replanificación exacta no podrá activarse hasta que el adaptador demuestre que representa de forma completa:

- tareas protegidas;
- locks de tiempo;
- locks de espacio;
- locks de recurso;
- locks completos;
- ocupaciones previas;
- dependencias entre tareas protegidas y pendientes.

La ausencia de esta capacidad producirá un rechazo explícito, nunca una degradación automática.

---

## 5. Resultado del adaptador de entrada

El adaptador de entrada devolverá una unión discriminada con dos resultados.

### 5.1. `SUPPORTED`

Contendrá:

- `problem: PlannerNextProblem`;
- `identityMap`;
- `diagnostics`;
- `sourceFingerprint`;
- `readOnly: true`.

### 5.2. `UNSUPPORTED`

Contendrá:

- `problem: null`;
- `identityMap`;
- `diagnostics`;
- `reasonCodes`;
- `sourceFingerprint`;
- `readOnly: true`.

Una adaptación `UNSUPPORTED` no podrá llamar a `executePlannerNext`.

---

## 6. Identidad canónica

El adaptador mantendrá un mapa reversible entre:

- IDs numéricos del dominio productivo;
- IDs utilizados por Planner Next.

El mapa deberá cubrir como mínimo:

- tareas;
- participantes;
- coaches;
- espacios;
- zonas cuando sean necesarias;
- recursos;
- operaciones ancladas;
- comidas o pausas materializadas.

Requisitos:

- ninguna colisión;
- ninguna identidad generada a partir de nombres visibles;
- ningún ID conocido hardcodeado;
- reversibilidad completa;
- estabilidad ante cambios de orden de entrada;
- serialización determinista.

La identidad original será la autoridad para publicación.

Los IDs internos de Planner Next no se persistirán como sustitutos de IDs productivos.

---

## 7. Conversión temporal

La conversión temporal deberá:

- transformar estrictamente `HH:mm` a minutos;
- utilizar un origen de jornada explícito;
- rechazar valores inválidos;
- comprobar que inicio y final pertenecen al día operativo;
- conservar duraciones exactas;
- no redondear silenciosamente;
- comprobar compatibilidad con la rejilla temporal del motor;
- transformar los resultados nuevamente a `HH:mm` sin pérdida.

Si una hora, duración o ventana no puede representarse exactamente, el adaptador devolverá `UNSUPPORTED`.

No se corregirán automáticamente ventanas inconsistentes.

---

## 8. Estados de tareas

La traducción de estados será obligatoria y explícita.

### 8.1. Protegidas

Se consideran protegidas:

- `in_progress`;
- `done`.

Deben conservar:

- inicio;
- final;
- espacio;
- recursos asignados;
- locks;
- relaciones relevantes.

No podrán:

- reordenarse;
- desplazarse;
- reasignarse;
- desaparecer del estado operativo.

### 8.2. Planificables

Se consideran planificables:

- `pending`;
- `interrupted`, cuando la política operativa vigente permita su nueva planificación.

Sus horarios previos no podrán utilizarse como semilla en construcción inicial.

### 8.3. No planificables

Las tareas:

- `cancelled`;
- no operativas;
- placeholders sin efecto operativo;

se excluirán o se representarán de acuerdo con una regla de dominio explícita.

Nunca se deducirá su tratamiento por el nombre de la plantilla.

---

## 9. Locks

Cada lock deberá traducirse de forma explícita.

### 9.1. Lock de tiempo

Debe fijar exactamente el intervalo autorizado.

### 9.2. Lock de espacio

Debe conservar el espacio requerido.

### 9.3. Lock de recurso

Debe conservar el recurso requerido.

### 9.4. Lock completo

Debe conservar tiempo, espacio y recursos aplicables.

Si Planner Next no puede representar un lock sin pérdida:

- la adaptación será `UNSUPPORTED`;
- se publicará el reason code correspondiente;
- no se ejecutará ninguna política.

No se transformarán locks en penalizaciones soft.

---

## 10. Clasificación de tareas y roles

Las categorías:

- `main`;
- `vocal`;
- `auxiliary`;
- `technical`;

deben proceder de metadatos normalizados y explícitos.

No podrán inferirse mediante:

- nombre de tarea;
- nombre de espacio;
- nombre de plantilla;
- ID histórico;
- posición en una lista;
- heurísticas específicas de Focal A2.

Cuando una tarea no tenga una clasificación inequívoca:

- se devolverá `UNSUPPORTED_TASK_ROLE`;
- la tarea no se clasificará automáticamente como auxiliar.

Los coaches, participantes y recursos también deberán resolverse desde relaciones explícitas.

---

## 11. Espacios, zonas y capacidad

El adaptador deberá distinguir:

- identidad de espacio físico;
- zona lógica;
- capacidad simultánea;
- exclusividad;
- disponibilidad;
- continuidad requerida;
- políticas de comida;
- asignaciones de recursos por espacio o zona.

No se colapsarán varios espacios en una zona sin un contrato explícito.

No se aumentará capacidad por metadatos descriptivos.

Si una restricción de capacidad de la entrada no puede representarse en Planner Next, la adaptación será rechazada.

---

## 12. Recursos

Cada recurso deberá conservar:

- identidad;
- disponibilidad;
- tipo o rol;
- asignaciones;
- transiciones;
- requisitos de tarea;
- pertenencia a operaciones itinerantes cuando corresponda.

Los requisitos alternativos o por cantidad sólo podrán adaptarse si Planner Next dispone de un contrato equivalente.

No se seleccionará un recurso arbitrario para simplificar la entrada.

La falta de una referencia requerida producirá un reason code explícito.

---

## 13. Dependencias

El adaptador deberá conservar todas las dependencias normalizadas por identidad de tarea.

Requisitos:

- cero dependencias perdidas;
- cero dependencias inventadas;
- cero dependencias resueltas por nombre;
- detección de referencias inexistentes;
- conservación de dependencias entre protegidas y pendientes;
- detección de ciclos antes de ejecutar.

Los campos legacy podrán utilizarse únicamente como fuente de compatibilidad cuando el contrato de normalización oficial determine cuál es la relación efectiva.

---

## 14. Comidas y pausas protegidas

El adaptador distinguirá:

- ventana flexible de comida;
- comida ya asignada;
- pausa global hard;
- comida de espacio;
- comida de unidad itinerante;
- pausa protegida por participante, recurso, espacio o zona.

No todas las comidas son un bloqueo global.

Las semánticas deberán proceder de los campos normalizados de entrada.

Una pausa que no pueda representarse sin cambiar su ámbito producirá `UNSUPPORTED_BREAK_SCOPE`.

---

## 15. Operaciones ancladas

`AnchoredAccompaniment` sólo podrá construirse a partir de un contrato de dominio explícito que proporcione:

- ID de operación;
- tarea anchor;
- segmentos anteriores;
- segmentos posteriores;
- participante;
- espacios;
- recursos continuos;
- adyacencia;
- transición interna;
- duración.

No podrá inferirse mediante proximidad temporal, nombres de tareas ni patrones específicos del benchmark.

Todas las tareas de una operación deberán mapearse exactamente una vez.

Una operación incompleta o ambigua será rechazada antes de ejecutar el motor.

---

## 16. Política y presupuesto

La política de búsqueda deberá llegar explícitamente desde configuración normalizada.

Valores:

- `COMPATIBILITY_PRESERVING`;
- `EXACT_CONSTRUCTIVE`.

Durante migración, la ausencia de política podrá conservar el default histórico documentado en la Parte IV de la Fuente 03, junto con su warning.

La capacidad no podrá seleccionar una política automáticamente.

Los presupuestos deberán proceder de configuración:

- expansiones;
- backtracks;
- patrones;
- cualquier otro límite contractual.

No se introducirán presupuestos específicos por escenario ni fingerprints.

---

## 17. Preflight de representabilidad

Antes de crear un `PlannerNextProblem`, el adaptador verificará:

- identidad completa;
- horas válidas;
- duraciones exactas;
- roles explícitos;
- participantes existentes;
- coaches existentes;
- espacios existentes;
- recursos existentes;
- dependencias válidas;
- estados soportados;
- locks representables;
- pausas representables;
- capacidades representables;
- operaciones ancladas completas;
- política válida;
- presupuesto válido.

El preflight será:

- puro;
- determinista;
- read-only;
- invariante al orden;
- explicable mediante reason codes;
- independiente del motor.

---

## 18. Reason codes mínimos

La implementación deberá contemplar, como mínimo:

- `UNSUPPORTED_TASK_ROLE`;
- `UNSUPPORTED_TASK_STATUS`;
- `UNSUPPORTED_TIME_VALUE`;
- `UNSUPPORTED_TIME_GRID`;
- `UNSUPPORTED_LOCK_TYPE`;
- `UNREPRESENTABLE_TIME_LOCK`;
- `UNREPRESENTABLE_SPACE_LOCK`;
- `UNREPRESENTABLE_RESOURCE_LOCK`;
- `MISSING_PARTICIPANT_REFERENCE`;
- `MISSING_COACH_REFERENCE`;
- `MISSING_SPACE_REFERENCE`;
- `MISSING_RESOURCE_REFERENCE`;
- `MISSING_DEPENDENCY_REFERENCE`;
- `DEPENDENCY_CYCLE`;
- `UNSUPPORTED_SPACE_CAPACITY`;
- `UNSUPPORTED_RESOURCE_REQUIREMENT`;
- `UNSUPPORTED_BREAK_SCOPE`;
- `INCOMPLETE_ANCHORED_OPERATION`;
- `AMBIGUOUS_ANCHORED_OPERATION`;
- `MISSING_SEARCH_POLICY_CONFIGURATION`;
- `INVALID_SEARCH_BUDGET`;
- `PROTECTED_TASK_WITHOUT_FIXED_PLANNING`;
- `PROTECTED_TASK_CONSTRAINT_NOT_REPRESENTABLE`.

La lista podrá ampliarse únicamente cuando una limitación de dominio real lo justifique.

---

## 19. Ejecución

Una adaptación `SUPPORTED` podrá enviarse a:

`executePlannerNext(problem)`

El dispatcher será la única autoridad de selección de política.

El adaptador:

- no llamará directamente a los motores;
- no implementará fallback;
- no reintentará otra política;
- no modificará el problema después del preflight;
- no reinterpretará un rechazo de política.

---

## 20. Validación posterior

Todo resultado deberá validarse antes de publicación.

Se comprobará:

- completitud;
- hard validity;
- presencia de todos los IDs planificables;
- preservación de tareas protegidas;
- preservación de locks;
- duración;
- dependencias;
- disponibilidad;
- espacios;
- recursos;
- transiciones;
- comidas;
- operaciones ancladas;
- ausencia de tareas adicionales;
- identidad reversible;
- fingerprint;
- input inmutable.

Un resultado que falle esta validación no podrá presentarse como propuesta automática válida. La capa humana sólo podrá conservar o publicar la desviación mediante el contrato explícito de `AcceptedException`, preservando la verdad de validación.

---

## 21. Contrato común de publicación

No se forzará un `ExactItinerantPlanResult` dentro de `PlanResult`.

No se rellenarán métricas inexistentes con cero.

La capa de integración publicará un envelope común mínimo con:

- política solicitada;
- política efectiva;
- origen de selección;
- kind de ejecución;
- complete;
- hardValid;
- tareas planificadas;
- comidas planificadas;
- tareas pendientes;
- reason codes;
- warnings;
- stop reason;
- fingerprint;
- ramas consumidas cuando existan;
- Evidence específica del motor dentro de un campo discriminado;
- identity map;
- validation summary;
- readOnly.

Las métricas exclusivas de cada motor permanecerán dentro de su resultado específico.

---

## 22. Publicación atómica

La publicación cumplirá:

- plan completo o ningún plan;
- ninguna tarea pendiente desaparece;
- ninguna tarea protegida cambia;
- ningún lock se pierde;
- todos los IDs se transforman nuevamente a identidad productiva;
- la propuesta se publica como unidad atómica;
- la Evidence corresponde exactamente al plan publicado.

El agotamiento de presupuesto sólo puede devolver como resultado automático completo un incumbent completo y hard-valid para su contrato; en Assisted también puede devolver diagnóstico/no-propuesta sin impedir que el WorkingPlan humano exista.

No se afirmará optimalidad.

---

## 23. Simulación y decisión humana

La primera integración será exclusivamente read-only.

Debe permitir:

- ejecutar desde un `EngineInput` real;
- producir una propuesta;
- comparar con V4, ORC y planificación humana;
- visualizar diferencias;
- revisar reason codes;
- decidir manualmente si consolidar.

No realizará:

- writes de DB;
- actualización de tareas;
- cambios de locks;
- reemplazo automático del planning;
- activación automática por fingerprint.

El humano conservará la decisión final.

---

## 24. Relación con ORC

Planner Next exacto podrá actuar como constructor determinista de un plan completo.

ORC podrá:

- consumir su propuesta como candidato o referencia;
- evaluar operativamente el resultado;
- explicar riesgos;
- comparar alternativas;
- recomendar aceptación o rechazo.

ORC no deberá:

- cambiar tareas protegidas;
- tratar una propuesta parcial como baseline;
- consolidar automáticamente;
- sustituir las autoridades hard de Planner Next;
- modificar el resultado antes de su validación canónica sin producir una nueva simulación y Evidence.

La integración entre ambos se realizará mediante contratos explícitos, no mediante acceso directo a estructuras internas.

---

## 25. Evidence obligatoria

Cada ejecución integrada deberá registrar:

- fingerprint de `EngineInput` de origen;
- resultado del preflight;
- reason codes;
- identity map fingerprint;
- fingerprint de `PlannerNextProblem`;
- policy resolution;
- motor ejecutado;
- Evidence del motor;
- validación posterior;
- fingerprint de publicación;
- comprobación de tareas protegidas;
- comprobación de locks;
- comprobación de identidad;
- determinismo;
- invariancia;
- input inmutable;
- estado read-only;
- decisión humana, cuando exista.

No se introducirán contadores sin utilidad de aceptación o regresión.

---

## 26. Fases de activación

### Fase 1 — Preflight

Implementar únicamente:

- análisis de representabilidad;
- identity map;
- reason codes;
- cero ejecución del motor.

### Fase 2 — Adaptador de entrada

Crear `PlannerNextProblem` únicamente para entradas totalmente soportadas.

Validar round-trip de identidad y tiempo.

### Fase 3 — Adaptador de publicación

Transformar resultados a un envelope común read-only.

No escribir en DB.

### Fase 4 — Shadow mode

Ejecutar Planner Next junto a la ruta productiva vigente.

Comparar:

- completitud;
- hard validity;
- continuidad;
- cuellos de botella;
- presencia;
- idle;
- tradeoffs individuales;
- rendimiento;
- explainability.

### Fase 5 — Revisión humana

Presentar diferencias y riesgos.

Registrar decisión explícita.

### Fase 6 — Activación opt-in

Permitir seleccionar Planner Next por configuración explícita y reversible.

Mantener rollback.

### Fase 7 — Consolidación de producto

Sólo después de Evidence suficiente:

- integración de API;
- persistencia;
- UI;
- auditoría;
- permisos;
- RLS;
- observabilidad.

---

## 27. Benchmarks

Se conservará Focal A2 como benchmark protegido.

Se añadirán escenarios representativos para:

- construcción inicial;
- tareas `done`;
- tareas `in_progress`;
- locks de cada tipo;
- replanificación pendiente;
- relaciones incompletas;
- horas inválidas;
- capacidades no soportadas;
- operación anclada incompleta;
- política incompatible;
- agotamiento con incumbent;
- agotamiento sin incumbent;
- input invertido;
- repetición;
- round-trip de identidad.

Un caso no soportado debe rechazarse de forma determinista, no adaptarse parcialmente.

---

## 28. Criterios de aceptación de la integración

La integración sólo podrá avanzar hacia producto cuando:

- el preflight cubra todos los campos usados por la entrada representativa;
- no existan inferencias por nombre o ID;
- la identidad sea reversible;
- el tiempo sea reversible;
- las tareas protegidas se conserven exactamente;
- los locks se conserven exactamente;
- las dependencias se conserven;
- los recursos se conserven;
- las comidas y pausas se conserven;
- las operaciones ancladas se conserven;
- el dispatcher sea la única autoridad de política;
- no exista fallback;
- ningún resultado automático parcial se presente como plan completo; `ScopeProposal`/Draft siguen permitidos conforme a Assisted;
- la propuesta automática respete sus gates HARD/REQUIRED; una Stage humana aceptada puede conservar excepciones explícitas sin falsear `hardValid`;
- la publicación sea atómica;
- el input permanezca inmutable;
- la Evidence sea determinista;
- exista rollback;
- la activación sea explícita;
- el humano conserve la decisión final.

---

## 29. Primera unidad de implementación autorizada

Tras incorporar esta SPEC, la primera iteración de código deberá implementar exclusivamente:

**preflight de representabilidad de `EngineInput` para Planner Next**.

Esa iteración:

- no creará todavía `PlannerNextProblem`;
- no ejecutará `executePlannerNext`;
- no adaptará resultados;
- no tocará ORC activo;
- no tocará V4;
- no tocará UI;
- no tocará DB;
- no tocará RLS;
- no publicará planificación.

Su único resultado será:

- `SUPPORTED` o `UNSUPPORTED`;
- identity map;
- diagnósticos;
- reason codes;
- fingerprints;
- tests sobre entradas reales y sintéticas.

La evidencia obtenida decidirá la siguiente iteración.


---

# ANEXO B — SPEC-11 configuración efectiva y coordinación

# OPTIPLAN — ESPECIFICACIÓN OPERATIVA DEL PLANIFICADOR

# SPEC-11 — Configuración Operativa Efectiva, Ocupaciones Derivadas y Coordinación entre Espacios

Versión 1.0

Provenance histórica: antigua propuesta SPEC-11; su contenido vigente queda incorporado y promovido por esta Fuente consolidada. No existe como autoridad paralela.

Ámbito: configuración general, snapshot diario, overrides, tareas, espacios, participantes, recursos, UI, persistencia, EngineInput, Planner Next, ORC, validación, Evidence y reproducibilidad

---

# 1. Propósito

Esta especificación define cómo debe convertir OptiPlan las reglas operativas configurables en datos estructurados, reproducibles y utilizables por toda la aplicación.

Su finalidad es impedir que nuevas necesidades reales de producción se implementen como:

- constantes dispersas;
- nombres especiales de tareas o espacios;
- excepciones propias de un programa;
- reglas únicamente presentes en el motor;
- controles de UI sin persistencia;
- columnas de base de datos que no llegan a EngineInput;
- valores que el planificador reconstruye mediante suposiciones;
- comportamientos que sólo conoce la persona que configuró el día.

La configuración efectiva debe recorrer de extremo a extremo:

```text
configuración general
        ↓ snapshot explícito
configuración del día
        ↓ override explícito
instancias operativas efectivas
        ↓ adaptación sin pérdida
EngineInput / Estado Operativo
        ↓ construcción y validación
planificación + Evidence
```

La producción tiene que salir.

---

# 2. Relación con la documentación oficial

Este bloque integrado debe leerse conjuntamente con:

- Fuente 01 para producto, dominio y operación;
- Fuente 02 para ORC interno;
- Fuente 03 para construcción/búsqueda;
- esta Fuente 04 para integración y configuración efectiva;
- Fuente 05 para validación/benchmark;
- Fuente 06 para hechos A2 específicos.

Se mantienen plenamente vigentes:

- configuración antes que hardcode;
- viabilidad antes que optimización;
- separación REQUIRED, PREFERRED y OFF;
- snapshot diario reproducible;
- ausencia de sincronización silenciosa entre configuración general y días existentes;
- tareas `in_progress` y `done` inamovibles;
- replanificación únicamente de lo pendiente;
- adaptación sin pérdida;
- determinismo;
- publicación atómica;
- Evidence obligatoria.

El contrato de configuración efectiva integrado en esta Parte no sustituye los contratos específicos ya definidos para:

- setups;
- operaciones conjuntas;
- operaciones ancladas;
- unidades itinerantes;
- comidas;
- transiciones entre espacios;
- rondas sincronizadas.

Los organiza dentro de una arquitectura común de configuración efectiva.

---

# 3. Problema que origina esta especificación

La evolución de OptiPlan ha demostrado que las producciones reales introducen condiciones operativas que no pueden resolverse mediante nombres o casos especiales.

Ejemplos recientes:

- un espacio necesita cinco minutos de cambio o despeje entre intervenciones;
- ese tiempo puede bloquear sólo el espacio;
- en otros casos puede bloquear también al participante;
- en otros casos puede bloquear recursos concretos;
- dos espacios independientes deben comenzar ciertas rondas a la vez;
- otros dos espacios sólo deberían intentar comenzar a la vez como preferencia;
- una misma regla puede ser general, heredada por el día o sobrescrita para una instancia;
- el usuario puede necesitar activar, desactivar o cambiar la severidad de la regla.

La conclusión normativa es:

> Toda condición que pueda alterar viabilidad, ocupación, orden, coste o explicación debe existir como configuración estructurada y efectiva.

No se exigirá al usuario recordar todos los futuros casos. El sistema deberá disponer de un método permanente para identificar, modelar y auditar la superficie configurable.

---

# 4. Principios de diseño

## 4.1 Contratos tipados, no motor genérico de reglas

Configuración absoluta no significa almacenar reglas arbitrarias en un JSON opaco ni crear un lenguaje universal de expresiones.

Cada capacidad operativa deberá tener:

- contrato tipado;
- semántica explícita;
- preflight;
- validador canónico;
- representación de UI;
- persistencia estructurada;
- Evidence específica.

Queda prohibido crear una bolsa genérica de reglas que el motor interprete de manera dinámica sin contrato de dominio.

## 4.2 Una única semántica por regla hard

La misma regla no podrá tener implementaciones divergentes en:

- UI;
- API;
- adaptador;
- búsqueda;
- validación;
- publicación.

Los helpers puros de dominio deberán compartirse siempre que sea posible.

## 4.3 Ausencia significa comportamiento histórico explícito

Todo nuevo campo opcional deberá definir qué ocurre cuando está ausente.

La ausencia no podrá activar una inferencia nominal.

Como regla general:

```text
campo ausente = capacidad OFF o comportamiento histórico documentado
```

## 4.4 La configuración no altera silenciosamente la duración productiva

Un tiempo de preparación, despeje, descanso, transición u ocupación derivada no deberá sumarse de forma invisible a la duración productiva de la tarea.

La tarea conserva:

- identidad;
- duración productiva;
- participante;
- espacio;
- recursos;
- métricas de trabajo.

Las ocupaciones adicionales se materializan y explican por separado.

## 4.5 La severidad forma parte de la configuración

Toda política configurable deberá declarar, cuando proceda:

```text
REQUIRED | PREFERRED | OFF
```

- REQUIRED invalida una **propuesta automática normal** que la incumple; una desviación humana sólo puede persistir mediante aceptación explícita/AceptedException y sin cambiar la policy global.
- PREFERRED genera una penalización cuantificable y una explicación.
- OFF no participa.

Un valor configurado por el usuario se considera REQUIRED salvo que la UI permita seleccionar otra severidad de forma explícita.

---

# 5. Configuración general, snapshot diario y override

## 5.1 Niveles oficiales

Toda capacidad configurable deberá declarar en qué niveles puede existir:

1. configuración general;
2. plantilla de tarea o configuración general de espacio/recurso;
3. snapshot del día;
4. override de instancia;
5. lock o decisión humana posterior.

No todas las capacidades necesitan todos los niveles, pero la ausencia de un nivel deberá ser una decisión documentada.

## 5.2 Precedencia

La precedencia oficial es:

```text
lock o decisión humana protegida
        > override de instancia del día
        > configuración efectiva del día
        > snapshot heredado
        > configuración general
        > valor histórico documentado
```

Ningún nivel inferior puede reconstruir o anular silenciosamente uno superior.

## 5.3 Trazabilidad del valor efectivo

Para cada valor efectivo la aplicación deberá poder responder:

- valor actual;
- unidad;
- severidad;
- origen;
- si fue heredado o sobrescrito;
- quién lo modificó;
- cuándo se modificó;
- qué planificaciones lo utilizaron.

## 5.4 Actualización de días existentes

Los cambios generales no alteran automáticamente días existentes.

La UI podrá ofrecer actualización manual con comparación previa.

Después de actualizar deberá registrarse una nueva versión de configuración efectiva del día.

---

# 6. Registro permanente de superficie configurable

OptiPlan mantendrá una matriz de capacidades configurables.

Cada capacidad nueva deberá declarar como mínimo:

| Dimensión | Obligación |
|---|---|
| Identidad | ID estable y genérico |
| Propietario | tarea, espacio, zona, participante, recurso, unidad o plan |
| Ámbito | general, día e instancia |
| Unidad | minutos, cantidad, enum, booleano, lista o relación |
| Severidad | REQUIRED, PREFERRED, OFF o no aplicable |
| Herencia | regla explícita de precedencia |
| UI | edición y visualización del origen |
| Persistencia | representación estructurada y versionable |
| EngineInput | proyección determinista y reversible |
| Preflight | rechazo de ausencias, contradicciones y ambigüedades |
| Motor | construcción y búsqueda aplicables |
| Validación | autoridad canónica |
| Evidence | valor efectivo, impacto y cumplimiento |
| Replanificación | efecto sobre tareas protegidas y pendientes |
| Compatibilidad | semántica cuando el campo está ausente |
| Tests | determinismo, invariancia e input inmutable |

No se considerará completa una capacidad que sólo exista en algunas capas.

---

# 7. Ocupaciones temporales derivadas de una tarea

## 7.1 Definición

Una ocupación temporal derivada es un intervalo relacionado con una tarea productiva que bloquea una o varias entidades sin convertirse en trabajo productivo adicional.

Ejemplos:

- despeje de espacio;
- cambio de microfonía;
- recuperación del participante;
- desmontaje inmediato de un recurso;
- limpieza;
- seguridad;
- espera técnica obligatoria.

## 7.2 Contrato mínimo

El dominio deberá poder expresar un contrato equivalente a:

```ts
interface TaskTemporalHoldPolicy {
  id: string;
  phase: "AFTER_TASK";
  durationMinutes: number;
  severity: "REQUIRED" | "PREFERRED" | "OFF";
  occupies: {
    space: boolean;
    participant: boolean;
    requiredResources: boolean;
    explicitResourceIds?: string[];
  };
  adjacency: "IMMEDIATE";
}
```

La forma concreta podrá variar, pero deberá conservar esta semántica.

## 7.3 Entidades ocupadas

La política deberá permitir seleccionar de forma independiente:

- espacio de la tarea;
- participante de la tarea;
- recursos efectivos requeridos por la tarea;
- recursos concretos adicionales configurados.

No se bloqueará una entidad no seleccionada.

Ejemplo:

```text
5 minutos después de la tarea
space = true
participant = false
requiredResources = false
```

Significa que el espacio queda ocupado cinco minutos más, pero el participante puede comenzar otra obligación compatible al terminar la tarea productiva.

## 7.4 Adyacencia

`AFTER_TASK + IMMEDIATE` significa:

```text
inicio hold = fin tarea
fin hold = fin tarea + duración configurada
```

No se desplazará el hold para encontrar otro hueco.

Si el intervalo inmediato no es viable, la posición de la tarea es inválida o penalizada según severidad.

## 7.5 Duración cero

Una duración de cero equivale a capacidad inactiva para esa política.

No se publicará una ocupación sintética de duración cero.

## 7.6 Interacción con comidas y pausas

Un hold REQUIRED:

- no atraviesa una pausa que bloquee a una entidad ocupada;
- debe caber en la disponibilidad de cada entidad ocupada;
- no puede solaparse con otra ocupación incompatible;
- puede terminar exactamente al inicio de una pausa permitida;
- puede comenzar exactamente al final de una pausa permitida sólo si la tarea termina en ese instante.

## 7.7 Interacción con transiciones

El hold no sustituye los márgenes de transición entre espacios.

Para una entidad ocupada, la siguiente obligación deberá respetar:

```text
fin de su hold
        + margen de transición aplicable
        <= inicio siguiente
```

## 7.8 Métricas

Los holds:

- no aumentan minutos productivos;
- sí aumentan ocupación del espacio cuando corresponda;
- sí aumentan presencia del participante o recurso cuando los bloquean;
- aparecen en agendas y explicación;
- participan en fingerprint y validación.

## 7.9 Materialización

El resultado deberá poder publicar una entidad equivalente a:

```ts
interface ScheduledTaskTemporalHold {
  id: string;
  policyId: string;
  sourceTaskId: string;
  phase: "AFTER_TASK";
  start: Minute;
  end: Minute;
  duration: Minute;
  occupiedSpaceId?: string;
  occupiedParticipantId?: string;
  occupiedResourceIds: string[];
}
```

La identidad deberá ser canónica y determinista.

---

# 8. Preparación entre tareas y ocupación posterior

Una ocupación posterior no sustituye automáticamente un setup o una preparación entre rondas.

Se distinguen:

## 8.1 Hold posterior

Está anclado inmediatamente al final de una tarea concreta.

## 8.2 Preparación de la siguiente tarea o ronda

Está anclada al inicio de la siguiente tarea y puede depender de:

- cambio de familia;
- cambio de micro;
- cambio de configuración;
- ordinal de ronda;
- transición entre dos tipos de operación.

## 8.3 Operación técnica explícita

Es una tarea real con identidad, recursos, duración y, cuando corresponda, flexibilidad temporal.

No se reducirá a un hold si necesita:

- participante propio;
- recursos propios no derivados;
- dependencias;
- espacio distinto;
- capacidad de adelantarse o retrasarse;
- Evidence como trabajo operativo independiente.

El caso concreto deberá elegir el contrato que mejor represente la realidad, no el más fácil de programar.

---

# 9. Coordinación configurable entre espacios

## 9.1 Principio

Dos espacios independientes pueden necesitar coordinación temporal sin convertirse en un único espacio y sin compartir capacidad.

La igualdad de zona o plató no implica coordinación automática.

La coordinación debe configurarse mediante IDs explícitos.

## 9.2 Tipos iniciales

El dominio deberá soportar inicialmente:

```text
ALIGN_STARTS
```

Podrán añadirse en el futuro otros modos mediante contratos propios.

## 9.3 Contrato mínimo

El dominio deberá poder expresar una política equivalente a:

```ts
interface SpaceCoordinationPolicy {
  id: string;
  mode: "ALIGN_STARTS";
  severity: "REQUIRED" | "PREFERRED" | "OFF";
  laneSpaceIds: [string, string];
  toleranceMinutes: number;
  pairing: "DYNAMIC_ORDINAL";
  activeWhile: "ALL_LANES_HAVE_ELIGIBLE_WORK";
  eligibility: ExplicitCoordinationEligibility;
}
```

## 9.4 Elegibilidad explícita

Configurar que un espacio se coordina con otro no significa que todas sus tareas deban emparejarse.

La política deberá identificar qué tareas son elegibles mediante relaciones estructuradas, por ejemplo:

- IDs de tarea del día;
- plantillas explícitamente seleccionadas;
- `coordinationGroupId` proyectado sobre las instancias;
- otra regla tipada aceptada por el dominio.

Queda prohibido emparejar por:

- nombre de tarea;
- nombre de espacio;
- posición en la lista;
- participante conocido;
- benchmark;
- coincidencia textual.

## 9.5 Emparejamiento dinámico

`DYNAMIC_ORDINAL` significa que el planificador elige el orden real de cada carril.

La pareja de la ronda N se determina por el ordinal programado, no por el ordinal del input.

No se fija la pareja en configuración salvo que exista otro contrato explícito distinto.

## 9.6 Severidad REQUIRED

Con `REQUIRED`:

- mientras ambos carriles tengan trabajo elegible pendiente, sus siguientes tareas coordinadas deben comenzar dentro de la tolerancia configurada;
- una violación invalida el plan;
- el carril largo puede continuar cuando el corto se agota si la política lo permite;
- ninguna tarea puede colocarse parcialmente como parte de una ronda.

La sincronización exacta de rondas de Totales pertenece a esta categoría con tolerancia cero.

## 9.7 Severidad PREFERRED

Con `PREFERRED`:

- las tareas pueden comenzar separadas si es necesario para completar la jornada o mejorar una prioridad superior;
- la desviación genera penalización cuantificable;
- la Evidence registra pares coordinables, pares alineados, desviación total y motivo de incumplimiento;
- la preferencia nunca se convierte silenciosamente en hard.

## 9.8 OFF

Con `OFF` no existe coordinación temporal entre los espacios.

Se mantienen sus restricciones generales de disponibilidad, capacidad, recursos y ocupación.

## 9.9 No colapsar espacios

Una política de coordinación:

- no fusiona espacios;
- no comparte sus recursos salvo asignación explícita;
- no aumenta capacidad;
- no elimina conflictos internos de cada espacio;
- no permite solapar a un participante o recurso común;
- no transforma dos tareas en `jointGroupId` si ocurren en espacios distintos.

---

# 10. Configuración de UI

## 10.1 Editor de plantilla de tarea

La UI deberá permitir configurar, como mínimo:

### Tiempo adicional posterior

- duración en minutos;
- severidad;
- bloquear espacio;
- bloquear participante;
- bloquear recursos efectivos;
- recursos concretos adicionales;
- ayuda contextual que aclare que no aumenta la duración productiva.

## 10.2 Editor de instancia del día

La instancia deberá mostrar:

- valor heredado;
- origen;
- override actual;
- acción para restaurar el valor heredado;
- impacto estimado sobre ocupación y agenda.

## 10.3 Editor de espacio

La UI deberá permitir:

- seleccionar otro espacio mediante relación estructurada;
- elegir modo de coordinación;
- elegir REQUIRED, PREFERRED u OFF;
- configurar tolerancia;
- definir elegibilidad;
- ver si la regla es general o del día;
- detectar referencias circulares o duplicadas antes de guardar.

La selección podrá limitarse inicialmente a espacios de la misma zona por usabilidad, pero la restricción de dominio no se inferirá del nombre del plató.

## 10.4 Comparación de configuración

Antes de actualizar un día desde configuración general deberá mostrarse:

- valor anterior;
- valor nuevo;
- instancias afectadas;
- reglas añadidas, eliminadas o modificadas;
- necesidad de replanificación.

## 10.5 Visualización del planning

Las ocupaciones derivadas deberán aparecer diferenciadas de las tareas productivas.

Ejemplos de etiquetas:

- “Despeje de espacio”; 
- “Recuperación de participante”;
- “Cambio técnico”;
- “Preparación de siguiente ronda”.

No deberán parecer tareas realizadas por el concursante cuando no lo bloquean.

---

# 11. Persistencia

## 11.1 Requisitos generales

La base de datos deberá conservar:

- configuración general;
- snapshot diario;
- overrides;
- origen del valor;
- versión efectiva;
- auditoría de cambios;
- relaciones mediante claves estables;
- severidad;
- unidades.

## 11.2 Modelo lógico de ocupaciones derivadas

Se recomienda separar:

- definición general o de plantilla;
- copia efectiva del día;
- override de instancia.

No se obliga en esta SPEC a nombres físicos concretos de tablas.

La implementación deberá evitar:

- duplicar toda la tarea en JSON;
- almacenar IDs humanos concatenados;
- guardar nombres como relaciones;
- mezclar configuración general y efectiva en la misma fila sin origen;
- campos cuyo significado dependa de un motor concreto.

## 11.3 Modelo lógico de coordinación entre espacios

La persistencia deberá representar explícitamente:

- política;
- carriles o espacios relacionados;
- modo;
- severidad;
- tolerancia;
- elegibilidad;
- ámbito general o diario;
- estado activo;
- versión.

La misma pareja de espacios no podrá tener políticas activas contradictorias para el mismo conjunto elegible.

## 11.4 RLS y permisos

Las nuevas entidades deberán respetar el modelo de acceso vigente.

Como mínimo:

- Admin configura valores generales;
- Producción autorizada puede aplicar overrides del día;
- usuarios operativos pueden visualizar el valor efectivo;
- toda mutación registra autor y momento;
- RLS no debe convertir una relación ausente en una configuración parcial silenciosa.

---

# 12. EngineInput y Estado Operativo

## 12.1 Proyección sin pérdida

EngineInput deberá recibir la configuración efectiva, no reglas generales que el motor deba reinterpretar.

Para cada política deberá conservar:

- ID;
- propietario;
- duración o tolerancia;
- severidad;
- entidades ocupadas;
- tareas o espacios referenciados;
- origen efectivo cuando sea necesario para Evidence.

## 12.2 Preflight

El adaptador deberá rechazar:

- duración negativa o incompatible con la rejilla;
- entidad referenciada inexistente;
- política REQUIRED sin datos suficientes;
- severidad desconocida;
- duplicados contradictorios;
- espacio coordinado consigo mismo;
- política de coordinación con menos o más carriles de los soportados;
- tarea elegible perteneciente simultáneamente a políticas incompatibles;
- override parcial que pierda semántica;
- configuración general no materializada cuando el motor sólo admite configuración efectiva.

No se producirá un problema parcial.

## 12.3 Inmutabilidad

La adaptación será pura.

No reordenará ni modificará el input original.

La inversión de arrays que representan conjuntos no cambiará fingerprints ni resultado.

---

# 13. Motor y búsqueda

## 13.1 Filtro hard

Las ocupaciones REQUIRED participan en:

- disponibilidad;
- solapamientos;
- capacidad;
- comidas;
- transiciones;
- locks;
- Future Feasibility;
- búsqueda exacta;
- validación final.

Una tarea cuya ocupación derivada REQUIRED no cabe no es una colocación válida.

## 13.2 Preferencias

Las políticas PREFERRED se puntúan sólo después de validar todas las reglas hard.

Las penalizaciones deberán ser:

- deterministas;
- comprensibles;
- configurables;
- registradas en Evidence;
- comparables entre alternativas.

## 13.3 Presupuesto

Toda alternativa simulada por estas capacidades consume el presupuesto oficial correspondiente.

No se realizarán barridos ocultos.

## 13.4 Backtracking

Una colocación localmente válida que cierre una ocupación posterior o una coordinación futura deberá poder deshacerse.

Un fallo greedy no prueba inviabilidad.

## 13.5 Publicación atómica

Esta sección se refiere al **resultado automático materializado por este contrato**, no a `ScopeProposal`, `Draft` o `WorkingPlan` parciales del flujo Assisted. Si la ejecución automática que pretende materializar ese resultado está incompleta o agota presupuesto sin incumbente aceptable:

- no se publican tareas parciales;
- no se publican holds parciales;
- no se publican preparaciones parciales;
- no se publican coordinaciones parciales.

---

# 14. Validación canónica

La validación deberá comprobar, para cada hold REQUIRED:

- tarea origen exactamente una vez;
- identidad canónica;
- duración exacta;
- adyacencia exacta;
- entidades ocupadas exactas;
- disponibilidad;
- comidas;
- solapamientos;
- transiciones posteriores;
- ausencia de holds extra;
- ausencia de holds omitidos.

Para cada política de coordinación REQUIRED:

- miembros exactos;
- elegibilidad exacta;
- emparejamiento ordinal real;
- tolerancia;
- rondas compartidas;
- rondas residuales permitidas;
- ausencia de miembros extra;
- ausencia de rondas parciales;
- cumplimiento de las reglas hard propias de cada tarea.

Las validaciones de búsqueda y publicación no reemplazan la validación canónica final.

---

# 15. Fingerprint y reproducibilidad

El fingerprint deberá cambiar cuando cambie cualquier dato semántico efectivo de:

- hold;
- ocupación;
- entidad bloqueada;
- duración;
- severidad operativa que afecte al resultado;
- coordinación publicada;
- tolerancia aplicada.

Las llamadas históricas sin estas capacidades deberán conservar fingerprints cuando el contrato ausente mantenga el comportamiento histórico.

Todo planning deberá poder reconstruirse con:

- snapshot efectivo;
- overrides;
- locks;
- política de búsqueda;
- presupuesto;
- versión de contratos.

---

# 16. Evidence mínima

## 16.1 Ocupaciones derivadas

La Evidence deberá registrar:

- políticas efectivas;
- origen general, diario o instancia;
- severidad;
- tarea origen;
- entidades ocupadas;
- duración;
- intervalo publicado;
- candidatos rechazados por el hold;
- violaciones finales;
- minutos de ocupación por espacio, participante y recurso.

## 16.2 Coordinación de espacios

La Evidence deberá registrar:

- política efectiva;
- espacios;
- severidad;
- tolerancia;
- tareas elegibles;
- orden real de cada carril;
- pares ordinales;
- pares alineados;
- desviaciones;
- rondas residuales;
- backtracks;
- incumplimientos PREFERRED y su motivo;
- violaciones REQUIRED;
- ramas consumidas.

---

# 17. Tests obligatorios

## 17.1 Ocupación sólo de espacio

- tarea productiva termina;
- el espacio queda bloqueado el tiempo configurado;
- el participante puede comenzar otra tarea compatible;
- otra tarea no puede entrar en el espacio durante el hold.

## 17.2 Ocupación de participante

- el participante no puede comenzar otra tarea hasta terminar el hold;
- el espacio puede liberarse si no está seleccionado.

## 17.3 Ocupación de recursos

- sólo los recursos seleccionados permanecen ocupados;
- no se infieren recursos por nombre o categoría.

## 17.4 Comidas y disponibilidad

- hold que cruza una pausa aplicable: inválido;
- hold que termina al inicio de la pausa: válido;
- hold fuera de disponibilidad: inválido.

## 17.5 General, snapshot y override

- valor general copiado al día;
- cambio general posterior no altera el día;
- override cambia sólo la instancia;
- restaurar herencia recupera el valor del snapshot;
- origen visible y reproducible.

## 17.6 Coordinación REQUIRED

- tareas alineadas dentro de tolerancia;
- desalineación inválida;
- carril residual válido cuando el otro se agota;
- emparejamiento dinámico independiente del orden del input.

## 17.7 Coordinación PREFERRED

- alternativa alineada recibe menor coste en igualdad de condiciones;
- una alternativa no alineada sigue siendo válida;
- la Evidence explica la desviación.

## 17.8 Contratos negativos

- referencias inexistentes;
- severidad inválida;
- duración negativa;
- espacio coordinado consigo mismo;
- elegibilidad ambigua;
- políticas duplicadas;
- configuración parcial;
- mezcla incompatible con setup o grupo sincronizado cuando proceda.

## 17.9 Propiedades generales

- determinismo;
- invariancia al orden;
- input inmutable;
- agotamiento atómico;
- presupuesto no excedido;
- fingerprints históricos conservados cuando la capacidad está ausente.

---

# 18. Antipatrones prohibidos

Queda prohibido:

- sumar minutos invisibles a la duración productiva;
- bloquear siempre espacio, participante y recursos como paquete inseparable;
- deducir una regla por nombre de tarea o espacio;
- utilizar un único campo booleano para semánticas distintas;
- guardar reglas sólo en frontend;
- guardar reglas sólo en motor;
- utilizar JSON opaco sin esquema para evitar modelar el dominio;
- crear una tabla universal de reglas arbitrarias;
- duplicar validadores hard;
- tratar PREFERRED como REQUIRED;
- relajar REQUIRED para completar un día;
- aplicar cambios generales silenciosamente a días existentes;
- reconstruir la configuración general durante la planificación de un día;
- emparejar espacios completos sin elegibilidad explícita;
- convertir coordinación entre espacios independientes en capacidad compartida;
- publicar ocupaciones sintéticas sin su tarea origen;
- ocultar ocupaciones derivadas en métricas productivas.

---

# 19. Orden de implementación

La implementación se realizará mediante unidades lógicas separadas.

## Fase 1 — Auditoría de superficie configurable

Inventariar:

- campos actuales de tarea, espacio, participante, recurso y plan;
- defaults en código;
- constantes de dominio;
- inferencias por nombre;
- valores presentes en UI pero no en DB;
- valores presentes en DB pero no proyectados al motor;
- valores presentes en motor sin editor de configuración;
- diferencias entre configuración general y snapshot diario.

Resultado: matriz de cobertura y deuda priorizada.

## Fase 2 — Contrato de hold posterior

Introducir únicamente:

- tipos de dominio;
- persistencia general y diaria;
- override de instancia;
- API;
- UI;
- proyección EngineInput;
- preflight;

Sin modificar todavía la búsqueda autoritativa si no existe cobertura completa.

## Fase 3 — Hold posterior en motor

Integrar:

- placement;
- Future Feasibility;
- búsqueda exacta;
- validación;
- fingerprint;
- Evidence;
- publicación.

## Fase 4 — Coordinación PREFERRED entre espacios

Introducir primero la preferencia genérica y su scoring, sin alterar el contrato REQUIRED de rondas ya existente.

## Fase 5 — Unificación controlada

Evaluar qué helpers y UI pueden compartir:

- ronda sincronizada REQUIRED;
- coordinación PREFERRED;
- hold posterior;
- preparación de setup;

No fusionar contratos que tengan semánticas diferentes.

## Fase 6 — Merge gate y documentación de cobertura

Ejecutar:

- tests focales;
- suite completa;
- TypeScript;
- build;
- migraciones;
- RLS;
- benchmarks aplicables;
- Evidence reproducible;
- validación de snapshot y overrides;
- auditoría de regresión.

---

# 20. Primer corte recomendado

El siguiente cambio de código de esta línea deberá implementar únicamente la **auditoría de superficie configurable** y el contrato documental de `TaskTemporalHoldPolicy`.

No deberá implementar simultáneamente:

- holds en motor;
- coordinación genérica entre espacios;
- migraciones productivas;
- UI final;
- búsqueda exacta de Totales.

La auditoría deberá producir el mapa exacto desde:

```text
DB → API → UI → buildInput → EngineInput → adaptador → Planner Next → validación → Evidence
```

para los campos existentes y señalar las pérdidas de información.

---

# 21. Invariantes de aceptación del contrato integrado

Este contrato se considera vigente y debe permanecer demostrado cuando:

- exista una matriz verificable de superficie configurable;
- no dependa de que el usuario recuerde casos futuros;
- el hold posterior pueda configurarse por entidad;
- la duración productiva permanezca separada;
- configuración general, snapshot y override sean reproducibles;
- la UI muestre origen y severidad;
- EngineInput reciba el valor efectivo;
- el motor y el validador compartan semántica;
- REQUIRED, PREFERRED y OFF se preserven;
- la coordinación entre espacios use IDs y elegibilidad explícita;
- Totales no dependa de nombres ni IDs especiales;
- la Evidence explique ocupaciones y coordinación;
- las pruebas demuestren determinismo, invariancia e input inmutable;
- ningún día parcialmente planificado se publique **como plan automático completo** al agotar presupuesto; WorkingPlan/Draft/ScopeProposal conservan su semántica Assisted.

---

# 22. Regla final

> La configuración general prepara el día.  
> El snapshot y los overrides definen la realidad efectiva.  
> El motor planifica únicamente esa realidad efectiva.  
> Ningún nombre, ejemplo o constante puede sustituirla.


---

# PARTE III — Contratos integrados de asignación, disponibilidad y snapshots

**Provenance:** esta Parte integra el contenido normativo estable de tres antiguos addenda de asignación efectiva, disponibilidad temporal de recursos y snapshot/herencia de configuración. Esos archivos están retirados y sus nombres no crean autoridad paralela.

**Ámbito vigente:** configuración efectiva, asignación de recursos, disponibilidad temporal, snapshots diarios, herencia operativa, planificación y replanificación.

Las tres secciones siguientes se interpretan conjuntamente y bajo la precedencia por ámbito de la Fuente 00.

> **Principio transversal**  
> La configuración general prepara el día.  
> El snapshot diario y las asignaciones efectivas gobiernan la planificación real.

---

## Índice

- Parte I — Semántica de asignación efectiva de recursos
- Parte II — Disponibilidad temporal y snapshot diario de recursos
- Parte III — Configuración predeterminada, snapshot del día y herencia operativa

---
## PARTE I — Semántica de asignación efectiva de recursos

**Provenance:** antiguo addendum de semántica de asignación efectiva de recursos; archivo retirado y contenido integrado aquí.

### Contrato integrado — Semántica de asignación efectiva de recursos

**Provenance histórica:** propuesta original incorporada en esta Fuente; no constituye autoridad separada.  
**Ámbito:** tareas, espacios, platós/zonas, recursos y planificación  
**Fecha:** 2 de agosto de 2026

---

## 1. Objetivo

Definir de forma inequívoca cuándo un recurso humano o técnico debe considerarse necesario para ejecutar una tarea.

Esta regla se aplica a cualquier recurso del plan, incluidos vocal coach, presentadora, auxiliar, cámara, sonido, equipos técnicos y cualquier otro `plan_resource_item`.

La planificación debe reflejar la configuración efectiva vigente en la app.

## 2. Principio rector

> Un recurso sólo es consumido por una tarea cuando existe una asignación efectiva vigente que lo vincula a esa tarea o al ámbito operativo donde se ejecuta.

No se puede inferir el consumo de un recurso a partir de:

- el nombre o categoría de la tarea;
- el nombre, tipo o categoría del recurso;
- la plantilla que originó la tarea;
- una regla de autocreación;
- el vocal coach asignado al concursante;
- IDs conocidos, posiciones, benchmarks o ejemplos de un programa concreto.

La configuración efectiva prevalece sobre cualquier valor por defecto o regla histórica de creación.

## 3. Reglas de autocreación

Las reglas de vocal coach pueden utilizarse para agilizar la configuración inicial.

Cuando se asigna un vocal coach a un concursante, estas reglas pueden crear determinadas tareas, asignar inicialmente el vocal coach, proponer un espacio y ordenar la creación.

Estas reglas son únicamente un mecanismo de inicialización.

Después de crear la tarea:

- la instancia es editable;
- el usuario puede retirar el vocal coach;
- el usuario puede asignar otro recurso;
- el usuario puede asignar un vocal coach a otra tarea;
- la planificación debe utilizar el estado efectivo actual;
- la planificación no debe reconstruir la asignación inicial desde la regla de autocreación.

Por tanto:

> Una tarea creada por una regla de vocal coach no consume automáticamente al vocal coach durante la planificación.

## 4. Vocal coach asignado al concursante

La relación:

`contestantId -> vocalCoachPlanResourceItemId`

identifica el vocal coach de referencia del concursante en la configuración del día.

Sirve para agilizar la creación inicial, validar relaciones explícitas y ofrecer explicaciones operativas.

No significa que:

- todas las tareas del concursante requieran vocal coach;
- todas las tareas de categoría vocal requieran vocal coach;
- el motor deba añadir automáticamente el coach a una tarea;
- el motor pueda sustituirlo por otro coach disponible.

El consumo durante la planificación depende exclusivamente de las asignaciones efectivas vigentes.

## 5. Niveles de asignación efectiva

### 5.1 Asignación directa a tarea

Una asignación contenida en:

`daily_tasks.assigned_resource_ids`

obliga a que el recurso esté disponible durante toda la ejecución de esa tarea.

La asignación afecta sólo a esa tarea, salvo que el mismo recurso también esté asignado en otro ámbito.

Retirar el recurso de la tarea elimina esta obligación directa.

### 5.2 Asignación a espacio

Una asignación explícita de un recurso a un espacio obliga a que ese recurso esté disponible durante todas las tareas que se ejecuten en ese espacio.

La aplicación a espacios descendientes no debe inferirse automáticamente.

Cualquier herencia entre espacios deberá estar definida por un contrato operativo explícito y representada de forma inequívoca. En ausencia de ese contrato, la asignación se aplica al espacio exacto.

### 5.3 Asignación a plató o zona

Una asignación explícita de un recurso a un plató o zona obliga a que ese recurso esté disponible durante todas las tareas que se ejecuten en cualquier espacio perteneciente a esa zona.

La zona efectiva de la tarea deberá resolverse mediante IDs y relaciones estructuradas, nunca por nombres.

## 6. Composición de asignaciones

Las asignaciones efectivas se componen mediante unión.

Para una tarea, el conjunto de recursos obligatorios será la unión de:

1. recursos asignados directamente a la tarea;
2. recursos asignados a su espacio efectivo;
3. recursos asignados a su zona o plató efectivo.

No existe prioridad que elimine otro nivel.

Los duplicados se eliminan de forma determinista.

## 7. Edición humana y prevalencia

La edición humana prevalece sobre la configuración inicial.

### Caso A — tarea creada con coach y después retirado

- una regla crea la tarea con coach 335;
- el usuario retira 335 de `assigned_resource_ids`;
- 335 no se consume por asignación directa;
- si 335 sigue asignado al espacio o a la zona, continúa siendo necesario por ese ámbito.

### Caso B — coach añadido a otra tarea

- la tarea no fue creada por una regla de vocal coach;
- el usuario asigna 335 directamente;
- la tarea consume 335 durante toda su duración.

### Caso C — coach asignado a un plató

- el usuario asigna 335 a la zona 1;
- todas las tareas ejecutadas en la zona 1 consumen 335;
- no importa qué plantilla, categoría o concursante tengan.

### Caso D — coach del concursante no asignado

- el concursante tiene coach de referencia 335;
- la tarea, el espacio y la zona no tienen 335 asignado;
- la tarea no consume vocal coach.

## 8. Recursos concretos y sustitución

Una asignación explícita a un `plan_resource_item` identifica un recurso concreto.

El planificador no puede sustituirlo por otro recurso del mismo tipo, otro vocal coach, el primero disponible ni un recurso de la misma categoría.

Si el recurso concreto no está disponible o produce un conflicto, el resultado debe declarar el blocker, explicar el recurso afectado y permitir una decisión humana posterior.

Nunca deberá realizar una sustitución silenciosa.

## 9. Solapes y disponibilidad

Todo recurso efectivo requerido por una tarea:

- queda ocupado durante el intervalo completo;
- no puede participar simultáneamente en otra tarea incompatible;
- debe respetar su disponibilidad temporal;
- debe respetar transiciones, desplazamientos y locks;
- debe aparecer en la explicación del resultado.

Las tareas `in_progress` y `done` conservan sus asignaciones y no pueden ser modificadas por la replanificación.

Las tareas `cancelled` no consumen recursos.

## 10. Asignación concreta frente a requisito genérico

### Asignación concreta

Referencia un `plan_resource_items.id`.

Ejemplo:

`assignedResourceIds: [335]`

Significa que la tarea necesita exactamente el recurso 335.

### Requisito genérico

Referencia una cantidad por tipo, item global o alternativa.

Ejemplo:

`resourceRequirements.byType[typeId] = 1`

Significa que el planificador debe seleccionar un recurso compatible.

Un requisito genérico no puede sustituir una asignación concreta.

Una asignación concreta no debe perderse durante la resolución de requisitos genéricos.

## 11. Representación para motores

Todo motor debe recibir una representación determinista y reversible de los recursos efectivos de cada tarea.

Para cada tarea debe poder explicarse:

- qué recursos proceden de asignación directa;
- qué recursos proceden del espacio;
- qué recursos proceden de la zona;
- qué recursos proceden de requisitos genéricos resueltos;
- qué IDs concretos se consumen finalmente.

La adaptación no debe reconstruir reglas de autocreación, inferir coaches desde nombres o tipos, añadir el coach del concursante sin asignación efectiva, eliminar asignaciones explícitas ni mezclar `resource_items.id` con `plan_resource_items.id`.

## 12. Evidence mínima

La implementación deberá cubrir:

1. tarea con coach directo;
2. tarea creada por regla pero con coach retirado;
3. coach añadido manualmente a otra tarea;
4. coach asignado a un espacio;
5. coach asignado a una zona;
6. unión tarea + espacio + zona;
7. duplicado del mismo recurso en varios niveles;
8. dos tareas simultáneas que requieren el mismo coach;
9. coach del concursante sin asignación efectiva;
10. recurso concreto inexistente;
11. recurso no disponible;
12. tareas `in_progress` y `done`;
13. tarea `cancelled`;
14. ausencia de inferencia por nombre, tipo, plantilla o categoría;
15. determinismo, pureza e invariancia al orden.

## 13. Regla final

> Las reglas y valores por defecto preparan la configuración.  
> Las asignaciones efectivas vigentes gobiernan la planificación.

---

## PARTE II — Disponibilidad temporal y snapshot diario de recursos

**Provenance:** antiguo addendum de disponibilidad temporal y snapshot diario de recursos; archivo retirado y contenido integrado aquí.

### Contrato integrado — Disponibilidad temporal y snapshot diario de recursos

**Provenance histórica:** propuesta original incorporada en esta Fuente; no constituye autoridad separada.  
**Ámbito:** recursos globales, recursos del plan, disponibilidad y planificación  
**Fecha:** 2 de agosto de 2026

---

## 1. Objetivo

Definir la fuente autoritativa y la semántica de la disponibilidad temporal de cada recurso operativo.

Esta regla se aplica a cualquier recurso concreto del catálogo y del snapshot diario, incluidos vocal coaches, presentadores, auxiliares, cámaras, sonido, banda, equipos técnicos y recursos ad hoc.

## 2. Principio rector

> Cada recurso concreto puede disponer de una ventana temporal propia. La planificación sólo podrá utilizarlo dentro de la intersección entre su disponibilidad y la jornada del plan.

La disponibilidad no se inferirá por:

- nombre;
- tipo;
- categoría;
- tarea;
- espacio;
- zona;
- coach asignado al concursante;
- reglas históricas;
- valores de otro plan.

## 3. Dos niveles de configuración

### 3.1 Configuración global

Cada `resource_item` podrá configurar una ventana de disponibilidad por defecto:

- `defaultAvailabilityStart`;
- `defaultAvailabilityEnd`.

Esta configuración existe fuera de cualquier plan.

Sirve exclusivamente como valor inicial para nuevos planes.

### 3.2 Snapshot del plan

Cada `plan_resource_item` conservará su propia ventana:

- `availabilityStart`;
- `availabilityEnd`.

El snapshot del plan es la fuente autoritativa durante la planificación de ese día.

Después de crear el plan:

- la disponibilidad puede modificarse;
- la modificación afecta sólo a ese plan;
- los cambios posteriores del recurso global no alteran planes existentes;
- no existe sincronización silenciosa con el catálogo global.

## 4. Creación del plan

Al crear un plan, cada recurso global incluido en el snapshot copiará su configuración de disponibilidad.

Reglas:

1. Si el recurso global tiene inicio y fin explícitos, ambos se copian al `plan_resource_item`.
2. Si ambos valores globales están ausentes, el snapshot conserva el modo “jornada completa”.
3. Si se crea un recurso ad hoc dentro de un plan sin ventana explícita, se inicializa en modo “jornada completa”.
4. Nunca se copia disponibilidad desde otro plan.

## 5. Jornada completa por defecto

La ausencia simultánea de inicio y fin significa:

> Disponible durante toda la jornada configurada en el plan.

No significa:

- 24 horas;
- `00:00–23:59`;
- una ventana fija independiente de la jornada;
- disponibilidad fuera del día operativo.

Por tanto:

```text
availabilityStart = null
availabilityEnd = null
```

se resuelve como:

```text
plan.workStart -> plan.workEnd
```

Si cambia la jornada del plan, un recurso que continúa en modo “jornada completa” se ajusta a la nueva jornada.

## 6. Ventana explícita

Una ventana explícita requiere simultáneamente:

- inicio válido `HH:mm`;
- fin válido `HH:mm`;
- inicio anterior al fin.

No se admite:

- sólo inicio;
- sólo fin;
- formato inválido;
- ventana de duración cero;
- ventana invertida;
- cruce de medianoche mientras no exista un contrato específico para jornadas nocturnas.

La disponibilidad efectiva será:

```text
jornada del plan
∩ ventana explícita del recurso
```

La parte situada fuera de la jornada no genera disponibilidad adicional.

## 7. Una ventana continua

El contrato actual permite una única ventana continua por recurso y plan.

Ejemplos:

- jornada completa;
- `08:00–14:00`;
- `10:30–18:00`.

La introducción futura de varias ventanas discontinuas requerirá una ampliación explícita del contrato, la documentación y la Evidence. No se simularán múltiples ventanas mediante nombres, duplicados o recursos ficticios.

## 8. Relación con `isAvailable`

`isAvailable` y la ventana representan conceptos distintos.

### `isAvailable = false`

El recurso no puede utilizarse en ninguna tarea del plan, aunque conserve una ventana configurada.

### `isAvailable = true`

El recurso puede utilizarse dentro de su ventana efectiva:

- jornada completa si inicio y fin son nulos;
- intersección con la ventana explícita si ambos existen.

El motor nunca sustituirá un recurso no disponible por otro.

## 9. Autoridad del modelo nuevo

La disponibilidad de los recursos actuales del plan se vincula a:

- `resource_items.id` para defaults globales;
- `plan_resource_items.id` para el snapshot diario.

La tabla legacy `resource_availability`, vinculada a `resources.id`, no es la autoridad para `plan_resource_items`.

No se mezclarán silenciosamente ambos modelos.

Cualquier migración o compatibilidad futura deberá ser explícita y auditable.

## 10. EngineInput y motores

Antes de ejecutar Planner Next, cada `plan_resource_item` requerido deberá proyectarse con una ventana efectiva explícita.

La proyección deberá:

1. leer la ventana del snapshot;
2. resolver valores nulos como jornada completa;
3. intersectar con la jornada;
4. respetar `isAvailable`;
5. conservar el `plan_resource_items.id`;
6. no inferir ni sustituir;
7. bloquear entradas inválidas.

La persistencia de las ventanas y su proyección al motor son unidades separadas.

## 11. Tareas protegidas y replanificación

Las tareas `in_progress` y `done` conservan sus recursos y tiempos.

Una modificación de disponibilidad no autoriza al motor a alterar tareas protegidas.

Si una tarea protegida queda fuera de la nueva disponibilidad configurada, deberá aparecer como inconsistencia operativa explícita para decisión humana.

Las tareas `cancelled` no consumen recursos.

## 12. Evidence mínima

La implementación deberá cubrir:

1. recurso global sin ventana explícita;
2. recurso global con ventana explícita;
3. copia al crear un plan;
4. independencia del snapshot;
5. cambio global posterior sin efecto retroactivo;
6. override dentro del plan;
7. recurso ad hoc con jornada completa;
8. pareja parcial inválida;
9. formato inválido;
10. inicio igual o posterior al fin;
11. intersección con la jornada;
12. `isAvailable = false`;
13. ausencia de lectura del modelo legacy;
14. determinismo;
15. ausencia de sustitución;
16. robustez ante `null` y `undefined`.

## 13. Regla final

> El catálogo global propone la disponibilidad inicial.  
> El snapshot del plan gobierna la jornada real.

---

## PARTE III — Configuración predeterminada, snapshot del día y herencia operativa

**Provenance:** antiguo addendum de configuración predeterminada, snapshot del día y herencia operativa; archivo retirado y contenido integrado aquí.

### Contrato integrado — Configuración predeterminada, snapshot del día y herencia operativa

**Provenance histórica:** propuesta original incorporada en esta Fuente; no constituye autoridad separada.  
**Ámbito:** configuración general, creación del día, jornada, comidas, platós/zonas, espacios, recursos y overrides diarios  
**Fecha:** 2 de agosto de 2026

---

## 1. Objetivo

Definir una regla transversal para toda la configuración operativa de OptiPlan:

> La configuración general proporciona valores predeterminados.  
> Cada día de producción conserva una copia propia, editable, auditable e independiente.

La planificación y la ejecución utilizarán siempre la configuración efectiva del día.

Nunca utilizarán silenciosamente la configuración general vigente en ese momento para reinterpretar un día ya creado.

## 2. Dos capas de configuración

### 2.1 Configuración general

La configuración general representa el funcionamiento habitual del programa o producción.

Puede definir, entre otros:

- horario predeterminado de la jornada;
- ventanas de comida y sus ámbitos;
- platós o unidades operativas;
- espacios contenidos en cada plató;
- disponibilidad predeterminada de platós;
- disponibilidad predeterminada de espacios;
- recursos y su disponibilidad;
- tareas y plantillas;
- setups;
- márgenes;
- reglas;
- objetivos;
- políticas operativas;
- atributos de concursantes;
- cualquier otra configuración reutilizable.

La configuración general no gobierna directamente un día ya creado.

### 2.2 Snapshot del día

Al crear un día, OptiPlan copia la configuración general aplicable.

La copia del día pasa a ser la autoridad operativa de esa jornada.

Después de crearla:

- puede modificarse sin alterar la configuración general;
- los cambios generales posteriores no la modifican;
- el motor utiliza exclusivamente la copia del día;
- la ejecución en vivo utiliza exclusivamente la copia del día;
- la misma entrada diaria debe poder reproducirse aunque la configuración general cambie más tarde.

## 3. Regla de independencia

Un cambio realizado en configuración general:

- afecta a días creados posteriormente;
- no afecta automáticamente a días existentes;
- no modifica tareas, recursos, espacios, comidas, reglas ni horarios ya copiados;
- no invalida silenciosamente una planificación existente;
- no cambia la Evidence histórica de un día.

Un cambio realizado dentro de un día:

- afecta sólo a ese día;
- se considera override diario;
- no actualiza la configuración general;
- debe quedar diferenciado en la UI respecto al valor heredado.

## 4. Copia manual de la configuración predeterminada

Dentro de un día existirá una acción explícita:

**Copiar configuración predeterminada**

Esta acción permite volver a leer la configuración general vigente y sustituir, de forma controlada, una categoría o toda la configuración del día.

La acción deberá cumplir:

1. ser iniciada por una persona autorizada;
2. mostrar previamente las diferencias;
3. permitir seleccionar una categoría concreta o toda la configuración;
4. indicar qué valores heredados, modificados o eliminados cambiarían;
5. simular y validar antes de consolidar;
6. aplicar el cambio de forma atómica dentro del alcance seleccionado;
7. registrar cuándo se copió y qué revisión general se utilizó;
8. no realizar sincronización continua ni automática.

La acción no debe confundirse con “restablecer la planificación”.

Copiar configuración:

- no mueve tareas por sí solo;
- no inicia automáticamente una nueva planificación;
- no modifica tareas `in_progress` o `done`;
- no elimina locks;
- no sustituye decisiones humanas ejecutadas;
- puede marcar la propuesta o planificación pendiente como desactualizada;
- puede exigir una revalidación o replanificación posterior de lo pendiente.

Si la nueva configuración entra en conflicto con tareas protegidas, locks o hechos ejecutados:

- no se modifican esos elementos;
- se publica la incompatibilidad;
- no se consolida silenciosamente un estado hard-invalid.

## 5. Jerarquía temporal de la jornada

La disponibilidad operativa se resuelve de arriba hacia abajo:

```text
Jornada del día
        ↓
Plató o unidad contenedora
        ↓
Espacio concreto
```

En el modelo actual, el nivel de plató o unidad contenedora puede estar representado por una `zone`.

La terminología visible al usuario debe adaptarse al lenguaje audiovisual del producto sin alterar las identidades técnicas.

## 6. Horario de la jornada

La configuración general define un horario de jornada predeterminado:

- inicio;
- fin.

Al crear un día:

- se copia al día;
- puede modificarse para esa jornada;
- el día conserva su propia pareja;
- cambios posteriores del default no lo alteran.

La jornada es la ventana máxima del día.

Ninguna disponibilidad dependiente puede ampliar la jornada.

## 7. Disponibilidad de platós o unidades contenedoras

Cada plató podrá configurar una ventana predeterminada propia.

Al crear el día, se copia al snapshot diario del plató.

### Sin ventana propia

Si el plató no define una ventana propia:

```text
disponibilidad efectiva del plató = jornada del día
```

### Con ventana propia

Si define una ventana explícita:

- debe estar contenida dentro de la jornada;
- puede comenzar más tarde;
- puede terminar antes;
- no puede comenzar antes de la jornada;
- no puede terminar después de la jornada;
- no puede ampliar el día.

Una ventana explícita fuera de la jornada es una configuración inválida.

No se corrige silenciosamente.

## 8. Disponibilidad de espacios

Cada espacio pertenece a un plató o unidad contenedora.

Puede definir una ventana propia más restrictiva.

### Sin ventana propia

Si el espacio no define una ventana:

```text
disponibilidad efectiva del espacio = disponibilidad efectiva del plató
```

### Con ventana propia

Si define una ventana explícita:

- debe estar completamente contenida dentro de la disponibilidad efectiva del plató;
- puede comenzar más tarde;
- puede terminar antes;
- no puede ampliar el horario del plató;
- no puede utilizarse para corregir o ignorar una restricción del plató.

Ejemplo válido:

```text
Jornada: 08:00–20:00
Plató:   09:00–19:00
Espacio: 10:00–18:00
```

Ejemplo inválido:

```text
Jornada: 08:00–20:00
Plató:   09:00–19:00
Espacio: 08:30–19:30
```

El segundo caso debe bloquearse o explicarse.

No se convierte silenciosamente en `09:00–19:00`.

## 9. Significado de ausencia de ventana

La ausencia de una ventana explícita significa **heredar del nivel superior**.

Por tanto:

- jornada: siempre tiene una ventana propia válida;
- plató sin ventana: hereda la jornada;
- espacio sin ventana: hereda el plató;
- recurso sin ventana: hereda la jornada según el contrato integrado de disponibilidad temporal y snapshot diario de recursos de esta misma Fuente.

La ausencia no significa:

- 24 horas;
- `00:00–23:59`;
- desconocido;
- usar la configuración general en tiempo real;
- copiar el horario de otro día.

## 10. Recursos

Se mantiene vigente el contrato de disponibilidad temporal de recursos integrado en esta Parte III.

Cada recurso:

- tiene un default global;
- lo copia al snapshot del día;
- puede modificarse dentro del día;
- no cambia por modificaciones globales posteriores;
- sin ventana explícita, está disponible durante la jornada del día;
- `isAvailable=false` impide su uso;
- conserva identidad exacta y no puede sustituirse silenciosamente.

La disponibilidad del recurso y la disponibilidad del espacio son restricciones independientes.

Una tarea sólo es viable cuando su intervalo cabe simultáneamente en:

- la jornada;
- el plató;
- el espacio;
- todos sus recursos;
- sus participantes;
- sus locks y demás restricciones hard.

## 11. Comidas

Las configuraciones de comida también siguen el modelo:

```text
default general
        ↓
snapshot del día
        ↓
override diario
```

Se mantiene la semántica oficial de comidas por ámbito.

No existe una comida global implícita que bloquee automáticamente todo el sistema.

Una comida puede estar configurada para:

- un espacio;
- un plató o unidad operativa;
- un recurso;
- una persona;
- un equipo itinerante;
- otro ámbito oficialmente soportado.

Al copiar la configuración general:

- se copian sus ventanas, duraciones, modos y ámbitos;
- puede modificarse sólo para el día;
- cambios globales posteriores no afectan al día;
- una comida debe ser válida respecto a la jornada y al ámbito al que pertenece.

La ausencia de una comida en un ámbito no significa jornada completa ni crea una comida automática.

## 12. Valores heredados y overrides

La UI deberá distinguir al menos:

- **Heredado:** coincide con la copia predeterminada;
- **Modificado para este día:** existe override diario;
- **Default actualizado:** la configuración general ha cambiado desde que se creó o actualizó el snapshot;
- **Incompatible:** la configuración efectiva contradice una restricción superior o un elemento protegido.

El motor no debe inferir esta procedencia a partir de que dos valores coincidan.

La procedencia debe ser explícita o derivable de metadata auditable.

## 13. Modificación de una restricción superior

Cuando se modifica la jornada o el horario de un plató:

- deben revalidarse sus descendientes;
- un espacio no puede quedar fuera del nuevo horario del plató;
- una comida no puede quedar fuera del ámbito temporal permitido;
- una tarea protegida no se mueve;
- un recurso no se sustituye;
- los conflictos se explican.

Una actualización que produzca un estado hard-invalid no se consolida **silenciosa ni automáticamente**. Una Stage humana sólo puede aceptarse mediante confirmación y AcceptedException conforme al contrato Assisted.

## 14. Creación de entidades dentro del día

Una entidad creada sólo dentro del día es ad hoc.

No se añade automáticamente a la configuración general.

Debe indicar:

- su identidad diaria;
- su procedencia ad hoc;
- su configuración efectiva;
- su relación con plató, espacio o recurso cuando corresponda.

La acción “Copiar configuración predeterminada” no debe borrar silenciosamente entidades ad hoc.

Las altas, bajas o eliminaciones del catálogo general se mostrarán como diferencias explícitas antes de aplicar.

## 15. Replanificación

Modificar o copiar configuración no autoriza a alterar lo ejecutado.

Se mantienen:

- tareas `done` inmutables;
- tareas `in_progress` inmutables;
- locks explícitos;
- replanificación sólo de lo pendiente;
- simulación antes de consolidación;
- decisión humana final.

Si una nueva configuración contradice una tarea protegida, el sistema debe:

1. conservar la tarea;
2. identificar la restricción contradictoria;
3. impedir una consolidación inválida;
4. solicitar una decisión humana.

## 16. Reproducibilidad y revisión de origen

Cada snapshot diario deberá poder indicar, como mínimo:

- cuándo se creó;
- cuándo se actualizó desde defaults;
- qué categoría se actualizó;
- qué revisión o versión de configuración general sirvió de origen;
- qué valores fueron modificados manualmente después.

No es obligatorio utilizar una única tabla o formato técnico para todas las categorías.

Sí es obligatorio conservar la independencia, trazabilidad y reproducibilidad.

## 17. Implementación incremental

Esta regla es transversal, pero no debe implementarse como un único cambio masivo.

La evolución se dividirá en unidades lógicas:

1. contrato y persistencia temporal de jornada, platós y espacios;
2. resolución efectiva e integración con `EngineInput`;
3. comparación y copia manual de defaults;
4. UI de heredado, override, diferencias y confirmación;
5. extensión progresiva a las categorías todavía no snapshotadas;
6. validación integral y Evidence.

Cada unidad deberá preservar compatibilidad y no declarar capacidades futuras como ya terminadas.

## 18. Evidence mínima

La implementación completa deberá cubrir:

1. creación de día desde defaults;
2. independencia frente a cambios generales;
3. override diario;
4. jornada como límite superior;
5. plató que hereda jornada;
6. plató explícito más restrictivo;
7. plató explícito fuera de jornada;
8. espacio que hereda plató;
9. espacio explícito más restrictivo;
10. espacio que intenta ampliar plató;
11. modificación de jornada que invalida un descendiente;
12. modificación de plató que invalida un espacio;
13. recursos con snapshot independiente;
14. comidas con snapshot y ámbito;
15. preview de diferencias;
16. copia de una categoría;
17. copia de toda la configuración;
18. operación atómica;
19. preservación de ad hoc;
20. preservación de `done`, `in_progress` y locks;
21. conflicto con tarea protegida;
22. determinismo;
23. auditoría de procedencia;
24. ausencia de sincronización silenciosa;
25. replanificación exclusiva de lo pendiente.

## 19. Regla final

> La configuración general describe cómo suele funcionar la producción.  
> El snapshot del día describe cómo funciona hoy.  
> El motor siempre planifica “hoy”.

---

# 20. Contrato integral de configurabilidad y UX de producción

## 20.1 Propósito de esta consolidación

Esta sección hace explícito el contrato transversal que ya se desprende de esta Fuente y de las Fuentes 01 y 03. No crea un motor genérico de reglas ni convierte detalles internos del solver en decisiones operativas del usuario.

Su objetivo es que OptiPlan pueda responder de forma determinista a tres preguntas:

1. ¿Qué puede configurar una persona y en qué nivel?
2. ¿Cuál es el valor efectivo que gobierna hoy?
3. ¿Cómo llega ese valor, sin pérdida ni inferencias nominales, hasta planificación, validación y Evidence?

La regla de completitud es:

> Ningún valor que pueda alterar viabilidad, ocupación, orden, coste, explicación o presupuesto de búsqueda puede depender de una constante de escenario, nombre conocido, ID conocido, benchmark o supuesto no representado como configuración efectiva o invariante explícito de producto.

## 20.2 Significado normativo de “todo configurable”

“Todo configurable” se aplica a **parámetros de producción y de ejecución** que puedan cambiar el resultado o el coste contractual de obtenerlo.

Deben ser configuración estructurada, cuando existan o procedan:

- horarios, ventanas, duraciones y tolerancias;
- capacidades y concurrencias;
- relaciones entre tareas;
- asignaciones y requisitos de recursos;
- alternativas permitidas;
- comidas y pausas por ámbito;
- transiciones y desplazamientos;
- bloques, continuidad, setup y reentrada;
- coordinación entre tareas, espacios o carriles;
- composición y disponibilidad de unidades itinerantes;
- políticas REQUIRED, PREFERRED y OFF;
- pesos y objetivos de calidad;
- política de búsqueda;
- rejilla temporal;
- límites y presupuestos de búsqueda;
- cualquier otro valor que cambie factibilidad, selección de candidato, explicación o coste computacional contractual.

No son configuración de producción y no se exponen como knobs arbitrarios:

- preservación de `done`, `in_progress` y locks;
- identidad exacta y reversibilidad;
- determinismo;
- verdad de `hardValid`/`requiredValid`;
- prohibición de publicación parcial como OfficialPlan completo;
- semántica de Stage, Draft, AutomaticProtection y AcceptedException;
- integridad referencial;
- versiones de contrato, migración o esquema;
- invariantes matemáticos necesarios para que una regla conserve su significado.

Estos elementos son invariantes del sistema. Cambiarlos exige evolución de Fuente/contrato, no una preferencia de usuario.

## 20.3 Configurable no significa visible siempre

Toda configuración contractual debe tener una representación de producto, pero la UI utiliza **divulgación progresiva**.

Se distinguen tres niveles de presentación:

### Operación habitual

Visible de forma directa a Producción cuando es necesario para preparar un día:

- jornada;
- participantes;
- tareas;
- espacios;
- recursos;
- disponibilidades;
- comidas;
- dependencias;
- transporte;
- setups y coordinación relevantes;
- restricciones particulares.

### Planificación avanzada

Visible en una sección avanzada, con lenguaje operativo y ayuda contextual:

- severidades;
- pesos;
- políticas de concentración;
- continuidad;
- tolerancias;
- reglas de bloques;
- política de búsqueda cuando sea una decisión autorizada;
- rejilla temporal cuando sea configurable para ese despliegue;
- **tiempo máximo de cálculo por propuesta Assisted**, con un valor general reutilizable, override del día y override opcional de la ejecución concreta.

El jefe de producción autorizado podrá aumentar o reducir el tiempo concedido al motor antes de solicitar cada propuesta sin modificar por ello las reglas operativas del día.

### Diagnóstico técnico / administración

Visible sólo a perfiles autorizados cuando no es una decisión cotidiana de Producción:

- presupuestos internos de ramas, backtracks, patrones y otros límites lógicos;
- límites técnicos de memoria o candidatos activos;
- warnings de compatibilidad;
- fingerprints y versiones contractuales.

La UI cotidiana no necesita exponer los contadores internos si el usuario puede controlar el presupuesto mediante una abstracción operativa comprensible. La traducción entre tiempo/esfuerzo solicitado y presupuesto interno deberá ser explícita, versionada y auditable.

Ocultar un parámetro de la vista habitual no autoriza a hardcodearlo. Debe seguir teniendo fuente, versión, default/ausencia documentados y Evidence cuando afecte la ejecución.

## 20.4 Niveles de configuración y precedencia

La arquitectura oficial se expresa así:

```text
CONFIGURACIÓN GENERAL / PREDETERMINADA
        ↓ snapshot explícito al crear o actualizar el día
SNAPSHOT DEL DÍA
        ↓ override autorizado
CONFIGURACIÓN EFECTIVA DEL DÍA
        ↓ override de una entidad/instancia concreta
OVERRIDE DE INSTANCIA
        ↓ decisiones humanas protegidas
LOCK / ESTADO PROTEGIDO / STAGE / ACCEPTED EXCEPTION
```

Precedencia:

```text
lock o estado protegido
  > override de instancia
  > override/configuración efectiva del día
  > snapshot heredado del día
  > configuración general
  > default documentado del contrato
```

`AutomaticProtection` y `AcceptedException` no se convierten en configuración general.

Un valor ausente sólo hereda cuando su contrato declara herencia. Si el contrato declara `OFF`, `AUTO` u otro comportamiento de ausencia, se utiliza exactamente esa semántica.

### 20.4.1 Creación de día con mínima configuración repetitiva

La configuración general existe precisamente para evitar que Producción reconstruya cada jornada desde cero.

Al crear un día nuevo:

1. OptiPlan materializa automáticamente el snapshot completo de toda configuración general aplicable;
2. el día queda inicialmente listo con esos valores heredados cuando no existen datos REQUIRED propios de la jornada pendientes;
3. el usuario revisa y modifica **sólo las excepciones del día**;
4. no se exige volver a confirmar, copiar manualmente o reintroducir valores que ya han sido heredados correctamente;
5. Day Setup prioriza visualmente diferencias, ausencias e incompatibilidades sobre valores normales heredados.

El patrón operativo esperado es:

```text
configuración inicial de la producción (esfuerzo principal)
        ↓
creación automática de cada día desde defaults
        ↓
revisión rápida de readiness
        ↓
modificación sólo de cambios/excepciones
```

La acción `Copiar configuración predeterminada` de días ya existentes es una operación explícita de refresh; **no es un paso obligatorio para crear o abrir cada jornada**.

### 20.4.2 Override de ejecución de una propuesta

Los parámetros que afectan sólo al coste de cálculo de una petición concreta —por ejemplo el tiempo máximo concedido al motor— pueden admitir un nivel adicional `RUN_OVERRIDE`.

Precedencia para esos parámetros de ejecución:

```text
RUN_OVERRIDE de la petición
  > override/default técnico del día
  > snapshot técnico heredado
  > configuración general
  > default contractual
```

`RUN_OVERRIDE` no puede cambiar restricciones de dominio, severidades, locks ni configuración operativa. Debe quedar registrado en la Evidence de la ejecución y no modifica silenciosamente el snapshot del día.

## 20.5 Propiedad y niveles permitidos

Cada capacidad deberá declarar un propietario de dominio. Como mínimo se reconocen:

| Propietario | Ejemplos | General | Día | Instancia |
|---|---|---:|---:|---:|
| Plan/jornada | horario, ventana global, rejilla, perfil de búsqueda | sí | sí | n/a |
| Plantilla de tarea | duración, dependencias tipo, requisitos, setup | sí | snapshot | sí cuando el contrato permita override |
| Tarea del día | duración efectiva, ventana, espacio, recursos, lock | no obligatoria | sí | sí |
| Participante | disponibilidad, comida, transición, atributos operativos | default si existe | sí | por tarea cuando proceda |
| Zona/plató | disponibilidad, comida, continuidad, límites | sí | sí | n/a |
| Espacio | disponibilidad, capacidad, setup, coordinación | sí | sí | por operación cuando proceda |
| Recurso | disponibilidad, capacidad, comida, transición, presencia | sí | sí | asignación por tarea/operación |
| Unidad itinerante | composición, disponibilidad, comida | sí cuando sea reutilizable | sí | por operación cuando proceda |
| Operación coordinada | anclada, conjunta, sincronizada, técnica | sí si es plantilla reutilizable | sí | sí |
| Política de optimización | pesos, preferencias, transporte | sí | snapshot/override | n/a |
| Perfil técnico de búsqueda | policy, budgets, time grid, tiempo máximo de propuesta | sí | snapshot/override autorizado | `RUN_OVERRIDE` para una ejecución concreta |

No todas las capacidades requieren los tres niveles. La ausencia de un nivel debe figurar expresamente en el registro de configurabilidad.

## 20.6 Estado `AUTO` y límites explícitos del usuario

`AUTO` está permitido sólo cuando constituye una semántica tipada y documentada.

Ejemplos válidos:

- número de bloques = `AUTO_MIN_FEASIBLE`;
- orden de familias = `AUTO` cuando el contrato permite que el planificador elija;
- espacio = conjunto de alternativas explícitas y elección automática entre ellas.

Para número de bloques, el contrato mínimo de producto deberá distinguir:

```text
AUTO_MIN_FEASIBLE
FIXED_COUNT(n)
```

`AUTO_MIN_FEASIBLE` es el default recomendado: el motor busca el mínimo número de bloques que permita completar hard-valid el alcance aplicable.

`FIXED_COUNT(n)` expresa una decisión explícita de Producción y se considera REQUIRED para esa ejecución/configuración mientras permanezca activa. El motor no puede relajarla silenciosamente a `n+1` ni sustituirla por AUTO.

Si la inviabilidad con `FIXED_COUNT(n)` queda **demostrada**, la UI deberá comunicar en lenguaje operativo, por ejemplo:

> “No se encontró una solución viable con 3 bloques, que es el número configurado.”

La explicación debe identificar la autoridad y, cuando sea posible, el conflicto causal.

Si no se ha demostrado inviabilidad y sólo se agotó tiempo o presupuesto, queda prohibido mostrar ese mensaje. Debe informarse, por ejemplo:

> “No se obtuvo una propuesta dentro del tiempo/presupuesto asignado. La inviabilidad con 3 bloques no está demostrada.”

Esto distingue `INFEASIBLE` de `BUDGET_EXHAUSTED` / `TIME_LIMIT_REACHED`.

El mismo patrón podrá extenderse a otras capacidades donde tenga sentido una decisión `AUTO` frente a un límite explícito, mediante contratos tipados propios.

`AUTO` nunca significa:

- deducir por nombre;
- usar un ID conocido;
- copiar la solución humana;
- elegir un default oculto;
- ignorar la ausencia de una relación REQUIRED.

La UI debe explicar qué decide el sistema y bajo qué límites.

## 20.7 Metadatos obligatorios de cada valor efectivo

Todo valor efectivo que pueda modificar la planificación deberá poder exponer, directamente o por detalle:

- capability ID estable;
- propietario y entidad;
- valor efectivo;
- unidad;
- severidad cuando aplique;
- origen (`GENERAL`, `INHERITED`, `DAY_OVERRIDE`, `INSTANCE_OVERRIDE` u otro origen tipado);
- valor heredado/base cuando exista;
- si está modificado;
- quién realizó la última mutación cuando exista identidad de usuario;
- fecha/hora de modificación;
- versión/revisión efectiva;
- estado de validación;
- si requiere replanificación;
- participación en fingerprint/Evidence cuando corresponda.

La igualdad accidental de dos valores no borra su provenance.

## 20.8 Arquitectura de UX

### Configuración general

`Ajustes` define el comportamiento habitual reutilizable. Debe agrupar, como mínimo:

1. Jornada y comidas.
2. Plantillas de tareas y dependencias.
3. Platós y espacios.
4. Recursos y unidades itinerantes.
5. Transporte.
6. Reglas operativas: transiciones, setups, bloques y coordinación.
7. Optimización y preferencias.
8. Planificación avanzada/ejecución técnica.
9. Permisos y administración cuando proceda.

### Day Setup / Configuración del día

Es la superficie autoritativa para preparar una jornada concreta, pero **no debe obligar a reconfigurar lo habitual**. Parte del snapshot automático heredado y adopta una UX `exception-first`: destaca qué cambió hoy, qué falta y qué es incompatible; los valores heredados correctos permanecen disponibles para inspección sin exigir interacción.

El objetivo operativo es que, tras el esfuerzo inicial de configuración general, abrir un día normal requiera como máximo revisar readiness y registrar únicamente cambios puntuales.

Debe permitir revisar el estado efectivo por categorías:

1. Resumen y readiness.
2. Jornada y comidas.
3. Participantes.
4. Tareas.
5. Platós y espacios.
6. Recursos y unidades itinerantes.
7. Transporte.
8. Operaciones y coordinación.
9. Reglas de planificación.
10. Avanzado, sólo para perfiles autorizados.

No se obliga a que cada categoría sea un tab físico. La arquitectura visual puede evolucionar siempre que preserve esta comprensión.

### Editor de entidad

Cada tarea, participante, espacio, recurso u operación debe mostrar sólo las opciones pertinentes a esa entidad. Los controles avanzados permanecen colapsados por defecto.

### Planning Assisted

El workspace de planificación no debe convertirse en el editor primario de toda la configuración. Debe:

- mostrar la revisión efectiva que está utilizando;
- señalar configuración incompleta o incompatible;
- permitir navegar a Day Setup;
- ofrecer refresh explícito y comparación cuando proceda;
- impedir generar una propuesta si falta una autoridad REQUIRED necesaria para ese scope.

## 20.9 Patrones UX obligatorios

Se utilizarán patrones equivalentes y reutilizables para:

### Valor efectivo

Mostrar:

- etiqueta humana;
- valor y unidad;
- badge de origen;
- severidad cuando aplique;
- ayuda breve;
- acción de editar si el rol lo permite.

### Origen

Etiquetas humanas mínimas:

- `Heredado`;
- `Modificado para este día`;
- `Modificado en esta tarea/entidad`;
- `Protegido`;
- `No configurado`;
- `No soportado todavía` sólo durante transición de producto.

Los códigos internos pueden aparecer en diagnóstico, no como lenguaje principal.

### Restaurar heredado

Toda capacidad con override reversible debe ofrecer una acción explícita equivalente a `Restaurar heredado`. Restaurar elimina el override; no copia el valor actual como un nuevo override idéntico.

### Severidad

Cuando una regla admita severidad, el control deberá expresar en lenguaje comprensible:

- `Obligatorio (REQUIRED)`;
- `Preferencia (PREFERRED)`;
- `Desactivado (OFF)`.

No se expondrá un simple checkbox cuando perdería esta diferencia semántica.

### Comparación antes de refresh

Debe mostrar al menos:

- valor actual;
- valor general candidato;
- origen actual;
- tipo de cambio;
- entidades afectadas;
- impacto sobre planificación existente;
- necesidad de replanificación;
- incompatibilidades con tareas/decisiones protegidas.

La selección se aplica atómicamente al alcance elegido.

## 20.10 Accesibilidad y lenguaje

Las superficies de configuración son operativas y deberán ser utilizables con teclado y tecnologías de asistencia.

Como mínimo:

- cada control posee nombre accesible inequívoco;
- `Label` y control están asociados cuando el patrón lo requiera;
- botones sólo-icono tienen nombre accesible, no dependen únicamente de `title`;
- error/ayuda/estado se asocian al control correspondiente;
- el foco no se pierde tras guardar, cerrar o invalidar;
- el color nunca es el único portador de estado;
- unidades y severidades se leen junto al valor;
- textos de Producción evitan nombres de campos internos, IDs y jerga de solver;
- las traducciones no mezclan idiomas en la misma superficie operativa.

## 20.11 Readiness del día

Antes de solicitar planificación automática, Day Setup deberá poder producir un gate estructurado de readiness.

Estados mínimos:

- `READY`;
- `INCOMPLETE`;
- `INCOMPATIBLE`;
- `UNSUPPORTED`.

El gate debe identificar por categoría:

- datos REQUIRED ausentes;
- referencias inválidas;
- relaciones ambiguas;
- overrides incompatibles;
- capacidades configuradas que Planner Next todavía no representa;
- conflictos con estados/locks protegidos cuando sean detectables antes de búsqueda.

`INCOMPLETE`, `INCOMPATIBLE` y `UNSUPPORTED` no se convierten en defaults silenciosos.

La UI deberá explicar qué corregir y llevar a la entidad correspondiente.

## 20.12 Familias de configuración obligatorias

El registro permanente de configurabilidad debe cubrir, cuando la producción las utilice, las siguientes familias sin hardcodes de escenario:

### Jornada

- inicio/fin;
- rejilla temporal;
- pausas globales explícitas;
- ventanas de comida aplicables;
- configuración técnica de ejecución y presupuesto.

### Participantes

- disponibilidad;
- tareas y dependencias;
- comida;
- transporte;
- margen de transición;
- atributos operativos que proyectan requisitos (`requiresBand` incluido);
- metadata informativa sin efecto operativo (`usesInstrument`, anotaciones u otras equivalentes);
- overrides diarios.

### Tareas

- duración productiva;
- ventana;
- margen específico de participante antes/después (`participantMarginBeforeMinutes`, `participantMarginAfterMinutes`), con herencia explícita y `0` representable;
- espacio fijo o alternativas;
- dependencias;
- requisitos de recursos;
- simultaneidad/capacidad cuando proceda;
- setup/familia;
- pertenencia explícita a una operación conjunta, anclada, sincronizada o técnica;
- rol operativo tipado cuando sea necesario para la construcción;
- ocupaciones derivadas separadas de la duración productiva.

### Platós y espacios

- jerarquía;
- disponibilidad;
- capacidad/concurrencia;
- continuidad;
- comidas;
- recursos/requisitos;
- setups y preparación;
- límites de cambios cuando proceda;
- coordinación;
- designación estructurada del flujo principal cuando exista.

### Recursos

- disponibilidad;
- capacidad;
- asignaciones;
- alternativas/compatibilidades;
- transición entre ubicaciones;
- comida;
- política de presencia (`OFF | PREFERRED | REQUIRED`);
- componentes/bundles cuando sean operativos.

### Unidades itinerantes

- identidad;
- miembros/recursos físicos;
- disponibilidad;
- comida;
- operaciones permitidas;
- relaciones con localizaciones;
- transiciones cuando proceda.

### Transporte

- identidad de llegada/salida por relaciones estructuradas;
- tamaño objetivo de grupo;
- tamaño máximo de grupo;
- separación mínima entre inicios;
- capacidad del vehículo cuando sea distinta del máximo de grupo;
- peso/severidad de agrupación;
- espacio/localización operativa.

### Comidas y pausas

- ámbito: participante, recurso, espacio, zona/unidad, equipo itinerante u otro soportado;
- ventana;
- duración;
- ocupaciones afectadas;
- severidad/modo;
- estado fijo o flexible;
- identidad exacta de la obligación.

### Bloques, setups y coordinación

- continuidad;
- política de número de bloques (`AUTO_MIN_FEASIBLE` por defecto o `FIXED_COUNT(n)` cuando Producción fije exactamente un número);
- tamaño mínimo cuando exista;
- familia de setup;
- orden explícito o automático;
- reentrada;
- preparación entre familias;
- operaciones ancladas;
- operaciones conjuntas;
- rondas sincronizadas;
- cadenas técnicas;
- tolerancias y elegibilidad.

### Optimización

- objetivos y pesos;
- compactación;
- permanencia;
- concentración de recursos;
- prioridad del flujo principal;
- agrupación;
- near-hard sólo cuando su contrato no relaje una regla hard.

### Búsqueda

- política de búsqueda;
- Best-K cuando proceda;
- ramas/expansiones;
- backtracks;
- patrones;
- profundidad/anchura cuando formen parte del contrato activo;
- tiempo y memoria contractual;
- tiempo máximo por `ScopeProposal`/paso Assisted, configurable desde UI por Producción autorizada;
- cualquier límite que pueda producir `BUDGET_EXHAUSTED` o alterar la exploración determinista.

#### Tiempo máximo por propuesta Assisted

La configuración debe permitir un default general reutilizable, un override del día y un `RUN_OVERRIDE` opcional para cada petición concreta. Así Producción puede conceder, por ejemplo, más tiempo a un scope difícil sin modificar permanentemente la jornada.

La UI mostrará una abstracción humana —por ejemplo segundos/minutos o presets equivalentes— y deberá explicar que aumentar el tiempo aumenta el esfuerzo permitido, no relaja ninguna regla hard.

Para preservar la reproducibilidad:

1. el orden de exploración, scoring y validación sigue siendo determinista;
2. la ejecución registra tanto el límite temporal solicitado como el presupuesto lógico determinista realmente resuelto (ramas, backtracks, patrones u otros contadores contractuales);
3. un watchdog de tiempo es un límite operativo externo, no una heurística que permita seleccionar arbitrariamente un candidato distinto;
4. si el watchdog vence antes de alcanzar un terminal válido, no se publica una propuesta parcial por ese solo motivo;
5. el resultado debe distinguir de forma inequívoca `TIME_LIMIT_REACHED`, `BUDGET_EXHAUSTED`, `INFEASIBLE` y `NO_PROPOSAL` por otra causa;
6. una ejecución que complete propuesta debe ser reproducible mediante su estado, configuración efectiva y presupuesto lógico registrado.

Un límite temporal agotado nunca demuestra inviabilidad. La UI debe ofrecer aumentar el tiempo y reintentar conservando las mismas reglas del día.

## 20.13 Regla A2 → producto genérico

Todo hecho A2 específico debe entrar al producto mediante una capacidad genérica de esta arquitectura.

Ejemplos normativos:

- `EVA disponible desde 16:00` → disponibilidad diaria del recurso;
- `transición de participante = 5 min` → margen de transición efectivo;
- `IN target=3, maximum=3, minGap=30` → política de transporte;
- `Sodexo 40 min` → comida individual de participante;
- comidas de plató/equipo/coach → obligaciones de comida por ámbito;
- `requiresBand` → atributo de usuario proyectado a requisito de recurso genérico;
- Reality A/B/C → unidades itinerantes con miembros/recursos y disponibilidad;
- Estudio 7 → espacio seleccionado como flujo principal mediante identidad estructurada;
- Sillón/Estrellas → familias/políticas de setup, con número de bloques `AUTO_MIN_FEASIBLE` salvo que Producción configure `FIXED_COUNT(n)`;
- Totales sincronizados → coordinación/rondas por IDs explícitos;
- operaciones de Reality → operaciones ancladas/conjuntas/cadenas según su contrato real.

El motor nunca preguntará “¿es A2?” ni utilizará nombres o IDs A2 para activar estas reglas.

## 20.14 Registro permanente de configurabilidad

El repositorio mantendrá un registro machine-readable y su vista documental derivada.

Cada capability debe registrar al menos:

- `capabilityId`;
- nombre humano;
- propietario;
- unidad;
- severidad soportada;
- niveles admitidos, incluido `RUN_OVERRIDE` cuando sea un parámetro exclusivamente de ejecución;
- fuente general;
- persistencia diaria;
- override de instancia;
- UI general;
- UI del día;
- proyección a `EngineInput`;
- preflight;
- búsqueda;
- validador;
- Evidence;
- fingerprint;
- permisos/RLS;
- tests;
- estado.

Estados permitidos para auditoría de implementación:

```text
PRODUCTIVE
PARTIAL
MISSING
BLOCKED
NOT_APPLICABLE
```

`PRODUCTIVE` exige recorrido end-to-end demostrado. Tener columna DB o control UI no basta.

## 20.15 Gate de implementación de una nueva capability

Una capability no se considera terminada hasta demostrar, cuando aplique:

```text
UI general
 -> persistencia general
 -> snapshot del día
 -> override diario/instancia
 -> override de ejecución cuando aplique
 -> provenance + revisión
 -> EngineInput
 -> preflight
 -> adaptación
 -> búsqueda/construcción
 -> validación
 -> Evidence/fingerprint
 -> round-trip/replay
 -> permisos/RLS
 -> tests
```

Si una fase aún no existe, el registro debe permanecer `PARTIAL` o `MISSING` y la UI no debe fingir soporte productivo.

## 20.16 Compatibilidad y migración

Durante la migración desde campos legacy:

- se normaliza a un único contrato efectivo;
- los aliases no se convierten en nuevas autoridades;
- no se elige una relación ambigua por ser la primera;
- un fallback histórico debe estar documentado y dejar warning;
- ningún benchmark puede actuar como fuente de configuración productiva;
- el refresh general→día sólo se habilita para una categoría cuando existe comparación y escritura lossless;
- las categorías no soportadas se muestran explícitamente y no se actualizan parcialmente.

## 20.17 Seguridad y permisos

La configuración general es administrada por roles autorizados. Producción autorizada puede modificar el día dentro de sus permisos. Los roles operativos visualizan la configuración necesaria para ejecutar su trabajo pero no reciben controles de edición que no les correspondan.

Las entidades persistidas deberán aplicar el modelo de acceso definido por producto y Supabase. Ninguna tabla expuesta deberá quedar abierta por grants amplios sin una decisión explícita y Evidence de seguridad.

Cambiar RLS/grants requiere comprobar antes los accesos server-side, client-side y Realtime afectados; no se activará RLS a ciegas si eso rompe el producto.

## 20.18 Regla de cierre

> Configuración general = cómo suele funcionar la producción y evita reconfigurar cada jornada.  
> Snapshot del día = qué heredó automáticamente esta jornada.  
> Override = qué es distinto hoy o en esta entidad.  
> RUN_OVERRIDE = cuánto esfuerzo se concede a una ejecución concreta sin cambiar las reglas del día.  
> Estado protegido = qué ha decidido o ejecutado ya la producción.  
> EngineInput = representación exacta de esa realidad efectiva.  
> Planner Next = consumidor, nunca inventor, de la configuración.

La experiencia de usuario debe permitir realizar un esfuerzo inicial de configuración reutilizable y, en jornadas normales, trabajar por excepción: revisar readiness, modificar sólo lo distinto y planificar. Debe permitir configurar una producción real sin conocer el benchmark, los IDs internos ni la arquitectura del solver.

