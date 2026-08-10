# OptiPlan — Adaptive Execution Routing Protocol

Versión 2.0 · 10 de agosto de 2026  
Estado: documento de gobierno operativo del repositorio

## Autoridad

Este documento implementa en el repositorio la sección de Orquestación Adaptativa del `Protocolo_Maestro_Continuidad_OptiPlan_v1.5.md`.

Sustituye `docs/governance/AUTONOMY_FIRST_EXECUTION_PROTOCOL.md`.

No existe una jerarquía fija de ejecutores.

ChatGPT conserva la responsabilidad de estrategia, alcance, criterios de aceptación, revisión e integración. El ejecutor se selecciona por unidad lógica.

## Rutas disponibles

### ChatGPT + GitHub

Adecuado para análisis, revisión, documentación, tareas administrativas y cambios localizados que puedan verificarse suficientemente con diff y CI.

### Codex

Adecuado para cambios interdependientes, multiarchivo o que se beneficien de un bucle local de lectura, edición, ejecución y tests.

Codex puede elegirse aunque ChatGPT pudiera editar técnicamente el código cuando el entorno local reduzca riesgo o retrabajo.

### Shell/Replit/Supabase operado por el usuario

Adecuado para Evidence de entorno real, reproducción de fallos, benchmarks no cubiertos por CI, migraciones reales, JSON/logs causales y validaciones manuales.

Puede utilizarse tempranamente si una comprobación breve evita una hipótesis especulativa.

### Híbrida

Las fases de una iteración pueden usar distintos ejecutores.

## Criterios de routing

Elegir según:

1. autoridad de la Evidence;
2. necesidad de bucle edit-test;
3. interdependencia del cambio;
4. riesgo y reversibilidad;
5. velocidad de obtención de feedback;
6. créditos/contexto;
7. esfuerzo humano;
8. probabilidad de retrabajo.

Métrica rectora:

> **coste total por cambio verificado y aceptado**

No minimizar autonomía, créditos o intervención humana de forma aislada.

## Reglas de usuario

No usar al usuario como mensajero de GitHub, PR, CI o diffs.

Cuando Shell sea la mejor herramienta:

- 1–5 órdenes cuando sea posible;
- un bloque copiable;
- objetivo de la prueba explícito;
- salida necesaria explícita;
- sin scripts largos pegados; versionarlos y ejecutar una orden corta.

## Relación con Codex Efficiency

`docs/governance/CODEX_EFFICIENCY_PROTOCOL.md` regula el uso eficiente de Codex **después de haber elegido Codex como ruta adecuada**.

No debe contener una regla que obligue a demostrar incapacidad de ChatGPT antes de usar Codex.

Nunca se relajan viabilidad, hard constraints, determinismo, Evidence, benchmarks ni merge gate.
