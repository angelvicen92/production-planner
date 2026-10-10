# ASST-010 — coste de S2 y respuesta explícita al límite

PR [#1104](https://github.com/angelvicen92/production-planner/pull/1104), mismo
branch, draft y sin merge. Fecha: 2026-10-10. HEAD de partida:
`5793bc906f862f5233644c74c5f80a04bdb38ca0`. Código probado:
`b4425e39f9c80c95c1edaa8d05b9b34854101a05`. El HEAD publicado y CI exacto se
registran en el PR. [Datos, scripts y replay focal](ASST-010-S2-COMPUTATION.json).

**ASST-010 sigue fallando en la assertion de propuesta S2.** S1 y el refresh
pasan. S2 devuelve ahora `NO_PROPOSAL / SEARCH_TIME_LIMIT_REACHED` sin que el
watchdog mate el proceso: 300.060,050 ms y ledger final parcial
`4.354 CORE + 50.641 STANDALONE = 54.995 / 100.000`. No hay certificado S2 ni
prueba de inviabilidad global. AcceptedException, provenance, rollback, redo,
divergencia y recertificación canónicos siguen **NOT_REACHED**.

Dos A2 completos desde S0 mantienen **266/266 en diez Stages**, S1
**89.654 / 76.450 ms**, mismos placements, fingerprints y cargos que 5793bc9.
La mejora de CPU y el retorno explícito son verificables; no cierran el gate.

## X/Y/Z/W/M

- **X:** S2 tras el refresh de Estilismo no se certifica; los cores 3/6 consumen
  gran parte del tiempo mientras el ledger permanece por debajo de 100.000.
- **Y:** MRV reconstruye checks canónicos de un mismo item/start para cada
  shape; el cierre repite autoridades estáticas y ocupaciones de raíz para
  contextos parciales distintos. El límite de tiempo carecía de retorno propio.
- **Z:** probes sin cargos nuevos consumen CPU; el corte externo no produce
  accounting final ni resultado persistible de API.
- **W:** memoizar edges canónicos dentro del probe de ronda; preparar y memoizar
  la raíz inmutable del cierre con fallback conservador; interrumpir
  cooperativamente el exact search con resultado explícito y sin certificado.
- **M:** cores S2 3/6/9: 44.732/35.146/42.180 ms. API devuelve su resultado al
  límite con 54.995 ramas. Dos A2 mantienen todo el material. S2 sigue inconcluso.

## Perfil y contrapruebas

El control usa el código publicado, `--cpu-prof` y observación read-only del
recorrido real desde S0. S2 acumula 300.130,252 ms de muestras. Tiempo propio:
`diagnoseTaskPlacement` 89.329,302 ms; `canPlaceTask` 65.228,274;
precedencias 44.002,883; participant gap 9.981,994; dominio dinámico 6.762,908;
cierre 6.341,748; GC 6.337,877. El JSON contiene el detalle.

| Core | Total observado, ms | Probe ronda inclusivo, ms | Matching inclusivo, ms | Cierre inclusivo, ms |
|---|---:|---:|---:|---:|
| 3 | 102.223 | 57.792,819 | 51.492,373 | 29.650,808 |
| 6 | 117.072 | 86.153,719 | 75.125,382 | 22.810,162 |

Son pilas anidadas: los tiempos inclusivos se solapan y no se suman como fases
independientes. En core 3 se hacen 15.222 llamadas a matching y 14.826
materializaciones; en core 6, 19.462 y 19.062. Son recomputaciones de selección,
no otras tantas decisiones de búsqueda omitidas del ledger. Los cargos existentes
se mantienen. No se crean decisiones gratuitas ni se descuentan ramas.

Contrapruebas antes de retener cambios:

1. Sustituir placement por aceptación de intervalos preparados falla con márgenes
   asimétricos. Se descarta; el delta retiene `canPlaceTask` como autoridad.
2. Un probe de ronda con cero no corta DFS: el productor exacto sigue explorando
   sus matchings alternativos. Se refuta esa hipótesis de poda indebida.
3. En core 9, 804 contextos de prerequisites son todos distintos; memoizar su
   resultado completo no eliminaría el coste dominante. Se reutiliza sólo la raíz.
4. Cache de OUT aislado: muestras 546,937→456,372 y 392,206→399,962 ms. Mejora
   inconsistente y ningún certificado S2; se descarta.
5. Cache de raíz completa: 11 contextos de control por core, construidos sobre raíces observadas, conservan exactamente
   todas las respuestas y cargos; 404,585→150,184 y 280,040→76,187 ms.

## Delta retenido y límites del retorno

El cache de ronda vive en un solo probe y guarda booleanos canónicos por ID/start.
Ocupaciones y comidas son constantes en ese probe. La pertenencia a lanes y la
validación del candidato conjunto siguen siendo obligatorias.

El cierre prepara la raíz una vez y conserva edges canónicos de esa raíz.
Dominios y checks de las ocupaciones añadidas se componen con las autoridades
existentes. La reutilización exige las filas literales de la raíz, IDs únicos y
comidas correspondientes; cualquier raíz alterada, ausente o duplicada usa el
check completo. La raíz y el canon se clonan. El cache no guarda decisiones ni
cambia matching, orden, alternativas, cargos o certificación final.

El límite cooperativo mantiene 300.000 ms. Se comprueba antes de consumir ledger
y dentro del probe de ronda sin cargos. `ExactSearchTimeLimitReached` se captura
en la frontera exacta; otros errores se propagan. Devuelve plan incompleto, listas
vacías, accounting parcial exacto y `SEARCH_TIME_LIMIT_REACHED`. El servicio
persiste un único `NO_PROPOSAL`, sin draft, propuesta ni fingerprint parcial.
No se promueven abstenciones ni timeout a prueba negativa. No se cambia el
contrato de los resultados exitosos ni el límite de 100.000.

Es un límite cooperativo, con granularidad de operación y finalización; no es una
preempción de reloj exacta. El servicio real tarda 300.060,050 ms. El trial anterior
retorna en 300.077,956 ms. No se aumenta el timeout para obtener estos resultados.
Los diagnósticos interrumpidos no son métricas completas de la enumeración core;
el ledger es exacto para el trabajo cobrado antes de interrumpir.

## Tres ciclos desde S0

Se conserva `runA2Assist7Evidence()` sin cambios ni assertions debilitadas.
Cada ciclo propone/acepta Main 10017, refresca 19 entradas 10→20 y conserva S1
literalmente. S2 pide sólo auxiliar CAM1 10015. No se introduce un scope alternativo.

| S2 | Control perfilado | Cache ronda | Trial OUT + retorno | Cache raíz + retorno |
|---|---:|---:|---:|---:|
| Core 3, ms | 102.223 | 54.417 | 52.780 | 44.732 |
| Core 6, ms | 117.072 | 39.661 | 40.612 | 35.146 |
| Core 9, ms | Interrumpido | 119.166 | 111.950 | 42.180 |
| Cores entrados | 9 | 10 | 10 | 12 |
| Ledger al corte | 37.712 observado | 43.071 observado | 42.858 final parcial | 54.995 final parcial |
| Certificado S2 | Ninguno | Ninguno | Ninguno | Ninguno |
| Retorno del producto | No | No | `NO_PROPOSAL` | `NO_PROPOSAL` |

El control está perfilado; su latencia no equivale a un run sin profiler. Los
inputs, fingerprints y cargos coinciden en los cores comparables completados.
La comparación de matching sin profiler pasa de 52.582,699 a 3.510,835 ms
inclusivos en core 3; son 15.222 llamadas en ambos casos.

El candidato final alcanza 19.354 checks de cierre, 43.611 hits y 394.819
traversals; dos candidatos macro, cero hojas completas y cero witnesses conjuntos.
Core 9 hace 4.425 cierres necesarios: 41.413,937 ms de sus 42.179,515 ms totales.
Se detiene la expansión tras estos tres ciclos medidos, conforme al prompt vigente.

## Primer bloqueo residual reproducible

Replay read-only del core 9, fingerprint
`99e2c205f343cc8b9821e0b4451c6be8a8f1505014c2589d2f08141bacdb1031`.
Se reutiliza el productor existente de prerequisites y la autoridad colectiva,
sin ejecutar un nuevo solver ni suministrar este contexto como seed al producto.

La raíz, con IN recompuesto y entradas pendientes, pasa cierre **necesario**.
El primer Hall aparece tras estas cuatro entradas provisionales:

| Tarea | Inicio | Fin |
|---|---:|---:|
| 10044 | 640 | 660 |
| 10148 | 550 | 570 |
| 10162 | 610 | 630 |
| 10073 | 585 | 605 |

Cierre C05/10058 queda sin slots: Hall 1 tarea/0 vecinos, matching 18/19. El
control sin cache obtiene exactamente el mismo resultado. Cinco checks y 16
cargos diagnósticos, incluidos llegada y cierre; Main protegido permanece literal.
Mover sólo la última entrada a `[660,680]` es canónicamente legal y restaura
`NECESSARY_ONLY PASS`, **sin certificado suficiente**. El replay del mismo prefix
productivo, el Hall y esa alternativa están incluidos y verificados.

La poda de esa rama está justificada. No se ha demostrado una decisión provisional
que elimine indebidamente la alternativa ni una incompatibilidad del scope con
el Main protegido. El siguiente objetivo focal es certificar la continuación de
esa alternativa supporting con los exploradores existentes, conservando otras
raíces/alternativas y el ledger; no asumir que otro Hall local prueba inviabilidad
ni repetir únicamente optimizaciones de CPU.

## Regresiones sobre el código final

Dos `runA2Assist8Evidence({reportIterationDurations:true})` sin hooks, seeds,
profiler ni witness recibido, desde S0 vacío, recorren request/run/apply hasta S10.

| Stage | Aceptadas ambos | Nuevas visibles | Ramas ambos | Run 1, ms | Run 2, ms |
|---|---:|---:|---:|---:|---:|
| S1 | 19 | 19 | 21.975 | 89.654 | 76.450 |
| S2 | 38 | 19 | 293 | 668 | 142 |
| S3 | 46 | 8 | 293 | 429 | 233 |
| S4 | 65 | 19 | 293 | 314 | 211 |
| S5 | 75 | 10 | 2.238 | 13.164 | 8.981 |
| S6 | 111 | 36 | 293 | 223 | 111 |
| S7 | 169 | 58 | 1.698 | 7.989 | 6.122 |
| S8 | 207 | 38 | 293 | 540 | 191 |
| S9 | 209 | 2 | 293 | 567 | 182 |
| S10 | 266 | 57 | 293 | 546 | 229 |

Total: 114.311,527 / 93.163,568 ms. Accounting visible exacto en los 20 Stages;
S10 57 = 38 tareas + 19 Sodexo. 247 tareas, CAM1 en 51 sin solapamientos,
comidas y preparaciones válidas, nuevos HARD/REQUIRED = 0, protección literal,
ningún witness futuro aceptado/protegido. Veinte replays independientes del
witness pasan con 292 cargos cada uno; búsqueda + auditoría ≤22.267.

Material y fingerprint final coinciden entre runs y con 5793bc9:

```text
1ce09d49ee3a737a643cbe8e3a66889291be8bbdcef009834b2a34ca85214795
9aab3549a93a6d656e1000d09edbe51574b14ec0496d4f9175d8b0cf6a6c1745
```

Focales 267/267, integración de producto 87/87, transporte/cierre 41/41
(incluye transporte 24/24), métricas 2/2 y migraciones 8/8; total 405/405. `npm run check`,
`npm run build` y `npm run check:migrations` PASS. CI exacto se enlaza en el PR;
Baseline CI ejecuta typecheck, secuencia de migraciones y build. Los tests aislados
de excepciones y lineage no sustituyen ASST-010 completo. **Mantener draft.**
