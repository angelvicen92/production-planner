# SPEC11-005 — Coordinación temporal PREFERRED entre espacios

**Estado:** contrato productivo documental  
**Clasificación futura de implementación:** DB Safe Merge  
**Fuente normativa:** SPEC-11 — Configuración Operativa Efectiva, Ocupaciones Derivadas y Coordinación entre Espacios  
**Depende de:** snapshot efectivo de configuración del día, identidad estructurada de tareas y espacios, configuración de severidad  
**No sustituye:** `RoundSynchronizationPolicy` REQUIRED de SPEC10-021  
**Ámbito:** configuración general → snapshot diario → override → EngineInput → Planner Next → scoring → validación → publicación → Evidence

---

## 1. Objetivo único

Definir una capacidad configurable para que dos espacios independientes intenten alinear el comienzo de sus tareas elegibles sin:

- fusionar ambos espacios;
- compartir capacidad;
- compartir recursos de forma implícita;
- convertir la preferencia en restricción hard;
- fijar parejas por orden de entrada;
- identificar tareas o espacios por nombres;
- alterar el contrato REQUIRED de rondas sincronizadas;
- reparar un planning después de construirlo.

La primera capacidad genérica será:

```text
ALIGN_STARTS + PREFERRED + DYNAMIC_ORDINAL
```

La producción debe poder completarse aunque la alineación no sea posible.

El incumplimiento será cuantificable, explicable y visible.

---

## 2. Decisión de alcance

SPEC-11 ordena introducir primero la coordinación PREFERRED genérica y conservar separada la sincronización REQUIRED ya modelada para rondas.

Por tanto, este contrato:

- define `PREFERRED` y `OFF` como severidades productivas de esta capacidad;
- no implementa un REQUIRED genérico alternativo;
- no convierte `PREFERRED` en `RoundSynchronizationPolicy`;
- no relaja una ronda REQUIRED para tratarla como preferencia;
- no unifica todavía búsqueda, validadores ni persistencia de ambas capacidades.

Cuando una operación necesite igualdad obligatoria de comienzo mientras ambos carriles tengan trabajo, deberá utilizar un contrato REQUIRED explícito y representable, como el de rondas sincronizadas.

---

## 3. Principios operativos

1. Los espacios siguen siendo entidades independientes.
2. La política se configura mediante IDs estables.
3. La elegibilidad es explícita.
4. El orden real lo decide el planificador.
5. El emparejamiento se deriva del ordinal programado final.
6. La preferencia sólo se puntúa después de comprobar reglas hard.
7. Una desviación nunca invalida por sí sola un plan.
8. La penalización es visible y configurable.
9. Los cambios generales no modifican silenciosamente días existentes.
10. Los overrides diarios o de instancia son explícitos y auditables.
11. Las tareas `done` e `in_progress` permanecen inmutables.
12. Un resultado parcial nunca se publica.
13. No se deduce coordinación por compartir plató, zona, padre, nombre o color.
14. No se reduce una operación conjunta a coordinación PREFERRED.
15. No se reduce una transición, setup, hold o preparación a coordinación temporal.

---

## 4. Vocabulario

### 4.1 Carril

Secuencia cronológica final de tareas elegibles de uno de los espacios de la política.

Un carril no es:

- una cola fijada por input;
- una prioridad hard;
- un espacio nuevo;
- un recurso;
- una familia setup.

### 4.2 Par coordinable

Par formado por las tareas que ocupan el mismo ordinal programado en ambos carriles.

### 4.3 Desviación

Valor absoluto entre los comienzos de las dos tareas del par.

```text
absoluteStartDeviation = abs(startA - startB)
```

### 4.4 Exceso sobre tolerancia

```text
excessDeviation = max(0, absoluteStartDeviation - toleranceMinutes)
```

### 4.5 Ronda residual

Tarea elegible posterior a que el otro carril haya agotado su trabajo elegible.

Las rondas residuales no generan penalización de alineación en V1.

### 4.6 Alineación satisfecha

Un par está alineado cuando:

```text
absoluteStartDeviation <= toleranceMinutes
```

---

## 5. Contrato efectivo V1

El contrato que llega al motor deberá ser equivalente a:

