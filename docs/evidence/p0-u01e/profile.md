# Mapa de obligaciones y topologías

Se reconstruye el perfil lógico U01d con altas reales de catálogo, plantillas, días, participantes, tareas y autoridades por API. No se importa EngineInput ni horario de un fixture. Las horas que siguen son ventanas explícitas de esta producción sintética, independientes del A2. `EXACT_CONSTRUCTIVE`, grilla 5, presupuesto 10.000, 50 backtracks, 20 patrones, bestK=3; transiciones de recurso/unidad cero en los positivos.

| Obligación | Participantes | Cantidad de tareas | Duración física | Dependencias |
| --- | --- | --- | --- | --- |
| Preparación | P1/P2/P3 | 3 | 5 cada una | Ninguna |
| Fase I | P1/P2/P3 | 3 | 5 cada una | Preparación propia |
| Fase II | P1/P2 | 2 | 5 cada una | Fase I propia |
| Fase III, conjunta | P1+P2 | 2 | **Una** operación de 10 | Fase II de ambos |
| Fase III, individual | P3 | 1 | 5 | Fase I propia |
| Cierres | P1/P2/P3 | 3 | 5 cada uno | Conjunta/individual correspondiente |
| Competidoras A/B/C | Tres personas independientes | 3 | 15/10/10 | Ninguna |
| Pausa física A+B y tres espacios | Sin tarea/participante ficticio | Canal de pausa | 15 | Ventana explícita |

**17 obligaciones individuales, 16 operaciones físicas y una pausa.** La macro tiene fases de 3/2/2 representantes, ocho obligaciones al incorporar el peer conjunto. Se fija el orden entre fases; no se importa una permutación humana. S1 solicita sólo la competidora A; su witness incluye todo el día. S2 solicita las otras 16 obligaciones conservando S1. Solicitar cualquier peer de la conjunta cierra toda la macro; sin `includePrerequisites`, las tres preparaciones son supporting y las ocho obligaciones de la macro constituyen la propuesta, no las 17 del witness.

| Perfil | Fase I | Fase II | Fase III conjunta / individual | Cambio topológico material |
| --- | --- | --- | --- | --- |
| baseline | byItem AB | byItem AB | byItem B / C | Control U01d antes de crear catálogo itinerante |
| A-fixed | Unidad AB | Misma unidad AB | byItem B / C | Composición fija inequívoca; deja de declarar AB en finales |
| B-segments | Unidad AB | Unidad AC | byItem B / C | Dos unidades fijas diferentes comparten A; se libera B en II y A en III |
| C-joint-unit | Unidad AB | Misma unidad AB | **Unidad B** / C | La conjunta consume una unidad física; ambos peers la misma |
| D-rest-competition | Unidad AB | Unidad AC | byItem B / C | Pausa A+B exacta 08:20–08:35; AB y AC afectadas mediante miembros |
| impossible | Unidad AB | Misma unidad AB | byItem B / C | A sólo 08:00–08:40; pausa exacta 08:20–08:35 |
| unused-snapshot | byItem AB | byItem AB | byItem B / C | Catálogo/snapshots de tres unidades presentes, ninguna consumida |

El día es 08:00–16:00, personas y recursos 08:00–12:00, break global 14:00–15:00. Pausa positiva ordinaria 09:00–09:30 con duración 15. No se crea otra comida por compartir miembro. Las unidades AB, AC y B se crean por `POST /api/itinerant-teams` con listas de resourceItemIds existentes, disponibilidad propia y transición explícita 0. La creación del día materializa los IDs diarios y miembros; el verificador comprueba correspondencia global→diaria única y asignaciones efectivas de todas las tareas.

**B no es recomposición dinámica:** se seleccionan por plantilla unidades fijas distintas, sin cambiar los miembros de una misma identidad a lo largo del día. No hay `any`, alternativas, selección heurística ni membresía temporal. La presencia de una unidad no hace que una tarea posterior la consuma. `receipt-probes.ts` fuerza AB en la tarea final C únicamente en memoria: el resolver devuelve ABC, no C. Esa intervención demuestra por qué mantener el mismo nombre/unidad en la última tarea no representa liberar A/B.

## Agenda, propiedad y ocupación

El recorrido productivo ensayado conserva agenda física y ocupación de espacio por defecto. No se usa una agenda itinerante como sustituto de la macro REQUIRED. En dos contrafactuales A adicionales, `withDailyTaskOperationScopes` valida, sobre un clon sin las estructuras rechazadas, `agendaScope=ITINERANT_UNIT`, `resourceInheritance=OPERATION_ONLY`, unidad fija y `declaredResourceIds=[]`. Se añaden después conjunta/fases sólo en memoria. Con `blocksSpace=true` y `false`, adapter SUPPORTED, witness físico y certificado WITNESS; los miembros AB permanecen exactos. Esto demuestra separación interna, **no autoría conjunta de scopes+fases en SQL**. Los guards actuales de ambas familias la siguen excluyendo.

## Contraste con Fuente 06

Se aplica Fuente 06 §8.2–8.3 y §14: tres fases C+EVA → Alfombra con C+EVA → Alfombra sin EVA; última fase con operación conjunta y liberación posterior de EVA. La analogía exigida es estructural: requisitos reales por operación, orden de fases y ausencia de huecos; retirar el miembro liberado no permite borrar otros miembros necesarios. A actúa como recurso liberable en esta prueba, sin convertir su nombre en una regla de dominio.

No se importan las 16:00 de EVA, las duraciones A2, sus participantes, el orden humano, ni las 266 obligaciones. No se inventan montaje/traslado/operaciones de la cabecera del PDF. La transición cero se declara para esta prueba; no significa que cualquier reposicionamiento esté incluido. Una transición positiva configurada se valida como hard. Esto **no crea el A2 completo desde UI**, ni certifica el pool alternativo A/B, Main/Vocal, `requiresBand` o las demás obligaciones A2.
