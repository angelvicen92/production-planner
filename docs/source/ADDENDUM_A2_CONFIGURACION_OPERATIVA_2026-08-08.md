# ADDENDUM A2 — Configuración operativa efectiva

**Versión:** 1.0  
**Fecha de aclaración:** 8 de agosto de 2026  
**Estado:** fuente oficial complementaria para el DÍA DE PRUEBA A2  
**Autoridad:** aclaración operativa expresa del responsable de producción, con precedencia según la sección 1 del `DOCUMENTO_MAESTRO_INTERPRETACION_ENSAYO_A2_v1.md`.

---

## 1. Propósito

Cerrar explícitamente las decisiones de configuración A2 que no estaban fijadas en los PDFs sin convertir en reglas hard los horarios de la planificación humana.

Este addendum no autoriza a copiar horas de tareas, IN, OUT o `CORTE COMIDA` desde los PDFs como seed, lock u orden del planificador.

## 2. Disponibilidad de concursantes

Por defecto, un concursante está disponible durante **toda la jornada efectiva del día**.

La semántica es de herencia:

```text
participant availability default = effective workday window
```

Para el benchmark A2 actual, cuya jornada efectiva es `09:00–21:00`, el default se materializa como esa misma ventana para C01–C19.

No significa disponibilidad 24 h ni una ventana fija independiente de la jornada. Un override diario explícito puede hacer la ventana de un concursante más restrictiva.

Los horarios humanos de IN y OUT no se utilizan para deducir disponibilidad.

## 3. Descansos de comida de espacios y unidades

Los bloques `CORTE COMIDA` del documento por espacios representan descansos de comida reales de los ámbitos operativos a los que pertenecen.

Reglas:

- el descanso existe en los ámbitos que el PDF por espacios identifica mediante `CORTE COMIDA`;
- la duración por defecto es **75 minutos**;
- la duración sigue siendo configurable y puede tener override diario;
- la comida es **flexible dentro de la ventana efectiva de comidas** del día;
- el planificador elige el inicio concreto que produzca la mejor planificación hard-valid;
- la hora mostrada en la planificación humana no es autoritativa y no se copia como hora fija;
- sólo el intervalo finalmente elegido bloquea el ámbito correspondiente;
- no se crea una comida global implícita;
- un recurso compartido no come varias veces por pertenecer a varios ámbitos: debe resolverse una única comida compatible según SPEC-07 y el dominio oficial.

La ventana efectiva de comidas (`mealStart` / `mealEnd`) procede de la configuración efectiva del programa/día. Este addendum **no fija unas horas universales nuevas** para esa ventana.

## 4. Política OUT por defecto

La política de agrupación OUT por defecto es:

```text
minParticipantsPerGroup = 1
```

Por tanto, **no existe obligación de agrupar salidas por defecto**. Un concursante puede formar por sí solo un grupo de salida.

Este valor puede modificarse mediante la configuración efectiva de transporte del día.

Esta aclaración no inventa un intervalo mínimo adicional entre salidas: cualquier `departureMinGapMinutes` u otra restricción de transporte procede de la configuración efectiva correspondiente.

## 5. Separación respecto a la referencia humana

Se mantienen como referencia comparativa, y nunca como entrada del planificador:

- las horas concretas de IN/OUT del planning humano;
- las horas concretas en las que el planning humano colocó `CORTE COMIDA`;
- el orden humano de concursantes y tareas.

La plantilla A2 debe construir la solución desde las obligaciones, disponibilidades, recursos, dependencias y configuración efectiva.

## 6. Consecuencia para el benchmark Full A2

Quedan resueltas como decisiones de fuente:

- default de disponibilidad de concursantes = jornada completa;
- duración y semántica flexible de los descansos scoped = 75 min dentro de la ventana efectiva;
- agrupación OUT por defecto = mínimo 1, sin agrupación obligatoria.

La ventana de comidas no debe hardcodearse desde evidencia histórica. El benchmark deberá recibir o materializar de forma reproducible la **ventana efectiva configurada del día** antes de declarar el escenario ejecutable de extremo a extremo.