```ts
interface SpaceStartAlignmentPreferenceV1 {
  readonly id: string;
  readonly contractVersion: 1;
  readonly mode: "ALIGN_STARTS";
  readonly severity: "PREFERRED" | "OFF";
  readonly laneSpaceIds: readonly [string, string];
  readonly toleranceMinutes: number;
  readonly pairing: "DYNAMIC_ORDINAL";
  readonly activeWhile: "ALL_LANES_HAVE_ELIGIBLE_WORK";
  readonly eligibility: {
    readonly kind: "EXPLICIT_TASK_SET";
    readonly lanes: readonly [
      {
        readonly spaceId: string;
        readonly taskIds: readonly string[];
      },
      {
        readonly spaceId: string;
        readonly taskIds: readonly string[];
      },
    ];
  };
  readonly penalty: {
    readonly kind: "LINEAR_OUTSIDE_TOLERANCE";
    readonly penaltyPerMinuteOutsideTolerance: number;
  };
}
```

El contrato efectivo utiliza IDs de tareas del día.

Las plantillas o grupos de configuración sólo sirven para resolver previamente esos IDs.

El motor no consulta catálogos globales para descubrir miembros.

---

## 6. Canonicalización de identidad

### 6.1 Identidad de política

La política tendrá un ID estable, independiente de nombres visibles.

### 6.2 Identidad de carriles

`laneSpaceIds` representa dos espacios distintos.

La serialización canónica ordenará los espacios por ID sólo para fingerprint y detección de duplicados.

Ese orden canónico no establece prioridad operativa.

### 6.3 Identidad de tareas

Cada tarea elegible deberá aparecer exactamente una vez dentro de su carril efectivo.

No se permite:

- la misma tarea en ambos carriles;
- la misma tarea repetida;
- una tarea cuyo `spaceId` no coincide con el carril;
- una tarea inexistente;
- una tarea cancelada materializada como obligación;
- una tarea protegida sin intervalo completo cuando sea necesaria para evaluar el resultado.

### 6.4 Nombres

Los nombres de política, espacio, tarea o plantilla son metadata explicativa.

No participan en:

- elegibilidad;
- pairing;
- scoring;
- fingerprint semántico;
- validación hard;
- publicación de identidad.

---

## 7. Elegibilidad de configuración

La configuración general o diaria podrá seleccionar elegibilidad mediante una unión discriminada.

### 7.1 Plantillas del snapshot diario

```ts
interface TemplateSetCoordinationEligibility {
  readonly kind: "PLAN_TEMPLATE_SET";
  readonly lanes: readonly [
    { readonly spaceId: number; readonly planTemplateSnapshotIds: readonly number[] },
    { readonly spaceId: number; readonly planTemplateSnapshotIds: readonly number[] },
  ];
}
```

Esta será la opción principal de producto.

Las referencias pertenecen al snapshot del plan, no al catálogo global mutable.

### 7.2 Tareas explícitas del día

```ts
interface DailyTaskSetCoordinationEligibility {
  readonly kind: "DAILY_TASK_SET";
  readonly lanes: readonly [
    { readonly spaceId: number; readonly dailyTaskIds: readonly number[] },
    { readonly spaceId: number; readonly dailyTaskIds: readonly number[] },
  ];
}
```

Se utilizará para políticas ad hoc o overrides concretos del día.

### 7.3 Grupo estructurado de instancia

Podrá añadirse en una unidad posterior:

```ts
interface CoordinationGroupEligibility {
  readonly kind: "COORDINATION_GROUP";
  readonly coordinationGroupId: string;
}
```

No se implementará hasta que exista persistencia tipada y proyección inequívoca sobre cada tarea.

### 7.4 Resolución a tareas

Antes de construir `EngineInput`, la capa productiva resolverá la elegibilidad a `EXPLICIT_TASK_SET`.

La resolución deberá:

- usar el snapshot del día;
- aplicar inclusiones y exclusiones de instancia;
- excluir tareas canceladas;
- conservar tareas `done`, `in_progress`, `pending` e `interrupted` cuando sean miembros efectivos;
- rechazar referencias rotas;
- producir orden canónico por ID;
- permanecer inmutable;
- registrar origen y fingerprint.

