# OPTIPLAN — ÍNDICE Y AUTORIDAD DE FUENTES

**Versión:** 2.10  
**Fecha:** 30 de septiembre de 2026  
**Estado:** Fuente oficial de gobierno documental  
**Principio rector:** La producción tiene que salir.

## Actualización v2.10

Eleva `07_PROTOCOLO_MAESTRO_CONTINUIDAD_v2.2` y corrige la continuidad de Codex según el entorno real de OptiPlan: abrir un hilo nuevo crea un PR nuevo. Mientras el trabajo siga siendo la misma unidad lógica y deba actualizar el mismo PR, se continuará en el mismo hilo de Codex; el cambio de hilo queda reservado a una decisión explícita de nueva unidad / nuevo PR.

## Actualización v2.9

Eleva `07_PROTOCOLO_MAESTRO_CONTINUIDAD_v2.1` e incorpora como obligación de gobierno el **Gate de Auditoría Causal Integral**: después de cada PR/resultado material del planificador y antes de una nueva iteración de implementación, ChatGPT debe reconstruir el call path real, contrastarlo como jefe de producción y desarrollador, compararlo con el baseline anterior y formular una hipótesis causal falsable. Si todavía no puede hacerlo, la siguiente unidad lógica debe ser diagnóstica.

Esta regla impide encadenar cambios locales guiados únicamente por el blocker más reciente, el número de tareas completadas o contadores aislados. Una caída de completitud debe clasificarse primero como regresión real, cambio de configuración/contrato, endurecimiento correcto de validación o detección más temprana de una rama ya inviable.

## 1. Propósito

Esta Fuente define el corpus oficial reducido, la autoridad por ámbito y la forma de resolver aparentes conflictos. Sustituye cualquier jerarquía lineal simplificada del corpus anterior.

No contiene estado dinámico de GitHub. El código realmente integrado, SHA, PR, CI, migrations, benchmarks y Evidence vigentes se reconstruyen siempre desde `main` y el repositorio. La documentación define el contrato; `main` + Evidence describen el estado real de implementación y no pueden convertir por sí solos una conducta accidental en requisito de producto.

## Actualización v2.8

Actualiza el corpus para incorporar el contrato genérico de márgenes específicos de participante y la corrección A2 de disponibilidad/cierre terminal aprobada el 30 de septiembre de 2026. La Fuente 06 v2.7 sustituye el límite histórico `18:40` de C02–C19 por `19:00` y fija `Estilismo salida.after = 0` + `OUT.before = 0`, sin cambiar la capacidad 1 de Estilismo ni la ventana global `09:00–21:00`.

## 2. Corpus oficial único

1. `01_PRODUCTO_DOMINIO_OPERACION_v5.2.md`
2. `02_ORC_CORE_CONSOLIDADO_v2.2.md`
3. `03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.6.md`
4. `04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.5.md`
5. `05_VALIDACION_CALIDAD_BENCHMARK_v2.6.md`
6. `06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.7.md`
7. `07_PROTOCOLO_MAESTRO_CONTINUIDAD_v2.2.md`
8. `ENSAYO_A2_LV.pdf`
9. `ENSAYO_A2_LV 15 JUNIO 2025 -  DESGLOSE A2.pdf`
10. Este índice.

Cualquier auditoría, informe de migración, snapshot de GitHub o documento de trabajo queda **fuera** de las Fuentes oficiales aunque viaje en el mismo paquete.

## 3. Autoridad por ámbito

No existe una única escalera documental capaz de resolver correctamente todos los conflictos. Se aplica la Fuente especializada del ámbito material:

| Ámbito | Autoridad principal | Regla de conflicto |
|---|---|---|
| Producto, actores, dominio y operación | `01_PRODUCTO_DOMINIO_OPERACION_v5.2` | Define qué producto existe, autoridad humana, entidades y semántica operativa. |
| Arquitectura y contratos internos ORC | `02_ORC_CORE_CONSOLIDADO_v2.2` | Gobierna sólo el razonamiento interno; no puede redefinir WorkingPlan, Stage, publicación o aceptación humana. |
| Construcción, scopes, método de bloques y búsqueda | `03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.6` | En Assisted prevalece sobre contratos legacy del ORC sobre “estado oficial”, completitud global o mejora-only. SPEC-07 v2.2 es la autoridad del método constructivo dentro de este documento. |
| EffectiveConfig, snapshots, adaptación, persistencia Assisted, AcceptedException y publicación | `04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.5` | Gobierna configuración efectiva, provenance, Stage/Draft, grandfathering, rollback y frontera EngineInput/producto. |
| Gates, regresión, Evidence, KPIs y benchmark | `05_VALIDACION_CALIDAD_BENCHMARK_v2.6` | Define qué debe demostrarse; no crea reglas de dominio nuevas. |
| Hechos y parámetros **específicos del A2 canónico** | `06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.7` | Prevalece sobre defaults, ejemplos y valores genéricos de 01–05. Los PDFs sólo prevalecen cuando 06 no contiene una corrección/interpretación expresa. |
| Método de trabajo y continuidad de desarrollo | `07_PROTOCOLO_MAESTRO_CONTINUIDAD_v2.2` | Gobierna cómo trabajar; nunca redefine producto, dominio ni A2. |
| Evidencia humana primaria A2 | dos PDFs A2 | Sirven de evidencia, no de seed; sus errores/correcciones se resuelven por 06. |

## 4. Reglas transversales de precedencia

1. `done`, `in_progress`, integridad física, identidad y locks explícitos nunca se degradan por preferencias.
2. Una regla específica del día/snapshot prevalece sobre un default genérico; un override de instancia prevalece sobre el valor heredado según 04.
3. Un hecho **A2 específico** nunca puede ser sustituido por un ejemplo genérico de otro documento.
4. Una cláusula del ORC que diga `COMMIT`, “estado oficial”, “hard-valid” o “sin parcial” se interpreta dentro del solver interno salvo que el texto diga expresamente `Stage`, `WorkingPlan` u `OfficialPlan`.
5. Assisted es el producto primario. `DAY_CONSTRUCTION`/Autopilot es un scope mayor y línea futura; ninguna cláusula histórica convierte one-click global en gate del MVP.
6. La aceptación humana de una desviación no cambia la regla global ni falsea la verdad de validación.
7. Los nombres/versiones de documentos retirados que aparezcan dentro de una sección de provenance o historial **no crean autoridad paralela**. Toda referencia normativa activa debe resolverse contra este corpus 00–07 o los dos PDFs A2 conforme a la tabla de ámbito.

## 5. Guardia canónica A2

El snapshot A2 vigente tiene **266 obligaciones canónicas**. Para `IN` del A2 canónico:

```text
targetGroupSize = 3
maximumGroupSize = 3
minGapMinutes = 30
```

`minGapMinutes` es separación mínima entre inicios de grupos, no parrilla fija. Ningún valor genérico, fixture histórico, ejemplo, comentario o versión anterior puede reinterpretar estos tres valores como otro canon A2. Cualquier cambio futuro del canon deberá hacerse en una nueva versión de `06` y actualizar su Evidence.

## 6. Separación de conceptos obligatoria

- `WorkingPlan`: estado de trabajo; puede estar incompleto o contener conflictos.
- `PlanningScope`: selección explícita de obligaciones solicitadas.
- `ScopeProposal`: propuesta automática para un scope; no consolida por sí sola.
- `Draft`: estado mutable desde el último Stage.
- `Stage`: checkpoint **del planning completo**, inmutable una vez aceptado.
- `AutomaticProtection`: protege placements aceptados contra movimiento automático posterior; **no es un lock**.
- `Lock`: restricción explícita declarada por producción.
- `AcceptedException`: aceptación estructurada de una violación concreta; no cambia la policy global ni autoriza nuevas violaciones.
- `OfficialPlan`: plan que producción decide publicar con su estado real de validación visible.

