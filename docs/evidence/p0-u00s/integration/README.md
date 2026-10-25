# Cierre de integración de #1197

Revisión causal: [comentario original](https://github.com/angelvicen92/production-planner/pull/1197#issuecomment-6401208982).
Head que introdujo los fallos: `dd4c61e77f152fa5ead02d453050c4a6c11d4cd3`.
Base: `ed4cc0b32c6a5850292c7157f07dee570180696b`.
Los recibos de la primera implementación en los directorios hermanos permanecen originales.
Este directorio contiene la reproducción y los recibos del candidato integrado.

## Tres fallos reproducidos

[Inventario original de CI](original-ci.json), con jobs, pasos y URLs. Los extractos originales
identifican el rechazo del seed histórico, el drift del catálogo y los cuatro RPC_BODY_DRIFT.
`before-historical.json`, `before-grants.json` y `before-continuity.json` reproducen esas tres
clases desde el head revisado en stacks descartables, con cero escrituras remotas.

X: una autoridad nativa válida rompe el import histórico y dos contratos de integración.
Y: el trigger exige un replay canónico a 088; los inventarios siguen ligados a 114.
Z: el bootstrap y los checks fallan antes de la búsqueda.
W: distinguir representación histórica por autoridad material y actualizar contratos auditados.
M: conservar el histórico literal y rechazar la autoridad nativa ficticia, con los recorridos anteriores operativos.

## Trigger: compatibilidad sin autoridad ficticia

Antes, cualquier replay se comparaba incondicionalmente con las cadenas efectivas.
Ahora se admite exclusivamente el replay histórico literal `{"contractVersion":1}` cuando
existe `planner_next_configuration` 088, no existe perfil nativo y no existe autoridad diaria.
088 y el perfil siguen congelados por sus triggers originales y por la exclusión de autoridades.
No se consulta `source`, no se reescriben revisiones y no se modifica ninguna migración anterior.

Todo replay que declare cadenas sigue comparándose con la autoridad real, también en días
históricos. Una jornada nativa con cadena materializada no puede usar el replay histórico
vacío. La ausencia nativa de policy conserva su representación anterior.

`sql-gate.ts` aplica el ledger literal en PostgreSQL 17, importa A2 con su seed original
antes de 115 y contrasta snapshots, replay y lectores después. Inserta también el replay
histórico después de 115 con otra etiqueta de source. Construye identidades y replays
canónicos coherentes para el ataque nativo y llama tanto al wrapper como al delegado.
El ataque intenta además cambiar la jornada: el rechazo revierte autoridad, revisiones
y snapshots completos. Una etiqueta histórica falsa tampoco permite pasar.

[Auditoría PostgreSQL completa](sql-audit.json.gz): catálogos 114/115, definiciones efectivas,
triggers y resultados, incluidos los 11 snapshots originales y el replay inalterado.
Las jornadas nativas repiten por separado materialización, retirada legal dentro de una
transacción, CAS, actores, huecos, sustitución, certificados y decisiones protegidas.

## Permisos efectivos y exposición

| Objeto | anon | authenticated | service_role |
| --- | --- | --- | --- |
| `plans.daily_technical_chains` | Ninguno | SELECT bajo RLS existente | SELECT/INSERT/UPDATE, escritura protegida por trigger |
| v5 y delegado anterior | Sin EXECUTE | Sin EXECUTE | EXECUTE |
| Dos aserciones materiales | Sin EXECUTE | Sin EXECUTE | EXECUTE |
| Tres funciones trigger | Sin EXECUTE | Sin EXECUTE | Sin EXECUTE directo |

El [diff exacto de privilegios](privilege-delta.json) añade seis firmas al inventario.
Los permisos de tablas, secuencias y funciones existentes permanecen idénticos; las políticas
RLS no cambian. Todas las funciones nuevas conservan SECURITY INVOKER y search_path vacío.
No se añade ningún GRANT productivo en esta corrección.

El delegado mantiene EXECUTE de servidor porque el wrapper invoker lo necesita; es el cuerpo
114 literal con otro nombre. Los roles funcionales de la aplicación usan authenticated:
ni ADMIN ni PRODUCTION pueden invocarlo por PostgREST. El delegado tampoco materializa
cadenas nuevas y el guard universal rechaza por esa vía el ataque de replay falso.
service_role sigue siendo la credencial confiada del servidor, como en los writers v2–v4.

El gate Data API comprueba el catálogo efectivo, columna por columna, y realiza lecturas,
PATCH directo de la autoridad y llamada RPC directa para siete actores. Authenticated recibe
42501 en escrituras/RPC; el PATCH de service_role recibe REQUIRES_VERSIONED_OPERATION.
No cambia ninguna fila. Cinco mutaciones deliberadas de grants/columnas son detectadas
y revertidas, además de los controles anteriores de PUBLIC, roles, RLS y privilegios ausentes.

## Cuatro cuerpos RPC

| RPC | Extensión necesaria y contrato conservado |
| --- | --- |
| `apply_day_config_operation_v5` | Wrapper de cadena; delega el resto al cuerpo 114 literalmente idéntico. Conserva EDIT/RESTORE/REFRESH, continuidad, rounds, CAS, actor y transacción. |
| `assisted_expected_obligation_sources` | Permite la captura de transición técnica versionada en la misma selección que rounds, después de la última admisión; conserva todos los checks de filas/participantes y campos de planificación. |
| `assisted_preview_s0_additions` | Usa esa misma captura para el baseline S0; conserva íntegramente las condiciones de admisión/rechazo y el token de fuentes. |
| `assisted_read_bootstrap_sources` | Omite sólo la nueva columna cuando es SQL NULL. Conserva la omisión de rounds NULL, orden, locks y todas las demás filas/campos. Una autoridad no nula se captura completa. |

Los tres diffs de lectores están guardados junto a este archivo. La auditoría contiene
también las definiciones completas de v5 y del delegado. La prueba de equivalencia limita
literalmente el diff de lectores a esas sustituciones y comprueba el delegado sin cambios.
El test de preflight manipula cada uno de los cuatro cuerpos: todos siguen produciendo
RPC_BODY_DRIFT. Ningún nombre ni control se elimina de la auditoría.

El binding de `latestAssistedSQLContracts` incluye ahora 115. El comportamiento se contrasta
con los recorridos productivos de continuidad, configuración, rounds, adiciones y Stages,
además de los tests de integridad. Los resultados y hashes del candidato se registran
separadamente de los de la primera implementación.

## Cuarta frontera detectada en CI

En `88b8348`, el job `native-rounds` de U00p llegó a los tests y detectó un desfase
adicional: `a2ExistingDatabase.spec.ts` aplicaba el ledger sólo hasta 114 y comparaba
ese catálogo con el contrato actual 115. [Log original del job](ci-rounds-binding-88b8348.log).
Se añade 115 a la aplicación explícita del ledger de ese test. Su reparación histórica
acotada a 099, sus fixtures y sus aserciones permanecen intactos. Los nueve tests del
catálogo/preflight/equivalencia pasan con las definiciones PostgreSQL efectivamente aplicadas.
No es otro rechazo del seed histórico ni una modificación del solver o de rounds.

## Conflicto de concurrencia observado en la matriz Assisted

En el mismo candidato, cinco recorridos Data API pasan y `assisted` recibe
`REBOOTSTRAP_STALE_SOURCES` al validar S11; se conserva el [log original](ci-assisted-source-88b8348.log).
En esta ruta de validación ese código lo produce el mapper existente para 55P03/40P01,
no el trigger de revisiones ni un diagnóstico de inviabilidad. La prueba PostgreSQL
mantiene un lock concurrente real y comprueba el mismo 55P03 antes y después de 115,
con lectura ordinaria permitida y commit protegido rechazado. No se identifica
retroactivamente qué proceso mantuvo el lock del runner remoto.

El job `manual-draft-validation` del mismo head pasa el recorrido completo, y la
reproducción aislada de `--restricted-data-api --full --manual-validation --transport-policy`
acepta S11 y conserva 266/266. No se cambia la validación manual, los locks, los contratos
de Draft, los límites ni el tratamiento fail-closed de conflictos. La entrega requiere
además repetir todos los jobs en el head final.

En `896c1fb`, el job Main flow acepta S1–S5 y el run 6 falla **antes de buscar**:
`could not obtain lock on relation "public.daily_tasks" · 55P03`.
El [artefacto original de CI](ci-mainflow-lock-896c1fb.json.gz) conserva los cinco
PROPOSAL anteriores, el run en error con outcome NULL y sus instantes. El control
PostgreSQL reproduce ahora los locks de plans y daily_tasks en 114 y 115 con el
mismo resultado. Se mantiene el guard y se solicita repetir sólo el job fallido,
sin cambios de fuentes, presupuestos, timeouts ni aserciones. No se presenta como
dominio vacío ni como agotamiento de búsqueda.

## Frontera de reloj detectada al repetir CI

El job `live-day-execution` de `7843f33` encuentra otro fallo, en
`executionTimeCorrections.spec.ts:96`: [log original](ci-live-clock-7843f33.log).
El negativo calculaba «otro día» restando 86.400 segundos. A las 23:14 de Madrid
del 25 de octubre de 2026, el instante menos 24 horas todavía pertenece al mismo
25 de octubre, que dura 25 horas. SQL acepta correctamente esa corrección real.

El mismo test falla literalmente en la base `ed4cc0b` y en el candidato.
`clock-regression.ts` fija el instante observado por CI y llama al SQL original:
ambos aceptan el testigo de 24h, ambos rechazan el día civil anterior con
EXECUTION_WORKDAY. [Resultados idénticos y hashes](clock-regression.json).
No se carga 115 en esa fixture; 097, 098 y la fixture de ejecución permanecen
idénticos a la base. Se corrige sólo el dato negativo para restar un día civil
en Europe/Madrid, conservando la aserción de rechazo. El gate focal completo
de ejecución pasa 59/59 y se conserva el before/after en `clock-gates.json.gz`.

## Resultados del candidato integrado

[CI completa de 896c1fb](ci-896c1fb-green.json): **20 workflows y 35 checks verdes**.
La suite de producto ejecuta 3.249 tests: 3.248 PASS, cero fallos y un skip histórico;
no se añade ninguna exclusión. La repetición de Main flow conserva el primer
recibo 55P03 y cambia únicamente el intento de CI. El commit documental de entrega
mantiene las mismas fuentes productivas y se vuelve a comprobar íntegramente en
los [checks del PR #1197](https://github.com/angelvicen92/production-planner/pull/1197/checks);
la descripción del PR registra su head y las URLs inmutables de la verificación final.

- Check, build, migraciones y TypeScript de producto/harness/integración: PASS.
- 140 pruebas focales de servicios/SQL y nueve de catálogo/preflight/equivalencia: PASS.
- Gate de ejecución y correcciones de hora después del ajuste del testigo civil: 59/59 PASS.
- PostgreSQL 17: replay histórico literal aceptado, 11 snapshots originales intactos,
  rollback tras inserción histórica y fallo posterior; falsificación nativa coherente
  rechazada por wrapper/delegado, source histórico falso, CAS y 088 inmutable.
- Data API, New day, Atomic template y continuidad: recorridos completos PASS.
  La repetición aislada de Assisted/manual/transporte acepta 11 Stages y 266/266.
- U00s candidato/repetición: cuatro jornadas y seis Stages por ejecución; 272 recibos
  por stack. [Determinismo](determinism.json) con IDs distintos: mismas decisiones,
  equipos, contadores y certificados futuros. [Candidato](native/receipts.json.gz),
  [repetición](repeat/receipts.json.gz), capturas y manifests en esos directorios.
- U00p: dos jornadas, siete Stages, seis sincronizados, 40 rechazos materiales.
  U00r: dos jornadas 4/4 con prefijos protegidos de dos y una tarea.
  U00n: dos jornadas con admisión posterior a Stage y checkpoints conservados.
  Recibos completos en `rounds-certified.json.gz`, `prefix-certified.json.gz`
  y `additions-certified.json.gz`.
- Replays fríos U00q 7/7, U00r 10/10 y U00s 5/5 por ejecución: PASS.
- [A2 candidato/repetición](a2/comparison.json): 266/266, 11 Stages, 27.049 ramas,
  22 certificados revalidados, fingerprint
  `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`.
  Informes completos iguales al baseline salvo durationMs; snapshots idénticos.
- [ASST-010 contra la base exacta](asst010-comparison.json): el diagnóstico aislado
  reproduce en `ed4cc0b` y candidato el mismo ERR_ASSERTION, NO_PROPOSAL frente a
  PROPOSAL y los mismos ASSISTED_SCOPE_INCOMPLETE/SEARCH_TIME_LIMIT_REACHED.
  Ambas ejecuciones usan Node 20.19.5, unos 371 segundos y el mismo script/benchmark
  literal. Se conservan las dos salidas completas; no se incrementan presupuestos,
  timeouts ni aserciones. Este fallo histórico no se declara inviabilidad ni se
  confunde con el recorrido A2 certificado completo.

[Binding de fuentes actuales](source-binding.json), `verify.py` y el SHA256SUMS
del directorio padre permiten contrastar el paquete con el checkout. El manifest
original se conserva también en `initial-SHA256SUMS`; el verificador comprueba
que todos sus artefactos permanecen literales salvo el enlace del README y el
proyecto TypeScript ampliado para este gate SQL. `execution-notes.json` separa
dos intentos locales descartados por cambio de fuentes durante la ejecución y
falta de espacio del resultado certificado.

La corrección de integración no modifica engine, cliente ni shared respecto al
head revisado dd4c61e. En producción sólo cambia el guard de inserción de revisiones
en 115. El resto del diff de cierre son auditorías, contratos de test, el testigo
de día civil, documentación y sus recibos. No se modifican migraciones 001–114,
fixtures históricos, presupuestos, timeouts ni el diagnóstico ASST-010.

## Reproducción del candidato integrado

```sh
npm ci
npx --no-install playwright install chromium
node --import tsx docs/evidence/p0-u00s/integration/sql-gate.ts /tmp/u00s-sql
node --import tsx --test script/demo/assistedSQLContracts.spec.ts script/demo/a2Preflight.spec.ts server/technicalChainSql.spec.ts
node --import tsx script/demo/smokeA2Integration.ts /tmp/u00s-grants --restricted-data-api --historical-topology --control-room-snapshot
node --import tsx script/demo/smokeA2Integration.ts /tmp/u00s-continuity --operation-continuity
node --import tsx script/demo/smokeNewDayIntegration.ts /tmp/u00s-new-day --post-bootstrap-additions
node --import tsx script/demo/smokeA2Integration.ts /tmp/u00s-atomic --restricted-data-api --historical-topology --atomic-template
```

Usar directorios nuevos y ejecutar stacks de navegador secuencialmente. El workflow U00s
incluye el gate PostgreSQL histórico/nativo. No se amplía ningún presupuesto o timeout.
El contrato de soporte y los límites funcionales de U00s permanecen iguales.