---

## 8. Emparejamiento DYNAMIC_ORDINAL

Para evaluar un plan completo:

1. seleccionar las tareas elegibles efectivamente publicadas de cada carril;
2. ordenarlas por:
   - inicio;
   - final;
   - ID canónico como último desempate;
3. construir las secuencias `laneA` y `laneB`;
4. definir:

```text
sharedPairCount = min(laneA.length, laneB.length)
```

5. emparejar:

```text
laneA[0] ↔ laneB[0]
laneA[1] ↔ laneB[1]
...
```

6. tratar el resto del carril largo como residual.

Queda prohibido:

- emparejar por posición del input;
- ordenar por ID antes de decidir horarios;
- fijar parejas desde configuración;
- elegir retrospectivamente la combinación que minimice la penalización sin respetar el ordinal real;
- saltar una tarea intermedia para mejorar artificialmente el score;
- cambiar miembros después de conocer el resultado.

---

## 9. Semántica PREFERRED

Con `PREFERRED`:

- el plan sigue siendo válido aunque existan desviaciones;
- todas las tareas deben cumplir sus restricciones hard propias;
- la coordinación influye en el orden de alternativas y selección del incumbent;
- nunca impide publicar un plan completo hard-valid;
- nunca autoriza relajar disponibilidad, recursos, dependencias, comidas, locks, capacidad o estados protegidos;
- nunca crea una tarea sintética;
- nunca modifica duraciones.

La preferencia puede quedar incumplida por:

- ventanas incompatibles;
- dependencias;
- recursos compartidos;
- participante compartido;
- comidas;
- locks;
- tareas protegidas;
- continuidad o setup REQUIRED;
- una prioridad soft superior según la configuración efectiva;
- agotamiento de presupuesto con incumbent completo.

La Evidence deberá distinguir estos motivos cuando sean observables.

---

## 10. Semántica OFF

Con `OFF`:

- no existe pairing operativo;
- no se calcula penalización;
- no se añaden ramas;
- no se publica coordinación satisfecha o incumplida;
- el fingerprint conserva que la política está desactivada sólo cuando forme parte de la configuración efectiva versionada;
- el planning continúa obedeciendo todas las restricciones generales de cada espacio y tarea.

La ausencia histórica del campo será semánticamente equivalente a `OFF`.

---

## 11. Frontera con REQUIRED

`REQUIRED` no se ejecutará mediante el score de esta SPEC.

Cuando una configuración solicite coordinación obligatoria deberá ocurrir una de estas dos cosas:

1. proyectarse de forma completa a un contrato REQUIRED soportado, como `RoundSynchronizationPolicy`; o
2. ser rechazada por preflight como capacidad no representable.

Nunca se permitirá:

```text
REQUIRED configurado
        ↓
PREFERRED ejecutado silenciosamente
```

Tampoco:

```text
PREFERRED configurado
        ↓
plan invalidado por desviación
```

La severidad es parte del dominio y del fingerprint.

---

## 12. Tolerancia

`toleranceMinutes` deberá:

- ser entero;
- ser mayor o igual que cero;
- ser compatible con la unidad temporal productiva;
- permanecer dentro de la jornada;
- formar parte del snapshot diario;
- formar parte del fingerprint;
- mostrarse en UI y Evidence.

Con tolerancia cero se intenta comienzo simultáneo exacto, pero continúa siendo preferencia.

La tolerancia no redondea comienzos ni amplía disponibilidades.

---

## 13. Penalización transparente

La penalización V1 será:

```text
pairPenalty = excessDeviation
              × penaltyPerMinuteOutsideTolerance
```

```text
policyPenalty = sum(pairPenalty)
```

`penaltyPerMinuteOutsideTolerance` deberá:

- ser entero positivo cuando la severidad sea PREFERRED;
- ser configurable;
- quedar congelado en el día;
- mostrarse en el editor avanzado;
- formar parte del fingerprint;
- publicarse en Evidence.

No se utilizarán:

- pesos ocultos;
- presets cuyo valor numérico no pueda inspeccionarse;
- multiplicadores por nombres;
- bonificaciones negativas;
- penalización por tareas residuales en V1;
- penalización por política OFF.

