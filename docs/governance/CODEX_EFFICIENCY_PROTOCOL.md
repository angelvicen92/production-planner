# OptiPlan — Protocolo permanente de eficiencia de Codex

Versión 1.1 · 8 de agosto de 2026  
Estado: documento de gobierno operativo

## Propósito

Reducir el consumo de créditos y contexto de Codex sin relajar viabilidad operativa, restricciones hard, determinismo, Evidence, benchmarks ni validación previa al merge.

Complementa el Protocolo Maestro de Continuidad, las instrucciones del proyecto y `AGENTS.md`. El objetivo no es gastar lo mínimo por mensaje, sino **minimizar créditos por cambio aceptado**.

## Diagnóstico operativo

Desde abril de 2026, la mayoría de usos de Codex se contabilizan por tokens de entrada, entrada cacheada y salida. Una continuación de una conversación vuelve a incorporar historial y tool calls previos; el caching puede abaratar partes estables, pero no convierte un hilo largo en gratuito.

Por tanto:

- un PR abierto **no** provoca por sí mismo consumo creciente;
- una conversación de Codex larga sí puede acumular contexto costoso;
- mantener el mismo PR y abrir una conversación nueva son decisiones compatibles;
- modelo, razonamiento, Fast/Ultra, agentes paralelos, logs, archivos leídos y validaciones repetidas también influyen en el consumo.

No se congelan tarifas numéricas en este documento. La autoridad vigente es la documentación oficial de OpenAI y `Codex Settings > Usage`.

## 1. Separación de responsabilidades

- ChatGPT realiza el análisis amplio: fuentes oficiales, GitHub, PR, diff, Evidence, arquitectura, estrategia, diagnóstico y decisión de rumbo.
- Codex recibe una sola unidad lógica ya decidida y actúa principalmente como ejecutor técnico.
- ChatGPT realiza directamente por GitHub, cuando sea posible, cambios administrativos o documentales menores, comentarios, revisión, cierre y merge.
- El usuario no actúa como mensajero de información que ChatGPT pueda leer o modificar.
- Codex no repite una investigación ya resuelta por ChatGPT salvo una comprobación local imprescindible para implementar el delta.

## 2. `AGENTS.md`: mapa, no manual

`AGENTS.md` debe permanecer breve y estable.

Debe contener sólo:

- invariantes permanentes;
- límites de alcance;
- método de lectura;
- validación escalonada;
- contrato mínimo de entrega;
- enlaces a fuentes profundas.

No debe contener PRD, SPEC completas, Evidence, historial de iteraciones ni reglas específicas de un benchmark. La información profunda vive en documentos versionados y se consulta por divulgación progresiva.

No crear `AGENTS.md` anidados salvo que un subárbol de alta frecuencia tenga reglas locales estables que reduzcan de forma demostrable errores o contexto.

## 3. Prompt por delta

Formato canónico preferido:

```text
Repo/PR: ...
Objetivo: ...
Evidencia: ...
Leer: ...
Cambiar: ...
No tocar: ...
Aceptar si: ...
Validar ahora: ...
Gate final: ...
```

Reglas:

- objetivo normal: hasta aproximadamente 350 palabras;
- superar ese tamaño sólo cuando el delta no pueda expresarse con rutas, contratos y criterios de aceptación;
- una única unidad lógica;
- criterios de aceptación observables y específicos del delta;
- citar archivos, símbolos, tests, Evidence y secciones concretas;
- no copiar misión general, arquitectura completa, todas las SPEC, checklists genéricos, diffs completos, grandes logs ni resúmenes anteriores;
- cuando un log sea necesario, incluir sólo el fragmento causal mínimo;
- el branch/head actual es parte del contexto: no narrar toda la historia del PR.

## 4. Lectura dirigida

Codex debe:

1. leer `AGENTS.md` y el prompt;
2. leer sólo las rutas del bloque `Leer:`;
3. usar búsquedas dirigidas para símbolos y dependencias inmediatas;
4. ampliar lectura únicamente ante una dependencia real no prevista.

No recorrer por defecto todo el repositorio, todo `README`, toda `docs/`, toda la Evidence ni todas las SPEC.

## 5. PR y conversación: política de continuidad

El PR conserva el código. La conversación conserva contexto de modelo. No deben confundirse.

Presupuesto por defecto para una misma unidad lógica:

- **Turno 1:** implementar el delta completo.
- **Turno 2:** sólo una corrección localizada o validación dependiente del trabajo anterior.
- **Turno 3:** abrir una conversación/tarea nueva de Codex sobre la misma rama o PR, salvo decisión explícita de ChatGPT de que el hilo anterior sigue siendo pequeño, íntegramente relevante y más rentable de reutilizar.

