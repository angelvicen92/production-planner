# OptiPlan — Protocolo permanente de eficiencia de Codex

Versión 1.4 · 15 de septiembre de 2026  
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
RAMA A SELECCIONAR EN CODEX: ...
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
- permitir lectura adicional ante dependencias locales reales;
- todo prompt que el usuario deba lanzar manualmente en Codex debe indicar de forma visible y fuera de ambigüedad la **rama remota que debe seleccionar en el desplegable de Codex antes de ejecutar**.

### 3.1 Rama a seleccionar en la interfaz de Codex

Esta instrucción es obligatoria cuando ChatGPT entrega al usuario un prompt para Codex.

ChatGPT debe mostrar, antes del bloque del prompt y también dentro del propio prompt cuando sea útil:

> **RAMA A SELECCIONAR EN CODEX: `<rama>`**

Reglas de elección:

1. **Trabajo nuevo desde `main`**: ChatGPT verifica `main`, crea primero una rama remota de trabajo desde el SHA autorizado y esa rama es la que el usuario selecciona en Codex.
2. **Continuación de un PR existente en un nuevo hilo/tarea**: seleccionar normalmente el **head remoto actual del PR**, no la rama base del PR.
3. **PR apilado/corrección sobre otro PR**: seleccionar el head remoto del trabajo exacto que contiene el estado que se quiere corregir.
4. Si la plataforma Codex crea después una rama local `work` o una nueva rama `codex/...`, eso no invalida el checkout inicial; la selección de UI y el nombre local posterior son conceptos distintos.
5. ChatGPT no debe obligar al usuario a deducir la rama a partir de `base`, `head`, SHA o texto del PR. Debe indicarla expresamente.

Cuando un mismo mensaje contiene base GitHub, head de PR y rama de ejecución, la etiqueta **RAMA A SELECCIONAR EN CODEX** prevalece como instrucción de interfaz para el usuario.

### 3.2 Precondiciones de checkout

Los prompts deben ser estrictos con la **identidad real del trabajo**, no con detalles cosméticos del checkout local.

Autoridades que sí importan:

- repositorio correcto;
- PR o rama remota objetivo correcta;
- base remota correcta;
- working tree limpio antes de tocar código;
- ausencia de cambios ajenos al delta;
- contenido equivalente al head/base que se pretende continuar.

No deben convertirse por defecto en blockers:

- que la rama local se llame `work`;
- que no exista `origin` en el shell;
- que un commit local tenga SHA distinto del publicado cuando el entorno lo haya recreado con metadatos diferentes;
- que un objeto remoto no esté presente localmente si puede demostrarse por otra vía fiable que el checkout contiene el trabajo correcto.

Orden preferido para comprobar equivalencia cuando sea necesario:

1. árbol limpio;
2. parent/base esperada si está disponible;
3. comparación de contenido o diff;
4. `HEAD^{tree}` frente al tree SHA remoto cuando ChatGPT lo haya verificado;
5. SHA exacto de commit sólo cuando el objeto esté disponible y su identidad exacta sea material para la tarea.

El **tree SHA** identifica el contenido del checkout; el SHA de commit también incorpora parent, autor, fechas y mensaje. Por ello, en entornos que recrean commits no debe exigirse igualdad de commit SHA si el árbol y la base demuestran equivalencia.

Sólo debe detenerse la ejecución cuando exista riesgo material de trabajar sobre la base/contenido equivocados, haya cambios locales no explicados o no pueda demostrarse una equivalencia suficiente para el riesgo del delta.

No pedir `fetch`, `pull`, `switch`, reparación de remotes o reescritura de historia sólo para conseguir un nombre de rama o SHA local exacto. Esas operaciones se usan únicamente cuando son necesarias para recuperar la base correcta.

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
- usar Codex para una comprobación de entorno que un comando corto de Replit resolvería mejor;
- bloquear una iteración por nombre de rama local, ausencia de `origin` o SHA local distinto cuando el contenido/base correctos ya están demostrados;
- entregar un prompt de Codex sin indicar explícitamente qué rama debe seleccionar el usuario en la interfaz;
- confundir la base de un PR con la rama que debe seleccionarse para continuar el head actual de ese PR.

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
