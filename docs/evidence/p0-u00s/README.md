# P0-U00s — REQUIRED técnico diario hasta Stage real

**Candidato integrado posterior a la primera implementación:** [corrección de las tres fronteras de CI y recibos nuevos](integration/README.md). Los recibos y resultados originales de esta página corresponden al head revisado `dd4c61e` y se conservan sin sobrescribir.

Base `ed4cc0b32c6a5850292c7157f07dee570180696b` (#1196). Una autoridad diaria explícita, tipada y versionada para **una cadena lineal de técnicas sin participante**: orden declarado, adyacencia exacta REQUIRED y uno o varios recursos nominales byItem presentes en todos los miembros. Se configura después de crear las tareas, desde Configuración del día, sin introducir IDs manualmente.

La implementación reutiliza el consumidor técnico existente. No modifica algoritmos, heurísticas, budgets ni el reconocimiento inferido U00r. La migración incremental 115 extiende el writer diario y añade guards materiales de revisión y Stage; no modifica migraciones históricas, perfiles congelados ni 088. ADMIN/PRODUCTION pueden editar con CAS, Draft limpio y sin propuesta activa; los miembros protegidos por ejecución, locks o cualquier Stage histórico impiden cambiar/retirar la regla.

[Arquitectura y complejidad SQL](architecture.md) · [Antes/después y camino causal](causal-path.md) · [Negativos y permisos](negative-matrix.md) · [Autoridades consultadas](authorities.json).

## Jornadas productivas independientes

PostgreSQL 17, GoTrue, PostgREST, navegador Chromium y API reales, en stacks locales descartables. Catálogos, tareas, participantes e inventarios nuevos, sin A2, seeds de soluciones o EngineInputs editados para aceptar un Stage. Cada cadena se guarda desde UI, se recarga y se comprueba en EngineInput/preflight/adapter. Los IDs de T1/T2/T3 **no son crecientes** para demostrar que el orden del array es semántico.

| Día | Resultado auténtico | Primer stack |
| --- | --- | --- |
| A | S1: T1 09:00–09:15 → T2 09:15–09:35 → T3 09:35–09:45, equipo nominal común. S2 añade la independiente 09:45–10:05. **4/4** | Stages 2 y 3, revisión 8 |
| B | La policy es válida, READY y SUPPORTED. Las dependencias ordinarias admiten esperas de 20 y 5 min; REQUIRED tiene dominio exacto cero. La UI explica el conflicto, la propuesta no existe y no se acepta Stage | Sólo S0; 85 ramas, MACRO_ZERO_DOMAIN |
| C | Otra jornada preparada desde origen con la ventana de T1 ampliada. S1: 10:25–10:45 → 10:45–11:00 → 11:00–11:25. S2 añade la independiente 11:30–11:45. **4/4** | Stages 6 y 7, revisión 24 |
| D | S1 acepta **sólo la independiente** 09:45–10:05; las tres técnicas continúan pendientes. Un witness REQUIRED 09:00–09:45 queda únicamente en Evidence. S2 coloca la cadena y conserva la independiente literal. **4/4** | Stages 9 y 10, revisión 32 |

Son **seis Stages aceptados explícitamente**, además de los S0 de bootstrap. C no modifica ventanas con un endpoint nuevo ni altera EngineInput: usa operaciones productivas existentes antes de crear esa jornada. Una configuración válida, un dominio factible, una propuesta certificada y un Stage aceptado se registran como hechos distintos.

[Recibos originales](native/receipts.json.gz) · [Manifest y hashes](native/manifest.json.gz) · [Repetición con identidades desplazadas](native/repeat-receipts.json.gz) · [Determinismo](native/comparison.json) · [Binding con el checkout](source-binding.json).

Capturas: [A configuración](native/A-configuration.png), [A S1](native/A-S1.png), [A S2](native/A-S2.png), [B sin propuesta](native/B-no-proposal.png), [C S1](native/C-S1.png), [D S1 independiente](native/D-S1.png), [D S2](native/D-S2.png).

## Geometría, matching, futuro y presupuesto

`resolveAssistedScope` incluye los compañeros elegibles de la unidad nativa cuando se selecciona un miembro. El adapter conserva el orden y los namespaces diarios. La macro se reconoce como TECHNICAL_CHAIN; el explorador contiguo anterior comprueba cada duración, espacio, ventana y recurso. La asignación byItem ya fija el equipo: no hay matching libre de sustitutos ni elección por nombre. Un sustituto disponible no satisface el ID REQUIRED.

A S1 consume 14 ramas y C S1 consume 31. Sus continuaciones independientes consumen 2. D S1 conserva el futuro con 99 ramas de búsqueda y 13 cargos adicionales de certificación, **dentro del remanente de las 10.000 ramas configuradas**; D S2 consume 14. La Evidence separa `execution.work` y `technicalChainCertificate.consumed`. No se amplía ningún límite. Un allowance cero se diagnostica BUDGET_EXHAUSTED, nunca dominio vacío.

El certificado vuelve a contrastarse materialmente en SQL al validar y al aceptar: revisión/replay, miembros auténticos, duraciones, espacios, dependencias, adyacencia y equipo; también los recursos físicos reales de los competidores. Omitir un recurso heredado o borrar el recurso de la independiente para fingir que un witness sobrevive se rechaza aunque snapshot y hashes se recalculen. Las pruebas focales conservan sus contrafactuales de aceptación incorrecta anteriores al guard final.

La UI selecciona la unidad completa. El guard admite un prefijo **inicial y literal** sólo con un witness completo asociado a una propuesta auténtica del mismo snapshot/revisión. Su contrato material se prueba focalmente en PostgreSQL; no se declara un Stage parcial nativo que la UI no ofrece. D sí demuestra un Stage nativo sin ningún miembro colocado, preservando el futuro sin materializarlo.

## Revisión, protección y ataques

El ataque U00q pasa de una revisión candidata aceptada sin autoridad efectiva a `TECHNICAL_CHAIN_AUTHORITY_NOT_MATERIALIZED`. Se comprueba con payload vacío e identidad/replay coherentes, incluida una retirada legal dentro de transacción. El guard universal alcanza también los writers genéricos anteriores y la inicialización; no basta recalcular configurationFingerprint.

Los probes verifican permisos HTTP/SQL, referencias ajenas o inexistentes, duplicados, orden/dependencias, recurso no exigido, sustitución, huecos, CAS, carrera real de dos editores, fuentes bloqueadas por otra conexión, Draft sucio, propuesta activa, done/in_progress, locks, 088, perfil congelado, historial y snapshot/certificado alterados. Las propuestas duplicadas de determinismo se descartan mediante producto: la retirada posterior devuelve **PROTECTED_DECISIONS**, sin quedar enmascarada por PENDING_PROPOSAL. El mismo rechazo se verifica tras rollback a S0.

Rollback/redo conserva la autoridad y el puntero diario vigentes; S0 y los Stages originales conservan sus snapshots y revisión histórica. Los recibos incluyen daily_tasks y las filas de configuración con diff, actor y provenance. [Matriz de negativos](negative-matrix.md).

## Validación y límites

- `npm run check`, `npm run build`, `npm run check:migrations` y TypeScript del harness: PASS.
- Suite focal de 29 archivos y 469 pruebas: PASS; se repiten los 26 tests de servicio y los contratos diarios/SQL después de los últimos cambios materiales.
- U00q: replay completo 7/7 y los seis controles REQUIRED de U00r; U00r: replays, literal B y dos jornadas nativas con prefijos de dos y una tarea, **4/4** en ambas. U00p: dos jornadas nativas, siete Stages aceptados, seis sincronizados y 40 rechazos SQL/certificado. [Recibos de regresión](regressions/).
- A2 candidato/repetición: **266/266, 11 Stages, 27.049 ramas, 22 certificados revalidados en total**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`. Informes completos iguales al baseline salvo durationMs, snapshots iguales. [Comparación](a2/comparison.json).
- Determinismo: dos stacks nuevos con IDs diarios distintos; mismas decisiones por identidad operativa, contadores y certificados futuros. Cada snapshot, revisión y replay se recomputa en frío.

La suite amplia original terminó con 3.244 correctos y cinco fallos: cuatro se reconcilian con las expectativas del nuevo catálogo/boundary y el test histórico `Object.groupBy` en Node 24. **ASST-010 sigue reproduciendo su fallo histórico de SEARCH_TIME_LIMIT_REACHED**, ya documentado en la base U00p; no se declara inviabilidad ni se altera su assertion, timeout o presupuesto. No se afirma que toda la suite global esté verde. [Resultado y reconciliación](checks/wide-suite-reconciliation.json).

Fuera de soporte: más de una cadena, phases/orden parcial, ciclos/branching, técnicos con participante, alternativas nominales técnicas, políticas soft/OFF/PREFERRED y mezclas con setup, joint, rondas o itinerancia. Una cadena bien formada puede ser físicamente imposible. Esta unidad no cierra todo P0. Ninguna escritura remota de base de datos, cambio de Fuentes oficiales, merge o despliegue.

## Reproducción

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00s/run.ts /tmp/u00s-new
U00S_REPEAT=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u00s/run.ts /tmp/u00s-repeat
python3 docs/evidence/p0-u00s/pack.py /tmp/u00s-new /tmp/u00s-public
python3 docs/evidence/p0-u00s/pack.py /tmp/u00s-repeat /tmp/u00s-repeat-public
python3 docs/evidence/p0-u00s/verify.py /tmp/u00s-new/native
python3 docs/evidence/p0-u00s/compare.py /tmp/u00s-public /tmp/u00s-repeat-public /tmp/u00s-comparison.json
U00S_RECEIPTS=/tmp/u00s-public/receipts.json.gz node --import tsx docs/evidence/p0-u00s/replay.spec.ts
node --import tsx server/technicalChainStructure.spec.ts
node --import tsx server/technicalChainSql.spec.ts
```

El dispatch de journeys sólo se cambia en un archivo descartable. Los hashes se comprueban antes/después. Los paquetes públicos excluyen app-private.log, passwords y tokens. El workflow `p0-u00s-technical-chains.yml` ejecuta el gate nativo con el ledger literal y conserva los recibos.
