# OptiPlan — P0-G04a: diagnóstico de transporte × fases × conjunta × comidas

**Resultado: DIAGNOSTIC_ONLY / CONSUMER_DEFECT.** Base autorizada `de7aec0b78c2c5b8d6118a2a72b69d6721dd123b`; `main` y la rama remota objetivo se verificaron idénticos en GitHub ([identidad](remote-identity.json)). No hay cambio productivo, migración 131, PR, merge, despliegue ni escritura remota.

La jornada nueva contiene **103 obligaciones auténticas desde Chromium**. El contrafactual de admisión obtiene un witness físico completo y una continuación protegida en memoria. El consumidor SQL existente **rechaza ese mismo witness** con `ANCHORED_WITNESS_SPACE_CONFLICT`: reconoce conjuntas y anclajes, pero no la simultaneidad autorizada del transporte. Abrir únicamente los guards no certificaría la composición hasta Stage. Se aplica la condición de parada del encargo: «Si no se demuestra una ruta físicamente válida y su contrato material, DETENER implementación y entregar únicamente el diagnóstico causal reproducible».

## Resultados y límites

| Recorrido fresco | Resultado | Ramas | Stages SQL nuevos |
|---|---|---:|---:|
| Control G03e macro, UI → Draft → S1/S2 → conexión SQL fría | 65/65, comidas y recursos verificados | 2.884 / 843 | 2 |
| Control G03e genérico, mismo stack | 18/18, continuación exacta | 64 / 53 | 2 |
| G04a nativo, dos bases frías independientes | 103 guardadas, adapter SUPPORTED; autoría de fases rechazada | búsqueda no llamada | 0 |
| G04a contrafactual, dos entradas UI anteriores | witness 84 tareas + 19 comidas, cero HARD/REQUIRED | 3.420 en ambas | 0 |
| Continuación del contrafactual, preservando las ocho posiciones previas | 103 completas; 76 tareas nuevas y 19 comidas en el witness | 1.377 en ambas | 0 |
| Probe del consumidor SQL, stack adicional descartable | `ANCHORED_WITNESS_SPACE_CONFLICT`, transacción revertida | no busca | 0 |

Las propuestas y la protección de G04a de la tabla son **sólo memoria**. No se aplicaron a Draft ni se aceptaron Stages. El probe SQL utiliza metadatos sintéticos para alcanzar el consumidor físico, con el resultado literal del motor y hashes recalculados; no constituye una propuesta API auténtica ni un recibo de aceptación. El bootstrap normal sólo crea S0 vacío. Los cuatro Stages positivos pertenecen exclusivamente al control G03e.

[Gate causal](causal-gate.md), [matriz](composition-matrix.md), [dos verificaciones](verification-a.json), [repetición](verification-b.json), [determinismo](determinism.json), [rechazo físico SQL](sql-transport-mismatch.json) y [control G03e](control-g03e-verification.json).

## Autoridades y primera operación rechazada

Todas las altas positivas de participantes, recursos, unidades, espacios, plantillas, parámetros y tareas de G04a proceden de los controles nativos en Chromium, sobre Auth/PostgREST/PostgreSQL local descartable. Se reutilizó el productor G03e en una copia archivada; su jornada positiva y sus archivos permanecen intactos. No se importaron horarios, seeds, locks ni decisiones humanas.

