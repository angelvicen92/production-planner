# OptiPlan — Auditoría integral P0 | Índice maestro

**Fecha:** 28/10/2026 · **main:** [`39e26f1c2e84cc8160c2066e197d61bc8b972384`](https://github.com/angelvicen92/production-planner/commit/39e26f1c2e84cc8160c2066e197d61bc8b972384) · **U02c:** EN CURSO / NO INTEGRADO · **Estado P0:** **NOT_DONE**, capacidades parciales y compuestas productivas bajo límites.

**Regla de interpretación:** cifras A2 (19 personas/266 obligaciones/31 familias) provienen de Fuente 06. Los PDF humanos son comparador de calidad, no seed, horario o contrafactual físico impuesto. **Auditoría documental+código remoto+Evidence preexistente, no replay E2E fresh ejecutado en esta entrega.**

## Informes narrativos

- [Informe 00 — Resumen ejecutivo y veredicto P0](00_resumen_ejecutivo_y_veredicto.md)
- [Informe 01 — A2 canon 266 obligaciones y reglas](01_inventario_canonico_266_y_reglas.md)
- [Informe 02 — Matriz E2E 70 requisitos UI/API/SQL](02_matriz_E2E_UI_API_SQL_por_requisito.md)
- [Informe 03 — Trazabilidad arquitectónica y gate causal](03_trazabilidad_arquitectura_gate_causal.md)
- [Informe 04 — Benchmarks y gates E2E-0 a E2E-5](04_pruebas_E2E_y_benchmarks.md)
- [Informe 05 — Roadmap P0, dependencias y coste](05_hoja_de_ruta_maestra_costes_dependencias.md)
- [Informe 06 — Siguiente PR recomendado, SIN prompt](06_siguiente_unidad_recomendada_sin_prompt.md)

## Matrices CSV (UTF-8 BOM, delimitador coma, listas compatibles Excel)

- [M01 — 266 obligaciones por participante/operación](M01_266_obligaciones_A2.csv); **266 filas**.
- [M01b — Cardinalidad exacta de las 31 familias](M01_cardinalidad_31_familias.csv); **31 filas**.
- [M02 — Configurabilidad y trazabilidad, 70 requisitos](M02_matriz_configurabilidad_70_requisitos.csv); **70 filas × 28 columnas**.
- [M03 — Compatibilidad y primera causa/primer gate, 21 intersecciones](M03_matriz_compatibilidad_21_intersecciones.csv); **21 filas**.
- [M04 — Gates definitivos E2E-0 a E2E-5](M04_gates_E2E_0_a_5.csv); **6 filas**.
- [M05 — Hoja de ruta maestra ordenada](M05_hoja_ruta_maestra_15_unidades.csv); **15 filas**: U02c, G01–G13 y P1. La etiqueta corresponde al número real de filas.

## Convenciones de verdad

- `PRODUCTIVE_COMPOSED`: contrato exacto certificado hasta Stage SQL en combinación señalada.
- `PRODUCTIVE_ISOLATED`: Stage SQL demostrado en un subconjunto, NO convivencia total.
- `API_ONLY`: origen existe por API, pero no editor UI demostrado; comprobar si se trata de contrato histórico.
- `UI_PRESENT_UNVERIFIED`: control localizado o Evidence puntual, no E2E íntegro.
- `UNSUPPORTED_EXPLICIT`: guard/rechazo documentado en alcance descrito, no prueba de imposibilidad material.
- `NOT_TESTED`: ninguna Evidence equivalente en esa intersección; no inferir defecto.
- `SEARCH_EXHAUSTED`: no se encontró solución en presupuesto; no demuestra inviabilidad.
- `IN_PROGRESS_NOT_MAIN`: U02c NO contabilizado. `MISSING_UI`/`MISSING_CONTRACT`/`CONSUMER_DEFECT` sólo cuando se localiza frontera concreta y requiere falsación.

## Decisiones congeladas

1. No prompt Codex nuevo ni cambio de rama; U02c seguirá sin interferencia.
2. No cambios ni consultas mutadoras a Supabase/Replit; ningún deployment autorizado.
3. No más complejidad del motor antes de primer rechazo físico/código y Gate 07.
4. No declarar E2E-0/1/2/3 DONE por resultado importado 266 o 24 API+UI.

## Verificación interna de artefactos

La generación valida 266 obligaciones/31 familias/19 participantes contra el conteo Fuente 06, 70 requisitos, 21 intersecciones, 6 gates y 15 unidades. Los archivos se han generado localmente como informes (no editados en GitHub). [Fuentes](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official) y [Evidence vigente](https://github.com/angelvicen92/production-planner/tree/main/docs/evidence) conservan autoridad del repositorio; este bundle es diagnóstico, no Fuente 08.