# OptiPlan — P0-G03b

Base autorizada `78e6a9dc0941d50b0046e95b341591ad0232331e`; rama única `codex/p0-g03b-phases-with-flexible-participant-meals`. Candidato sin merge ni despliegue. Fuentes 00–07, canon A2, búsqueda, matching, prioridades y presupuestos intactos.

**Resultado nativo:** fases REQUIRED y comidas individuales flexibles coexisten desde Chromium hasta S1/S2 SQL. Dos bases frías acreditan **ocho Stages nuevos** con decisiones, problemas/fingerprints, certificados, ramas, Drafts y snapshots SQL literalmente iguales; sólo se excluyen duraciones de ejecución. [Verificación A](verification-a.json), [verificación B](verification-b.json), [determinismo y claves excluidas](determinism.json).

| Jornada por base fría | Obligaciones | Comidas individuales pendientes en S1 | Horarios aceptados S1 → S2 | Ramas S1 / S2 |
| --- | ---: | ---: | --- | --- |
| Origen G03, Main/Vocal + fase A | 60 | 19 | 3 → 60 | 859 / 855 |
| Inspecciones genéricas, dos fases y participante repetido | 15 | 4 | 3 → 15 | 55 / 51 |

## 1. Causa y delta físico

[X/Y/Z/W/M y recorrido exacto](causal-gate.md). Se amplía únicamente `requiredPhaseCompositionSupported` y el consumidor SQL del witness existente. 128 admite el modo flexible en fases sin conjunta, cuenta las comidas en su canal propio y conserva sus ocupaciones virtuales con no solapamiento. Los márgenes efectivos entre tareas productivas se mantienen. El editor usa una identidad diaria estable para cadenas nuevas; los IDs anteriores se conservan.

No hay segundo scheduler de comidas, witness, resolver, búsqueda ni writer. El certificado de fases consume el witness físico global y **cero ramas adicionales**.

## 2. Matriz antes/después

[Matriz y fronteras conservadas](composition-matrix.md). La operación conjunta con comidas flexibles permanece fuera de admisión. También se mantienen las fronteras de A/B positivo, transporte integrado, rondas, setup P15, requiresBand y recursos/estructuras no certificadas. La subclase demostrada contiene la fase A; no se presupone soporte de Alfombra conjunta.

## 3. UI y autoridad efectiva

El input inicial de G03b es **literalmente igual al input real G03**, incluidas las 19 comidas Sodexo de 40 minutos, ventana 13:00–16:30, capacidad 10, Main/Vocal y unidad C + recursos directos efectivos. [Comparación de origen](g03-literal-origin.json). Guardar la fase desde el editor sólo añade `technicalChains` y `dailyTechnicalChainsVersion`; todos los demás campos permanecen iguales.

Las dos topologías crean catálogos, plantillas, días, participantes, tareas y contratos por controles nativos. El primer Stage de cada día se solicita, aplica, valida y acepta desde la UI; S2 usa los mismos endpoints auténticos autorizados. No se inyecta la autoridad positiva en EngineInput o SQL. Las pruebas unitarias/probes en memoria se distinguen de estos recibos.

La segunda jornada usa nombres genéricos, cuatro participantes, capacidad de comidas 2 y operaciones de 10/15/20 minutos sobre dos fases, con un participante en ambas. Reutiliza identidades diarias nuevas; ninguna regla productiva depende de Sodexo, Reality, nombres, IDs de fixture u horas humanas.

## 4. Comidas pendientes, witness y validación

En S1 sólo se aceptan las tres operaciones de la unidad. Las 19/4 comidas y el supporting permanecen sin horario en el snapshot aceptado, aunque todas sus realizaciones aparecen en el witness global. S2 materializa el resto y mantiene exactamente S1. Cada propuesta valida ventana/duración personal, dependencias, capacidad conjunta, no solapamiento, Main/Vocal, espacios, recursos y unidad efectiva.

`verify.py` contrasta independientemente los recibos de propuesta con Draft y SQL: identidad/completitud de comidas, ventanas, duración, capacidad, competencia física, dependencias y continuidad/orden de fases. El negativo colectivo demuestra dos dominios individuales no vacíos cuya combinación pierde el último hueco conjunto; Assisted rechaza el prefijo sin agotar presupuesto y acepta el contrafactual temprano.

## 5. S1/S2 y continuación protegida

`*-S1-run/draft/validated/sql.json` y `*-S2-*.json` conservan el recorrido auténtico. `*-cold-sql.json` procede de una conexión PostgreSQL nueva; rollback/redo restaura exactamente S2. `*-final-input.json` acredita reconstrucción soportada tras S2. Los snapshots SQL coinciden con el Draft propuesto y su fingerprint; las decisiones previas permanecen literales.

## 6. Negativos

Cada Stage prueba nueve ataques físicos con hashes recalculados: comida omitida/duplicada, fuera de ventana, duración incorrecta, capacidad excedida, conflicto del participante, tarea omitida, recurso omitido y modificación de continuidad. Se distinguen de hash inválido, revisión stale y fuente protegida. Hay **96 ataques de witness** en las dos bases.

Además: roles viewer/aux/sin rol/anónimo; CAS stale; miembro inexistente y comida usada como operación; cuatro ataques a aceptación por Stage (CAS, base, fuente y Draft); Stage inmutable como service_role y postgres con hash recalculado. Todos revierten su transacción. No se presenta un rechazo de autenticidad como prueba de integridad física.

## 7. Independencia y determinismo

`native/` y `repeat/` contienen recibos públicos comprimidos, hashes y capturas. Ambos manifiestos de fuentes coinciden y `checkout-delta.json` está vacío. La comparación no remapea IDs ni normaliza decisiones/fingerprints. Excluye únicamente los siete contadores de tiempo enumerados en `determinism.json`; timestamps administrativos de Auth no forman parte de los artefactos operativos comparados.

Para leer un recibo:

```sh
python3 -c 'import gzip,json; r=json.load(gzip.open("docs/evidence/p0-g03b/native/receipts.json.gz")); print(json.dumps(r["g03-S1-run.json"],indent=2))'
```

## 8. Regresión, seguridad y gates

[Reproducción y resultados](validation.md). `upgrade/` acredita 127→128 poblado, filas/lectores/RLS y owner/ACL/invoker/search_path exactos. A2 histórico conserva 266/266, 11 Stages, 27.049 ramas, informe salvo duración y todos sus snapshots/certificados. Los controles literales G01/G02/U02d y la CI del head remoto se documentan separadamente de la aceptación nueva.

## 9. Limitaciones restantes

La admisión por fases no abre globalmente las operaciones conjuntas. Tampoco resuelve la topología adicional inicialmente ensayada con disponibilidad 12:00–18:00: el core rechaza sus geometrías antes del matching, con 26 ramas y sin agotamiento. Su input y run nativos se conservan en `diagnostic-receipts.json.gz`; no se declara inviabilidad física ni se cambia el algoritmo para resolverla. [Intentos y clasificación](attempts.json).

## 10. Primera barrera siguiente demostrada

Tras guardar y certificar la fase, `*-next-frontier.json` conserva `jointGroups.supported=false` para comidas flexibles. La composición con la operación conjunta de Alfombra sigue sin autoría/certificación en este recorrido. El rechazo independiente del core con ventanas tardías queda registrado aparte. Ninguna de estas fronteras se amplía en G03b.

**No se declara resuelta la macro A2 completa ni la autoría/planificación nueva de sus 266 obligaciones.** Los 266 históricos se usan exclusivamente como regresión.
