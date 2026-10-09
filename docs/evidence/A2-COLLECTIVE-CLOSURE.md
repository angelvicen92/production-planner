# A2 — suficiencia del cierre colectivo

**Diagnóstico causal cerrado; suficiencia funcional A2: INCONCLUSIVE.** Esta unidad añade exclusivamente diagnóstico y prototipos aislados. El solver productivo conserva el resultado **0/266** y sus decisiones, budgets, timeouts, scopes, protección y accounting. No hay capacidad productiva nueva, cumplimiento de 266/266, imposibilidad global, merge ni otro PR.

PR #1103, base #1085 (`c00bb3d`). El contrato productivo vigente sigue en [A2-COLLECTIVE-CLOSURE-CONTRACT.json](A2-COLLECTIVE-CLOSURE-CONTRACT.json). El diagnóstico compacto está en [A2-COLLECTIVE-CLOSURE-SUFFICIENCY.json](A2-COLLECTIVE-CLOSURE-SUFFICIENCY.json). [A2-ASSIST-8-assisted-completion.json](A2-ASSIST-8-assisted-completion.json) conserva el histórico 209; [A2-COLLECTIVE-CLOSURE.json](A2-COLLECTIVE-CLOSURE.json) conserva el anterior 38. Ninguno se presenta como certificado actual.

## X — causa demostrada

Dos replays limpios independientes por estado, mediante el runner Assisted exportado, reproducen:

| Estado | Aceptadas | Resultado material |
|---|---:|---|
| Padre `c00bb3d` | 209/266 | S1–S9: 19→38→46→65→75→111→169→207→209. La relajación OUT-aware pasa de 19/19 a 17/19 en S3. |
| Anterior `8a2bfa8` | 38/266 | S3: 92 geometrías, 14.884/100.000 ramas, sin exhaustion. Rechazo condicionado a S1/S2 protegidos. |
| Productivo actual `176cfa4` | 0/266 | Guardia de cobertura: 209 ancestros exigidos, 104 sin productor de contexto, cero ramas. No prueba inviabilidad. |

**Los 209 también son dependencias directas de cierre, comidas u OUT. No existe aquí un subconjunto meramente transitivo que pueda borrarse.** Son las 247 tareas fuente menos los 19 cierres y 19 OUT; las 19 comidas completan las 266 obligaciones. El inventario JSON identifica cada ancestro por clase y proveedor; distingue representación estática de realización conjunta.

| Clase de ancestros | Cantidad | Efecto que el certificado debe conservar |
|---|---:|---|
| Pipeline actual: IN, entrada, vocal, Main y operaciones anchored | 82 | IN limita paquetes/releases; entrada comparte Estilismo con salida; vocal/Main fijan ocupación de participante, coach, unidad y recursos; anchored preserva adyacencia. Condicionan comidas y releases posteriores. |
| Totales en rondas | 19 | Releases propios, ocupación de dos lanes/participantes, preparación entre rondas y pausa operacional compartida. El matching de rondas debe aportar tareas y preparaciones al mismo contexto. |
| Reality A/B | 4 | Unidad concreta y recursos físicos, transición 15, comidas y disponibilidad. Comparten recursos con la cadena C/EVA; witnesses independientes no bastan. |
| P14: Giratuto, Pasillo, Redes y corners | 58 | Releases directos, ocupación de participante y espacios, pausa de P14 y huecos de Sodexo/OUT. No se descargan con un earliest-end individual. |
| P15: Croma, Estrellas y Sillón | 36 | CAM 2 compartida entre espacios; releases, participantes, continuidad, setup 10 y reentry prohibido; pausa P15. Necesitan geometría/matching compatible con las demás unidades. |
| Cadena técnica C/EVA y peer joint | 8 | Capacidad y continuidad de recursos, Eva desde 16:00, fases/adyacencia y joint Alfombra. La autoridad actual prueba reservas exactas individualmente, pero no las incorpora como unidad al set conjunto. |
| Totales Post joint | 2 | Dependen de Main/Alfombra, sincronizan dos participantes y elevan el release hacia Estilismo/OUT. |

Los **104** son P14+P15 (**94**) y cadena/peer+Post (**10**). Añadir la cadena al set sólo cubriría ocho; no resolvería los 96 restantes. La pérdida inicial del padre sigue siendo S3: el joint `10069+10129` a 1105–1115 deja dos cierres con el único slot OUT-compatible 1130; `10215` añade un tercero. Se deriva de autoridad canónica, no de horarios humanos.

## Y — alcance exacto y contrapruebas

