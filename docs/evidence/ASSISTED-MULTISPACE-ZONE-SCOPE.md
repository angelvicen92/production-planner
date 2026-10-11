# Assisted: selección de espacios y zona

Base autorizada: `2771a83551a4e693a06768ff78cf7c5f68461010`.

## Evidence causal

La UI anterior sólo enviaba `SPACE` con un `spaceId` o una selección manual
`TASK_IDS`. `assistedScopeSelectorSchema`, `resolveAssistedScope` y el
recomendador ya admitían conjuntos multi-espacio; el límite estaba en la UI.

El nuevo selector conserva IDs de espacios como estado local. Una zona selecciona
sus miembros mediante `spaces.zoneId`; desmarcar un miembro deja la zona en estado
parcial. Se pueden combinar zonas y espacios, retirar miembros o limpiar la
selección. Las zonas con identidades diferentes siguen separadas aunque compartan
nombre, y los espacios sin relación disponible se muestran sin inventar una zona.

La conversión filtra por el estado productivo `pending`/`interrupted` y excluye
todo placement completo del Stage base aceptado. Deduplica y ordena numéricamente
los IDs. Incluso un espacio usa `TASK_IDS`: así no se reincorporan tareas aceptadas
que aún conservan estado productivo `pending`. La selección manual comparte ese
filtro. El recomendador conserva su endpoint y sus obligaciones seleccionadas.

El recuento corresponde a las obligaciones elegidas antes de generar. Con
`includePrerequisites=true`, se indica que los prerequisites adicionales los
resolverá el servidor; la UI no calcula ni incorpora un closure propio.

Cambiar selección, modo o includePrerequisites sólo cambia estado local y descarta
una preview anterior. Los tests de navegador comprueban cero escrituras y
igualdad literal del catálogo, daily_tasks, sesión, Draft, Stages, runs, revisiones
y validaciones. Generar una preview tampoco aplica el Draft.

## Integración descartable

Resultado reproducible y fingerprints: [JSON de Evidence](ASSISTED-MULTISPACE-ZONE-SCOPE.json).

Se ejecutó PostgreSQL 17 + GoTrue + PostgREST + HTTP productivo + Chromium real,
con credenciales locales generadas. La importación canónica A2 y el adapter se
verifican sin alterar sus autoridades diarias. Sólo el fixture descartable declara
una relación catalogal explícita Plató 15 → Croma, Estrellas/Sillón, añade un espacio
vacío y un nombre coincidente en otro espacio con obligaciones. Esta siembra es
test-only, opcional con `--scope-selection`; no migra ni reorganiza el catálogo real.

- Caracola José María + Caracola Lucía: **19** obligaciones en S0, request estable
  `TASK_IDS` de 19 IDs y `includePrerequisites=false`.
- Plató 15: **36** obligaciones, dos miembros reales del fixture, selección parcial
  y retirada individual/colectiva. El espacio homónimo externo no entra.
- Tras aceptar S1/S2: las Caracolas tienen **0** obligaciones editables; Plató 15
  mantiene **36**. El Stage aceptado conserva ID y fingerprint al cambiar selección.
- Propuesta → apply → validate → accept → SQL → reload: dos etapas, 38/266
  placements aceptados, cero HARD/REQUIRED y protección de placements previos.
- Segunda sesión de navegador recupera el mismo Stage y Draft.

El ensayo utiliza sólo una base nueva descartable y llega a S2. No requiere un
rollback de S10 ni escribe en Supabase remoto. La CI mantiene el ensayo completo
existente en su fixture original y añade por separado el ensayo de Scope.

## Validación y límites

Pasaron 109 tests focales y 52 regresiones: selección individual/múltiple/zona,
deduplicación, órdenes invertidos, espacios vacíos/aceptados, estados protegidos,
contrato TASK_IDS, capacidad y simultaneidad por espacio, prerequisites, workflow,
snapshots, importación descartable y Autopilot. Pasaron `npm run check`, TypeScript
de integración, `npm run build`, checker de migraciones y `git diff --check`.

La CI inicial confirmó Baseline CI y la integración A2 completa (incluido el nuevo
ensayo de selección). La suite productiva detectó que el nuevo test de capacidad,
ubicado en `server/`, infringía el aislamiento de Planner Next. Se trasladó a
`engine/planner-next/assistedLocationScope.spec.ts` conservando sus assertions y
sin alterar el gate. Pasaron los 16 tests de selección, capacidad y aislamiento
ejecutados después del traslado. Los checks del PR verifican el head actualizado.

Reproducción del navegador:

```sh
npm run demo:a2:smoke -- work/a2-scope-integration --scope-selection
```

No hay cambios productivos de servidor, endpoints, esquema, motor, matching,
Future Feasibility, poda, budgets, validación, Autopilot ni recursos. Los datos
catalogales y snapshots reales no se modifican.

El checkout inicial estaba dos commits por detrás. Tras recuperar por el conector
GitHub los 22 blobs modificados, su tree fue idéntico a la base autorizada:
`fb77eed374583b798ebe6de6fb49d3dc9c116cc5`. Origin falló una vez al conectar
con el proxy; no se reintentó. La entrega remota usa el conector GitHub.

Se leyó `AGENTS.md`, el catálogo de capacidades y las autoridades locales A2
aplicables. El usuario aportó `optiplan-fuentes-oficiales-2026-10-11.zip`; se
verificaron las diez entradas de su `SHA256SUMS` y se revisaron de forma dirigida
las Fuentes solicitadas. Sus versiones y hashes figuran en el JSON de Evidence.

| Fuente | Versión | Autoridad comprobada para este delta |
| --- | --- | --- |
| 01 | 5.2 | PlanningScope explícito, Stage completo inmutable, AutomaticProtection |
| 03 | 3.6 | Scope multi-espacio; prerequisites internos no amplían selección visible |
| 04 | 2.5 | Relaciones por IDs; compartir zona no impone coordinación ni capacidad común |
| 05 | 2.6 | Propuesta/aceptación, fingerprint y protección del baseline |
| 06 | 2.7 | A2 de 266 obligaciones; Plató 15 multi-espacio sin precedencia inferida |
| 07 | 2.2 | Trabajo pendiente/interrumpido y separación Stage/Draft/protección/configuración |

La comprobación no requirió cambios de motor ni de recursos. El adjunto se usa
como referencia documental; sus scripts de subida y apéndice propuesto de AGENTS
no se ejecutan ni se incorporan a este PR. No se hace merge.
