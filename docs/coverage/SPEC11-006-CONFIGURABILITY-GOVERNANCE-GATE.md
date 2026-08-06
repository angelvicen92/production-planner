# SPEC11-006 — Gobernanza de configurabilidad y gate permanente de desarrollo

**Estado:** contrato operativo de gobernanza  
**Clasificación:** Fast Merge documental y administrativa  
**Fuente normativa:** SPEC-11 y Protocolo Maestro de Continuidad de OptiPlan  
**Ámbito:** diseño → PR → validación → merge → registro de capacidades

---

## 1. Objetivo

Evitar que OptiPlan dependa de que una persona recuerde todos los casos configurables y evitar que nuevas reglas operativas aparezcan como:

- constantes de código;
- nombres especiales;
- IDs conocidos;
- campos exclusivos de frontend;
- campos exclusivos de motor;
- JSON opaco;
- defaults no trazados;
- fallbacks silenciosos;
- condiciones sin snapshot diario;
- preferencias convertidas en restricciones hard;
- capacidades demostradas en fixtures pero no conectadas a producto.

Desde esta SPEC, todo cambio deberá declarar explícitamente si introduce, consume, transforma o ignora configuración operativa.

---

## 2. Principio rector

> Toda decisión de dominio debe proceder de una fuente oficial o de configuración efectiva.  
> Toda configuración efectiva debe ser reproducible.  
> Todo valor que afecte viabilidad, calidad, ocupación o publicación debe tener propietario, origen, versión, validación y Evidence.

Una implementación no se considera completa porque compile o porque el campo exista en DB.

Debe recorrer todas las capas materiales.

---

## 3. Clasificación de cambios

Cada PR elegirá una categoría.

### 3.1 CONFIG_NEUTRAL

No introduce ni modifica semántica operativa configurable.

Ejemplos:

- corrección visual sin efecto en dominio;
- documentación;
- refactor puro demostrado por regresión;
- mejora de accesibilidad;
- optimización interna que conserva exactamente resultados y fingerprints.

La elección exige justificación.

### 3.2 CONFIG_AWARE

Consume o proyecta configuración existente sin crear una capacidad nueva.

Ejemplos:

- llevar un snapshot existente a EngineInput;
- mostrar origen en UI;
- añadir Evidence de un valor efectivo;
- eliminar una lectura global durante planificación.

### 3.3 CONFIG_DEFINING

Crea o cambia una capacidad operativa configurable.

Ejemplos:

- hold posterior;
- coordinación entre espacios;
- nueva política de setup;
- nueva severidad;
- nueva tolerancia;
- nuevo objetivo de calidad;
- nueva ocupación derivada.

Requiere matriz completa y, por defecto, DB Safe Merge.

### 3.4 CONFIG_DEBT_REDUCTION

Elimina hardcodes, inferencias nominales, aliases, defaults duplicados o pérdidas entre capas.

Debe demostrar que la semántica efectiva anterior se conserva o que el cambio normativo está documentado.

---

## 4. Capability ID obligatorio

Todo cambio `CONFIG_AWARE`, `CONFIG_DEFINING` o `CONFIG_DEBT_REDUCTION` declarará uno o más IDs estables.

Formato recomendado:

```text
<OWNER>_<CONCEPT>_<BEHAVIOR>
```

Ejemplos:

```text
TASK_TEMPORAL_HOLD_AFTER
SPACE_START_ALIGNMENT_PREFERENCE
PLAN_TASK_TEMPLATE_SNAPSHOT
RESOURCE_EFFECTIVE_AVAILABILITY
SPACE_SETUP_FAMILY_ORDER
```

No usar:

- nombres del programa;
- nombres de concursantes;
- números de plató;
- nombres de benchmarks;
- IDs de fixtures.

---

## 5. Matriz obligatoria de capacidad

Cada capacidad deberá registrar:

