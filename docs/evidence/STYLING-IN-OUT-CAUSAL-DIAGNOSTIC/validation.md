# Validación local

Base `75040e7dabdb77864e216d3b1163c2fb9f26509b`, 20 de octubre de 2026.

| Comprobación | Resultado |
|---|---|
| Benchmark A2 existente con captura / sin captura | PASS, ambos 266/266, S11; igualdad profunda excepto duración de cada Stage. |
| Flujo de `reproduce.sh`: capturas → análisis → focal → verificación → typecheck | PASS; mismos fingerprints y decisiones. Al revisar la ruta de salida se corrigió `verify.ts` para leer el informe en el destino solicitado y se repitió sólo esa verificación/typecheck sobre las mismas capturas. |
| Contrafactual entrada temprana | PASS, `validatePlan`, replay firmado, cierre futuro CERTIFY y validación manual de producto. |
| Contrafactual salida con OUT fijo | PASS, mismos cuatro gates; no reduce presencia. |
| Contrafactual salida + OUT tempranos | PASS, mismos cuatro gates; presencia agregada −160 min. |
| Reproducción focal de geometría seleccionada | PASS para spots anónimos con comida main seleccionada; no se confunde con el matching nominal posterior. |
| `npx --no-install tsc -p docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/tsconfig.json` | PASS. |
| `npm run check` | PASS. |
| Tests existentes `jointCompletionWitness.spec.ts`, `supportingGeometryRepair.spec.ts` | PASS, 2 archivos, 0 fallos. |
| `bash -n .../reproduce.sh`, JSON, links locales, hashes y `git diff --check` | PASS. |
| Comparación de 1466 rutas existentes contra la base | Sin cambios, incluidos manifests, código, SQL y benchmarks. |

El primer typecheck global detectó que faltaba localmente `@electric-sql/pglite`, ya declarado y fijado en el repositorio. Se instaló sin modificar `package.json` ni `package-lock.json`, con caché en `/tmp`, y el typecheck global pasó. La reproducción final registra versiones de Node, V8, tsx, TypeScript, esbuild y hash del lockfile en `verification.json`.

La prueba de neutralidad compara todo el resultado del harness existente, no sólo un fingerprint resumido: colocaciones, configuración, scopes, validaciones, ramas, prunes, continuaciones pendientes, witnesses y razones de terminación permanecen en la igualdad. No hay nuevas trazas ni hooks dentro de Planner/Assisted. Los scans contrafactuales son experimentos offline separados; no consumen ni cambian el ledger de los runs de control.

No se ejecutan DB remota, HTTP/UI, despliegue, merge ni suite global de motores. La CI alojada se consulta en el PR; este archivo acredita las comprobaciones locales y no declara verde una CI todavía pendiente.

La calidad global sigue sin clasificación Pareto: los KPIs incompletos y la discrepancia legacy de P09 se conservan explícitos en el informe. Los cambios de holgura local también se muestran; cero violaciones no implica ausencia de tradeoffs de robustez.