- 19 Main + 19 Vocal + 19 comidas individuales de 40 minutos + ocho obligaciones de la macro + 19 IN + 19 OUT = **103**.
- Plantillas IN/OUT distintas por ID, referencias de snapshot y configuración diaria reales. IN: mínimo 1, objetivo 3, máximo 3 y separación mínima entre inicios 30. OUT conserva los parámetros del snapshot canónico existente: mínimo 1, objetivo 1, máximo 6 y separación 20; no se copian los de IN. Vehículo 3, peso 3. OUT.before = 0 se guarda desde UI.
- C01: 09:00–15:30; C02–C19: 09:00–19:00; jornada: 09:00–21:00. EVA conserva su snapshot 16:00–21:00. Se mantienen cinco usos de EVA, Unidad C fija, coaches, comidas flexibles y fases 3/2/2 con C06+C10 como una sola ocupación física.
- El editor muestra `phasesSupported=false` y deshabilita «Crear cadena técnica». El endpoint real, solicitado después como diagnóstico, devuelve 422 `TECHNICAL_CHAIN_AUTHORITY_CONFLICT` en `dayConfigurationService.ts`, **antes** de `validateDailyTechnicalChains`.
- El predicado dirigido devuelve `UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION`. El endpoint de conjunta devuelve 422 `UNSUPPORTED_JOINT_COMBINATION`. SQL read-only reproduce ambos `UNSUPPORTED_*` mediante las funciones instaladas con el ledger 001–130.

Además de las dos exclusiones propuestas en la hipótesis inicial, existen las exclusiones de transporte del servicio de configuración y de `effectiveConfigurationView.technicalChains.supported`. La hipótesis «sólo dos guards» era insuficiente.

## Contrafactual y recorrido material

`counterfactual.ts` se ejecuta exclusivamente en `work/.../source`, nunca en el checkout productivo. Crea dos módulos sombra con las mismas validaciones, retirando únicamente las dos exclusiones `!input.transportSettings`. Materializa en memoria las declaraciones intentadas de fases y conjunta con sus IDs auténticos. Compara el resto del EngineInput completo contra el original; no cambia duración, parámetros, recursos, dependencias ni presupuesto.

El adapter conserva **84 tareas y 19 comidas**. La cadena mantiene siete representantes físicos y ocho obligaciones, sin miembros de transporte. Desde cualquiera de sus peers, el resolver cierra la unidad de ocho; el cierre de dependencias conserva siete IN como supporting independientes. La proyección colectiva mantiene las 84 tareas —incluidos los 38 transportes— y las 19 comidas. No se amplía artificialmente el scope ni se aceptan los supporting.

El motor utiliza EXACT_CONSTRUCTIVE con el presupuesto original de **10.000 ramas**, geometría, matching, Future Feasibility y validadores existentes. El witness completo pasa `validatePlan`; el certificado técnico consumido por el probe SQL es `WITNESS`, con **cero búsqueda adicional**. La continuación en memoria preserva literalmente los ocho placements y resuelve las obligaciones restantes.

En el primer witness, IN abre a las 09:00 y continúa a 09:30, 10:00, 10:30, 11:00, 11:30 y 12:00. Son resultados del motor, no una parrilla impuesta. C01 llega a las 10:30–10:35, tiene Vocal 13:55–14:10, Main 15:10–15:25 y OUT 15:25–15:30. La llegada no limita su primera tarea; su cierre requiere respetar el override OUT.before = 0. No se afirma optimización de permanencia ni holgura terminal positiva. OUT utiliza 13 grupos, con residual de dos y último de seis: el target 1 permanece una preferencia, no una capacidad hard falsa.

## Primer rechazo material SQL

`sqlConsumerProbe.ts` compara todo el input serializado con otro día nativo equivalente y obtiene la revisión canónica mediante el builder existente. Dentro de **una única transacción revertida** retira sólo las dos cláusulas SQL de admisión por presencia de transporte, materializa las mismas autoridades intentadas y construye metadatos sintéticos de run/replay para ejecutar:

`assert_daily_technical_chain_snapshot(integer,jsonb,bigint,bigint)` → `assert_anchored_choice_witness(integer,jsonb,bigint)` → `ANCHORED_WITNESS_SPACE_CONFLICT`.

El consumidor físico permanece literal. El hash del resultado se calcula en PostgreSQL; el certificado técnico valida el witness completo. El rechazo observado es físico, no de hash, fuentes, revisión ni permisos. Tras ROLLBACK, la comparación de las autoridades y la revisión del plan coincide con el estado anterior.

