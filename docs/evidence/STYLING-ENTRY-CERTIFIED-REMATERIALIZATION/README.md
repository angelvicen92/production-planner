# Materialización temprana certificada de Estilismo entrada

## Unidad y autoridad

Base exacta `7620449e77f280f6fb2341376aa12653eaffdf16` (diagnóstico #1164), rama `codex/styling-entry-certified-rematerialization`. Se aplican AGENTS.md, Fuente 00 v2.13, 03 v3.7 (supporting reparable, preferencia temprana y presupuesto), 04 v2.7 (scope, configuración efectiva y protección), 05 v2.7 (gates, completitud y calidad), 06 v2.10 (canon y capacidad) y el Gate Causal Integral de 07 v2.2 §4.4. Se consultaron el catálogo de capacidades y el protocolo causal local. Las Fuentes permanecen intactas.

## Gate causal antes del cambio

1. **Estado recibido:** S0 vacío; 266 obligaciones canónicas, configuración efectiva AUTO/EXACT_CONSTRUCTIVE, presencia OFF, capacidad Estilismo 1, margen general 5 con overrides terminales, IN 3/3/30. Budget vigente 100000 ramas por Stage y checkpoint Assisted 300000 ms. Cada continuación recibe únicamente lo aceptado como protección y el resto como witness efímero.
2. **Recorrido real:** recomendador de unidades → `assistedProposalService` request/run → `buildAssistedProblem` → `executeAssistedPlanning` → `executePlannerNext` → `constructExactItinerantPlan`/`runExactItinerantPlanSearch` → replay `JOINT_COMPLETION` → cierre futuro colectivo → validación proyectada → propuesta visible → apply/validate/accept. S1 construye el certificado completo; S2–S11 lo reutilizan. S8 acepta apertura.
3. **Lectura de producción:** preservar IN, estructura, recursos, comidas y decisiones aceptadas es correcto. La hora interna de una entrada todavía invisible no es una decisión humana protegida. Adelantarla puede aplicar la preferencia existente sin alterar otras obligaciones.
4. **Primera decisión relevante:** el retorno del replay en `exactItinerantPlan.ts` proyecta directamente las horas del certificado. El diagnóstico previo demuestra el contrafactual completo C03 11:25 → 09:10. No corresponde cambiar el constructor principal ni reinterpretar huecos de Estilismo como continuidad REQUIRED.
5. **Comparación controlada:** el baseline se ejecuta sobre la base exacta, con las mismas dependencias y runtime que el candidato. No se usa el artefacto histórico BLOCKED/S6 como baseline vigente.
6. **Clasificación:** falta de aplicación nominal de una preferencia temprana. No hay evidencia de poda HARD errónea, agotamiento, imposibilidad del día ni necesidad de modificar IN.
7. **Hipótesis falsable:** el horario tardío X es causado por la conservación nominal Y del witness y mantiene demora de entrada Z. El delta W, rematerializar exclusivamente entradas visibles antes de aceptación con certificación completa, debe producir M: adelantos deterministas con 266/266, protecciones e IN intactos dentro del mismo ledger. Una pérdida de cobertura o un cambio de otra obligación refutaría el delta.

## Delta focal y fronteras

`assistedPlanning.ts` transmite los IDs explícitos del scope a través de `executePlannerNext.ts`. En el retorno del replay, **después** de validar el certificado original, el cierre futuro y la proyección, `earlyEntryMaterialization.ts` intenta adelantar únicamente auxiliares visibles no protegidas que tienen un IN como dependencia y alimentan al main del mismo participante. Es la identidad estructural ya usada por el productor del pipeline; no se leen nombres, horas, espacios ni IDs A2 en lógica productiva.

Se hace una pasada determinista. El orden usa el dominio exacto temprano de cada tarea y su disponibilidad efectiva; el ID sólo desempata esas señales. Para cada tarea se recalcula el dominio con todos los demás vértices del certificado fijos y se prueban sus starts anteriores en orden ascendente. Se conservan íntegros IN, salida/OUT, otras tareas, assignments, comidas y preparaciones. Otra entrada sólo cambia cuando le corresponde su propio intento visible y certificado.

Cada candidato exige `canPlaceTask`, un nuevo fingerprint canónico, `revalidateJointCompletionWitness` sobre el **problema completo**, `PreparedFutureCollectiveParticipantClosure.evaluate(..., CERTIFY, spaceMeals)` y `validatePlan` de la proyección. Se reutilizan así disponibilidad, márgenes, recursos, ocupaciones, capacidad, dependencias, comidas, transporte, unidades y restricciones futuras existentes. Un fingerprint firmado por sí solo no sustituye la validación semántica.

La preparación/recomputación de cada dominio y cada candidato consumen ramas STANDALONE; replay y cierre cobran sus vértices con el mismo ledger. No hay un ledger nuevo, reserva añadida ni aumento de presupuesto/timeout. La Evidence registra orden, intentos, movimientos, fingerprints, consumo y stop reason. Si falla un candidato, no se aplica. Si acaba el presupuesto o llega el checkpoint de tiempo durante la mejora, se conserva el último certificado completo validado, incluido el original si todavía no había mejora. Esto no se presenta como inviabilidad.

El certificado actualizado continúa siendo efímero. La propuesta contiene sólo los IDs visibles; ningún supporting se acepta por el replay. Sólo la aceptación del Stage crea protección. Los Stages posteriores reciben el certificado actualizado y conservan las entradas que ya se aceptaron.

## Resultados A2 y Gate causal después

Los valores completos y las dos ejecuciones finales están en [report.json](report.json). Sus assertions verifican:

- 266/266, once Stages, cero HARD/REQUIRED nuevos, identidades y daily tasks iguales al último Stage.
- S1–S7 idénticos al baseline salvo duración, incluyendo sus snapshots; misma secuencia de scopes en S1–S11.
- Historial y placements protegidos preservados en cada transición; comidas, preparaciones, IN, salida/OUT y todas las tareas ajenas a entrada literalmente iguales.
- Replay completo y cierre futuro CERTIFY independientes en los once Stages, además de validación manual canónica del snapshot final.
- Dos runs del candidato profundamente iguales **excepto** `iterations[*].durationMs`; también coinciden todos los snapshots aceptados. No se excluyen contadores, decisiones, scopes, certificados ni fingerprints.

La primera diferencia causal aparece en S8: cuatro entradas se adelantan con sus cuatro certificados completos. C03 pasa de 11:25 a **09:20** en el scope de apertura completo: C02 usa 09:10 y la capacidad 1 sigue vigente. El ensayo focal de C03, desde el contexto protegido real de S7 y con sólo esa entrada visible, alcanza **09:10**, conserva las otras 265 obligaciones y pasa la validación manual de producto. Ambos resultados son compatibles; 09:10 es una referencia de prueba, no una condición del motor.

| Entrada | Baseline | Apertura completa | Adelanto |
|---|---|---|---:|
| C02 | 10:45 | 09:10 | 95 min |
| C03 | 11:25 | 09:20 | 125 min |
| C04 | 10:55 | 09:40 | 75 min |
| C08 | 09:55 | 09:30 | 25 min |

Se mantienen 22053 ramas en S1 y 293 en los demás replay sin mejora. S8 usa 1507 frente a 293: **1214 ramas adicionales** para la rematerialización completa, con total **24983 → 26197 (+4,86%)**, dentro de 100000 por Stage. La reconciliación de esta ejecución es `19 dominios de orden + 19 dominios actuales + 4 × (1 candidato + 293 vértices de replay/cierre) = 1214`. Los tiempos medidos por Stage y los totales de ambos candidatos están en el informe; no se modifica el reloj ni el techo. La diferencia se concentra en la certificación de apertura, sin reiniciar búsqueda estructural.

Tiempo total baseline **72,875 s**; candidato **73,011 s** y repetición **71,504 s**. S8 pasa de **119 a 514 ms**. La sobrecarga de certificación es observable y acotada; las fluctuaciones del total no acreditan aceleración. Fingerprint final baseline: `b9df879577cd8fb3d1b32e4588d6da0ad404739341a431e587eee4f68fa4f30f`; ambos candidatos: `e8772f4c8e8282b3f63c273364b57274116263127b411a22d9494a2569faf6e6`.

**X** —conservación de horas nominales tardías pese a existir adelantos completos válidos— era causado por **Y** —retorno directo del replay— y producía **Z** —demora adicional del prerrequisito—. **W** introduce la materialización nominal acotada en esa frontera y se observa **M** —cuatro adelantos, caso focal 09:10, cobertura/protecciones intactas y certificados deterministas—. No se ha desplazado un blocker ni relajado una autoridad: el baseline ya era completo y el candidato sigue completo.

## Calidad y tradeoffs

IN y OUT no cambian: permanencia agregada **9180 minutos**, misma distribución individual y mismo cierre global 19:00. La suma de las esperas brutas IN-fin → entrada disminuye **1130 → 810 minutos (−320)**. No se interpreta esa magnitud como el KPI global de espera evitable ni como reducción de permanencia.

Estilismo conserva **285 minutos** productivos y utilización sobre ventana diaria **39,58%**; la amplitud aumenta **540 → 585 minutos** porque la primera entrada se adelanta. Los huecos internos se registran, sin penalizarlos ni crear continuidad. Una mayor amplitud del espacio es un tradeoff admisible frente a la preferencia de entrada temprana.

El informe conserva todas las fronteras de tareas y sus márgenes antes/después. Adelantar al primer hueco puede consumir slack local: el caso aislado C03 reduce la holgura después de IN a cero sobre el margen mínimo. En apertura conjunta conserva 10 minutos sobre ese margen. Las comidas se validan por separado y no se convierten en tareas sintéticas para calcular esas fronteras. No se declara P10 completo, umbral de robustez nuevo ni superioridad Pareto.

## Reproducción y validación

Desde la raíz, con las dependencias declaradas instaladas:

```sh
bash docs/evidence/STYLING-ENTRY-CERTIFIED-REMATERIALIZATION/reproduce.sh /tmp/styling-entry-reproduction
```

El script exporta la base exacta a un checkout temporal, reutiliza el mismo `node_modules`, ejecuta baseline y dos candidatos con el capture existente y verifica toda la comparación. Guarda los tres runs y snapshots crudos en el destino; sus hashes quedan en el informe. `candidate-witness.json` y `causal-case-witness.json` permiten replay de los horarios finales entregados. La duración y los hashes del JSON crudo varían entre reproducciones; las decisiones, fingerprints, presupuestos y la igualdad material deben mantenerse.

Pruebas y comandos del gate local: [validation.md](validation.md). La suite nueva cubre otras entradas, capacidad compartida, invisibilidad/protección, ningún adelanto posible, candidatos tempranos inválidos por comida y REQUIRED, configuración de márgenes/recursos/espacio, agotamiento, timeout, rechazo de proyección, conservación del original/incumbent, wiring Assisted AUTO/SOFT y el caso certificado #1164.

## Límites y ensayo real de producto

Esta Evidence es **offline**: usa el benchmark existente de servicios request/run/apply/validate/accept con persistencia en memoria, más los validadores canónicos y manuales reales. No acredita HTTP, navegador, SQL, una jornada remota ni aceptación humana en producción. El ensayo remoto previo permanece como historia con su propia revisión; no se presenta como prueba del candidato. La validación real de producto de este head queda pendiente de una unidad autorizada, sin tocar datos productivos aquí.

El cambio actúa sobre un `JOINT_COMPLETION` completo revalidado. La construcción fría y su geometría no cambian. La pasada nominal es local y monotónica: no busca permutaciones globales, no mueve una entrada más tarde para liberar a otra ni repite hasta un óptimo. Puede dejar oportunidades posteriores que se abran al mover otra entrada; no promete un mínimo global de espera ni que todas las entradas mejoren. Un intento sin certificado dentro del presupuesto conserva una solución válida.

No se tocaron Fuentes, SQL/RLS, API, UI, transporte, criterios globales, presupuestos, timeouts, Estilismo salida/OUT ni la línea de diálogos premium. No hay merge ni despliegue.
