# ADDENDUM OFICIAL — Semántica de agrupación de transporte

**OptiPlan · 8 de agosto de 2026**  
**Estado:** fuente oficial de dominio y operación.

## 1. Objeto

Este addendum aclara la semántica de la configuración de agrupación de transporte IN/OUT y corrige la interpretación previa de los campos históricos denominados `arrivalGroupingTarget` y `departureGroupingTarget`.

No introduce una capacidad nueva. Fija la intención operativa que dichos campos deben representar.

## 2. Contrato mínimo y máximo

Para cada dirección de transporte activa existen dos límites operativos distintos:

- **mínimo de participantes por grupo**;
- **máximo de participantes por grupo**.

El campo histórico de producto actualmente denominado:

- `arrivalGroupingTarget` para IN;
- `departureGroupingTarget` para OUT;

representa semánticamente el **mínimo de participantes por grupo** de esa dirección.

El nombre técnico `GroupingTarget` es legado y no autoriza a tratar el valor como un tamaño objetivo exacto ni como una preferencia soft.

El máximo de participantes por grupo viene dado por la capacidad efectiva de transporte, actualmente representada por `vanCapacity`.

Por tanto, para una dirección configurada:

```text
minimumGroupSize = groupingTarget histórico
maximumGroupSize = vanCapacity
```

con la condición obligatoria:

```text
1 <= minimumGroupSize <= maximumGroupSize
```

Una configuración que incumpla esa relación es inválida y debe rechazarse o bloquear la planificación con explicación explícita.

## 3. Semántica REQUIRED

El mínimo y el máximo configurados son límites **REQUIRED**.

Cada grupo materializado debe cumplir:

```text
minimumGroupSize <= groupSize <= maximumGroupSize
```

No se permite relajar silenciosamente el mínimo para crear un último grupo residual más pequeño.

El planificador debe elegir una partición global válida de participantes. Por ejemplo, con mínimo 3 y máximo 6, los grupos pueden ser de 3, 4, 5 o 6 integrantes según convenga a la jornada; no existe obligación de formar grupos exactamente de 3.

Si el número de participantes y las demás restricciones hacen imposible cualquier partición que respete los límites configurados, el resultado es una inviabilidad explicable.

## 4. Separación respecto de otras propiedades

El mínimo de grupo no se deduce de:

- la capacidad máxima;
- el peso de agrupación;
- el número total de participantes;
- horarios humanos;
- nombres o IDs;
- una heurística del motor.

`groupingWeight` conserva su función de preferencia o ponderación donde corresponda, pero nunca puede autorizar un grupo por debajo del mínimo ni por encima de la capacidad máxima.

`arrivalMinGapMinutes` y `departureMinGapMinutes` siguen siendo restricciones temporales independientes y no redefinen el tamaño de grupo.

## 5. Configuración y ausencia de hardcodes

El mínimo es configurable desde la aplicación.

No se hardcodeará en Planner Next, ORC, V3, V4 ni en lógica específica de A2.

La configuración general puede proporcionar valores por defecto para días nuevos. Cada día debe conservar su snapshot efectivo conforme a SPEC-11, y los cambios globales posteriores no deben alterar silenciosamente un día ya creado.

## 6. Default operativo de IN

El default acordado de producto para IN es:

```text
minimumGroupSize = 3
```

Este valor es un **default configurable**, no un hardcode del motor.

El usuario puede cambiarlo, por ejemplo a 4, y desde ese momento el mínimo efectivo de los grupos IN del día será 4 si así queda registrado en su configuración efectiva.

## 7. OUT

Este addendum no inventa un default adicional para OUT.

OUT utiliza el valor efectivo configurado en la aplicación/snapshot del día.

Cuando el campo histórico `departureGroupingTarget` tiene valor 3, su semántica es **mínimo 3 participantes por grupo OUT**, no “objetivo 3”.

## 8. Caso Full A2

Para el Full A2 actualmente observado:

```text
IN minimumGroupSize = 3
OUT minimumGroupSize = 3   // valor observado en el snapshot efectivo, no default inventado
maximumGroupSize = 6
arrivalMinGapMinutes = 35
departureMinGapMinutes = 20
```

El valor 3 de IN coincide con el default oficial. El valor 3 de OUT procede de la configuración efectiva observada del día.

## 9. Compatibilidad con nombres históricos

No es obligatorio crear un segundo campo de persistencia únicamente para distinguir “target” de “minimum”.

La implementación puede conservar temporalmente los nombres históricos `arrivalGroupingTarget` y `departureGroupingTarget` por compatibilidad, siempre que:

- la UI los presente inequívocamente como **mínimo**;
- EngineInput y Planner Next los traten como límite mínimo REQUIRED;
- Evidence publique su semántica efectiva como mínimo;
- no exista simultáneamente otro supuesto `target` con la misma fuente de datos;
- futuras migraciones o renombrados preserven valores y snapshots existentes.

## 10. Corrección de interpretación previa

Queda expresamente sustituida cualquier interpretación previa que afirmase que `groupingTarget` debía mantenerse como un “target” separado de `minParticipantsPerGroup`.

En particular, la frase interpretativa incluida en la Evidence histórica `A2-FULL-008-effective-configuration-probe.json` que separaba ambos conceptos se considera una interpretación incorrecta. Los valores observados de esa Evidence siguen siendo válidos; lo que cambia es su significado de dominio.

## 11. Criterio de implementación

Antes de considerar soportado el transporte en Planner Next deberá demostrarse mediante Evidence que:

1. la configuración efectiva conserva mínimo, máximo y separación temporal;
2. el adaptador no inventa valores;
3. la búsqueda construye grupos dentro de `[minimumGroupSize, maximumGroupSize]`;
4. no deja residuos por debajo del mínimo;
5. el validador rechaza cualquier grupo fuera de rango;
6. IN y OUT pueden tener mínimos distintos;
7. los valores proceden del snapshot efectivo del día;
8. el comportamiento es determinista, explicable e independiente del orden de entrada.

## 12. Sincronización temporal de los grupos

La agrupación de transporte es una obligación temporal conjunta, no sólo una partición contable de participantes.

Para **IN**:

- todos los participantes asignados al mismo grupo comparten el mismo horario de la tarea IN;
- por tanto, sus tareas IN se materializan sincronizadas en el mismo intervalo;
- `arrivalMinGapMinutes` es la separación mínima entre los instantes de inicio de dos grupos IN consecutivos.

Para **OUT**:

- todos los participantes asignados al mismo grupo comparten el mismo horario de la tarea OUT;
- por tanto, sus tareas OUT se materializan sincronizadas en el mismo intervalo;
- `departureMinGapMinutes` es la separación mínima entre los instantes de inicio de dos grupos OUT consecutivos.

Un participante pertenece a un único grupo por dirección. La búsqueda debe elegir conjuntamente la partición y el horario de los grupos, respetando disponibilidad, precedencias, ocupación del participante y el resto de restricciones hard del día.

No se utilizarán horarios humanos de referencia para decidir integrantes ni horarios de los grupos.

La Evidence de soporte de transporte deberá demostrar además que:

1. cada grupo IN y OUT está internamente sincronizado;
2. los grupos consecutivos de cada dirección respetan su `minGapMinutes` efectivo;
3. ningún participante aparece en más de un grupo de la misma dirección;
4. todas las tareas de transporte quedan cubiertas exactamente una vez;
5. una partición u horario imposible produce inviabilidad explicable, sin relajar mínimo, máximo ni separación temporal.
