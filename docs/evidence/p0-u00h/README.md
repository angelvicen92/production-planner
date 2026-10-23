# P0-U00h — recursos concretos requeridos

Base remota verificada: `5256102bf5c7eb925fd24ab1d868c2d22bc91a6e` (#1185). CI posterior al merge: 7/7 PASS antes del candidato. Una unidad, un PR; sin merge, despliegue, cambios de esquema, datos productivos ni demo.

## Causa reproducida — Fuente 07 §4.4

El comportamiento de admitir `byItem` y proponer tareas simultáneas con el mismo recurso lo causa la omisión de estos requisitos en `resolveEffectiveTaskResourceAssignments`; produce pérdida de una obligación física antes de `requiredResourceIds`. Resolver la identidad global contra el inventario diario dentro de esa autoridad debe producir tareas con el mismo ID diario concreto, horarios compatibles y persistencia íntegra hasta Stage.

El [recibo causal](causal/causal.json) procede de una jornada API nueva, dos participantes, cuatro actividades de 20 minutos, dos dependencias y cuatro espacios distintos. Cada plantilla declara únicamente `byItem`; no hay asignaciones a tarea/espacio/zona ni equipos itinerantes. Las identidades global y diaria son distintas. Se recorren catálogo → plantilla → snapshot → builder → preflight → asignación efectiva → adapter → problema → búsqueda → validación → propuesta Assisted. La base devuelve SUPPORTED, cero recursos canónicos requeridos y dos pares de operaciones simultáneas. No es falta de disponibilidad ni inviabilidad. El camino U00d sí materializaba byItem en consumidores itinerantes: esa evidencia no cubría las tareas ordinarias.

## Autoridad e intervención

`resolveConcreteTaskResourceRequirements`, en la autoridad de asignaciones efectiva existente, admite cantidad 1 y una única correspondencia `resourceItemId → planResourceItem.id`. Identidad ausente/ambigua o cantidad no representable dan diagnóstico explícito. La misma resolución sustituye el mapeo local anterior de U00d; no se añade un selector paralelo.

La unión determinista con recursos directos/declarados y heredados elimina duplicados. Preflight aplica la disponibilidad existente; adapter publica el consumo HARD y su carácter no sustituible. Presencia, transiciones, Future Feasibility, búsqueda y validación reciben las mismas identidades. Assisted proyecta los recursos concretos al snapshot de propuesta, Draft, Stage y filas diarias; las siguientes propuestas los conservan como trabajo protegido.

`byType`, `anyOf`, `requiresAuxiliar` y `requiresPresenter` siguen sin selección automática. Un recurso identificado como auxiliar se rechaza cuando falta el contrato de atención/capacidad compartida; no se inventa exclusividad universal. No cambian budgets, timeouts, algoritmos de búsqueda ni Fuentes normativas. Se corrigen las afirmaciones RES-01/RES-02 del catálogo descriptivo.

## Jornadas API reales

[Resumen nativo](native/summary.json): PostgreSQL 17, Auth, PostgREST, ledger completo y aplicación reales, exclusivamente en loopback. Ningún placement se fabrica ni se proporciona como seed.

- A: dos participantes, cuatro actividades con dependencias, cámara compartida, ventana 09:00–12:00, transición 5 minutos; 4/4 hasta S1.
- B: dos participantes, cuatro actividades de 15 minutos con dependencias, otro recurso, ventana 09:30–12:00; S1 de una operación y continuación protegida hasta S2, 4/4. El trabajo pendiente espera al recurso ocupado y conserva literalmente S1.
- Cada petición se repite antes de aplicar; snapshot, fingerprints y accounting son idénticos. Cada Stage conserva el ID diario en propuesta/Draft/Stage/daily_tasks; ejecución permanece pending. Una tercera jornada con el recurso no disponible da UNSUPPORTED/readiness no READY.
- Negativos SQL locales y revertidos: Draft/base/revisión obsoletos, llamada sin privilegios y cambio fuera del scope/protección con fingerprints de contenido recalculados. Los tests focales añaden identidad ausente, correspondencia nula/ambigua, cantidad, doble autoridad, ventanas/locks, consumo protegido, transiciones, presencia y selección genérica no soportada.

Los recibos JSON completos se conservan comprimidos, junto con integración y resumen legibles. Los logs privados y credenciales locales no se versionan. El runner injerta únicamente el dispatch en una copia Git descartable; el harness/demo original no se modifica.

## Reproducción y estado

Requiere Node 20, dependencias del lockfile, Docker local; Chromium para las regresiones UI. Usar directorios nuevos:

```sh
node --import tsx script/validation/runU00hResources.ts work/u00h-base --baseline
node --import tsx script/validation/runU00hResources.ts work/u00h-product
node node_modules/tsx/dist/cli.mjs --test engine/planner-next/integration/concreteResourceRequirements.spec.ts
node node_modules/typescript/bin/tsc -p script/validation/tsconfig.u00h.json
```

**Candidato en validación.** Suite global, regresiones U00a–U00g, A2 aislado y CI final deben completarse antes de declarar READY. Los resultados intermedios no cierran P0 general.
