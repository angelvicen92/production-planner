# Future Collective Participant Closure: contrato de incertidumbre

PR #1103, siempre draft; rama `codex/preservar-cierre-colectivo-cross-stage`.
Base `codex/implementar-margenes-especificos-de-participante` @ `c00bb3d0b6211badad8d3b1352741b3dac1672ee`.
Head anterior auditado: `8a2bfa8ec9863ef8b232797792fab641e9b99c77`. Sin merge ni cherry-pick.

## Resultado actual: reorientación C

El diseño anterior promovía condiciones necesarias individuales a un certificado conjunto. Eso contradice las dependencias HARD y la exclusividad de recursos: dos predecesores pueden tener dominio individual `{0}` y ser conjuntamente imposibles. Esa promoción no admite una reparación conservando su significado; se retira y se limita el certificado a un contexto conjunto suficiente y reproducible.

**Dos A2-ASSIST-8 limpios del contrato corregido coinciden en 0/266: S1 inconcluso, sin propuesta ni aceptación.** No es Hall, agotamiento exhaustivo ni budget exhaustion: el scope no puede aportar 104 predecesores necesarios para el certificado exigido. Ningún explorador que produce contexto para ese gate contiene esas identidades. El check de cobertura devuelve `UNSUPPORTED_STANDALONE_SHAPE` / `FUTURE_COLLECTIVE_CLOSURE_INCONCLUSIVE`, con cero ramas. No afirma que esas tareas sean imposibles; demuestra que este call path no puede certificar su geometría.

No se presenta esto como mejora de extensibilidad ni como imposibilidad global de A2. Tampoco se mantiene la conclusión anterior de que S1/S2 tenían un certificado completo. Rehabilitar su aceptación exigiría cambiar la prueba positiva o aportar otro contexto suficiente; no se implementa coupling pipeline–Reality C–Reality A/B en esta unidad. El PR sigue sin estar listo para integración productiva.

Evidence vigente: [A2-COLLECTIVE-CLOSURE-CONTRACT.json](A2-COLLECTIVE-CLOSURE-CONTRACT.json). [A2-COLLECTIVE-CLOSURE.json](A2-COLLECTIVE-CLOSURE.json) conserva observaciones históricas del head anterior; sus fingerprints positivos no son certificados suficientes.

## Defectos reproducidos antes de corregir

Tres tests fallaron contra la implementación anterior:

1. Cierres de duraciones 10/5/5: `NECESSARY_ONLY = ABSTAIN / UNCERTIFIED_GEOMETRY`. Una realización independiente, con transporte construido por su autoridad, pasa `validatePlan(...).hardValid`. La integración devolvía `INFEASIBLE` sin certificado negativo.
2. Dos participantes, dos cierres y dos slots: ambos predecesores duran 10, tienen dominio `{0}` en espacios diferentes y requieren el mismo recurso exclusivo. El segundo no cabe junto al primero; `CERTIFY` devolvía `PASS/certified=true` usando sólo sus earliest ends individuales.
3. El terminal de comidas se abstiene en M1 y acepta M2. Antes sólo visitaba M1; ahora encuentra M2. Una abstención parcial tampoco elimina sus completaciones.

Las regresiones comprueban también contexto suministrado incompatible, contexto reparado que sí certifica, todas las comidas inconclusas, presupuesto agotado después de incertidumbre, alternativas de Stage y del set de futuros, input inmutable y testigos fuera de propuestas/protecciones.

## Contrato corregido y call path

- `INFEASIBLE`: sólo certificado necesario sound, Hall o contradicción necesaria entre una comida provisional y sus predecesores. Autoriza descartar esa rama.
- `PASS / NECESSARY_ONLY`: sobrevive el matching necesario; `certified=false`. No prueba realización conjunta de predecesores ni planning completo.
- `ABSTAIN`: no es prueba negativa ni aceptación. Comidas y contextos restantes siguen explorándose; sin certificado, el resultado agregado conserva incertidumbre.
- `PASS / CERTIFY`: exige ancestros de cierre, comidas y OUT en contexto; replay conjunto de prerequisites mediante `canPlaceTask`, matching válido, witness de comidas y continuación de la autoridad de transporte existente. No agenda ni persiste predecesores futuros.

`evaluate` → `closureCheck` → `completeLeaf` ya no poda una abstención necesaria. Antes de construir futuros, las comidas sólo reciben el check necesario cuando todavía falta su contexto conjunto; el certificado se exige en `futureWitnessSet.globalGate`. Sin futuros que aporten contexto, se exige en la continuación exacta de comidas del scope.

El meal DFS conserva las abstenciones terminales mientras prueba otras combinaciones; sólo un `ACCEPT` permite completar. `PARTICIPANT_MEAL_TERMINAL_ABSTAIN` se distingue de infeasibilidad conjunta y de budget exhaustion. No cuenta incertidumbre como rechazo por prueba negativa.

El coordinador de futuros agrega `INCONCLUSIVE`, incluso tras visitar todos sus candidatos. Sus exploradores mantienen la continuación existente: `DEAD_END` allí significa probar el siguiente candidato; un registro separado evita convertir incertidumbre en certificado universal de infeasibilidad. La misma agregación llega al Stage. La comprobación previa de cobertura evita buscar un certificado que ninguna alternativa de ese call path puede construir.

