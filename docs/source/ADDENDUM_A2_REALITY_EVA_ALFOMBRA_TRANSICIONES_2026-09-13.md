# OPTIPLAN — ADDENDUM OFICIAL A2

## Reality, EVA, Alfombra Roja y márgenes de transición de concursante

**Versión:** 1.0  
**Fecha:** 13 de septiembre de 2026  
**Estado:** corrección oficial derivada de aclaración operativa expresa del responsable de producción  
**Ámbito:** DÍA DE PRUEBA A2, unidades Reality, recurso Presentadora/EVA, Alfombra Roja, continuidad, márgenes de transición de concursante, benchmark y Evidence

---

## 1. Objeto y autoridad

Este addendum corrige la interpretación del bloque Reality/Alfombra de `ENSAYO_A2_LV.pdf` y hace explícita la regla general de margen entre actividades consecutivas de un concursante.

Conforme al orden de autoridad del Documento Maestro de Interpretación A2, esta aclaración operativa expresa prevalece sobre lecturas anteriores incompatibles de los PDFs, del Documento Maestro A2, del Cuadro de tareas, de la referencia A2 de SPEC-08, de la semántica anterior de márgenes de SPEC-07 y de cualquier fixture, benchmark o Evidence derivado de esas lecturas.

La producción tiene que salir.

---

## 2. Topología Reality A2 corregida

En A2 existen tres composiciones Reality:

```text
Unidad A = Cámara 3 + Sonido 1
Unidad B = Cámara 4 + Sonido 2
Unidad C = Cámara 3 + Cámara 4 + Sonido 1
```

A y B pueden trabajar simultáneamente cuando sus miembros estén libres. C es una recomposición temporal de recursos de A y B y entra en conflicto con ambas por los recursos físicos compartidos. `unitId` no duplica capacidad.

La continuidad exigida a C se aplica al bloque operativo configurado de la composición C; no obliga a concentrar todo el historial diario de Cámara 3, Cámara 4 o Sonido 1.

---

## 3. Presentadora / EVA

EVA es un recurso explícito. En A2 su disponibilidad efectiva comienza a las **16:00**.

Todas las operaciones A2 de Unidad C requieren, además de los miembros de C, el recurso EVA.

La referencia humana muestra este bloque:

| Fase | Participante | Actividad | Referencia humana |
|---|---|---|---|
| Reality C + EVA | C06 · Lina Isabel García-Salcedo | Reality Hall | 16:00–16:30 |
| Reality C + EVA | C12 · Marta Fornali | Reality Control | 16:30–17:00 |
| Reality C + EVA | C11 · Linet Varela | Reality Buggy | 17:00–17:30 |
| Reality C + EVA + Alfombra | C04 · Carmen María Saborido | Alfombra Roja con EVA | 17:30–17:45 |
| Reality C + EVA + Alfombra | C13 · Eva Martín Fernández | Alfombra Roja con EVA | 17:45–18:00 |

Las horas sirven únicamente para cotejar la referencia humana; no son seed, lock ni horario autoritativo del planificador. Sí son autoridades del problema la disponibilidad explícita de EVA desde las 16:00, las asignaciones efectivas y las políticas de continuidad.

Para A2:

```text
presenceConcentrationPolicy(EVA) = REQUIRED
continuity(Unit C block) = REQUIRED
operationalBlockCount(EVA) = 1
operationalBlockCount(Unit C block) = 1
internalGapMinutes(EVA) = 0
internalGapMinutes(Unit C block) = 0
```

El cambio de la fase Reality C a Alfombra pertenece al mismo bloque coordinado. La frontera no introduce un hueco adicional de recurso:

```text
internalTransition = INCLUDED
resourceGapAtPhaseBoundary = 0
```

---

## 4. Alfombra Roja A2

C04 y C13 realizan Alfombra Roja utilizando simultáneamente:

- Alfombra Roja;
- Unidad Reality C;
- EVA;
- el concursante correspondiente;
- los demás recursos explícitos de la instancia.

Después de finalizar la última Alfombra con EVA, Alfombra Roja continúa sin huecos con las actividades sin EVA:

- C06 + C10, Alfombra Roja conjunta, 10 minutos;
- C16, Alfombra Roja individual, 10 minutos.

Estas tareas no requieren EVA.

Para el bloque A2:

```text
continuity(Alfombra Roja) = REQUIRED
```

La plantilla debe representar el orden de fases mediante relaciones estructuradas y configurables, nunca mediante nombres, IDs conocidos u horas hardcodeadas.

El PDF indica además que al terminar la fase con EVA el equipo Reality se posiciona en Totales Post mientras Alfombra continúa con tareas sin EVA. Si ese movimiento o trabajo técnico necesita identidad, duración o recursos propios, deberá modelarse explícitamente; no se deduce como una tarea autónoma sólo por aparecer en una cabecera.

La anotación `Beauties Alfombra vacía` no se convierte automáticamente en una nueva obligación canónica mediante este addendum. Si producción desea planificarla como trabajo técnico, deberá configurarse como tarea explícita y auditable.

---

## 5. Corrección de la antigua “operación técnica sin concursante”

La interpretación anterior creó tres obligaciones independientes:

1. `Reality con EVA` — 20 minutos;
2. `Desmontaje y traslado` — 5 minutos;
3. `Totales Post técnico` — 5 minutos.

Esa interpretación queda retirada.

El bloque naranja `Reality con EVA / 20' secuencia / 5' desmontaje y traslado / 5' Totales Post` describe la configuración/receta operativa de la sección Reality con EVA y sus recursos, no una cadena adicional de 30 minutos que deba planificarse además de las actividades de los concursantes.

