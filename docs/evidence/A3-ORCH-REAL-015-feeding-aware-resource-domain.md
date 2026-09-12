# A3-ORCH-REAL-015 — envolvente de alimentación para `RESOURCE_TASK`

Base hija obligatoria: `3092cc789f915a032c9c325bd99c878d46d0b5aa`. El cambio es genérico y no contiene IDs, nombres ni horas de A2.

## Autoridad y decisión técnica

`preparePendingArrivalFeedingAuthority` conserva la semántica pública de `assessPendingArrivalFeeding`: prepara una vez el conjunto pendiente y las arrivals relevantes para el estado, y cada evaluación de frontera sigue delegando en `createPendingCompletionDeadlineAuthority` (propagación bidireccional) y `assessAnonymousPostInCompletions` (dominio hard, separación y capacidad conjunta de IN). Sólo el certificado negativo `PENDING_ARRIVAL_DEADLINE`, compartido con `checkMacroPendingPrerequisites`, autoriza poda; una prueba positiva o incompleta obliga a abstenerse.

El dominio constructivo parte ahora de los intervalos de `standaloneForwardDynamicDomain`. En cada intervalo evalúa el primer punto de grid; si éste queda certificado y el último no, busca por bisección la primera frontera no descartable. Un último punto también certificado elimina la región completa. La monotonía usada es exclusivamente necessary-only: al desplazar más tarde la primera obligación productiva se relajan los deadlines propagados de la cadena `IN reservado → Estilismo entrada reservado → primera obligación productiva`. Nunca se extrapola una evaluación inconclusa. Los puntos se materializan sólo mediante `starts()` al visitar candidatos.

No se añadió scoring, matching, repair, DFS oculto ni consumo de `ledger` al dominio. Meal freedom y compactación continúan limitándose a ordenar los starts supervivientes.

## Evidence productiva

Además de starts raw/eliminados/conservados, la Evidence registra intervalos raw/supervivientes, regiones completas eliminadas, evaluaciones reales de frontera, builds/hits de la autoridad preparada y coste temporal acumulado del dominio. El fixture focal conserva 10 starts lógicos, elimina el prefijo de 7 y deja `35/40/45`, pero reduce las evaluaciones de alimentación de 10 a 5 (un build y cuatro reutilizaciones). La variante con input invertido conserva fingerprint; membership incompleta mantiene la región por abstención. Los tests de la autoridad cubren también capacidad conjunta de IN, propagación por dependencias explícitas y equivalencia del certificado con `checkMacroPendingPrerequisites`.

## Full A2 5k

El baseline del head padre fue ejecutado previamente cuatro veces durante A3-ORCH-REAL-015 y no terminó; la ejecución más larga se interrumpió después de 38 minutos. No se amplió timeout ni presupuesto. El candidato, con diagnóstico OFF y presupuesto exacto 5.000, termina en 92,117 segundos y conserva `BRANCH_BUDGET_EXHAUSTED`, `CORE=1.599`, `STANDALONE=3.401`, frontier standalone máximo `129` y blocker `PENDING_ARRIVAL_DEADLINE` (primer cutoff `530`, demanda `2`, capacidad máxima `0`).

En el run candidato, `task:10182` pasa de dominio raw conocido `56` a dominio feeding-safe `53`; por monotonía de prefijo, el start `540` no se entrega al iterador constructivo. Globalmente se contabilizan `138.628` starts lógicos, `21.544` eliminados, `117.084` conservados y sólo `17.401` evaluaciones reales de frontera (12,6% de los starts). Se preparan `1.764` autoridades con `15.637` hits; el coste temporal acumulado del dominio es `13,29 s` en la primera ejecución (`13,53 s` en la repetición). Hay `12.144` intervalos raw, `9.840` supervivientes y `3.005` regiones eliminadas.

El gate operativo conserva CAM1/CAM2, coaches, setup y comidas bajo las mismas autoridades hard: no cambia configuración, constraints ni ordering. Se mantienen 9 prunes de comida operativa, 0 prunes de comida de participantes, 122 ramas de setup y 102 ramas de asignación sincronizada. `PENDING_ARRIVAL_DEADLINE` produce 683 prunes en la visita exacta. El run no publica plan parcial ni hace merge.

## Validación

- `npx tsx --test engine/planner-next/macroPendingPrerequisiteForwardCheck.spec.ts`: autoridad focal correcta.
- `npx tsx --test engine/planner-next/exactItinerantPlan.spec.ts`: el test preexistente de clasificación de un certificado espera `COLLECTIVE_CAPACITY`, mientras el head base devuelve `INDIVIDUAL_ZERO_DOMAIN`; los tests del delta pasan.
- `npm run check`: correcto.
- `git diff --check`: correcto.
- Full A2 candidato 5k: termina sin regresión de orden de magnitud; una repetición comprueba determinismo de los campos estructurales (el contador temporal queda excluido de fingerprints).

No se hizo merge.
