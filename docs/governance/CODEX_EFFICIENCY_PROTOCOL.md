# OptiPlan — Protocolo permanente de eficiencia de Codex

Versión 1.0 · 4 de agosto de 2026  
Estado: documento de gobierno operativo

## Propósito

Reducir el consumo de créditos y contexto de Codex sin relajar viabilidad operativa, restricciones hard, determinismo, Evidence, benchmarks ni validación previa al merge.

Este documento complementa:

- el Protocolo Maestro de Continuidad, Iteración y Control de Rumbo de OptiPlan;
- las instrucciones del proyecto de ChatGPT;
- `AGENTS.md` en la raíz del repositorio.

## Separación de responsabilidades

- ChatGPT realiza el análisis amplio: fuentes oficiales, GitHub, PR, diff, Evidence, arquitectura, estrategia y decisión de rumbo.
- Codex recibe una única unidad lógica ya decidida y actúa principalmente como ejecutor técnico.
- ChatGPT realiza directamente mediante GitHub, cuando sea posible, cambios administrativos o documentales menores: título y cuerpo del PR, comentarios, revisión, cierre y merge.
- El usuario no actúa como mensajero de información que las herramientas puedan leer o modificar.

## Prompts por delta

Cada prompt para Codex debe limitarse a:

1. repositorio y PR o rama;
2. objetivo único;
3. defecto demostrado;
4. archivos o componentes relevantes;
5. cambio exacto esperado;
6. límites específicos;
7. tests focalizados;
8. merge gate cuando corresponda.

No repetir en cada prompt la misión general, toda la arquitectura, todas las SPEC, checklists genéricos, comandos globales o informes extensos ya regulados por las fuentes permanentes.

## Lectura dirigida

Codex debe leer primero `AGENTS.md` y después sólo los archivos, tests y documentos oficiales relacionados con la unidad lógica actual. No debe recorrer todo el repositorio o toda la documentación salvo necesidad transversal demostrada.

## Validación escalonada

Durante la implementación:

- ejecutar TypeScript y tests directamente afectados;
- ejecutar el benchmark focal cuando la capacidad sea funcional;
- no repetir `npm ci` si no han cambiado dependencias y el entorno ya está preparado;
- no ejecutar suite global, Focal completo y todos los benchmarks después de cada corrección local.

En el head candidato a merge:

- ejecutar el merge gate completo exigido por el alcance;
- comprobar CI, build, suite relevante, benchmark representativo, determinismo y ausencia de regresiones;
- regenerar Evidence y documentación una sola vez.

La validación escalonada reduce repeticiones; nunca autoriza fusionar sin el merge gate completo.

## Reutilización y parada

- Mantener el mismo PR para defectos localizados.
- Abrir una tarea nueva cuando la conversación de Codex acumule contexto obsoleto o irrelevante.
- No pedir a Codex que investigue de nuevo algo ya verificado por ChatGPT.
- No usar Codex para una modificación administrativa o documental que ChatGPT pueda ejecutar directamente sin riesgo.
- Si dos iteraciones consecutivas no producen el efecto esperado, detener y replantear antes de consumir una tercera.

## Informe final mínimo de Codex

Codex debe informar sólo:

- archivos modificados;
- decisión técnica aplicada;
- tests ejecutados y resultado;
- riesgos o validaciones pendientes;
- URL y head del PR;
- confirmación de que no hizo merge.

## Capas de persistencia

- Las instrucciones del proyecto activan este protocolo entre chats.
- El Protocolo Maestro regula el método de ChatGPT.
- `AGENTS.md` regula la ejecución dentro del repositorio.
- Cada prompt contiene únicamente el delta técnico.

Si existe conflicto, prevalecen las fuentes oficiales y el Protocolo Maestro. `AGENTS.md` y este documento deben mantenerse alineados.
