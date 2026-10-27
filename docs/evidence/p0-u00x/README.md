# P0-U00x — Reality anclado e independiente en la misma jornada

Base exacta `cc0b674ebaadb8c41c5438302a62eb29de684833` (#1201, migración 118). Rama `codex/p0-u00x-compose-anchored-standalone-reality`. Un único PR contra main; sin merge ni despliegue. Sólo PostgreSQL 17, Auth, PostgREST y Chromium locales descartables.

La misma jornada puede declarar tres anclajes A/B y actividades Reality independientes mediante las autoridades U00w/U00v y su writer versionado. No se crea otro modelo de configuración. El [gate causal](authority-audit.md) precede al delta productivo: 422 original, tres controles sobre fuentes nativas, positivo conjunto en memoria y persistencia intacta.

El cambio de consumidor se limita a un evento temporal demostrado en B: conservar las alternativas derivadas de la apertura posterior del coach en las fronteras de carga existentes. SQL 119 compone las autoridades, reconstruye unidades, recursos, ocupación y transiciones internas `INCLUDED`. Los directos permanecen separados de la composición materializada. No cambian budgets, timeouts ni la configuración histórica.

`native-initial/`, `repeat-initial/` e `initial-determinism.json` acreditan las primeras dos bases: A 19/19 en S1; B S1 parcial de cuatro obligaciones y S2 20/20, witness completo sin aceptar el futuro, tres snapshots exactos y seis replays fríos. Los recibos adicionales de cierre, regresión y CI se registran en `validation.json`; el PR conserva su estado vigente.

Las fuentes, hashes, primera frontera, clasificación de rechazos y compatibilidad están en [authority-audit.md](authority-audit.md). El [inventario A2 desde UI](a2-ui-inventory.md) conserva las demás brechas. No se declara A2 íntegramente creado desde UI ni P0 general cerrado. El benchmark histórico se mantiene como regresión independiente.

Reproducción del gate productivo, con directorios nuevos y Node 20:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00x/run.ts /tmp/u00x-native --native
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00x/run.ts /tmp/u00x-repeat --native
node --import tsx docs/evidence/p0-u00x/verify.ts /tmp/u00x-native /tmp/u00x-repeat /tmp/u00x-determinism.json
node --import tsx docs/evidence/p0-u00x/upgrade119.ts /tmp/u00x-upgrade
node --import tsx docs/evidence/p0-u00x/run.ts /tmp/u00x-shared --native --shared-negative
```

La suite completa reutiliza el descubrimiento original, sin excluir archivos, con Node 22+ por el `Object.groupBy` de un benchmark preexistente: `node docs/evidence/p0-u00x/product-suite.mjs`. Todos los runners aíslan las variables de servicios reales. Los logs privados/JWT no se empaquetan.

Para repetir el diagnóstico anterior al delta, usar un archive de la base exacta y copiar el harness de `diagnostic/manifest.json.gz`. `geometry-probe.ts` exige los fragmentos previos literales y falla deliberadamente sobre el core ya reparado. No es un comando del gate final. La CI U00w repite su probe 422 histórico sobre cc0b674, conservando sus assertions originales; la CI U00x exige coexistencia productiva sobre el candidato actual.
