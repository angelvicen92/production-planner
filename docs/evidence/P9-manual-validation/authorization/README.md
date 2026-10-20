# P9 — cierre de autorización de excepciones HARD

Auditoría inicial: `b5ce969f42c5078d4d61a770fa25ac0b23b3e1c8`.
Main integrado: `e479c0695800cf78059a91d5f78beaeb3d1ad0d2` (incluye P8).
Se continúa exclusivamente el PR #1157.

## Causa demostrada

**X.** La [traza nativa anterior](../native.json) registra una nueva excepción
`TRANSPORT_GROUPING_VIOLATION`, cuatro IN con máximo tres, aceptada con HTTP 200
por `production`. Su `lifecycle.acceptedException.actorRole` conserva esa prueba;
no se reescribe el ensayo histórico como si hubiera usado admin.

**Y.** El middleware consultaba el rol vigente, pero ambos roles `admin` y
`production` podían escribir en Assisted. `accept` remitía directamente la
confirmación al RPC. No existía un permiso nominal para distinguir al jefe de
Producción de otro operador. La UI calculaba la confirmación con `hardCount` y
`requiredCount` totales, incluyendo excepciones heredadas intactas.

**Z.** Un operador ordinario podía aprobar una decisión crítica y la herencia
intacta podía pedir una autorización redundante. La regresión del servicio se
ejecutó roja antes de implementar la restricción: [log](red-authorization.log).

## Contrato de cierre

**W.** Hasta disponer de delegación nominal, las HARD **nuevas** necesitan admin.
La delegación a un jefe de Producción no administrador queda pendiente de otra
unidad; este PR no crea permisos, roles ni jerarquías nuevos.

El servicio relee `user_roles -> roles.key` mediante `getUserRole`, inmediatamente
antes de invocar el RPC privilegiado. La identidad del actor procede de
`getUser(token)` en Auth, no del cuerpo HTTP. Se comprueban también los roles de
escritura cuando se invoca el servicio directamente.

Un actor sin admin no puede enviar `HARD_EXCEPTIONS`, incluso sobre un reporte
limpio. Esto evita preautorizar un conflicto si la validación cambia durante la
petición: el RPC vuelve a verificar la sesión bloqueada y exige esa confirmación
para una HARD nueva. Producción conserva `NONE` para herencia intacta y
`REQUIRED_DEVIATIONS` para nuevas REQUIRED. Los checks transaccionales de
fingerprint, base, configuración, identidad y concurrencia permanecen activos.

| Reporte vigente | Producción | Admin |
|---|---|---|
| Sin nuevas HARD/REQUIRED | Acepta con `NONE` | Acepta con `NONE` |
| Nueva REQUIRED, ninguna HARD nueva | Confirma `REQUIRED_DEVIATIONS` | Igual |
| HARD heredada materialmente intacta | Acepta con `NONE`, conserva indicador crítico | Igual |
| Nueva HARD o miembro afectado modificado | 403, ninguna escritura | Confirmación detallada `HARD_EXCEPTIONS` |
| Reporte obsoleto | Revalidar; RPC rechaza | Igual |

La UI usa `newHardCount/newRequiredCount`, con fallback conservador a totales
para reportes anteriores. Deshabilita la aceptación de nuevas HARD y muestra
un aviso de autorización administrativa. La confirmación
admin identifica regla, participantes/espacios, horarios y antes/después; explica
que aceptar conserva la infracción y el indicador crítico. `hardValid=false`
permanece en la Stage con HARD. La herencia no abre un nuevo diálogo.

## Frontera completa de autorización

`Auth.getUser -> middleware (rol actual) -> POST accept-stage -> servicio
(rol actual) -> assisted_accept_stage -> AcceptedException + Stage + daily_tasks`.

El RPC tiene una sola firma vigente y `EXECUTE` reservado a `service_role`.
El ensayo realiza llamadas REST directas con identidades admin, production,
viewer, aux y sin rol, incluso suplantando `p_user_id=admin`: todas reciben 403.
También comprueba sus privilegios efectivos en PostgreSQL. Los clientes no
pueden escribir Stage/Draft/excepciones ni fabricar validaciones certificadas.
Aplicar una propuesta sólo modifica el Draft; el motor sigue rechazando nuevas
HARD/REQUIRED. Rollback/redo restauran decisiones históricas, sin crear una nueva
excepción. Los endpoints ordinarios de edición conservan sus permisos.

