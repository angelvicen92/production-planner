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
aplicables. Los documentos externos numerados Fuentes 01, 03, 04, 05, 06 y 07 no
estaban en el checkout/biblioteca y se solicitaron sus rutas. No se afirma haber
verificado sus versiones externas. La CI alojada y esa comprobación documental
quedan visibles en el PR para revisión; no se hace merge.
