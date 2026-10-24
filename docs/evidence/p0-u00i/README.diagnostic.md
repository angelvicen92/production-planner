# P0-U00i — selección nominal 1-de-N: gate causal BLOCKED

**Implementación detenida antes de modificar producto.** La causa inicial está
confirmada, pero el patrón itinerante no constituye una abstracción de decisión
nominal reutilizable de extremo a extremo. Los contrafactuales descubren dos
fronteras adicionales reproducidas: futuro físico entre participantes distintos e
integridad de identidad en validación/fingerprint. Main añade una frontera
contractual de matching. Ampliarlas exige más que integrar un selector local; se
aplica la condición de parada del prompt antes de añadir otra capa.

Base autorizada y remota verificada: `e79f8ee1a13ef5f5df58371abc851b4746385412`,
último merge #1186. `Baseline CI` y `Data API grants` estaban en success;
los PR abiertos #1106, #1104 y #1085 pertenecían a otras unidades. Se consultaron
AGENTS, maestro P0, catálogo, Fuentes 00–07 vigentes y Evidence U00d/U00g/U00h.
La Fuente 00 real es v2.14; la referencia v2.13 de AGENTS está desactualizada.
La integración U00g se consulta en `p0-u00g/implementation/`, separada de su
diagnóstico histórico.

## Reproducción roja nativa sobre main

`causal/` conserva una jornada no A2 creada mediante las APIs productivas sobre
PostgreSQL 17, Auth y PostgREST locales, con el ledger completo sin modificar.
No se crean unidades itinerantes ni placements seed. El catálogo, las plantillas,
el perfil standalone, la jornada, los participantes, las tareas y S0 son reales.
El ensayo es **API**, sin atribuirle interacción UI ni aceptación de Stage.

- Dos participantes disponibles 09:00–09:20 y dos tareas de 20 minutos en espacios
  distintos obligan a la simultaneidad.
- Flexible declara `anyOf(A,B), quantity=1`; crítica declara `byItem(A)`.
  A y B están disponibles; sus IDs globales 2/3 corresponden a diarios 5/6.
- El builder conserva literalmente `anyOf`; preflight rechaza
  `tasks.1.resourceRequirements.anyOf.0` con `UNSUPPORTED_RESOURCE_REQUIREMENT`.
  Readiness no es READY y solicitar propuesta devuelve HTTP 422
  `UNSUPPORTED_ENGINE_INPUT`. S0 y Draft permanecen iguales.
- El contrafactual sustituye **sólo** el requisito flexible por `byItem(B)` en una
  copia de la entrada capturada. El motor original completa 2/2, ambas
  09:00–09:20, flexible→B y crítica→A, con cero HARD/REQUIRED. Con flexible→A no hay
  solución completa. No es inviabilidad del día ni agotamiento de presupuesto.

La retirada aislada del rechazo, únicamente dentro de un archivo Git descartable
y en un proceso nuevo, devuelve SUPPORTED pero pierde B del inventario canónico
y deja a la flexible sin `requiredResourceIds`. El motor propone 2/2 y su validador
informa hard-valid para esa representación incompleta. Ese resultado **no** se
aplica al Draft ni se presenta como solución productiva válida.

## Frontera causal exacta antes de implementar

[analysis.json](analysis.json) resume los recibos completos comprimidos.
[call-path.md](call-path.md) identifica las autoridades atravesadas.

1. **Futuro físico fuera del scope.** Se conservan las autoridades originales y
   sólo se comparan las dos asignaciones concretas posibles. El scope de la
   flexible→A produce una propuesta completa aunque la crítica de otro
   participante está expresamente presente en
   `analyticalFutureParticipantTasks`. Proteger ese placement como contexto de
   la siguiente ejecución deja la crítica sin solución. Flexible→B permite
   completar ambos scopes. `participantFutureFeasibility.affectedBy` sólo
   relaciona participante/dependencias, y no esta competencia por A. Existe el
   filtro puro `tasksCanAffectEachOther`, que sí incluye recursos concretos y
   puede reutilizarse; no representa dominios nominales ni constituye por sí
   solo una reserva futura de sus realizaciones. Son replays **offline**, no
   Stages aceptados.
2. **Integridad del resultado.** Quitar B a la flexible del testigo completo
   sigue dando `validatePlan.hardValid=true`; además conserva exactamente el
   fingerprint de tareas participante. El validador comprueba los recursos
   suministrados, pero no certifica una elección ordinaria contra su dominio y
   requisitos fijos. `fingerprint.ts` incluye recursos para técnicas, no para
   estas tareas. Persistir `assignedResourceIds` por sí solo no cierra esa
   pérdida ni vuelve sound los certificados.
