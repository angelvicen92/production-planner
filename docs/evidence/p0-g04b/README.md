# P0-G04b — Estilismo entrada/salida × transporte × macro REQUIRED

**Resultado: diagnóstico reproducible; objetivo productivo 141/141 NO alcanzado.** Tres bases descartables crean las 141 obligaciones mediante controles Chromium. La solicitud real desde UI devuelve `NO_PROPOSAL / CORE_BRANCH_BUDGET_EXHAUSTED`, con 10.000 ramas, S0 y Draft intactos, cero propuestas y cero Stages nuevos. La [comparación independiente](determinism.json) contrasta literalmente la primera base y la reproducción final. La existencia de witnesses completos condicionados **sólo en memoria** no cambia este resultado.

Repositorio `angelvicen92/production-planner`; rama `codex/p0-g04b-styling-in-out-native-composition`; base autorizada `349dea648555a314367a4f1d668a6dad7a81321d`. No se modifica producto, SQL, migraciones ni presupuesto. [source-binding.json](source-binding.json) acredita 1.679 archivos de runtime/Fuentes literalmente iguales a la base. La nueva workflow ejecuta el diagnóstico; su éxito significa reproducibilidad del bloqueo, nunca aceptación de 141.

## Autoridades y autoría

AGENTS, maestro P0 y catálogo; Fuentes 00–07, especialmente 06 v2.10 §§5–6 y apertura temprana, 03 materialización terminal y pipeline, 04 dependencias/snapshots/márgenes y 07 §4.4. Se contrastan G04a, su gate e implementación, U00f y la auditoría histórica de Estilismo. Esta última describe calidad de otra configuración y **no prueba un defecto de este motor**.

Se conserva el productor nativo G04a: participantes, coaches, plantillas Main/Vocal, unidades, transporte, fases 3/2/2, conjunta C06+C10, EVA 16:00–21:00 y ventanas C01 hasta 15:30 / C02–C19 hasta 19:00. Las únicas ampliaciones de autoría son las plantillas/dependencias de Estilismo y un espacio nuevo Vestuario. Los recibos incluyen cada POST/PATCH/PUT, su respuesta, identidades, configuración efectiva, revisión 4 y snapshots SQL.

| Familia | Obligaciones |
|---|---:|
| Main / Vocal / Sodexo | 19 / 19 / 19 |
| Operaciones físicas de macro | 8 (7 representantes) |
| IN / OUT | 19 / 19 |
| Estilismo entrada / salida | 19 / 19 |
| Total objetivo configurado | **141** |

[Inventario completo](obligations.csv) y [reconciliación del grafo](inventory.json). Entrada dura **10 minutos**, salida **5**, conforme a Fuente 06. Ambas ocupan Vestuario, espacio propio **9**, con exclusividad HARD=1, sin continuidad REQUIRED, sin comida/descanso de espacio y sin recursos heredados de otra unidad. La carga serial es 285 minutos; no se exige compactarla ni eliminar huecos.

Entrada depende de IN; Main depende de Vocal y entrada; Vocal sólo depende de IN. Las restantes actividades, incluido Sodexo, dependen de entrada. Cada salida depende del Main, Sodexo y sólo las operaciones adicionales realmente presentes para esa persona. Se crean 19 plantillas de salida para expresar estas diferencias mediante el editor existente, sin exigir plantillas ausentes. No se impone Main antes de la macro ni Vocal antes/después de entrada.

OUT conserva su autoridad tipada de **última obligación**, incluidas comidas. Por ello no necesita aristas nominales redundantes hacia las 19 plantillas de salida; no se simula una plantilla de transporte diferente por persona. La frontera está representada por `transportPolicy.departure`; las dependencias explícitas de OUT permanecen vacías y esto se registra, porque afecta a qué optimizadores terminales la reconocen. Cada salida declara `after=0`, cada OUT `before=0`; Main→salida sigue teniendo el margen independiente de 5 minutos. IN mantiene 1/3/3 y gap 30; OUT mantiene 1/1/6 y gap 20 del snapshot G04a.

## Primer resultado y auditoría

La autoría de fases/conjunta, configuración diaria, reconstrucción y preflight pasan sin cambios productivos. El scope de cualquiera de los peers cierra las mismas ocho obligaciones de la macro, con 14 prerrequisitos supporting. La proyección colectiva conserva **122 tareas + 19 comidas**. Ningún placement está protegido, fijado o aceptado.

La primera pérdida observada está antes del hard-valid core y de la macro: el matching coloca Main C16 (`task:108`) a **18:40–18:55**; su salida (`task:138`) necesita empezar como mínimo a **19:00**, fuera de su ventana. La poda de ese dominio vacío es correcta. Se repite 223 veces en variantes feeder y se consume el ledger sin alcanzar una hoja core válida. Véase el [gate causal y call path](causal-gate.md).

Clasificación: **agotamiento de búsqueda sobre geometrías/órdenes insuficientemente propagados, con una relajación conservadora de autoridad**. No es prueba de inviabilidad, bloqueo de autoría, capacidad física imposible ni discrepancia TS/SQL. No se demuestra una poda unsound ni un matching que haya eliminado todas las alternativas necesarias.

## Falsaciones y decisión

La observación en copias scratch conserva literalmente resultado completo, elecciones Main, familias, ramas y stop reason: [neutrality.json](neutrality.json), sin campos excluidos. No permanece instrumentación dentro del producto.