Una UI básica puede ofrecer etiquetas de importancia, pero deberá mostrar el valor efectivo y persistir el número resuelto.

---

## 14. Posición en la evaluación

El orden conceptual será:

1. completitud;
2. reglas hard;
3. preservación de tareas protegidas y locks;
4. calidad operativa configurada;
5. penalizaciones PREFERRED, incluida coordinación;
6. desempate determinista.

La coordinación PREFERRED nunca puede dominar:

- completitud;
- hard validity;
- seguridad operativa;
- una obligación REQUIRED.

Su posición exacta dentro del vector de calidad deberá ser explícita y testeada.

No se incorporará mediante una suma opaca fuera del contrato de scoring.

---

## 15. Persistencia objetivo

### 15.1 Configuración general

Tabla conceptual:

```text
space_coordination_preferences
```

Campos mínimos:

- `id`;
- `contract_version`;
- `mode`;
- `severity`;
- `lane_space_a_id`;
- `lane_space_b_id`;
- `tolerance_minutes`;
- `pairing`;
- `active_while`;
- `penalty_per_minute_outside_tolerance`;
- `created_at`;
- `updated_at`.

La elegibilidad por plantilla utilizará filas estructuradas:

```text
space_coordination_preference_template_members
```

con:

- `policy_id`;
- `lane_space_id`;
- `template_id`.

### 15.2 Snapshot diario

Tablas conceptuales:

```text
plan_space_coordination_preferences
plan_space_coordination_preference_template_members
```

El snapshot conservará:

- identidad del origen sin dependencia destructiva;
- versión del contrato;
- severidad;
- espacios;
- tolerancia;
- pairing;
- penalización;
- elegibilidad sobre snapshots de plantilla del plan;
- `source`;
- timestamps;
- autor cuando corresponda.

### 15.3 Overrides de tarea

Una relación tipada futura podrá expresar:

```text
daily_task_coordination_overrides
```

con acciones:

- `INCLUDE`;
- `EXCLUDE`.

No se almacenará una lista opaca dentro de `rulesJson`.

### 15.4 Unicidad

No podrá existir más de una política efectiva equivalente para el mismo:

- plan;
- par canónico de espacios;
- modo;
- conjunto de elegibilidad incompatible.

Los duplicados contradictorios se rechazarán antes de persistir.

---

## 16. Precedencia efectiva

```text
estado protegido o lock
        > override explícito de tarea
        > override de política del día
        > snapshot diario
        > configuración general sólo al crear o actualizar explícitamente
        > OFF para ausencia legacy
```

Editar la política general no modifica días existentes.

Actualizar un día exige:

- acción explícita;
- comparación previa;
- validación completa;
- escritura atómica;
- nueva versión o fingerprint efectivo;
- auditoría.

---

## 17. UI de configuración general

Dentro del editor de espacio se mostrará una sección:

```text
Coordinación temporal con otros espacios
```

La UI creará una política simétrica, no dos preferencias dirigidas duplicadas.

Campos mínimos:

- espacio asociado;
- modo: alinear comienzos;
- estado: desactivado o preferido;
- tolerancia en minutos;
- penalización por minuto fuera de tolerancia;
- plantillas elegibles de cada carril;
- resumen de efecto;
- origen del valor.

La selección del espacio asociado:

- usa ID;
- excluye el propio espacio;
- no presupone coordinación por compartir zona;
- puede priorizar visualmente espacios del mismo plató sin convertirlo en regla;
- muestra incompatibilidades antes de guardar.

---

## 18. UI del día

La configuración diaria deberá mostrar:

- valor heredado;
- valor efectivo;
- origen;
- cambios respecto al general;
- número de tareas elegibles por carril;
- tareas protegidas afectadas;
- advertencias de configuración incompleta;
- acción para desactivar durante ese día;
- acción futura para actualizar desde general con diff.

No se actualizará silenciosamente al abrir la pantalla.

---

## 19. UI de instancia

El editor de tarea podrá permitir:

- incluir una tarea en una política diaria;
- excluirla;
- restaurar heredado;
- ver el espacio y política relacionados;
- ver si la tarea está protegida.

Un override de instancia no podrá:

- mover la tarea de espacio indirectamente;
- cambiar la severidad global;
- crear una política parcial;
- alterar tareas `done` o `in_progress` sin una operación autorizada distinta.

---

## 20. Visualización en planning

El planning podrá mostrar, sin ocultar tareas:

- marcador común de política;
- ordinal de par;
- desviación de comienzo;
- estado `ALIGNED`, `WITHIN_TOLERANCE`, `MISALIGNED` o `RESIDUAL`;
- penalización del par;
- explicación resumida;
- origen de la configuración.

La coordinación no se representará como:

- una sola barra compartida;
- una tarea conjunta;
- un espacio fusionado;
- capacidad adicional;
- duración extendida.

---

## 21. API

La API deberá separar:

- configuración general;
- snapshot diario;
- overrides;
- resolución efectiva;
- diagnostics de impacto.

Los contratos deberán ser estrictos y versionados.

Las mutaciones deberán:

1. validar body completo;
2. validar IDs y pertenencia;
3. construir el candidato efectivo;
4. detectar duplicados e incompatibilidades;
5. escribir atómicamente;
6. devolver la fila efectiva validada;
7. no dejar miembros parciales.

Errores mínimos:

- `INVALID_COORDINATION_POLICY`;
- `COORDINATION_SPACE_NOT_FOUND`;
- `COORDINATION_SELF_REFERENCE`;
- `COORDINATION_DUPLICATE_POLICY`;
- `COORDINATION_INVALID_TOLERANCE`;
- `COORDINATION_INVALID_PENALTY`;
- `COORDINATION_ELIGIBILITY_MISMATCH`;
- `COORDINATION_TEMPLATE_SNAPSHOT_MISSING`;
- `COORDINATION_CONFLICTING_MEMBERSHIP`;
- `COORDINATION_UNSUPPORTED_CONTRACT_VERSION`.

---

## 22. Proyección a EngineInput

`EngineInput` deberá recibir exclusivamente configuración efectiva del día.

Contrato conceptual:

```ts
interface EngineInputSpaceCoordinationPreferenceV1 {
  readonly id: string;
  readonly contractVersion: 1;
  readonly mode: "ALIGN_STARTS";
  readonly severity: "PREFERRED" | "OFF";
  readonly laneSpaceIds: readonly [number, number];
  readonly toleranceMinutes: number;
  readonly pairing: "DYNAMIC_ORDINAL";
  readonly activeWhile: "ALL_LANES_HAVE_ELIGIBLE_WORK";
  readonly taskIdsBySpaceId: readonly [
    { readonly spaceId: number; readonly taskIds: readonly number[] },
    { readonly spaceId: number; readonly taskIds: readonly number[] },
  ];
  readonly penaltyPerMinuteOutsideTolerance: number;
  readonly source: "INHERITED" | "DAY_OVERRIDE" | "AD_HOC";
}
```

`buildEngineInput` no resolverá miembros desde nombres.

Los fallos de carga o referencias rotas son errores hard de input, no ausencia neutral.

---

## 23. Preflight de EngineInput

El preflight rechazará:

- versión desconocida;
- severidad desconocida;
- modo desconocido;
- pairing desconocido;
- más o menos de dos carriles;
- espacio coordinado consigo mismo;
- espacio inexistente;
- tarea inexistente;
- tarea duplicada;
- tarea en carril incorrecto;
- tarea en dos políticas incompatibles;
- tolerancia negativa o no representable;
- penalización no positiva para PREFERRED;
- datos de miembros incompletos;
- política REQUIRED enviada por el contrato PREFERRED;
- configuración general no materializada como realidad diaria.

Una política OFF válida podrá canonicalizarse sin proyectar trabajo al motor.

No se producirá un problema parcial.

---

## 24. Adaptación a Planner Next

Contrato conceptual:

```ts
interface SpaceStartAlignmentPreference {
  readonly id: string;
  readonly laneSpaceIds: readonly [string, string];
  readonly taskIdsBySpaceId: Readonly<Record<string, readonly string[]>>;
  readonly toleranceMinutes: number;
  readonly penaltyPerMinuteOutsideTolerance: number;
  readonly pairing: "DYNAMIC_ORDINAL";
  readonly activeWhile: "ALL_LANES_HAVE_ELIGIBLE_WORK";
}
```

