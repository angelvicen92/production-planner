# U06c — continuidad de grupos operativos

Base verificada: `49d826c9a5ecdd3e0488a64d2b6a05dd3aad98b5`, rama remota `codex/configurable-operation-continuity-u06c`. Fuentes: 00 v2.13; 01 §6; 03, construcción anónima y continuidad; 04, snapshots/precedencia/replay; 05, penalización sólo con política; 06 v2.10, capacidad compartida sin continuidad implícita; 07 v2.2, gate causal. No se cambian Fuentes, presupuestos ni validadores existentes.

## Gate causal

El recorrido observado es configuración efectiva → scope → arquitectura Main/feeder → geometría anónima → matching de bundles/IN → certificado conjunto → futuro/validación → replay → propuesta → Draft/Stage. La construcción de entrada usaba `start + ordinal * duration` antes del matching. Un OFF sin penalización en el validador no liberaba esa representación.

El contrafactual genérico usa tres participantes, disponibilidad distinta, una sala exclusiva y preparaciones con ventanas 10–20, 40–50 y 70–80. El original devuelve `JOINT_STYLING_FEEDER_MATCHING`: ningún bloque compacto puede cubrirlas. El candidato construye las tres posiciones y conserva Main, feeder e IN válidos. Un segundo grupo cabe entre ellas; solapar una tarea continúa siendo HARD inválido. Este caso no usa identidades A2.

La construcción ahora obtiene posiciones tempranas de los dominios existentes y sus fronteras de llegada. REQUIRED conserva la geometría compacta; PREFERRED la intenta primero y permite la alternativa con huecos. OFF intenta las posiciones liberadas. Se conserva la geometría compacta como alternativa y en la frontera existente, incluida su posición inicial cuando la representación liberada tiene huecos: liberar OFF no puede eliminar candidatos antes disponibles. No se añade otro solver ni se convierte una abstención geométrica en prueba de imposibilidad.

La prueba positiva REQUIRED también cubre la proyección intermedia: un core todavía incompleto aplaza el grupo igual que aplaza una cadena técnica incompleta; el candidato completo debe validar todos sus miembros. La protección final nunca se aplaza.

## Autoridad y precedencia

`operation_continuity_groups` identifica el grupo por UUID y guarda política, peso y revisión. Las plantillas guardan una FK; la relación de PostgREST se resuelve explícitamente y falla si la referencia no puede leerse. El snapshot diario guarda la política y la identidad completas, sin depender de un catálogo mutable. El consumidor obtiene los task IDs efectivos de las instancias de sus plantillas.

Precedencia: override diario autorizado → autoridad explícita original del día → snapshot de plantillas. La configuración general interviene al crear/adoptar un snapshot. El JSON Next protegido por 088 permanece intacto. Sin grupo, el contrato/fingerprint histórico conserva su forma anterior.

Las políticas explícitas del día pueden definir los miembros por task IDs; las heredadas reúnen las instancias de una o varias plantillas. La capacidad soportada es un grupo de operaciones auxiliares físicas en una misma sala, sin pertenencia conjunta ni familia de setup. Referencias duplicadas, miembros desconocidos o estructuras incompatibles producen diagnóstico de preflight. MainFlow, setup, cadenas técnicas, anchored operations y concentración de recursos conservan sus autoridades independientes.

EDIT/RESTORE sólo cambian política/peso de un grupo existente, con revisión esperada. RPC v5 toma el lock del plan, verifica el replay anterior y candidato, aplica el override y reutiliza el escritor de revisiones; un fallo revierte todo. Actualiza la revisión de sesión e invalida la validación del Draft. Los Stages, tareas aceptadas, locks y otros días permanecen iguales. El refresh explícito conserva las identidades físicas de snapshots, recalcula los grupos y persiste el replay correspondiente.

OFF tiene penalty cero. PREFERRED añade `gapMinutes * gapWeight` a la puntuación existente después de filtrar HARD y comunica solicitud, resultado, desviación y puntos en Evidence/Draft/Stage. Los ámbitos parciales OFF/PREFERRED conservan el tamaño del grupo original y muestran el resultado como parcial; REQUIRED incorpora todos sus miembros como soporte y nunca acepta un grupo recortado. REQUIRED invalida el candidato interrumpido; no tiene AcceptedException implícita. En esta unidad su incidencia queda bloqueada en la validación manual, sin ofrecer una excepción de esa regla.

## Superficie editable

El editor de plantillas ofrece «Agrupación y continuidad»: crear/reutilizar grupos, seleccionar OFF/PREFERRED/REQUIRED y cuantificar PREFERRED. Cambiar el grupo general afecta a sus plantillas para futuras jornadas, con CAS y rol ADMIN. Producción/ADMIN pueden editar/restaurar la política efectiva diaria. La agrupación por montaje/setup se identifica por separado como consulta del contrato existente; no se ofrece un editor sin consumidor.

## Resultado comprobado

El A2 reproducido y los dos candidatos conservan 266/266, 11 Stages, 27049 ramas y 8465 minutos agregados, con todos los snapshots idénticos. El candidato tarda 77,707/79,987 s frente a 69,204 s de la muestra base. El detalle de gates, límites, métricas individuales y coste está en [validation.md](validation.md) y [a2-report.json](a2-report.json).

## Dependencia material reservada a P0

La creación ordinaria de jornadas todavía no materializa `PlannerNextIntegrationConfigurationInput` ni clasifica todas las operaciones. `buildEngineInput` obtiene esa base exclusivamente de `plans.planner_next_configuration`; 088 impide reescribirla. Este gap precede a U06c. El recorrido nativo prueba guardar/reabrir y crear día con dos plantillas nuevas y sus snapshots de grupo, y EDIT/RESTORE en una jornada que ya tiene Next configurado. No demuestra planificación automática de una jornada ordinaria nueva.

Cerrar ese gate necesita una autoridad general adicional de MainFlow/clasificación, con su editor y snapshot. La revisión remota final observa `main` en `21f9b6cc72cec907162d597354f8cd7cc91b6cc0` (#1176), cuyo único cambio es documental: reserva expresamente esta base general a la siguiente unidad P0 y pide terminar U06c sin ampliarlo. Este PR entrega continuidad para jornadas con Next configurado y snapshots reutilizables de nuevas plantillas; no cierra el recorrido completo de una jornada ordinaria nueva. No se infiere esa configuración por nombres, espacios A2 o defaults ocultos.

## Reproducción

```sh
bash docs/evidence/config-u06c/reproduce.sh /tmp/u06c-reproduction
PLAYWRIGHT_BROWSERS_PATH=/tmp/u06c-browsers node --import tsx script/demo/smokeA2Integration.ts /tmp/u06c-native --restricted-data-api --operation-continuity
```

El primer comando ejecuta la base exacta y dos candidatos offline y revalida certificados/protección. Los dominios de primera entrada factible del informe mantienen todas las demás tareas finales fijas; no son una prueba de optimalidad global. Los tiempos observados no se presentan como igualdad de CPU. La auditoría offline tiene ledger separado del motor.

El segundo usa PostgreSQL/Auth/PostgREST/HTTP/Chromium descartables y el ledger nativo, con `remoteWrites=0`. El contrato de permisos incorpora sólo los nuevos objetos de 104. El preparador histórico conserva su alcance hasta 099; las migraciones posteriores siguen una operación separada del ledger. Así no instala wrappers que exigen 104 en un schema antiguo. No se toca Supabase productivo, Replit ni se hace merge.
