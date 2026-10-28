# Validación y reproducción

Todo el runtime SQL/Auth/PostgREST/Chromium es local descartable, con credenciales heredadas eliminadas por los runners. Ejecutar stacks en secuencia. Los archivos comprimidos contienen únicamente recibos públicos, con hashes por archivo y por fuente. Los logs privados no se publican.

```sh
npm run check
npm run check:migrations
npm run build
npx --no-install tsc -p docs/evidence/p0-u02d/tsconfig.json
node --import tsx --test server/composedAnchoredRequired.spec.ts server/fixedItinerantPhaseComposition.spec.ts server/requiredPhaseComposition.spec.ts
node --import tsx docs/evidence/p0-u02d/upgrade126.ts work/u02d-upgrade
node --import tsx docs/evidence/p0-u02d/run.ts work/u02d-a
node --import tsx docs/evidence/p0-u02d/run.ts work/u02d-b
python3 docs/evidence/p0-u02d/verify.py work/u02d-a/native work/u02d-verify-a.json
python3 docs/evidence/p0-u02d/verify.py work/u02d-b/native work/u02d-verify-b.json
python3 docs/evidence/p0-u02d/determinism.py work/u02d-a/native work/u02d-b/native work/u02d-determinism.json
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02d/baselines.ts p0-u02b work/u02d-u02b
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02d/baselines.ts p0-u00x work/u02d-u00x
node --import tsx docs/evidence/p0-u00n/a2.ts work/u02d-a2
```

La suite focal ampliada pasa 163 tests. Build, TypeScript y upgrade poblado pasan. El test de composición aplica los cinco projectors en los 120 órdenes, sobre las cuatro jornadas originales, conservando input inmutable y rechazo de contratos fuera de alcance.

Negativos SQL sobre run/autoridades reales recalculan hashes de resultado, witness, pausa y Draft antes de invocar consumidores físicos como service_role, con rollback. Separan física de autenticidad, versionado, CAS, permisos y protección. Incluyen peer asíncrono/unidad incompatible, terceros, anclaje separado, Main virtual, directo ausente, herencia indebida, miembros compartidos, indisponibilidad, pausa invadida, hueco REQUIRED y witness incompleto. Los ataques de aceptación reutilizan U02b; la continuación conserva literalmente el Stage previo.

El harness U02b sólo actualiza su comparación de catálogo para verificar los cuerpos actuales, manteniendo todos sus fixtures y assertions operativos. Los recibos históricos y Stages aceptados permanecen intactos. La CI del PR es autoridad del head remoto; se registra separada de las ejecuciones locales.

## Gates locales finales

| Gate | Resultado probado |
| --- | --- |
| G1 | Cinco autoridades en cuatro jornadas, ambos órdenes, CAS/permisos, revisión/replay y lectura efectiva READY |
| G2 | 27 obligaciones y pausa; S1 1/S2 26, alternativa 4/23; 16 Stages SQL en dos bases |
| G3 | 12 modos físicos con hash recalculado en ambos positivos por base; autenticidad/versionado/CAS/permisos separados; bloqueo de configuración protegida, inmutabilidad y rollback/redo |
| G4 | EngineInput, propuestas, witnesses, contadores, certificados, Drafts y filas Stage SQL literalmente iguales; fuentes de runtime idénticas y checkout vinculado por hash |
| U02c | Las cuatro propuestas, witnesses, contadores y certificados full coinciden con el control previo sobre la base exacta |
| U02b | 6 Stages nuevos frente a 6 históricos: comparación literal PASS; el verificador totaliza 12, no 12 nuevos |
| U00x | 3 Stages nuevos frente a 3 históricos, 6 replays fríos y física desde SQL PASS |
| A2 histórico | 266/266, 11 Stages, 27.049 ramas; informe salvo duración y todos los snapshots idénticos |
| Upgrade | 599 tareas, 11 Stages históricos, todas las filas/lectores/RLS y metadata de seguridad exactos |
| G5 local | TypeScript, tipos de harness, build, ledger y 163 tests relevantes PASS |

CI: workflow específico de U02d (dos bases frías, upgrade, negativos y verificación), más los gates existentes de regresión. Su estado vivo en el PR prevalece sobre recibos de heads anteriores. No se duplica Full A2 en cada corrección local; sólo se ejecutó una regresión histórica final. La limitación histórica ASST-010 de U02b no se oculta ni se altera su timeout; esta unidad no atribuye una suite global nueva completamente verde a los 163 tests focales.

Primeros fallos conservados: alias SQL ambiguo antes de autoría, ERR_NETWORK_CHANGED por stacks simultáneos, lecturas del harness de campos opcionales/ID bigint/conexión fría y selección del ejecutable Chromium del control antiguo. Se corrigieron en el mismo PR, sin otro cambio de solver. El 409 CI de U00s se conserva separado en `checks/ci-u00s-first-rejection.log`; se repitió exclusivamente su job. Ninguno de estos intentos se cuenta como Stage certificado.
