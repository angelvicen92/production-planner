# Perfil integrado y obligaciones

Se parte de la topología productiva U00y: preparaciones por participante → operación conjunta → obligaciones individuales posteriores, con recurso nominal compartido y competidora. U00z añade disponibilidad/descanso físico independiente. Aquí se amplía a tres participantes y tres fases, sin importar ningún input A2. Los catálogos, plantillas, recursos, participantes, tareas, joint group y pausa se crean por API; el día se crea desde el diálogo real de Chromium con Auth. La estructura rechazada también se envía a la API del producto.

## Mapa reproducible

Los números siguientes son IDs devueltos por la primera base descartable; nunca se utilizan como condiciones de producto. El runner deriva todas las referencias de las respuestas. La segunda base repite estas identidades por creación desde cero, sin normalizar resultados.

| Obligación | IDs individuales | Participantes | Espacio | Duración física | Recurso/dependencia |
| --- | --- | --- | --- | --- | --- |
| Preparaciones | 1, 6, 11 | 1, 2, 3 | 4 | 3 × 5 | Sin kit; preceden A del mismo participante |
| Fase A | 2, 7, 12 | 1, 2, 3 | 1 | 3 × 5 | Kit; depende de preparación propia |
| Fase B | 3, 8 | 1, 2 | 2 | 2 × 5 | Kit; depende de A propio |
| Fase C, operación conjunta | 4 y 9 | 1 y 2 | 3 | **10 una vez** | Kit; ambas dependencias B y ambas agendas individuales |
| Fase C, operación individual | 13 | 3 | 3 | 5 | Kit; depende de A propio |
| Cierres independientes | 5, 10, 14 | 1, 2, 3 | 4 | 3 × 5 | Dependen de su operación C; no pertenecen a la cadena |
| Competidora independiente | 15 | 3 | 5 | 15 | Mismo kit; no pertenece a ninguna fase |
| Descanso físico explícito | `physical-rest` | Ningún participante inferido | 1, 2, 3 + kit | 15 dentro de ventana de 30 | Una obligación física ortogonal; no genera otra tarea ni comida individual |

Total: **15 tareas individuales**, 14 ocupaciones productivas físicas al contar la conjunta una sola vez, más un descanso explícito. Dentro de la unidad: siete operaciones/40 minutos, ocho obligaciones individuales/50 minutos nominales. El equipo requiere 55 minutos físicos de trabajo incluyendo la competidora, no 65. Hay tres preparaciones y tres cierres que también siguen siendo obligatorios.

Contrato solicitado: `phases=[[2,7,12],[3,8],[4,13]]`, `orderedTaskIds=phases.flat()`, adyacencia y continuidad de recurso REQUIRED, recurso diario 1. `4` representa la operación conjunta; `9` sigue en `dailyJointGroups` y en el universo, scope/witness/Draft. Poner ambos como pasos seriales no es el contrato reutilizable del consumidor existente.

Las ventanas son artificiales: día 08–16, participantes y kit 08–12, descanso 09–09:30. No se trasladan horas/nombres humanos del A2. Los márgenes de participante de plantilla son explícitamente cero y la transición de recursos es cero; no se relaja un hard existente. Cada operación consume el mismo kit, incluso entre espacios; otras autoridades siguen separadas.

## Qué persiste y qué se pierde

S1 acepta sólo la competidora (una tarea); su witness contiene las 15 tareas y el descanso. S2 acepta las 14 restantes sin mover S1. Los receipts contienen Draft, validación con cero HARD/REQUIRED configurados y fila SQL con el mismo snapshot. Ambas bases producen propuestas, witnesses, work y fingerprints SQL idénticos.

La falta de fases es observable: el witness/Stage sin esa autoridad coloca A1, B1, A2, B2, conjunta, A3 y C individual. Eso es válido para las reglas declaradas, pero rompe el orden global A→B→C solicitado. No se interpreta 15/15 como composición REQUIRED productiva.

El negativo usa otra jornada nativa y el mismo catálogo lógico. Se estrecha el recurso diario por PATCH a 08–08:40; el descanso se declara 08:20–08:35. 55 de trabajo + 15 de descanso > 40 disponibles. Es un certificado necesario de imposibilidad física independiente de fases o de la heurística. La API de propuestas ejecuta búsqueda y no propone; no se confunde con el 400 de representación.

No se demuestran elecciones byType/anyOf, equipos itinerantes alternativos, recursos diferentes por fase, Main/Vocal, setup, rondas ni transporte junto a esta unidad. Las autoridades de agenda/herencia/ocupación existen, pero su override coexistente con conjuntas también recibe 422: `UNSUPPORTED_TASK_SCOPE_COMBINATION`. La evaluación física de las dimensiones en memoria no certifica su autoría/Stage conjunta.
