# OPTIPLAN — A2 operativo para demostración

La entrega principal es el PR [#1105](https://github.com/angelvicen92/production-planner/pull/1105), preparado contra `main`, con carga independiente en el Supabase de pruebas **planificador_audiovisual / dyqusivzgxebkxkwohwn**. El usuario publica Replit. **La carga y el recorrido remoto siguen pendientes de autorización específica y ejecución.**

El importador contiene C01–C19 y 266 obligaciones pendientes, 23 espacios/zonas, nueve recursos y el canon completo: coaches, horarios, disponibilidades, dependencias, setup, rondas, cadenas técnicas, itinerancia, comidas, transporte y continuidad. Inserta la nueva jornada sin escribir en defaults globales ni modificar las jornadas existentes. El planificador calcula la solución desde S0 en la aplicación; el import no incluye resultados.

El [procedimiento operativo](A2-IMPORT-PROCEDURE.md) contiene preparación, backup, adopción del drift, permisos, preflight, carga, verificación, publicación y recovery. La [propuesta de seguridad](A2-MIGRATIONS-SECURITY.md) incluye matriz de roles, tests y rollback.

## Evidencia y límites

El recorrido completo se ha ensayado en la aplicación productiva sobre PostgreSQL, GoTrue y PostgREST locales reales: login, S0, diez propuestas/aplicaciones/validaciones/aceptaciones, persistencia, recarga, protecciones, segunda sesión y rollback/redo. Resultado: 266/266, cero HARD/REQUIRED y cierre canónico independiente en cada etapa. [Evidence vigente](A2-ASSISTED-INTEGRATION-EVIDENCE.json) y [guía de reproducción / smoke remoto](A2-ASSISTED-INTEGRATION.md).

El usuario confirma el catálogo original exportado y el backup restaurado correctamente en Supabase PostgreSQL 17.6.1.063, con cuatro jornadas, 47 concursantes, 333 tareas y 278 runs. Estos archivos no están disponibles aquí para contrastarlos. El ensayo nativo usa PostgreSQL 17.11 con el ledger fresco hasta 089; las pruebas de adopción y conservación sobre una base poblada son independientes. Falta ensayar la adopción sobre el catálogo y backup originales.

Dos referencias actuales de servicios dan 266/266 y el mismo fingerprint `a797ee88…`, con S1 de 67,469 / 70,968 s. Corregir la identidad por contenido de preparaciones/witnesses cambia horarios todavía no aceptados frente a la referencia histórica; las protecciones se conservan. La causa y ambas referencias se documentan en Evidence. El presupuesto productivo sigue en 100.000 ramas/300 s; los tiempos locales no garantizan la latencia de Replit y se conserva el ensayo histórico que superó 120 s.

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