`NECESSARY_ONLY/PASS` prueba sólo que la relajación de slots conserva matching; **no certifica realización conjunta**. Un Hall bajo dominios optimistas permite rechazar ese contexto; no demuestra inviabilidad de otro Main/bundle. `ABSTAIN`, cobertura ausente y budget exhaustion conservan incertidumbre.

`CERTIFY` exige ancestros concretos conjuntos y comidas canónicas; replay de placement; geometría de slots unitarios disjuntos; matching completo; validación de comidas y transporte OUT existente. El fingerprint está condicionado a ese contexto. **No reemplaza las autoridades REQUIRED de chain/round/setup, ni las pausas operacionales.** Una contraprueba nueva obtiene certificado de placement/cierre con dos miembros técnicos separados por un hueco: el prototipo que compone la cadena exacta lo rechaza. El gate productivo necesita esas garantías de sus explorers además del cierre.

Las otras contrapruebas prueban: ancestros individualmente posibles pero incompatibles por recurso exclusivo; pérdida colectiva de slots; OUT individual imposible; ancestro ordinario omitido; presupuesto insuficiente. Ninguna incertidumbre genera witness positivo.

No se ha reducido contexto para aceptar A2. Se pueden comprimir datos en un witness conjunto que conserve releases, ocupaciones y políticas; las capacidades examinadas no han demostrado todavía ese sustituto completo para esta frontera.

## Z — qué se decidió antes de S1/S2

El probe desde limpio utiliza arquitecturas y matching autorizados, la reserva técnica exacta, la agenda A/B exacta y Hall necesario. No recibe fingerprints ni placements históricos.

- Primera arquitectura: 92 reservas técnicas; 50 Hall y 42 relajaciones compatibles; cero agendas A/B. Frontiers 960/965/970/975.
- Arquitectura 29: pareja técnica–A/B encontrada en **55.752/100.000** ramas; cadena desde 975; matching necesario 19/19. Main y pausa cambian respecto a la primera arquitectura. Las 94 tareas quedan exclusivamente como contexto efímero; aún faltan **115** ancestros: P14/P15 94, rondas 19 y Post 2.
- Replay con S1 protegido, incluida su pausa aceptada: 100 geometrías nominales de soporte, una hoja hard-valid, 92 reservas, ningún par, **4.398** ramas. Esto sólo agota esa frontera: el generador varía Styling, no todas las geometrías vocales posibles.
- Replay con S1/S2 protegidos, incluidas sus pausas: **100.000/100.000**, sin pareja; queda inconcluso por presupuesto. La prueba anterior de las 92 geometrías sigue siendo condicional al bundle de aquella ejecución.

Existe una alternativa de Main/bundle antes de S1 para la pareja probada. **No está demostrado que cambiar Main sea necesario, ni que baste cambiar el soporte antes de S2.** La dependencia pendiente es una continuación exacta de alternativas vocales/soporte bajo Main protegido; las cotas y la frontera nominal Styling no deciden esa pregunta. Los replays preservan decisiones y pausas aceptadas dentro de cada ejecución.

## W — reparación mínima y archivos

El prototipo acotado compone **una** cadena exacta existente → comidas exactas → cierre/matching → OUT → validador HARD/REQUIRED. Rechaza el primer candidato que destruye su continuación, acepta otro con witness conjunto y avanza a un segundo Stage conservando lo aceptado. No añade un scheduler residual ni interviene en decisiones productivas.

Para A2 se probó también el residual con el solver existente: 94 tareas efímeras fijas; scope analítico de 96 productivas y 19 comidas; 19 rondas futuras. Incluir comidas evita confundir sus IDs con dependencias productivas sin resolver. Conserva el ledger 100k. Una primera hoja ordinaria llega a 13.204 ramas y reduce matching **19→16**, afectando C01/C09/C17. Se consumen las 86.796 restantes buscando continuación; P15 examina 241 geometrías/matchings y una primera realización. Termina `STANDALONE_BRANCH_BUDGET_EXHAUSTED`, sin certificado positivo. Hall necesario demuestra que la pareja técnica–A/B tampoco basta para aceptar el Stage.

**Reparación propuesta, todavía pendiente de prueba funcional:** conectar la continuación conjunta a la elección de bundle antes de aceptar S1/S2; conservar los productores de cadena, rondas, A/B, P14/P15, Post y comidas en un contexto acumulado. Reutilizar sus explorers y continuations. El experimento mínimo pendiente es comprobar releases/slots residuales durante esa composición y exigir un witness exacto compatible con todas esas autoridades dentro del ledger vigente. No eliminar ancestros, aceptar incertidumbre, aumentar budgets ni crear una nueva búsqueda global.

