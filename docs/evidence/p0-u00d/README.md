# P0-U00d — consumo itinerante en jornadas nuevas

Base autorizada y remota comprobada: `e8f892719600d924e25ecaf56b7fca426204d5a2`. Rama remota exclusiva: `codex/p0-new-day-itinerant-consumption-u00d`. Sin cambios de DB/schema, migraciones nuevas, publicación Replit, jornadas productivas ni merge.

Dos jornadas creadas desde la aplicación completan propuesta → Draft → validación → Stage: **4/4 operaciones técnicas sin participantes y 4/4 auxiliares con dos participantes y dependencias**, con cero nuevas HARD/REQUIRED. No hay importación A2, SQL operacional, configuración Next escrita a mano ni fixture de motor en esos recorridos. Se crean por UI los recursos físicos, equipos, plantillas, roles, dominios, días, tareas, participantes, perfil, scope y aceptación. Las disponibilidades diarias y el requisito independiente de catálogo usan las APIs productivas.

## Auditoría causal integral — Fuente 07 §4.4

El recorrido reconstruido es catálogo/plantilla global → snapshots de creación → tarea efectiva → `buildEngineInput` → `applyNewDayPlannerConfiguration` → `applyDailyItinerantComposition` → preflight → adapter → scope Assisted → core/continuación → dominio/matching de agenda → materialización → propuesta productiva → Draft → validación → Stage. Las autoridades de configuración y composición permanecen separadas; el replay identifica ambas.

1. **Primera decisión incorrecta en base:** `newDayConfigurationDefects` produce `UNSUPPORTED_TASK_ROLE` para las cuatro tareas, aunque el mapping diario ya identifica unidades y miembros válidos. Readiness muestra el mismo bloqueo. `before/` conserva el input, los reasonCodes y la captura de la UI; no se lanzó búsqueda válida en base.
2. **Contrafactual focal antes de ampliar la solución:** retirar sólo ese motivo permite adaptar, pero la continuación exacta responde `UNSUPPORTED_STANDALONE_TASK_KIND` para técnicas independientes. La receta final con dependencias devuelve `NO_COMPLETE_HARD_VALID_ITINERANT_PLAN` después de retirar sólo el filtro. El adapter entrega además unidades específicas sin sus miembros en `requiredResourceIds`. `counterfactual.json` y `after-profile-diagnostic.json` conservan las autoridades y el primer rechazo; `diagnose.ts` reproduce el contrafactual sobre la base. No basta con borrar el rechazo del perfil.
3. **Primera materialización incompleta observada:** la jornada técnica alcanza Stage, pero el array persistido de recursos de la alternativa contiene la cámara B y omite el kit exigido por `byItem`. El problema canónico sí conserva el kit. `persistence-diagnostic.json` registra problema, propuesta, validación y Stage de ese contraejemplo. Se corrige la proyección hacia producto, conservando el assert que detectó la pérdida.
4. **Dependencias y alternativas:** un probe sobre el problema nativo con una dependencia técnica añadida demuestra doble propiedad de una cadena inferida y la agenda de alternativas. `pooled-chain-before.json` registra `NO_COMPLETE_HARD_VALID_ITINERANT_PLAN`; el probe posterior y los tests verifican una sola agenda, selección de ambas unidades y validación íntegra. Las cadenas explícitas conservan sus políticas.
5. **Criterio de producción:** A/B son dos agendas independientes; A/C comparten CAM_A. C debe impedir elegir A durante su operación, sin fusionar identidades ni ocupar a CAM_A entre operaciones. Los integrantes y el kit independiente deben reservarse durante las operaciones concretas. Ventanas propias, físicas y transiciones siguen siendo autoridades separadas.
6. **Clasificación y delta:** integración de capacidades existentes, no mejora de búsqueda. Cambian el filtro de compatibilidad, la materialización específica, la propiedad macro de cadenas técnicas inferidas con alternativas físicas y la proyección de recursos declarados al producto. No cambian ordenadores, algoritmos de matching, budgets, timeouts, severidades, contratos de dependencia ni selección de A2.

Hipótesis falsable: el rechazo anticipado y las pérdidas de composición/proyección impiden reutilizar capacidades existentes. El delta debe hacer llegar los mismos requisitos a las autoridades físicas y al Stage, y los negativos deben seguir fallando. Quitar miembros, kit, dominio autorizado o identidad técnica sigue invalidando la propuesta/validación.

