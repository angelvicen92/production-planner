# U04a — compatibilidad con U06c, mismo PR #1175

Base comparada: `b9802860d8e48b26938e38f82648c328122efd26`. Head auditado inicial: `8e08d9e18c263c286b163b4e025e41f89aab3a20`. El merge local `5b62b5c` tiene ambos como padres; la corrección funcional está en `ba37e7f`. Los cambios posteriores instrumentan pruebas y documentan resultados. No se modifica búsqueda, geometría, políticas, presupuestos ni timeouts del planificador respecto de main.

## Fallos auditados

| Fallo | Diagnóstico y resolución |
| --- | --- |
| `planner-engine-ci`, aislamiento | El nuevo spec en `server/` importaba directamente cinco módulos de Planner Next y su fixture. Se mueve íntegro a `engine/planner-next/integration/itinerantComposition.spec.ts`, adaptando imports y el workflow. Conserva los ocho casos; no se amplía la allowlist ni se relaja la frontera. CI: 3.058 PASS, 0 FAIL, 1 SKIP histórico. |
| `template-creation`, espera HTTP | Regresión funcional de compatibilidad en el guard de UI: una plantilla heredada `any`, ID nulo y sin alternativas explícitas podía guardarse por API, pero el guard impedía editar sólo sus márgenes. Se reproduce el aviso «Selecciona al menos un equipo itinerante» con **cero solicitudes y cero respuestas**, no una respuesta HTTP lenta. Main y el candidato corregido envían PATCH y reciben 200 conservando el requisito anterior. Ahora el guard sólo exige alternativas al modificar los controles itinerantes. Se mantienen el preflight y las validaciones al crear/editar realmente el requisito. |
| `live-day-execution`, scroll | El artefacto original registra `{viewport:69,workspace:264}`; su captura sitúa el botón de actualización en el borde superior. Mi Día, Layout y sus consumidores no tienen cambios productivos respecto de main. La repetición con Node 20.20.2, Playwright 1.64.0 y Chromium 156.0.8078.4 pasa en main y candidato, con la misma aserción exacta `{0,0}`. La nueva CI Ubuntu también pasa y registra `{0,0}` después de actualizar. Treinta navegaciones y clics de prueba adicionales mantienen el assert; retrasar las fuentes y liberarlas justo después del reset tampoco reproduce el salto. No se ha demostrado el mecanismo exacto del salto original: no se atribuye a una regresión del producto ni se presenta una hipótesis como causa probada. Se conservan los asserts y se añade evidencia de geometría antes/después para diagnosticar una recurrencia. |

[Comparación HTTP](template-http-comparison.json), [scroll main](p4-main.json), [scroll candidato](p4-candidate.json) y [scroll en CI Ubuntu](p4-ci.json) y [diagnóstico y contrafactuales](scroll-comparison.json). El JSON de CI identifica Node y viewport tablet; los escenarios conservan también móvil 390×844, 266 identidades, filtros, permisos y errores.

La prueba visual usa HTTP interceptado y no acredita Auth/RLS nativos. Estos se acreditan separadamente en los ensayos descartables. Los fallos locales de carga con `ERR_NETWORK_CHANGED` coincidieron con creación/eliminación de redes Docker en otros ensayos; esas muestras no certifican el producto. Una repetición preliminar de main superó el PATCH investigado y falló posteriormente al recargar durante esa concurrencia; no se acredita como PASS. La repetición final completa de main y el candidato completo pasan sin creación concurrente de redes.

## Migraciones y garantías conservadas

