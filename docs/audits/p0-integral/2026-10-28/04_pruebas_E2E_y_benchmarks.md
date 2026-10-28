# INFORME 04 — Evidence, benchmarks y gates E2E del producto

> **Corte:** 2026-10-28. `main = 39e26f1c2e84cc8160c2066e197d61bc8b972384` (merge #1213). La rama U02c se excluye. **Tipo de comprobación de esta entrega:** inspección remota de fuentes/código y reconciliación de Evidence existente; no se ejecutó una jornada UI+Postgres/SQL propia en esta auditoría. No afirmar que se visitó Replit/Supabase real.

**Fuentes de autoridad:** [00](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [01](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [03](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.8.md), [04](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.9.md), [05](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/05_VALIDACION_CALIDAD_BENCHMARK_v2.8.md), [06](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.10.md), [07](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official) y [AGENTS.md](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/AGENTS.md). La Fuente 06 prevalece sobre errores de los PDF humanos. **Nota:** etiquetas `UI_PRESENT_UNVERIFIED` significan componente o Evidence previa localizado, NO prueba end-to-end universal.

## Baselines separados por autoridad de entrada y verdad SQL

| Caso | Entradas | Resultado validado anterior | Límite del resultado |
|---|---|---|---|
| A2 histórico | **Importadas/históricas**, no UI from scratch | **266/266**, **11 Stages SQL**, **27.049 ramas**; fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d` | Regresión de motor/histórico; NO E2E-1/E2E-2 nativo |
| U00a Main/Vocal | UI/API en día nuevo | 4/4 y 9/9, Stage real; U02b controles regresión | No incluye macro complex/transport/pausas A2 |
| U00f Transporte | UI/API | Stages en días nuevos con agrupación IN/OUT | No incluye simultáneamente fases REQUIRED/Main |
| U00g comidas | Día nuevo, UI/API | 6/6 (2 Stages), 12/12 (3) | Fuera del A2 integrado completo |
| U00w Reality anclado | Día nuevo/UI/API | 5/5 y 17/17 SQL | No cruza macro Main×fases |
| U00x Reality anclado y standalone | Día nuevo/UI/API | 19/19 y 20/20 SQL, S1/S2 | No cruza macro U02b |
| U00y Joint groups | Día nuevo/UI/API | 7/7 y 11/11 SQL | No se eleva a todas las estructuras A2 |
| U01f | Día nuevo, algunos datos por API | 17/17 SQL, macros fixed + joint + pausa | STANDALONE_ONLY, antes del cruce Main |
| U02a | Día nuevo, UI+API | **24/24 sólo en memoria**; HTTP/SQL 422 | NO Stage integrado: diagnóstico, no producto |
| U02b | Día nuevo, UI+API, nada de EngineInput o placement importado | **24/24**, **12 Stages SQL reales** en dos bases; S1 una task, S2 otras 23, 2 topologías | Fixed specific, transition 0; no A2 nuevo 266 |
| U02c | Rama Codex en curso | **NINGÚN resultado incorporado a este baseline** | Pendiente revisión solicitada por usuario |

Fuente: [`U02b/README.md`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u02b/README.md), [`validation.md`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u02b/validation.md), [`comparison-and-limits.md`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u02b/comparison-and-limits.md), `docs/evidence/p0-u00*/README.md` y Fuentes 04/05. Los Stages son SQL en Evidence previa; en esta auditoría no se reejecutaron.

## Benchmarks de rendimiento / regression accounting

**U02b equivalencia causal:** en perfiles equivalentes el contrafactual U02a en memoria daba 127/126 branches por S1/S2 y U02b alcanza esos mismos contadores tras liberar guards TS/SQL. Para un orden alternativo 160/159; la variante AB→AC consume 196/195 por tener **otro input** y no es regresión temporal válida comparar cifras sin igualar topología, presupuesto, recursos y configuración. Los contadores y fingerprints del verificador son autoridad; 12 SQL Stages sumados de 2 bases nativas no incluyen controles histórico/regresiones repetidas.

**A2 histórico** 266/266 / 27.049 ramas es benchmark de regresión. No asumir `ASST-010` verde: suite global reportada **3.305/3.306**, único fallo recurrente `NO_PROPOSAL/SEARCH_TIME_LIMIT_REACHED` ya en base anterior (353s). Un run con timeout significa `SEARCH_EXHAUSTED` salvo prueba sound de inviabilidad física. Fuente 03 establece propuesta objetivo ≤2 min y techo de Stage bloqueante 5 min. No escalar límites para mejorar métricas ficticias.

**CI:** #1213 pasó 44/44 checks reportados del PR; el `main` revisado tiene ejecuciones success recientes en varios jobs. No se hizo un CI nuevo ni test de build en esta auditoría, y esas cifras no sustituyen tests de producto. Migración 125 comprobada por U02b en dos stacks y upgrade 124→125; ledger 001–125 presente en `main`, no confirmado en la base real publicada.

## Matriz definitiva E2E-0…E2E-5

| Gate | Entrada exclusivamente de UI | Estado | Criterio de salida |
|---|---|---|---|
| **E2E-0** | Alta general/recursos/espacios/unidades/plantillas/día/tareas | **NOT_TESTED_COMPLETE** | Ningún campo obligatorio depende de JSON/API/DB manual; recarga, snapshot, RBAC, CAS |
| **E2E-1** | Jornada A2 configurada por la UI con IDs nuevos C01..C19 | **NOT_TESTED** | 266 obligaciones/31 familias, todas las relaciones correctas, `EngineInput`/preflight lossless |
| **E2E-2** | Exactamente el input salido de E2E-1, **sin placements históricos** | **NOT_TESTED** | 266/266 en propuestas/Drafts/Stages SQL, 0 violaciones HARD/REQUIRED nuevas, witness futuro, protección |
| **E2E-3** | E2E-1 con botón «Completar automáticamente» | **UI_PRESENT_UNVERIFIED** | Se encadenan y aceptan etapas seguras hasta 266 o diagnóstico correcto, sin prompts manuales por etapa |
| **E2E-4** | Dos jornadas nuevas no A2, distinta topología/recursos/participantes | **PARTIAL** | 100% de obligaciones factibles, sin hardcodes ni catálogo A2 |
| **E2E-5** | Imposibles/unsupported/exhausted + roles/CAS/rollback | **PARTIAL** | Fail closed con códigos correctos; histórico, `done/in_progress`, fingerprints intactos |

[CSV de gates y dependencias](M04_gates_E2E_0_a_5.csv)

## Procedimiento de prueba económico, no test redundante

1. **Autoría antes de motor:** en base descartable y navegador Chromium, crear todo desde una instalación nueva, no restaurar `script/demo`, importador A2 ni API de preparación; leer DB únicamente para comprobar, nunca escribir a mano. Guardar video/capturas de configuración, IDs, respuestas/revisiones, `sourceFingerprint`. Esta es una prueba de producto **diferente** de U02b que usó API en datos complejos.
2. **Representabilidad antes de búsqueda:** cotejar `M01` vs `EngineInput` por 266 IDs de obligaciones, `task family`, configuración efectiva y relaciones. No correr 266 Stages si no se puede configurar `coachRouteTransitions`, `byItem` u otro contrato.
3. **Construcción creciente SQL:** partir de día de 24 de U02b; incorporar Reality de U00x una vez U02c cerrado; luego transporte, comidas, Totales y P15 por **unidades estructurales enteras**. Cada gate comprueba S1 parcial, S2, ambos órdenes si materialmente diferentes, carga física SQL, recursos y source CAS. No llamar Stage a contrafactual en memoria.
4. **Full A2 Assisted:** únicamente cuando cada cruce relevante supera gate; no inyectar placements humanos y no usar un overlay de `EngineInput`. Cerrar S1...Sn con matching estable, cumplimiento y KPI. Registrar para cada Stage: código SHA, migraciones, inicio/fin, branches, backtracks, reason codes, primer dead-end y fingerprints.
5. **Autopilot E2E-3:** sobre **el mismo** día nuevo, comprobar control de consentimiento inicial, selección de unidades críticas, respuesta a NO_PROPOSAL, no progreso, cancelación entre etapas, permisos, pestaña abierta y preserved snapshot. No volver a construir su API.
6. **Negativos y generalidad:** dos topologías no A2 creadas por UI, día imposible con certificado/alerta, otro por contrato unsupported, otro timeout, modificaciones concurrentes y rewind. Nunca mostrar `READY` como sinónimo de físicamente viable.

## Escalera de certificación

```text
EDITOR_LOCALIZADO → ROUNDTRIP_UI → API_CON_AUTH → DAY_SNAPSHOT
  → ENGINEINPUT_LOSSLESS → PREFLIGHT_SUPPORTED → IN_MEMORY_WITNESS
  → SCOPE_PROPOSAL → DRAFT_REAL → STAGE_SQL_REAL
  → PROTECTED_CONTINUATION → NUEVA_TOPOLOGIA → E2E_0..5
```

Un nivel posterior nunca se infiere del anterior. Conservar *exact evidence filenames, migrations, SHA, branch budget y CI* en cada PR. Los fixtures de prueba no deben ser un nuevo mecanismo de configurar jornada para el usuario.

## Huecos de reproducibilidad explícitos

No se dispuso aquí de stack nuevo Auth/PostgREST/Chromium enlazado al repositorio, ni se ejecutó E2E fresh SQL. Tampoco se revisaron checks del futuro U02c ni el despliegue real; el usuario comunicará cierre del PR. La conclusión es **auditoría basada en evidencias previas + código remoto**, no ejecución independiente de todos los ensayos.