El adaptador deberá:

- mapear identidades reversibles;
- ordenar conjuntos canónicamente;
- conservar tolerancia y peso exactos;
- incluir la política en el fingerprint del problema;
- permanecer puro;
- congelar output;
- no planificar;
- no elegir parejas.

---

## 25. Scoring canónico

Se creará una función pura única equivalente a:

```ts
scoreSpaceStartAlignmentPreferences(
  problem,
  scheduledTasks,
): SpaceCoordinationScore
```

La función será autoridad para:

- evaluación final;
- comparación de candidatos;
- Evidence;
- validación de métricas publicadas.

No será autoridad de hard validity.

Salida mínima:

```ts
interface SpaceCoordinationScore {
  readonly totalPenalty: number;
  readonly policies: readonly SpaceCoordinationPolicyScore[];
}
```

Cada política publicará:

- pares coordinables;
- pares alineados exactos;
- pares dentro de tolerancia;
- pares fuera de tolerancia;
- desviación total;
- exceso total;
- penalización total;
- tareas residuales por carril;
- detalle ordinal de cada par.

---

## 26. Integración con búsqueda

La búsqueda podrá utilizar la penalización para:

- ordenar alternativas hard-valid;
- comparar incumbents completos;
- orientar backtracking;
- explicar por qué se eligió una secuencia.

No podrá:

- descartar una rama sólo por desviación PREFERRED;
- declarar inviabilidad por incumplimiento;
- consumir presupuesto fuera del ledger oficial;
- hacer un barrido oculto posterior;
- reparar el plan después de la búsqueda;
- enumerar todas las permutaciones completas antes de continuar;
- usar greedy como prueba de mejor coordinación global.

Un lower bound futuro sólo será válido si es admisible, determinista y contabilizado.

---

## 27. Future Feasibility

La coordinación PREFERRED puede aportar una señal de calidad futura, pero no una poda hard.

Podrán estimarse:

- pares todavía posibles;
- desviación mínima inevitable;
- ventanas comunes restantes;
- presión de recursos que impide alinear;
- coste mínimo adicional.

Una estimación no demostrada no podrá eliminar una rama.

---

## 28. Tareas protegidas y replanificación

### 28.1 Done

Una tarea `done` elegible:

- conserva su intervalo real o planificado protegido según contrato;
- participa en la secuencia observada;
- puede generar desviación histórica;
- no se mueve para mejorar el score.

### 28.2 In progress

Una tarea `in_progress` elegible:

- conserva intervalo y recursos protegidos;
- participa en pairing;
- no se desplaza.

### 28.3 Pending e interrupted

Sólo estas tareas pueden reconsiderarse cuando no estén protegidas por locks.

### 28.4 Resultado

La Evidence distinguirá:

- penalización evitable;
- penalización condicionada por tareas protegidas;
- penalización condicionada por locks;
- penalización condicionada por restricciones hard.

No se afirmará causalidad que la búsqueda no haya demostrado.

---

## 29. Interacción con otras capacidades

### 29.1 Participante compartido

La coordinación no permite solapar al mismo participante.

### 29.2 Recurso compartido

La coordinación no permite solapar un recurso requerido por ambas tareas.

### 29.3 Comidas

Una comida hard prevalece.

### 29.4 Setup

La preparación y continuidad setup prevalecen.

### 29.5 Hold posterior

Un hold REQUIRED forma parte de la ocupación y puede impedir alineación.

### 29.6 Transiciones

Las transiciones de participante, recurso o coach prevalecen.

### 29.7 Operación conjunta

Una operación conjunta conserva su contrato propio.

### 29.8 Rondas REQUIRED

Las tareas pertenecientes a una política REQUIRED no podrán pertenecer simultáneamente a una preferencia incompatible.

Podrá permitirse una preferencia distinta únicamente si el preflight demuestra compatibilidad inequívoca y no duplica la misma semántica.

### 29.9 Espacios padre e hijos

La relación jerárquica no crea coordinación automática ni elimina conflictos de capacidad existentes.

---

## 30. Validación canónica

La validación final comprobará:

- identidad exacta de la política;
- espacios exactos;
- miembros elegibles exactos;
- ausencia de duplicados;
- pertenencia de cada tarea a su carril;
- secuencias ordinales reales;
- cálculo exacto de desviación;
- tolerancia;
- penalización;
- tareas residuales;
- coincidencia entre score, Evidence y plan publicado;
- ausencia de tareas adicionales;
- preservación de hard constraints.

Una discrepancia de métricas no invalida el plan por desviación, pero sí invalida la publicación como Evidence reproducible.

---

## 31. Publicación

El envelope read-only podrá incluir:

```ts
interface PublishedSpaceCoordinationSummary {
  readonly policyId: string;
  readonly mode: "ALIGN_STARTS";
  readonly severity: "PREFERRED";
  readonly laneSpaceIds: readonly [number, number];
  readonly toleranceMinutes: number;
  readonly pairCount: number;
  readonly alignedPairCount: number;
  readonly outsideTolerancePairCount: number;
  readonly totalExcessMinutes: number;
  readonly totalPenalty: number;
  readonly residualTaskIdsBySpaceId: Readonly<Record<number, readonly number[]>>;
}
```

La publicación:

- no escribe en DB en shadow mode;
- no altera tareas;
- conserva identity map;
- es atómica con el plan;
- desaparece en resultados incompletos;
- no rellena métricas desconocidas con cero.

---

## 32. Evidence

Evidence mínima por política:

- `policyId`;
- `source`;
- `contractVersion`;
- `mode`;
- `severity`;
- `laneSpaceIds`;
- `eligibleTaskIdsBySpaceId`;
- `toleranceMinutes`;
- `penaltyPerMinuteOutsideTolerance`;
- `pairCount`;
- `exactStartPairCount`;
- `withinTolerancePairCount`;
- `outsideTolerancePairCount`;
- `totalAbsoluteDeviationMinutes`;
- `totalExcessDeviationMinutes`;
- `totalPenalty`;
- `residualTaskIdsBySpaceId`;
- `protectedPairCount`;
- `lockConstrainedPairCount`;
- `pairDetails`;
- `configurationFingerprint`;
- `resultFingerprint`.

No se añadirán contadores sin criterio de aceptación o regresión.

---

## 33. Fingerprints

El fingerprint de configuración cambiará cuando cambie:

- política;
- versión;
- severidad;
- espacios;
- tolerancia;
- pairing;
- activeWhile;
- tareas elegibles;
- penalización;
- origen efectivo cuando sea semántico.

El fingerprint del resultado cambiará cuando cambie:

- orden cronológico;
- pairing ordinal;
- comienzos;
- desviaciones;
- tareas residuales;
- penalización.

Arrays que representan conjuntos se ordenarán canónicamente.

Invertir el input sin cambiar semántica no modificará fingerprints.

---

## 34. Compatibilidad

### 34.1 Ausencia histórica

Ausencia de políticas equivale a OFF y conserva resultados históricos.

### 34.2 Motores que no soportan la preferencia

La política de activación deberá decidir explícitamente:

- no enviar la capacidad a ese motor; o
- rechazar la ruta como no representable.

No se ignorará silenciosamente si el usuario activó PREFERRED y la ruta afirma respetar configuración completa.

### 34.3 Planner Next

La integración se activará sólo tras demostrar scoring, búsqueda, validación y Evidence.

### 34.4 ORC

ORC podrá consumir la preferencia como calidad operativa y explicación, pero no reinterpretarla como hard.

---

## 35. Tests obligatorios

### 35.1 Contrato y preflight

- dos espacios válidos;
- self-reference;
- espacio inexistente;
- tarea inexistente;
- tarea en carril incorrecto;
- duplicado;
- miembro en políticas incompatibles;
- tolerancia inválida;
- peso inválido;
- versión desconocida;
- REQUIRED enviado al contrato PREFERRED;
- orden de input invertido;
- input inmutable;
- output frozen.

### 35.2 Pairing

- 2/2;
- 3/2 con residual;
- 1/0 sin pares;
- orden de tareas distinto del input;
- parejas derivadas del horario final;
- empate determinista cuando sea representable;
- tareas canceladas excluidas.

### 35.3 Scoring

