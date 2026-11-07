# P0-G04a — transporte IN/OUT × fases × conjunta × comidas

La jornada nativa completa **103/103** y la topología alternativa **28/28**, mediante propuesta auténtica, Draft, validación y S1/S2 PostgreSQL. Dos bases frías independientes acreditan ocho Stages nuevos, prefijo protegido, rollback/redo y lectura por otra conexión. No se importan horarios.

Repositorio `angelvicen92/production-planner`; rama `codex/p0-g04a-transport-with-joint-phases-meals`; base autorizada `de7aec0b78c2c5b8d6118a2a72b69d6721dd123b`. Este candidato contiene la reparación incremental 131; no implica migración remota ni despliegue.

El [diagnóstico original](diagnosis/README.md), sus witnesses y rechazos siguen conservados. [retention.json](diagnosis/retention.json) verifica cada archivo mediante el manifiesto original, incluyendo los índices históricos trasladados a `diagnosis/`. Los recibos históricos de cero Stages describen aquella fase; la aceptación productiva está en `implementation/native-a/` y `native-b/`.

## Causa y delta

La primera pareja rechazada era **task:34 / C12 y task:37 / C13**, IN 09:00–09:05, espacio 8, sin recursos, dentro del paquete auténtico `[34,37,40]`: mínimo 1, máximo 3, separación mínima 30. `operationalRole=transport_arrival`; `blocksSpace` omitido equivale a exclusividad. [causal-pair.json](implementation/causal-pair.json) conserva las filas, política y `taskOperations` proyectadas por el consumidor existente, contrastadas con la revisión SQL nativa.

TS reconoce el paquete mediante `synchronizedTransportTasks`, después de validar agrupación y fronteras. El consumidor SQL instalado tras 120–130 sólo exceptuaba anclajes/conjuntas. Por ello rechazaba 34 pares internos autorizados con `ANCHORED_WITNESS_SPACE_CONFLICT`. Las definiciones PostgreSQL reales y la primera falsación con rollback están en [first-falsation](implementation/first-falsation/manifest.json).

Se mantiene `blocksSpace=true`: la excepción interna conserva la exclusividad frente a terceros. Aplicar `blocksSpace=false` habría cambiado la ocupación externa del transporte; no era necesario para reparar este consumidor. Fuente 04 permite esa representación, pero no obliga a sustituir la autoridad existente.

131 extrae el chequeo de paquetes del trigger nominal y lo comparte con `assert_anchored_choice_witness`. Autentica plantillas/snapshots del día y revisión efectiva, identidades, una obligación por participante y dirección, simultaneidad, cardinalidad, separación entre inicios y presencia IN→actividad/comidas→OUT. La etiqueta aportada por el caller no autoriza pertenencia. Los demás chequeos de fuentes, disponibilidad, dependencias, recursos, coaches, Draft, revisión y protección siguen vigentes.

La admisión reutiliza el preflight nativo y los validadores de fases/conjunta. Transporte queda fuera de los representantes. No se modifica el motor, el orden de búsqueda, los budgets, la geometría ni el certificado. La función nueva es invoker, `search_path=''`, ejecutable sólo por `service_role`; el upgrade comprueba los metadatos y permisos anteriores literalmente.

## Recorrido productivo

| Jornada | Obligaciones | Decisiones SQL | Transporte |
|---|---:|---|---|
| Macro | 19 Main + 19 Vocal + 19 Sodexo + 8 operaciones + 19 IN + 19 OUT = 103 | S1 8 → S2 103 | IN min/target/max 1/3/3, gap 30; OUT 1/1/6, gap 20 |
| Alternativa | 8 Main/Vocal + 5 comidas + 5 operaciones + 5 IN + 5 OUT = 28 | S1 4 → S2 28 | IN 1/2/2, gap 25; OUT 1/2/3, gap 15 |

Son cantidades observadas del resolver existente. S1 no se limita artificialmente a ocho: la unidad y sus prerrequisitos/supporting se resuelven con las autoridades del producto. La macro conserva fases 3/2/2, siete representantes, ocho obligaciones físicas, conjunta C06+C10 y cinco usos de EVA dentro de 16:00–21:00. C01 conserva 09:00–15:30; los otros participantes 09:00–19:00. Las comidas duran 40 minutos; OUT.before=0. El genérico tiene cinco participantes, una cadena de tres fases, conjunta y competidora física externa.

