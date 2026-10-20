# P9 — validación y aceptación de movimientos manuales

**Cierre vigente:** [autorización administrativa de HARD nuevas e integración P8](authorization/README.md).
La evidencia de este documento corresponde al ensayo inicial `b5ce969`; su
aceptación con rol production se conserva como prueba del defecto de autoridad
corregido en el cierre. Los resultados finales y límites están en ese informe.

Base auditada: `0e7442e4b5ccf4fde6756841b7908b27e87fe1db`, idéntica al head
remoto de `main` y de `codex/ops-p9-manual-draft-validation` al iniciar.
Autoridad: Fuentes 00 v2.13, 01 v5.2, 04 v2.7 §§11–12 y 06 v2.10.

## Gate causal previo a implementación

Se leyó Supabase exclusivamente para capturar la etapa histórica: plan 27003,
sesión 5, ordinal histórico 24, **registro 104**. La sesión activa ya apuntaba
a otro registro, 47. No se ejecutó `/validate`, una edición ni ninguna otra
escritura contra ese proyecto. El estado actual de esa sesión no se reconstruyó
ni se restauró.

La fixture `server/fixtures/assistedP9A2.json.gz` conserva únicamente EngineInput,
snapshot y replay de configuración: no contiene sesión Auth, token, password ni
usuario aceptante. El test reconstruye la revisión efectiva y exige igualdad
con el fingerprint persistido de la revisión 7; también verifica el fingerprint
íntegro de la etapa histórica. Hasta disponer de delegación nominal al jefe de
Producción, el cierre reserva las HARD nuevas a admin. Producción conserva la
edición, validación y aceptación limpia/REQUIRED/heredada; no se crea otro RBAC.

[Caso exacto rojo](exact-red.json): 266/266 obligaciones, 19 comidas de
participante, 8 comidas operativas, 17 preparaciones de ronda y una de espacio.
El snapshot original valida sin razones. Cambiar únicamente 210221 de
12:00–12:05 a 11:30–11:35 produce **solamente**
`TRANSPORT_GROUPING_VIOLATION`, `hardValid=false`, cero violaciones estructuradas
y esa familia en `unstructuredReasonCodes`. Los miembros son 210150, 210221,
210233 y 210259; el máximo efectivo es tres. No aparece una falsa exclusividad
física del espacio y no se pierde ninguna ocupación auxiliar.

La prueba de regresión del caso exacto se ejecutó roja antes de modificar código
productivo. El [ensayo HTTP rojo](http-red.json), con PostgreSQL 17, GoTrue,
PostgREST, servidor productivo y Chromium descartables, reconstruyó el A2
completo mediante propuestas/validaciones/aceptaciones reales. En esa
representación canónica local el movimiento equivalente es 10135 de
12:00–12:05 a 11:30–11:35, con 10150, 10233 y 10259 ya presentes. Captura PATCH,
fingerprint y respuesta **422 ASSISTED_DELTA_VALIDATION_UNSUPPORTED**, sin
`draftValidationId`; no cambia `daily_tasks`. Un movimiento realmente válido
de cinco minutos devuelve **200** y persiste un reporte vigente incluso en la
base anterior. Estos códigos HTTP corresponden al ensayo local: **el HTTP del
intento remoto original continúa sin observarse**.

El mecanismo no es una colisión demostrada del identityMap: las identidades y
los cuatro miembros llegan correctamente al checker. `validateTransportGrouping`
devolvía contador y grupos, pero no detalles materiales; `validatePlan` tomaba
solamente el contador. `validateDraft` rechazaba la familia anónima antes de
`assisted_record_stage_validation`. Finalmente `operatorError` convertía
cualquier código que contuviera `VALIDATION` en una petición de revalidar.

La Evidence anterior `ASSISTED-MANUAL-SNAPSHOT-FIDELITY.md` ya documentaba esta
frontera con un OUT que vulneraba la separación entre grupos. P9 extiende esa
autoridad y mantiene las restantes familias no certificables bloqueadas. No se
interpreta el historial anterior como permiso para aceptar un agregado.

El CLI histórico mezclaba el S10 grabado con la topología actual, lo que añadía
una falsa comparación de autoridades y una razón de solape. Ahora usa el
EngineInput histórico congelado, igual que su regresión de servidor. El replay
conserva el fingerprint histórico y las dos infracciones auténticas del OUT;
transporte ya aporta identidad y las preparaciones omitidas siguen sin poder
certificarse. No se modifica ninguna regla productiva para conseguir ese resultado.

## Corrección

El mismo checker emite detalles por tamaño de grupo, separación, cobertura,
identidad de participantes y primera/última obligación, incluyendo comidas.
Conserva sus contadores, razones y condiciones de rechazo. La identidad contiene
miembros, intervalos y límites materiales; las violaciones se proyectan mediante
el identityMap y `createViolationKey`, sin extraer entidades de mensajes.

