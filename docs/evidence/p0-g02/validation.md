# Validación y reproducción G02

Runners locales descartables con PostgreSQL 17, Auth, PostgREST y Chromium. Se eliminan las credenciales Supabase heredadas; no se conectan servicios remotos. Ejecutar los stacks en secuencia. `run.ts` copia y vincula las fuentes reales por SHA-256, separa la caché de Vite y comprueba el delta del checkout. Los recibos de propuesta, witness, Draft y filas Stage se conservan antes de verificar; una conexión SQL nueva confirma la lectura fría.

```sh
npm run check
npm run check:migrations
npm run build
npx --no-install tsc -p docs/evidence/p0-g02/tsconfig.json
npx --no-install tsx --test engine/planner-next/resourceRouteTransitions.spec.ts engine/planner-next/coachRouteTransitions.spec.ts server/resourceRouteTransitions.spec.ts server/composedAnchoredRequired.spec.ts server/requiredPhaseComposition.spec.ts engine/planner-next/integration/concreteResourceRequirements.spec.ts server/effectivePlanConfigRevision.spec.ts
node --import tsx docs/evidence/p0-g02/run.ts work/g02-a
node --import tsx docs/evidence/p0-g02/run.ts work/g02-b
python3 docs/evidence/p0-g02/compare.py work/g02-a/native work/g02-b/native work/g02-determinism.json
node --import tsx docs/evidence/p0-g01/run.ts work/g02-control-g01
python3 docs/evidence/p0-u02d/verify.py work/g02-control-g01/native work/g02-control-u02d.json
python3 docs/evidence/p0-g01/compare.py work/g02-control-g01/native docs/evidence/p0-g01/api work/g02-control-g01.json
node --import tsx docs/evidence/p0-u00n/a2.ts work/g02-a2
```

Los negativos SQL físicos usan propuestas reales y recalculan hashes de resultado y witness dentro de transacciones que terminan con rollback. Autenticidad, permisos, revisión y protección se clasifican por separado. Los controles de G01/U02d no incorporan rutas, cambian fixtures ni aumentan budgets.

## Gates finales

| Gate | Resultado |
| --- | --- |
| TypeScript app / harness / integración, build y secuencia 127 | PASS |
| Focales finales de física, coach, replay y certificados | 41 PASS |
| Frontera de aislamiento revalidada | 22 PASS |
| Cuerpos SQL 127, drift y ACL de clientes/trigger | 9 PASS |
| UI: plantillas G01, días, alta/edición/eliminación/recarga de rutas | PASS |
| ADMIN y PRODUCTION; CAS, catálogo y permisos negativos | PASS |
| Dos bases frías, 4 + 6 obligaciones, S1/S2 reales | 8 Stages SQL nuevos; cero HARD/REQUIRED |
| Negativos por base, con hashes recalculados en ataques físicos | 29; autenticidad/versionado separados |
| Conexión SQL nueva y protección de decisiones | PASS |
| Determinismo de problema, propuesta, witness, contadores y SQL | Igualdad literal, sin remapear IDs |
| G01/U02d sin rutas | 8 Stages nuevos vs 8 históricos; 148 snapshots iguales |
| A2 histórico y SPEC10-019 | Informe/snapshots/proyecciones históricos exactos |
| Upgrade 126→127 poblado | 599 tareas y 11 Stages históricos exactos |
| Suite global inicial | 3.315/3.317; aislamiento corregido; ASST-010 falla igual en base limpia |

`first/`, `repeat/`, `control-g01/`, `upgrade/` y `a2/` contienen recibos públicos y hashes; no logs privados de aplicación ni credenciales. El comparador G01 totaliza 16 Stages al sumar ocho actuales y ocho históricos: no son 16 Stages nuevos. La regresión A2 es una regeneración aislada del benchmark, separada de los Stages SQL de las nuevas jornadas.

Las interrupciones y rechazos de desarrollo se conservan en `attempts.json`. El defecto de hash opcional se corrigió preservando la serialización histórica cuando no hay rutas; la prueba focal distingue ausencia/lista vacía de una regla explícita, y A2 compara el informe completo. No se modificaron canon, ordering, matching ni budgets para obtener estos resultados.

El guard estricto de Data API detectó los cuatro nuevos objetos y exigió declarar exactamente sus privilegios. El catálogo de cuerpos SQL se amplió para reconocer 127 y comprobar writer, lectores y validadores existentes. El trigger no tiene permiso de ejecución directa ni siquiera para service_role; no se amplió ninguna ACL para pasar el test.
