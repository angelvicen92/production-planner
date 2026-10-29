# OptiPlan — P0-G03d

Base autorizada `84056c3de8bf16769ce2c1ec32113fbc7443f532`; rama única `codex/p0-g03d-resource-windows-native-ui`. Autoría horaria nativa de recursos y protección de su escritura diaria. Sin merge, despliegue ni migraciones remotas. **La composición conjunta + fases + comidas flexibles sigue pendiente.**

## 1. Gate causal

[Contraste X/Y/Z/W/M, endpoints, revisión y primera frontera](causal-gate.md). La pérdida estaba en los productores UI; builder, adapter y consumidores físicos ya admitían la ventana. El PATCH diario anterior escribía directamente y no garantizaba revisión/CAS ni protección de Stages. La corrección conserva el contrato temporal existente y reutiliza su writer/replay.

## 2. Cambios productivos y complejidad

Un control compartido sirve al alta global, alta ad hoc y editores existentes. El catálogo escribe `defaultAvailabilityStart/End`; el día escribe `availabilityStart/End` sobre su identidad diaria. `null/null` significa la jornada efectiva, sin inventar 24 horas. Nombre, tipo, origen, asignaciones y booleano no se incluyen en el PATCH horario.

La operación interna de disponibilidad extiende el writer CAS v5 y sus lectores de transición. La migración **129** añade un trigger privado y su función invoker; no crea columnas, tablas, RPC, otro sistema de revisiones o dependencias. Es necesaria para cerrar el UPDATE directo y hacer atómica la ventana con revisión/sesión. La comprobación de roles usa la misma comparación de mayúsculas que Express. [Inventario y complejidad exacta](implementation.json).

No cambian motor, geometría, matching, Future Feasibility, heurísticas, presupuestos, timeouts, migraciones 001–128 ni Fuentes oficiales.

## 3. Recibos UI: catálogo → snapshot → override → reload

`native/` y `repeat/` contienen dos bases PostgreSQL/Auth/PostgREST/Chromium nuevas y descartables. Todos los horarios positivos salen de controles nativos: no se inyectan por SQL, API externa ni `page.evaluate`.

EVA se crea en catálogo con **16:00–21:00**. Crear día copia esa pareja. Cambiar después el catálogo a **18:00–20:00** deja intacto el día. El editor diario guarda 17:00–20:00, restaura `null/null` y vuelve a 16:00–21:00; la recarga y SQL verifican los valores guardados. Un S0 limpio admite otra edición y mantiene literalmente su sesión/Stage.

El recurso ad hoc «Micro de apoyo» se crea desde UI con ventana opcional. Tras desactivarlo, editar su horario conserva `isAvailable=false`, identidad diaria y `resourceItemId=null`.

![EVA: ventana diaria guardada tras recarga](native/native-eva-window.png)

Los recibos `ui-writes.json`, `native-snapshot.json`, `native-daily-override.json`, `native-full-workday.json`, `native-resource-preservation.json`, `native-input.json` y `native-adapter.json` vinculan cada tramo. Se consultan dentro de `receipts.json.gz`; el manifiesto contiene sus hashes públicos.

## 4. EVA y contraste causal G03c

La jornada lógica G03c se crea por UI con 65 obligaciones, Main/Vocal, 19 comidas Sodexo individuales y fases 3/2/2. SQL y EngineInput guardan la ventana auténtica. La conjunta continúa deshabilitada y su guard SQL la rechaza en una transacción READ ONLY.

El macroprobe añade **sólo la conjunta en memoria**, conservando la ventana nativa. Sus cinco operaciones con EVA empiezan desde las **16:00**; witness 46 productivas + 19 comidas, 2.884 ramas y certificado sin búsqueda adicional. El control borra únicamente esa disponibilidad: primera EVA a las **09:00**, 864 ramas. Las entradas difieren sólo en esa pareja; no son Stages combinados. [Verificación A](macro-verification-a.json), [B](macro-verification-b.json), `macro*/` y `unrestricted*/`.

La topología admitida G03b sí alcanza **S1/S2 SQL, 60/60**, con EVA configurada desde UI a 16:00–21:00. El input es literalmente el G03b anterior salvo los dos campos horarios de EVA. Las tres operaciones de fase A respetan la ventana; S1 acepta sólo tres y certifica las 19 comidas futuras. S2 mantiene exactamente S1. [Comparación causal y Stages](eva-stage-comparison.json), `eva-stages/`.

## 5. Generalización no A2

La segunda jornada usa cuatro participantes propios, tres plantillas de inspección de 10/15/20 minutos, dos fases y un recurso distinto, «Sensor móvil». Su default **10:00–15:00** se copia al snapshot; el override diario **09:30–15:30** se guarda y recarga desde UI. Su identidad global es 8 y la diaria 16: adapter, witness y SQL consumen la diaria.

Con el mismo scope completo, cambiar sólo su disponibilidad a **20:00–20:05** produce `NO_PROPOSAL`, sin Stage. Restaurar exclusivamente la ventana produce una propuesta válida. Se descarta mediante el flujo auténtico antes de configurar las fases. Después S1/S2 aceptan **3 → 15** obligaciones, conservan cuatro comidas futuras en S1 y preservan el prefijo aceptado. [Verificador independiente A](verification-a.json), [B](verification-b.json).

