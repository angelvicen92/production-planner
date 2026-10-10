# A2 en la aplicación OPTIPLAN

El objetivo es abrir una jornada independiente en la interfaz publicada por el usuario en Replit. El importador prepara el canon completo **sin solución**: C01–C19, 266 obligaciones (247 tareas y 19 Sodexo), 23 espacios/zonas, 9 recursos, coaches, disponibilidades, dependencias, transporte, tres unidades itinerantes, acompañamientos, setup, rondas, cadenas, comidas operativas y continuidad REQUIRED.

El proyecto conectado `dyqusivzgxebkxkwohwn.supabase.co` no está identificado como staging. No se ha escrito en él. El destino debe confirmarse expresamente con el usuario antes de crear schema o cargar datos. El procedimiento siguiente está preparado; no acredita una carga remota realizada.

## Preparación sin conexión

```sh
npm ci
npm run demo:a2:prepare-import -- 2026-10-30
```

La fecha es un ejemplo y se debe sustituir por la fecha elegida para la jornada. Se generan `work/a2-import/dataset.json`, `import.sql` y `manifest.json`. No se leen credenciales ni se abre ninguna conexión. Los IDs están reservados de forma determinista: jornada `27001`, concursantes `201–219`, tareas `10001–10266`. Una colisión provoca error; no se sobrescribe ni borra nada. La repetición se rechaza deliberadamente, para que no se confunda con una segunda jornada.

## Proyecto separado, después de confirmar su referencia

1. Crear un proyecto Supabase de demostración separado, sin jornadas, concursantes ni tareas. Compartir su referencia y confirmar que ese será el destino. Este paso no está realizado.
2. Copiar **solo el schema público** y sus funciones/RLS/permisos desde una versión OPTIPLAN compatible con #1104 hasta la migración 087, sin datos, usuarios ni credenciales de producción. Por ejemplo, con una conexión de lectura a la fuente y una conexión al proyecto aprobado:

   ```sh
   pg_dump "$SOURCE_READONLY_DB_URL" --schema=public --schema-only --no-owner --file=work/a2-import/public-schema.sql
   psql "$APPROVED_DEMO_DB_URL" -v ON_ERROR_STOP=1 -f work/a2-import/public-schema.sql
   ```

   Revisar el dump antes de restaurarlo: debe contener tablas, índices, enums, funciones, secuencias y políticas, y ningún `COPY` de datos. El destino Supabase aporta `auth`, roles y extensiones. El historial incluye migraciones antiguas con prefijos compartidos; este paquete no presupone que aplicar todos esos archivos a una base vacía sea un bootstrap probado.
3. Aplicar `supabase/migrations/088_plan_planner_next_configuration.sql` **solo al proyecto aprobado**. Es una columna nullable por jornada y un trigger de inmutabilidad; los días existentes sin contrato conservan su comportamiento. El importador no aplica migraciones. No ejecutar `db:push` ni migraciones sobre el proyecto conectado actual.
4. En una misma sesión SQL del destino aprobado, establecer la confirmación y ejecutar el archivo:

   ```sh
   psql "$APPROVED_DEMO_DB_URL" -v ON_ERROR_STOP=1 \
     -c "SET optiplan.confirmed_demo_project = '<referencia-aprobada>'" \
     -f work/a2-import/import.sql
   ```

   El guard exige confirmación explícita y ausencia de jornadas/tareas/concursantes; inserta también los defaults necesarios en un schema sin datos. No usa upserts. Cualquier colisión, FK o restricción aborta la carga de filas completa. Se avanzan las secuencias para futuros inserts; como en PostgreSQL, sus valores no se revierten tras un rollback. El token de sesión es una confirmación del operador, no una comprobación automática del proveedor: verificar también el host/proyecto de la conexión.
