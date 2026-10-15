# OPTIPLAN — P1: auditoría integral de configuración y catálogos

Fecha: 15 de octubre de 2026 (Europe/Madrid). Repositorio: `angelvicen92/production-planner`. Base inspeccionada: `621303a3b3e1e3a2d745e35de9db0a0cbd28c7c9`. Destino exclusivo: `codex/configuration-catalog-audit-p1` → `main`. El checkout local `work` es el alias del entorno; ambas ramas remotas coincidían con la base al comenzar. No se cambia de rama ni se interviene en la reparación paralela de A2 27002.

## Resumen ejecutivo — entregable I

La superficie de configuración promete más uniformidad de la que existe. Hay tres contratos diferentes: defaults globales, snapshots/overrides versionados y autoridades Next explícitas del día. Se deben conservar estas autoridades, la protección humana y los validadores. La solución es completar sus recorridos y presentar su alcance real.

Los problemas concretos prioritarios son:

1. **Pesos generales presentados como optimización vigente:** Next no proyecta cinco pesos legacy a su problema; la agrupación se neutraliza expresamente en días Next. El presupuesto de «roturas nivel 10» no tiene consumidor operativo localizado. La permanencia total puede editarse en el día, pero el adaptador legacy la proyecta a cero. No deben ofrecerse como controles funcionales de Assisted.
2. **Plantillas con guardado incompleto:** `saveEdit` muestra márgenes antes/después y los carga, pero omite ambos campos en su PATCH. El alta completa se rechaza porque envía márgenes no admitidos por el schema estricto; el storage global tampoco los mapea. Las dependencias inversas se guardan con varias peticiones sin atomicidad de grupo. El aviso de alternativas itinerantes conserva una afirmación antigua aunque el adapter actual sí representa subconjuntos.
3. **Falta un editor de composición itinerante:** el catálogo global sólo permite código/nombre/alta/baja. No existe reconciliación productiva demostrada entre equipos globales 1–3 y unidades diarias 5001–5003 / 105001–105003. Personal asignado, componentes de recurso y bundles son conceptos distintos.
4. **Gobierno de capacidades desactualizado:** el registry real cuenta **3 PRODUCTIVE, 15 PARTIAL, 3 MISSING, 5 BLOCKED, 1 NOT_APPLICABLE**. El informe histórico todavía dice 2/14/5/5/1. La frase «no proyecta itinerantTeamAvailability» ya contradice el código. No se retiran bloqueos RLS sin certificación de catálogo SQL del entorno.
5. **Faltan superficies productivas:** ventanas de disponibilidad editables (aunque haya APIs), coordinación Next, miembros de unidades, setups/rondas/cadenas, capacidad espacial representable y tiempo por propuesta Assisted con sus niveles y terminales. El selector de segundos de generación legacy no completa ese contrato.
6. **Control Room contiene controles sin wiring actual:** idle/activar idle/activar próxima no llegan a `projectControlRoom`. Retraso, activar retraso y el umbral próximo sí tienen consumidor; este último sólo gobierna el aviso de ubicación pendiente.

**Catálogo vivo confirmado mediante GET:** 85 plantillas (23 originales + 31 de cada familia A2), 30 zonas, 49 espacios, 22 recursos concretos, 3 equipos globales y 0 bundles. Hay seis jornadas, 865 tareas y 154 snapshots de plantilla en la selección de columnas permitida. Ambas jornadas A2 conservan 266 tareas. La similitud nominal de 31 grupos de plantillas no certifica equivalencia. Ninguna entidad queda autorizada para eliminar.

**Otro gap P0:** el alias real PATCH `/api/ta/:id` no figura en el mapa de roles del middleware; autentica pero no aplica el gate admin del prefijo esperado. Se documenta la caracterización local, sin probar escrituras ni cambiar permisos.

**Decisiones propuestas:** mantener horario/comida/transición versionados, AUTO/SOFT y protección; retirar de la operación habitual los controles legacy o no consumidos; completar composición/alternativas y revisión efectiva usando los contratos existentes; ofrecer catálogo activo filtrado con archivo accesible. No se implementa ninguna de estas propuestas en P1.

