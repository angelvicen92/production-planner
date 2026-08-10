# OptiPlan — Protocolo permanente de eficiencia de Codex

Versión 1.2 · 10 de agosto de 2026  
Estado: documento de gobierno operativo

## Propósito

Reducir consumo de créditos, contexto y retrabajo de Codex sin relajar viabilidad, restricciones hard, determinismo, Evidence, benchmarks ni validación previa al merge.

Este documento regula **cómo usar Codex cuando Codex haya sido elegido como la mejor ruta de ejecución**.

La selección previa del ejecutor pertenece a `docs/governance/EXECUTION_ROUTING_PROTOCOL.md`.

No es necesario demostrar que ChatGPT sea incapaz de hacer una edición antes de elegir Codex.

La métrica rectora es:

> **coste total por cambio verificado y aceptado**

Los créditos de Codex son una parte de ese coste, junto con tiempo, retrabajo, riesgo y esfuerzo humano.

## 1. Separación de responsabilidades

- ChatGPT mantiene estrategia, fuentes, diagnóstico, alcance, criterios de aceptación, revisión y decisión de integración.
- Codex ejecuta una unidad lógica en un entorno de código adecuado y puede realizar las comprobaciones locales necesarias para implementarla correctamente.
- Codex no reabre la estrategia global por defecto.
- Si el código real contradice una suposición técnica del prompt, Codex debe reportarlo y aplicar sólo el ajuste mínimo compatible con el objetivo o detenerse si cambia materialmente el contrato.

## 2. `AGENTS.md`

Debe permanecer breve y estable.

Contendrá invariantes, límites, navegación, validación y entrega; no PRD/SPEC completas, Evidence ni historia de iteraciones.

## 3. Prompt por delta

Formato preferido:

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

- una sola unidad lógica;
- objetivo aproximado ≤350 palabras cuando sea viable;
- referenciar archivos/símbolos/fuentes;
- no pegar contexto permanente;
- log causal mínimo;
- permitir lectura adicional ante dependencias locales reales.

## 4. Lectura dirigida

1. `AGENTS.md` + prompt.
2. Rutas indicadas.
3. Búsquedas por símbolos/dependencias.
4. Ampliación sólo cuando el código lo requiera.

No auditar todo el repo por defecto.

## 5. PR y conversación

El PR conserva código; el hilo conserva contexto.

Por defecto:

- turno 1: implementación completa;
- turno 2: corrección localizada o validación dependiente;
- antes del turno 3: evaluar hilo nuevo sobre la misma rama/PR.

Abrir hilo nuevo antes si cambió fase, objetivo o el contexto acumulado dejó de ser útil.

## 6. Modelo y razonamiento

- tareas simples: configuración de menor coste fiable;
- multiarchivo normal: opción equilibrada;
- motor/DB/RLS/algoritmos/integración difícil: mayor capacidad cuando aporte beneficio.

Fast/Ultra/multiagente/Best-of-N no son default.

## 7. Validación escalonada

Durante implementación:

- typecheck/lint;
- tests focales;
- benchmark causal cuando la función exista.

Sobre head candidato:

- merge gate completo;
- CI/build/suite relevante;
- benchmark representativo;
- determinismo;
- Evidence;
- higiene del diff.

## 8. Antipatrones

- más de dos turnos por una unidad sin replantear contexto;
- prompt que copia fuentes enteras;
- lectura total del repo;
- merge gate prematuro repetido;
- grandes logs en chat;
- varios agentes por defecto;
- modelo caro para tarea trivial;
- usar Codex para una comprobación de entorno que un comando corto de Replit resolvería mejor.

## 9. Entrega mínima

1. objetivo;
2. archivos;
3. decisión técnica;
4. tests;
5. riesgos pendientes;
6. PR/head;
7. no merge.

## 10. Medición

Comparar tareas semejantes mediante:

- créditos de Codex;
- tiempo de ciclo;
- prompts por hilo;
- merge gates ejecutados;
- retrabajo;
- resultado aceptado/rechazado;
- intervención humana requerida.

No concluir eficiencia sólo porque una ejecución usó menos créditos.
