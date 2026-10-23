# P0-U00f — auditoría causal del candidato

Autoridades: AGENTS, Fuentes 00 v2.14, 01 v5.3, 02 v2.2, 03 v3.8, 04 v2.8, 05 v2.8, 06 v2.10 y 07 v2.3 §4.4; maestro P0 y catálogo de capacidades. Continuación del mismo PR #1184, base `72ec8cdc`, diagnóstico remoto verificado `793d4873`. El diagnóstico y sus artefactos originales permanecen históricos en el directorio padre. No se atribuye a ese diagnóstico capacidad productiva.

## 1. Core vacío: causa, intervención y falsación

Entrada: `../native/second-input.json`, jornada UI real, tres participantes, nueve obligaciones IN → retrato → OUT, autoridades restauradas por el contrafactual original. Preflight SUPPORTED; ninguna Main, vocal ni styling. La evidencia manual original sólo demuestra factibilidad.

Call path: `executeAssistedPlanning` → `buildAssistedProblem` → `runExactItinerantPlanSearch` → `runExactMainAndFeederSearch` → `EMPTY_STANDALONE` → `onHardValidCoreLeaf`. La igualdad 0===0 autorizaba un pipeline sin geometría Main; arrival presente permitía llegar a `buildPipelineWitness` y desreferenciar la capa inexistente. El fallo precedía a la búsqueda standalone, no era inviabilidad ni presupuesto agotado.

Delta: exigir al menos una Main colocada antes de `materializePipelineBundleMatching`. El core vacío llega al mismo `searchStandaloneForCoreCandidate` (incluida la continuación conjunta), preparación de prerrequisitos terminales, Future Feasibility, materialización de transporte y validación completa. El motor obtiene nueve colocaciones con 31 ramas standalone, cero ramas Main/bundle, presupuesto original 10.000 y replay determinista. El testigo manual no se entrega a búsqueda ni persistencia. `engine-gate.json` y los tests conservan la prueba sobre las autoridades originales.

## 2. Wiring productivo y autoridades

Call path: editor de perfil ADMIN/CAS → JSON versionado existente → `createPlan` → snapshots de plantillas y optimización → `buildEngineInput` → `applyNewDayPlannerConfiguration` → preflight/adapter → scope/continuación existente → propuesta → Draft → validación → Stage/replay.

El perfil conserva `transport: NONE` para jornadas históricas. La activación declara dos IDs estables de plantillas distintas; el resolutor existente los convierte a referencias de snapshots diarios, sin buscar por nombre. Los parámetros, mínimos/máximos, targets, separaciones, peso y capacidad siguen perteneciendo al snapshot de optimización existente. No hay segunda política ni tabla nueva. El builder conserva sus autoridades, espacios y recursos; el materializador asigna `transport_arrival` / `transport_departure` por identidad. Referencias ausentes/incoherentes bloquean readiness/preflight en lugar de convertirse en tareas ordinarias. La UI y API validan el contrato y mantienen autorización/CAS.

El E2E usa la aplicación productiva sin marcador, parche, SQL operacional, fixture A2 ni solver alternativo. Main+Vocal tiene 8/8; standalone tiene 9/9. IN y OUT tienen parámetros distintos. Los cambios generales posteriores conservan el primer problema, Stage y Draft literalmente. El snapshot/revisión incluye la autoridad optimizer original y sus referencias diarias; el verificador comprueba parámetros, fingerprints y replays.

## 3. Continuación fría protegida

Entrada: seis tareas Main/Vocal/IN aceptadas, dos OUT pendientes; primero sin certificado y después con el JOINT_COMPLETION persistido. `deriveArchitectureFromProtectedMains` no aplica a este perfil sin styling, por lo que entra el fallback `mains.length===0`. Allí se borraba `transportPolicy`, haciendo que un paquete simultáneo válido pareciese un solape físico exclusivo.

Delta: conservar literalmente ambas políticas y filtrar únicamente sus task IDs al core reducido. No se cambia el reconocedor especializado de arquitectura ni se inventa styling. El validador sigue rechazando el mismo paquete cuando se elimina su autorización; con ella, el fallback y la continuación existente encuentran las dos OUT sin mover las seis tareas aceptadas. Se verifican replays fríos y con certificado por separado, con validación completa y determinismo.

## 4. Límites y gate

No se promete solución a configuraciones físicamente incompatibles ni completitud por encima del presupuesto original. Transporte continúa sujeto a ventanas, cardinalidad, recursos, dependencias, HARD/REQUIRED y protección de Stages. Los negativos no devuelven propuestas parciales. El perfil no habilita otras familias estructurales ni adopta configuración sobre jornadas históricas.

Los recibos nativos, regresiones U00a–U00e, comparación A2 aislada, TypeScript/build, migraciones y CI del candidato se enumeran en `validation.json` y el README. Los datos originales del diagnóstico no sustituyen esos gates. Sin merge, Supabase productivo ni publicación Replit.

La comparación inicial de U00e contra otra alta histórica encontró IDs de familia distintos. La primera diferencia procede de `SetupFamiliesEditor` → `crypto.getRandomValues`, sin cambios en esta unidad: es una diferencia de autoridades entre dos jornadas, no una regresión demostrada. Se falsó la hipótesis de regresión ejecutando exactamente los mismos EngineInput UI congelados en base y candidato; los dos replays coinciden en problema, mapas, fingerprint, propuesta, preparaciones, certificados, ramas y validación del mismo Stage. Se preserva la diferencia histórica, sin renombrar IDs para ocultarla.