Tratarla como una tarea independiente produce en la referencia humana un solapamiento imposible desde las 16:00 con C06 utilizando los mismos recursos de Reality C y EVA.

Por tanto:

- esas tres etiquetas no son tres obligaciones canónicas adicionales;
- no se publican como tareas sin concursante;
- no se suman de nuevo a la duración de las operaciones de concursante;
- cualquier desmontaje, traslado o Totales Post que sea realmente una operación técnica independiente deberá venir configurado con identidad, duración, recursos y dependencias propias.

La corrección/fixture `REALITY_EVA_TECHNICAL_CHAIN_HAS_NO_PARTICIPANT` queda conceptualmente obsoleta.

---

## 6. Universo canónico A2

El cuadro A2 mantiene **266 tareas ligadas a concursantes**.

Las tres falsas operaciones anteriores dejan de contarse. Con la información oficial actualmente aprobada:

```text
participantLinkedObligations = 266
additionalStandaloneTechnicalObligationsFromRealityEvaHeader = 0
canonicalObligationCount = 266
```

La cifra anterior de 269 queda retirada. Si se aprueba posteriormente una operación técnica real sin concursante, se añadirá sólo mediante una entidad explícita y el conteo volverá a versionarse.

---

## 7. Margen REQUIRED entre actividades consecutivas de un concursante

Todo concursante debe conservar por defecto un margen mínimo de **5 minutos** entre el final de una actividad independiente y el inicio de su siguiente actividad, aunque ambas se realicen en el mismo espacio o plató.

```text
defaultParticipantTransitionMinutes = 5
severity = REQUIRED
```

La regla representa colchón frente a pequeños retrasos, movimiento entre espacios cuando exista, preparación inmediata y robustez operativa.

Cada actividad debe poder declarar, cuando proceda:

```text
participantMarginBeforeMinutes?: number
participantMarginAfterMinutes?: number
```

Los valores pueden ser `0`, `5`, `30` u otro valor no negativo representable por la rejilla temporal vigente. Un `0` explícito no equivale a ausencia.

Para una frontera `A → B`:

1. sin overrides en `A.after` ni `B.before`, se aplican 5 minutos;
2. si existe uno solo, ese valor sustituye el default para esa frontera;
3. si existen ambos, se respeta el mayor;
4. los valores no se suman.

Formalmente:

```text
explicit = defined(A.after) ∪ defined(B.before)
participantGap(A,B) = max(explicit) si explicit no está vacío
participantGap(A,B) = defaultParticipantTransitionMinutes en otro caso

inicio(B) >= fin(A) + participantGap(A,B)
```

Las fases internas de una única operación compuesta pueden declarar:

```text
internalTransition = INCLUDED
```

En ese caso no se inserta el margen general entre las fases internas. El margen vuelve a aplicarse antes de la primera fase, después de la última y frente a cualquier obligación ajena a la operación.

El margen del concursante no sustituye márgenes de recursos, rutas técnicas ni preparaciones explícitas. Las restricciones de entidades distintas se validan simultáneamente y no se suman mecánicamente. Por ejemplo, el Vocal Coach puede requerir 30 minutos Caracola→Estudio 7 mientras el concursante conserva su propio margen de 5 minutos; la transición del coach no se convierte automáticamente en 35.

---

## 8. Proyección end-to-end

La capacidad debe existir coherentemente en:

```text
configuración general
    ↓ snapshot del día
    ↓ override de plantilla/instancia
    ↓ EngineInput
    ↓ preflight
    ↓ Planner Next / ORC
    ↓ validador canónico
    ↓ publicación
    ↓ Evidence
```

No es válida una implementación en la que la UI muestre 5 minutos pero el motor utilice 0, ni una implementación en la que el motor aplique un valor que no pueda reconstruirse desde la configuración efectiva.

---

## 9. Criterios de aceptación A2

La revisión debe demostrar simultáneamente:

- EVA no se programa antes de las 16:00;
- C06, C12, C11, C04 y C13 consumen explícitamente Unidad C + EVA en sus operaciones correspondientes;
- Unidad C forma un solo bloque con cero huecos internos;
- EVA forma un solo bloque con cero huecos internos;
- C04 y C13 ocupan además Alfombra Roja;
- Alfombra continúa sin huecos con C06+C10 y C16 ya sin EVA;
- A y B conservan identidad propia y quedan incompatibles con C sólo por recursos compartidos;
- no existen las tres antiguas tareas técnicas ficticias derivadas de la cabecera Reality con EVA;
- el universo canónico queda reconciliado en 266 obligaciones salvo nueva operación técnica explícitamente aprobada;
- toda pareja de actividades independientes consecutivas de un concursante respeta 5 minutos por defecto;
- un override 0 se respeta como 0 y un override 30 se respeta como 30;
- una operación compuesta con `internalTransition = INCLUDED` no recibe buffers internos espurios;
- la ejecución sigue siendo determinista e invariante al orden de entrada.

---

## 10. Impacto en Evidence y desarrollo actual

Toda Evidence Full A2 generada con cualquiera de estas condiciones queda obsoleta para el contrato corregido:

- `canonicalObligationCount = 269` por las tres operaciones técnicas falsas;
- `participantTransitionMinutes = 0` como configuración A2 general;
- Unidad C sin requisito explícito de EVA;
- EVA sin disponibilidad desde las 16:00;
- ausencia de continuidad REQUIRED para EVA, Unidad C o Alfombra Roja.

Antes de continuar optimizando búsqueda, ordering, matching o presupuesto sobre Full A2 deberá regenerarse el problema canónico y obtenerse nueva Evidence causal sobre el contrato corregido.
