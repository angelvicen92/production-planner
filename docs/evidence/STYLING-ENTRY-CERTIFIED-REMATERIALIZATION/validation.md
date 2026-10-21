# Gate local del candidato

21 de octubre de 2026. Base `7620449e77f280f6fb2341376aa12653eaffdf16`.

| Validación | Resultado |
|---|---|
| Tests focales de desarrollo: nueva materialización, joint replay, supporting repair, Assisted e invariancia de historia | 52/52 PASS. |
| `node script/run-test-suite.mjs engine/planner-next` | 1259/1259 PASS, sin skips. |
| Tests seleccionados de servicios Assisted y nueva materialización final | 86/86 PASS, 6,21 s con las versiones fijadas. Incluye wiring AUTO/SOFT, propuesta, orquestación, scope, siguiente scope, workflow, baseline aceptado y snapshot. |
| `npm run check` | PASS. |
| `npx --no-install tsc -p docs/evidence/STYLING-ENTRY-CERTIFIED-REMATERIALIZATION/tsconfig.json` | PASS; incluye el harness nuevo y su spec. |
| `npm run build` | PASS, cliente y servidor; advertencias habituales de tamaño de bundle. |
| A2 completo baseline exacto y dos candidatos finales | 266/266, once Stages, cero HARD/REQUIRED, mismos budgets. Detalle, duraciones y fingerprints en `report.json`. |
| Verificador independiente de los once Stages, replay completo, cierre CERTIFY y validación manual del final | PASS. El coste del verificador offline se registra separado del ledger productivo. |
| Igualdad material profunda de los candidatos y todos los snapshots | PASS, excluyendo únicamente duración de cada Stage. |
| Caso causal #1164 desde S7 | PASS: C03 11:25 → 09:10, otras 265 obligaciones intactas, validación manual PASS. |
| `bash -n .../reproduce.sh`, JSON entregados, `git diff --check`, hashes | PASS. |

Comando de los 86 tests finales:

```sh
npx --no-install tsx --test \
  engine/planner-next/earlyEntryMaterialization.spec.ts \
  server/assistedProposalService.spec.ts \
  server/assistedScopeOrchestrator.spec.ts \
  server/assistedScopeResolver.spec.ts \
  server/assistedNextScope.spec.ts \
  server/assistedPlanningWorkflow.spec.ts \
  server/assistedAcceptedBaseline.spec.ts \
  server/assistedPlanningSnapshot.spec.ts
```

El entorno inicial carecía de `@electric-sql/pglite`, ya declarado/fijado en el repositorio. Su restauración local actualizó también `tsx`; se ejecutó después `npm ci --ignore-scripts` para recuperar exactamente el lockfile, sin cambiar manifests. Todos los runs finales de comparación usan las mismas versiones fijadas, registradas con hashes. Las capturas exploratorias anteriores a esa restauración no se usan como baseline de rendimiento. No se toman los primeros intentos fallidos de arranque/typecheck como gates aprobados.

Los scripts finales conservan las capturas crudas y hashes; la Evidence histórica #1164 no se sobrescribe. Los tests de motores legacy/ORC/V3/V4 no forman parte del gate proporcional porque sus implementaciones y autoridades no cambian. La CI alojada se verifica en el PR y no se confunde con estas pruebas locales.

No se ejecutó ensayo HTTP/browser/DB remota del candidato, ni migración, SQL productivo, publicación Replit o merge. La frontera offline está descrita en README.md.
