# P0-U00h — recursos concretos requeridos

Base remota verificada: `5256102bf5c7eb925fd24ab1d868c2d22bc91a6e` (#1185). CI posterior al merge: 7/7 PASS antes del candidato. Una unidad, un PR; sin merge, despliegue, cambios de esquema, datos productivos ni demo.

## Causa reproducida — Fuente 07 §4.4

El comportamiento de admitir `byItem` y proponer tareas simultáneas con el mismo recurso lo causa la omisión de estos requisitos en `resolveEffectiveTaskResourceAssignments`; produce pérdida de una obligación física antes de `requiredResourceIds`. Resolver la identidad global contra el inventario diario dentro de esa autoridad debe producir tareas con el mismo ID diario concreto, horarios compatibles y persistencia íntegra hasta Stage.

El [recibo causal](causal/causal.json) procede de una jornada API nueva, dos participantes, cuatro actividades de 20 minutos, dos dependencias y cuatro espacios distintos. Cada plantilla declara únicamente `byItem`; no hay asignaciones a tarea/espacio/zona ni equipos itinerantes. Las identidades global y diaria son distintas. Se recorren catálogo → plantilla → snapshot → builder → preflight → asignación efectiva → adapter → problema → búsqueda → validación → propuesta Assisted. La base devuelve SUPPORTED, cero recursos canónicos requeridos y dos pares de operaciones simultáneas. No es falta de disponibilidad ni inviabilidad. El camino U00d sí materializaba byItem en consumidores itinerantes: esa evidencia no cubría las tareas ordinarias.

## Autoridad e intervención

`resolveConcreteTaskResourceRequirements`, utilidad pura de la capa de entrada compartida por la autoridad de asignaciones efectiva y U00d, admite cantidad 1 y una única correspondencia `resourceItemId → planResourceItem.id`. Identidad ausente/ambigua o cantidad no representable dan diagnóstico explícito. La misma resolución sustituye el mapeo local anterior de U00d; no se añade un selector paralelo.

La unión determinista con recursos directos/declarados y heredados elimina duplicados. Preflight aplica la disponibilidad existente; adapter publica el consumo HARD y su carácter no sustituible. Presencia, transiciones, Future Feasibility, búsqueda y validación reciben las mismas identidades. Assisted proyecta los recursos concretos al snapshot de propuesta, Draft, Stage y filas diarias; las siguientes propuestas los conservan como trabajo protegido.

La auditoría posterior conserva el test de aislamiento arquitectónico: la primera suite detectó una importación de Planner Next desde configuración itinerante. La resolución pura se extrajo a `engine/concreteTaskResourceRequirements.ts`, compartida por ambos consumidores; no se amplió el allowlist. Los 57 casos afectados y la suite completa posterior pasan. La proyección, los seis snapshots de regresión y el accounting permanecen idénticos. Un fallo UI intermedio `ERR_NETWORK_CHANGED` procedía de crear otro stack Docker en paralelo; los recorridos finales se ejecutaron en serie, sin cambiar assertions ni timeouts.

`byType`, `anyOf`, `requiresAuxiliar` y `requiresPresenter` siguen sin selección automática. Un recurso identificado como auxiliar se rechaza cuando falta el contrato de atención/capacidad compartida; no se inventa exclusividad universal. No cambian budgets, timeouts, algoritmos de búsqueda ni Fuentes normativas. Se corrigen las afirmaciones RES-01/RES-02 del catálogo descriptivo.

## Jornadas API reales

[Resumen nativo](native/summary.json): PostgreSQL 17, Auth, PostgREST, ledger completo y aplicación reales, exclusivamente en loopback. Ningún placement se fabrica ni se proporciona como seed.

- A: dos participantes, cuatro actividades con dependencias, cámara compartida, ventana 09:00–12:00, transición 5 minutos; 4/4 hasta S1.
- B: dos participantes, cuatro actividades de 15 minutos con dependencias, otro recurso, ventana 09:30–12:00; S1 de una operación y continuación protegida hasta S2, 4/4. El trabajo pendiente espera al recurso ocupado y conserva literalmente S1.
- Cada petición se repite antes de aplicar; snapshot, fingerprints y accounting son idénticos. Cada Stage conserva el ID diario en propuesta/Draft/Stage/daily_tasks; ejecución permanece pending. Una tercera jornada con el recurso no disponible da UNSUPPORTED/readiness no READY.
- Negativos SQL locales y revertidos: Draft/base/revisión obsoletos, llamada sin privilegios y cambio fuera del scope/protección con fingerprints de contenido recalculados. Los tests focales añaden identidad ausente, correspondencia nula/ambigua, cantidad, doble autoridad, ventanas/locks, consumo protegido, transiciones, presencia y selección genérica no soportada.

Los recibos JSON completos se conservan comprimidos, junto con integración y resumen legibles. Los logs privados y credenciales locales no se versionan. El runner injerta únicamente el dispatch en una copia Git descartable; el harness/demo original no se modifica.

La cámara global 2 corresponde al recurso diario 5: A queda 09:00–09:20, 09:25–09:45, 09:50–10:10 y 10:15–10:35. En B, el recurso global 3 corresponde al diario 9: S1 ocupa 09:30–09:45; la continuación empieza a las 09:50 y termina a las 10:45. No se deducen identidades por coincidencia numérica ni por etiquetas.

## Regresión y validación final

[Verificación reproducible](verification.json): **3.141/3.141 pruebas, cero fallos y omisiones**, conservando exactamente las dos exclusiones históricas del workflow (`runFullA2FirstExecutionBenchmark.spec.ts` y `runA2Assist7Evidence.spec.ts`). Las 15 pruebas nuevas cubren el recurso concreto; 57 focales revalidan la frontera corregida. TypeScript de aplicación/harness, build, secuencia y ejecución del ledger completo: PASS. Los logs finales están en `checks/`; las dependencias ausentes del entorno se prepararon con las versiones exactas del lockfile, sin modificarlo.

U00a–U00d conservan literalmente problemas, mapas, fingerprints y seis snapshots de Stage, además del historial/rebootstrap U00c. Los [recibos UI de CI](regressions/ci-native-provenance.json) pertenecen al head `0c6515c`; el checkout de merge `fcb58bd` tiene exactamente su mismo tree `7589b91`. Son ejecuciones reales del candidato corregido, no recibos históricos reetiquetados. Setup v2 añade dos recorridos UI completos; el replay de las mismas autoridades congeladas se compara exactamente entre base y candidato, sin renombrar IDs aleatorios. U00f completa 8/8 y 9/9, preserva seis placements y conserva replay frío/con certificado. U00g completa 6/6 y 12/12 en cinco Stages: todos sus snapshots/fingerprints coinciden literalmente con los integrados, con 19 adversarios SQL y tres ataques a protección.

A2 nuevo y aislado desde S0, en serie: **266/266, 11 Stages, 27.049 ramas y 8.465 minutos de presencia** en base, candidato y repetición. Fingerprint final `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. Todos los informes salvo `durationMs`, snapshots, certificados, scopes y accounting son idénticos. Tiempos medidos: 71.989 / 71.042 / 71.036 ms; no se atribuye mejora de rendimiento. [Fuentes exactas](a2/execution.json), series completas comprimidas y [22 certificados revalidados](a2/canonical-audit.json). La contabilidad de esa auditoría offline se separa de las ramas productivas. El verificador reutilizado conserva en `canonical-audit.original.json.gz` su etiqueta histórica constante; el informe entregado añade la base real de esta ejecución y conserva aquella etiqueta como `verifierOriginalBaseLabel`.

## Reproducción y estado

Requiere Node 20, dependencias del lockfile, Docker local; Chromium para las regresiones UI. Usar directorios nuevos:

```sh
node --import tsx script/validation/runU00hResources.ts work/u00h-base --baseline
node --import tsx script/validation/runU00hResources.ts work/u00h-product
node node_modules/tsx/dist/cli.mjs --test engine/planner-next/integration/concreteResourceRequirements.spec.ts
node node_modules/typescript/bin/tsc -p script/validation/tsconfig.u00h.json
python3 docs/evidence/p0-u00h/verify.py
```

Las regresiones reutilizan los runners intactos `smokeNewDayIntegration.ts` con `--post-bootstrap-additions`, `--standalone-only --post-bootstrap-additions`, `--itinerant-consumption`, `--setup-families` y `--transport`, y `runU00gFunctional.ts`. El A2 usa `STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts` en los archivos Git independientes de `a2/execution.json`, seguido de `config-u06c/verify.ts`. El workflow de U00h reproduce el caso rojo desde la base y ambas jornadas nativas del candidato; `verify.py` vuelve a comprobar offline los recibos versionados contra las fuentes actuales.

**Gates locales completos: PASS.** READY requiere además CI verde en el head final de [#1186](https://github.com/angelvicen92/production-planner/pull/1186); su metadata contiene el estado final en vivo. No cierra P0 general ni habilita selección genérica por tipo, alternativas, bundles o capacidad compartida de auxiliares. Sin merge ni despliegue.