| Campo | Contenido |
|---|---|
| `capabilityId` | Identidad estable. |
| Propietario | Plan, tarea, plantilla, espacio, zona, participante, recurso, unidad u operación. |
| Semántica | Definición operativa inequívoca. |
| Unidad | Minutos, cantidad, enum, booleano, relación, lista o composición. |
| Severidad | REQUIRED, PREFERRED, OFF o N/A. |
| Configuración general | Tabla, campo o relación autoritativa. |
| Snapshot diario | Copia efectiva y momento de materialización. |
| Override | Nivel, precedencia y restauración. |
| Ausencia | Semántica cuando el campo no existe. |
| Legacy | Tratamiento de días anteriores. |
| API | Lectura, mutación y errores tipados. |
| UI | Editor, valor efectivo, origen, diff y permisos. |
| EngineInput | Campo efectivo y reversible. |
| Preflight | Contradicciones y pérdidas rechazadas. |
| Dominio de motor | Placement, scoring, búsqueda o N/A. |
| Future Feasibility | Impacto o N/A. |
| Validación | Autoridad canónica. |
| Publicación | Entidad o resumen publicado. |
| Fingerprint | Datos semánticos incluidos. |
| Evidence | Valor, impacto y cumplimiento. |
| Replanificación | Efecto sobre pending, interrupted, in_progress, done y locks. |
| Tests | Positivos, negativos, determinismo, invariancia e inmutabilidad. |
| Estado | ABSENT, PARTIAL, COMPLETE, UNSAFE o WIP. |

Una capacidad no puede marcarse `COMPLETE` si falta una capa material.

---

## 6. Taxonomía de constantes

No toda constante es un hardcode de dominio.

Cada constante nueva deberá clasificarse.

### 6.1 Invariante técnico universal

Puede permanecer en código.

Ejemplos:

- 60 segundos por minuto;
- versión literal de un contrato discriminado;
- delimitador interno de fingerprint;
- algoritmo SHA-256;
- orden de campos de una serialización versionada.

Debe ser independiente de producción, programa y preferencias.

### 6.2 Regla de dominio universal oficial

Puede permanecer tipada si una fuente oficial declara que nunca es configurable.

Debe citarse la fuente.

Si la fuente permite excepciones, deja de ser universal.

### 6.3 Default operativo

Debe persistirse y trazarse.

Ejemplos:

- 30 minutos de duración;
- 75 minutos de comida;
- 5 minutos de preparación;
- tolerancia;
- máximo de cambios;
- capacidad;
- hora de jornada.

No basta con coincidir con un default de DB.

El resultado debe saber si el valor fue:

- heredado;
- copiado al snapshot;
- sobrescrito;
- reconstruido como legacy;
- fallback de emergencia.

### 6.4 Parámetro algorítmico

Puede permanecer interno sólo cuando no cambia semántica, calidad observada o tradeoffs.

Si afecta:

- qué solución gana;
- cuánto explora el motor;
- cuándo agota presupuesto;
- qué ramas sobreviven;
- qué riesgo acepta;

entonces debe estar configurado, versionado o justificado por Evidence y benchmark.

### 6.5 Fixture o test

IDs, nombres y minutos concretos son válidos dentro de fixtures.

No pueden filtrarse a código productivo.

### 6.6 Texto de presentación

Puede ser literal visible si no decide dominio.

Nunca se utilizará el texto traducido para inferir identidad o comportamiento.

---

## 7. Señales automáticas de riesgo

Un PR requiere revisión reforzada si añade:

- comparaciones de `name`, `label`, `title`, `abbrev` o texto visible dentro de lógica operativa;
- números de IDs en código productivo;
- duraciones, tolerancias, capacidades o pesos literales;
- acceso a configuración global durante planificación de un día existente;
- nuevas claves dentro de `rulesJson` o JSON sin esquema;
- `catch` que devuelve `{}`, `[]`, `null` o default para información potencialmente hard;
- booleanos que mezclan varias semánticas;
- campos de motor sin persistencia ni UI;
- campos de UI sin API o DB;
- un `PREFERRED` validado como hard;
- un `REQUIRED` puntuado sólo como soft;
- tareas sintéticas sin identidad de origen;
- actualización retroactiva de snapshots;
- un resultado parcial publicado;
- nombres de escenarios dentro de producción.

Estas señales no prueban por sí solas un error, pero obligan a justificar y probar.

---

## 8. Hard stops

No se podrá marcar un PR como listo cuando exista cualquiera de estas condiciones:

1. Regla operativa decidida por nombre o ID conocido.
2. Valor que afecta viabilidad sin configuración efectiva.
3. Configuración general releída para reinterpretar un día existente.
4. Error de carga hard convertido en ausencia neutral.
5. Contrato PREFERRED/REQUIRED degradado silenciosamente.
6. Nueva semántica almacenada sólo en JSON opaco.
7. Snapshot parcial que deja el plan en estado ambiguo.
8. EngineInput pierde información que el motor afirma soportar.
9. Preflight acepta una representación parcial.
10. Validador y búsqueda usan reglas hard distintas.
11. Fingerprint omite un dato semántico efectivo.
12. Evidence no corresponde al resultado publicado.
13. Tareas `done` o `in_progress` modificadas.
14. Locks ignorados o reinterpretados.
15. Capacidad WIP activada productivamente.