## Entregables y orden de lectura

| Entregable | Artefacto |
|---|---|
| A. Campos, UI, APIs, validación, persistencia, consumidor y gaps | [01-field-audit.md](01-field-audit.md), [tabla de todos los sitios UI](generated/ui-traceability.md), [recorrido de 16 dimensiones por control](generated/ui-controls.json), [acciones](generated/actions.json) |
| B. General → snapshot → override → input → motor → validación | [01-field-audit.md](01-field-audit.md), sección de precedencias y matriz efectiva |
| C. Escalas 0–10 | [02-heuristics.md](02-heuristics.md), [experimentos offline](generated/characterization.json) |
| D. Unidades itinerantes y composición | [03-itinerant-teams.md](03-itinerant-teams.md) |
| E. Plantillas y sus parámetros | [04-task-templates.md](04-task-templates.md) |
| F. Duplicados, referencias y limpieza segura | [05-catalogs.md](05-catalogs.md), `generated/catalog.json`, `generated/catalog.md` |
| G. Configuración premium, roles y explicaciones | [07-configuration-ux.md](07-configuration-ux.md) |
| H. Gaps y unidades independientes verificables | [06-capabilities-backlog.md](06-capabilities-backlog.md) |
| I. Resumen ejecutivo | Este documento |
| Reproducción, cobertura, límites y resultados | [08-verification.md](08-verification.md) |

## Autoridad y método

Gobierna Fuente 00 v2.12 y su corpus: 01 v5.2, 02 v2.2, 03 v3.7, 04 v2.7, 05 v2.7, 06 v2.9 y 07 v2.2. Anclas materiales: 01 §§3–7A; 02 §10.5 y presupuesto; 03 §§7, 21, 24 y Parte III §§5–7; 04 §§3–5, 9–10 y §20 completo; 05 gates y §6.6; 06 canon, topología y correcciones; 07 §4.4. Los PDFs A2 se preservan como evidencia humana, nunca como semilla del solver. `shared/configurability.ts`, el informe v2.4 y el capability catalog son evidencia descriptiva, no fuentes normativas superiores.

El inventario combina recorrido de rutas y componentes, AST TSX reproducible, esquemas de DB/API, inspección de productores y consumidores, tests locales y lecturas REST de columnas explícitas. No se asigna PRODUCTIVO sólo por tener columna o persistencia. La certificación local de una regla no certifica automáticamente el journey de navegador ni el despliegue conectado.

Clases de controles: **PRODUCTIVO**, **PARCIAL**, **LEGACY**, **INFORMATIVO**, **SIN EFECTO DEMOSTRADO**, **INCOMPATIBLE**, **FALTANTE**. Las dos últimas incluyen contratos rechazados y superficies inexistentes, no necesitan un widget para figurar en el inventario. Los estados ingleses del registry son otra taxonomía y no se sustituyen silenciosamente.

**No encontrado** significa que la búsqueda/inspección no localizó una capa o prueba, con alcance documentado. **Ausencia de efecto demostrada** exige además corte causal: campo que no se envía, peso anulado, problema Next invariante o consumidor que no recibe el parámetro. Una igualdad de resultados en un caso aislado no demuestra insensibilidad universal.

## Conservación y límites de certificación

Sólo se añaden documentación y herramientas de auditoría. No se cambia UI, navegación, API, contratos, EngineInput, heurísticas, motor, permisos, RLS, migraciones o datos; no se publica ni se hace merge. No se prueba el HTTP 500 ni S0 de la rama paralela. No se modifica ninguna obligación ni referencia A2.

La extracción amplia inicial fue rechazada por revisión automática por volumen/sensibilidad; se sustituyó por GET con columnas explícitas de catálogo y relaciones, sin identidades de usuario, contactos, notas, tiempos reales ni payloads de Stage/replay. Las referencias dentro de esos payloads históricos siguen pendientes. RLS no se certifica por una lectura service-role; se entrega SQL SELECT para cerrar esa verificación. Esas limitaciones **impiden autorizar borrados o reclasificar globalmente las cinco capacidades BLOCKED**.
