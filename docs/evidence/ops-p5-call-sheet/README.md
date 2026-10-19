# P5 — Hoja del día por destinatario

Base: `f1f085ff9c5a93c012a3c5c7d9136259c4755a93`. Rama: `codex/ops-p5-call-sheet-recipient-views`. Fuentes consultadas: 00 v2.13, 01 v5.2 (roles, recursos y personalización), 04 v2.7 (asignación efectiva y snapshots), 05 v2.7 y 07 v2.2. Se contrastaron `shared/execution.ts`, hooks existentes, asignaciones de Day Setup, rutas de lectura, migraciones 093/096 y Evidence G0. Ninguna fuente oficial se modifica.

## Antes / después y causa

Antes, el selector cambiaba principalmente «Enfoque», Redacción enumeraba todas las tareas como «Hit», «Solo mis scopes» ignoraba modalidades y el recurso cámara se asociaba a cualquier tarea con cámaras. El fallback sin relación demostrada era el planning entero. Notas y encabezado no distinguían con suficiente claridad su procedencia.

Ahora una proyección local única determina actividades, briefing, siguiente pendiente, recursos, avisos, copia e impresión. «Mi hoja» es el inicio de una cuenta vinculada; una cuenta sin vínculo entra en «Vista general» con aviso. Una hoja personal vacía sigue vacía. Las tareas simultáneas se conservan, ordenadas por inicio previsto e identidad. Los estados y horas registradas se distinguen de horarios y ubicaciones previstos; no se calculan presencia, traslados, retrasos ni ETA. No se duplican listados de tareas por enfoque.

## Correspondencia reproducible

El fixture está en `client/src/lib/call-sheet-test-fixture.ts`; las aserciones, en `call-sheet-projection.test.ts` y el ensayo de navegador. Los IDs siguientes son exclusivamente datos de prueba.

| Destinatario | Relación efectiva | Actividades exactas |
| --- | --- | --- |
| Ana (persona 1) | asignación 31, Producción, plató 10, modo plató | 11, 12 |
| Bruno (persona 2) | asignación 32, mismo plató y función | 11, 12 |
| Celia (persona 3) | asignación 33, Redacción, espacio 201, modo espacios | 13 |
| Diego (persona 4) | asignación 34, Producción, espacio 201 | 13 |
| Elena (persona 5) | catálogo sin asignaciones | vacío |
| Recurso global 91 | snapshot nominal 501, asignación al plató 10 | 11, 12 |
| Recurso global 92 | snapshot nominal 502, asignación al espacio 201 | 13 |
| Coach vocal, tipo 8 | recurso nominal 503 consumido en espacio 201 | 13 |
| Cuenta con persona 1 y recurso global 92 | unión independiente de ambas relaciones | 11, 12, 13 |
| Por espacio 101 | ubicación exacta, sin expandir al resto del plató | 11 |
| Redacción agregada | solo asignaciones `staffRole=editorial` | 13 |
| Vista general | todas las actividades legibles de jornada 1 | 11, 12, 14, 13 |
| Jornada 2, persona 1 | no hereda las asignaciones de jornada 1 | vacío |

La tarea 14 carece de ubicación; aparece en general o si se le asigna un recurso nominal explícito en el test correspondiente. Dos actividades a las 09:00 siguen siendo dos, nunca una «ruta» inventada. Se cubren varios ámbitos por persona, modo plató/espacios, ausencia de fila de modo (defaults diferenciados de 096), persona inactiva, ubicación contradictoria, datos incompletos y referencias de recursos no disponibles. La proyección conserva los IDs de asignación que justifican cada actividad.

## Autoridad de cada selección

| Selección | Quién la ofrece la UI | Autoridad informativa |
| --- | --- | --- |
| Mi hoja | cuenta autenticada | `/api/me/links`, asignaciones nominales de esa persona y/o recurso global vinculado |
| Vista general | consulta ya autorizada | las tareas que permite leer la API actual |
| Por persona | admin / production, obtenidos de `/api/me/role` | catálogo y asignaciones del día, seleccionadas por ID y nombre |
| Por rol | admin / production | `staffRole` efectivo, separado del rol autenticado |
| Por función de recurso | admin / production | tipos reales del snapshot y consumos de sus recursos nominales; ninguna clasificación por parecido de nombres |
| Por plató / espacio | admin / production | ubicación de tarea y `plan_space_settings` del día; catálogo solo para nombres |
| Por recurso nominal | admin / production | `assignedResources` (IDs del snapshot), asignaciones efectivas de espacio/plató y `resourceItemId` (identidad global) |

