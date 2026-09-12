# A3-ORCH-REAL-014 — causalidad de alimentación de llegadas

Base obligatoria: `dfa9666f6e6cabcddfc903d52bc2572b30f3af08`. Diagnóstico **read-only** sobre Full A2 canónico, exclusivamente con presupuesto 5.000. Se ejecutó el runner con diagnóstico ON; su replay OFF incorporado confirmó invariancia. La instrumentación temporal añadió certificados por cutoff y un witness exacto de IN sin consumir `ledger`, se retiró después y el JSON canónico grande se restauró.

## Gate y corrección de la premisa

| medida | resultado |
|---|---:|
| status | `BRANCH_BUDGET_EXHAUSTED` |
| frontier standalone | **124** |
| CAM1 bloques / cambios / reentradas | **16 / 15 / 14** |
| CORE / STANDALONE | **1.599 / 3.401** |
| diagnóstico ON/OFF | `exactMatch=true` |

La reproducción dirigida corrige una inferencia de A3-013: `task:10182@540–545` **no es una decisión aceptada que alcance otros 39 niveles**. Es el primer candidato compacto visitado en macro depth 71 y el propio `checkMacroPendingPrerequisites` lo rechaza inmediatamente con `PENDING_ARRIVAL_DEADLINE`. Por tanto no existe una secuencia de decisiones aceptadas “desde ese estado hasta su rechazo”: el intervalo entre ambos eventos es vacío. El máximo de descendencia observado previamente pertenecía al contexto agregado del candidato de Setup, no certificaba descendencia de este start concreto.

## Mapa operacional

| ID técnico | concursante / obligación | tipo |
|---|---|---|
| `participant:201` / `task:10006` | C01 / `C01.in` | IN, 5 min |
| `participant:213` / `task:10180` | C13 / `C13.in` | IN, 5 min |
| `task:10176` | C13 / `C13.estilismo_entrada` | alimentación posterior a IN, 10 min |
| `task:10182` | C13 / `C13.pasillo` | PASILLO, 5 min, CAM1, Plato 14 |
| `task:10184` | C13 / `C13.redes` | REDES, 5 min, CAM1, Plato 14 |

En el estado padre, la primera obligación productiva colocada de C01 empieza en 545 (`task:10009`, vocal, 545–560). La primera de C13 empieza en 620 (`task:10183`, vocal, 620–635). Sin embargo, al ensayar PASILLO a 540, la cadena hard más temprana pasa a ser `C13.in → C13.estilismo_entrada → C13.pasillo`; la envolvente hacia atrás fija completion de IN en **530** (PASILLO 540 menos los 10 minutos pendientes de estilismo).

## Estado inmediatamente anterior

La cadena pendiente relevante era `task:10180 (IN) → task:10176 (estilismo_entrada) → task:10182 (PASILLO)`. C01 conservaba `task:10006 (IN)` pendiente y una primera obligación efectiva ya fijada a 545. La autoridad bidireccional produjo los siguientes cortes acumulativos (minutos desde medianoche); `slack = maximumPossible − demand`:

| cutoff | demanda IN | maximumPossible | slack | participantes añadidos/relevantes |
|---:|---:|---:|---:|---|
| 545 | 2 | 3 | +1 | C01, C12 |
| 550 | 3 | 3 | **0** | añade C02 |
| 575 | 4 | 6 | +2 | añade C03 |
| 580 | 6 | 6 | **0** | añade C04, C11 |
| 605 | 8 | 9 | +1 | añade C06, C10 |
| 620 | 9 | 9 | **0** | añade C13 |
| 635 | 10 | 12 | +2 | añade C14 |
| 640 | 11 | 12 | +1 | añade C05 |
| 650 | 12 | 12 | **0** | añade C15 |
| 665 | 14 | 15 | +1 | añade C17, C19 |
| 680 | 15 | 15 | **0** | añade C07 |
| 695 | 16 | 18 | +2 | añade C08 |
| 700 | 18 | 18 | **0** | añade C09, C18 |
| 735 | 19 | 21 | +2 | añade C16 |

El dominio temporal seguía siendo compatible y existía un witness canónico conforme a transporte actual (máximo 3 personas, separación mínima 30): `540:[C01,C02,C12]`, `570:[C03,C04,C11]`, `600:[C06,C10,C13]`, `630:[C05,C14,C15]`, `660:[C07,C17,C19]`, `690:[C08,C09,C18]`, `740:[C16]`. En particular C01 ya estaba en un cutoff de slack cero a 550 y C13 en otro de slack cero a 620; ninguna tenía margen para adelantar arbitrariamente su alimentación.

## Primera y última transición causal

Sólo hay una transición:

| decisión ensayada | participante | primera obligación efectiva tras el ensayo | deadline completion IN | cadena previa | certificado posterior | dominio compatible | estado antes → después |
|---|---|---|---:|---|---|---|---|
| macro `resource:task:10182`, `task:10182@540–545` | C13 | PASILLO a 540, alimentado por estilismo de 10 min | **530** | IN → estilismo → PASILLO | cutoff 530, demand 1, maximumPossible 0, slack **−1**, C13 | vacío | viable → `PENDING_ARRIVAL_DEADLINE` |

