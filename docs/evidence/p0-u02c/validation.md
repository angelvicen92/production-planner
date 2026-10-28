# Validación, reproducción y límites

Producto auditado: base exacta `39e26f1c2e84cc8160c2066e197d61bc8b972384`, Node v24.19.0, PostgreSQL 17 descartable, ledger completo 001–125, Auth/PostgREST reales y Chromium del sistema. Los runners eliminan variables Supabase heredadas y sólo conectan a loopback. La skill Supabase se aplica a esa revisión local; no se consulta ni modifica el proyecto remoto.

| Control ejecutado | Resultado |
| --- | --- |
| Cuatro días U02c UI/API por base, dos bases frías, dos topologías y ambos órdenes | PASS diagnóstico; todos conservan 24+3 y rechazo atómico real |
| Topología original, dos órdenes, seis scopes cada una | 27/27 y pausa; parcial 1→26 y anclaje+Vocal 4→23; cero Stages integrados |
| Variante AB→AC original, ambos órdenes | SEARCH_EXHAUSTED, 10.000 ramas; sin witness/propuesta/Stage original |
| Probe causal condicionado, ambos días AB→AC | Condición temprana agota; condición tardía: 26 pendientes, witness físico 27+pausa en 217 ramas |
| Verificador independiente | Por base: 12 witnesses originales +2 condicionados válidos; 18 falsificaciones rechazadas |
| Dos bases frías UI/API | 20 resultados de búsqueda comparados literalmente, misma física/witness/contadores; sólo S0, sin Stage integrado |
| Replays de memoria en procesos fríos | 20 comparaciones literales de propuestas, witness, certificados, fingerprints y contadores; 4 procesos |
| Probe SQL intacto read-only | Peers sincronizados: TASK_SCOPE_PHYSICAL_CONFLICT; omitir sólo un peer: consumidor acepta. No es Stage ni plan reducido válido |
| U02b nativo nuevo | PASS, 6 Stages SQL nuevos; verificador contra recibo histórico literal PASS (6 nuevos +6 históricos) |
| U00x nativo nuevo | PASS, 3 Stages SQL nuevos; comparación contra histórico y seis replays PASS (3 nuevos +3 históricos) |
| Nueve archivos focales de fuente | PASS, sin cambios productivos |
| TypeScript del harness y ledger | PASS |
| Suite global, A2 importado, build global, migración remota y publicación | No ejecutados; fuera del gate diagnóstico autorizado |

La repetición de memoria en procesos fríos se separa de las dos bases nuevas UI/API U02c. Ninguna acepta un Stage integrado; sólo existen sus S0 vacíos. Los recibos originales de U00x/U02b no se cuentan como nuevas ejecuciones. No se repite una suite global ni se eleva un timeout para obtener una etiqueta verde.

## Reproducción

Desde este checkout, dependencias existentes y Docker local disponible. Usar directorios nuevos. Los cambios del runner sólo afectan dispatch de Evidence y caché Vite de una copia descartable; cuerpos de producto y SQL permanecen idénticos a la base.

```sh
npx --no-install tsc -p docs/evidence/p0-u02c/tsconfig.json
node --import tsx --test --test-concurrency=1 engine/planner-next/integration/nativeAnchoredAccompaniment.spec.ts engine/planner-next/integration/nativeAnchoredChoice.spec.ts engine/planner-next/integration/nativeRealityComposition.spec.ts script/demo/a2Preflight.spec.ts script/demo/assistedSQLContracts.spec.ts server/fixedItinerantPhaseComposition.spec.ts server/requiredPhaseComposition.spec.ts server/technicalChainSql.spec.ts server/technicalChainStructure.spec.ts
npm run check:migrations
node --import tsx docs/evidence/p0-u02b/run.ts work/u02c-control-u02b
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00x/run.ts work/u02c-control-u00x --native
node --import tsx docs/evidence/p0-u02c/run.ts work/u02c-native
node --import tsx docs/evidence/p0-u02c/search-probe.ts work/u02c-native/native segmented-joint work/u02c-search
node --import tsx docs/evidence/p0-u02c/search-probe.ts work/u02c-native/native segmented-reverse work/u02c-search
```

