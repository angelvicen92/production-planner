# P0-U00p — rondas diarias configurables hasta Stage real

Unidad sobre `main@2d95be9fd74fdf60433b1b71ad3704522d558eb4`. Cierra la ausencia de productor diario demostrada por U00o: los miembros se declaran **después** de crear tareas reales, desde Configuración del día, y llegan a revisión, EngineInput, Assisted, validación y Stage sin inyección de input/revisión ni SQL de configuración en los recorridos exitosos.

[Arquitectura y contrato](architecture.md) · [Before/after causal](causal-path.md) · [Resultados y comandos](validation.json) · [Autoridades](authorities.json).

## Dos jornadas productivas independientes

| Recorrido real | A | B |
| --- | --- | --- |
| Día creado en Chromium | 11/05/2027, plan 1 | 12/05/2027, plan 2 |
| Espacios / miembros / independiente inicial | 1–2 / 1–4 / 5 | 3–4 / 7–10 / 11 |
| Duración uniforme dentro de rondas | 20 min | 30 min |
| Preparación real en ambos espacios | 5 min | 5 min |
| Ronda 1, placements persistidos de ambos carriles | 08:45–09:05 | 09:00–09:30 |
| Ronda 2, placements persistidos de ambos carriles | 09:10–09:30 | 09:35–10:05 |
| S1 sincronizado aceptado | Stage 2, cuatro tareas con horario | Stage 8, cuatro tareas con horario |
| S2 completo aceptado | Stage 3, 5/5 | Stage 9, 5/5 |
| Ramas de la unidad sincronizada | 8 | 6 |

Todos esos IDs pertenecen exclusivamente a bases descartables. Los catálogos, espacios, plantillas, participantes y tareas de B son distintos. La quinta tarea inicial dura 35 minutos, ocupa el segundo espacio y **no** pertenece a las rondas. Los participantes y espacios tienen disponibilidades distintas. No se suministran horas al solver.

El S1 es un checkpoint completo de cinco obligaciones: cuatro tienen placement y la independiente permanece pendiente. S2 incorpora la independiente conservando literalmente las cuatro decisiones y ambas preparaciones. La sincronización se verifica por las filas de `daily_tasks`, no por detectar un campo JSON. Los fingerprints originales y replays se recomputan en el test frío.

Capturas: [A configuración](native/A-configuration.png), [A S1](native/A-S1.png), [A S2](native/A-S2.png), [B configuración](native/B-configuration.png), [B S1](native/B-S1.png), [B S2](native/B-S2.png).

## Continuación, protección y versiones

Se guardan, retiran y vuelven a guardar estructuras mediante operaciones autenticadas con CAS. Una carrera real de ADMIN/PRODUCTION deja exactamente un ganador; Producción también retira explícitamente la regla. Recargar muestra la autoridad persistida. La ausencia recupera el mismo EngineInput serializado anterior.

Los scopes iniciados desde un miembro o el primer espacio seleccionan los cuatro miembros. La independiente conserva witness futuro completo sin incorporarse a un carril. Además del replay analítico, A acepta realmente la independiente primero en una rama alternativa; modifica la preparación de las rondas aún pendientes a diez minutos y acepta su continuación sin mover aquella decisión. Las revisiones de los Stages S1/S2 anteriores permanecen intactas en el historial archivado.

A admite después una sexta obligación independiente mediante U00n, conservando la sesión. Se propone, valida y acepta; rollback a S0 conserva las seis obligaciones pendientes y redo recupera las decisiones exactas. En total se aceptan **siete Stages**, seis con rondas materializadas, por ejecución. Rollback/redo nunca revierte la configuración vigente ni atribuye una política nueva a un Stage anterior.

Cada revisión registra replay e identidad canónicos, autoridad realmente persistida y vínculo explícito con revisión previa de plan/sesión y Stage base. SQL rechaza cambios de preparación o retirada que contradigan rondas aceptadas; configurar después de S0 no exige reemplazar la sesión.

## Negativos y regresión

