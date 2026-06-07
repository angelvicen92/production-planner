# ENGINE V3 RESOURCE BUNDLE SCORING — ID 019

## Qué cambia

Los resource bundles pasan de persistencia y diagnóstico potencial a una señal soft auditable del Motor V3. El input acepta opcionalmente bundles, componentes y afinidades. El backend los lee desde las tablas de ID 018 usando el patrón administrativo existente y los conecta con el inventario del plan mediante `resource_item_id`.

El scoring calcula `bundleCoherencePenalty` a partir de tres señales:

1. uso parcial de componentes requeridos;
2. cambios de firma de bundle entre tareas consecutivas del mismo espacio;
3. afinidad positiva o mismatch entre bundle y espacio.

La comparación es lexicográfica. La señal de bundles se evalúa después de hard violations, tareas planificadas, ventanas, huecos de Main Stage, prioridad de talent, feeders y continuidad de coach; por tanto, no puede rescatar un candidato peor en esos criterios críticos. El desempate final continúa siendo determinista.

## Qué NO cambia

- Los bundles no son hard constraints.
- Los bundles no son obligatorios para tareas ni planes.
- No sustituyen `resources`, `resource_items`, snapshots, pools o availability.
- No afectan a planes sin bundles: sus métricas y penalización son cero.
- No mueven tareas `done`, `in_progress` o bloqueadas.
- No relajan ninguna validación existente.
- No se añade migración ni se cambia RLS.

## Métricas

- `declaredResourceBundleCount`: bundles activos recibidos.
- `bundleComponentUsageCount`: instancias de componentes declarados observadas en asignaciones.
- `partialBundleUsageWarnings`: usos que contienen parte, pero no todos los componentes requeridos.
- `bundleSpaceAffinityMatches`: usos en espacios con afinidad positiva.
- `bundleSpaceAffinityMismatches`: usos con afinidades declaradas pero sin match positivo en el espacio actual.
- `bundleSwitchPenalty`: cambios de firma de bundle por espacio.
- `declaredBundleCandidateMatches`: candidatos inferidos cuya pareja de `resource_item` coincide con un bundle declarado.
- `bundleCoherencePenalty`: valor de scoring soft que combina parciales, switches y afinidad.

Las escalas son deliberadamente conservadoras y solo ordenan candidatos después de los criterios operativos críticos. No deben interpretarse como minutos de setup ni como coste económico.

## Escenario R

R contiene dos bundles (`Camera A + Sound A` y `Camera B + Sound B`), cuatro componentes, una afinidad distinta para cada bundle y dos soluciones válidas. La solución seleccionada mantiene el bundle A en su espacio afín durante dos tareas. El candidato rechazado cambia al bundle B en un espacio no afín.

Resultado de referencia: plan completo, cero hard violations, dos bundles declarados, dos affinity matches, cero switches en el seleccionado, razón de selección por coherencia bundle/recurso y métricas seleccionadas consistentes con el output final.

## Riesgos residuales

- Todavía no hay UI administrativa para gestionar bundles.
- No existe hard enforcement de completitud, continuidad o afinidad.
- CP-SAT no modela bundles como constraint fuerte ni variable conjunta.
- Los componentes declarados mediante `resources.id` no pueden reconciliarse todavía de forma inequívoca con `plan_resource_items`.
- No hay setup time, teardown, traslado o coste temporal persistido; el switch penalty es ordinal.
- La escala de `affinity_score` necesita calibración con datos reales de producción.

## Recomendación para ID 020

Priorizar una UI/admin acotada para crear, validar, activar y revisar bundles, incluyendo duplicados, cantidades y afinidades. En paralelo, diseñar una migración explícita para setup/teardown times antes de profundizar el peso del scoring. CP-SAT con bundles debería llegar después, inicialmente como experimento soft sobre subproblemas y solo como hard constraint cuando producción haya validado reglas concretas.

## ID 020 — Scoring sobre catálogo validado

`bundleCoherencePenalty` ya no consume directamente las filas recibidas. Primero usa `validateResourceBundles` y calcula uso parcial, continuidad y afinidad únicamente con `usableBundles`, `usableComponents` y `usableAffinities`.

- Un bundle activo sin componentes utilizables queda fuera del scoring.
- Un bundle parcialmente válido conserva solo sus componentes y affinities válidos.
- Los duplicados se deduplican de forma estable, conservando la primera fila.
- Una `quantity` inválida se normaliza a `1` y se reporta.
- Si todos los bundles activos son inválidos, todas las métricas de penalización quedan neutrales (`0`) y no puede atribuirse una selección a una mejor coherencia de bundles.
- Sin bundles, el comportamiento permanece idéntico y neutral.

La validación continúa siendo una protección de calidad para una señal soft: no introduce requisitos obligatorios ni nuevas restricciones hard.
