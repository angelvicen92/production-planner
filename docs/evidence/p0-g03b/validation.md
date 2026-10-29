# Reproducción y gates del candidato

Todos los stacks son locales descartables: PostgreSQL 17.11, Auth real, PostgREST y Chromium. Los runners eliminan credenciales Supabase/DATABASE heredadas, fijan 127.0.0.1 y archivan/verifican las fuentes efectivamente ejecutadas. No escriben en Supabase remoto. Ejecutar los stacks en secuencia.

```sh
npm run check
npm run check:migrations
npm run build
npx --no-install tsc -p docs/evidence/p0-g03b/tsconfig.json
node --import tsx --test --test-concurrency=1 server/flexibleMealPhaseComposition.spec.ts server/requiredPhaseComposition.spec.ts server/fixedItinerantPhaseComposition.spec.ts server/composedAnchoredRequired.spec.ts server/technicalChainSql.spec.ts server/dayConfiguration.spec.ts server/apiAuthorization.spec.ts server/globalParticipantMealGate.spec.ts server/assistedProposalService.spec.ts engine/planner-next/participantMeals.spec.ts script/demo/assistedSQLContracts.spec.ts script/demo/a2Preflight.spec.ts
node --import tsx docs/evidence/p0-g03b/upgrade128.ts work/g03b-upgrade
node --import tsx docs/evidence/p0-g03b/run.ts work/g03b-a
node --import tsx docs/evidence/p0-g03b/run.ts work/g03b-b
python3 docs/evidence/p0-g03b/verify.py work/g03b-a/native work/g03b-verification-a.json
python3 docs/evidence/p0-g03b/verify.py work/g03b-b/native work/g03b-verification-b.json
python3 docs/evidence/p0-g03b/compare.py work/g03b-a/native work/g03b-b/native work/g03b-determinism.json
node --import tsx docs/evidence/p0-g01/run.ts work/g03b-control-g01
python3 docs/evidence/p0-u02d/verify.py work/g03b-control-g01/native work/g03b-control-u02d.json
python3 docs/evidence/p0-g01/compare.py work/g03b-control-g01/native docs/evidence/p0-g01/api work/g03b-control-g01-comparison.json
node --import tsx docs/evidence/p0-g02/run.ts work/g03b-control-g02
node --import tsx docs/evidence/p0-u00n/a2.ts work/g03b-a2
npm run benchmark:planner-next:participant-meals
```

Para comparar G02 con el baseline comprimido, extraer sólo `deterministic.json` desde `docs/evidence/p0-g02/first/receipts.json.gz` a un directorio temporal y pasarlo al comparador G02 junto al control nuevo. No regenerar ni modificar el baseline.

| Gate | Resultado local |
| --- | --- |
| TypeScript app y harness, build, ledger 128 | PASS |
| Focales de composición/comidas/propuesta/permisos/SQL | 97 PASS |
| Gate posterior de SQL 128, cadenas y core colectivo | 65 PASS |
| Aislamiento de Planner Next y nueva integración | 11 PASS tras añadir el test exacto al allowlist |
| Nuevo negativo colectivo con dominios individuales no vacíos | NO_PROPOSAL sin agotamiento; contrafactual válido |
| UI, contratos, CAS, revisión y fuentes de G03 | Input previo literalmente igual; sólo se añade la autoridad de fases |
| Dos bases frías, dos topologías por base | 8 Stages SQL nuevos, 0 HARD/REQUIRED nuevos |
| Comidas HARD futuras antes de S1 | 19 y 4 certificadas globalmente; ninguna aceptada prematuramente |
| Continuación protegida y conexión SQL nueva | Snapshots/placements exactos; rollback/redo exacto; EngineInput final SUPPORTED |
| Determinismo | Problemas adaptados, entradas, decisiones, fingerprints, certificados, ramas, Draft y SQL exactos |
| Negativos del witness | 96; físicos con hashes recalculados, separados de autenticidad/revisión/fuente |
| Ataques a aceptación | 32; CAS, base stale, fuente y Draft falsificado |
| Upgrade 127→128 poblado | 599 tareas y 11 Stages históricos; todas las filas/lectores/RLS y metadata de permisos exactos |
| G01/U02d | 8 Stages SQL nuevos frente a 8 históricos; 148 snapshots de plantilla literales y 26 plantillas UI verificadas |
| U02d AB→AC | SEARCH_EXHAUSTED a 10.000 en los dos órdenes, igual que el baseline; ningún Stage inventado |
| G02 | 4 Stages nuevos; problemas, propuestas, witness, contadores y snapshots literales frente a `first/` |
| A2 histórico importado | 266/266, 11 Stages, 27.049 ramas; informe salvo duración y snapshots completos iguales; certificados revalidados |
| Benchmark de comidas | 6 ejecuciones, ambos modos existentes, determinismo y entradas inmutables |

El comparador G01 informa 16 Stages al sumar ocho nuevos y ocho históricos: no son 16 nuevos. Los resultados de A2 importado son regresión aislada, no Stages de autoría nueva ni certificación de la macro completa.

La migración se generó con `supabase migration new` y se numeró 128 conforme al ledger `NNN` del repositorio. Sólo reemplaza cuerpos de dos validadores existentes mediante guards de predecesor; no crea objetos, grants o writers. El upgrade comprueba cuerpo real PostgreSQL, owner, ACL, SECURITY INVOKER, search_path, privilegios de clientes y RLS. No se aplica ninguna migración productiva.

La única modificación del runner histórico U02d cambia su expectativa de catálogo 127→128 y conserva la comparación estricta de cada cuerpo. Sus fixtures, peticiones, configuraciones físicas, contadores esperados y recibos históricos permanecen intactos. [Vinculación al código ejecutado](source-binding.json).

`attempts.json` distingue errores de harness/sintaxis, el rechazo SQL real por clasificar una comida virtual como transición productiva y la topología de ventanas tardías no resuelta. El benchmark legacy de cadenas requiere un JSON raíz no versionado y su invocación sin ese prerrequisito devolvió ENOENT; no se fabrica ese baseline ni se cuenta como benchmark pasado. Los focales de cadenas y el benchmark de comidas sí se ejecutaron.

La CI alojada del head del único PR es una comprobación separada y prevalece sobre recibos locales. El workflow G03b reproduce upgrade, dos bases, negativos y verificadores independientes; los workflows existentes conservan sus gates. No se aumenta ningún presupuesto o timeout del planificador. No se declara aquí una nueva suite global completamente verde a partir de los focales.

La primera CI detectó el nuevo spec de integración fuera del allowlist explícito de imports. `ci-followup.json` conserva los cuatro jobs afectados. Se autoriza sólo ese archivo de test y se incorpora el test de aislamiento al workflow G03b; no cambian puntos de entrada productivos, búsqueda, fuentes o recibos nativos. El gate focal de aislamiento pasa 11/11.
