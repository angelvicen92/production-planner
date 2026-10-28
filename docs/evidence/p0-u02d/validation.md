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
node --import tsx docs/evidence/p0-u02d/baselines.ts p0-u02b work/u02d-u02b
node --import tsx docs/evidence/p0-u02d/baselines.ts p0-u00x work/u02d-u00x
node --import tsx docs/evidence/p0-u00n/a2.ts work/u02d-a2
```

La suite focal ampliada pasa 163 tests. Build, TypeScript y upgrade poblado pasan. El test de composición aplica los cinco projectors en los 120 órdenes, sobre las cuatro jornadas originales, conservando input inmutable y rechazo de contratos fuera de alcance.

Negativos SQL sobre run/autoridades reales recalculan hashes de resultado, witness, pausa y Draft antes de invocar consumidores físicos como service_role, con rollback. Separan física de autenticidad, versionado, CAS, permisos y protección. Incluyen peer asíncrono/unidad incompatible, terceros, anclaje separado, Main virtual, directo ausente, herencia indebida, miembros compartidos, indisponibilidad, pausa invadida, hueco REQUIRED y witness incompleto. Los ataques de aceptación reutilizan U02b; la continuación conserva literalmente el Stage previo.

El harness U02b sólo actualiza su comparación de catálogo para verificar los cuerpos actuales, manteniendo todos sus fixtures y assertions operativos. Los recibos históricos y Stages aceptados permanecen intactos. La CI del PR es autoridad del head remoto; se registra separada de las ejecuciones locales.
