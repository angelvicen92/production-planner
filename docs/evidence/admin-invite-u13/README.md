# U13 — Acceso mediante invitación administrativa

Base autorizada: `d4fe022b92196912e8997e7a9249854808a09de7`. Rama: `codex/admin-invite-only-access-u13`. Una unidad de acceso, sin cambios de Planner, schema, migraciones, RLS, configuración productiva ni despliegue.

## Causa y resultado

- **X:** Usuarios sólo administraba cuentas existentes; Login ofrecía crear cuenta pese al autorregistro desactivado.
- **Y:** faltaba un recorrido privilegiado de alta/invitación y una representación fiable de confirmación. Además, bootstrap podía sustituir un rol existente si el email coincidía con `ADMIN_EMAIL`.
- **Z:** dependencia de operaciones externas, registro fallido y riesgo de alterar el rol preparado.
- **W:** acción ADMIN en el editor actual, endpoint de servidor, preparación bloqueada antes del correo, bootstrap sin sobrescritura y retirada del autorregistro.
- **M:** prueba nativa con PostgreSQL, GoTrue, PostgREST, SMTP capturado y Chromium; los cuatro roles mantienen su asignación al confirmar, establecer contraseña, entrar y ejecutar bootstrap.

Autoridades consultadas: `AGENTS.md`, Fuentes 00 v2.13, 01 v5.2 (roles/producto), 04 v2.7 (autoridad, persistencia y verdad de UI), 07 v2.2 (método/Evidence) y sección 13 de `OPTIPLAN_MASTER_ADECUACION_APP.md`. No se modifican Fuentes oficiales.

## Decisión técnica y fronteras

`POST /api/admin/users/invite` pasa primero por la autenticación existente y `apiRequiredRoles` exige `admin`, también con mayúsculas y barra final de Express. No toma autoridad de metadata, headers de rol ni redirects del cliente. El contrato sólo acepta email y una de las cuatro claves existentes: `admin`, `production`, `aux`, `viewer`.

Secuencia con Supabase Auth Admin y `user_roles` existentes:

1. Validar payload y resolver el rol real.
2. `createUser` con email sin confirmar, sin contraseña compartida y cuenta bloqueada (`ban_duration`). Auth decide duplicados de forma atómica.
3. Insertar el rol; nunca hacer upsert de un usuario existente.
4. Quitar el bloqueo sólo después de persistir el rol.
5. `inviteUserByEmail` para ese mismo email; comprobar ID, `invited_at` y estado pendiente antes de devolver 201.

La compatibilidad de invitar un usuario precreado sin confirmar está **probada** en la versión de GoTrue fijada en el runner, con `DISABLE_SIGNUP=true` y `AUTOCONFIRM=false`. No se afirma haber certificado la versión/configuración alojada de Supabase productivo.

Una caída entre los pasos 2 y 3 deja una cuenta bloqueada. Si falla el rol se intenta eliminar exclusivamente el nuevo ID creado por esa petición; si también falla la limpieza, sigue bloqueado. Si falla habilitación, envío o su confirmación HTTP, se devuelve 502 con estado/revisión administrativa explícitos. Tras persistir el rol no se destruye automáticamente una cuenta cuyo envío podría haber sido aceptado. Una respuesta perdida después de enviar realmente el correo también devuelve fallo parcial; nunca éxito ficticio. Una notificación fallida no equivale a revocación: la cuenta puede tener el rol autorizado y usar un enlace de acceso/recuperación si Auth lo permite.

Los duplicados existentes devuelven 409 sin modificar rol ni enviar correo. En una carrera, GoTrue puede devolver un error interno al segundo `createUser`; se conserva como 502 de preparación incierta, sin adivinar un conflicto ni repetir operaciones. La prueba exige exactamente un éxito, un solo correo y el rol del ganador intacto.

El bootstrap conserva siempre un `role_id` existente, incluso si coincide con `ADMIN_EMAIL`; inserta únicamente si falta y tolera conflicto concurrente sin sobrescribir. No devuelve un rol inventado si no puede confirmar la asignación. Se conserva la inicialización histórica para cuentas sin rol.

La UI reutiliza la tabla y el editor actual de vínculos con staff/recursos. Separa cambios pendientes de acceso: bloqueado, email sin confirmar, invitación pendiente y email confirmado. Una cuenta sin rol muestra «Sin rol asignado». Confirmación de email no se presenta como prueba de login. El cliente no contiene `service_role`.

Login conserva contraseña, enlaces para cuentas existentes (`shouldCreateUser:false`) y recuperación. El callback se captura antes de que Supabase consuma el hash; invitación y recuperación muestran la pantalla de contraseña incluso si la Site URL aterriza en `/dashboard` o la raíz. Se reutilizan la Site URL y allowlist configuradas en Auth; no se añade configuración ni redirect arbitrario del cliente.

## Reproducción

Requisitos: Node 20+, Docker local disponible, Chromium y dependencias npm del lockfile. El runner genera sus claves y contraseñas locales; sobrescribe los destinos de Supabase del hijo y rechaza destinos remotos. Sólo usa emails `example.test`, SMTP Mailpit y contenedores/red nuevos que elimina al finalizar. No lee credenciales productivas para hacer pruebas.

```sh
npm ci
npm run check
npm run check:migrations
npx --no-install tsc -p script/demo/tsconfig.admin-invites.json
node --import tsx --test server/adminInvites.spec.ts server/apiAuthorization.spec.ts server/catalogAuthorization.spec.ts
npx --no-install playwright install --with-deps chromium
node --import tsx script/demo/smokeAdminInvites.ts work/admin-invites
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=disposable-build-anon npm run build
```

Para usar Chromium del sistema: `ADMIN_INVITE_CHROMIUM_PATH=/usr/bin/chromium` en el comando del runner. Para repetir sólo el gate previo de compatibilidad: añadir `--compatibility-only`.

CI nueva: `Admin Invites CI`, sin ejecutar el solver en este gate. La CI baseline existente mantiene TypeScript/build. El runner aplica el ledger completo e inalterado de migraciones a una DB nueva.

## Evidence y límites

- [integration.json](integration.json): imágenes fijadas, hashes del ledger, comprobaciones nativas, concurrencia y resultado.
- [browser.json](browser.json): navegador real, sin interceptar HTTP del navegador, sin errores JS.
- [validation.json](validation.json): checks locales y hashes de los archivos de esta unidad.
- [invitation-pending.png](invitation-pending.png), [invitation-duplicate.png](invitation-duplicate.png), [login-recovery.png](login-recovery.png): estados visibles sobre datos descartables.

La inyección de fallos está exclusivamente en el gateway del runner (escritura Auth, habilitación, limpieza, envío y pérdida de respuesta) y un trigger SQL temporal en la DB descartable (fallo de rol). La caída SMTP también se prueba deteniendo Mailpit. El producto no incorpora hooks de fallo. No se publican logs privados, tokens, contraseñas, enlaces de activación ni cuerpos de correo.

No se certifican entregabilidad de correo real, plantillas/redirecciones del Supabase alojado, Realtime ni Replit publicado. No se añade reenvío, revocación, reparación automática, framework de identidad ni otro editor de usuarios. Las cuentas parciales requieren revisión administrativa con los mecanismos existentes; no se reinterpretan como invitaciones reenviables. No hubo invitaciones a personas reales, cambios productivos, despliegue ni merge.