No existe una transición intermedia “viable → más crítica”: el primer placement compacto salta directamente de viable a imposible. Tampoco hay decisiones aceptadas posteriores que registrar para C13, C01 u otro integrante del certificado.

## Auditoría de la decisión contemporánea

El selector escogió `resource:task:10182` por `minimum-macro-domain`: domainSize **56**, disponibilidad hard de CAM1 **720 min**, participante C13. `resource:task:10184` (C13 REDES) empataba exactamente en 56/720; el resto de macros disponibles tenía domainSize 57–60 y la misma disponibilidad: C17 PASILLO/REDES (57), C11 PASILLO/REDES (58), C08 REDES, C14 PASILLO/REDES y C15 PASILLO/REDES (59), y C07 PASILLO/REDES (60).

No había una macro disponible de una cadena con holgura de alimentación menor que la seleccionada: C13 ya tenía slack mínimo **0**, empatado con C01; C01 no tenía una macro CAM1 contemporánea en este conjunto. Por ello no se demuestra `BAD_MACRO_PRIORITY`. La alternativa C13 REDES sí compartía exactamente la cadena crítica, pero el empate canónico por ID no cambia la inviabilidad de colocar una obligación alimentada antes de que quepan IN y estilismo.

Para el candidato seleccionado:

| macro / placement | razón | domainSize | disponibilidad | cadena afectada | deadline/slack resultante | Future Feasibility | outcome |
|---|---|---:|---:|---|---|---|---|
| `resource:task:10182`, 540–545 | primer start por ranking de meal freedom/compactación | 56 | 720 | C13 IN → estilismo → PASILLO | 530 / −1 | ninguna: `maximumPossible=0` | rechazo inmediato |

Los starts compactos 540–570 visitados por el caller no constituyen una reserva IN viable para esta cadena; el primer rango compatible necesita dejar terminar IN y estilismo antes de PASILLO. El start 645 de la rama que sí alcanza frontier admite completion de IN hasta 635; el witness existente de C13 IN 600–605 deja margen para situar los 10 minutos de estilismo antes de PASILLO. Así, para la alternativa exacta solicitada la clasificación es **`TRUE_COMPACT_BRANCH_INFEASIBLE`**, no una mala decisión aceptada posterior.

## `maintainDeferredPrerequisiteReservation`

La función no mantiene hoy una reserva ni un witness entre decisiones. Su contrato y ejecución:

1. calcula ancestros hard pendientes y deadlines optimistas;
2. aplica la prueba anónima necesaria de capacidad por cutoffs;
3. aplica `assessTransportFutureFeasibility`;
4. devuelve feasibility, pero siempre `arrivalRepaired=false`, `arrivalWitnessDropped=false`, `causalDiagnostic=null` y no devuelve grupos/starts reservados.

El estado recursivo sí transporta reservas de comida operacional, pero no una reserva de IN. La Evidence (`deferredArrivalFirstRepair=null`, cero drops/repairs) no significa estabilidad de witness: esos campos no pueden activarse con la implementación actual. El terminal admite `reservedArrivalGroups`, pero esta ruta no le entrega una reserva construida durante standalone.

### Reconstrucción diagnóstica de reserva canónica

Usando exclusivamente las reglas actuales de transporte, la reserva canónica viable antes del intento es la secuencia de siete paquetes indicada arriba. Sus límites locales son los deadlines acumulativos de la tabla; los cortes 550, 580, 620, 650, 680 y 700 están saturados (slack 0). Para C13 el paquete empieza 600 y termina 605, con límite local 620 y slack colectivo 0; deja 15 minutos hasta la obligación directa de 620. Para PASILLO a 645, la propagación permite completion de IN hasta 635 y conserva margen para los 10 minutos pendientes de estilismo.

La primera decisión que obliga a reparar esa reserva es precisamente `task:10182@540`: exigiría mover C13 IN desde 600–605 a completion ≤530. No hay start canónico anterior dentro del día; la reparación es imposible, no sólo costosa. No se usó horario humano como seed.

## Conclusión

- **Primera decisión causal:** el intento no aceptado `task:10182@540–545`; impone deadline IN 530 y crea el certificado duro demand 1 / maximumPossible 0.
- **Acción humana con la información disponible:** conservaría el paquete IN de C13 a 600–605 (o al menos su envolvente), descartaría cualquier PASILLO anterior a completion de IN + estilismo y compararía las obligaciones de cadenas con slack cero antes de compactar CAM1.
- **Intervención genérica mínima recomendada:** propagar al ordering de placements la envolvente bidireccional ya calculable —o un witness canónico reparable de IN— y ordenar/filtrar candidatos por slack de alimentación antes de meal freedom y compactación. La autoridad hard actual seguiría decidiendo; no se hardcodean concursantes, tareas ni horas.
- **Efecto esperado sobre CAM1:** evitar explorar compactaciones que sólo parecen continuas porque omiten la alimentación pendiente, dirigiendo antes la búsqueda a starts que preservan cadenas saturadas. Puede reducir backtracking y hacer que bloques/cambios/reentradas reflejen continuidad operativamente viable; no promete un conteo concreto.

No se cambió comportamiento productivo y no se hizo merge.
