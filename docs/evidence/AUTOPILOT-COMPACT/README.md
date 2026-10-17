# Autopilot — presentación compacta y ajuste de pantalla

Base de producto: main `1337ed0571ffb808a0338ac2994c77f168845f30` (#1144), sin cambios en el motor, contratos de planificación, migraciones, configuración ni datos reales.

## Diagnóstico causal

La captura real a 1909 × 935 mostraba una cabecera de unas 220 px, controles repartidos en demasiadas filas y un zoom persistente de 46 % X / 62 % Y, con solo unas diez filas visibles. El contenedor del planning **sí** estaba maximizado; la mala ocupación procedía del chrome visual y de que maximizar no pedía un ajuste al espacio disponible.

## Delta

- Nueva variante **compact** de la cabecera de progreso *solo en maximización*: una barra global con número de tareas/porcentaje, una línea con fase, etapa y ámbito, detalle técnico accesible al abrirlo, y parada entre etapas disponible.
- Layout compacto (espaciados, control de vistas, barra de herramientas del panel) cuando Autopilot está maximizado; conserva todas las vistas y controles de visualización.
- El evento de maximizar solicita al componente existente `fitRequest` un ajuste inicial **una sola vez**: su resultado se mantiene en estado visual efímero, no se escribe en `localStorage`, y el observador del timeline se desactiva inmediatamente. Nuevos checkpoints no disparan reajustes; salir de maximización recupera el zoom previo.

No se altera `shared/assistedAutopilot.ts`, `observeAutopilotCheckpoints`, las reglas de persistencia, el scope, el estado aceptado ni los endpoints.

## Validación

- Test de render SSR para la variante compacta y una única barra de progreso.
- Se extiende el recorrido **real** de Autopilot en entorno descartable (`script/demo/smokeAutopilotWorkspace.ts`), que comprueba cabecera compacta, fases, parada/reanudación, aceptación progresiva y resultado final 266/266.
- En 1909 × 935 y solo vista de concursantes, mide `scrollWidth/clientWidth`, `scrollHeight/clientHeight`, zoom real, altura de cabecera y 19 filas; adjunta captura `autopilot-workspace-one-view-1909.png`. El test falla si el resultado no encaja, en vez de inferir éxito del atributo fullscreen.
- CI GitHub y tests del producto deben dar verde antes del merge.

**Límite:** múltiples vistas, móvil, títulos largos o límite mínimo de zoom pueden requerir scroll interno; no se recorta contenido para simular un ajuste completo. Los fallos UI-01B históricos de sticky/fit se analizan por separado, no se declaran resueltos aquí.

Sin uso de datos productivos y sin publicación remota hasta la revisión de CI.
