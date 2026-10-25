# P0-U00n — origen operativo y altas posteriores a un Stage

Base autorizada: `382e7966ea1fe3508978f92cf5afcc05fe3c3157` (U00m, #1191). La causa X→Y→Z de U00m se toma como cerrada. No cambia ningún archivo de `engine/`, algoritmo, capacidad, budget, timeout ni branch limit.

X: el alta posterior a S1 queda fuera del universo autorizado. Y: Stage histórico y origen de trabajo compartían indebidamente identidad; U00c, request, productor y SQL exigían U1. Z: no había recorrido seguro hasta S2 aunque existiera solución. W: transición atómica de obligaciones, revisión y origen dentro de la sesión. M: ambas jornadas originales generan la nueva obligación en la propuesta y el snapshot, aceptan S2 y navegan entre checkpoints sin perder tareas.

## Autoridad y persistencia

113 añade un registro de admisión inmutable para el servicio (SELECT/INSERT, RLS, sin acceso de cliente), tres campos de origen en la sesión, el origen/token capturado por cada run y el token de cada validación. No crea otra autoridad de planning. El origen es la proyección del checkpoint con las altas pendientes admitidas; sus decisiones anteriores se comparan íntegramente contra el Stage original.

Cada transición conserva sesión/plan/actor, Stage base, revisión anterior/nueva, fingerprint anterior, token, fuentes completas, lista exacta de altas y sus snapshots pendientes. Conserva también las proyecciones sobre cada Stage histórico, construidas con el codec canónico existente y comprobadas semánticamente en SQL. Esto permite restaurar sus fingerprints operativos sin introducir otro serializador ni alterar el fingerprint histórico. Un Stage aceptado posteriormente ya contiene el universo completo.

El comparador reutiliza la captura completa de 107 y compara filas completas por igualdad. Antes de proyectar, exige que los IDs capturados coincidan con el origen y que los participantes conocidos por tareas/replay estén cubiertos: tener todas las claves JSON sin todas las filas no demuestra una captura suficiente. La contención JSONB anterior admitía ampliaciones de arrays anidados; los recibos causales muestran `legacy_contains=true`, `exact_equal=false` y el rechazo actual, también en el perfil S0. Sólo proyecta sobre ella los campos que la aceptación auténtica consolida desde el origen actual; el resto debe permanecer literalmente igual. Rechaza tareas/participantes modificados o eliminados, autoridades ajenas, capturas ausentes/incompletas y altas que ya tengan planning o ejecución. Los participantes nuevos deben estar asociados a las altas. La operación mantiene la barrera existente de ejecución/locks protegidos.

El perfil S0 conserva su sustitución transaccional de sesión de U00c. La RPC antigua sigue rechazando S1+, incluso si se invoca directamente. El nuevo perfil mantiene la sesión, el cursor y todo el linaje.

## Transacción y consumidores

Orden: captura SHARE/NOWAIT de las autoridades, advisory lock por plan, sesión con NOWAIT, CAS de sesión/base/Draft/revisión y comparación de token/lista. R2, replay, transición, origen y Draft se escriben juntos. No se escriben horarios diarios durante admisión ni apply. Los runs anteriores no aceptados quedan explícitamente obsoletos; los de Stages históricos conservan su provenance.

Request usa el fingerprint del origen; el run captura en SQL su snapshot y token inmutables. El productor recorre ese snapshot completo. Protección, recursos, comidas, preparaciones y excepciones conservan sus consumidores existentes y el linaje aceptado. Se mantienen las comprobaciones completas de 108 y 110–112: su referencia al Stage como universo se sustituye por el origen auténtico capturado. Finalización, apply, validación y aceptación comprueban fuentes actuales; una nueva alta entre fases nunca consolida un universo incompleto. La aceptación conserva igualdad exacta con `daily_tasks`, CAS, autenticidad del resultado, autorizaciones y archivo atómico de ramas.

La prueba nativa de excepción descubrió un consumidor que sólo resolvía namespace `resource`, omitiendo `plan-resource`. Se alinea con la proyección material existente. La validación SQL conserva la verdad de una infracción heredada: vincula cada HARD/REQUIRED al mismo `violationKey`, entidades, dimensiones, tareas intactas y excepción ACTIVE del linaje. La aceptación vuelve a comprobar el lifecycle del linaje: STALE/SUPERSEDED/RESOLVED entre validación y aceptación producen `STALE_VALIDATION`. Una nueva violación o un `hardValid=true` falsificado con hashes recalculados se rechazan. No se relaja ninguna regla del generador.

## Restauración y decisión humana

01 v5.4 y 04 v2.9, elevadas por 00 v2.15, aclaran exclusivamente la decisión recibida. Rollback restaura las decisiones del checkpoint y deja las obligaciones posteriores pendientes en una proyección explícita. La API y UI distinguen Stage/fingerprint/revisión históricos de origen/revisión vigentes y tareas posteriores pendientes. Redo recupera el hijo; aceptar otro hijo archiva el futuro antiguo sin borrar obligaciones. Las excepciones se consultan en la línea correcta y pasan a SUPERSEDED cuando se modifican sus tareas. Una contradicción con `done` o `in_progress` devuelve `RESTORE_EXECUTION_CONFLICT` sin modificar ejecución.

## Límites

Las admisiones requieren un Draft restaurado al origen y una captura demostrable. Se mantiene el rechazo conservador de ejecución/locks protegidos. Las capturas históricas incompletas no se reconstruyen por inferencia. Los locks SHARE de corta duración pueden producir contención explícita 409; no hay locks artificiales de producción. El almacenamiento de proyecciones crece con el número de checkpoints y admisiones. La publicación de código y migración debe coordinarse porque la confirmación exige ahora la lista exacta de identidades. No se ha realizado despliegue, migración productiva ni merge.
