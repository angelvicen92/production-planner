# INFORME 06 — Siguiente PR recomendado, SIN prompt Codex

> **Corte:** 2026-10-28. `main = 39e26f1c2e84cc8160c2066e197d61bc8b972384` (merge #1213). La rama U02c se excluye. **Tipo de comprobación de esta entrega:** inspección remota de fuentes/código y reconciliación de Evidence existente; no se ejecutó una jornada UI+Postgres/SQL propia en esta auditoría. No afirmar que se visitó Replit/Supabase real.

**Fuentes de autoridad:** [00](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [01](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official), [03](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/03_PLANNER_CONSTRUCCION_BUSQUEDA_ASSISTED_v3.8.md), [04](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/04_INTEGRACION_CONFIGURACION_EFECTIVA_v2.9.md), [05](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/05_VALIDACION_CALIDAD_BENCHMARK_v2.8.md), [06](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/source/official/06_A2_CANONICO_INTERPRETACION_Y_TAREAS_v2.10.md), [07](https://github.com/angelvicen92/production-planner/tree/main/docs/source/official) y [AGENTS.md](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/AGENTS.md). La Fuente 06 prevalece sobre errores de los PDF humanos. **Nota:** etiquetas `UI_PRESENT_UNVERIFIED` significan componente o Evidence previa localizado, NO prueba end-to-end universal.

## Decisión

**No crear ahora rama ni PR.** U02c sigue en curso, el usuario ha pedido ser quien avise de que el PR está listo. Si GitHub muestra commits o un número de PR mientras se redacta esta auditoría, ello **no sustituye el aviso ni permite empezar un desarrollo paralelo**. Su Evidence no entra en `main` hasta verificar Gate Fuente 07, diff completo, CI, primeras causas físicas y merge explícito.

**Recomendación provisional después del Gate U02c, salvo que éste revele una dependencia más crítica:** **P0-G01 — editor nativo tipado de requisitos físicos de plantilla reutilizando el contrato actual de `resourceRequirements`.** Es el corte de mayor valor para el objetivo UI-only que se puede demostrar sin tocar el solver. Su implementación debe limitarse a subcontratos que tienen consumidor productivo verdadero; cualquier selección `anyOf/byType` en estructuras no soportadas debe advertirse, no prometer Stage ficticio.

## Fórmula causal X/Y/Z/W/M

- **X observado:** para crear el día integrado U02b, el runner de producto necesitó crear ciertos requisitos físicos de plantilla (`byItem`) mediante **API**, mientras Chromium pudo editar otras autoridades (Main, fases, conjunta, pausa). El jefe no puede reproducir ese contrato completo usando exclusivamente Settings UI.
- **Y demostrado:** `client/src/pages/settings.tsx::TaskTemplatesSettings` lee/preserva `resourceRequirements`, pero no ofrece editor universal verificable para declarar `byItem`, `byType` o `anyOf`. [`U02b/ui-api.md`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u02b/ui-api.md) lo registra y [`composition-matrix.md`](https://github.com/angelvicen92/production-planner/blob/39e26f1c2e84cc8160c2066e197d61bc8b972384/docs/evidence/p0-u02b/composition-matrix.md) distingue UI de API. El motor ya cuenta con consumidores productivos limitados (`U00h`, `U00i/j/l`, U02b).
- **Z operativa:** usar un recurso específico o una elección nominal exige soporte externo para configurar una jornada genuinamente nueva; falla E2E-0/E2E-1 antes incluso de probar construcción de 266.
- **W mínimo propuesto:** editar el **contrato existente** en UI de plantilla, seleccionar recursos por ID estable y tipo/capacidad admitidos, validar cantidad/domino y equivalencia, guardar en la **misma** API/schema, roundtrip, snapshot de nuevo día, proveniencia; mostrar `UNSUPPORTED` si ese contrato no compone bajo el perfil activo. No introducir nueva tabla/RPC, framework genérico, heurística o budget. Considerar primero editor `byItem` si los demás subcontratos multiplican superficie de cambio, una unidad por PR.
- **M esperado:** prueba Chromium desde Settings con usuario ADMIN, dar de alta plantilla con `byItem` y volver a leerla **sin Postman/JSON**, crear un día con IDs completamente nuevos, comprobar `EngineInput` lossless y certificado SQL de una intersección **ya productiva en U02b** (24/24 o caso mínimo equivalente), fingerprints idénticos si el contrato final es idéntico al anterior API. Negativos de ID no existente, resource indisponible, cantidad no soportada, permisos y CAS; no romper snapshot histórico ni QA.

## Por qué este corte antes que otra heurística

1. **Impacto A2 UI inmediato:** habilita autoría de recursos para cualquier familia ordinaria y actualiza la parte que ya funciona en SQL. Un solver más sofisticado sin productor de UI seguiría incumpliendo requisito 3 del usuario.
2. **Riesgo controlable:** limita ejecución al editor y contrato de persistencia existente, sin nueva física ni SQL hard relajado. Se puede comparar exactamente un input API vs UI con hash/fingerprint.
3. **Causalidad ya identificada:** no necesita suponer por qué fallan ramas de búsqueda, y puede validarse sobre la misma jornada positiva U02b.
4. **Coste relativo MEDIO**, frente a unificar R39/R40/U02c, transporte, Totales o comidas, donde aún falta primer rechazo y prueba física material.
5. **No duplicación:** U02c está investigando Reality anclado/standalone sobre macro. UI de plantillas es **otro contrato**, pero esperar su Gate reduce riesgo de escribir contra un `main` anterior o priorizar mal.

## Condiciones de reconsideración

- Si U02c demuestra que el primer bloqueo es un bug de autoridad compartida que invalida la mayor parte de jornadas, puede subir antes **una sola reparación causal** de ese consumer, sin emitir un segundo prompt paralelo.
- Si aparece un editor `resourceRequirements` realmente funcional en revisión de ramas/flujo de usuario que contradiga U02b, **cancelar G01** y probarlo desde UI en vez de reimplementarlo.
- Si se demuestra que la transición Caracola→Main de 30 min es el primer bloqueo de **representabilidad** al intentar un día nuevo, G02 puede preceder G01; el contrato histórico y ausencia del productor nativo están ya documentados.
- Si `requiresBand` es equivalente a un recurso concreto o bundle existente, no crear campo nuevo. Si no, hacer primero diagnóstico y extender sólo esa capacidad.

## Gate de merge que se aplicará cuando el usuario avise U02c

1. Buscar PR por rama real `codex/p0-u02c-integrated-anchored-reality-audit`; verificar base/head SHA y cambios exactos, no sólo README.
2. Revisar `U00x` y `U02b` bajo el mismo input/hashes y su comparación con U02c. Identificar el **primer guard** en config/replay/preflight/solver/SQL; separar no soportado/consumidor/viable/agotado.
3. Comprobar si la Evidence U02c incluye Stage SQL auténtico o únicamente memoria/diagnóstico; certificar exactamente el alcance. Si es PR de auditoría sin delta productivo, no declararlo implementación.
4. Revisar CI, tests focales, migrations, negativos/certificados, ramo aceptado, roles, CAS, ausencia de contaminación por horario humano, branches y reproducibilidad en bases descartables.
5. Si el PR es correcto y proporcional, merge y actualizar `main`, M02/M03/M04/M05 y costes; si no, corrección en el **mismo PR** o cierre/reorientación según Fuente 07. **Después**, no antes, decidir prompt Codex de la unidad siguiente.

**No se ha emitido prompt Codex ni se ha iniciado ninguna modificación de GitHub/Supabase/Replit.**