| Ensayo offline, mismo contrato | Resultado |
|---|---|
| Original | Agota 10.000; ninguna hoja core |
| Reconocer sólo las referencias a comidas ya conocidas en el bound existente | Rechaza antes dos geometrías tardías, pero agota 10.000 en otra; **delta insuficiente** |
| Sólo solicitar otra `preferredArchitecture` | El orden histórico la vuelve a relegar; control sin efecto, no prueba de esa geometría |
| Pipeline/matching existente condicionado en frontera terminal derivada | Witness completo; **2.614** ramas incluyendo 102 de preparación |
| Mismo caso, otra semilla de matching | Witness completo; **2.716**, incluyendo 204 de preparación |
| Geometría derivada de alimentación de primer coach | Witness completo; **2.421 / 2.523**, según semilla |

Las geometrías proceden de duraciones, disponibilidades y márgenes efectivos, nunca de PDF, horarios humanos, seeds A2 ni locks. El matching alternativo excluye una arista del primer matching generado; la rematerialización posterior converge al mismo witness final para cada geometría. No demuestra que fuese necesario ese emparejamiento inicial.

Los cuatro witnesses pasan el validador canónico completo y replay firmado: 122 tareas, 19 comidas, cero violaciones. Cada uno soporta nueve ataques materiales offline con hashes recalculados: capacidad compartida, entrada, salida/comida, comida ausente/ventana/capacidad, OUT, agrupación IN e identidad de fuente. Estos **36 ataques no son negativos SQL**. Ninguna de estas alternativas se aplica a Draft ni se acepta como Stage.

**STOP implementación:** se conoce una alternativa física y una primera pérdida, pero la relajación mínima contrastada sólo desplaza el agotamiento. Aún falta demostrar un único delta de la autoridad existente que produzca una propuesta nativa y alcance SQL. No se añade scheduler, matching, poda, presupuesto ni capa para convertir el witness condicionado en una capacidad declarada.

## Comparación, regresiones y límites

[Composición antes/después](composition-matrix.md). G04a conserva sus 103/103 y 28/28 en replay de sus inputs UI congelados, con propuestas canónicas, witnesses y continuación protegida exactos: **3.420/205** y **111/42** ramas. G03e conserva 65/65 y 18/18: **2.884/843** y **64/53**. Son replays, no nuevos Stages PostgreSQL. A2 importado se reejecuta una vez: **266/266, 11 Stages, 27.049 ramas**, informe/snapshots exactos salvo duración y 11 certificados revalidados.

Pasan 45 focales y TypeScript del arnés. Los originales G03d/G03b/G02/G01/U02d/U00f, sus recibos y sus consumidores permanecen byte a byte; no se presenta una reejecución SQL completa de esos controles. [validation.json](validation.json) separa cada validación y pendiente. Los fallos de arnés iniciales se conservan en [attempts.json](attempts.json): primero la aserción G04a esperaba propuesta; después se intentó descartar un NO_PROPOSAL y SQL devolvió correctamente `RUN_NOT_READY`. El arnés final registra ese rechazo como negativo esperado.

La aceptación 141 desde UI queda bloqueada **antes** de Draft/validación aplicada, consumidor físico SQL, S1/S2, continuación protegida, rollback/redo y protección de Stage. Los negativos nativos de roles, revisión, miembro y scope sí se ejecutan; no sustituyen los negativos SQL físicos/protegidos pendientes. La topología alternativa nativa con cuello serial equivalente y el gate funcional completo quedan pendientes. Las 19 comidas sólo están certificadas en los contrafactuales; el run nativo certifica **cero**.

La siguiente frontera inmediata hacia 266 es obtener propuesta nativa de estas 141 reutilizando las autoridades existentes, antes de añadir las otras 125 obligaciones. Siguen después las intersecciones de G04a pendientes: anclajes/ámbitos, pausas operativas, rutas/transiciones, rondas, setups, alternativas y requiresBand. No se atribuye a A2 importado autoría nativa de 266. No hay merge, despliegue ni migración remota.

## Reproducción

Con dependencias instaladas; el primer comando requiere Docker y Chromium. Los paquetes `.json.gz` contienen JSON por nombre relativo, sin tokens ni logs privados.

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-g04b/run.ts work/g04b-new
python3 docs/evidence/p0-g04b/unpack.py docs/evidence/p0-g04b/initial/receipts.json.gz work/g04b-initial
python3 docs/evidence/p0-g04b/verify.py work/g04b-initial work/g04b-new/native work/g04b-comparison.json
python3 docs/evidence/p0-g04b/inventory.py work/g04b-new/native work/g04b-inventory.json
python3 docs/evidence/p0-g04b/offline.py work/g04b-initial work/g04b-offline
node --import tsx docs/evidence/p0-g04b/regressions.ts work/g04b-controls
python3 docs/evidence/p0-g04b/bind.py
```

El runner copia el producto íntegro y usa el dispatch de Evidence/compilación/cache del runner G04a. Sus manifiestos conservan los deltas exactos del arnés. Borra credenciales remotas heredadas y exige loopback; sólo crea y elimina sus stacks locales. La [workflow](../../../.github/workflows/p0-g04b-styling-diagnostic.yml) distingue explícitamente reproducción diagnóstica de aceptación funcional.
