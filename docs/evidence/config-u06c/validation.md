# Validación U06c

La base `49d826c9a5ecdd3e0488a64d2b6a05dd3aad98b5` se ejecutó de nuevo antes de la comparación. Node 24.19.0, mismo lockfile/runtime en base y candidatos; no se cambian dependencias ni presupuestos. Las dos capturas finales son secuenciales.

| Comprobación | Resultado |
|---|---|
| A2 Assisted offline | Base y dos candidatos: 266/266, 11 Stages, cero nuevas HARD/REQUIRED. |
| Determinismo | Igualdad profunda de ambos candidatos salvo `iterations[*].durationMs`; snapshots idénticos. |
| Certificados/futuro/protección | Revalidación independiente de los 22 certificados base/candidato, cierre futuro certificado y preservación de cada placement aceptado. Ledger de auditoría separado. |
| Contrafactual genérico | Original: `JOINT_STYLING_FEEDER_MATCHING`; candidato: posiciones 10, 40, 70, tres llegadas distintas y validación completa. El validador original también acepta esta alternativa liberada. |
| Semánticas | OFF penalty 0; PREFERRED gap 40 min × peso 2 = 80 puntos, sigue válido; REQUIRED rechaza esos huecos y construye un grupo continuo al ampliar las ventanas. Grupos distintos se intercalan; la exclusividad física se mantiene. |
| Autoridad/snapshots | Dos plantillas, persistir/reabrir, herencia independiente, precedencia explícita diaria, EDIT/RESTORE, fingerprint/replay e incompatibilidades. |
| PostgreSQL | RPCs reales PGlite y PostgreSQL nativo: CAS, una revisión por guardado atómico, FK y rollback de dependencias inversas, permisos, stale, restore y protección 088. |
| Integración nativa | Ledger completo, GoTrue, PostgREST, HTTP y Chromium con defaults restringidos: matriz de objetos/roles, JWT inválido y cambio/revocación de rol, editor general, nueva jornada con dos snapshots, edición diaria y restore. `remoteWrites=0`. |
| TypeScript/build | `npm run check`, build cliente/servidor y typechecks de harness de integración, atomic-template y Evidence: PASS. |
| Migraciones | Secuencia forward-only válida hasta 104. |
| Suite de producto | Mismo descubrimiento/exclusiones que `planner-engine-ci`: 3046 PASS; un proceso aborta en V8/WASM de Node 24 (`jit_page_->allocations_`), sin fallo de aserción. Sus cinco casos de `executionTimeCorrections.spec.ts` pasan al repetirlos aislados con el mismo runtime. No se modifica ese archivo ni sus asserts. |
| Gates focales finales | 289 casos finales de continuidad, ámbitos y adaptación/preflight; 78 de configuración/replay, además de SQL y siete casos de política genérica (incluido un ámbito parcial): PASS. |
| Importación/histórico | Gate `test:demo:a2-import`: el reparador histórico conserva su alcance hasta 099; el fixture instala 102–104 por separado antes de exigir los contratos actuales. Sin relajar la auditoría actual. |
| Browser y contratos UI | Editor real guardar/reabrir; herencia nueva; EDIT/RESTORE; permisos. Tests de configuración efectiva, secciones y workspace Assisted: PASS. |
| Higiene | `git diff --check`, sintaxis shell y JSON entregados: PASS. |

## A2 y coste observado

| Métrica | Base reproducida | Candidato |
|---|---:|---:|
| Obligaciones / Stages | 266 / 11 | 266 / 11 |
| Ramas | 27049 | 27049 |
| Permanencia agregada | 8465 min | 8465 min |
| Espera bruta IN → entrada | 810 min | 810 min |
| Espera salida → OUT | 150 min | 150 min |
| Huecos / duración compartida de Estilismo | 9 / 300 min | 9 / 300 min |
| Trabajo físico de Estilismo | 285 min | 285 min |
| Duración total observada | 69,204 s | 77,707 s; repetición 79,987 s |

El candidato conserva literalmente todos los snapshots y el fingerprint del A2. El tiempo observado aumenta 8,503/10,783 segundos respecto de una muestra base; se expone ese coste y no se afirma neutralidad de CPU. Ningún Stage amplía su presupuesto. La nueva capacidad se demuestra con el caso genérico; esta ejecución no mejora las métricas de calidad A2.

El [informe A2](a2-report.json) contiene detalle individual, primera posición construida y primer dominio local factible con las demás tareas finales fijas. Ese dominio no prueba la primera entrada globalmente alcanzable. La [integración nativa](native-integration.json) conserva los checks y hashes públicos, y el [contrafactual](generic-report.json) describe la diferencia causal.

## Pendientes

La CI alojada se consulta sobre el head del PR; estos resultados locales no la declaran verde de antemano. Permanece pendiente la autoridad general de Planner Next para jornadas ordinarias nuevas descrita en el README, reservada al siguiente P0 por #1176. El recorrido nativo de creación acredita snapshots de grupo; la planificación automática de ese día sigue bloqueada por esa dependencia previa.

No se han aplicado migraciones a Supabase conectado, publicado Replit ni hecho merge.
