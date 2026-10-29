# Reproducción y autoridad de la validación

Todos los stacks nativos son descartables y locales: PostgreSQL 17, Auth, PostgREST y Chromium. El runner elimina variables Supabase/DATABASE heredadas, crea identidades nuevas y conserva hashes del producto ejecutado. SQL diagnóstico usa `BEGIN READ ONLY`. No hay escrituras remotas.

```sh
npm run check
npm run check:migrations
npm run build
npx --no-install tsc -p docs/evidence/p0-g03c/tsconfig.json
node --import tsx docs/evidence/p0-g03c/run.ts work/g03c-native-a
node --import tsx docs/evidence/p0-g03c/run.ts work/g03c-native-b
for copy in a b; do
  node --import tsx docs/evidence/p0-g03c/probe.ts work/g03c-probe-$copy
  node --import tsx docs/evidence/p0-g03c/macroProbe.ts work/g03c-macro-$copy work/g03c-native-$copy/native
  node --import tsx docs/evidence/p0-g03c/macroProbe.ts work/g03c-unrestricted-$copy work/g03c-native-$copy/native --unrestricted-eva
  python3 docs/evidence/p0-g03c/verify.py work/g03c-probe-$copy work/g03c-probe-verification-$copy.json
  python3 docs/evidence/p0-g03c/verify.py work/g03c-macro-$copy work/g03c-macro-verification-$copy.json
done
python3 docs/evidence/p0-g03c/compare.py work/g03c-native-a/native work/g03c-native-b/native work/g03c-probe-a work/g03c-probe-b work/g03c-macro-a work/g03c-macro-b work/g03c-determinism.json
node --import tsx docs/evidence/p0-u00n/a2.ts work/g03c-a2-a
node --import tsx docs/evidence/p0-u00n/a2.ts work/g03c-a2-b
```

El [workflow diagnóstico](../../../.github/workflows/p0-g03c-joint-phases-meals-diagnostic.yml) reproduce los focales, las dos bases y los probes. Su nombre declara expresamente que no acredita Stage combinado. La CI del head del PR es una comprobación alojada separada de estos resultados locales.

| Comprobación | Autoridad / resultado |
| --- | --- |
| TypeScript app y harness | PASS local. |
| Build y secuencia de migraciones | PASS; ledger final 128, sin 129 ni cambio SQL. |
| Focales de composición, comidas, conjunta, rutas y Stage | 144 tests PASS, con IPC/HTTP local disponibles. |
| Perfil pequeño | Propuesta de ocho obligaciones/competidora de una, witness 15+3, 84 ramas; 12 ataques INVALID y continuación literal. Sólo memoria. |
| Macro sobre input UI real | Contrafactual conjunta + ventana EVA: witness 46+19, ocho obligaciones/siete operaciones, cero búsqueda en certificado. Sólo memoria. |
| Diferencia causal de disponibilidad | Sin ventana, el mismo perfil puede usar EVA a las 09:00; con ventana efectiva, sus cinco tareas empiezan a partir de las 16:00. La ventana no se introduce en la DB. |
| Nativo UI/SQL | Recibos y determinismo en `validation.json`/`determinism.json`; cero Stages de la intersección. |
| A2 importado, dos ejecuciones nuevas aisladas | Ambas 266/266, 11 Stages, 27.049 ramas; informe salvo duración, fingerprints y todos los snapshots idénticos; once certificados revalidados por ejecución. |
| G03b 60/60 y 15/15 | Recibos comprometidos de ambas bases anteriores revalidados con su verificador independiente; no son nuevas ejecuciones SQL G03c. |
| G02 rutas direccionales | Tests actuales PASS y comparación literal de sus dos recibos históricos. |
| G01/U02d | Comparación UI/API G01 y verificadores de ambas bases U02d sobre recibos históricos: PASS. No se cuentan como Stages nuevos. |
| Manifiesto SHA256SUMS oficial | FALLA ya en la base: enumera tres versiones retiradas (00 v2.14, 01 v5.3, 04 v2.8). Todos los archivos oficiales actuales son literalmente iguales a Git/base; hashes en `source-binding.json`. No se modifica el corpus ni su manifiesto en este diagnóstico. |
| Código y fuentes previas | Todo `engine/`, `server/`, `client/`, `shared/`, `script/`, `supabase/` y paquetes idéntico al baseline. Fuentes oficiales intactas. |
| Autenticidad SQL de la intersección nueva | NOT_REACHED; no se atribuye al guard un resultado de validación física. |

El resto del merge gate funcional de la combinación —propuestas persistidas, Draft, S1/S2 auténticos, ataques SQL materiales con hashes recalculados y continuación SQL— queda pendiente por la decisión de parada. No hay una afirmación de suite global completamente ejecutada a partir de los focales.

`attempts.json` separa errores del harness y permisos locales de los hallazgos productivos. Ningún intento fallido se cuenta como base fría PASS. Los recibos públicos se empaquetan con `pack.py`; Auth, JWT, contraseñas y logs privados quedan excluidos. Para inspeccionar un archivo original:

```sh
python3 -c 'import gzip,json; r=json.load(gzip.open("docs/evidence/p0-g03c/native/receipts.json.gz")); print(json.dumps(r["native-resource-authoring.json"],indent=2))'
```

Los probes son explícitamente diagnósticos: pueden construir autoridades en memoria, pero no tienen writer de producto ni acceso a una RPC de aceptación. El verificador independiente informa física para la entrada recibida; no autentica un Stage ni reemplaza el certificado existente.

La primera CI del PR detectó `spawnSync git ENOBUFS` al archivar más de 256 MiB de Evidence por stdout. El runner escribe el mismo `git archive HEAD` a un tar temporal propio y lo elimina tras extraerlo; no se amplía ningún límite del planificador. El cambio se verifica contra los hashes del producto y la CI repite las dos bases sobre el nuevo head.
