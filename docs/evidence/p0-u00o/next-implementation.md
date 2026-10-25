# Una implementación posterior: autoridad diaria de rondas para perfiles nuevos

El delta es **materializar y editar la autoridad diaria**, utilizando el motor actual. Alcance inicial explícito: dos lanes físicas distintas, auxiliares con participante, duración común, preparación en rejilla de 5 min, sin setup/joint group, IDs únicos reales del día. La tarea independiente sigue fuera. No ampliar búsqueda, algoritmos, cadenas técnicas ni convertir REQUIRED en PREFERRED. Duraciones mixtas se muestran como no soportadas; este delta no promete resolverlas.

## Dueño y momento de edición

La pertenencia pertenece al **día**. Colocar un editor de rondas en configuración diaria, después de crear las instancias, seleccionando actividades por etiquetas operativas/participante/espacio y guardando sus IDs diarios reales internamente. No pedir IDs al usuario. El perfil general continúa declarando el tipo de jornada; no puede almacenar IDs de tareas futuras. Crear día congela sus snapshots existentes, y una autoridad de rondas inicialmente ausente no altera días ni fingerprints históricos. No es necesario añadir catálogo general de estructuras para cerrar este delta.

Una declaración de plantillas reutilizable sería otra unidad posterior, si se pide. En esta implementación el alta de nuevas tareas **no las incorpora silenciosamente** a una lane. U00n incorpora obligaciones; una posterior edición estructural explícita define su pertenencia. No confundir altas puras con cambio de reglas.

## Contrato y archivos responsables

| Responsabilidad | Cambio posterior concreto |
| --- | --- |
| Contrato tipado | Nuevo `shared/roundSynchronizationStructure.ts`, reutilizando la forma `EngineInputRoundSynchronizationInput`, con versión, IDs de policy estables, lanes/miembros/preparaciones. Semántica fija START_TOGETHER_WHILE_ALL_LANES_ACTIVE y requerida. Validar referencias, universo diario, exclusividad, roles, duraciones y grid con el resolver existente |
| Autoridad persistente | Migración aditiva futura, **ninguna en U00o**: columna diaria separada del profile/088, protegida por writer versionado. Sin backfill ni escritura en baseline histórico; valor ausente conserva exactamente semántica y hash anteriores. Una edición reemplaza explícitamente la estructura completa con CAS, actor y diff |
| Materialización | `engine/buildInput.ts`, nuevo resolver específico en server y `server/roundPreparation.ts`: resolver una autoridad efectiva por procedencia; legacy conserva 088+overrides, perfil nuevo consume la estructura diaria. No coexistencia/conflicto ni fallback silencioso. Preparaciones deben leerse de la misma autoridad que los miembros |
| API/operación | Extender `shared/dayConfig.ts` y `server/dayConfigurationService.ts` con una operación estructural explícita dentro del flujo versionado existente; no habilitar un PATCH libre de plans ni aceptar un EngineInput del navegador. Reutilizar autenticación, roles ADMIN/PRODUCTION, locks, CAS, preview/diff y transacción |
| SQL de configuración | Adaptar el guard efectivo de 102/v4 y su wrapper 104/v5 para comparar rondas con **la nueva autoridad diaria efectiva** cuando existe, manteniendo el caso legacy literal. Writer service-only, RLS/grants mínimos, validación de miembros del mismo plan/espacio, rol y versión; plan/session/revisión bloqueados y comprobados por separado. Error o concurrencia revierte toda la operación |
| Identidad y replay | Reutilizar `projectEffectiveAuthoritiesFromEngineInputV1` y `buildEffectivePlanConfigReplaySnapshotV1`; ya incluyen rondas. Persistir nueva revisión con parent, snapshot de autoridad y provenance. Una edición estructural debe invalidar runs/validación y no fingir que la sesión sigue en la revisión previa |
| Assisted/origen | `server/assistedPlanningService.ts`, refresh/revisión vigente y fuentes de bootstrap de 107/113: integrar el cambio como **cambio de configuración**, no admisión de altas de U00n. Capturar la nueva autoridad en las fuentes y en la revisión/origen vigente sin reescribir capturas históricas. Adoptar/rebasar sobre Draft limpio mediante transición autorizada; rechazar Draft sucio o contexto protegido incompatible |
| Interfaz | Nuevo editor diario de rondas junto a `round-preparation-editor.tsx`, integrado en configuración de la jornada; `effectiveConfigurationView.ts`, `plannerReadiness.ts` y `shared/configurability.ts` muestran cobertura, valor efectivo, miembros, origen y revisión. Confirmar selección completa usando recomendación/resolución existente; no mostrar «sincronización activa» hasta recargar la autoridad realmente consumida |
| Snapshot/validación | Reutilizar snapshot codec, materialización de `roundPreparations`, validador canónico y servicio de propuesta. Ningún cambio de schema de planning ni solver es justificado por este gate. Preservar certificado ligado al nuevo configRevisionId y guards de identidad/freshness; probar el camino real de persistencia, sin seams |

