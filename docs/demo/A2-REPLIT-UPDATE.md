# Actualizar OPTIPLAN desde GitHub

El usuario publica Replit por su procedimiento habitual. Esta entrega no cambia hosting ni despliega. Usar el PR **#1105**, rama **`codex/optiplan-a2-import-demo`**, ya contra `main`; no requiere merge de #1104 ni contiene CP-SAT. `main` todavía no incluye el PR. Comparar el HEAD con el indicado en la entrega y con el PR antes de publicar.

Si el checkout de Replit se actualiza mediante Git:

```sh
git status --short
# Si hay cambios locales, conservarlos antes de cambiar de rama; no reset/clean.
git fetch origin codex/optiplan-a2-import-demo
# Primera vez que se usa esta rama local:
git switch --track origin/codex/optiplan-a2-import-demo
# Si ya existe, usar git switch codex/optiplan-a2-import-demo y git pull --ff-only.
git rev-parse HEAD
npm ci
npm run check
npm run build
```

Publicar con el flujo habitual del usuario. Mantener las variables de Supabase actuales: cliente `VITE_SUPABASE_URL`/anon y servidor `SUPABASE_URL`/anon/service-role, del proyecto **dyqusivzgxebkxkwohwn**. La clave service-role permanece en el servidor. No cambiar defaults ni reloj global para la demo.

Aplicar únicamente las operaciones de base aprobadas, siguiendo [A2-IMPORT-PROCEDURE.md](A2-IMPORT-PROCEDURE.md). La versión vieja de la API tiene un bypass de Auth en debug: no abrir la demo hasta publicar esta versión y verificar sus límites de rol. El cambio de código no aplica SQL automáticamente.

Tras publicar y cargar/verificar A2: login autorizado → jornada **2026-10-30** → 266 pendientes → Planificación asistida → S0 → sugerir/generar/aplicar/validar/aceptar diez etapas. Recargar y repetir la apertura desde otra sesión. Esos pasos no están acreditados hasta ejecutarlos en la URL real.

Para volver atrás, el usuario publica su versión anterior de código. Mantener la nueva jornada y las adiciones de schema; no borrar ni restaurar automáticamente la base compartida. Un rollback de permisos o de datos requiere revisión y aprobación específicas.