El servicio registra el reporte por el RPC existente. Añade contexto antes/después
sin incorporarlo a la identidad material de la infracción. Aceptación, usuario,
excepción, configuración, fingerprint y consolidación de `daily_tasks` siguen en
la transacción existente; no se necesita migración. Una HARD aceptada conserva
`hardValid=false`. El motor sigue rechazando nuevas HARD/REQUIRED; sólo puede
heredar la misma excepción ACTIVE con tareas intactas.

Los errores distinguen representación/ocupaciones/identidad no certificables,
validación fallida y conflictos stale. La UI presenta, por ejemplo, «IN: grupo de
4 participantes; máximo permitido 3», las entidades, los horarios antes/después
y las consecuencias de la confirmación. La advertencia local de capacidad de
transporte deja de inventar un conflicto de espacio/recurso compartido.

## Verificación y límites

Reproducción focal:

```sh
node --import tsx --test --test-concurrency=1 engine/planner-next/transportGrouping.spec.ts server/assistedManualSnapshotFidelity.spec.ts client/src/lib/assisted-draft-warnings.test.ts client/src/components/planning/assisted-planning-workspace.test.ts
```

Ensayo completo descartable:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/p9-playwright npm run demo:a2:smoke -- work/p9/green --full --manual-validation
```

El flag focal conserva la construcción automática completa, permisos/RLS,
validación canónica, apertura de un segundo navegador y rollback/redo; selecciona
el recorrido P9 después de construir el planning. El primer ensayo sobre la base
alcanzó 266/266 y falló después en `smokeA2ViewsHistoryJourney`: esperaba el botón
«Orden por tarea», ausente en esa UI. Se conserva ese fallo como límite previo,
sin modificar ordenación ni presentación de etapas. El nuevo flag evita mezclar
esa prueba independiente con el gate de movimientos manuales.

Para iterar sobre las comprobaciones SQL/Chromium existe también
`--manual-validation-replay=<archivo manual-validation-baseline.json>`: sólo
carga un A2 previamente grabado en la base local recién creada y declara
`generatedPlan=false`, `requestedStages=0` y la huella del archivo fuente.
El gate CI usa la construcción completa y no activa ese modo. Los errores
iniciales del comprobador se corrigieron respetando los NULL de las comidas,
la persistencia de equipos en el snapshot y las constraints de identidad y
FK de configuración/validación; no se tocaron esas protecciones de la DB.

La selección de regresión ejecutó **382 pruebas, todas PASS**. Incluye Assisted,
propuestas, snapshots, AcceptedException, permisos (también rechazo del rol no
reconocido `editorial` en middleware), comidas, preparaciones, recursos y
Autopilot. PostgreSQL/Auth comprueba los roles reales existentes: admin,
production, viewer, aux y usuario sin rol. No se crea un rol editorial nuevo.
`npm run check`, build, secuencia de migraciones y compilaciones TypeScript de
integración y del replay histórico pasan.

**Gate inicial de validación completo (`b5ce969`): PASS.** [Resumen verificable](validation.json),
[traza HTTP y auditoría](native.json), [integración completa comprimida](integration.json.gz)
y [log nativo](native.log). Se construyeron las once etapas automáticas desde
cero, 266/266; la huella del planning completo coincide con el ensayo rojo.
Después se ejecutaron aceptación limpia/admin, cancelación y confirmación HARD
en Chromium/Producción, excepción exacta auditada, herencia sin nueva excepción,
edición de un miembro que exige nueva confirmación y estado `SUPERSEDED` de la
decisión anterior, rechazo seguro de acompañamiento no certificable y rollback
al planning íntegro. La Stage HARD conserva `hardValid=false`.

| Recorrido | Resultado |
|---|---|
| Cuarto IN, regla y horarios antes/después | [Reporte vigente](authorization/four-in-report.png) |
| Decisión admin y seguimiento crítico persistente | [HARD aceptada](authorization/accepted-hard.png) |
| Familia no certificable, sin posibilidad de aceptación | [Rechazo específico](authorization/unsupported.png) |

Los logs de comprobación de tipos, build, migraciones y las 382 regresiones se
conservan junto a este informe. El nuevo job `manual-draft-validation` ejecuta
el mismo gate completo en CI. `main` avanzó después de la base autorizada con
P6 (`1c4521d`); sus archivos de Control Room y hooks de roles no se modifican
en P9.

No se modifican migraciones, RLS, roles productivos, búsqueda, presupuestos,
P6/Control Room ni numeración/renderizado de etapas. Las escrituras del ensayo
se limitan a sus bases locales descartables; el A2 real sólo se leyó. No se
certifica el despliegue o navegador remoto a partir de estos resultados.
