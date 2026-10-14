# Main: prioridad SOFT real y fallback transparente

Base: `43701c85f33ad9680859b43330963d2b5201ff20` (#1121).
Rama: `codex/mainflow-soft-preferred-first-fallback`.
Unidad interna: selección SOFT, respaldo revalidado y Evidence. Este documento
es descriptivo; no sustituye ni modifica las Fuentes oficiales.

## Auditoría causal y delta

**X:** SOFT 3 frío devolvía 2 bloques pese a existir una terminación de 3 dentro
del presupuesto. **Y:** construir AUTO consumía 55.625 branches antes de intentar
la preferencia; sólo quedaban 44.375 de las 100.000. **Z:** Producción recibía una
estructura distinta después de gastar presupuesto en otra que no había pedido.
**W:** usar directamente el orden SOFT del explorador existente, sin construir
AUTO antes, y conservar únicamente soluciones completas realmente validadas.
**M:** A2 frío alcanza 3 en 50.419 y 4 en 29.502, con 266/266, cero HARD/REQUIRED,
familia solicitada a branch 0 y fingerprints iguales a #1119/#1120.

Las fuentes y los cambios integrados de #1119–#1121 se contrastaron antes de
editar. El patch archivado #1119 permanece como diagnóstico histórico; no se
aplica al candidato ni se utiliza como validación del motor actual.

## Recorrido real y autoridades reutilizadas

1. Configuración efectiva → `buildEngineInput` → adapter → resolución del scope
   → `buildAssistedProblem` mantiene la frontera vigente de producto. El objetivo
   `preferredBlockCount` sigue siendo interno; no se añade configuración diaria.
2. `executeAssistedPlanning` → `executePlannerNext` →
   `constructExactItinerantPlan` mantiene literalmente la ruta AUTO cuando no
   existe objetivo. SOFT usa un único `ExactSearchLedger` y el mismo checkpoint.
3. Si hay `JOINT_COMPLETION`, su replay usa las autoridades terminales existentes,
   cobra los vértices y el cierre colectivo, verifica semántica/configuración,
   firma, cobertura, placements/preparaciones protegidos y validación completa.
   El replay aislado no inicia construcción si el witness es obsoleto.
4. Un witness revalidado queda como respaldo. Si ya cumple N, satisface la petición.
   Si Main sigue siendo modificable y no cumple N, se explora la preferencia con
   el presupuesto restante sin reintroducir JOINT/pipeline efímero como geometría
   aceptada. Supporting no se convierte en tarea aceptada ni protegida.
5. `generateMainFlowPatterns` ordena familias por `(abs(bloques-N), bloques)` antes
   de `maxPatterns`. No reserva familias, elimina cantidades inferiores ni amplía
   límites. `mainFlowTimelineArchitectureFrontier`,
   `proveMainFeederArchitectureImpossible`, materialización nominal, matching por
   bundles, `runExactMainAndFeederSearch`, Future Feasibility y standalone conservan
   sus autoridades. No se añaden pruebas de poda ni otro motor.
6. El camino residual SOFT completa los tiers de cortes de comida de una familia
   antes de pasar a la siguiente. AUTO conserva exactamente su orden anterior.
   Un fixture demuestra que una comida operacional dentro de un bloque lógico
   puede completar N=3 antes de elegir una geometría completa de 2.
7. La primera terminación completa validada cierra la construcción. No se repite
   AUTO para obtener un fallback. Si hay respaldo anterior, sólo una terminación
   más cercana, o menor a igual distancia, lo sustituye. Agotamiento/deadline no
   destruye una terminación anterior validada.
8. Main íntegramente protegido mantiene su geometría. Protección parcial, locks
   de tiempo/recurso y `done/in_progress` conservan sus placements/autoridades.
   Propuesta → Draft → validación → aceptación humana → Stage permanece vigente.

## Resultados causales

| A2 frío | #1121: bloques / branches | Candidato: bloques / CORE + standalone | Cobertura |
|---|---|---|---|
| AUTO | 2 / 55.625 | 2 / 9.343 + 46.282 = 55.625 | 266/266 |
| SOFT 3 | 2 / 100.000 | 3 / 5.667 + 44.752 = 50.419 | 266/266 |
| SOFT 4 | 4 / 85.127 | 4 / 5.113 + 24.389 = 29.502 | 266/266 |

SOFT frío registra únicamente la familia solicitada, sin revalidación ni
construcción AUTO previa. 3/4 conservan los fingerprints de los experimentos
directos #1119/#1120. AUTO conserva todo el resultado semántico de #1121, excepto
tiempos observados; no sólo su cantidad de bloques. Las ejecuciones son witnesses
completos de jornada proyectados al scope Main, no nuevos Stages 3/4 aceptados.
No se declara optimalidad ni superioridad operativa global.

Con JOINT previo válido, 3/4 alcanzan 50.712/29.795 branches: 293 de revalidación
y las mismas 50.419/29.502 de construcción fría. Se observan 161,610/95,989 s en
la repetición sin carga concurrente. El primer ensayo caliente 3, simultáneo a
la suite de producto/focal, devolvió 2 y falló su assertion al cabo de 301,497 s.
El harness anterior no guardaba el resultado antes de esa assertion, por lo que
no se dispone de su stop reason/branches exactos; el tiempo es consistente con
el deadline vigente. Se repitió sólo la validación caliente, sin cambiar código
productivo ni límites, y pasó. El harness ahora conserva el resultado antes de
exigir N. Esta limitación de captura y el primer intento permanecen en el JSON.

La regresión nativa confirma S0 + 11 Stages, 266/266 y cero HARD/REQUIRED, con
30 comprobaciones de SQL/Auth/HTTP/UI, persistencia, recarga, comidas, protección,
rollback/redo y rechazo del reset Legacy. Mantiene exactamente
`c0cc8bf4e1c466a9640b7ce765e0dceeb5772204a8f387f50e1af12d844ec703`.
S1 mide 150,337 s con carga concurrente, dentro de la espera UI original de
180 s y del techo de motor de 300 s; no garantiza el objetivo operativo de 2 min.

| Fixture frío | Límite | Resultado SOFT 4 | Orden real | Branches |
|---|---:|---|---|---:|
| Contraejemplo #1119/#1120 | 1.000 | COMPLETE, 2 bloques, hard-valid | 4 → 3 → 2 | 95 |
| Mismo problema | 95 / 102 | misma terminación y fingerprint | 4 → 3 → 2 | 95 |
| Mismo problema | 51 | BRANCH_BUDGET_EXHAUSTED, sin terminación | 4 → 3 → 2 | 51 |
| Dos Main de una clave obligados al centro | 1.000 | COMPLETE, 3 bloques, hard-valid | 4 → 3 | 85 |

El fallback de 2 conserva `49918248fc89578048eac3accadcc969b62ddffe2645c2e4c005240ca9af245e`.
AUTO cuesta 51 en ese fixture. Las 44 branches adicionales son las enumeraciones
reales ya reconciliadas en #1120: 4 patrones, 24 timelines y 16 arquitecturas.
Desaparecen las 51 branches de construcción AUTO previa de #1121 (146 → 95).
A 51, priorizar realmente N puede perder el fallback AUTO; no se oculta este
compromiso ni se aumenta presupuesto, timeout o se reserva una cuota arbitraria.

Los fixtures factibles seleccionan 2/3/4 en 47/52/57 branches respectivamente,
con `maxPatterns=1` y 200, inputs inmutables y repetición determinista. La familia
3 precede a 2 y después a 4; ante igual distancia prevalece el número menor.

## Contrato de resultado

`mainFlowSoftPreference` registra modo, objetivo, bloques finales, cumplimiento,
primera terminación/origen/branch/fingerprints, candidato seleccionado, uso y causa
de fallback, estado de búsqueda preferida, transiciones reales de familia por
explorador, fases `revalidation/search`, ledger total/límite y certificados.
Assisted añade el tiempo observado y el techo vigente de 300.000 ms; un llamado
directo del motor sin autoridad de reloj deja `runtime=null`, sin inventar un límite.

Los cuatro estados se distinguen: `TARGET_ACHIEVED`, `COMPLETE_ALTERNATIVE`,
`NO_COMPLETE_ALTERNATIVE`, `HARD_INCOMPATIBLE`. Este último requiere un certificado
real: por ejemplo, toda la geometría Main protegida con otro número de bloques.
Los rechazos necesarios de arquitecturas concretas conservan sus certificados
en las fases; no se agregan como prueba universal de inviabilidad de N. El caso
51 tiene `hardCertificate=null` y `NOT_FOUND_WITHIN_LIMITS`.

Los contadores totales y el waterfall incluyen revalidación y búsqueda sin
reiniciar el ledger. Los witnesses/diagnósticos seleccionados pertenecen al
candidato devuelto; las fases preservan el trabajo realizado y sus rechazos.
Las observaciones temporales se excluyen de comparaciones de determinismo.

La futura UI podrá decir: «Has solicitado preferentemente 4 bloques. Se ha
completado la planificación con 3 bloques. No se encontró una propuesta completa
de 4 dentro de los límites de búsqueda. Esto no demuestra que sea inviable».

## Validación y reproducción

Los resultados completos, manifests/hashes, comparaciones, presupuestos,
validación nativa y gates locales están en
[MAIN-FLOW-SOFT-PREFERRED-FIRST.json](MAIN-FLOW-SOFT-PREFERRED-FIRST.json)
y sus artifacts comprimidos. La CI remota se informa en el PR sobre el head final;
`PENDING_AT_LOCAL_CAPTURE` identifica el momento de captura local.

Gate local: suite de producto 2.902/2.902, suite focal 187/187 y SOFT 28/28;
TypeScript de producto/integración, build, secuencia de migraciones y diez
checksums oficiales PASS. El benchmark canónico se ejecutó dos veces con salida
y artifacts byte-idénticos. El discovery y las exclusiones históricas de la
suite de producto son los del workflow vigente; la ejecución local usa Node 24.

```sh
node --import tsx --test engine/planner-next/mainFlowSoftPreference.spec.ts
node --import tsx script/demo/mainFlowSoftBlockDiagnostic.ts work/soft-first-cold --cold-only --candidate
node --import tsx script/demo/mainFlowSoftBlockDiagnostic.ts work/soft-first-a2 --a2-only --candidate
npm run demo:a2:smoke -- work/soft-first-native --historical-topology --full
```

## Ajuste normativo pendiente antes de activación productiva

Fuente 03 §7/SPEC-07 y Fuente 06 §7.1.2/§7.1.5 establecen minimización por defecto.
Su próxima versión consolidada debe conservar esa autoridad para AUTO y definir
la excepción humana explícita SOFT: N primero, alternativas por distancia y menor
número a igual distancia, restricciones HARD/REQUIRED y protecciones prevalentes,
con resultado completo y desviación/agotamiento explicados.

Fuente 04 §20.6 necesita distinguir una modalidad SOFT tipada de
`AUTO_MIN_FEASIBLE` y `FIXED_COUNT(n)` REQUIRED. La promoción posterior debe cubrir
configuración efectiva, provenance/revisión, snapshots/replay, adapter,
persistencia y UX conforme al gate end-to-end vigente. Fuente 05 deberá incorporar
los gates específicos de preferencia/fallback, y Fuente 00 elevar las versiones
consolidadas. Ninguna de esas Fuentes se modifica en esta unidad.

No se implementa FIXED_COUNT, UI, configuración diaria ni persistencia nuevas.
No se alteran DB/schema/migraciones, ORC/V3/V4, jornadas reales de Supabase ni
Replit. El ensayo usa exclusivamente servicios y catálogo descartables. No merge.