5. Crear un usuario Auth exclusivamente de demo. Asignarle rol `production` mediante `script/demo/DEMO-OPERATOR.sql`, tras establecer en la misma sesión la referencia aprobada y `optiplan.demo_operator_email`. El script no cambia un rol existente. Para el amigo, repetir con un usuario demo distinto. No copiar cuentas reales.
6. El usuario configura su aplicación de demo con URL/anon key del cliente y URL/anon/service-role key del servidor del **mismo proyecto aprobado**, actualiza Replit desde GitHub y publica como acostumbra. No se ha investigado ni modificado la infraestructura de publicación. No sustituir las credenciales de una instancia que atienda producción.

## Verificación previa y recorrido en la interfaz

Con las variables del servidor apuntando al proyecto aprobado:

```sh
npm run demo:a2:verify-database -- <referencia-aprobada> 2026-10-30
```

Esta orden solo lee. Exige el host correcto, la jornada/fecha, C01–C19, 266 tareas sin planificar y **igualdad del problema completo** obtenido por `buildEngineInput` y el adapter normal frente al canon. Si falla, no iniciar la demo. No comprueba login, RLS ni aceptación; esos gates se completan en la aplicación.

Entrar con el usuario demo, abrir la jornada de esa fecha y elegir **Planificación asistida**. Mostrar los 19 concursantes, disponibilidades, coaches y tareas. Antes del ensayo, ajustar el reloj simulado desde los controles existentes de la aplicación si se desea empezar visualmente antes de las 09:00.

El camino verificado usa el recomendador del servidor para seleccionar el próximo alcance. Pulsar **Sugerir siguiente alcance**: el servidor selecciona el próximo Espacio o conjunto de Tareas y muestra la selección antes de generar. También se puede seleccionar manualmente; el paquete incluye la secuencia exacta de selectors en `A2-LIVE-STAGE-GUIDE.json`, obtenida de dos runs con el input reconstruido. Para cada etapa: solicitar la sugerencia y revisar el alcance, dejar `Include prerequisites` desactivado, generar propuesta, aplicar al borrador, validar y aceptar. No se importa ninguna etapa ni `proposalRunId` previo. La solución se produce en directo en este recorrido.

Conteos acumulados esperados: **19, 38, 46, 65, 75, 111, 169, 207, 209, 266**. Comprobar cero nuevos HARD/REQUIRED. S1 es el tramo costoso; preparar una jornada final ensayada y la reproducción como respaldo, indicando cuál se enseña. Recorrer concursantes, espacios y recursos; comprobar las 51 tareas de CAM1 sin solapamientos y las comidas.

Después de S10, recargar la página y volver a abrir el día desde otra sesión. Confirmar que se recuperan las diez etapas y sus `proposalRunId`, las 266 obligaciones y la validación. Crear un borrador de revisión, ajustar una tarea, validar y mostrar los conflictos cuando corresponda. Esta recuperación remota y el login aún están **PENDIENTES** hasta aprobar el destino y ejecutar el ensayo.

## Autoridades y límites

`plans.planner_next_configuration` almacena un contrato genérico, sin IDs A2 en lógica productiva, horarios solución, estados ni duraciones. Recupera las reglas que antes existían solo en el fixture. Tareas, estado, duración, ubicación, recursos asignados, snapshots de templates, disponibilidad y optimizer siguen viniendo de las tablas ordinarias. Las reglas por tarea incluyen las precedencias explícitas y las composiciones itinerantes; no se infieren por nombre.

El contrato declara `legacyGroupingMode: DISABLED`: este día usa sus `setupPolicies` explícitas de Planner Next, sin añadir los defaults de grouping de V3. Las jornadas que no tienen contrato conservan esos defaults. Las nuevas autoridades forman parte del fingerprint y del replay de configuración. El trigger impide cambiarlas silenciosamente después de crear el día; un editor genérico de estas reglas y la incorporación de tareas nuevas requerirían otro contrato de revisión. La modificación de duración/estado y el borrador manual usan sus autoridades existentes.

La prueba local SQL usa PostgreSQL WASM, schema Drizzle, columnas históricas necesarias y la migración 088; acredita inserciones, constraints y guards, **no** las transacciones RPC/RLS de Supabase. El gate de input y los dos runs prueban que el canon no se debilita al reconstruirse desde filas. El recorrido remoto todavía requiere el proyecto aprobado y el ensayo de la UI.
