# ASST-010 — conflicto mínimo y límites de los cambios de exploración

PR [#1104](https://github.com/angelvicen92/production-planner/pull/1104), mismo
branch, draft y sin merge. Fecha: 2026-10-10. HEAD de partida verificado:
`bc7cb5cea0a6b48a62f2cdacb55f26f5dca2a4f0`. Código productivo probado y finalmente
conservado: `b4425e39f9c80c95c1edaa8d05b9b34854101a05`, sin delta productivo en
esta iteración. [Datos, scripts, contrapruebas y manifiesto](ASST-010-S2-CONFLICTS.json).
El HEAD publicado y su CI exacto se registran en el PR.

**ASST-010 continúa abierto.** El control final desde S0 propone y acepta S1,
refresca 19 entradas de Estilismo 10→20 y preserva Main 10017 en `[835,850]`.
S2, selector `TASK_IDS:[10015]`, retorna `NO_PROPOSAL /
ASSISTED_SCOPE_INCOMPLETE / SEARCH_TIME_LIMIT_REACHED` en **300.044,553 ms**:
`4.504 CORE + 54.298 STANDALONE = 58.802 / 100.000`. Cero hojas completas,
cero certificados conjuntos. La assertion canónica de propuesta S2 falla.
Máximo Stage aceptado: **S1**. AcceptedException, provenance, rollback, redo,
divergencia y recertificación canónicos: **NOT_REACHED**. El timeout no demuestra
inviabilidad global.

Dos A2 nuevos, sin instrumentación y desde S0 vacío, completan **266/266 en
10 Stages**, con S1 **94.119 / 64.163 ms**. Material, placements, fingerprints y
los 1.140 valores de accounting comparados con el baseline publicado permanecen
idénticos. Los tres experimentos de búsqueda se han revertido. Se conservan
dos contrapruebas de regresión y esta evidencia.

## X/Y/Z/W/M

- **X:** tras el refresh, S2 consume el tiempo permitido sin certificado y por
  debajo del límite de ramas.
- **Y:** entradas ajenas al conjunto de prerequisites actual tienen dominios
  mucho más estrechos. El primer vacío real está en 10057; prefijos con decisiones
  irrelevantes vuelven a calcular sus consecuencias para las 19 salidas.
- **Z:** no se acepta S2 ni se alcanza el resto del gate de producto.
- **W:** ensayar producción anticipada de todos los ancestros, aprendizaje de
  conflictos canónicos y selección de un ancestro más estrecho. Descartar los
  tres por ausencia de progreso funcional. Conservar tests de alternativas
  posteriores a un frontier ajeno y de recertificación tras refresh.
- **M:** el control restaurado sigue sin S2. A2 conserva 266/266 dos veces,
  protección literal y los mismos cargos. No se declara mejora del producto.

## Primera causa, antes del síntoma C05

Se parte exclusivamente del replay read-only registrado en
[la evidencia anterior](ASST-010-S2-COMPUTATION.md), core 9, fingerprint
`99e2c205f343cc8b9821e0b4451c6be8a8f1505014c2589d2f08141bacdb1031`.
Ese contexto nunca se suministra como seed o witness al servicio.

De los **16 subconjuntos** de las cuatro entradas originales, el único conflicto
mínimo por inclusión es:

| Decisión provisional | Inicio | Fin |
|---|---:|---:|
| 10162 | 610 | 630 |
| 10073 | 585 | 605 |

10044 `[640,660]` y 10148 `[550,570]` son irrelevantes para ese vacío concreto.
La primera dependencia sin dominio es **10057, ESTILISMO_ENTRADA de C05**,
duración 20, espacio 3018. IN 10060 acaba en 575; el gap del participante es 5,
por lo que su límite inferior es **580**. En la raíz tiene ocho inicios legales
`580,585,590,595,600,605,610,615`. La pareja anterior ocupa ese hueco. El barrido
completo con `canPlaceTask` confirma **cero inicios legales**, además del dominio
dinámico vacío. Las operaciones aceptadas/provisionales 10063 `[640,655]`,
10064 `[670,685]`, Main 10056 `[685,700]` y 10065 `[700,715]`, junto con sus
precedencias y márgenes, impiden desplazar esa entrada detrás de ellas.

`earliestEnd(10057)` devuelve **Infinity**, propagado a 10054 (CAM1), 10055,
10059, 10062, 10066, 10068 y Sodexo 10067, y finalmente al release de OUT 10058.
`JSON.stringify(Infinity)` produce `null`: no se ha encontrado NaN ni un ciclo.
C05 queda sin vecinos: Hall individual 1/0 y matching colectivo **18/19**.
El JSON conserva la traza explícita de los valores no finitos y los bloqueadores
canónicos por inicio.

En el orden original, la cuarta decisión 10073 provoca el vacío y el gate lo
comprueba inmediatamente: **cero decisiones adicionales antes de detectarlo**.
La hipótesis de un check tardío en ese camino queda refutada. Pasar un check
necesario en los prefijos anteriores tampoco certifica su viabilidad global.
Mover 10073 a `[660,680]` sigue siendo una contraprueba necesaria positiva;
no certifica una continuación completa.

El desperdicio observado es recomputar el cierre completo de 19 salidas y su
matching para otros prefijos que contienen el mismo bloqueo. Las firmas de
contexto completo incluyen las entradas irrelevantes. En el control anterior
los 804 contextos de prerequisites de core 9 eran distintos; memoizarlos enteros
no elimina esas recomputaciones. El aprendizaje certificado ensayado abajo
demuestra reutilización, pero su coste y su posición en el árbol impiden una
ganancia funcional medida.

## Orden y conflictos después del cambio

MRV sólo compara los siete prerequisites de la cadena actual. Los primeros
dominios de la misma raíz muestran la restricción que queda fuera del conjunto:

| Entrada | Inicios | Pertenece al conjunto actual |
|---|---:|---|
| 10057 | 8 | No |
| 10103 | 9 | No |
| 10003 | 14 | No |
| 10117 | 15 | No |
| 10044 | 18 | Sí |
| 10148 | 27 | Sí |
| 10162 | 30 | Sí |
| 10073 | 31 | Sí |

Ordenar sólo el conjunto existente deja 10057 sin producir. Producir todos los
ancestros aumenta la profundidad; no llega a una hoja de prerequisites en el
replay de 2.000 cargos. Añadir únicamente el ancestro externo más estrecho
10057 mueve el primer conflicto a **10103 / C08 / OUT 10104**.

El replay emparejado sobre la misma raíz, sin seed productivo, prueba los 64
subconjuntos de sus seis primeras decisiones. Su único conflicto mínimo es
**10057@580, 10044@640, 10073@600 y 10219@670**. El barrido canónico confirma el
dominio vacío de 10103. Es otro bloqueo local, sin prueba negativa global. Las
hojas de los replays de prerequisites usan un callback que devuelve DEAD_END
deliberadamente; no son hojas completas del planificador. El stop diagnóstico
tras el primer Hall tampoco es un resultado del producto.

## Tres ciclos auténticos y control restaurado

Cada ciclo usa `runA2Assist7Evidence()` con las expectativas originales:
S0→propuesta/aceptación S1→refresh de 19 entradas→S2 sólo 10015. Misma protección,
canon, ledger máximo 100.000 y límite cooperativo 300.000 ms.

| S2 | Tiempo, ms | CORE | STANDALONE | Checks cierre | Hits cierre | Traversals | Hojas completas / certificado |
|---|---:|---:|---:|---:|---:|---:|---|
| Baseline publicado | 300.060,050 | 4.354 | 50.641 | 19.354 | 43.611 | 394.819 | 0 / ninguno |
| Todos los ancestros | 300.208,574 | 4.045 | 36.862 | 18.375 | 0 | 721.078 | 0 / ninguno |
| Conflictos canónicos | 300.085,355 | 4.240 | 43.452 | 12.492 | 40.164 | 229.095 | 0 / ninguno |
| Un ancestro más estrecho | 300.060,023 | 4.070 | 40.019 | 21.239 | 2.993 | 447.179 | 0 / ninguno |
| Control final restaurado | 300.044,553 | 4.504 | 54.298 | 21.673 | 43.998 | 446.219 | 0 / ninguno |

S1 de esos ciclos: 53.691,837 / 81.139,180 / 105.203,888 / 54.370,475 ms.
Todos consumen las mismas **21.975 = 4.766 CORE + 17.209 STANDALONE** ramas
en S1. Son procesos observados mediante timers y dumps read-only, sin profiler
ni watchdog que sustituya el límite del producto. El primer trial solapó al final
de S2 un replay diagnóstico; no se atribuye a él una mejora controlada de latencia.
El control restaurado también muestra variación de throughput sin delta de código.
Más ramas visitadas al corte no equivale a progreso funcional.

1. **Todos los ancestros:** reutiliza el explorador existente antes de la cadena.
   Cero hojas completas; se descarta. Replay de 2.000 cargos: referencia
   603 hojas de prerequisites y 33.472 traversals; todos los ancestros 0 y 52.843.
2. **Conflictos certificados:** la nominación analítica se confirma recorriendo
   todos los inicios con la autoridad canónica y cargos STANDALONE. Cache local
   de hasta 256 certificados, raíz literal, IDs únicos, canon/comidas fijos y
   fallback conservador. Pruebas previas cubren falso conflicto por márgenes
   asimétricos, raíz alterada/duplicada, refresh, comidas, agotamiento y un oracle
   exhaustivo pequeño con soluciones válidas. En ASST produce **87 certificados,
   2.367 hits y 4.343 cargos de certificación**, pero **0 backjumps de prerequisites
   y 0 alternativas saltadas**. Reduce checks dentro del trial; los cargos cambian
   la frontera de la coordinación diferida. No son diferencias sobre un mismo
   recorrido. Replay de 4.000 cargos: 1.236→1.064 hojas de prerequisites,
   2.001→1.581 checks y 66.874→53.323 traversals; 710 cargos nuevos. Se descarta.
3. **Un ancestro más estrecho:** sólo añade el menor dominio externo si es más
   pequeño que cualquiera del conjunto requerido, sin IDs ni horarios productivos
   fijos. Desplaza el conflicto a C08 y sigue sin S2. El run completo cargó la
   versión anterior al guard de frontier. Añadir un prerequisite ajeno a una
   agenda puede truncar sus alternativas tardías; el guard posterior sólo admite
   dominios enteramente dentro del frontier. Su fixture pasa, pero **esa versión
   guardada no se volvió a medir en ASST**. Ambas versiones se descartan.

Contrastes adicionales: `checkMacroPendingPrerequisites` no añade poda útil;
la autoridad técnica exacta anticipada conserva 991 decisiones, 595 hojas de
prerequisites, 992 cierres y 33.167 traversals, con **0 podas técnicas** en ambas
posiciones. Un primer replay había duplicado miembros futuros al construir su
proyección; se detectó y excluyó. Sus rechazos aparentes no son evidencia válida.
La proyección corregida omite esos miembros antes de que la autoridad los añada,
igual que el productor. Los checks individuales de entradas futuras tampoco
reducen los primeros dominios estrechos. No se incorpora ninguno de estos wiring.

## Delta retenido y auditoría acumulada

Se conservan sólo dos tests:

- `supportingGeometryRepair.spec.ts`: una entrada ajena y más estrecha conserva
  la alternativa `[70,90]` posterior al frontier 85 de otra agenda. La agenda acaba
  antes de 85; solución canónica válida, contexto protegido literal y ledger correcto.
- `jointCompletionWitness.spec.ts`: cambiar una duración invalida el witness
  conjunto anterior. El scope explícito se recertifica con la duración vigente,
  determinismo, tareas Main/Vocal/support aceptadas literales, futuro oculto y
  revalidación independiente cobrada.

Auditoría del código acumulado, respaldada por las suites finales:

- **Continuaciones diferidas:** conservan raíz, contexto de matching y siblings
  prohibidos. La reevaluación se cobra. Sólo STANDALONE recibe quantum local;
  una abstención/deferral no genera una prueba negativa ni interrumpe CORE después
  de avanzar su autoridad. Tests de reentrada, excepciones y siblings pasan.
- **Cache de ronda:** vive dentro de un probe con ocupaciones/comidas fijas;
  guarda booleanos canónicos ID/start. Se mantienen lanes y validación conjunta.
  Un estimate cero no elimina las alternativas del DFS exacto.
- **Cache de cierre:** canon/raíz clonados, preparaciones limitadas a 16 claves
  de comidas. Reutilización sólo con filas literales de raíz e IDs únicos. Raíz
  cambiada, ausente o duplicada recurre a la autoridad completa. Sin cache global
  ni supervivencia entre refreshes.
- **Interrupción/persistencia:** un ledger 100.000, checkpoints cooperativos,
  excepción tipada capturada únicamente en la frontera exacta. Salidas parciales
  vacías, sin fingerprint ni certificado. Restauración de `consume` en `finally`;
  otros errores se propagan. El test de servicio real verifica un único
  NO_PROPOSAL persistido y ninguna escritura de aplicación/draft lateral.
- **Origen A2:** dos llamadas nuevas con sólo reporting de duración, sin snapshot,
  seed, override de selector ni witness inicial. S0 está vacío. Los witnesses de
  stages posteriores proceden de las propuestas anteriores realmente aceptadas.

**Límite de cobertura detectado:** `runA2Assist7Evidence` escribe `proposalRunId`
en draftScope, pero su fake `acceptStage` no lo incorpora al Stage. S2 informa
`priorFutureStructuralWitnessFound=false`: estos runs canónicos hacen búsqueda
nueva y no prueban reutilización del witness obsoleto tras refresh. No se modifica
el benchmark. Producción SQL 077–086 conserva `proposal_run_id`; el fake de
A2-ASSIST-8 también lo conserva. El nuevo test prueba explícitamente invalidación
y recertificación; los tests de lineage del servicio prueban revisión/fingerprint.
No se ha encontrado un defecto productivo que justifique otro delta en esta unidad.

## Regresiones finales y estado de entrega

| Stage | Aceptadas ambos | Nuevas visibles | Ramas ambos | Run 1, ms | Run 2, ms |
|---|---:|---:|---:|---:|---:|
| S1 | 19 | 19 | 21.975 | 94.119 | 64.163 |
| S2 | 38 | 19 | 293 | 724 | 187 |
| S3 | 46 | 8 | 293 | 467 | 144 |
| S4 | 65 | 19 | 293 | 291 | 149 |
| S5 | 75 | 10 | 2.238 | 14.581 | 8.151 |
| S6 | 111 | 36 | 293 | 415 | 130 |
| S7 | 169 | 58 | 1.698 | 7.025 | 5.401 |
| S8 | 207 | 38 | 293 | 127 | 411 |
| S9 | 209 | 2 | 293 | 227 | 405 |
| S10 | 266 | 57 | 293 | 345 | 200 |

Totales **118.617,007 / 79.566,535 ms**. En los 20 Stages: accounting visible
exacto, tareas/meals aceptadas preservadas literalmente, nuevos HARD/REQUIRED=0,
supporting y futuro ocultos y sin protección anticipada. Cada certificado conjunto
contiene 247 tareas + 19 Sodexo y las 51 tareas con CAM1 vigente sin solapamientos.
Veinte replays independientes pasan con 292 cargos cada uno; búsqueda+auditoría
máximo **22.267/100.000**. En S1 sólo se aceptan los 19 Main visibles.
Los fingerprints y las 1.140 comparaciones de work coinciden con el baseline.

```text
Material: 1ce09d49ee3a737a643cbe8e3a66889291be8bbdcef009834b2a34ca85214795
Final:    9aab3549a93a6d656e1000d09edbe51574b14ec0496d4f9175d8b0cf6a6c1745
```

Tests finales ejecutados mediante `tsx --test`, con casos reales enumerados:
**269 focales + 87 producto + 41 transporte/cierre + 2 métricas + 8 migraciones
= 407/407**, sin skipped. `npm run check`, `npm run build` y
`npm run check:migrations` PASS. El primer launch de build fue bloqueado por el
socket IPC local de tsx; el mismo comando con permiso de socket pasó sin cambios
de código. No se ejecutó `npm test` global ni se aplicaron migraciones a una DB
viva. Las pruebas aisladas de excepción/rollback/redo/divergencia no sustituyen
el gate canónico, cuyo resto permanece NOT_REACHED.

**No merge ready; mantener draft.** El siguiente bloqueo concreto es producir
una continuación conjunta que resuelva los dominios acoplados C05/C08, conserve
alternativas tardías válidas y llegue a una hoja certificable dentro del ledger.
Añadir un ancestro desplaza el Hall; aprender el vacío no consiguió backjumping
en el recorrido real. La siguiente intervención necesita un contraste canónico
emparejado y un certificado S2, antes de ampliar la búsqueda o repetir CPU tuning.