Las modalidades suprimen asignaciones dormidas. En modo espacios no se hereda una asignación de personal al plató; en modo plató se suprimen asignaciones de personal por espacio. Sin fila de modo se mantienen los defaults de cada rama de 096. Las asignaciones editoriales sirven para lectura informativa y no se introducen en `ExecutionContext` ni autorizan ejecución. El consumo nominal reutiliza la unión por tarea/espacio/plató del contrato de lectura de ejecución existente (093), con comprobación de coherencia espacial y disponibilidad del recurso del día. No se usa la cantidad genérica de cámaras para identificar personas.

La previsualización dice «Vista previa de Producción · solo lectura». No hay comandos de ejecución, cambio de actor, claims, sesión, cookies ni permisos. Se vuelve a comprobar el rol real al proyectar una selección; el ensayo manipula una opción del selector de viewer y verifica que permanece en su propia hoja editorial. Seleccionar destinatarios no provoca peticiones de escritura ni un cambio de sesión.

**Límite de seguridad existente:** `server/apiAuthorization.ts` permite lectura de tareas, asignaciones y catálogos a admin, production, aux y viewer. La API devuelve datos globales de jornada mediante servicio privilegiado; este filtro de cliente organiza información, **no es una nueva frontera de confidencialidad ni sustituye autorización del servidor**. Restringir esos payloads exigiría otro contrato de lectura y queda fuera de P5/G0. La UI no ofrece a aux/viewer las herramientas globales de previsualización de Producción, pero tampoco afirma que sus payloads estén aislados por persona.

## Fronteras y limitaciones explícitas

- Producción/ayudante y Redacción se implementan por sus asignaciones propias, sin convertir actividades en hits. Técnicos, cámaras, coaches y otros recursos se implementan por identidad y consumo nominal del snapshot y agregación del tipo real, sin inferencias de nombres.
- **Equipos itinerantes/reality:** el planning interno representa selecciones de equipo, pero `getTasksForPlan` no expone esa selección efectiva por tarea del snapshot. Lo que expone en `template.itinerantTeamRequirement/Id` procede del catálogo general mutable, no del snapshot seleccionado. Las asignaciones `itinerant_team` y `reality_team` quedan visibles como «Asignación no verificable» y no incorporan tareas. No hay un caso representable autoritativo a través de este contrato HTTP que pueda certificarse aquí. Falta una lectura de selección efectiva equipo–tarea del día, con identidad/procedencia. No se añade un contrato ficticio para hacer pasar un test positivo.
- **Realización:** no existe relación estructurada de destinatario/actividad; la selección es vacía con limitación explícita y permite volver a general.
- **Persona y recurso de otra cuenta:** los vínculos ajenos no se exponen a esta pantalla. La previsualización de persona certifica sus asignaciones de personal; no puede prometer equivalencia completa con una cuenta que además tenga un recurso nominal vinculado. Se avisa en la propia hoja y puede consultarse el recurso nominal por separado. La hoja propia sí une sus dos vínculos confirmados. Falta una autoridad de lectura explícita para completar esa previsualización, sin recurrir al listado administrativo de usuarios ni asumir permisos nuevos.
- No existe lectura independiente de descansos nominales en los endpoints utilizados; no se infieren pausas de huecos ni de reglas generales. Tampoco se reconstruye un historial de cambios del planning o incidencias desde datos que no se han leído.
- Las etiquetas de actividad/catálogo pueden cambiar con el catálogo; su procedencia se declara. Las relaciones operativas se resuelven con datos nominales y espaciales diarios disponibles, sin afirmar una revisión histórica de nombres no expuesta por esta API. Las lecturas son independientes y el momento mostrado es la lectura más antigua del conjunto, no una transacción atómica ni una sincronización en tiempo real. Hay actualización manual.
- Cambiar jornada reinicia expresamente la perspectiva a la hoja propia (si existe vínculo) o general; no conserva IDs de otra jornada.

## Lectura, sesión y notas sin efectos remotos

La adaptación `use-call-sheet-data.ts` queda local a esta pantalla. Los hooks compartidos no se cambian para respetar P4. `useMeLinks` y `useUserRole` usan claves personales sin ID de cuenta: aquí identidad y datos se cachean por cuenta y jornada, con cancelación por señal y remount por usuario. El ensayo cambia realmente la sesión del SDK en la misma página, sin limpiar React Query, y retrasa la identidad para detectar contaminación.

