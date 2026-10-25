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

## Reproducción

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
