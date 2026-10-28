# Validación, reproducción y alcance de la Evidence

Base de producto exacta `bd6628d127624ba367f408422906b3da36150626`. El checkout inicial era anterior y carecía de U01d–f; se obtuvo la base remota correcta antes de trabajar. `source-binding.json` compara hashes de todas las fuentes productivas del manifiesto y confirma diff productivo vacío.

## Ejecutado

| Comprobación | Resultado |
| --- | --- |
| Control nativo U00a en PG/Auth/PostgREST/Chromium | PASS: UI 4/4 y 9/9, Stage aceptado y negativos originales |
| Control nativo U01f completo | PASS: 8 positivos, 16 Stages SQL nuevos; segundo perfil, negativos y protección; imposible 4.278 ramas |
| Verificador U01f nuevo vs Evidence histórica U01f | PASS: igualdad física y determinista; 32 Stages sumando ambos conjuntos, 24 itinerantes, 648 negativos entre ambos. No se cuentan todos como ejecución nueva |
| Reparación supporting de control U01f | PASS |
| Jornada integrada final, tres días UI/API | PASS: 24 tareas cada uno, pausa UI, primer guard y SQL en ambos órdenes, cero Stages integrados nuevos |
| Memoria Main integrada, dos positivos y negativo | PASS: 24/24; scope parcial y continuación, macro/Main-only, doce ataques físicos. Negativo agotado honestamente |
| Testigo independiente de capacidad y supporting reparable | PASS: 24 tareas y preparación desplazada sin cambiar propuesta |
| `verify.py` offline sobre recibos publicados | PASS: hashes, física, fuentes SQL, scopes, protección, negativa y límites |
| TypeScript del harness y dependencias importadas | PASS final; errores iniciales de tipado se conservan en `checks/typescript-initial.log` |
| Cuatro archivos focales existentes | PASS, cero fallos; `checks/focal.log` |

Los cuatro archivos son `server/fixedItinerantPhaseComposition.spec.ts`, `server/technicalChainStructure.spec.ts`, `engine/planner-next/integration/nativeJointGroups.spec.ts` y `engine/planner-next/integration/nativeOperationalMeals.spec.ts`. El runner Node informa cuatro archivos aprobados; no se presentan como sólo cuatro assertions de dominio.

No se ejecuta suite global, build completo ni A2 Full por un PR de Evidence sin cambios runtime. Los controles solicitados y el ledger 001–124 sí se ejecutan materialmente en cada stack. No hay aplicación de migraciones a Supabase real, cambio de permisos, despliegue Replit, datos históricos remotos ni merge.

## Reproducción

Con dependencias instaladas, Docker local y Chromium. Runners integrados/U01f eliminan las credenciales heredadas; el harness genera PostgreSQL, JWT, Auth y gateway propios, restringidos a loopback, y elimina sus containers/red al terminar. U00a también usa credenciales locales generadas y sustituye las referencias de Supabase para su app. No usar credenciales remotas ni importar A2.

```sh
mkdir -p work/p0-u02a
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx script/demo/smokeNewDayIntegration.ts work/p0-u02a/control-u00a
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u01f/run.ts work/p0-u02a/control-u01f
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx docs/evidence/p0-u02a/run.ts work/p0-u02a/integrated-final
node --import tsx docs/evidence/p0-u02a/memory.ts work/p0-u02a/integrated-final/native work/p0-u02a/memory-final
node --import tsx docs/evidence/p0-u02a/capacity.ts work/p0-u02a/integrated-final/native work/p0-u02a/capacity.json
node --import tsx docs/evidence/p0-u02a/supporting.ts work/p0-u02a/memory-final work/p0-u02a/supporting.json
node --import tsx docs/evidence/p0-u02a/predicates.ts work/p0-u02a/integrated-final/native/integrated-memory-input.json work/p0-u02a/predicates.json
npx --no-install tsc -p docs/evidence/p0-u02a/tsconfig.json
node --import tsx --test server/fixedItinerantPhaseComposition.spec.ts server/technicalChainStructure.spec.ts engine/planner-next/integration/nativeJointGroups.spec.ts engine/planner-next/integration/nativeOperationalMeals.spec.ts
python3 docs/evidence/p0-u01f/verify.py work/p0-u02a/control-u01f/native docs/evidence/p0-u01f/native work/p0-u02a/control-u01f-verification.json
node --import tsx docs/evidence/p0-u01f/supporting.ts work/p0-u02a/control-u01f/native work/p0-u02a/control-u01f-supporting.json
python3 docs/evidence/p0-u02a/verify.py
```

Ejecutar los stacks secuencialmente evita cambios de red Docker durante la carga Chromium de otra app. Elegir directorios frescos para los runners. `pack.py` archiva únicamente JSON públicos y capturas seleccionadas; para regenerar la entrega también espera los logs/call paths auxiliares que se enumeran en el script. `verify.py` puede ejecutarse directamente sin servicios sobre los recibos ya publicados.

El runner U02a extrae Git a una copia descartable y superpone sólo fuentes locales enumeradas con hashes. Cambia dispatch del harness y cacheDir de Vite en esa copia para aislar las ejecuciones. Ningún guard productivo o SQL se altera. La ejecución final conserva el código del harness estable mientras se ejecuta el stack. Una ejecución anterior registró sólo un cambio concurrente del script offline `memory.ts`; no fue importado por la app ni por la autoría UI. Esa ejecución se repitió además para capturar la configuración cuando los editores ya estaban cargados. Ninguna de las dos alteró producto.

## Intentos y límites conservados

`attempts.json.gz` conserva:

1. Primer stack integrado: Chromium falla al cargar login con múltiples `net::ERR_NETWORK_CHANGED` mientras terminaban redes Docker de los controles. Ningún payload de autoría se envió. Es un fallo de harness/red, no rechazo de producto. Se repite en stack fresco y secuencial, sin cambiar timeout.
2. Primera autoría integrada: 24 tareas reales, pero la técnica independiente sólo tenía byItem y ninguna unidad/cadena soportada. Tras inyectar las autoridades rechazadas, adapter SUPPORTED pero continuación devuelve `UNSUPPORTED_STANDALONE_TASK_KIND:task:24`, cero ramas. Se configura mediante API oficial una unidad específica B para esa técnica antes de crear las jornadas finales; sigue consumiendo su recurso de sonido independiente y se conservan las 24 obligaciones. No se cambia el kind ni se borra la tarea para conseguir propuesta.
3. El primer arranque offline intentó leer el segundo día antes de terminar su creación; ENOENT de harness. Los runs finales se ejecutan con todos los recibos disponibles. El verificador Python inicialmente comparó bigint SQL serializado como string con IDs numéricos; se normaliza exclusivamente la representación del ID, conservando la igualdad íntegra de recursos.
4. Una captura inicial se realizó inmediatamente después de reload y mostró «Cargando plan». Se repitió el recorrido completo con la captura después de comprobar los botones reales; la entrega usa esas imágenes y sus recibos, sin editar imágenes.
5. El tipado inicial del harness detectó nullability/readonly y una clave diagnóstica duplicada. Se corrigieron tipos, copia de array y el nombre de la clave, sin cambios productivos ni de decisiones.

Los dos positivos integrados son días nuevos con IDs diferentes y mismo perfil físico. La repetición determinista de cada input es offline en el mismo proceso; **no se presenta como repetición fría SQL del integrado**. La otra topología y repetición fría integradas quedan en M para la siguiente implementación. La comprobación U01f sí compara contra sus recibos previos independientes.
