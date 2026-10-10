# OPTIPLAN — A2 operativo para demostración

La entrega principal es el PR [#1105](https://github.com/angelvicen92/production-planner/pull/1105), preparado contra `main`, con carga independiente en el Supabase de pruebas **planificador_audiovisual / dyqusivzgxebkxkwohwn**. El usuario publica Replit. **La carga y el recorrido remoto siguen pendientes de autorización específica y ejecución.**

El importador contiene C01–C19 y 266 obligaciones pendientes, 23 espacios/zonas, nueve recursos y el canon completo: coaches, horarios, disponibilidades, dependencias, setup, rondas, cadenas técnicas, itinerancia, comidas, transporte y continuidad. Inserta la nueva jornada sin escribir en defaults globales ni modificar las jornadas existentes. El planificador calcula la solución desde S0 en la aplicación; el import no incluye resultados.

El [procedimiento operativo](A2-IMPORT-PROCEDURE.md) contiene preparación, backup, adopción del drift, permisos, preflight, carga, verificación, publicación y recovery. La [propuesta de seguridad](A2-MIGRATIONS-SECURITY.md) incluye matriz de roles, tests y rollback.

## Evidencia y límites

La consulta REST real confirma cuatro jornadas, 47 concursantes, 333 tareas y 278 runs. Detecta drift adicional a 086–088: faltan snapshots operativos de 076. Anon puede leer datos de tres tablas comprobadas. No se ha escrito en Supabase. Los catálogos PostgreSQL completos, el backup y la matriz remota de roles siguen pendientes de acceso SQL y ejecución por el operador autorizado.

Las pruebas locales verifican una base poblada con cuatro jornadas, defaults distintos del A2, snapshots v1, equivalencia canónica, colisiones, secuencias adelantadas y rollback tardío. El RPC real de bootstrap crea S0 con todas las tareas y rechaza staleness de recursos. La proyección de configuración ahora permite campos opcionales de recursos ausentes sin relajar la canonicalización de datos obligatorios.

Los dos recorridos previos con filas reconstruidas tras cada aceptación dieron 266/266 en diez etapas, cero nuevas violaciones HARD/REQUIRED, igualdad literal de protecciones y 20 auditorías de cierre completas. S1 fue 69,292/71,620 s en este entorno. Los resultados del nuevo importador se registran en `A2-EXISTING-DELIVERY-EVIDENCE.json`. Se conserva en la evidencia histórica el ensayo anterior de S1=143,495 s que falló el gate de 120 s; los tiempos locales no garantizan la latencia de Replit. El presupuesto productivo permanece en 100.000 ramas/300 s.

No se integran CP-SAT ni los scripts experimentales de ASST-010. El recorrido alternativo ASST-010 S2 continúa sin solución validada; no es parte del guion de esta demo. Su investigación permanece en los PR históricos #1104/#1106.

## Recorrido a demostrar

Login con rol autorizado → jornada 2026-10-30 → 266 obligaciones pendientes → Planificación asistida → S0. En cada etapa: sugerir alcance, revisar, generar, aplicar, validar y aceptar. Los acumulados esperados son 19, 38, 46, 65, 75, 111, 169, 207, 209 y 266. El humano decide la aceptación; no se importan etapas ni se inyectan witnesses externos.

Recorrer concursantes, espacios y recursos, comidas y las 51 tareas de CAM1 sin solapamientos. Recargar y abrir desde otra sesión autorizada. Solo después de realizar estos pasos contra la aplicación y Supabase reales se puede declarar lista la demo publicada.

## Respaldo de reproducción

```sh
npm run demo:a2:record
npm run demo:a2
```

Abrir `http://127.0.0.1:4173`. La reproducción indica su modo y permite inspeccionar etapas, timeline y una copia de revisión con validación local. No usa Supabase ni simula generación en vivo. Puede exportarse con `npm run demo:a2:build`. Es un respaldo para presentación, separado del gate remoto pendiente.
