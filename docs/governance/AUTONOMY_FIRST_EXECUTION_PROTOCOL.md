# OptiPlan — Protocolo de ejecución autónoma ChatGPT-first

Versión 1.0 · 8 de agosto de 2026  
Estado: documento de gobierno operativo

Este documento implementa en el repositorio el `ADDENDUM_PROTOCOLO_AUTONOMIA_CHATGPT_v1.0.md`.

## Jerarquía obligatoria

1. **ChatGPT ejecuta directamente** todo cambio que pueda realizar y verificar con seguridad mediante sus herramientas y GitHub, incluido trabajo técnico cuando sea viable.
2. **Codex sólo se invoca** cuando una limitación concreta de edición, runner, tests, benchmark, build o validación impide a ChatGPT completar el delta con suficiente seguridad.
3. **El usuario interviene al final** únicamente para dependencias de entorno o decisiones humanas que no puedan resolver ChatGPT ni Codex.

Antes de usar Codex, ChatGPT debe haber decidido ya objetivo, arquitectura, alcance, archivos relevantes, prohibiciones y criterios de aceptación. Codex recibe sólo el delta ejecutable y no reinicia la investigación salvo dependencia local imprevista.

La condición «es un cambio técnico» no justifica por sí sola usar Codex.

## Continuidad

ChatGPT no se detiene después de una acción si puede ejecutar el siguiente paso lógico. Debe continuar por rama/PR/revisión/merge/verificación de `main` hasta encontrar un bloqueo real.

No se pide al usuario que actúe como mensajero de GitHub, diffs, PR, CI o merges que las herramientas puedan resolver.

## Relación con el protocolo de eficiencia

`docs/governance/CODEX_EFFICIENCY_PROTOCOL.md` continúa regulando prompts por delta, lectura dirigida, presupuesto de conversación, selección de modelo y validación escalonada.

Este documento añade un gate anterior: **antes de optimizar una tarea de Codex hay que demostrar que Codex es necesario**.

La métrica rectora es `créditos de Codex por cambio aceptado`; la primera reducción de coste consiste en no consumir una ejecución de Codex cuando ChatGPT puede completar el trabajo directamente.

Nunca se relajan viabilidad, restricciones hard, determinismo, Evidence, benchmarks ni merge gate.
