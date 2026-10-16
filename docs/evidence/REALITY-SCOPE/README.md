# Reality — agenda, ocupación y recursos efectivos

Implementación auditada desde `ff6e1fe`; contratos y lógica en `3ce4483`, recetas visuales explícitas en `7643592`. Las Fuentes oficiales 00 v2.13 y 06 v2.10 mantienen las 266 obligaciones y los PDFs originales.

## Modelo y comparación

| Dimensión | Antes | Candidato |
|---|---|---|
| Agenda principal | Equipo seleccionado perdido en la vista; agrupación dependía de su presencia y podía duplicar tarjetas | `agendaScope` explícito, una representación principal por obligación |
| A2 itinerante | Ubicación física confundida con agenda | 13 obligaciones Reality en unidad; anclas y Alfombra con EVA mantienen agenda física por receta |
| Ocupación | `blocksSpace` ya era autoridad correcta | Se conserva sin cambios: Corner exclusivo, acompañamientos virtuales no bloquean Estudio |
| Recursos | Unión incondicional directo + espacio + zona | `LOCATION` conserva la unión; `OPERATION_ONLY` mantiene directos/declaraciones/locks/equipo efectivo sin herencia de ubicación |
| Selección | Snapshot no proyectaba `itinerantTeamId` | Stage/Draft/Preview proyectan su selección; elegibilidad sin selección permanece pendiente |
| Cabeceras | Recursos de Reality aparecían por ubicación física | Se excluyen las operaciones de agenda itinerante; CAM1 ordinaria y notas UI-06 permanecen |
| Provenance | Composición aceptada podía confundirse con declaración | `declaredResourceIds` conserva autoría separada de miembros materializados y locks |

Los campos visuales no cambian selección de scope, capacidades, dependencias, duraciones, horas o prioridades. No se modifican ordering, poda, backtracking, heurísticas, budgets ni timeouts. El propietario visual se configura por receta; no se infiere por nombres, colores, prefijos, recursos ni presencia de equipo.

El [gate causal](CAUSAL-GATE.md) documenta la auditoría previa y la regresión encontrada/corregida durante la unidad: replay SQL S5→S6, 100.000 ramas agotadas por cambio accidental de provenance frente a PROPOSAL con 293 tras conservar las declaraciones originales. Ambas alternativas A/B se mantienen.

## Validación

- Suite productiva con discovery y las dos exclusiones diagnósticas históricas de CI: **2.943/2.943 PASS**, cero fallos/cancelaciones/skip.
- Pruebas focales de builder, adaptación, asignación, placement/domain, solape físico, EVA, recursos directos/locks, snapshots, proyección y recetas: PASS. La recarga de una composición aceptada mantiene la semántica para **ambas** elecciones A/B.
- `npm run check`, `npm run build`, `npm run check:migrations`, TypeScript de integración e integridad SHA256 de las Fuentes/PDFs: PASS.
- Benchmark SPEC10-016 regenerado dos veces con stdout/JSON/Markdown idénticos. El manifest incorpora la metadata visual declarada; su fingerprint se actualiza y el de expansión permanece `49267424f4275fd82d32896f7f2688033d82db80cf27eb0c2e1aa89ecc691017`. El primer CI detectó únicamente ese artefacto desactualizado, tras pasar tests y determinismo; se corrige sin cambiar código.
- UI-06 nativo (PostgreSQL/Auth/PostgREST/HTTP/Chromium descartables): PASS. Notas, CAS, polling, cuatro roles lectores, escritura sólo autorizada, RLS/RPC, Timeline/Lista/PDF, zoom X/Y, Ajustar, maximización y cabeceras alineadas. Cero escrituras operativas; 266 tareas y filas+xmin de 15 tablas preservados.

El ensayo completo nativo generó y aceptó **266/266 en 11 Stages**, ocho comidas operativas, 19 comidas de participante, una preparación técnica y 17 preparaciones de ronda; cero violaciones HARD/REQUIRED. Pasaron recarga, segundo navegador, rollback/redo, borrador manual/Undo/Redo/reset, siete combinaciones del workspace, dos órdenes focales repetidos, Autopilot con parada/recarga/reanudación y reinicio confirmado S0→266. El histórico descartable de 11 Stages/266 tareas y otras 333 tareas se conservó. Detalles medidos: [generación y controles](generation-controls.json), [workspace](day-workspace.json), [borrador](manual-snapshot-fidelity.json), [reinicio](restart.json), [notas UI-06](ui06-notes.json).

**Límite del ensayo:** su wrapper terminó FAIL únicamente al abrir la comparación visual con la base: el gateway local no admitía su origen CORS para el nuevo flag Reality. Se corrigió ese flag del harness. La repetición focal [SQL/Auth/HTTP/Chromium](visual-replay.json) terminó PASS sobre el checkpoint generado original, revalidado canónicamente, con fingerprint `4e1a8ddfc2f82af162a57a00a9eec3986cba9be3933a456da051c639dddae0f2`. No se vuelve a presentar ese replay visual como generación ni se cambia el FAIL original. Comprueba columnas DOM reales: 13 tarjetas únicas en su equipo seleccionado, anclas físicas, ubicación conservada, Timeline/Lista/densidad PDF/aceptado/maximizado, cero escrituras visuales y Stages idénticos incluyendo xmin. No hay interceptores de respuestas. La CI incorpora el recorrido completo con el flag corregido; su resultado remoto se informa en el PR.

Capturas de la misma solución generada: [base](reality-before.png), [Timeline](reality-after-timeline.png), [densidad PDF](reality-after-pdf.png), [Lista](reality-after-list.png), [maximizado](reality-after-maximized.png). La base muestra recursos de operaciones en sus columnas físicas; el candidato muestra las unidades y sus recursos efectivos. El PDF humano original conserva la referencia de agenda Reality, Ensayo físico y Alfombra con EVA física; sus horarios no son seed ni se exige igualdad de horarios calculados. Las capturas de densidad PDF prueban ese modo de Planning, no una nueva exportación PDF.

Reproducción del gate vigente, con servicios locales descartables y sin destinos remotos:

```sh
npx --no-install tsx script/demo/smokeA2Integration.ts work/reality-scope --historical-topology --full --day-workspace --stage-order --autopilot --reality-scope
```

Para comparar la base además, `REALITY_BASELINE_ROOT` puede apuntar a un checkout local de `ff6e1fe` con dependencias disponibles. El JSON público conserva hashes del runtime, contadores y resultados, sin logs privados ni credenciales. Node local 24.19; CI usa Node 20. No se prueba transporte Realtime/WebSocket ni publicación Replit.

## Compatibilidad y adopción

Omitir los campos conserva agenda física y herencia normal. No se reescriben snapshots, sesiones, Stages ni revisiones históricos. La jornada 27002 real permanece intacta y necesita [adopción controlada](ADOPTION.md) para obtener toda la semántica nueva; 088 impide actualizar su JSON congelado. El procedimiento disponible crea una jornada nueva validada y conserva la original. Un writer in-place autenticado/versionado no existe en esta unidad y no se sustituye por SQL ni desactivación de triggers.

No se han ejecutado escrituras en Supabase remoto, publicación Replit ni merge.
