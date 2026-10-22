# Validación U00e v2

**Gates locales: PASS.** La habilitación READY del PR exige además CI verde en su head remoto; el resultado vivo y sus enlaces se registran en [PR #1183](https://github.com/angelvicen92/production-planner/pull/1183/checks). No implica merge ni despliegue.

La continuación parte de `3a05cb099a74d7263c0d630d7055746fcd722114` y conserva los dos commits documentales humanos. [Causalidad](v2/causal.md), [resultados estructurados](validation-results.json), [contenido exacto validado](v2/source-hashes.json). Las ejecuciones nativas identifican el head base y los hashes del working tree que contiene el cambio; el commit final incorpora ese contenido. La validación inicial bloqueada se conserva en [initial-validation.md](initial-validation.md), sin sustituirla por un PASS retrospectivo.

## Tipos, construcción y pruebas

Node 20.20.2 y dependencias del lockfile. TypeScript de producto y del harness, build y secuencia de migraciones: PASS. Sin migraciones nuevas. Suite de producto: **3.117/3.117**, cero fallos, 725.154 s, concurrencia 2 y las dos exclusiones históricas exactas de CI. El candidato con contexto protegido pasó ambos TypeScript, build y **95/95 pruebas** del explorador exacto, contrato legacy y políticas v2. Recibos y TAP comprimidos en `v2/gates.json`, `v2/product-suite.tap.gz` y `v2/final-delta-tests.tap.gz`.

Se conservó la prueba roja original de espera interna y se adoptó v2 explícitamente. Los focales cruzan las nueve combinaciones, pausa fija autorizada, hueco rechazado bajo REQUIRED, ABA permitido bajo PREFERRED con dos preparaciones físicas y coste, rechazo de reentrada REQUIRED, OFF sin coste/montaje implícito, preparación inicial explícita, duración heterogénea, matching de identidades distintas, dependencias, ventanas, recurso compartido, dos espacios, identidad falsificada, montaje omitido/incorrecto/solapado, configuración sin familias y espacio configurado sin tareas. No se borró ningún test rojo ni se relajó la severidad física.

## Dos jornadas nuevas por UI y stack real descartable

PostgreSQL 17/Auth/PostgREST/Chromium reales, ledger completo, cinco identidades Auth, cero escrituras remotas. Configuración → participantes/espacios/plantillas/tareas → readiness → Assisted → Draft → validación → Stage aceptado → replay. [Recibo nativo](v2/native/integration.json).

| Día | Agrupación | Continuidad | Obligaciones | Ramas | Preparaciones | Nuevas HARD/REQUIRED |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | REQUIRED | PREFERRED | 4/4 | 11 | 1 × 10 min | 0/0 |
| 2 | PREFERRED | REQUIRED | 6/6 | 16 | 2 × 5 min | 0/0 |

El segundo día usa orden explícito C→A→B, duraciones 5/15/10, dependencias y recursos diarios físicos. Revisiones, permisos, CAS stale, referencias desconocidas y perfil histórico inmutable: PASS. El primer input y Stage permanecen iguales tras editar la configuración general; replay repetido determinista. Las autoridades del montaje se reconstruyen desde la revisión aceptada, sin duplicar recursos heredados.

[Comparación de preferencias](v2/policy-comparison.json) sobre las autoridades reales de esos días: espera válida, coste **0→5**; reentradas válidas, coste de setup **2→6**, cuatro preparaciones físicas. Las mismas alternativas fallan al cambiar el eje correspondiente a REQUIRED. El focal adicional demuestra decisión distinta: OFF selecciona ABA, PREFERRED agrupa AAB. El coste se incorpora al scoring existente; no se presenta como una prueba de óptimo global.

La corrección de contexto protegido pasa tres focales adicionales y la continuación sobre las autoridades reales de ambos días: conserva la primera familia aceptada, sus intervalos y preparaciones, y deriva las transiciones necesarias para lo pendiente. [Causa y testigos](v2/protected-context-causal.json).

## Regresión U00a–U00d

Los stacks se ejecutaron serialmente con los límites existentes. U00a/U00b conservan problemas completos, fingerprints, mapas de identidad y snapshots de Stage: **4/4, 9/9, 6/6, 3/3**. U00c conserva snapshots anteriores, rebootstrap, problema/fingerprints y Stage final, además de permisos, Draft sucio, ejecución protegida, propuesta en curso, rollback y CAS. U00d completa dos días de **4/4** con equipos físicos, alternativa B junto a C y negativos de capacidad, ventanas, transición y recurso independiente. Problemas, fingerprints y snapshots completos idénticos a la Evidence integrada. [Comparación U00a/b](v2/u00a-b-comparison.json), [comparación U00c/d y A2](v2/comparison.json).

## A2 aislado desde S0

Base archivada exacta `3a05cb0`, candidato y repetición seriales, sin UI/build/suite concurrentes y sin aumentar límites. Los tres terminan **266/266, 11 Stages, cero nuevas HARD/REQUIRED**, regeneración automática, conjunto exacto de obligaciones y conservación de cada Stage aceptado.

| Ejecución | Tiempo de iteraciones (s) | Obligaciones | Stages | Ramas |
| --- | --- | --- | --- | --- |
| base | 93.479 | 266/266 | 11 | 27.049 |
| candidate | 113.805 | 266/266 | 11 | 27.049 |
| repeat | 101.733 | 266/266 | 11 | 27.049 |

Ratio candidato/base: **1.217**; repetición/base: **1.088**. El incremento se concentra en S0 (+20,069/+8,165 s). El perfilado pareado de ese tramo vuelve a invertir el orden temporal: base 102,043 s, candidato 91,020 s, con el mismo informe y 22.053 ramas. El nuevo scorer representa 0,00006% del tiempo muestreado; el explorador de setup 1,33%/1,60% y GC 5,50%/5,55%. Estos datos no apoyan que el nuevo scoring explique el incremento inicial de veinte segundos. Hay variación temporal entre ejecuciones sin cambio estructural observado; no se instrumenta una causa concreta de host/CPU ni se certifica igualdad de throughput. [Análisis y alcance del perfil](v2/s0-time-profile.json). Los informes completos son idénticos excluyendo sólo `iterations[].durationMs`; los once snapshots de cada ejecución son idénticos, al igual que runtime/lockfile. Presencia total: **8.465 min**. Fingerprint: `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. La auditoría reutilizada revalida **22 certificados**, cierre participante/comida y conservación de ocupaciones; sus aserciones no cambian. Se corrige sólo su etiqueta descriptiva de base, conservando `verifierOriginalBaseMetadata`.

[Informe A2](v2/a2-report.json), [comparación integral](v2/comparison.json), [condiciones de ejecución](v2/a2-execution.json). Runs/snapshots/runtime están comprimidos en `v2/a2-base`, `v2/a2-candidate` y `v2/a2-repeat`. La diferencia temporal es medida, no una garantía de rendimiento. El timeout concurrente del primer borrador permanece histórico y no se usa como baseline ni como prueba de inviabilidad.

La CI inicial de `152fc31` terminó con 19 checks aprobados y dos cancelaciones después de descargas APT lentas; el recorrido de setup aún no había empezado. Se selecciona el Chromium instalado mediante el executablePath existente, con fallback Playwright, conservando todas las pruebas y los límites originales de 15/20 min. [Recibo causal de CI](v2/ci-initial.json). El estado final corresponde siempre al rollup del nuevo head.

Los perfiles se conservan comprimidos como `v2/s0-profile-base.cpuprofile.gz` y `v2/s0-profile-candidate.cpuprofile.gz`. Son mediciones S0 detenidas intencionalmente tras el primer Stage (19 obligaciones), separadas de la certificación completa 266/266. Se obtienen ejecutando, desde cada checkout, Node 20 con `--cpu-prof --cpu-prof-dir=<directorio> --cpu-prof-name=s0.cpuprofile --import tsx` y llamando al mismo `runA2Assist8Evidence({reportIterationDurations:true,stopAfterFirstProposal:true})`. Los porcentajes suman `timeDeltas` de muestras cuyo nodo o ancestro pertenece a la función/archivo medido, divididos por el tiempo total muestreado.

## Frontera y reproducción

Se habilitan auxiliares físicas con participante en espacios exclusivos de capacidad 1 y EXACT_CONSTRUCTIVE. Grupos conjuntos y elecciones itinerantes dentro del espacio v2 dan diagnóstico explícito; U00d sin estas políticas conserva su soporte. REQUIRED con pausa operativa flexible devuelve `SPACE_POLICY_FLEXIBLE_PAUSE_UNSUPPORTED`; las pausas fijas autorizadas se admiten. No hay adopción automática de jornadas anteriores. Los probes analíticos se identifican como límites superiores, sin afirmar matching ni completitud.

Reproducción serial: [reproduce.sh](reproduce.sh), sobre Node 20 con Docker/Chromium y dependencias locked. Las recetas y datos del primer borrador se conservan aparte. No se versionan credenciales, logs privados ni trazas de navegador. Sin nuevo solver, aumento de budgets/timeouts, cambios en Supabase productivo, Replit, migraciones, publicación ni merge.