La cláusula `same_operation` reconoce miembros de anclajes o conjuntas. Los transportes conservan su autoridad independiente y quedan fuera de ambos conjuntos. Por ello las coincidencias de espacio de un grupo válido se interpretan como ocupaciones exclusivas incompatibles. `analyze_sql.py` encuentra **34 pares**: todos los solapes físicos de espacio no conjuntos del witness son pares IN/OUT autorizados, sincronizados y de su misma dirección. No hay un tercero externo escondido tras la excepción.

La autoridad SQL de paquetes ya existe dentro del consumidor nominal de 112 (`nominal_resource_private.guard_nominal_physical_validation`), con cardinalidad, simultaneidad y separación. Ese trigger entra para requisitos nominales byType/anyOf; no convierte al consumidor global de fases en compatible con transporte. Su existencia no es un certificado de esta intersección. No se copia otro verificador ni se debilita la exclusividad para obtener un resultado verde.

## Determinismo, controles e intentos

Dos bases frías conservan literalmente IDs, parámetros, EngineInput, adapter, configuración efectiva, scopes, problemas proyectados, propuestas, witnesses, validaciones, continuidad y contadores. Se comparan **1.498 archivos productivos** con hashes iguales. Sólo se excluyen siete contadores de tiempo y las fechas de creación/actualización de filas SQL; ninguna diferencia física se normaliza. El ensayo SQL es adicional y no se presenta como dos aceptaciones frías.

El control G03e llega a cuatro Stages nuevos y pasa su verificador independiente, incluyendo recursos, comidas y conexión SQL nueva. Las nueve pruebas focales de transporte, TypeScript de producto y harness, build local y secuencia de migraciones pasan. [Validación](validation.json) distingue controles frescos de baselines históricos no reejecutados. No hay head candidato funcional ni CI de un PR nuevo.

[Intentos](attempts.json) conserva el ensayo preliminar con margen OUT heredado, los errores de serialización y la alineación de revisión del harness SQL. Ninguno se cuenta como rechazo físico de la combinación canónica. La comparación correcta parte de OUT.before = 0; no se aumenta timeout ni branches para compensar los intentos.

## Frontera y reproducción

No se implementa ni se declara PRODUCTIVE_COMPOSED la ampliación 65+38. Falta certificar materialmente transporte independiente en el **witness global SQL** y sus consumidores de Draft/Stage, conservando cardinalidad, separación, disponibilidad, primera/última presencia, dependencias y protección. Sólo después corresponde reconsiderar las exclusiones de UI/servicio/TS/SQL, las dos topologías nativas hasta Stages y todos los negativos/baselines del encargo. No hay evidencia que justifique modificar el scheduler, matching, geometría o presupuestos. Las demás familias hacia 266 siguen fuera de esta certificación.

Con dependencias existentes, Docker local y Chromium:

```sh
node --import tsx docs/evidence/p0-g03e/run.ts work/g04a-control
python docs/evidence/p0-g03e/verify.py work/g04a-control/native work/g04a-control-verification.json
node --import tsx docs/evidence/p0-g04a/run.ts work/g04a-a
cd work/g04a-a/source
node --import tsx docs/evidence/p0-g04a/counterfactual.ts ../native ../probe
node --import tsx docs/evidence/p0-g04a/continuation.ts ../probe
```

Repetir el alta en otro directorio frío. Desde la raíz, ejecutar `verify.py` con native/probe/output y `compare.py` con las dos raíces/output. Para el consumidor SQL:

```sh
G04A_SQL_PROBE=/ruta/absoluta/al/probe node --import tsx docs/evidence/p0-g04a/run.ts work/g04a-sql
python docs/evidence/p0-g04a/analyze_sql.py /ruta/al/probe work/g04a-sql/native work/sql-analysis.json
```

El runner archiva y vincula las fuentes; no modifica los archivos productivos. Si falla un detalle del harness SQL, conserva ese stack descartable para reparación focal mediante un módulo Retry numerado y `retry-sql-probe`; los intentos ejecutados están conservados. Los recibos públicos se empaquetan con `pack.py`; las credenciales y logs privados quedan excluidos. Los archivos comprimidos incluyen tanto los resultados positivos en memoria como el rechazo SQL, sin transformar ninguno en Stage.