3. **Matching Main: límite de contrato comprobado en código.**
   `PreparedPipelineBundleGraph.candidates` contiene un único bundle por
   `(mainTaskId, position)`. El matching, su deduplicación y los nogoods usan
   `id@position`, sin una dimensión de elección física. Una ampliación que
   materializara sólo la primera alternativa podría descartar todas las demás
   al prohibir esa arista. Esto es una incompatibilidad de representación
   identificada en las autoridades reales, **no** una poda de `anyOf` observada:
   el main actual lo rechaza antes de entrar. No se ha simulado un nuevo matcher.

El patrón `materializeItinerantUnitAssignment` selecciona una unidad real y une
sus miembros con recursos independientes; la agenda itinerante integra esa
elección en su búsqueda. No generaliza los contratos anteriores para tareas
ordinarias/Main. Reutilizarlo inventando equipos A/B violaría el alcance.
La búsqueda ordinary ya contiene `Positions.variants`, dominios por variante,
MRV y backtracking con el mismo ledger: es un punto de extensión reutilizable.
Limitar la implementación a ese punto dejaría fuera a los propietarios Main,
bundles y certificados, sin que el prompt autorice restringir `anyOf` a ordinary.

El mínimo que falta comprende: dominio y elección físicos separados de recursos
fijos; materialización en cada constructor que sea propietario de la tarea;
identidad de elección en matching/certificados/fingerprints; futuro entre scopes
por recurso compartido; validación de pertenencia y conservación exacta en la
proyección reversible. Estos cambios deben usar el ledger y las búsquedas
existentes. Aquí se detiene la expansión; no se añade un selector paralelo,
una política de afinidad, un solver ni presupuesto adicional. La necesidad de
SQL nuevo **no está demostrada** y no se inventa una migración.

## Auditoría posterior — Fuente 07 §4.4

X: una jornada físicamente factible no llega a búsqueda. Y: rechazo incondicional
de `anyOf`, seguido de ausencia de dominio en el adapter. Z: se rechaza el día o,
al retirar sólo el rechazo, se pierde el consumo. W: una elección reversible en
las autoridades existentes debe mantener el dominio hasta la decisión y la
identidad elegida después. M: flexible→B, crítica→A y continuación protegida con
dominios futuros abiertos, validación íntegra y persistencia real hasta Stage.

La primera hipótesis se confirma. El contrafactual integral falsifica que baste
con levantar la guardia y reutilizar la materialización itinerante: esa solución
seguiría sin protección sound del futuro físico ni integridad de identidad.
La clase de bloqueo es representacional/integración; no es una regresión de
búsqueda ni una razón para aumentar budgets. La elección operativa correcta
preserva A para su obligación exclusiva; ID no constituye una prioridad.

`manifest.json.gz` verifica igualdad de todos los archivos de `engine/`,
`server/`, `shared/`, `client/`, `supabase/` y `script/demo/` contra la base,
antes y después de la receta. Las intervenciones del dispatch y del preflight
se hacen y revierten sólo en la copia descartable. Ningún archivo de producto,
demo, schema, migraciones, RLS o presupuesto cambia en el PR.

## Validación y límites de entrega

La CI específica reproduce el bloqueo y los contrafactuales. Verde significa
**diagnóstico reproducible**, no capacidad `anyOf` habilitada. Los resultados
técnicos y su procedencia quedan en [validation.json](validation.json) y `checks/`.
Los tests diagnósticos mantienen visibles los defectos observados; no redefinen
el comportamiento deseado del producto.

No se han completado las dos jornadas funcionales hasta Stage, ni el catálogo
de adversarios de una implementación que no existe. Los negativos actuales de
otras modalidades siguen intactos. No se relanzan regresiones UI U00a–U00h ni
A2 aislado tras la parada: la igualdad de bytes demuestra ausencia de delta
productivo, pero **no se reetiquetan** los resultados de U00h como nuevas
mediciones. A2 266/266, 11 Stages, 27.049 ramas y sus fingerprints continúan como
baseline histórico de U00h; no se atribuyen tiempos o mejoras a U00i.

```sh
node node_modules/typescript/bin/tsc -p script/diagnostics/tsconfig.u00i.json
node node_modules/tsx/dist/cli.mjs --test script/diagnostics/u00iResourceGate.spec.ts
node --import tsx script/diagnostics/runU00iResourceGate.ts work/u00i-fresh
python3 docs/evidence/p0-u00i/verify.py
```

Requiere dependencias del lockfile, Docker local y un directorio nuevo. La CI usa
Node 20; el ensayo local registra su versión exacta en el manifest. Logs privados
y credenciales locales no se versionan. Sin Supabase productivo, despliegue
Replit, cambios a la demo ni merge. P0 general permanece abierto.
