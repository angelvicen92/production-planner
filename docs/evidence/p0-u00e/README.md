# P0-U00e — continuidad y setup independientes (versión 2)

La continuación sobre `3a05cb0` conserva las decisiones documentales de `4cc64b3` y `3a05cb0`. Implementa el contrato oficial actualizado de dos ejes OFF/PREFERRED/REQUIRED mediante adopción explícita para futuras jornadas. [Causalidad y frontera v2](v2/causal.md). Estado de certificación en [validation.md](validation.md); no confundir los artefactos iniciales bloqueados con las ejecuciones v2.

Las jornadas nuevas v2 ya han completado UI → Assisted → Draft → validación → Stage → replay, 4/4 y 6/6, con REQUIRED/PREFERRED cruzados y preparaciones físicas. La batería focal actual conserva el caso rojo original, ahora satisfecho bajo el contrato v2 explícito, y prueba las nueve combinaciones, pausas autorizadas, reentradas soft con montaje hard, duraciones heterogéneas, matching no equivalente, recursos, scoring, permisos y herencia histórica. Los gates locales están completos: 3.117 pruebas globales, 95 focales, regresiones U00a–U00d y A2 aislado 266/266 en 11 Stages con informes y snapshots idénticos. La continuación entre Stages conserva tareas y preparaciones protegidas. Resultados, tiempos y condición de CI/READY en [validation.md](validation.md).

## Antecedente histórico: primer borrador 9985c81

**Estado histórico del primer borrador: NO CERTIFICADO.** Las dos jornadas compactas completan 4/4 y 6/6, pero el caso obligatorio de espera dentro de una familia revela un segundo bloqueo estructural. La prueba de aceptación se conserva fallida; no se cambia el solver ni se relaja validación.

Base autorizada: `037500b139d43bf5f82c1087db4fe6ed90fc8074` (U00d). Rama exclusiva `codex/p0-new-day-setup-families-u00e`. Sin cambios de solver, budgets, timeouts, severidades, schema o migraciones. Sin acceso a jornadas productivas, publicación Replit ni merge.

### Auditoría causal — Fuente 07 §4.4

La receta previa crea por UI dos plantillas auxiliares, un espacio y dos participantes. La base no tiene selector de familia: se declara `setupId` mediante la API productiva existente. `before/` conserva el rechazo original `UNSUPPORTED_SETUP_MAPPING` para las cuatro tareas y la captura de readiness. No se busca sobre una entrada rechazada.

El contrafactual focal (`diagnose.ts`, `counterfactual.json`) elimina sólo el rechazo de setup y proporciona las autoridades ya soportadas `setupFamilyId`/`setupPolicies`. El motor completa 4/4 con 283 ramas y una preparación física de diez minutos. Registra geometrías, matching, validación y Future Feasibility aplicable; no se modifica el solver. La primera decisión incorrecta pertenece al perfil/materializador, no a la enumeración de bloques.

El recorrido es catálogo/plantilla → snapshot del perfil y de plantilla al crear el día → EngineInput → preflight/adapter → macro SETUP_FAMILY → SETUP_GROUP → geometrías y matching existentes → preparación/validación → propuesta → Draft → Stage. La receta usa PostgreSQL 17, Auth, PostgREST y Chromium descartables y las rutas reales de producto; no importa A2 ni escribe configuración Next diaria a mano.

### Segundo bloqueo estructural: no reentrada ≠ contigüidad

`logical-gap-blocker.json` consume el problema de la primera jornada UI y fija ventanas por tarea que exigen A1 09:00–09:10, A2 09:20–09:30, preparación 09:30–09:40 y B1/B2 09:40–10:00. Es un único bloque lógico A, luego B, sin reentrada. `validatePlan` devuelve **sólo** `SECONDARY_CONTINUITY_VIOLATION`: cero violaciones de setup, preparación, capacidad, recursos, disponibilidad, dependencias o transiciones.

El adapter impone `secondaryContinuity=REQUIRED` a todas las políticas; `preflight` rechaza separarla con `SETUP_REQUIRES_REQUIRED_CONTINUITY`. La búsqueda exacta produce **0 candidatos**, 217 ramas, 108 inicios y termina COMPLETE; la búsqueda de compatibilidad produce **0 candidatos**, 438 expansiones y no agota presupuesto. Ambas avanzan al final de la tarea anterior y sólo generan bloques compactos. Assisted devuelve `NO_COMPLETE_HARD_VALID_ITINERANT_PLAN`. No es agotamiento, regresión ni inviabilidad operativa demostrada: es una limitación de representación/construcción del motor existente frente a Fuente 03 §16.5.

La hipótesis inicial es suficiente para jornadas compactas, pero **no basta para cumplir U00e**. Corregir el rechazo de perfil y añadir editores no resuelve esta contradicción. Conforme al prompt, se diagnostica y se detiene la ampliación: este PR conserva el wiring revisable y la prueba fallida; no añade una búsqueda nueva, no aumenta presupuesto y no elimina la validación. Hace falta resolver explícitamente la separación entre continuidad lógica de setup y continuidad temporal, incluyendo construcción y validación, antes de poder certificar la capacidad. La frase de ayuda UI expresa la semántica oficial deseada y forma parte del borrador, no de una funcionalidad desplegada.

### Wiring candidato y frontera

El perfil existente incorpora opcionalmente un catálogo de familias con identificadores numéricos estables y nombres editables, y políticas por espacio con referencias explícitas. La UI genera IDs independientes del nombre y permite crear/editar la asignación `setupId` de las plantillas. No hay tabla paralela ni cambios de snapshots históricos: se reutilizan `setup_id`, el JSON del perfil ya congelado y sus controles de acceso/CAS.

La API valida referencias, unicidad, orden explícito completo, política de no reentrada/un bloque y preparación positiva en la rejilla de cinco minutos que exige el preflight vigente. El materializador valida contra el snapshot del día y sólo proyecta auxiliares físicas con participante, sin grupo conjunto. Técnicas, Main y vocales no adquieren setup. Las familias permitidas sin tareas activas no generan entradas/preparaciones; se conserva el orden relativo de las activas. El catálogo completo permanece congelado en el perfil. Las tareas sin familia en un espacio que requiere montaje producen diagnóstico explícito.

La vista del día muestra sus familias, orden y preparación de origen. La configuración de setup del perfil se edita para **futuras jornadas**: no se introduce adopción ni override de setup sobre Stages históricos. Los mecanismos existentes de revisión/replay y edición autorizada de plantillas siguen siendo la autoridad. `setup=NONE` conserva forma y comportamiento. No se activa una continuidad temporal adicional: no reentrada describe estado lógico y no prohíbe por sí misma una espera dentro de la familia.

La comprobación exploratoria de recursos distinguió dos autoridades existentes: un default de catálogo no es una asignación espacial diaria, y un recurso heredado por ubicación no se duplica como asignación directa en cada fila del Stage. La receta final asigna por API el recurso diario y verifica su ocupación mediante `materializeAssistedSnapshotOccupations`. No se altera persistencia ni herencia para satisfacer una assertion equivocada del harness.

Resultados y comandos exactos de validación en [initial-validation.md](initial-validation.md). La aceptación no implica cierre de P0 general ni soporte para combinaciones que el contrato vigente rechaza.