## Contraste con el head anterior

El benchmark anterior se ejecutó dos veces desde limpio en un worktree detached de `8a2bfa8`, sin cambiar código ni presupuesto. Reproduce material determinista y todas las cifras:

| Observación bajo S1/S2 protegidos | Resultado |
| --- | ---: |
| Completadas / total | 38 / 266 |
| Geometrías exactas de S3 visitadas | 92 / 92 |
| Ramas / presupuesto | 14.884 / 100.000 |
| Capacidad read-only: Hall / PASS necesario | 50 / 42 |
| Podas efectivas de otra autoridad: dominio individual cero | 16 |
| Podas efectivas del gate colectivo: Hall | 34 |
| Hojas completas / geometrías que llegan a futuros | 76 / 42 |
| Candidatos A/B / combinaciones completas | 0 / 0 |
| Abstenciones de cierre / budget exhaustion | 0 / no |

Las 50 clasificaciones Hall read-only incluyen 16 geometrías que la autoridad individual ya había descartado. No son 50 llamadas efectivas al gate. Las 42 restantes agotan la agenda A/B exacta antes de fronteras 960, 965, 970 o 975.

El S3 histórico no fallaba por convertir una abstención **de cierre** en `DEAD_END`: ese conteo era cero. La prueba es condicional a esas decisiones protegidas. No demuestra que todas las geometrías posibles de S1/S2 o todo A2 sean imposibles. El nuevo automático no llega a S3 porque no acepta S1 sin su prueba exigida; no se publican las 92 visitas históricas como resultado del head corregido.

## Validez de S1/S2 y separación de pruebas

| Capa histórica | Qué está demostrado |
| --- | --- |
| Future collective necessary capacity | Matching 19/19 bajo cada snapshot; `certified=false` |
| Certified future collective completion | No demostrado; ambos fingerprints anteriores carecían de contexto suficiente |
| Future structural witness set | Witnesses de supporting pipeline, rounds y A/B; cobertura limitada a sus unidades |
| Global meal feasibility | Witness/gate bajo su contexto; no demuestra ancestros pendientes ni completitud del día |

La auditoría read-only lista por identidad los 104 predecesores sin proveedor de contexto en ambas proyecciones. Incluye la cadena REQUIRED C/EVA/alfombra y otras obligaciones participantes. Un witness técnico independiente no equivale a geometría conjunta incorporada a ese set. No hay último witness **completo** colectivo demostrado en S1/S2; sólo capacidad necesaria y pruebas parciales separadas.

Las decisiones históricas no se reescriben. El runner conserva sus checks de preservación tras cada aceptación; el nuevo recorrido no acepta ninguna. Los tests de Assisted y del servicio verifican además preservación real de placements, decisiones y comidas protegidas.

## Hall histórico y precedentes

La primera pérdida necesaria sigue en S3: el joint `task:10069` + `task:10129` en 1105–1115 lleva sus descendientes a end mínimo 1125 y sus cierres a 1130; matching 19→18. `task:10215` añade el tercer cierre al mismo slot, 18→17. En S9 los starts directos 1130/1135 ocultan que 1135 termina en 1140 y no permite un OUT de cinco minutos antes del deadline. El override cierre→OUT sigue siendo 0, mediante `participantGapMinutes`.

El diagnóstico S1–S9 histórico conserva dominios, releases pendientes, Hall, comidas y OUT. Las identidades sólo son Evidence. De #1083/#1084 se reutilizaron conceptualmente matching/Hall, preparación/cache y continuación del meal solver; no se importaron commits y se descartan sus conclusiones A2 anteriores a las autoridades actuales.

## X/Y/Z/W/M y validación

- **X:** poda sin certificado negativo y falso certificado conjunto de cierre.
- **Y:** `ABSTAIN !== PASS` tratado como dead end, DFS de comidas truncado y cotas individuales promovidas a realización conjunta.
- **Z:** alternativas no examinadas y garantías futuras no demostradas, incluida la interpretación positiva de S1/S2.
- **W:** incertidumbre agregada, continuación de comidas/futuros, replay de prerequisites y certificado limitado a contexto suficiente; cobertura ausente produce resultado inconcluso.
- **M:** regresiones pasan; dos A2 nuevos equivalentes bloquean S1 con 104 predecesores sin contexto, sin aceptar Stage. El head anterior conserva 38/266 y 92 geometrías.

`npm run check`, `npm run build`, 185 tests focales y `git diff --check`: PASS. Suites: futureCollectiveParticipantClosure, participantMeals, exactItinerantPlan, assistedPlanning, assistedProposalService, placement, transportGrouping, participantTransition, futureStructuralWitnessSet, collectiveClosureCapacityProbe y exactItinerantPlan.memoization.

Dos A2 limpios corregidos comparan scopes, outcomes, ramas, snapshots/fingerprints, preparaciones, comidas, operational meals, set completo de futuros, certificados y HARD/REQUIRED. Dos runs limpios separados contrastan el head anterior. Budgets, timeouts, ordering, configuración A2 y HARD/REQUIRED siguen iguales. No hay cambios DB/schema/UI/API/ORC/V3/V4 ni scheduler nuevo de transporte, comidas o prerequisites.

CI alojado se contrasta por SHA en el body del PR; los tests focales descritos son locales. No se declara CI PASS sin ejecución publicada.