Ejecutar los stacks **secuencialmente**: crear/eliminar redes Docker puede interrumpir Chromium de otro stack. `verify.py` admite el directorio de JSON vivos o `native/` comprimido de esta Evidence. Para incluir los witnesses condicionados en verificación de JSON vivos, copiar únicamente `*-search-probe.json` de la salida search al directorio nativo; no se escribe ningún dato de aplicación. Después:

```sh
python3 docs/evidence/p0-u02c/verify.py docs/evidence/p0-u02c/native /tmp/u02c-verification.json
node --import tsx docs/evidence/p0-u02c/replay.ts work/u02c-native/native integrated work/u02c-replay
# Repetir replay para reverse-order, segmented-joint y segmented-reverse.
python3 docs/evidence/p0-u02c/verify-replay.py work/u02c-native/native work/u02c-replay /tmp/u02c-determinism.json
```

`pack.py` documenta la selección explícita de recibos públicos. No archiva logs privados de App, JWT, contraseñas ni storage de navegador. Los manifiestos incluyen hashes y las modificaciones de dispatch/caché; `source-binding.json` contrasta los fuentes productivos ejecutados con la base entregada. Los módulos de replay/probe tienen sus propios hashes de cierre. La segunda base añade comprobación literal pre/post contrafactual y ejecuta todos los helpers de inspección en transacciones READ ONLY como service_role; también elimina un bloque negativo heredado e inalcanzable del harness. Los datos operativos y decisiones comparadas permanecen idénticos; no cambian fuentes de producto.

## Intentos conservados

- `attempt-1`: error del harness al leer `contestantId` en una respuesta de tarea con `contestant_id`; detenido antes de autoría estructural. Corregido sin cambiar producto.
- `attempt-2`: Chromium recibió ERR_NETWORK_CHANGED al crear redes de otros controles; página vacía y timeout original. No se eleva el límite.
- `attempt-3` (`u02c-native`): inspección de `joint_task_operations` pasó un array JS como JSONB sin serializar; PostgreSQL rechazó el argumento. Consulta read-only, sin mutación. Se corrige la serialización del harness.
- `attempt-4` (`u02c-native-2`): el editor había guardado el ámbito y el harness repitió el mismo PUT. El producto respondió correctamente 409 TASK_SCOPE_NO_CHANGES. La ejecución final usa el 200 auténtico del editor, sin PUT redundante.
- Control U00x inicial: faltaba el navegador descargado Playwright. Se seleccionó Chromium del sistema, como autoriza su runner. La repetición terminó completa.

Estos intentos están archivados por separado y no se cuentan como rechazos causales del solver ni como positivos.

## Limitaciones y complejidad

Cero funciones de runtime, tablas, migraciones, productores, editores, heurísticas o budgets nuevos. Sólo documentación y harness diagnóstico no importado por App. Su volumen se dedica a recibos reproducibles y verificación independiente, no a otra capa de planificación.

La combinación completa carece de revisión/Draft/Stage auténticos: pruebas de falsificación integrada, protección SQL conjunta y upgrade de esa futura implementación son NOT_TESTED. El probe SQL no elimina guards ni inserta fuentes falsas. El helper de scopes revela una incompatibilidad física posterior concreta; los demás consumidores conservan obligaciones de certificación enumeradas en `sql-frontier.md`.

La variante demuestra viabilidad condicionada y agotamiento original. No se afirma que otro orden global sea imposible ni que se haya probado una poda incorrecta. No se proponen semillas horarias ni una nueva heurística. Las fronteras any/A/B, transición positiva, membresía dinámica, rondas/setup/transporte, comidas individuales en el conjunto, rutas de coach y requiresBand continúan abiertas.

La siguiente implementación puede ampliar admisión y SQL en el positivo demostrado, manteniendo explícito el agotamiento de la segunda topología. No debe prometer resolver automáticamente cualquier variante factible basándose sólo en esos dos positivos.

El runner histórico U00x conserva literalmente su etiqueta `base=cc0b674…`. Esa etiqueta no identifica el código ejecutado aquí: `git archive HEAD` toma la base U02b autorizada y los **1.643 hashes de fuentes productivos** coinciden con ambas bases U02c y el control U02b. `source-binding.json` distingue `runnerBaseLabel` de `executedProductBase`; no se altera la etiqueta histórica para ocultar la diferencia.
