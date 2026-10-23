# P0-U00g — integración productiva

Continuación del mismo PR #1185, desde `64baf361139a774cc8cd22bd9d463254839af182`, con base `4571cb993ae221832630f3ac1c60a72318f83f8c`. La Evidence original de diagnóstico permanece intacta. Este directorio recoge la implementación y sus ejecuciones nuevas; no convierte los checks históricos en un gate funcional.

## Recorrido y autoridades

La selección general de comida se guarda por ID de plantilla en `program_settings.meal_task_template_id` (109). Crear una jornada congela ese ID en el perfil diario inmutable y utiliza los snapshots de plantillas y las autoridades existentes de duración, ventana, disponibilidad y capacidad. No hay inferencia por nombre en perfiles nuevos; la compatibilidad por nombre permanece exclusivamente en la presentación/ruta histórica. No se adoptan ni reescriben perfiles antiguos.

`buildEngineInput` → `applyNewDayPlannerConfiguration` conserva la identidad y distingue `meal_break_placeholder` de las tareas productivas. El reconocedor y el adapter existentes producen `ParticipantMealObligation`; el solver, Future Feasibility y los budgets son los existentes. La propuesta materializa las comidas en sus filas fuente del snapshot, conservando `spaceId:null`. `proposal` sigue enumerando exclusivamente tareas productivas: un array vacío puede acompañar obligaciones de comida realmente materializadas.

La migración nueva 108 certifica ese resultado dentro de **la misma RPC** `assisted_record_proposal_clean_validation`, con los mismos grants server-only. No se modifica 104 ni se expone otra RPC. Además de sus guards de run auténtico, sesión, revisión, fingerprint, Draft, evidence y HARD/REQUIRED, verifica:

- Scope positivo, no vacío y sin duplicados; mismas identidades de snapshot que el Stage base y completitud del scope.
- Cambio real; ninguna fila ajena al scope ni placement aceptado puede cambiar. No se aceptan no-ops ni metadatos inventados como sustituto de una colocación.
- Correspondencia de placements productivos y filas; comidas identificadas mediante la revisión congelada, la plantilla diaria, el participante real y su witness exacto, sin duplicados.
- Duración de instancia/snapshot, ventana diaria y disponibilidad, ausencia de solapes, dependencias materializadas y capacidad conjunta con las comidas aceptadas.
- Para un scope solo-comidas, las colecciones ajenas a las filas de tareas también deben permanecer iguales.

La protección automática del Stage se representa como `protectedInterval`, independiente de `fixedInterval` de ejecución. `pending` permanece `pending`; no se fabrica `done`. El builder valida identidad, duración, ventana y compatibilidad con ejecución real antes de incorporar la protección. La proyección ejecutable, la continuación colectiva y el contexto futuro conservan esa geometría. Dominios, materialización, validador y métricas comparten su resolución. El preflight sigue rechazando el input externo `pending + fixedInterval`.

## Auditoría causal integral (Fuente 07 §4.4)

1. El diagnóstico original demostraba que el perfil borraba la identidad antes de reconocer obligaciones: no era inviabilidad ni agotamiento de búsqueda. La integración conserva una autoridad explícita y diaria, sin crear otro planificador.
2. El contrafactual original llegaba a Draft pero 104 rechazaba `proposal=[]`. El probe intermedio [causal-sql-boundary](causal-sql-boundary/) demuestra aceptación **nativa** de S1 solo-comidas tras el delta SQL, antes de integrar identidad/protección. Incluye su intervención reproducible; su versión intermedia de SQL no es el candidato final.
3. Desde ese S1 real, la continuación devuelve `NO_PROPOSAL`, cero ramas y `FLEXIBLE_PARTICIPANT_MEAL_WITH_FIXED_INTERVAL`. Se confirma así en producto lo que antes era únicamente un probe offline.
4. Separar protección y ejecución permite la continuación nativa con los mismos intervalos pendientes. Las jornadas finales comparan cada fila previamente aceptada contra la propuesta y el Stage siguiente. Los ataques SQL intentan desplazar una comida aceptada incluso añadiéndola fraudulentamente al scope; se rechazan y se revierte toda la transacción adversaria.
5. La regresión de permisos detectó que un helper SQL inicial ampliaba el catálogo RPC. Se integró su comprobación en la RPC existente, conservando el contrato de privilegios. El manifiesto de comprobación `script/demo/assistedSQLContracts.ts` reconoce la migración nueva 108, y su test de upgrade aplica esa misma migración antes de auditar contratos actuales: no se altera el dataset, importador, harness ni despliegue de demo.
6. Los guards U00f no confundían una regresión semántica con un cambio de contenido: su recibo histórico exige hashes históricos. El mismo verificador intacto se ejecuta en su base exacta; el candidato hace un replay separado sobre las entradas congeladas y compara fingerprints, propuestas, ramas y continuación fría/protegida. Los recibos originales no se reetiquetan como ejecución nativa del candidato.

## Gates funcionales