Se evita `usePlanOpsData`: su `GET /api/plans/:id` llama a `syncPlanMealBreaks`. Se obtiene la cabecera de la lista de planes y se leen endpoints sin esa sincronización. Se evita asimismo el hook de jornada que puede limpiar una preferencia mediante POST; la selección queda local. No hay escritura de la hoja en Supabase. El bootstrap de autenticación preexistente de la aplicación aparece únicamente como tráfico simulado en el ensayo.

Notas nuevas: `call-sheet-notes-v2:<userId>:<planId>:<selección>`. Se cargan con estado inicial del componente y se escriben solo al editar, evitando el efecto que sobrescribía notas al cambiar de clave. Las claves antiguas `call-sheet-notes-<planId>-<enfoque>` no se alteran: sus contenidos pueden consultarse como notas anteriores sin cuenta ni destinatario confirmado. Son locales, no compartidas ni escritas en nombre del destinatario. Solo las notas nuevas de la hoja seleccionada se imprimen; no se exportan silenciosamente las antiguas.

## Pruebas y resultados

Gate local, Node 24.19.0:

- `npm run check`: PASS.
- `npm run build`: PASS; persiste el aviso de tamaño de bundle existente.
- 75 tests focales y de regresión: PASS (14 de proyección; ejecución, incidencias, autorización HTTP, precondiciones, vista de ejecución, correcciones de horas, workflow, snapshots y fidelidad de snapshots A2). Bases PGlite locales descartables; no base remota.
- Navegador Chromium: PASS, aplicación real con HTTP interceptado, sesiones sintéticas y endpoints exclusivamente locales. Cuenta vinculada por defecto, selección Ana/Celia, notas, falta de vínculos, fallo de identidad, viewer sin poderes y sin contaminación de caché al cambiar cuenta.
- Móvil 390×844, tablet 768×1024 y escritorio 1440×1000: sin overflow horizontal. Se comprueban compacto/detallado mediante el mismo DOM proyectado y exportación por diálogo actual. Se verifica impresión con ayuda Radix cerrándose: su contenido/fondo y la cabecera móvil se excluyen; la altura de la aplicación no recorta páginas.
- PDF de Celia: una página A4, solo actividad 13, nombre y fecha correctos, sin diálogo. PDF de Ana ampliada con 40 actividades locales de prueba: 42 actividades en nueve páginas A4. `pdftotext` confirma las 40 adicionales más 11/12, incluida la última; no hay una sección gigante ni listado duplicado.
- Cero comandos de escritura de la hoja en el ensayo; sesión/cookies idénticas antes/después de previsualizar; no se usa `GET /api/plans/:id`. Mutaciones del fixture para el test de paginación se restauran y se compara el fixture completo.

Reproducción:

```sh
npm run check
npm run build
node --import tsx --test --test-concurrency=1 client/src/lib/call-sheet-projection.test.ts client/src/lib/execution-precondition.test.ts client/src/lib/day-execution-view.test.ts server/apiAuthorization.spec.ts server/liveExecution.spec.ts server/incidents.spec.ts server/executionTimeCorrections.spec.ts server/assistedPlanningWorkflow.spec.ts server/assistedPlanningSnapshot.spec.ts server/assistedManualSnapshotFidelity.spec.ts
node --import tsx client/src/pages/call-sheet.browser.mjs
pdftotext work/p5-browser/celia-A4.pdf -
pdftotext work/p5-browser/ana-multiple-A4.pdf -
```

El navegador usa Chromium instalado por Playwright o `/usr/bin/chromium`; admite `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Los archivos de `work/p5-browser` son artefactos de ejecución. La CI propia ejecuta proyección, regresión de permisos y navegador y publica screenshots/PDF; Baseline CI mantiene TypeScript/build. El JSON y las capturas de esta carpeta registran la ejecución local. La CI remota se comprueba sobre el head del PR, sin confundirla con estos resultados locales.

## Preservación y alcance

El diff contra la base en `server/`, `shared/`, `supabase/`, `engine/`, Mi Día, sus utilidades operativas/temporales y Control Room es vacío. Las pruebas de workflow/snapshots y fidelidad del A2 completo permanecen correctas. No se cambian las 266 obligaciones, planning aceptado, Stages, Draft, locks, horas reales o incidencias; no se regenera el solver ni se toca una base real para certificar esta vista. No se modifica P4 ni se publica Replit. Sin merge.

Fixture aceptado `server/fixtures/assistedA2S10.json`: 266 tareas; SHA-256 `58cd5c0a49d7e8ff71ffbd0875192ef87fd95738f8870aeee06b82374e266500`, sin diferencias respecto de la base.