Los recibos incluyen cuarenta rechazos SQL/de certificado, más permisos y negativos HTTP: duplicados, desconocidos, otro día, espacio incorrecto, duración heterogénea, preparación inválida, rol, CAS, Draft sucio, propuesta pendiente, perfil 088/congelado, Stage histórico, ejecución y locks. Los ataques que recalculan hashes de resultado/snapshot tampoco autorizan omitir preparación, desplazar un carril ni falsificar política, identidad o replay. Un escritor real de tareas en otra conexión bloquea la operación atómicamente y devuelve `STALE_CONFIG_SOURCES`/409.

La preparación físicamente imposible de 240 minutos se guarda por la operación productiva y obtiene **NO_PROPOSAL** mediante Assisted real, sin agotar budget ni time limit. Corregirla permite continuar; su run anterior no puede aplicarse. No se etiqueta un truncamiento de búsqueda como inviabilidad.

Pasan 64 tests focales, TypeScript, build, la secuencia/hash de las 117 migraciones y los tests focales. La repetición completa usa otra base vacía; conserva placements e historial. Las políticas nuevas reciben UUID propios en cada jornada: no se falsea igualdad de fingerprints entre autoridades diferentes. El replay frío reconstruye identidad, replay y fingerprints de cada declaración exacta. El problema/solver mantiene su resultado al invertir las colecciones; sólo se excluyen siete campos CPU explícitos del witness futuro.

El A2 canónico se ejecuta en procesos Node 20 aislados para base, candidato y repetición: **266/266, 11 Stages, 27.049 ramas, 22 certificados revalidados**, snapshot/reporte material iguales y fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. [Recibo completo](a2/comparison.json).

La suite amplia original queda documentada con sus fallos reales y su reconciliación focal en `validation.json`: el benchmark histórico que usa `Object.groupBy` pasa en Node 24; el nuevo consumidor está registrado en el allowlist sin cambiar assertions; ASST-010 se compara separadamente con la base. La regresión nativa U00n pasa sus 118 comprobaciones. U00c y el gate real de permisos/catálogo también pasan tras conservar la captura literal S0 y registrar los cuerpos de 114; su verificador ahora exige el ledger completo por hash en ejecuciones nuevas y conserva la expectativa histórica para recibos archivados. Los replays U00o y legacy 088/102/104 permanecen protegidos por los tests existentes.

## Reproducción y recibos originales

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node --import tsx docs/evidence/p0-u00p/run.ts /tmp/u00p-fresh
python3 docs/evidence/p0-u00p/verify.py /tmp/u00p-fresh/native
node --import tsx docs/evidence/p0-u00p/replay.spec.ts
npx --no-install tsc -p docs/evidence/p0-u00p/tsconfig.json
python3 docs/evidence/p0-u00p/run-a2.py /tmp/u00p-a2-fresh --node /path/to/node20
```

Docker, dependencias del lockfile y Chromium son necesarios. Cada runner crea PostgreSQL 17, GoTrue, PostgREST y API locales y destruye sólo sus contenedores. El manifiesto identifica todas las fuentes ejecutadas y detecta cambios durante el run. Los probes SQL adversariales son transacciones revertidas separadas de las aceptaciones productivas. No se empaquetan logs privados, contraseñas, JWT ni dumps de entorno.

[native/receipts.json.gz](native/receipts.json.gz) y [native/repeat-receipts.json.gz](native/repeat-receipts.json.gz) contienen los JSON originales por nombre; los manifiestos y logs públicos comprimidos permiten revisar versión, alcance y resultado. El CI añadido vuelve a ejecutar los dos días nativos, los ataques, el verificador y el replay frío.

## Límites y riesgos verificables

Una estructura por jornada STANDALONE_ONLY; dos espacios físicos, al menos dos auxiliares con participante por carril, duración uniforme y preparación múltiplo de cinco. Duraciones mixtas, transporte/itinerancia, cadenas, setups, joint groups y otras combinaciones estructurales se muestran/rechazan como no soportadas. Una política que toca decisiones aceptadas queda congelada: no se promete editar parcialmente una ronda ya aceptada. No hay catálogo general, nuevo algoritmo, heurística, budget aumentado ni publicación/OfficialPlan.

El Stage y su configuración histórica se mantienen separados de la regla vigente. Los límites de búsqueda y el fallo histórico ASST-010 siguen visibles; el gate nativo de esta topología no declara cerrado todo P0 ni demuestra otras familias. Sin merge, despliegue Replit, migraciones productivas ni escrituras remotas de base de datos.