- tolerancia cero;
- dentro de tolerancia;
- fuera de tolerancia;
- suma exacta;
- peso distinto;
- OFF sin score;
- residual sin penalización;
- determinismo;
- invariancia.

### 35.4 Búsqueda

- alinea cuando no perjudica hard constraints;
- se desvía para completar el día;
- no poda una rama sólo por preferencia;
- retrocede hacia un plan de menor penalización;
- respeta presupuesto;
- conserva incumbent completo;
- no publica parcial.

### 35.5 Protegidas

- done fija;
- in_progress fija;
- lock temporal;
- lock de espacio;
- penalización explicada sin mover protegidas.

### 35.6 Regresión

- ausencia conserva plan y fingerprint histórico;
- SPEC10-021 REQUIRED no cambia;
- joint groups no cambian;
- setup no cambia;
- holds no cambian;
- recursos efectivos no cambian;
- Focal A2 conserva determinismo.

---

## 36. Benchmarks futuros

Escenarios mínimos:

1. alineación gratuita;
2. alineación imposible por participante compartido;
3. alineación imposible por recurso compartido;
4. dependencia previa que desplaza un carril;
5. tarea protegida desalineada;
6. carriles asimétricos;
7. múltiples órdenes posibles;
8. conflicto entre coordinación y setup PREFERRED;
9. agotamiento con incumbent;
10. input invertido.

Métricas:

- completitud;
- hard validity;
- desviación;
- penalización;
- ramas;
- backtracks;
- tiempo hasta primera solución completa;
- diferencia frente a OFF;
- determinismo;
- explicación.

---

## 37. Fases futuras de implementación

### Checkpoint 1 — Persistencia y configuración efectiva

- DB general;
- snapshot diario;
- membresía por plantilla;
- overrides;
- RLS;
- API;
- tests de independencia.

No motor.

### Checkpoint 2 — UI

- editor general;
- editor diario;
- diff;
- origen;
- validación;
- sin scoring productivo.

### Checkpoint 3 — EngineInput y preflight

- resolución a IDs de tarea;
- fingerprint;
- adapter;
- reason codes;
- rutas no soportadas rechazadas.

### Checkpoint 4 — Scoring y validación

- función pura;
- Evidence;
- publicación read-only;
- sin integración de búsqueda todavía.

### Checkpoint 5 — Búsqueda

- branch ordering;
- incumbent comparison;
- backtracking;
- ledger;
- benchmarks.

### Checkpoint 6 — Activación opt-in

- shadow mode;
- comparación;
- decisión humana;
- rollback;
- merge gate completo.

No se mezclarán varios checkpoints grandes.

---

## 38. Qué no hacer

- no usar nombres de espacios;
- no usar nombres de tareas;
- no asumir coordinación por compartir plató;
- no modelar como `jointGroupId`;
- no fusionar capacidades;
- no imponer simultaneidad hard;
- no penalizar rondas residuales en V1;
- no fijar pairing por input;
- no reparar después de planificar;
- no ocultar peso;
- no guardar en `rulesJson`;
- no leer catálogo global durante la planificación del día;
- no modificar tareas protegidas;
- no ignorar la política en una ruta que afirma soportarla;
- no publicar parciales;
- no tocar SPEC10-021 al implementar PREFERRED.

---

## 39. Criterios de aceptación del contrato

SPEC11-005 queda documentalmente completa cuando:

- distingue inequívocamente PREFERRED de REQUIRED;
- conserva espacios independientes;
- exige elegibilidad explícita;
- define pairing ordinal real;
- define tolerancia y penalización configurables;
- define snapshot y overrides;
- proyecta IDs efectivos a EngineInput;
- define preflight atómico;
- define scoring puro;
- define interacción con hard constraints;
- protege done, in_progress y locks;
- define validación, publicación, fingerprint y Evidence;
- conserva OFF como compatibilidad;
- separa implementación en checkpoints;
- no modifica el contrato de Totales.

---

## 40. Decisión final

> Coordinar no es fusionar.  
> Preferir no es obligar.  
> Emparejar no es fijar el orden.  
> El snapshot define quién participa.  
> El horario final define las parejas.  
> Las reglas hard deciden la viabilidad.  
> La penalización explica la calidad.