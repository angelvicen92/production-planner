# Validación del candidato

Base `78fc59b2e980ec3d86a27eaef95e5c77d3035f93`. Entorno cloud descartable, Node 24.19.0, dependencias del lockfile sin cambios.

| Gate | Resultado |
|---|---|
| Suite completa Planner Next: `node script/run-test-suite.mjs engine/planner-next` | 1269/1269 PASS, cero skips. |
| Diez tests focales nuevos, ejecutados también directamente con `node --import tsx engine/planner-next/earlyClosureMaterialization.spec.ts` | PASS: grupos múltiples, target residual, gap cero/no parrilla fija, protección, invisibilidad, geometría no soportada, márgenes/comidas, candidato REQUIRED inválido, presupuesto/timeout, validación proyectada, AUTO/SOFT, fallback integrado y caso #1164. |
| Cierre colectivo, transporte/configuración, replay, supporting repair y entrada | Siete archivos PASS. También incluidos en la suite completa. |
| Servicios Assisted: proposal, scope orchestrator/resolver, next scope, workflow, accepted baseline, snapshot y transporte | Ocho archivos PASS. |
| `npm run check` y typecheck del harness nuevo | PASS. |
| `npm run build` | PASS, cliente y servidor. Advertencias de Browserslist/tamaño de bundle existentes. |
| A2 baseline y dos candidatos; auditoría independiente de once certificados y validación manual final | PASS: 266/266, once Stages; comparación secuencial 84,365 s baseline y 98,937/92,329 s candidatos. S11: 0,150 → 3,815/3,619 s. Resultados y hashes en `report.json`. |
| Igualdad profunda entre candidatos salvo duración de Stage; snapshots exactos | PASS: verificada por `verify.ts`, excluyendo únicamente duración de Stage. S1–S10 y todas las obligaciones ajenas al cierre son literales. |
| `git diff --check`, sintaxis shell, JSON y hashes entregados | PASS. |

## Integración real descartable

Comando del recorrido representativo:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/early-closure-browsers \
node --import tsx script/demo/smokeA2Integration.ts \
  /tmp/early-closure-real-head --full --manual-validation --transport-policy
```

Se usan imágenes fijadas de PostgreSQL 17, GoTrue y PostgREST, el ledger nativo de migraciones sin modificar, Auth real, HTTP del producto y Chromium. El [informe público](integration.json) acredita 26 checks PASS, y [integration-source-binding.json](integration-source-binding.json) vincula los seis archivos runtime del delta al ensayo, sin modificaciones durante la ejecución. Se entrega separado de la Evidence offline. El ensayo comprueba los once ciclos UI → run → apply → validate → accept → SQL → reload; cobertura canónica 266/266; comidas/preparaciones; viewer independiente; rollback/redo; validación manual y autoridades de rol; configuración de transporte con límites/target independientes y rechazo de valores inválidos. Los contenedores y la red pertenecen al ensayo y se eliminan al terminar. `remoteWrites=0`.

Este resultado no acredita el Supabase conectado ni el runtime publicado de Replit. No se modifican datos productivos, SQL del repositorio, API, UI o fuentes normativas.

## Preparación y límites de ejecución

El entorno inicial tenía incompleta la instalación declarada (`@electric-sql/pglite` ausente). Se recuperó exactamente el lockfile con `npm ci --ignore-scripts --cache /tmp/early-closure-npm-cache`; manifests intactos. Un primer intento con la caché por defecto falló por permisos y se corrigió su ubicación. Runtime y lockfile del baseline y candidatos se comparan en el verificador.

Los primeros comandos de build/runner encontraron `EPERM` al abrir el IPC local de tsx; se repitieron con acceso de ejecución local habilitado y pasaron. Chromium se instaló en `/tmp` porque la caché de usuario no era escribible. Un arranque nativo inicial llegó a migraciones/Auth y falló por falta de navegador; se repitió después de instalarlo. Ninguno de esos intentos fallidos se presenta como gate aprobado.

Los tiempos de capturas realizadas durante la suite global/integración no se usan como prueba causal de aceleración. El coste de materialización se distingue de S1, cuyo código, decisiones y ramas no cambian. El informe conserva las duraciones de cada run, la sobrecarga de ramas y la repetición. No se aumentan presupuestos ni timeouts.

La CI alojada es una validación independiente y su estado debe consultarse en el PR; este documento no la declara verde de antemano. No se hace merge ni despliegue.