## Integración mínima

- `newDayPlannerConfiguration.ts` permite consumo en roles auxiliares/técnicos de los perfiles existentes; MAIN/VOCAL mantienen el rechazo. Setup, coach, auxiliares/presentador por tipo, dependencias y contradicciones de perfil conservan sus diagnósticos.
- El adapter usa `materializeItinerantUnitAssignment` para las unidades específicas de composición diaria antes de construir dominios/matching. Las autoridades históricas sin composición opt-in mantienen su representación.
- La continuación exacta admite técnicas independientes sólo con composición física explícita. Las dependencias técnicas inferidas que contienen alternativas físicas se resuelven por la agenda existente, con un único propietario macro. No se crea solver ni presupuesto adicional; las cadenas explícitas no se descomponen.
- La validación técnica materializa la elección autorizada con la misma utilidad y exige identidad, duración, dependencias, miembros, recursos independientes y `canPlaceTask` exactos. Los tests maliciosos siguen rechazando unidades ajenas, recursos omitidos y cambios de rol/identidad. No se borra ningún conflicto HARD/REQUIRED.
- `assistedProposalService.ts` conserva los recursos declarados al proyectar el equipo elegido; la herencia espacial permanece en configuración. Stage/Draft, permisos, fingerprints, replay y aceptación mantienen sus autoridades.

## Jornadas y ocupaciones nativas

Se crean A = CAM_A, B = CAM_B y C = CAM_A + SON_1. Una jornada ordinaria previa hace que los IDs globales y diarios difieran: el ensayo verifica las FK del mapping, nunca coincidencia numérica.

| Operación técnica | Dominio | Resultado | Recursos físicos persistidos |
| --- | --- | --- | --- |
| Cámara A | A | 09:30–09:40 | CAM_A |
| Cámara B | B | 09:30–09:40 | CAM_B |
| Composición | C | 10:00–10:10 | CAM_A + SON_1 |
| Alternativa | A/B + kit obligatorio | B, 10:00–10:10 | CAM_B + KIT_INDEPENDIENTE |

Los contadores de trabajo de ambos días se conservan en `native/journey.json`, sin core inventado. El día auxiliar materializa dos plantillas con dependencia para dos participantes disponibles de 10:30 a 12:00. Los dos replays conservan propuestas y fingerprints. `native/` incluye input, preflight, identidad, propuesta, Draft, validación, revisión/replay de configuración, Stage, coste y capturas. `physical-occupations.json` compara los recursos persistidos con la autoridad canónica y comprueba que CAM_A está libre entre operaciones, conservando las transiciones físicas.

Negativos: A/C simultáneos, C fuera del dominio A/B, unidad inexistente, mapping duplicado, disponibilidad de unidad ausente, ventana de miembro, ventana propia y transición física insuficiente. Los probes temporales abren únicamente las salas para aislar el recurso/transición; el probe de ventana propia abre además los miembros para distinguir las dos autoridades. La indisponibilidad parcial del kit real de un tercer día devuelve `NO_PROPOSAL` y conserva S0/Draft literalmente. Los recursos de otra alternativa no se consumen por haber pertenecido al dominio.

## Regresiones, validación y reproducción

Resultados y límites de ejecución en [validation.md](validation.md). Comparaciones exactas U00a/U00b/U00c en `regressions.json`; A2 desde S0 en `a2-report.json` y runs/snapshots comprimidos. No se declara cierre de P0 general, soporte MAIN/VOCAL con equipos, montaje/transporte nuevo ni adopción histórica de composición.

```sh
bash docs/evidence/p0-u00d/reproduce.sh /tmp/p0-u00d-reproduction
```

Requiere dependencias del lockfile, Docker local y Chromium de Playwright. Las capturas A2 usan el mismo Node y lockfile en base/candidato/repetición. Se reutiliza el verificador U06c sin modificar sus assertions. La CI incorpora este E2E junto a los recorridos U00c y conserva sus artefactos; logs, contraseñas/JWT locales y traces privados no se versionan. Todos los servicios de estos recorridos son descartables; `remoteWrites=0`.
