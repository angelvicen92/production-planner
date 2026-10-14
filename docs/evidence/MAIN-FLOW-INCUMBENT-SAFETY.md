# Main: incumbente completo antes de la preferencia SOFT

Base autorizada: `16d9bd2bb0288d2b0ebad252e0bdf6e9efda8f97` (#1120).
Rama: `codex/mainflow-soft-preference-incumbent-safety`.
Unidad: seguridad interna de selección/búsqueda. La preferencia todavía no está
conectada a configuración diaria, EngineInput, persistencia ni UI.

## Auditoría causal

**X:** priorizar una familia preferida puede perder la propuesta completa que
AUTO recupera. **Y:** el mismo ledger paga patrones, timelines, matching, CORE,
Future Feasibility y standalone antes del primer incumbente. **Z:** producción
queda sin propuesta aunque había una alternativa válida dentro de su límite.
**W:** conservar primero una terminación completa validada por AUTO o un
`JOINT_COMPLETION` íntegramente revalidado y después buscar la mejora con el
mismo ledger y checkpoint. **M:** el caso frío conserva el fingerprint AUTO a
51; casos factibles seleccionan 3/4; agotamiento o tiempo durante la mejora
devuelven el incumbente y explican por qué no mejoró.

La reproducción previa sobre la base actual confirmó AUTO=51 y preferencia
experimental=95, agotada a 51. Las 44 ramas de #1120 siguen siendo cargos reales.
Esta unidad no intenta hacerlas desaparecer mediante una nueva heurística.

## Recorrido y autoridades

1. La configuración efectiva/revisión del día llega a `buildEngineInput` y
   `adaptEngineInputToPlannerNextProblem`. El adapter conserva su contrato actual:
   no se introduce una nueva configuración productiva. `preferredBlockCount` es
   exclusivamente un objetivo interno opcional de `PlannerNextProblem`.
2. `resolveAssistedScope` y `buildAssistedProblem` conservan contexto aceptado,
   locks adaptados, supporting y contexto analítico. `collectiveCoreProjection`
   no convierte tareas futuras en obligaciones visibles/aceptadas.
3. `executeAssistedPlanning` conserva el límite de 100.000 y el checkpoint de
   300 segundos. `executePlannerNext` exige `EXACT_CONSTRUCTIVE` para SOFT;
   compatibility devuelve incompatibilidad explícita. Valores inválidos fallan
   preflight. `FIXED_COUNT(n)` sigue siendo un contrato REQUIRED diferente:
   no se añade un alias ni una implementación de ese contrato en esta unidad.
4. `constructExactItinerantPlan` mantiene la ruta anterior cuando no hay objetivo.
   Para SOFT crea un único ledger. La primera fase usa el orden AUTO hasta la
   primera terminación completa, o el replay completo existente. La optimización
   secundaria de calidad queda diferida en esta fase SOFT; AUTO conserva su modo
   de selección anterior.
5. La arquitectura pasa por `generateMainFlowPatterns`, el frontier de timelines,
   `proveMainFeederArchitectureImpossible`, witness anónimo, matching por bundles,
   `runExactMainAndFeederSearch` y completion standalone. La cota futura #1120
   sigue siendo necessary-only, con sus abstenciones para contexto fijo.
6. La primera terminación procede de `searchStandaloneForCoreCandidate` tras
   comprobar identidad/cobertura, transporte, comidas, unidades futuras y
   `validatePlan`. En composición conjunta, se valida el contexto completo y se
   produce `JOINT_COMPLETION` antes de proyectar al scope.
7. El replay comprueba firma, identidad/semántica de todas las tareas, configuración
   vigente, placements y preparaciones protegidos, cierre colectivo y validación
   completa. Cada vértice replayado se cobra al ledger. Una firma válida sola no
   basta. Un replay obsoleto o interrumpido no se convierte en incumbente.
8. Una segunda fase opcional invoca los mismos exploradores con el trabajo realmente
   restante. Ordena familias por distancia al objetivo **antes** de truncarlas;
   conserva min/max REQUIRED y `maxPatterns`. No reserva patrones de fixtures.
   No reutiliza como geometría aceptada el JOINT/pipeline efímero que impediría
   explorar la preferencia. Los placements protegidos siguen siendo autoridad.
9. La mejora omite la construcción nominal eager anterior: entra en los caminos
   estructurales/residuales presupuestados. Todo trabajo nominal repetido se cobra
   normalmente. No hay otro scheduler, segundo ledger, cuota ni aumento de límites.
10. Sólo un resultado completo más cercano sustituye al incumbente; los empates lo
    conservan. El contador usa la secuencia efectiva de `blockKey`/coach e ignora
    pausas autorizadas. Main íntegramente protegido impide intentar otra geometría;
    protección parcial fija exactamente sus placements y permite mejorar el resto.
11. El resultado seleccionado continúa por validación Assisted → `ScopeProposal`
    → Draft. Sólo aceptación humana produce Stage. Supporting y witnesses no
    adquieren protección por haber demostrado factibilidad.

## Contabilidad y significado de los resultados

`mainFlowSoftPreference` registra objetivo, bloques logrados, origen y rama del
primer incumbente, fingerprint, replay, fases y motivo de parada. El instante del
incumbente se expresa en branches para mantener determinismo. Los tiempos de las
peticiones son observaciones del harness.

Los totales `branchesExplored/coreBranches/standaloneBranches` y el waterfall
abarcan ambas fases. Los demás diagnósticos del resultado pertenecen al candidato
seleccionado; las filas `baseline/improvement` conservan por separado sus patrones,
timelines, arquitecturas, rechazos y certificados estructurales. No se presenta el
coste del candidato como si fuera todo el trabajo de la petición.

Un resultado `COMPLETE` puede conservar una mejora `BRANCH_BUDGET_EXHAUSTED` o
`TIME_LIMIT_REACHED`. Eso es fallback válido, no preferencia conseguida ni prueba
de inviabilidad. Sin incumbente, el agotamiento sigue siendo inconcluso. Los
certificados necesarios refutan arquitecturas concretas y no se convierten en
una declaración de inviabilidad global o del número deseado.

| Límite frío | AUTO | SOFT 4 total | Incumbente | Intento de mejora | Bloques finales |
|---:|---:|---:|---:|---|---:|
| 51 | 51 | 51 | 51 | sin capacidad restante | 2 |
| 95 | 51 | 95 | 51 | agotado, 44 branches | 2 |
| 102 | 51 | 102 | 51 | agotado, 51 branches | 2 |
| 1.000 | 51 | 146 | 51 | completo en 95, sin acercarse | 2 |

Los cuatro casos conservan el fingerprint
`49918248fc89578048eac3accadcc969b62ddffe2645c2e4c005240ca9af245e` y se repiten
determinísticamente. A 1.000, asegurar AUTO añade 51 branches reales respecto al
intento preferente frío de #1120. El límite no aumenta y no se esconden esas ramas.

El fixture genérico factible tiene cuatro Main, dos por clave, feeders de cinco
minutos y ninguna dependencia terminal restrictiva. Con `maxPatterns=1`, AUTO
completa en 47, SOFT 3 en 47+52=99 y SOFT 4 en 47+57=104. Los objetivos se
consiguen con validación hard, determinismo e input inmutable. Si sólo quedan las
47 branches de AUTO, se devuelve su plan de dos bloques.

## A2 y regresiones

| Petición A2 | Bloques | Cobertura | CORE / standalone | Tiempo observado | Incumbente | Resultado SOFT |
|---|---:|---:|---:|---:|---|---|
| frío AUTO | 2 | 266/266 | 9343 / 46282 = 55625 | 123.893 s | AUTO @ 55625 | COMPLETE |
| frío 3 | 2 | 266/266 | 14731 / 85269 = 100000 | 236.332 s | AUTO @ 55625 | BRANCH_BUDGET_EXHAUSTED |
| frío 4 | 4 | 266/266 | 14456 / 70671 = 85127 | 204.306 s | AUTO @ 55625 | TARGET_ACHIEVED |
| caliente 3 | 3 | 266/266 | 5667 / 45045 = 50712 | 149.145 s | REVALIDATED_JOINT_COMPLETION @ 293 | TARGET_ACHIEVED |
| caliente 4 | 4 | 266/266 | 5113 / 24682 = 29795 | 97.867 s | REVALIDATED_JOINT_COMPLETION @ 293 | TARGET_ACHIEVED |

AUTO conserva exactamente todos los contadores de trabajo y el fingerprint de witness de #1120. El ensayo nativo final conserva `c0cc8bf4e1c466a9640b7ce765e0dceeb5772204a8f387f50e1af12d844ec703`, 12 Stages incluyendo S0, 266/266 y cero HARD/REQUIRED. Sus 30 comprobaciones incluyen protección, comidas, persistencia, recarga y rollback/redo; S1 tarda 115.442 s. Se usaron las esperas originales del harness, sin elevar 180 s ni el techo de motor de 300 s.

La preferencia 3 fría no se consigue: tras AUTO=55.625 quedan 44.375 branches; el intento directo histórico de 3 consumía 50.419. La petición actual agota exactamente 100.000 y devuelve el witness AUTO completo. Eso no demuestra inviabilidad de tres bloques. Las preferencias calientes se revalidan y se cobran antes de mejorar. Los fingerprints y diferencias por petición están en el JSON; 3/4 siguen siendo witnesses experimentales y no Stages aceptados.

Regresiones: suite completa 2.889/2.889 sin fallos/skips, 18/18 focales finales (incluyen locks reales adaptados de tiempo/recurso, done/in_progress, protección parcial, geometría aceptada fuera del prefijo truncado, replay obsoleto y deadline), TypeScript de producto e integración, build, migraciones y diez checksums oficiales PASS. El benchmark canónico es byte-idéntico en dos ejecuciones. El discovery/exclusiones de producto son los del workflow vigente.

[Evidence JSON](MAIN-FLOW-INCUMBENT-SAFETY.json) y los seis archivos comprimidos enlazados en su manifest conservan los resultados completos.

## Reproducción y alcance de la entrega

```sh
node --import tsx --test engine/planner-next/mainFlowSoftPreference.spec.ts
node --import tsx script/demo/mainFlowSoftBlockDiagnostic.ts work/soft-cold --cold-only --candidate
node --import tsx script/demo/mainFlowSoftBlockDiagnostic.ts work/soft-a2 --a2-only --candidate
npm run demo:a2:smoke -- work/soft-native --historical-topology --full
```

`--candidate` ejecuta los archivos actuales en una copia aislada, sin aplicar el
patch experimental #1119. Los hashes del manifest verifican los archivos realmente
ejecutados y que el producto no se modificó. HEAD/codeBase identifica el ancla del
archivo Git; los hashes actuales identifican el candidato sobrepuesto, incluso
antes de commit. Sin `--candidate` se conserva el replay histórico de #1119 y su
patch archivado. Ninguno se usa como validación del nuevo motor.

El ensayo A2 caliente lee el JOINT que acaba de generar AUTO sobre el candidato;
no usa el horario humano ni acepta Stages de tres/cuatro bloques. Los `.json.gz`
archivan los resultados completos y la integración descartable; no logs privados
ni credenciales. El JSON conserva manifest, budgets, comparaciones y gates locales.
La CI remota se informa sobre el head final del PR; `PENDING_AT_LOCAL_CAPTURE`
describe el momento de captura, no sustituye ese resultado.

No se modifican UI, persistencia, DB/schema/migraciones, fuentes oficiales,
configuración diaria, Supabase real, planes reales 27001/27002 ni Replit.
La promoción end-to-end y los cambios normativos correspondientes siguen fuera
de esta unidad. No se acredita optimalidad ni superioridad operativa global.

Recomendación: integrar únicamente este contrato interno de seguridad si la CI del head final pasa. El gate frío y la mejora SOFT factible están demostrados; la preferencia A2 3 fría conserva el fallback y sigue limitada por presupuesto. Mantener la promoción de UI/configuración para una unidad posterior. No se ha hecho merge.
