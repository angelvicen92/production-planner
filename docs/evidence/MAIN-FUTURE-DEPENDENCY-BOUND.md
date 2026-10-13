# Main: cota necesaria de dependencias futuras

Base autorizada: `efad31a785a39942989253b5ccce4ae6921ff760` (#1119).
Unidad: extensión del filtro estructural existente; preferencia SOFT inactiva.
No se modifican presupuestos, configuración, UI, migraciones, topología,
Supabase real, planes reales 27001/27002 ni Replit publicado.

## Resultado causal y límite de aceptación

El bloqueo de #1119 es causado por `proveMainFeederArchitectureImpossible`:
su matching necesario comprueba posiciones Main, disponibilidad y prerrequisitos,
pero no los deadlines hard de los sucesores obligatorios. Así, una arquitectura
alternada imposible llega al matching nominal/feeder y repite Future Feasibility
hasta consumir el ledger antes de alcanzar el fallback viable.

El delta proyecta los últimos finales Main permitidos por dependencias futuras
al mismo cover bipartito necesario. En el fixture original, ambos Main `a`
deben terminar como máximo en 70. `a,b,a,b` y `b,a,b,a` tienen sólo una posición
`a` compatible con esas dos demandas: el matching máximo cubre 3/4 Main.
`FUTURE_DEPENDENCY_CAPACITY` es un certificado necesario independiente de la
identidad/orden nominal, no una inferencia del agotamiento ni una preferencia
convertida en HARD. `a,a,b,b` sobrevive.

La petición fría preferencia 4 recupera exactamente el fingerprint AUTO y la
solución válida de dos bloques con **95 branches**, dentro de los 1.000
originales. Consume 905 menos que la ejecución agotada anterior, que no producía
solución. **El objetivo estricto de 51 no se cumple**: a 51 continúa agotándose,
por 44 ramas estructurales anteriores al mismo trabajo nominal. Se documenta la
excepción de contabilidad prevista en el encargo; no se mueve `consumeBranch`,
se oculta trabajo ni se aumenta el presupuesto para presentar 51.

| Límite compartido | AUTO actual | Preferencia 4 anterior | Preferencia 4 actual |
|---:|---|---|---|
| 51 | COMPLETE, 51 | agotado, 51 | agotado, 51 |
| 95 | COMPLETE, 51 | no medido en #1119 | COMPLETE, 95 |
| 102 | COMPLETE, 51 | agotado, 102 | COMPLETE, 95 |
| 1.000 | COMPLETE, 51 | agotado, 1.000 | COMPLETE, 95 |

Las ejecuciones frías se repiten con igualdad de resultado, fingerprint,
contadores y diagnóstico, exceptuando tiempo. El input permanece inmutable.

## Auditoría del call path real

1. `buildEngineInput` → adapter → `resolveAssistedScope` →
   `buildAssistedProblem` conserva tareas futuras elegibles read-only y
   placements aceptados. Supporting efímero continúa separado del Stage.
2. `executeAssistedPlanning` → `executePlannerNext` →
   `constructExactItinerantPlan` → `runExactItinerantPlanSearch` crea el ledger
   compartido CORE/standalone y las autoridades de comidas/futuro.
3. `generateMainFlowPatterns` deriva familias autorizadas. El patch experimental
   de #1119 altera su orden exclusivamente en una copia aislada para comprobar
   preferencias; el producto sigue usando el contrato integrado AUTO.
4. `mainFlowTimelineArchitectureFrontier` →
   `authorizedPipelineArchitectureMaterializations` ejecuta el filtro necesario
   antes de `materializeNominalPipelineWitnessWithBudget`. Después,
   `preparePipelineBundleGraph` y matching materializan bundles bajo las
   autoridades existentes. El delta no declara suficiente un cover necesario.
5. `runExactMainAndFeederSearch` tiene además su propio explorador residual de
   patrones, posiciones compuestas y timelines. Allí llama al mismo filtro antes
   de `search`: conserva sus cargos de enumeración y elimina el trabajo nominal
   de las arquitecturas probadas imposibles.
6. Future Feasibility, comidas, recursos, continuidad, setups, transiciones,
   validación terminal y standalone siguen gobernando la solución completa.
   El witness previo revalidado y el fallback mantienen sus contratos.
7. `deriveArchitectureFromProtectedMains` y los caminos nominales con contexto
   fijo abstienen de esta nueva poda. Se conserva la geometría aceptada/locked;
   la validación y grandfathering existentes mantienen la autoridad terminal.
   El filtro no modifica un placement, Draft ni Stage.

Desde producción, dejar ambas demandas `a` después de su último límite no es
una alternativa operativa. Rechazar la arquitectura por capacidad antes de
asignar identidades conserva más libertad futura y sigue el método de Fuente 03.
La caída de branches representa detección temprana de una rama ya imposible;
no cambia la severidad, el modelo ni la completitud exigida.

## Soundness y reutilización

Se reutiliza `exactTaskStaticStartDomain`, la misma autoridad de intervalos que
usa el forward check, incluyendo disponibilidad de tarea/personas/espacio,
recursos, unidad específica y pausas estáticas. No se escanea la grid.
Para cada tarea conocida se recorta conservadoramente su último inicio con los
últimos inicios de sus sucesores menos su duración. La propagación recorre sólo
aristas `dependencies` representadas, incluidas cadenas indirectas. Para pares
ejecutables se reutiliza `participantGapMinutes`, con overrides explícitos, max
sin suma y fronteras INCLUDED. Para tareas futuras proyectadas se relaja ese
margen a cero porque la proyección puede omitir el contrato anclado original.

El dominio ignora coexistencia nominal, futuros setups/rondas no representados,
pausas aún no elegidas y transiciones adicionales: esto sólo ensancha los
últimos límites posibles. Un matching completo significa únicamente que esta
condición necesaria no refuta la arquitectura. No certifica completar el día.

Entidades/dependencias incompletas, ciclos y asignaciones abiertas de unidades
abstienen; no se usan hints de ranking ni una permutación humana como autoridad.
El contexto fijo abstiene deliberadamente de la nueva poda. No se introduce
otro scheduler, ranking, porcentaje de ledger, presupuesto oculto ni hardcode A2.

`futureDependencyStructural` (residual) y
`architectureFutureDependencyStructural` (antes del witness nominal) registran
checks, rechazos, passes, abstenciones y el primer certificado. Un rechazo
incluye arquitectura, últimos finales, demanda y matching máximo. Agotamiento
permanece en los estados y contadores originales, separado de la prueba.

## Reconciliación exacta de las 44 ramas

| Cargo existente | AUTO | Preferencia 4 actual | Delta |
|---|---:|---:|---:|
| `PATTERN_SEARCH_BUDGET_EXHAUSTED` / patrón | 1 | 5 | 4 |
| `TIMELINE_SEARCH_BUDGET_EXHAUSTED` / timeline | 1 | 25 | 24 |
| `COMPOSITE_POSITION_SEARCH_BUDGET_EXHAUSTED` / arquitectura | 1 | 17 | 16 |
| Total previo adicional | | | **44** |

No hay bloques compuestos REQUIRED en este fixture; `rawCombinationCount=0`.
Ocho timelines cobran su enumeración y se omiten por inicio anterior al día.
De las otras 16 arquitecturas adicionales, 12 fallan el filtro de ventana ya
existente y 4 fallan el nuevo certificado futuro (familias de cuatro y tres
bloques). Ninguna entra en el DFS nominal. El resto de los cargos coincide con
AUTO: matching residual 38, feeder starts 2, continuaciones 2 y trabajo posterior.
El ledger final es CORE 90 + standalone 5, frente a 46 + 5 de AUTO.
El waterfall sólo aumenta OTHER en 44; sus restantes celdas son idénticas.

A 1.000, las evaluaciones Future Feasibility pasan de 163 a 2, las negativas de
161 a 0 y las repetidas de 148 a 0. Se conserva la validación terminal y el
fingerprint frío `49918248fc89578048eac3accadcc969b62ddffe2645c2e4c005240ca9af245e`.
Alcanzar 51 requeriría evitar de forma estructural esa enumeración, no desplazar
su cargo ni probar gratuitamente los mismos candidatos. Esa sería otra unidad
causal; queda fuera de este filtro y la UI SOFT sigue bloqueada.

## A2, benchmark y gates

| Ejecución | Obligaciones / bloques | Branches anteriores → actuales | Tiempo actual | Fingerprint witness |
|---|---|---:|---:|---|
| AUTO | 266/266, 2 | 55,625 → 55,625 | 283.145 s | canon nativo certificado por Stages |
| 3 | 266/266, 3 | 50,419 → 50,419 | 207.496 s | idéntico al de #1119 |
| 4 | 266/266, 4 | 29,502 → 29,502 | 114.948 s | idéntico al de #1119 |

AUTO conserva todos los contadores `work` comparables. Preferencias 3/4 también
conservan todos esos contadores y sus fingerprints de witness. La nueva cota
registra 13/9/0 rechazos necesarios futuros (AUTO/3/4), antes de que otras
autoridades nominales o estructurales existentes descartasen esas geometrías. AUTO mantiene
858 timelines, 722 rechazos estructurales y 136 checks nominales. Preferencia 3
mantiene 567 timelines y 10 arquitecturas preparadas; sus rechazos necesarios
aumentan de 438 a 443 y sus checks nominales bajan de 129 a 124. Preferencia 4 mantiene
505 y 10. La clasificación por causa puede cambiar al anticipar un certificado;
no se interpreta como cambio de completitud.

El EngineInput bruto del replay `20e4b30` difiere del actual en 332 valores de
identidad de plantillas (incluyendo snapshot y referencias de transporte/comida),
por #1118 ya integrado en la base autorizada. Se construyeron ambos inputs y se
comparó su adaptación: **PlannerNextProblem es exactamente idéntico**. Esta
unidad no cambia datos, topología ni restricciones del fixture A2.


Validación local final: **2.874/2.874 pruebas de producto PASS**, cero fallos o
skips, con las dos exclusiones históricas del workflow; 35 focales, 206
regresiones de caminos afectados y 12 contratos demo adicionales PASS.
TypeScript de producto e integración, build, secuencia de migraciones,
checksums oficiales y benchmark representativo determinista (dos ejecuciones)
PASS. El ensayo nativo completa **266/266 con 30 comprobaciones**, S0 + 11
Stages, cero HARD/REQUIRED, preservación, recarga, rollback/redo y rechazo del
reset Legacy. Fingerprint final idéntico al baseline:
`c0cc8bf4e1c466a9640b7ce765e0dceeb5772204a8f387f50e1af12d844ec703`.

La primera espera UI de 180 s agotó bajo concurrencia, con el run aún `running`;
no demostró inviabilidad. El ensayo nativo final usa una copia del candidato que
sólo cambia la espera externa a 305 s, como #1119, manteniendo literalmente el
techo de motor de 300 s. Los cinco archivos productivos modificados se
compararon byte a byte con esa copia. No se cambia el workflow/harness nativo
integrado por ese ajuste local de espera. CI del head publicado se informa en
el PR; la marca PENDING del JSON corresponde a la captura local previa al push.

Los tiempos son observaciones, no mejora de rendimiento certificada: las
mediciones se hicieron en este entorno y pueden compartir CPU con otros gates.
Los branches, fingerprints y estados son las comparaciones deterministas.
El A2 nativo usa PostgreSQL/Auth/PostgREST/HTTP/Chromium descartables, conserva
el día histórico local, sus Stages y 333 tareas ajenas; no utiliza la DB real.

## Reproducción y provenance

```sh
node --import tsx script/demo/mainFlowSoftBlockDiagnostic.ts work/main-future-cold --cold-only --candidate
node --import tsx script/demo/mainFlowSoftBlockDiagnostic.ts work/main-future-a2 --a2-only --candidate
node --import tsx script/demo/mainFlowSoftBlockDiagnostic.ts work/main-future-old --cold-only
npm run demo:a2:smoke -- work/main-future-native --historical-topology --full
```

`--candidate` archiva HEAD y superpone todos los archivos tracked actuales antes
de aplicar el patch de preferencias aislado. Ejecuta realmente el filtro
modificado, incluso antes del commit. Los hashes del manifest identifican los
archivos ejecutados y se comprueban contra el candidato; `codeBase`/`executionHead`
son el ancla Git de la captura y no sustituyen esos hashes si hay ediciones aún
sin commit. Sin ese flag se conserva el replay antiguo de `20e4b30` para
comparación, nunca como validación del delta. CI ejecuta ambos caminos fríos.

La Evidence JSON adjunta ambos diagnósticos, manifests, certificados, waterfall,
comparaciones A2 y gates. Los `.json.gz` contienen witnesses completos y el
ensayo nativo, sin credenciales ni logs privados de la aplicación.

Recomendación: integrar sólo este filtro si los gates/CI pasan y se acepta el
límite de contabilidad demostrado. No certificar recuperación a 51, activar la
preferencia SOFT ni declarar inviabilidad global por agotamiento. Sin merge.