## Versiones, históricos y protección

Cada estructura guardada crea revisión y replay reproducible. No modifica el profile congelado, 088 ni Stages previos. RESTORE debe recuperar una revisión estructural local elegida explícitamente, creando una revisión efectiva nueva; no vaciar miembros por ausencia de un campo ni cambiar días históricos. Rollback/redo de planning conserva la configuración vigente, como exige Fuente 04 §9; un nuevo run se valida contra esa revisión vigente y el usuario puede ver la provenance histórica separadamente.

Para el primer alcance, rechazar una edición que involucre tareas done/in_progress, locks o placements aceptados que la nueva sincronización contradiga. Mantener snapshots/fingerprints y obligaciones posteriores de U00n al cambiar de checkpoint; no convertir la restauración en un Stage sincronizado que nunca existió. No permitir escribir estructura mientras haya propuesta ejecutándose o Draft sucio; exigir descarte/revisión explícitos. Versionar configuración de una sesión iniciada debe actualizar atómicamente la revisión y su origen autorizado para no caer en STALE_OBLIGATION_SOURCES; no reescribir `assisted_bootstrap_sources` histórica a mano.

La sesión ya distingue revisión de plan y revisión de sesión: la Evidence SQL muestra ambas. No usar la revisión equivocada para CAS ni copiar una a otra sin la transición correspondiente. Las revisiones antiguas y los resultados de runs siguen inmutables.

## Aceptación de ese único delta

1. Dos días nuevos UI/API con espacios/participantes/IDs propios: crear tareas, declarar dos lanes de al menos dos miembros, preparación explícita y una independiente; recargar y comprobar persistencia, revisión y EngineInput sin intervención.
2. Preflight/adapter SUPPORTED, recomendación de unidad multi-espacio y selecciones single/SPACE con cierre completo. La quinta tarea no adquiere pertenencia; planificarla primero conserva witness futuro sound.
3. Propuesta real → apply a Draft completo con todas las tareas/preparaciones → validar HARD/REQUIRED → **Stage sincronizado auténtico**, sin parche de revisión/input ni SQL manual. Segunda continuación conserva horarios protegidos y preparaciones; replay frío y rollback/redo comprueban provenance e históricos literales.
4. Permisos de admin/production y denegación aux/viewer/anónimo; CAS/revisión obsoleta, miembros de otro plan/espacio, IDs ausentes/duplicados, roles/setup/joint/duración/grid no soportados y edición concurrente fallan atómicamente. Una alta posterior permanece pendiente fuera de lanes hasta operación explícita.
5. Preparación imposible y ventanas disjuntas: no propuesta; diagnóstico accionable. Intentos de adulterar replay/identidad/certificado/preparaciones, incluso recalculando hashes, no obtienen aceptación falsa. Diferenciar falta de solución y presupuesto sin alterar límites.
6. Cambiar pertenencia/preparación después de S0/S1 invalida validación y runs antiguos, preserva snapshots y fuentes históricas, y reconstruye origen vigente mediante transición productiva. Contexto inmutable incompatible se bloquea; no reiniciar silenciosamente ni mutar Stage. Sin cambios generales retroactivos.
7. Ausencia de estructura conserva input/fingerprint histórico. Legacy 088+preparaciones sigue igual; A2/Evidence protegidos por hash y gate de regresión que corresponda al delta productivo real.

## Riesgos demostrados

El riesgo principal es de **autoridad y revisión**: 102 aún deriva las rondas de 088, 105/106 excluyen mezclar perfiles, y 113 compara fuentes completas. Cambiar sólo builder/UI producirá rechazos o divergencia entre replay y estado real. El writer futuro debe resolver esas tres fronteras conjuntamente.

El consumidor admite una topología acotada. No anunciar soporte heterogéneo ni usar el contrato de joint groups como sustituto: sincronización de inicio aislada y secuencia de rondas con preparación no son equivalentes. Las combinaciones de recursos, comidas, setups o mayor número de lanes necesitan su gate propio; no se infieren de estos resultados.

El Stage sincronizado real es el criterio pendiente de la implementación, no un éxito ya demostrado por este diagnóstico.