- `104_operation_continuity.sql` permanece literalmente igual a main. La antigua `104_itinerant_physical_composition.sql` es ahora `105_itinerant_physical_composition.sql`, con contenido idéntico. Ledger secuencial hasta 105 verificado por el checker y por PostgreSQL real descartable.
- Los conflictos se resuelven por composición de autoridades: `buildEngineInput` aplica el mapping físico y conserva después `applyEffectiveOperationContinuity`; la configuración efectiva publica ambos contratos y la UI conserva ambos editores. El fixture de grants contiene ambas RPC, con ejecución únicamente de servicio.
- Las políticas y pruebas de continuidad de U06c permanecen intactas. Su ensayo real conserva guardar/reabrir, herencia, EDIT/RESTORE, conflictos de revisión, permisos, Draft/Stage, locks y autoridades históricas congeladas.
- Composición real con CAM_A/CAM_B/SON_1 y A/B/C, A+C compartiendo CAM_A, alternativas permitidas/prohibidas, exclusividad, ventanas y transición 0, CAS 200/409 y rollback tardío: PASS. Los mappings global→día siguen siendo explícitos y los snapshots no admiten mutación independiente.
- El catálogo histórico, la jornada de 266 tareas y sus 11 Stages, otras 333 tareas, locks y revisiones se preservan en los ensayos; las comprobaciones usan fingerprints antes/después, no sólo recuentos.

[Contratos y hashes actuales](contracts.json), [composición nativa](native-composition.json), [continuidad nativa](native-continuity.json), [plantillas nativas](native-template.json) y [plantillas en main](native-template-main.json). Los informes completos incluyen imágenes Docker fijadas, hashes de fuentes, ledger SQL y `remoteWrites:0`. Las credenciales se generan en localhost y no se versionan.

## A2 y determinismo

[Comparación completa](a2-comparison.json): main y candidato ejecutados con Node 20.20.2 y el mismo `npm ci` del lockfile. Ambos completan **266/266, 11 Stages, cero HARD y cero REQUIRED nuevas**, conservando placements protegidos. Coinciden los once fingerprints de Stage y **el informe íntegro al excluir únicamente duraciones**. El fingerprint final `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d` coincide además con el U04a original. Evidence íntegra comprimida y SHA-256: [main](a2-main.json.gz), [candidato](a2-candidate.json.gz).

Dos intentos preliminares pausados durante diagnóstico alcanzaron el límite existente de 300 segundos: son BLOCKED y no se contabilizan como PASS. Las ejecuciones finales empezaron desde cero, sin pausas ni cambios de presupuesto. Una suite global local inicial usó dependencias preinstaladas distintas del lockfile y se detuvo; la suite alojada con `npm ci` es la validación global autoritativa.

## Reproducción y P0

```sh
npm ci
npm run check:migrations
npm run check
npm run build
npx --no-install tsc -p script/demo/tsconfig.integration.json
node --import tsx --test engine/planner-next/integration/itinerantComposition.spec.ts engine/planner-next/planMainFlowAndFeeders.spec.ts server/operationContinuity.spec.ts server/operationContinuitySql.spec.ts
npm run demo:a2:smoke -- work/u04a-native --restricted-data-api --historical-topology --itinerant-composition --production-runtime
npm run demo:a2:smoke -- work/u06c-native --operation-continuity
# Para el harness de plantillas, preparar el worktree baseline 12a5d2d como en su workflow.
TEMPLATE_CREATION_BASELINE_ROOT=work/u02-baseline npm run demo:a2:smoke -- work/templates --historical-topology --template-creation
node client/src/components/my-day/p4.browser.mjs
```

P0 sigue reservado a las autoridades generales de Planner Next para jornadas ordinarias nuevas: clasificación, MainFlow, políticas de comidas y otras autoridades de configuración. El caso de composición con motor usa las autoridades no itinerantes sintéticas explícitas ya declaradas en U04a; no acredita un día nuevo genérico hasta Draft/Stage. No se añade un editor de composición de jornadas históricas ni se abre escritura a JSON protegido. La edición diaria y RESTORE de continuidad de U06c sí se conservan y prueban.

No se aplican migraciones productivas, no se publica Replit, no se abre otro PR y no se hace merge del PR. Los resultados alojados del head actual deben consultarse en #1175; los enlaces a ejecuciones previas identifican expresamente su head.