El runner [runU00gFunctional.ts](../../../../script/validation/runU00gFunctional.ts) archiva el commit candidato y sólo injerta el dispatch en una copia descartable del harness. PostgreSQL 17, Auth, PostgREST y Chromium son reales y locales. Todas las escrituras operativas se hacen mediante UI/API; los ataques SQL son transacciones adversarias locales que se revierten. No se usan fixtures A2 ni SQL para fabricar Stages.

- Jornada A: dos participantes, cuatro actividades con dependencias y dos comidas de 20 min, ventana 12:00–13:00, capacidad 1; S1 solo-comidas, S2 completo, 6/6. Comidas 12:00–12:20 y 12:20–12:40.
- Jornada B: tres participantes, nueve actividades y tres comidas de 15 min, ventana 12:00–12:30, capacidad 2; scope mixto y dos continuaciones hasta S3, 12/12. Dos inicios distintos demuestran capacidad vinculante.
- Cada scope se solicita de nuevo mediante API antes de aplicar y se comparan snapshot, fingerprints y accounting. Cada Stage conserva las filas aceptadas y todas las tareas siguen pendientes de ejecución.
- Diecinueve negativos SQL cubren hashes, scope vacío/duplicado, identidad, participante, fuente, duración, ventana, capacidad, cambios ajenos, obligación omitida, no-op, HARD/REQUIRED, revisiones y permisos. Otros ataques cubren desplazamiento protegido. Las pruebas focales cubren referencias/dependencias ausentes y combinaciones inviables, sin debilitar preflight.

Los recibos están en [native/](native/) y la prueba adicional de filas SQL en [persistence-proof/](persistence-proof/). Esta última es una nueva ejecución independiente cuyos cinco snapshots se comparan literalmente con los anteriores, sin sobrescribirlos. [source-equivalence.json](source-equivalence.json) verifica que el código productivo permanece idéntico al commit nativo/A2 auditado; las correcciones posteriores son de tests y Evidence.

[regression-comparison.json](regression-comparison.json) compara literalmente U00a–U00d, reconciliación U00c y replay U00e sobre las mismas entradas congeladas, sin normalizar IDs. Las cinco regresiones UI completas se conservan comprimidas, sin logs privados. [transport-verification.json](transport-verification.json) certifica U00f nativo 8/8 y 9/9, protección de seis placements y replay frío/protegido; el recibo histórico se verifica separadamente en su código exacto.

A2 aislado: **266/266, 11 Stages, 27.049 ramas y 8.465 min de presencia**, con las tres series de snapshots y todos los campos de resultado idénticos salvo duración. Tiempos: base 76.134 ms, candidato 74.989 ms y repetición 72.959 ms. [a2-report.json](a2-report.json) revalida 22 certificados; son auditorías offline separadas del accounting productivo. No se afirma una mejora de velocidad por estas diferencias de tiempo. Los tres directorios A2 incluyen runtime, lockfile hash, snapshots y resultado completo.

Suite local final: **3.126/3.126, cero fallos y cero omisiones**, manteniendo las dos exclusiones históricas exactas de CI. TypeScript de aplicación/harness/diagnóstico, secuencia y ejecución nativa de migraciones, y build: PASS. Los checks técnicos y el fallo contractual intermedio ya corregido se detallan en [validation.json](validation.json) y `checks/`. READY requiere además que los checks del head exacto estén verdes en GitHub; el PR es la autoridad dinámica de ese estado.

## Reproducción

Node 20, dependencias del lockfile, Docker local y Chromium; usar siempre directorios nuevos.

```sh
node --import tsx script/validation/runU00gFunctional.ts work/u00g-functional
node --import tsx script/validation/replayU00fFrozen.ts work/u00f-current.json
node --import tsx script/demo/smokeNewDayIntegration.ts work/u00g-main --post-bootstrap-additions
node --import tsx script/demo/smokeNewDayIntegration.ts work/u00g-standalone --standalone-only --post-bootstrap-additions
node --import tsx script/demo/smokeNewDayIntegration.ts work/u00g-itinerant --itinerant-consumption
node --import tsx script/demo/smokeNewDayIntegration.ts work/u00g-setup --setup-families
node --import tsx script/demo/smokeNewDayIntegration.ts work/u00g-transport --transport
```

El probe intermedio se reproduce archivando `64baf36`, aplicando `causal-sql-boundary/intervention.patch`, enlazando las dependencias y ejecutando el harness con `--participant-meals-native-diagnostic` y `OPTIPLAN_U00G_MARKER` apuntando a un archivo inicialmente inexistente. El A2 usa `docs/evidence/STYLING-IN-OUT-CAUSAL-DIAGNOSTIC/capture.ts` en archivos Git independientes de base y candidato, desde S0, en serie y sin otras cargas; `docs/evidence/config-u06c/verify.ts` revalida snapshots y certificados.

Sin merge, escrituras en Supabase productivo, publicación Replit ni modificación de la demo servida. No se aumentan budgets/timeouts ni se relajan restricciones.