---

## 9. Gate por capa

### 9.1 Dominio

- fuente oficial identificada;
- contrato tipado;
- propietario;
- unidad;
- severidad;
- ausencia;
- compatibilidad legacy.

### 9.2 Persistencia

- general;
- snapshot;
- override;
- constraints;
- RLS;
- migración idempotente;
- independencia entre catálogo y día.

### 9.3 API

- schemas compartidos;
- respuestas validadas;
- errores tipados;
- escrituras atómicas;
- autorización.

### 9.4 UI

- valor heredado;
- valor efectivo;
- origen;
- override;
- restauración;
- diff;
- impacto;
- accesibilidad.

### 9.5 EngineInput

- valor efectivo;
- identidad reversible;
- orden canónico;
- sin nombres;
- sin consultas tardías a globales;
- input inmutable.

### 9.6 Preflight

- referencias;
- duplicados;
- versiones;
- contradicciones;
- representabilidad completa;
- reason codes.

### 9.7 Motor

- hard filter o scoring según severidad;
- presupuesto oficial;
- backtracking;
- Future Feasibility;
- no fallback oculto.

### 9.8 Validación

- autoridad canónica;
- ausencia de miembros extra u omitidos;
- ocupaciones derivadas;
- publicación completa.

### 9.9 Evidence

- configuración efectiva;
- origen;
- impacto;
- cumplimiento;
- fingerprints;
- determinismo;
- invariancia;
- input inmutable.

---

## 10. Estados permitidos en un PR

### COMPLETE

Todas las capas materiales están implementadas y validadas.

### PARTIAL_WIP

El PR puede existir como checkpoint, pero:

- no se activa productivamente;
- mantiene blocker explícito;
- no elimina reason codes antes de tiempo;
- no publica una capacidad falsa;
- declara exactamente qué falta.

### DOCUMENTED_ONLY

Contrato o diseño sin implementación.

No debe presentarse como capacidad disponible.

### NOT_APPLICABLE

Sólo para cambios realmente neutrales.

Requiere una frase de justificación.

### UNSAFE

No es mergeable.

---

## 11. Clasificación Fast Merge y DB Safe Merge

### Fast Merge

Aplicable a:

- documentación;
- UI sin nueva semántica;
- accesibilidad;
- texto;
- refactor probado sin cambios de resultado;
- plantilla de PR;
- registro de capacidades.

No puede utilizarse para evitar revisión de un valor operativo.

### DB Safe Merge

Obligatorio cuando cambia:

- DB;
- migración;
- RLS;
- snapshot;
- API contractual;
- EngineInput;
- adaptador;
- motor;
- validación;
- fingerprint;
- publicación;
- Evidence;
- política de búsqueda;
- ORC.

---

## 12. Actualización del registro

Cada capacidad tendrá una fila en el registro de configurabilidad.

La fila se actualizará cuando:

- aparezca un nuevo contrato;
- se conecte una capa;
- desaparezca un blocker;
- cambie el estado;
- se detecte una pérdida;
- se añada Evidence;
- se active en producto.

No se borrará deuda histórica sin Evidence.

---

## 13. Regla para nuevos descubrimientos operativos

Cuando aparezca una nueva casuística real:

1. describir el hecho operativo;
2. distinguir si es tarea, hold, setup, transición, coordinación, recurso, disponibilidad, preferencia u otra entidad;
3. comprobar si un contrato existente la representa sin pérdida;
4. reutilizarlo sólo si la semántica coincide;
5. si no coincide, crear un contrato nuevo;
6. completar la matriz;
7. introducir primero persistencia y configuración efectiva;
8. después EngineInput/preflight;
9. después motor/validación;
10. finalmente publicación y activación.

No se elige el contrato más fácil de programar.

Se elige el que representa la realidad.

---

## 14. Reglas para defaults

Todo default operativo deberá declarar:

- dónde se define;
- qué entidad lo hereda;
- cuándo se copia;
- cómo se sobrescribe;
- cómo se restaura;
- qué significa ausencia;
- cómo se migra legacy;
- cómo aparece en Evidence.

Un literal repetido en DB y código sigue siendo duplicación peligrosa.

Debe existir una autoridad única.

---

## 15. Reglas para compatibilidad

Compatibilidad no significa inventar datos.

Opciones permitidas:

- ausencia equivale a OFF;
- backfill marcado `legacy_backfill`;
- ruta `UNSUPPORTED` con reason code;
- adaptador histórico separado;
- feature flag explícita y reversible.

Opciones prohibidas:

- adivinar por nombre;
- rellenar con un valor que parezca razonable;
- usar un benchmark como default productivo;
- ignorar silenciosamente una política activa;
- cambiar días históricos al leerlos.

---

## 16. Reglas para fallbacks

Un fallback sólo puede existir cuando:

- está autorizado por la arquitectura;
- se activa después de un fracaso explícito;
- no actúa como seed indebida;
- registra razón;
- conserva tareas protegidas;
- no se confunde con el motor solicitado;
- no oculta una capacidad no soportada.

Un fallback técnico de datos no puede eliminar restricciones hard.

---

## 17. Validación proporcional y merge gate final

Durante checkpoints:

- tests focales;
- TypeScript;
- diff check;
- invariancia e inmutabilidad aplicables.

En el head candidato:

- suite completa;
- build;
- migraciones;
- RLS;
- benchmarks;
- Evidence reproducible;
- Focal A2 protegido;
- checks alojados;
- revisión de diff completo;
- README por ID;
- estado limpio.

No se repite el merge gate completo en cada checkpoint salvo riesgo que lo exija.

---

## 18. Checklist mínimo de revisión

Todo reviewer deberá poder responder:

1. ¿Qué hecho operativo representa?
2. ¿Dónde está definido oficialmente?
3. ¿Es configurable o universal?
4. ¿Quién es el propietario?
5. ¿Cuál es la unidad?
6. ¿Cuál es la severidad?
7. ¿Dónde vive el default?
8. ¿Dónde vive el snapshot?
9. ¿Dónde vive el override?
10. ¿Qué significa ausencia?
11. ¿Qué ocurre con legacy?
12. ¿Cómo llega a EngineInput?
13. ¿Qué rechaza preflight?
14. ¿Cómo actúa el motor?
15. ¿Qué valida la autoridad final?
16. ¿Qué cambia el fingerprint?
17. ¿Qué publica Evidence?
18. ¿Qué ocurre en replanificación?
19. ¿Qué tests lo demuestran?
20. ¿Qué sigue sin estar soportado?

Si una pregunta material no tiene respuesta, la capacidad permanece parcial.

---

## 19. Automatización futura

Podrá añadirse un checker estático que detecte:

- literales temporales nuevos en rutas de dominio;
- IDs numéricos en producción;
- comparaciones nominales;
- nuevas claves de JSON opaco;
- campos EngineInput no registrados;
- capabilities sin fila;
- PRs sin clasificación;
- documentación README sin ID ordenado;
- migraciones sin continuidad;
- ausencia de tests focales declarados.

El checker será señal de revisión, no sustituto de análisis semántico.

No bloqueará por falsos positivos sin una vía de justificación versionada.

---

## 20. Ejemplos

### Incorrecto

```ts
if (space.name === "Totales 1") {
  preparationMinutes = 5;
}
```

### Correcto

```ts
preparationMinutes = effectiveRoundPolicy.preparationMinutesBetweenRounds;
```

### Incorrecto

```ts
const duration = task.duration ?? 30;
```

sin origen ni Evidence.

### Correcto

```ts
const duration = resolveEffectiveDuration({
  instanceOverride,
  planTemplateSnapshot,
});
```

### Incorrecto

```ts
try {
  return await loadRequiredAssignments();
} catch {
  return {};
}
```

### Correcto

Error tipado que detiene adaptación o planificación.

### Incorrecto

```ts
if (policy.severity === "REQUIRED") {
  score += 100000;
}
```

### Correcto

REQUIRED participa en hard validity; PREFERRED participa en scoring.

---

## 21. Criterios de aceptación

SPEC11-006 queda aceptada cuando:

- todos los PRs pueden declarar su relación con configuración;
- existe capability ID estable;
- la matriz mínima es obligatoria;
- constantes quedan clasificadas;
- hard stops son explícitos;
- Fast Merge y DB Safe Merge no se confunden;
- WIP no se presenta como producto;
- defaults y fallbacks dejan origen;
- nuevos descubrimientos siguen un proceso reproducible;
- la plantilla de PR incorpora el gate;
- la gobernanza no depende de memoria humana.

---

## 22. Regla final

> Un caso nuevo no crea una excepción.  
> Crea o reutiliza un contrato.  
> El contrato crea configuración efectiva.  
> La configuración efectiva llega completa al motor.  
> La validación y la Evidence demuestran que se respetó.