Archivos de esta unidad:

- `engine/planner-next/benchmarks/collectiveClosureSufficiencyProbe.ts` y `.spec.ts`: composición acotada y contrapruebas.
- `engine/planner-next/benchmarks/a2ClosureSufficiencyDiagnostic.ts` y `.spec.ts`: inventario, replay canónico, frontera y residual aislados, neutralidad.
- `server/benchmarks/runA2CollectiveClosureEvidence.ts`: reutiliza el runner; corrige sólo reconstrucción diagnóstica de recursos/unidades aceptados y conserva pausas; recopila y emite Evidence compacta.
- Este documento y `A2-COLLECTIVE-CLOSURE-SUFFICIENCY.json`.

Ningún archivo productivo del solver, canon, DB, UI, scope resolver, presupuesto o test de expectativas de producto cambia. Los históricos grandes se conservan; la Evidence nueva evita duplicar snapshots completos.

## M — validación y aceptación funcional

**76 tests focales PASS**, incluidos diez nuevos tests de suficiencia, contrapruebas, replay, neutralidad y determinismo. TypeScript y build PASS. Dos replays limpios por cada uno de los tres estados; dos probes por cada frontera. El residual con diagnóstico desactivado/activado coincide en status, decisiones, certificado, counters y presupuesto; su comparación está en la Evidence.

El [Planner Engine CI heredado de #1085](https://github.com/angelvicen92/production-planner/actions/runs/37839622776), job `113525400199`, tiene tres fallos en 2775 tests (2771 PASS, uno skipped):

| Fallo heredado | Clasificación y límite |
|---|---|
| A2-ASSIST-1 propone 19 con 6000 | `STANDALONE_BRANCH_BUDGET_EXHAUSTED`: core 2292 + standalone 3708 = 6000; `proposalCount=0`, esperado 1. La expectativa se conserva. |
| Aislamiento Planner Next | Frontera diagnóstica no registrada: primer archivo señalado `server/benchmarks/runA2Assist8ManualEvidence.spec.ts`. No equivale a prueba de una entrada productiva nueva; el allowlist no se amplía. |
| ASST-010 rollback/divergence | El prerequisite del escenario falla por `STANDALONE_BRANCH_BUDGET_EXHAUSTED`, `NO_PROPOSAL` frente a `PROPOSAL`. El escenario no llega a demostrar rollback/divergence; no se rebaja su expectativa. |

La reproducción focal del padre da **8 PASS / 3 FAIL**. Con el gate actual, los mismos archivos más A2-ASSIST-8 dan **7 PASS / 5 FAIL**: el contrato de budget pequeño también falla al recibir INCONCLUSIVE y A2-ASSIST-8 espera 19, recibe 0. El fallo canónico y ASST-010 pasan a bloquear por cierre inconcluso. Son consecuencias productivas del head `176cfa4`, no correcciones ni fallos nuevos introducidos por este diagnóstico. No se declara CI de producto verde.

Aceptación funcional pendiente: una ejecución limpia acepta al menos S1/S2 con certificado conjunto suficiente; cada Stage posterior conserva su continuación y los placements/pausas ya aceptados; contrapruebas permanecen negativas o inconclusas; source266, disponibilidad C01 15:30/C02–C19 19:00, margen default5, salida.after0/OUT.before0, Estilismo1, IN target3/max3/gap30 y HARD/REQUIRED permanecen intactos. No exigir fingerprints históricos en esa ejecución ni contabilizar witnesses como obligaciones aceptadas.

Reproducción, con worktrees detached del padre y anterior y node_modules disponibles:

```sh
node --import tsx server/benchmarks/runA2CollectiveClosureEvidence.ts --collect-sufficiency-observations --parent-root /path/to/c00bb3d --previous-root /path/to/8a2bfa8 --observations-directory /tmp/a2-closure
node --import tsx server/benchmarks/runA2CollectiveClosureEvidence.ts --sufficiency-diagnosis --observations-directory /tmp/a2-closure
```

Las observaciones proceden de `runA2Assist8Evidence({writeEvidence:false})` por defecto. No ejecutar el CLI histórico que sobrescribe el 209 para este contraste. La Evidence nueva es un suplemento diagnóstico del contrato vigente; su conclusión permanece **INCONCLUSIVE** hasta obtener la continuación residual positiva y decidir la alternativa de soporte bajo Main protegido.
