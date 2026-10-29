# P0-G03 — primera frontera de autoría A2 desde la aplicación

Base y `main` verificados: `92aa61272342b99795616ecb343161751d9d6c6f` (G02, #1218). Rama única `codex/p0-g03-a2-ui-first-frontier-audit`. Diagnóstico; ningún cambio de producto, fuente oficial, informe histórico, migración, presupuesto o algoritmo.

**Hallazgo:** el editor diario de fases REQUIRED se deshabilita cuando la jornada usa `flexible_meal_window`. Ése es el modo necesario para las 19 comidas individuales Sodexo A2. La primera condición causal está en `requiredPhaseCompositionSupported`: exige `input.mealMode === "global_hard_break"`. El contrato SQL efectivo conserva la misma exclusión. No es evidencia de inviabilidad física ni de agotamiento del buscador.

El recorrido usa Chromium real, Auth, PostgreSQL y PostgREST locales y el ledger íntegro 001–127. Todos los cambios de catálogo, plantillas, día, participantes y tareas proceden de controles nativos. APIs externas al navegador sólo leen; la consulta SQL del guard se ejecuta en transacción READ ONLY. No hay escrituras Supabase remotas ni despliegue.

- [Crosswalk de las 266 obligaciones](crosswalk-266.csv), [31 familias y seis dimensiones de capacidad](families-31.csv), [reconciliación semántica y límites](reconciliation.json).
- [Primera frontera, call path y contrafactual](causal-gate.md).
- [Comparación G01/G02/U02d y prioridades](composition-matrix.md).
- [Reproducción, intentos y validación](validation.md).
- [CI del baseline verificada](ci-baseline.json); la CI del PR se informa aparte.

El corte es incremental: 19 participantes; se intenta introducir primero Main/Vocal y Sodexo y después la fase A de Reality C+EVA. El rechazo al abrir el editor de fases detiene la autoría. Los datos creados son campos básicos de obligaciones canónicas, **no** una jornada A2 completa ni una certificación de sus restricciones. Transporte, Estilismo, Banda, anclajes, A/B, rutas diarias y demás estructuras siguen pendientes en esta jornada. No se solicitan propuestas ni se aceptan Stages después de la frontera HARD.

La Fuente 06 v2.10 gobierna la comparación. El join es `(código de participante, familia canónica)`: IDs nuevos obtenidos de respuestas reales, duraciones y disponibilidades canónicas; sin copiar IDs de fixtures, horas humanas, secuencia de placements ni planes importados. `complete_canonical_semantics` y `stage_sql_new_a2` permanecen sin certificar en todas las filas. La evidencia SQL histórica enlazada acredita exclusivamente sus contratos/topologías anteriores.

## Resultado local

19 participantes y **60 altas de campos básicos**: 19 Main, 8+11 Vocal, 19 Sodexo y tres Reality de fase A. El adapter parcial es SUPPORTED y contiene 19 comidas individuales. Los campos escalares cotejados coinciden; se conservan pendientes las demás autoridades, incluidas disponibilidades/agenda de Reality, rutas, Banda, transporte y la macro completa. No hay Stage S1+ ni certificación de A2 completo.

[Captura del primer HARD](native/first-hard-frontier.png), [contrafactual](native/counterfactuals.json), [rechazo SQL READ ONLY](native/sql-readonly-rejection.json), [resumen de validación](validation.json) y [vinculación de fuentes](source-binding.json). El checkout ejecutado no cambió durante la prueba. TypeScript, tipos del harness, build, ledger y 14 tests de composición pasan.

Los nombres `native/*.json` usados en el informe identifican entradas originales de [receipts.json.gz](native/receipts.json.gz), con [manifiesto de hashes](native/manifest.json). Los cuatro JSON causales pequeños también se incluyen sin comprimir. Para leer el input completo:

```sh
python3 -c 'import gzip,json; r=json.load(gzip.open("docs/evidence/p0-g03/native/receipts.json.gz")); print(json.dumps(r["engine-input.json"],indent=2))'
```
