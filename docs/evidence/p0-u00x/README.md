# P0-U00x — Reality anclado e independiente en la misma jornada

Base exacta `cc0b674ebaadb8c41c5438302a62eb29de684833` (#1201, migración 118). Rama `codex/p0-u00x-compose-anchored-standalone-reality`. Un único PR contra main; sin merge ni despliegue. Sólo PostgreSQL 17, Auth, PostgREST y Chromium locales descartables.

La misma jornada puede declarar tres anclajes A/B y actividades Reality independientes mediante las autoridades U00w/U00v y su writer versionado. No se crea otro modelo de configuración. El [gate causal](authority-audit.md) precede al delta productivo: 422 original, tres controles sobre fuentes nativas, positivo conjunto en memoria y persistencia intacta.

Los cambios de consumidor reparan fronteras demostradas en B: apertura posterior del coach, alineaciones a ambos lados de un Main protegido y conservación de su contrato en el gate HARD de continuación. Reutilizan geometría, matching y validación existentes. SQL 119 compone las autoridades, reconstruye unidades, recursos, ocupación y transiciones internas `INCLUDED`. Los directos permanecen separados de la composición materializada. No cambian budgets, timeouts ni la configuración histórica.

`native/` acredita A 19/19 en S1 y B con S1 parcial de cuatro obligaciones y S2 20/20, witness completo sin aceptar el futuro, ubicaciones virtuales distintas, traslado nominal de cinco minutos y kit físico compartido entre Main y Reality. `physical.json` reconstruye consumo y simultaneidad desde snapshots SQL aceptados. Los recibos de cierre, regresión, repetición y CI se registran en `validation.json`; el PR conserva su estado vigente. `native-initial/`, `repeat-initial/` e `initial-determinism.json` son las primeras certificaciones, con B de topología más simple; no sustituyen el cierre reforzado.

Las fuentes, hashes, primera frontera, clasificación de rechazos y compatibilidad están en [authority-audit.md](authority-audit.md). El [inventario A2 desde UI](a2-ui-inventory.md) conserva las demás brechas. No se declara A2 íntegramente creado desde UI ni P0 general cerrado. El benchmark histórico se mantiene como regresión independiente.

Reproducción del gate productivo, con directorios nuevos y Node 20:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00x/run.ts /tmp/u00x-native --native
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00x/run.ts /tmp/u00x-repeat --native
node --import tsx docs/evidence/p0-u00x/verify.ts /tmp/u00x-native /tmp/u00x-repeat /tmp/u00x-determinism.json
node --import tsx docs/evidence/p0-u00x/upgrade119.ts /tmp/u00x-upgrade
node --import tsx docs/evidence/p0-u00x/run.ts /tmp/u00x-shared --native --shared-negative
```

La suite de producto reproduce el alcance de CI/U00w: `node docs/evidence/p0-u00x/product-suite.mjs`, con sus dos exclusiones históricas y **cero exclusiones nuevas**. `--include-historical` prueba también esos casos y necesita Node 22+ por `Object.groupBy`; el intento adicional conserva el fallo ASST-010 previamente documentado, separado del A2 canónico. Todos los runners aíslan las variables de servicios reales. Los logs privados/JWT no se empaquetan.

Para repetir el diagnóstico anterior al delta, usar un archive de la base exacta y copiar el harness de `diagnostic/manifest.json.gz`. `geometry-probe.ts` exige los fragmentos previos literales y falla deliberadamente sobre el core ya reparado. No es un comando del gate final. La CI U00w repite su probe 422 histórico sobre cc0b674, conservando sus assertions originales; la CI U00x exige coexistencia productiva sobre el candidato actual.
