# A3-ORCH-REAL-007 — causalidad de candidatos y cambios de ubicación

Base exacta: `a99e0a641de14810d014a1370158e6d0b45e22f6`. Se ejecutó exclusivamente el Full A2 canónico a 5.000 ramas con una instrumentación temporal read-only, después revertida. Resultado: `BRANCH_BUDGET_EXHAUSTED`, `CORE=1.599`, `STANDALONE=3.401`, frontier 121, fingerprint `d3a35f0f5a77cecb617d8cf1e503dbb3a2cb8cffbb727328a7f23578d861fb3a`; replay diagnóstico ON/OFF `exactMatch=true`.

## Método

En el estado exacto anterior a cada decisión se recorrió una copia del dominio dinámico exacto, sin llamar a `ledger.consume`, cambiar el iterador usado por la búsqueda ni poblar sus caches. Para cada start que pasó el dominio y `canPlaceTask` se calcularon sobre copias read-only: secuencia cronológica de espacios del recurso antes/después, cambios y reentradas; `checkMacroPendingPrerequisites`; `probeOperationalMealFutureFeasibility`; y `maintainDeferredPrerequisiteReservation` para llegada/capacidad. Un candidato «permitido» es el que pasó esas mismas autoridades. Los witnesses de comida son starts de 5 minutos capaces de contener los 75 minutos de `break:plato-14-operations`; no se contó un intervalo continuo como un solo witness.

Notación de listas: `a..b/5` incluye todos los starts entre ambos extremos a pasos de 5 minutos. Espacios: CAM1 `p14-pasillo=space:3006`, `p14-recursos=space:3007`; CAM2 `p15-croma=space:3008`, `p15-estrellas-sillon=space:3009`.

## CAM1 — `resource:task:10167`, m46, dominio exacto 64

Estado previo CAM1: `pasillo → recursos → pasillo → recursos → pasillo → recursos → pasillo → recursos` (7 cambios, 6 reentradas). Los 64 starts hard-valid fueron `540,545,550,620,765,795..1060/5,1095..1115/5`.

| starts | end | secuencia después / delta | reentrada | macro pending | comida P14 antes→después | llegada/capacidad |
|---|---|---|---|---|---|---|
| `540,545,550` | `start+5` | sin cambio observable / `0` | no | rechazo `PENDING_ARRIVAL_DEADLINE`, autoridad de llegada, participante `212`; cutoff `530/535/540`, demanda `1`, máximo `0` | `26→26`, viable | mismo rechazo |
| **`620` (elegido)** | `625` | añade `pasillo → recursos` / **`+2`** | sí | viable, `witnesses=0` | **`26→26`**, viable | viable; 13 checks, 0 prunes |
| **`765` (mejor movimiento)** | `770` | secuencia sin bloque nuevo / **`0`** | no | viable, `witnesses=0` | **`26→26`**, viable | viable; 13 checks, 0 prunes |
| `795..1060/5,1095..1110/5` | `start+5` | añade un bloque / `+1` | sí | viable | entre `26` (desde `990` y después) y `11–24` dentro/alrededor de comida | viable |
| `1115` | `1120` | añade un bloque / `+1` | sí | rechazo `COLLECTIVE_CAPACITY` (autoridad/capacidad reportada por el check) | `26→26`, viable | no se acepta por macro |

**Clasificación: `MOVEMENT_ONLY`.** En el mismo estado sí existía `765–770`, permitido por todas las autoridades, que evitaba los dos cambios y la reentrada creados por `620–625`. Sin embargo, no preservaba libertad futura estrictamente mayor: ambos conservaban 26 witnesses de comida, la llegada seguía viable con los mismos 13 checks y 0 prunes, y el check macro daba 0 witnesses en ambos. Por tanto no satisface conjuntamente los dos requisitos de `CAUSAL_BETTER_CANDIDATE`.

El criterio que hizo elegir el placement peor fue el **orden canónico ascendente de starts**: `540/545/550` fueron rechazados por la autoridad de llegada y `620` fue el primer candidato permitido; la selección de la unidad en m46 fue `minimum-macro-domain`, pero no comparó movimiento ni libertad futura entre sus placements. No se propone aún cambiarlo.

## CAM2 — `resource:task:10071`, m17, dominio exacto 66

Estado previo CAM2: `croma → estrellas-sillón` (1 cambio, 0 reentradas). Starts hard-valid: `540..560/5,580..605/5,790..985/5,1040..1110/5`.

| starts | end | secuencia después / delta | reentrada | macro pending / autoridad | comida P14 | llegada/capacidad |
|---|---|---|---|---|---|---|
| `540..560/5,580..605/5` | `start+10` | sin nuevo bloque / `0` | no | rechazo `PENDING_ARRIVAL_DEADLINE`; certificados demanda/máximo `1/0`, `4/3` o `7/6`, incluyendo participante `206` | no aplica a CAM2 | inviable por el mismo certificado |
| **`790` (elegido)** y `795..985/5,1040..1105/5` | `start+10` | `croma → estrellas-sillón → croma` / **`+1`** | sí | viable, `witnesses=1` | no aplica a CAM2 | viable; 14 checks, 0 prunes |
| `1110` | `1120` | mismo / `+1` | sí | rechazo `COLLECTIVE_CAPACITY` | no aplica | no se acepta por macro |

**Clasificación: `NO_BETTER_CANDIDATE`.** Los únicos 11 starts con delta 0 fallaban la autoridad de llegada; los 54 permitidos tenían todos delta `+1`, creaban la misma reentrada y conservaban idéntica señal de capacidad/llegada. No existía candidato permitido con menos movimiento, y por ello tampoco uno que además preservara estrictamente más futuro. `790–800` fue simplemente el primer start permitido en el orden canónico.

## Cierre de la cadena de comida (CAM1)

Se midieron `task:10114` m38 y `task:10051` m65 porque explican por qué la reentrada temprana de `10167` no es todavía causal respecto de la comida:

- `10114` eligió `780–790`: delta de movimiento `0`, llegada viable y witnesses P14 `28→26`. Entre sus 52 candidatos permitidos, `995..1020/5` y `1060..1105/5` conservaban `28`, pero también delta `0`; demuestra libertad de comida mayor, no una mejora conjunta de movimiento sobre el elegido.
- `10051` eligió `960–965`: todos sus 31 candidatos permitidos añadían exactamente un cambio/reentrada. El elegido redujo witnesses `7→1`; `990..1110/5` conservaba los 7. Es una pérdida posterior de libertad por orden ascendente, pero no una alternativa con menos movimiento y queda fuera de los dos focos de clasificación.

## Respuesta

No apareció en ninguno de los dos focos principales un candidato permitido que simultáneamente redujera movimiento y preservara **estrictamente** más witnesses, llegada viable o capacidad. Para `10167` existe una mejora operacional real (`620→765`, delta `+2→0`, reentrada sí→no), pero la libertad futura medida empata; para `10071` todos los candidatos permitidos empatan en `+1` cambio y reentrada. La Evidence, por tanto, no autoriza todavía una solución de scoring, ordering, dominios, constraints o búsqueda.