Las dos réplicas comparan literalmente IDs, inputs, problemas, configuración material, scopes de ambos peers, propuestas, witnesses, ramas, certificados, fingerprints, Drafts y SQL. Sólo excluyen duraciones medidas y procedencia temporal/de usuario de configuración; ninguna diferencia física se normaliza. Véanse [verificación A](implementation/verification-a.json), [B](implementation/verification-b.json) y [determinismo](implementation/determinism.json).

La primera propuesta conserva **3.420 ramas**. La continuación auténtica usa **205**, porque el servicio ya reutiliza el witness `JOINT_COMPLETION` aceptado en S1. El [replay causal](implementation/memory-replay/comparison.json) conserva exactamente **3.420/1.377** con el input y flujo de memoria originales; en la continuación nativa, retirar sólo el witness de linaje devuelve 1.377 y reutilizarlo produce 205 con el mismo witness que el servicio. No es un cambio de búsqueda.

## Falsación y seguridad

Cada base ejecuta antes de la propuesta productiva el witness original y 21 ataques SQL con rollback. Los resultados sintéticos están identificados y no cuentan como propuestas ni Stages. Los ataques alteran pertenencia/dirección, sincronización, máximos/mínimos/gaps, IDs, duplicación, participante, disponibilidad, presencia, comidas, dependencias, ocupación externa, etiquetas, recursos, jornada, Draft, revisión y permisos. Se recalculan hashes; los negativos físicos alcanzan el consumidor material.

El tercero en el espacio y la etiqueta falsificada obtienen `ANCHORED_WITNESS_SPACE_CONFLICT`; el recurso externo obtiene `ANCHORED_WITNESS_RESOURCE_CONFLICT`. El ataque genérico de recurso respeta el margen real tras IN para aislar la causa. Se añaden los ataques existentes de comidas/fases/conjunta, scope, fuentes, CAS, roles, aceptación directa y Stage inmutable en ambas etapas. Los permisos y stale se reportan como tales, sin sustituir pruebas físicas.

## Comprobaciones y límites

[validation.json](validation.json) identifica checks y recibos. TypeScript, build, secuencia de migraciones y 101 focales pasan. El [upgrade poblado 130→131](implementation/upgrade/upgrade131.json) conserva exactamente filas, 599 tareas, 11 Stages históricos, snapshots, lectores, ACL y RLS. G03e conserva 65/65 y 18/18, con 2.884/843 y 64/53 ramas. G02 y U00f conservan sus recorridos. A2 histórico conserva **266/266, 11 Stages y 27.049 ramas**, con informe/snapshots exactos salvo tiempos y 11 certificados revalidados.

La CI del candidato reejecuta 103+28 en dos bases, el upgrade, A2 y los controles G03e/G03d/G03b/G02/G01/U02d/U00f. U02d conserva también sus agotamientos históricos de 10.000 ramas. Su lector selecciona ahora 131 cuando está instalado el helper; sigue comparando los cuerpos completos.

La frontera hacia 266 nativas sigue siendo la composición con anclajes/ámbitos, pausas operativas, rutas, transiciones positivas, rondas, setups, alternativas y requiresBand. Esas intersecciones permanecen fuera de esta ampliación. A2 importado no acredita autoría nativa de 266 ni convierte esta subclase en soporte general.

## Reproducción

Con Docker, dependencias y Chromium disponibles, desde un checkout del candidato:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-g04a/implementation/ci.ts work/g04a
node --import tsx docs/evidence/p0-g04a/implementation/upgrade131.mts work/g04a-upgrade
```

`ci.ts` materializa únicamente los recibos originales de diagnóstico, crea dos stacks locales en secuencia y ejecuta verificadores independientes. Los runners eliminan credenciales de proyecto heredadas y exigen loopback. Los paquetes públicos excluyen tokens y logs privados. [source-binding.json](source-binding.json) y `SHA256SUMS` vinculan código y evidencia.