## 7. Regla de evolución documental

Toda corrección/addendum estable se integra en la siguiente versión consolidada y el documento temporal se retira. No se mantienen dos Fuentes normativas paralelas sobre el mismo contrato.


## 8. Actualización v2.7 — reserva virtual de supporting, presión y witness estructural futuro

Se elevan como Fuentes vigentes `03 v3.5`, `05 v2.5` y `06 v2.5`; se mantienen `01 v5.2`, `02 v2.2`, `04 v2.4` y `07 v2.0`.

La construcción Assisted separa de forma obligatoria **witness de capacidad** y **hora nominal final**. Los prerrequisitos breves fuera del scope visible pueden existir como reservas virtuales, spots anónimos o placements efímeros reparables, pero no se convierten en estado aceptado/protegido por el mero hecho de haber servido para demostrar factibilidad. Cuando alimentan una estructura posterior, su witness debe maximizar libertad futura; la compactación nominal tardía se aplica sólo después de cerrar la estructura productiva correspondiente.

La asignación de identidades a spots escasos se ordena por presión efectiva —disponibilidad restante, carga futura, slack/dominio, dependencias, comidas/transiciones y unidades críticas— antes de usar desempates canónicos. Además, antes de aceptar un Stage debe conservarse al menos un witness sound de toda unidad estructural `REQUIRED` futura que ese Stage pueda comprometer, incluida una sincronización de rondas.

Para A2 se incorpora además la aclaración de producción de `06 v2.5`: `IN` y Estilismo entrada tienen preferencia **temprana** para maximizar margen futuro. Los grupos IN conservan `target=3`, `maximum=3` y `minGap=30`, pero se construyen desde el primer inicio hard-válido hacia delante; la antigua preferencia “lo más tarde posible” queda sustituida.

## 9. Actualización v2.6 — unidades A2, orquestación de Stages y comidas globales

Se elevan como Fuentes vigentes `03 v3.4`, `05 v2.4`, `06 v2.4` y se mantienen `01 v5.2`, `02 v2.2`, `04 v2.4`, `07 v2.0`.

La selección automática del siguiente scope/Stage queda sometida a la misma autoridad de criticidad que la construcción interna: no puede recorrerse el catálogo de espacios por ID. El A2 define unidades operativas multi-espacio para Plató 14, Plató 15, Salas Totales y Reality; Reality A/B se coordinan como dos equipos elegibles y Reality C+EVA→Alfombra se protege antes de materializar su trabajo standalone. Cada Stage A2 aceptado debe conservar/certificar globalmente las comidas Sodexo pendientes.

## 10. Actualización v2.5 — orden parcial A2 y criticidad futura

Se elevan como Fuentes vigentes `03 v3.3`, `05 v2.3`, `06 v2.3` y `07 v2.0`.

La corrección material de A2 establece que Reality C + EVA → Alfombra es una secuencia de fases con continuidad REQUIRED pero **orden interno flexible**. El orden humano observado no es autoridad hard. La construcción del flujo principal debe preservar al menos un witness de toda unidad futura REQUIRED y priorizar dinámicamente participantes/unidades con baja holgura, sin convertir un umbral heurístico en regla hard universal.

## 11. Actualización v2.3 — contrato integral de configurabilidad

La Fuente 04 v2.3 consolida explícitamente el significado de “todo configurable”, la separación entre configuración operativa y parámetros técnicos, los niveles General → Snapshot del día → Override → Estado protegido, la arquitectura UX de Day Setup, el registro machine-readable de capabilities y el gate end-to-end obligatorio. No crea una Fuente nueva ni altera el canon A2; convierte en contrato explícito principios ya vigentes de 01, 03 y 04.
