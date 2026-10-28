# P0-U02b — Main/Vocal y macro REQUIRED itinerante hasta Stage SQL

Base exacta `6e6901ad0c19cbee39fe32560d38b1d51f80df62`. Rama única `codex/p0-u02b-main-vocal-required-phase-stage`.

**Resultado productivo acotado:** la jornada original U02a de **24 obligaciones**, creada mediante UI/API reales, guarda y recarga Main/Vocal, unidad fija, conjunta, fases REQUIRED y pausa. S1 propone y acepta sólo una competidora; S2 propone las otras 23 y completa **24/24 en SQL**, conservando S1 literalmente. El witness global mantiene 24 tareas más la pausa, sin aceptar supporting automáticamente.

Dos bases frías independientes certifican los dos órdenes de autoría y otra topología con **AB→AC compartiendo A, conjunta con unidad B fija, distinta carga y coaches**: **12 Stages SQL nuevos**, propuestas/recursos/unidades/geometría/certificados/fingerprints/contadores/filas Stage idénticos. Se conservan 372 ataques SQL transaccionales, separados entre física, identidad, autenticidad, CAS y protección; los rechazos por hash/permisos no se cuentan como física. El supporting reparado pasa validación y SQL con propuesta/Draft intactos.

| Gate | Resultado |
| --- | --- |
| Jornada integrada, orden conjunta→fases | S1 1 + S2 23; 127/126 ramas |
| Orden fases→conjunta | S1 1 + S2 23; 160/159 ramas |
| Variante AB→AC y conjunta itinerante | S1 1 + S2 23; 196/195 ramas |
| Imposible integrado | NO_PROPOSAL; SEARCH_EXHAUSTED a 10.000, sin Stage nuevo |
| Imposible standalone U01f | Cota 55>40; NO_PROPOSAL sin agotamiento, 4.278 ramas |
| U00a, U01b, U01d, U01f y lineales | PASS; U00a 4/4 y 9/9; U01f 16 Stages SQL nuevos |
| Upgrade poblado 124→125 | PASS; 599 tareas, 11 Stages históricos, lectores, filas y metadata de seguridad intactos |
| A2 importado separado | 266/266, 11 Stages, 27.049 ramas y fingerprint histórico idéntico |
| TypeScript, build, ledger, focales y tipos del harness | PASS |
| Suite global | **3.305/3.306**; ASST-010 falla también en la base exacta, sin elevar timeout |

- [Causa y delta](cause-and-delta.md), [call path completo](causal-path.md).
- [Matriz P0 actualizada](composition-matrix.md), [perfiles](profiles.md), [UI frente a API](ui-api.md).
- [Stages SQL auténticos](sql-stages.md), [física y negativos](physical-negatives.md), [protección y continuación](protection-and-continuation.md).
- [Validación y reproducción](validation.md), [resultados](validation.json), [determinismo físico](verification.json), [fuentes ejecutadas](source-binding.json).
- [Comparación y límites](comparison-and-limits.md), [A2 importado separado](a2-imported.md), [intentos no contados como éxito](attempts.md).

125 es incremental; 001–124 y los Stages históricos permanecen intactos. Se reutilizan `joint_task_resources` 124 y todos los consumidores existentes. No cambia solver, matching, budgets, certificados ni writers. No se aplican migraciones a Supabase remoto, no se publica Replit y no se hace merge.

**A2 completo desde UI sigue pendiente.** La siguiente prioridad es ampliar causalmente la cobertura conjunta de configuración mínima desde la App, dentro de los límites explícitos; el benchmark histórico no sustituye ese objetivo.
