# INFORME 05 — Hoja de ruta maestra P0, dependencias y coste

> **Corte:** 2026-10-28. `main = 39e26f1c2e84cc8160c2066e197d61bc8b972384` (merge #1213). La rama U02c se excluye. **Tipo de comprobación de esta entrega:** inspección remota de fuentes/código y reconciliación de Evidence existente; no se ejecutó una jornada UI+Postgres/SQL propia en esta auditoría. No afirmar que se visitó Replit/Supabase real.

**Fuentes de autoridad:** [00](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [01](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [03](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.8.md), [04](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.9.md), [05](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/05_VALIDACION_CALIDAD_BENCHMARK_v2.8.md), [06](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.10.md), [07](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official) y [AGENTS.md](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/AGENTS.md). La Fuente 06 prevalece sobre errores de los PDF humanos. **Nota:** etiquetas `UI_PRESENT_UNVERIFIED` significan componente o Evidence previa localizado, NO prueba end-to-end universal.

## Criterio de prioridad / corte de riesgo

La planificación **asistida** segura y completa es el piso de producto de Fuentes 01/05; el objetivo ampliado de usuario incluye autocompletado de principio a fin, que debe evaluarse mediante E2E-3 y no justificarse con un botón. La hoja de ruta distingue:

- `MINIMO_A2`: poder **escribir** el contrato correcto desde UI, sin API/JSON manual.
- `ASSISTED_100`: poder **componerlo y resolverlo** mediante Stages SQL. La viabilidad de un contraejemplo humano se contrasta bajo reglas actualizadas sin copiar horarios.
- `AUTOMATIZACION`: reutilizar Autopilot/UI, completar 100% cuando el sistema produce propuestas legítimas.
- `PRODUCTO_PRODUCCION`: estabilidad, permisos, RLS, historial, documentación, generalidad.
- `P1_POSTERIOR`: capacidad>1, shared, bundles sin consumer confirmado u optimización avanzada **sólo con necesidad demostrada**.

Se prioriza por impacto UI/obligaciones, transversalidad, dependencia aguas abajo, integridad (si puede aceptar físicamente incorrecto, más cuidado) y coste total. **No se presupuestan créditos exactos de Codex ni tiempo sin baseline de consumo**: sólo costes ordinales `BAJO/MEDIO/ALTO`.

## Tabla de candidatos y relación de dependencias

| Unidad | Objetivo | Capa | Riesgo | Créditos relativos | Prerrequisitos |
|---|---|---|---|---|---|
| `U02c` | Reality anclado/standalone + Main×macro | EN_CURSO | ALTO | YA_EN_CURSO | — |
| `P0-G01` | Editor nativo de requisitos físicos en plantilla | MINIMO_A2 | MEDIO | MEDIO | U02c auditado; catálogo recursos y plantillas |
| `P0-G02` | Autoría nativa de rutas asimétricas coach | MINIMO_A2 | MEDIO | MEDIO | G01 opcional; R03/roles/snapshot |
| `P0-G03` | Autoría de 266 obligaciones sin scripts | MINIMO_A2 | MEDIO | BAJO_DIAGNOSTICO | G01,G02,U02c |
| `P0-G04` | Integración fases+Main+Reality A/B selectable transición positiva | ASSISTED_100 | ALTO | ALTO | U02c primero; G03 autoría preparada |
| `P0-G05` | Composición transporte IN/OUT con macro + Main | ASSISTED_100 | ALTO | MEDIO_ALTO | U02c, G04 según costes/criticidad |
| `P0-G06` | Comidas pendientes + pausas coach/plató integradas | ASSISTED_100 | ALTO | MEDIO | G05; G04 si recursos Reality |
| `P0-G07` | Rondas Totales+setup P15 en mismo día | ASSISTED_100 | ALTO | ALTO | G04,G06 (si se requiere) |
| `P0-G08` | Estilismo/Redes/P14 y cierre OUT | ASSISTED_100 | MEDIO | MEDIO | G05-G07 |
| `P0-G09` | Probar requiereBand vs recurso nominal | MINIMO_A2 | BAJO_MEDIO | BAJO | G01 |
| `P0-G10` | Mini-A2 integrado sin clon de A2 histórico | ASSISTED_100 | ALTO | MEDIO | G01-G09 según cruces |
| `P0-G11` | A2 nuevo completo Assisted 266/266 | ASSISTED_100 | ALTO | ALTO_EJECUCION | G03–G10 |
| `P0-G12` | Autopilot actual sobre mismo nuevo día | AUTOMATIZACION | MEDIO | MEDIO | G11 |
| `P0-G13` | Generalización y negativos E2E-4/5 | PRODUCTO_PRODUCCION | MEDIO | MEDIO | G11 y G12 |
| `P1-LATER` | Capacidad>1/shared, bundles y optimización avanzada | P1_POSTERIOR | ALTO | ALTO | E2E-4 con necesidad real |

[Descargar matriz maestra CSV](M05_hoja_ruta_maestra_15_unidades.csv). Hay **15** filas: U02c ya en curso, G01–G13 y P1 posterior. Cada fila contiene problema, Evidence, método W, ejecutor, dependencia, riesgo, coste, prueba SQL/UI y ganancia medible.

## Camino crítico / grafo topológico orientativo

```text
  U02c (EN CURSO, NO CONTAR NI MODIFICAR)
     │
     ├── G01 UI byItem / byType / anyOf  ─┐
     └── G02 UI rutas coach 30/0 ─────────┼── G03 E2E-0/1 266 UI
                                         └── G09 requiresBand (diagnóstico)
  U02c ─────── G04 Reality A/B + trans15 + macro ───┐
                 G05 transporte Main+macro ──────────┤
                 G06 comidas coach/Sodexo/unidades ──┤
                 G07 Totales + setup P15 ────────────┼── G10 Mini-A2 SQL ── G11 A2 266 Assisted
                 G08 Estilismo/P14/OUT ──────────────┘                         │
                                                                             G12 Auto UI
                                                                                 │
                                                                             G13 otros días/negativos

P1 shared/capacity>1/bundles: fuera del camino crítico hasta caso real demostrado.
```

**Advertencia:** la secuencia G04→G05→G06→G07→G08 es un ranking de valor y riesgo, no una promesa de que todas son incompatibilidades distintas. Primero ejecutar falsación mínima y, si varios cruces usan **el mismo guard defectuoso**, un solo delta causal deberá repararlos **sin combinar PR no relacionados**. Reordenar tras U02c y cada Stage real; los de autoría UI y motor pueden prepararse documentalmente en paralelo, pero no lanzar desarrollos duplicados.

## Especificaciones de las unidades (sin prompt)

### U02c — Reality anclado/standalone + Main×macro

- **X/Y (problema/causa o hipótesis):** Convivencia de tres estructuras, primer guard aún no integrado Evidencia: U00x + U02b por separado; 24+ y 20+ Stages.
- **W (delta mínimo o prueba):** NO intervenir; auditar cuando usuario avise del PR
- **Dependencias:** —. **Ejecutor:** Codex en curso. Riesgo ALTO, coste Codex relativo YA_EN_CURSO.
- **M (aceptación):** Gate 07 §4.4, diff completo, CI, SQL y negativos si procede. **Δ:** + cruce integrado, NO imputar aún.
- **Estado:** WORK_IN_PROGRESS_NO_MAIN; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G01 — Editor nativo de requisitos físicos en plantilla

- **X/Y (problema/causa o hipótesis):** byItem y nominal byType/anyOf son datos API, no UI universal Evidencia: U02b/ui-api.md y settings.tsx TaskTemplatesSettings preserving JSON.
- **W (delta mínimo o prueba):** Reutilizar schema y endpoint actuales; habilitar editor tipado por dimensiones admitidas, sin expandir solver
- **Dependencias:** U02c auditado; catálogo recursos y plantillas. **Ejecutor:** Codex (UI+form/contrato) o GitHub si muy localizado. Riesgo MEDIO, coste Codex relativo MEDIO.
- **M (aceptación):** Crear→editar→guardar→recargar→snapshot→EngineInput; byItem U02b SQL invariable, negativos, roles. **Δ:** + 3 subclases de requisitos con UI, sin prometer macro any.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G02 — Autoría nativa de rutas asimétricas coach

- **X/Y (problema/causa o hipótesis):** Caracola→Main 30 min existe consumidor histórico sin productor UI Evidencia: U02b matrix + server/planPlannerNextConfiguration.ts.
- **W (delta mínimo o prueba):** Verificar equivalencia de contrato actual y añadir productor UI/día/snapshot mínimo, sin heurística global
- **Dependencias:** G01 opcional; R03/roles/snapshot. **Ejecutor:** Codex (config+builder+tests). Riesgo MEDIO, coste Codex relativo MEDIO.
- **M (aceptación):** 30 Caracola→Main, 0 inversa; Stage real y replay; ausencia vs 0, seguridad. **Δ:** + coach route hard configurable.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G03 — Autoría de 266 obligaciones sin scripts

- **X/Y (problema/causa o hipótesis):** No hay nuevo día completo ingresado UI con todos los contratos Evidencia: Fuente 06 cuenta 266, U02b solo UI+API 24.
- **W (delta mínimo o prueba):** Solo E2E UI con checklist de la matriz; reparar primer campo faltante no duplicar importador
- **Dependencias:** G01,G02,U02c. **Ejecutor:** ChatGPT/Shell para auditoría; Codex solo déficit demostrado. Riesgo MEDIO, coste Codex relativo BAJO_DIAGNOSTICO.
- **M (aceptación):** E2E-0+1 UI real 19×266 y IDs nuevos; crosswalk 31 familias. **Δ:** + 266 obligaciones representables, no Stage aún.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G04 — Integración fases+Main+Reality A/B selectable transición positiva

- **X/Y (problema/causa o hipótesis):** Macro admite fixed/trans0; A/B requiere elegir y transición 15 Evidencia: U01f/U02b límites, U00w elección en aislado.
- **W (delta mínimo o prueba):** Contrafactual focal y exacto primer consumer; solo luego delta guard/materialización
- **Dependencias:** U02c primero; G03 autoría preparada. **Ejecutor:** Diagnóstico ChatGPT/Code; cambio Codex si causal. Riesgo ALTO, coste Codex relativo ALTO.
- **M (aceptación):** Dos equipos elegibles, transición15 y fixed C; SQL + cambio unidades y protección. **Δ:** + 2 cruc(es) críticos, sin hardcode A/B.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G05 — Composición transporte IN/OUT con macro + Main

- **X/Y (problema/causa o hipótesis):** Transporte SQL aislado; macro+Main con transport no Evidencia: U00f vs U02b matrix.
- **W (delta mínimo o prueba):** Causa primer rechazo; reutilizar grouping y witness existentes
- **Dependencias:** U02c, G04 según costes/criticidad. **Ejecutor:** Codex tras diagnóstico. Riesgo ALTO, coste Codex relativo MEDIO_ALTO.
- **M (aceptación):** Mini mixto IN/OUT grupos distintos, S1+S2 SQL, máx, mínimo, 30 separación. **Δ:** + transición transporte integrada.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G06 — Comidas pendientes + pausas coach/plató integradas

- **X/Y (problema/causa o hipótesis):** Sodexo witness global y 45/75 no combinados con macro/rounds Evidencia: U00g/U00z vs U02b.
- **W (delta mínimo o prueba):** Asegurar Future global todas comidas, separar 19 participant meals y operacional breaks
- **Dependencias:** G05; G04 si recursos Reality. **Ejecutor:** Codex diagnóstico+test local. Riesgo ALTO, coste Codex relativo MEDIO.
- **M (aceptación):** SQL etapa parcial preserva 19×40 witness, 2×45 y pausas 75 según día; negatives. **Δ:** + descanso sin Stage engañoso.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G07 — Rondas Totales+setup P15 en mismo día

- **X/Y (problema/causa o hipótesis):** Rondas y setups productivos aislados; guard y Future con macro Evidencia: U00e/U00p/r + U02b matrix.
- **W (delta mínimo o prueba):** Integración incremental una intersección por PR, priorizar Totales por presión
- **Dependencias:** G04,G06 (si se requiere). **Ejecutor:** Codex. Riesgo ALTO, coste Codex relativo ALTO.
- **M (aceptación):** 30min lanes, 5 cambio, pausa conjunta; CAM2 setup10; Stages SQL mixtos. **Δ:** + 2 unidades estructurales.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G08 — Estilismo/Redes/P14 y cierre OUT

- **X/Y (problema/causa o hipótesis):** Slots breves y ES/OUT tardíos pueden extinguir futuro Evidencia: Fuente 06 v2.8/v2.7 y Fuente 03 §6.
- **W (delta mínimo o prueba):** Ampliar jornada mixta y demostrar supporting virtual/pressure, no posiciones PDF
- **Dependencias:** G05-G07. **Ejecutor:** Codex únicamente defecto causal. Riesgo MEDIO, coste Codex relativo MEDIO.
- **M (aceptación):** P14 scope multi-espacio sin serializar, Redes no CAM1, ES/OUT=0. **Δ:** + pipeline de cierre.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G09 — Probar requiereBand vs recurso nominal

- **X/Y (problema/causa o hipótesis):** Atributo operativo no tipado, semántica no demostrada Evidencia: Fuente06 §0 y U02b matrix.
- **W (delta mínimo o prueba):** Primero determinar si recurso/role/nota actual expresa demanda; nuevo contrato solo si no
- **Dependencias:** G01. **Ejecutor:** ChatGPT/GitHub diagnóstico; Codex si falta. Riesgo BAJO_MEDIO, coste Codex relativo BAJO.
- **M (aceptación):** Tarea con banda no planificable sin recurso; sin banda libre; UI+Stage. **Δ:** + semántica faltante o cierre por equivalencia.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G10 — Mini-A2 integrado sin clon de A2 histórico

- **X/Y (problema/causa o hipótesis):** Faltan garantías de compatibilidad simultánea Evidencia: G01-G09, U02b 24.
- **W (delta mínimo o prueba):** Misma jornada aumentar 1 unidad operativa cada Stage SQL, 2 topologías no A2
- **Dependencias:** G01-G09 según cruces. **Ejecutor:** Shell/ChatGPT gates, Codex solo bug. Riesgo ALTO, coste Codex relativo MEDIO.
- **M (aceptación):** Jornada 50–100 obligaciones UI sin API, 100%, SQL, fingerprint. **Δ:** + cobertura conjunta creciente.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G11 — A2 nuevo completo Assisted 266/266

- **X/Y (problema/causa o hipótesis):** Solo 266 importadas, no nuevo input Evidencia: Fuente 05 ASSIST-0..9.
- **W (delta mínimo o prueba):** E2E-1 y E2E-2 sobre autoría UI; stages verdaderos, quality contra humano
- **Dependencias:** G03–G10. **Ejecutor:** ChatGPT/CI/SQL; Codex si primer defecto. Riesgo ALTO, coste Codex relativo ALTO_EJECUCION.
- **M (aceptación):** 266, 31 familias, sin copia horarios ni overlay; 0 hard/required, bloques/esperas/KPIs. **Δ:** + 266/266 native Stage.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G12 — Autopilot actual sobre mismo nuevo día

- **X/Y (problema/causa o hipótesis):** Botón y orquestador existen, no E2E-3 generic Evidencia: shared/assistedAutopilot.ts.
- **W (delta mínimo o prueba):** Reutilizar; verificar selección crítica de scopes, detenciones, idempotencia y no progreso
- **Dependencias:** G11. **Ejecutor:** Test UI+SQL, Codex solo si defect. Riesgo MEDIO, coste Codex relativo MEDIO.
- **M (aceptación):** Un botón, Stages persistidos hasta 266/266 sin aprobación humana por Stage, o bloqueo accionable. **Δ:** + flujo global real.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P0-G13 — Generalización y negativos E2E-4/5

- **X/Y (problema/causa o hipótesis):** Una topología A2 nunca prueba generalidad Evidencia: Fuente05 + mandato usuario.
- **W (delta mínimo o prueba):** Días muy distintos desde UI, imposibles/no representables/exhaustos, roles/CAS, rollback, replay
- **Dependencias:** G11 y G12. **Ejecutor:** ChatGPT tests; Codex incidencias. Riesgo MEDIO, coste Codex relativo MEDIO.
- **M (aceptación):** 2 días otras topologías 100%, imposibles detienen, CI/determinismo/regresiones. **Δ:** + generalidad demostrada.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

### P1-LATER — Capacidad>1/shared, bundles y optimización avanzada

- **X/Y (problema/causa o hipótesis):** Tipos existen pero no consumo productivo general; A2 normal necesita capacidad1 Evidencia: Catálogo RES03/04 y U02b matrix.
- **W (delta mínimo o prueba):** No ampliar si el A2 mínimo no depende; investigar necesidad real antes de tocar motor
- **Dependencias:** E2E-4 con necesidad real. **Ejecutor:** Codex solo necesidad futura. Riesgo ALTO, coste Codex relativo ALTO.
- **M (aceptación):** Caso de uso real y tests físicos; sin regresión A2. **Δ:** No bloquea P0 salvo evidencia.
- **Estado:** BACKLOG_SIN_PROMPT; sin branch/prompt nuevo autorizado por esta auditoría.

## Gate de aceptación para cada PR (Fuente 07 §4.4)

1. Congelar `main` y su benchmark al inicio; identificar función o autoridad del **primer** rechazo y qué decisión mata la alternativa física.
2. Formular `X ocurre por Y y pierde Z; W cambia esta decisión y la evidencia M será...`. Si no hay Y demostrable, **sólo diagnóstico/instrumentación**, no solución que introduce otra capa de matching.
3. Verificar general→UI (no solo API)→día→revisión→buildEngineInput→preflight→matching/Future→Draft→SQL Stage y relectura cold. Usar una jornada creciente y **otra topología** en cada cambio de intersección.
4. Negativos: no nueva violación HARD/REQUIRED, no falsificar unit membership, no perder manual decisions, no sobrescribir Stages, rollback/redo, roles/CAS, disponibilidad/descansos; no abrir tiempo o budget.
5. Repetir solo benchmarks afectados y regresión A2 histórica sobre candidato de merge proporcional; registrar **baseline y nuevo input idénticos** cuando se comparan ramas/tiempos. `ASST-010` histórico no se imputa sin reproducción causal.
6. Si no aumenta autoría/cobertura SQL o si dos iteraciones pasan tests pero no completitud, parar, simplificar y auditar de nuevo; no sumar algoritmos ni budgets a ciegas.

## Coste y créditos — cómo no malgastarlos

- **ChatGPT/GitHub/Shell:** mantener matrices, localizar controles y trazas, normalizar fuente, auditar PR, pruebas de field-by-field sin editar core y checks de códigos si basta revisión.
- **Codex:** sólo deltas con modificación multiarchivo de editores, snapshot+SQL/RLS, consumidores Planner/Assisted o refactors con tests edit-test. Para U02c usar hilo/PR ya iniciado.
- **Sin Codex:** cuando la Evidence que falta es una lectura del guard, un cotejo del catálogo o un chequeo de `EngineInput`/SQL read-only. Esto debe preceder siempre al prompt.
- **Decisiones reales de jefe de producción:** seleccionar qué comportamiento es `REQUIRED` vs `PREFERRED` cuando Fuentes sean auténticamente ambiguas, nunca preguntar por IDs/contratos ya presentes en la Fuente 06. No hay decisión humana imprescindible de contenido A2 identificada que bloquee esta auditoría; el alcance de “one-click aceptará Stages limpios” ya está implementado como delegación con consentimiento inicial, y sólo falta certificar alcance/resultado.

## Condición de terminado

**No cerramos P0** con 266 importados, `READY`, CI verde o 24/24. Cerramos sólo cuando un jefe, desde UI sin APIs, puede construir otra jornada con todas las reglas A2, obtener 266/266 en Stages SQL y verificar recursos, ventanas, fases, comidas, protecciones y decisiones bajo toda la cadena; luego automatizar esa secuencia sin falsear resultado, y demostrar generalidad en otros dos días y negativos.