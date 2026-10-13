# Implantación A2 real — preparación, sin ejecución conectada

La vía elegida es B: crear **27002**, sin cambiar el A2 **27001**, sus tareas,
Stages, defaults, catálogo histórico o jornadas ajenas. El namespace 100000
mantiene nuevas identidades de tareas/snapshots/asignaciones separadas. Si hay
colisión, se aborta; no se borra ni se hace upsert. La fecha es explícita y
configurable; 2026-10-30 sólo es la fecha del ensayo descartable.

1. Ejecutar el preflight de identidades **GET limitado** a `zones(id,name)` y
   `spaces(id,name,zone_id,parent_space_id)`; conservar timestamp/hash. No usar
   una descarga indiscriminada de todas las tablas con service-role.
2. Preparar un backup verificado, ensayar su restore en PostgreSQL local y
   conservar SHA256. Obtener catálogo SQL/esquema/funciones/RLS con el auditor
   existente: `script/demo/sql/catalog-audit.sql`, `a2Preflight.ts`. La versión
   del ledger o la presencia de una columna no sustituye la comprobación de
   cuerpos RPC, privilegios, snapshots v2 y drift. Cualquier adopción del esquema
   conectado es una operación posterior explícitamente revisada, nunca ejecutada
   por este PR.
3. Generar el paquete, **sin conexión ni escrituras**:

   ```sh
   node --import tsx script/demo/prepareA2RealImport.ts 2026-10-30 27002 100000 work/a2-real-import work/catalog-identities.json
   ```

   Produce `manifest.json`, `dataset.json`, `preflight.sql`, `import.sql` y
   `rollback.sql`. El manifest conserva las 23 identidades source originales,
   añade explícitamente Maqui/Pelu para Redes y declara destinos, padres,
   decisión, capacidad, recursos, dependencias, motivo y provenance. Reutiliza
   las identidades originales de activos del producto; incluye CAM5/CAM6 ya
   existentes y exigidas por Fuente 06, sin crear cámaras nuevas.
4. Revisar `preflight.sql` en modo read-only. Exigir catálogo/recursos concordantes,
   cuerpos RPC/RLS vigentes, backup restaurable y cero colisiones. El generador
   nunca declara `readyForDeployment=true`: falta la aprobación de implantación
   y los prechecks del destino. Validar proyecto host real y cliente/servidor
   iguales mediante el procedimiento existente.
5. Sólo tras revisión de ChatGPT y autorización de implantación, el operador
   suministrará las assertions existentes `optiplan.confirmed_demo_project`,
   `backup_sha256`, `security_approved`, `import_approved` y `demo_actor` de un
   actor Auth production/admin. El SQL usa BEGIN, advisory lock, locks de tablas,
   identity/parent/resource drift checks, control de colisiones y snapshots de
   todas las filas anteriores; la comparación previa a COMMIT aborta ante cualquier
   cambio en filas históricas o defaults. Reinicia secuencias transaccionalmente
   sin bajarlas. El día nuevo importa **0/266** colocadas, nunca una solución.
6. Postchecks: 19 participantes, exactamente 266 IDs y contenido del manifest;
   todas las tareas pendientes sin horas; Redes=39/14 sin CAM1; Corner=31 y
   Pasillo=3 con CAM1; P15=43 y set combinado nuevo bajo 42 con CAM2; setup=10,
   familias sin reentrada; Totales Post independiente; IN/OUT=49 no exclusivos;
   acompañamiento virtual con `blocksSpace=false`, anchor=48 sólo 15 min.
   Comparar hashes de filas/Staging/jornadas anteriores y defaults. Ejecutar
   `buildEngineInput → adapter` y el flujo real del producto; registrar métricas,
   validación, Stages y replanificación después de Reiniciar Asistida.
7. Reversibilidad: un fallo durante import revierte la transacción completa.
   `rollback.sql` exige autorización específica y sólo admite la nueva jornada
   vacía sin sesión Assisted ni ejecución. Elimina únicamente el día y entidades
   nuevas no referenciadas; no toca recursos/zonas/históricos ni baja secuencias.
   Una vez haya Stages, el rollback destructivo se rechaza para conservar historia:
   usar la navegación/reinicio normal de Assisted o el restore previamente
   ensayado bajo una decisión de producción separada.

Este paquete no autoriza migración, import ni cambios en Supabase/Replit real.

El ensayo reproduce una fixture pública del A2 anterior derivada del baseline de
servicios y normalizada al import agrupado de #1115; conserva sus once Stages y
sus 266 tareas. Es una prueba de preservación en una base descartable, **no** un
backup ni una lectura del historial privado conectado. La fixture está versionada
(comprimida) para repetir el ensayo sin depender de archivos de `work/`.