Abrir conversación nueva antes del tercer turno si:

- cambia la fase de investigación a implementación o a reparación no local;
- el hilo contiene grandes logs, benchmarks, diffs o exploraciones ya irrelevantes;
- cambia sustancialmente el objetivo;
- el agente siguió un camino equivocado que ahora debe contradecirse;
- cambia sin necesidad el modelo, herramientas, entorno o directorio de trabajo;
- el contexto útil puede reconstruirse con PR/head + un prompt delta breve.

Mantener el mismo hilo sólo cuando la corrección es realmente local y evita redescubrir información todavía útil.

## 6. Selección proporcional de modelo y razonamiento

Elegir la configuración más barata que haya demostrado fiabilidad suficiente para el tipo de tarea.

- Documentación, administración, edición mecánica, UI simple y tests triviales: opción de menor coste disponible y razonamiento bajo/medio cuando baste.
- Cambios normales multiarchivo con contratos claros: opción equilibrada y razonamiento medio.
- ORC, búsqueda, restricciones, DB/RLS, contratos críticos o fallos de integración difíciles: reservar mayor capacidad/razonamiento para cuando aporte una mejora demostrable.
- Fast, Ultra, multiagente y Best-of-N están **desactivados por defecto** para OptiPlan; usarlos sólo cuando la reducción de latencia o el incremento de calidad justifique el coste.
- Evitar cambios de modelo/configuración en mitad de un hilo sin motivo material.

Nunca sacrificar gates operativos por ahorro de créditos.

## 7. Validación escalonada

Durante implementación:

- TypeScript/lint y tests directamente afectados;
- benchmark focal sólo cuando la capacidad ya sea funcional;
- no repetir `npm ci` si las dependencias no cambiaron y el entorno ya está preparado;
- si falla un test focal, corregir y repetir primero ese test;
- no ejecutar suite global, Full A2, Focal completo o todos los benchmarks tras cada corrección local.

Sobre el head candidato a merge:

- ejecutar el merge gate completo exigido por el alcance;
- comprobar CI, build, suite relevante, benchmark representativo, determinismo y ausencia de regresiones;
- regenerar Evidence y documentación final una sola vez;
- si el gate obliga a cambiar el head, repetir el gate completo cuando vuelva a existir un candidato final.

La validación escalonada reduce repeticiones; no autoriza fusionar sin el gate correspondiente.

## 8. Antipatrones de consumo

Detener o reenfocar si aparece cualquiera de estas señales:

- más de dos prompts de usuario en el mismo hilo para una unidad lógica;
- prompts que vuelven a pegar reglas permanentes;
- lectura sistemática del repositorio completo;
- merge gate repetido antes de tener candidato;
- modelo/modo más caro usado habitualmente en cambios simples;
- grandes logs o Evidence pegados en chat en vez de referenciados;
- varias alternativas/agentes cuando sólo se necesita una implementación;
- Codex investigando algo que ChatGPT ya verificó;
- una tercera iteración después de dos intentos sin efecto operativo demostrado.

## 9. Informe final mínimo

Codex informará únicamente:

1. objetivo completado;
2. archivos modificados;
3. decisión técnica relevante;
4. tests ejecutados y resultado;
5. riesgos o validaciones pendientes;
6. URL y head del PR cuando aplique;
7. confirmación de que no hizo merge.

No repetirá el prompt, la documentación ni grandes fragmentos del diff.

## 10. Medición

La eficiencia se valida con datos.

Cuando el panel de uso lo permita, comparar periódicamente tareas o PR equivalentes mediante:

- créditos consumidos;
- número de prompts por hilo;
- modelo/modo utilizado;
- número de ejecuciones del merge gate;
- retrabajo causado por contexto insuficiente;
- resultado final aceptado o rechazado.

La métrica rectora es **créditos por cambio aceptado**, no créditos por turno.

## 11. Política de actualización

Este documento no define el dominio de OptiPlan. Si OpenAI modifica la mecánica de contexto, pricing o modelos, se actualizará esta guía sin alterar viabilidad, restricciones hard, determinismo, Evidence, benchmarks ni merge gate.

Referencias oficiales consultadas para esta versión:

- OpenAI Help Center — Codex rate card.
- OpenAI — Unrolling the Codex agent loop.
- OpenAI — How OpenAI uses Codex.
- OpenAI — Harness engineering: leveraging Codex in an agent-first world.
- OpenAI Developer Docs — Model guidance / lean prompting.