Los cuerpos de aceptación con campos de suplantación o confirmaciones fuera del
contrato se rechazan antes del servicio. Un fallo de esquema devuelve 400 con
mensaje operativo, sin divulgar el cuerpo técnico ni devolver un 500 engañoso.

## Prueba nativa y contratos

El gate principal construye desde cero las once etapas y las 266 obligaciones.
Luego prueba los permisos y decisiones sobre ese planning. Un segundo ensayo
crea otra base local con la policy REQUIRED desde el INSERT inicial del día.
Su Draft completo procede de la geometría generada en el primero, declarada
explícitamente como fixture **no certificada**; no se siembran validaciones,
excepciones, etapas aceptadas adicionales ni horarios en `daily_tasks`.
Validación HTTP real y confirmación en Chromium producen la decisión REQUIRED.
Se conserva la inmutabilidad de 088 y no se modifica ninguna migración.

| Gate solicitado | Evidencia |
|---|---|
| Admin acepta HARD nueva | HTTP 200, actor admin, clave/fingerprint/configuración exactos |
| Production intenta HARD nueva | 403 con NONE, REQUIRED o HARD; estado material idéntico |
| Viewer/aux/sin rol | 403, sin escrituras |
| Production valida y acepta movimiento válido | 200, 266 filas consolidadas y rollback exacto |
| Production acepta REQUIRED | Consentimiento UI, 200 y auditoría production en segunda base |
| Herencia HARD intacta | Producción envía NONE, cero diálogos y ninguna excepción duplicada |
| Cambio de miembro afectado | Nueva HARD, 403 producción, nueva aprobación admin y SUPERSEDED |
| Rol revocado después de validar | Production→viewer y admin→production: 403 con el mismo token Auth |
| Confirmación/actor manipulados y RPC directo | 403/400 según contrato, ninguna escritura |
| P2B/P3, identidad y lineage P8 | Regresiones focales y CI completa del mismo PR |

Comandos reproducibles:

```sh
npm run demo:a2:smoke -- work/manual-draft-validation --full --manual-validation
npm run demo:a2:smoke -- work/manual-required --manual-required-replay=work/manual-draft-validation/manual-validation-baseline.json
```

`native.json`, `required.json` y `validation.json` conservan trazas, auditoría y
resultados locales. Las integraciones completas se preservan comprimidas; no
incluyen logs privados del servidor ni credenciales. La descripción del PR
enlaza la CI final sobre el head publicado, incluyendo Planner Engine, P8 y P9.

Capturas del workspace: [aviso a Producción](admin-required.png),
[reporte de cuatro IN](four-in-report.png), [HARD aceptada por admin](accepted-hard.png),
[REQUIRED aceptada por Producción](required-accepted.png), [regla no certificable](unsupported.png).

## Revisión de fixture pública

La autorización expresa para la fixture 27003 sigue vigente. Se inspeccionaron
los JSON descomprimidos y todos los textos P9: no se encontraron passwords,
tokens, claves privadas, correos ni datos de contacto/cuentas reales. Los
concursantes son etiquetas C01–C19. Se mantienen etiquetas e identificadores
operativos A2 presentes en las autoridades firmadas, incluidos los nombres de
policies de comidas y catálogo: cambiarlos rompería la reconstrucción exacta de
configuración y snapshot. No se añaden datos personales ajenos a esas autoridades.
Las capturas nuevas contienen sólo el workspace y excluyen la cuenta sintética
del menú lateral. El [informe de revisión](fixture-review.json) registra hashes y
la consecuencia que tendría cambiar esas identidades. Las dos huellas históricas
de la fixture permanecen intactas.

No hay escrituras ni migraciones en Supabase real. No se cambia el solver,
presupuestos, heurísticas ni reglas de validación de transporte. P8 conserva su
numeración por lineage. El PR queda abierto; no se realiza merge ni despliegue.