![Sensor móvil: override diario guardado](native/generic-resource-window.png)

## 6. Permisos, CAS y negativos

Catálogo: escritura admin. Día: admin/production. GET permite admin/production/viewer/aux. Anónimo recibe 401; rol ausente, viewer y aux no escriben. El nuevo test HTTP comprueba rutas normales, mayúsculas y slash final antes del handler privilegiado; conserva el fallo causal previo y su cierre en `checks/authorization-*.log`.

La edición horaria exige revisión y pareja exclusiva. Revisión stale, formato/pareja/orden inválidos, identidad inexistente, escritura SQL directa y decisiones protegidas se rechazan sin alterar la ventana. El SQL comprueba la proyección completa, delta y hashes bajo los locks existentes.

`failures/` acredita errores de guardado/recarga visibles, recuperación por «Reintentar» y SQL sin escrituras parciales. Se distingue la inyección de fallo HTTP del test real de transacción. Sus negativos SQL aislados revierten fixtures de `done`, `in_progress`, lock, Draft modificado y propuesta en curso, y exigen el rechazo específico correspondiente.

`old-writer/` ejecuta la llamada UI contra ledger 128: **409 visible, fila y revisión intactas**. El discriminador de operación impide que un writer antiguo ignore la nueva propiedad y persista sólo el fingerprint.

**Límite deliberado:** la edición horaria permite preparación y S0 limpio. Altas, renombres, activación y borrados no versionados se hacen antes de capturar la sesión. Rechaza cualquier edición tras horarios planificados, ejecución, locks o placements históricos, incluso si la nueva ventana los conservaría. No implementa grandfathering/recertificación de ediciones posteriores. La protección está en backend/SQL y no depende de deshabilitar el botón.

## 7. Autoridad SQL demostrada

Los snapshots de propuesta, Draft, validación y Stage se contrastan con una conexión PostgreSQL nueva. El verificador independiente comprueba duración/ventana/capacidad de comidas, continuidad, dependencias, recursos, no solapamiento y prefijo protegido. Los ataques al witness recalculan hashes y se distinguen de autenticidad/CAS.

`upgrade/` aplica 128→129 poblado: **599 tareas y 11 Stages históricos**, todas las filas/lectores/RLS y metadata de permisos originales exactos. La función nueva no concede EXECUTE a anon, authenticated ni service_role. No se adopta configuración histórica ni se escribe en Supabase remoto.

## 8. Dos bases, determinismo y regresiones

Regresión A2 importada ejecutada de nuevo: **266/266, 11 Stages, 27.049 ramas**, fingerprint `2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d`; informe completo idéntico salvo `durationMs`, snapshots exactos y 11 certificados revalidados. [Recibo](a2/comparison.json). G03b repite **60/60 y 15/15**, cuatro Stages SQL y mismos inputs, decisiones, witnesses, ramas y fingerprints que su baseline. [Comparación](control-g03b-comparison.json). G02 repite sus dos topologías y **cuatro Stages SQL**, con problemas, decisiones, witnesses, fingerprints y ramas literales al baseline. El negativo de recurso no disponible se prueba antes de S0, y la mutación directa tras S0 se rechaza por protección de fuentes capturadas. [Comparación](control-g02-comparison.json). Los controles G01/U02d son revalidaciones independientes de sus recibos históricos, identificadas en `historical-controls/`.

[Determinismo](determinism.json): mismos IDs, inputs, problemas, decisiones, fingerprints, propuestas y snapshots SQL; **dos Stages nuevos por base**. No hay remapeo de identidades ni normalización física. Se excluyen únicamente siete contadores medidos de duración, enumerados en el recibo. Los hashes del código ejecutado coinciden.

[Comandos, controles y límites de validación](validation.md), [resultado machine-readable](validation.json), [vinculación al código](source-binding.json) y [ensayos fallidos/clasificados](attempts.json) separan la evidencia nueva, regresiones nuevas y recibos históricos revalidados. Las dos bases funcionales corresponden al código `851ed6aa`; el follow-up del test HTTP añade sólo tipos y genera JavaScript idéntico. Los ajustes posteriores de navegación, cierre de recibos y orden de negativos de G03b/G02 sólo afectan al harness; no se ejecutan en esas dos bases.

La primera CI G03d del head `8750c80a` pasa sus tres jobs. [Clasificación de los controles históricos y correcciones de harness](ci-first-pass.json): archivo a disco con todos los blobs verificados, detección exacta de 129 y adopción de CAS en probes legacy; las aserciones físicas siguen intactas. La CI alojada del head exacto del PR es un gate independiente. No se sustituye por los focales locales ni por el A2 importado.

## 9. Siguiente frontera concreta

Admitir y autenticar la **conjunta real con fases REQUIRED y comidas flexibles** mediante sus consumidores TypeScript/SQL existentes, usando esta ventana de EVA guardada desde UI, hasta S1/S2. Este PR no relaja ese guard ni declara resuelta la macro A2 completa, la autoría nueva 266/266 o P0 general.
