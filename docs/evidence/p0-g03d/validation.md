# Reproducción y límites

Entorno local: Node 24.19.0, PostgreSQL 17.11, Auth/PostgREST reales y Chromium. Los runners eliminan credenciales Supabase/DATABASE heredadas, usan exclusivamente 127.0.0.1, archivan/verifican el producto ejecutado y eliminan los contenedores propios. Ninguna migración remota, merge o publicación.

```sh
npm run check
npm run build
npm run check:migrations
npx --no-install tsc -p docs/evidence/p0-g03d/tsconfig.json
node --import tsx docs/evidence/p0-g03d/upgrade129.mts work/g03d-upgrade
node --import tsx docs/evidence/p0-g03d/failures.mts work/g03d-failures
node --import tsx docs/evidence/p0-g03d/oldWriter.mts work/g03d-old-writer
node --import tsx docs/evidence/p0-g03d/run.ts work/g03d-cold-a
node --import tsx docs/evidence/p0-g03d/run.ts work/g03d-cold-b
python3 docs/evidence/p0-g03d/verify.py work/g03d-cold-a/native work/g03d-verification-a.json
python3 docs/evidence/p0-g03d/verify.py work/g03d-cold-b/native work/g03d-verification-b.json
python3 docs/evidence/p0-g03d/compare.py work/g03d-cold-a/native work/g03d-cold-b/native work/g03d-determinism.json
for copy in a b; do
  node --import tsx docs/evidence/p0-g03d/macroProbe.ts work/g03d-macro-$copy work/g03d-cold-$copy/native
  node --import tsx docs/evidence/p0-g03d/macroProbe.ts work/g03d-unrestricted-$copy work/g03d-cold-$copy/native --unrestricted-eva
  python3 docs/evidence/p0-g03c/verify.py work/g03d-macro-$copy work/g03d-macro-verification-$copy.json
done
G03D_CONTROL=g03b-eva node --import tsx docs/evidence/p0-g03d/run.ts work/g03d-eva
G03D_CONTROL=g03b node --import tsx docs/evidence/p0-g03d/run.ts work/g03d-control-g03b
python3 docs/evidence/p0-g03b/verify.py work/g03d-control-g03b/native work/g03d-control-g03b.json
G03D_CONTROL=g02 node --import tsx docs/evidence/p0-g03d/run.ts work/g03d-control-g02
env -u DATABASE_URL node --import tsx docs/evidence/p0-u00n/a2.ts work/g03d-a2
```

Ejecutar los stacks en secuencia. Los focales exactos están en `checks/focal.log` y el [workflow](../../../.github/workflows/p0-g03d-resource-windows.yml). El gate local comprende 172 pruebas del contrato y 9 focales de rutas direccionales; no se denomina suite global completamente ejecutada.

Los macros son contrafactuales en memoria. La ventana positiva permanece auténtica; sólo se añade conjunta en memoria. El control retira esa ventana. Ninguno escribe Draft, proposal run o Stage SQL.

Los drivers `failures.mts` y `oldWriter.mts` instrumentan exclusivamente el smoke de pruebas y el dispatch local. El primero simula respuestas HTTP fallidas sin cambiar producto; el segundo omite 129 para comprobar el rechazo seguro del contrato anterior. Los manifiestos conservan los hashes del producto y del smoke ejecutado. Sus fixtures SQL negativos viven en transacciones revertidas.

Para leer un recibo público:

```sh
python3 -c 'import gzip,json; r=json.load(gzip.open("docs/evidence/p0-g03d/native/receipts.json.gz")); print(json.dumps(r["native-input.json"],indent=2))'
```

Los paquetes excluyen contraseñas, JWT y logs privados. `attempts.json` identifica errores de harness, diagnóstico de scope incompleto y el overlay de desarrollo, sin contarlos como inviabilidad ni como bases aprobadas. El origen 851ed6aa de las dos bases permanece en la historia; los follow-ups de tests no cambian el producto ejecutado.

Los controles históricos G01/U02d se identifican separadamente de una nueva ejecución SQL. El upgrade sobre datos poblados sí se ejecuta de nuevo y comprueba cuerpos SQL/ACL/RLS/lectores reales. El benchmark A2 importado es regresión, no autoría nativa de sus 266 obligaciones.

La primera CI del head 8750c80a pasa los tres jobs G03d. Los fallos de controles históricos y su clasificación están en `ci-first-pass.json`. El preflight identifica el writer 129 antes de comparar cuerpos exactos; los runners archivan a disco mediante `archiveEvidenceSource` (6.481 blobs exactos), y los probes horarios históricos envían revisión cuando la instalación tiene 129. No se relajan aserciones físicas ni guards.

`ci-followup.json` distingue los rechazos de fuentes capturadas de los ataques materiales posteriores, el fixture de ejecución que reutiliza identidad existente, dos variables de driver corregidas y el 55P03 de G01 anterior al solver. Los controles nuevos `legacy-u00n/` y `legacy-standalone/` pasan por UI/SQL real; U00n añade 118 aserciones independientes. No se usa el diagnóstico G03 histórico (barrera ya cerrada en 128) como gate del producto actual.
