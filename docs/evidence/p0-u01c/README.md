# P0-U01c — continuidad REQUIRED con recursos físicos cambiantes

Auditoría diagnóstica sobre `main @ 815dbc76cc1d7e52c3d298c9584cfcc82fff050b` (#1207 fusionado, checks remotos SUCCESS comprobados el 28/10/2026). **Cero cambios funcionales, migraciones, presupuestos, despliegues o merge.** Los únicos cambios son documentación y harness de Evidence.

**Comportamiento X: una unidad multifase físicamente realizable, sin recurso nominal común, no puede guardarse. Es causado por Y: `dailyTechnicalChainPolicySchema.requiredResourceIds.min(1)`, el selector común del editor y la exigencia universal de `validatePhasedMembers`, replicadas en SQL 122. Produce Z: las 17 obligaciones pueden llegar a Stage sin la unidad, pero sus ocho obligaciones estructurales no quedan certificadas como secuencia REQUIRED. El delta mínimo W debe permitir declarar explícitamente el conjunto común vacío para fases, conservar la adyacencia REQUIRED y certificar los requisitos efectivos de cada operación mediante las autoridades existentes. Esperamos demostrar M: las 17 obligaciones con fases, conjunta, competencia y pausa alcanzan S1/S2 SQL conservando el futuro y rechazando omisiones físicas, falsas permanencias e inviabilidad material.** W es recomendación para otra unidad; aquí no se implementa ni se afirma un Stage de esa extensión.

La hipótesis de dos responsabilidades se confirma en el límite productor. El consumidor interno ya representa `adjacency: REQUIRED`, `resourceContinuity: REQUIRED`, `requiredResourceIds: []`: no exige un recurso ficticio y mantiene íntegros los requisitos de las tareas. La copia en memoria alcanza un witness global válido, con certificado de cadena WITNESS y cero búsqueda adicional. La misma realización incumple correctamente una afirmación falsa de equipo común no vacío. No se retira `resourceContinuity`, ni se borran recursos físicos.

Se evaluó primero [A: componer autoridades existentes](alternatives-and-next-delta.md). Las autoridades físicas existentes bastan para consumir el caso; **sus contratos diarios actuales no bastan para autorarlo**. `operationContinuity` no admite este cruce multi-espacio/conjunta ni expresa fases; dividir cadenas se rechaza y las dependencias no aportan adyacencia. B no necesita una matriz nueva de recursos por fase: esa información ya está en las operaciones. Se recomienda exponer de forma explícita y acotada la separación que el contrato interno ya representa.

Los dos descartables finales obtienen **ocho Stages SQL**: cuatro con fases y recurso común, cuatro mixtos **sin autoridad de fases**. Obtienen **cero Stages multifase mixtos**, antes y después de esta auditoría. El control itinerante reducido también se rechaza por guard conservador de combinación, no por una demostración física. No certifica itinerancia general.

- [Perfil integrado y mapa de obligaciones](profile.md).
- [Primer rechazo y call path completo](causal-path.md).
- [Matriz antes/después](composition-matrix.md).
- [Alternativas, delta único y aceptación](alternatives-and-next-delta.md).
- [Comparación U01a/U01b, costes y límites](complexity-and-boundary.md).
- `native/receipts.json.gz` y `repeat/receipts.json.gz`: recibos públicos completos, con contrafactuales nombrados `*-memory-*`, y manifiestos separados; `verification.json`: comprobación independiente. `source-binding.json` fija lecturas normativas y código causal.

## Reproducción

Requiere dependencias existentes, Docker local y Chromium. Cada runner elimina las variables Supabase heredadas, levanta y elimina sus propios PostgreSQL 17/Auth/PostgREST, aplica literalmente 001–122 y sólo trabaja por loopback. No importa A2, no proporciona placements ni modifica funciones productivas. El archivo temporal sólo cambia dispatch y caché Vite en su copia descartable; el manifiesto conserva hashes.

```sh
npx --no-install tsc -p docs/evidence/p0-u01c/tsconfig.json
npx --no-install tsx --test --test-concurrency=1 server/requiredPhaseComposition.spec.ts server/technicalChainStructure.spec.ts server/technicalChainSql.spec.ts server/assistedScopeResolver.spec.ts engine/planner-next/technicalChains.spec.ts engine/planner-next/integration/nativeJointGroups.spec.ts engine/planner-next/integration/nativeOperationalMeals.spec.ts engine/planner-next/integration/effectiveTaskResourceAssignments.spec.ts
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01c/run.ts work/u01c-fresh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01c/run.ts work/u01c-fresh-repeat
python3 docs/evidence/p0-u01c/verify.py work/u01c-fresh/native work/u01c-fresh-repeat/native work/u01c-verification.json
```

Los artefactos guardados también se verifican directamente con `python3 docs/evidence/p0-u01c/verify.py docs/evidence/p0-u01c/native docs/evidence/p0-u01c/repeat work/u01c-offline.json`.

El harness verifica física, guardias, continuidad y certificados en memoria sin escribir esos contrafactuales a DB. Los únicos Stages que aplica corresponden a contratos productivos aceptados. No se vuelve a ejecutar A2 Full ni suite completa: no hay modificación material de runtime. La regresión histórica de U01b se referencia, no se presenta como ejecución nueva.
