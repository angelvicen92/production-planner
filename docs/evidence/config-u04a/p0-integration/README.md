# Integración final U04a + U06c + P0-U00a — PR #1175

Base comparada: `7872b5817211dcddeafecf8c9e1a573cdf48a8bd` (#1178 integrado). Head U04a recibido: `33459de33aa0c54b0c29534132c94ee51784d238`. Se incorpora main en el mismo PR, sin añadir otra capacidad del planificador.

## Resultado comparado

Se usa Node 20.20.2, el mismo lockfile y PostgreSQL/Auth/PostgREST/Chromium descartables. La baseline se ejecuta en un checkout exacto de main. Los informes locales anteriores al commit identifican el HEAD de origen; el manifiesto de fuentes identifica el contenido integrado. Los artefactos de CI identifican el head publicado.

| Recorrido | Main | Integrado | Delta |
| --- | --- | --- | --- |
| Primera jornada UI P0 | 4/4, S1, 21 ramas | 4/4, S1, 21 ramas | Autoridad física vacía explícita |
| Segunda jornada UI P0 | 9/9, S1, 39 ramas | 9/9, S1, 39 ramas | Autoridad física vacía explícita |
| A2 desde S0 | 266/266, 11 Stages, 27.049 ramas | 266/266, 11 Stages, 27.049 ramas | Sólo duraciones locales |
| Composición física | U04a pendiente de integrar | Catálogo, mappings, alternativas, exclusividad, CAS, permisos y rollback PASS | Se conserva U04a y se compatibiliza el editor |
| Continuidad U06c | Activa | Herencia, EDIT/RESTORE, revisiones y protecciones PASS | Sin cambio de autoridad ni SQL |

[comparison.json](comparison.json) exige igualdad de los inputs P0 salvo las dos incorporaciones explícitas (`itinerantCompositionSnapshot` y disponibilidad vacía), de los problemas adaptados, todos los contadores de trabajo y los snapshots/fingerprints de Stage. Una composición vacía no impone tareas, recursos ni equipos ficticios y no bloquea la creación. El replay aceptado conserva a la vez la autoridad física vacía y las autoridades Next. `new-days/` guarda inputs, preflight, propuestas, Drafts, validaciones, Stages y revisiones.

A2 conserva el informe **completo** salvo duraciones, todos los snapshots y el runtime de main/candidato/repetición. Huella común: `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`; presencia agregada: 8.465 minutos. Se reutiliza intacto `config-u06c/verify.ts`: revalida 22 certificados, Future Feasibility, ocupaciones protegidas y cero HARD/REQUIRED nuevas. Los runs y snapshots íntegros están comprimidos junto al [informe](a2-report.json).

## Autoridades reconciliadas

1. `SupabaseStorage.createPlan` captura perfil Next y plantillas operativas como main, marca composición v1 y ejecuta `snapshot_plan_itinerant_units` después de clonar recursos físicos diarios. Conserva la compensación de creación ante errores. El perfil no sustituye a la composición.
2. `buildEngineInput` materializa roles/dependencias/coach, mantiene la autoridad histórica 088 exclusiva y aplica el mapping físico global→día por FK explícita. El mapping conserva los campos Next y los recursos independientes. Main-flow diario, rondas y continuidad siguen aplicándose al final.
3. El adapter incorpora miembros físicos y conserva recursos independientes al elegir alternativas; preflight comprueba referencias físicas. Búsqueda, dominios, matching, Future Feasibility, placement y validación no cambian.
4. La revisión efectiva incorpora la composición congelada, incluso vacía. Ese cambio de identidad de configuración es intencional: el replay debe identificar la autoridad nueva. El problema de planificación y el fingerprint de Stage P0 permanecen idénticos a main.
5. Configuración efectiva, schema, API y UI exponen ambos contratos. Se mantienen los editores generales, roles Next, selector de coach, alternativas y readiness productivo. No se restaura el readiness basado sólo en inventario.

## Conflicto semántico del editor

La unión textual compilaba, pero al editar **rol Next y alternativas itinerantes a la vez** el segundo `rulesJson` del PATCH usaba `editData.rulesJsonData`, anterior a la edición. El navegador obtiene PATCH 200 y después un rol ausente; falla el assert que esperaba `technical`. Se conserva el [contraejemplo](ui-save-counterexample.json).

El ajuste toma `editData.rulesJson`, el JSON editado, antes de incorporar `itinerantTeamAllowedIds`. El mismo ensayo pasa para alternativas A/B y equipo específico C, conservando ambas declaraciones. No cambian permisos, invariantes, budgets ni timeouts.

## Ledger y seguridad

104 continuidad y **105 P0** son idénticas a main. La antigua 105 de U04a pasa a **106 composición**, con bytes idénticos al head recibido. El registro SQL y el harness apuntan a ambos ordinales. El fixture de grants contiene su unión en el orden real de PostgreSQL; la comparación de cuerpos RPC sigue siendo estricta.

Los stacks nativos aplican el ledger completo hasta 106 y comparan la matriz efectiva de todas las tablas/funciones. Se mantienen RLS, denegación directa de clientes, CAS, rollback tardío, inmutabilidad, los 11 Stages históricos y otras 333 tareas. No se hace backfill de composición histórica ni se infieren mappings por coincidencia numérica.

## Auditoría Causal Integral — Fuente 07 §4.4

- **Estado recibido:** A2 conserva configuración, scopes y S0 exactos de main. P0 conserva perfiles, roles, dependencias, disponibilidades y coaches; sólo gana autoridad física vacía. U04a recibe composiciones explícitas con miembros compartidos.
- **Decisiones:** coinciden los once informes A2 completos, incluidos matching, reservas/witness, Future Feasibility, aceptación y protecciones. En P0 coinciden el problema y todos los contadores de trabajo; no se compara sólo completitud.
- **Criterio operativo:** A y C compartiendo CAM_A no pueden coincidir; A/B conserva una alternativa física válida. Una jornada sin equipo no debe inventarlo ni perder sus roles. Los ensayos comprueban ambas fronteras.
- **Primera decisión incorrecta:** el editor combinaba un rol nuevo con reglas persistidas anteriores, perdiendo la edición; el snapshot resultante carecería del rol exigido por preflight. La causa se localiza en `previousRules` del guardado de plantillas, no en el solver.
- **Delta respecto a main:** composición, mappings, autoridad de replay y controles U04a; se conservan continuidad y autoridades P0. Cambia la identidad explícita de configuración, no la arquitectura propuesta en los casos comparados.
- **Clasificación:** el fallo UI es una regresión de integración, no inviabilidad ni límite de búsqueda. No hay caída de completitud ni delta en severidad, ordering, dominios, matching o ramas. Las duraciones varían; no se declara mejora de CPU.
- **Experimento mínimo:** guardar rol más alternativas en una acción falla antes y pasa después; comparar main/candidato/repetición y ambos problemas P0 prueba neutralidad de horarios, fingerprints y trabajo. No se introduce otra hipótesis de búsqueda.

## Validación y límites

51 pruebas focales: PASS. TypeScript de producto y ambos harnesses, build, secuencia hasta 106 y contratos SQL: PASS. Composición nativa y continuidad: PASS. La CI completa del head se consulta en #1175. Los logs privados, contraseñas y traces quedan fuera del repositorio; `remoteWrites=0`.

Se preservan los límites existentes: P0 v1 exige principal real, preparación vocal y coach, y sigue sin soportar tareas consumidoras de unidades itinerantes dentro de ese perfil. U04a acredita la composición bajo sus autoridades explícitas; esta integración acredita también las jornadas P0 sin equipos. **No amplía el perfil genérico a todas las producciones itinerantes.** Siguen pendientes reconciliar altas tras S0, los editores estructurales diarios que P0 no ofrecía y la adopción histórica de composición. No se abre el JSON 088.

Reproducir desde la raíz, con Node 20, dependencias del lockfile, Docker y Chromium:

```sh
bash docs/evidence/config-u04a/p0-integration/reproduce.sh /tmp/u04a-p0-reproduction
```

No se publica Replit, no se aplican migraciones productivas, no se tocan A2 reales y no se hace merge.
