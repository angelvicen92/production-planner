# RLS Audit — ID 002

## Objetivo

Auditar y corregir alertas críticas de Supabase Security Advisor relacionadas con RLS en tablas públicas expuestas por PostgREST.

## Resumen

- **Tablas auditadas:** plans, locks, task_templates, plan_summaries, zone_resource_defaults, plan_zone_resource_assignments, resources, resource_availability, zones, resource_item_components, y también verificación contextual de daily_tasks, contestants, spaces, planning_runs.
- **Tablas con RLS activado (en esta migración):** public.plans, public.locks, public.task_templates, public.zone_resource_defaults, public.plan_zone_resource_assignments, public.resources, public.resource_availability, public.zones, public.resource_item_components.
- **Policies añadidas:**
  - zones_read_all_roles, zones_admin_all
  - resources_read_all_roles, resources_admin_all
  - resource_availability_read_all_roles, resource_availability_write_admin_production
  - zone_resource_defaults_read_all_roles, zone_resource_defaults_admin_all
  - plan_zone_resource_assignments_read_all_roles, plan_zone_resource_assignments_write_admin_production
  - resource_item_components_read_all_roles, resource_item_components_admin_all
- **Riesgos residuales:**
  - `public.plan_summaries` depende de permisos sobre tablas base y su comportamiento final debe validarse en entorno Supabase real tras `db push`.
- **Acciones futuras:**
  - Ejecutar `supabase db lint`/`supabase db push` en CI para detectar regresiones RLS automáticamente.

## Tabla de auditoría

| Tabla | RLS antes | Policies antes | Cambio aplicado | Roles permitidos | Motivo |
|---|---|---|---|---|---|
| public.plans | Existía historial de ENABLE, pero Advisor reportaba disabled en runtime | Sí (RBAC en 037) | `ENABLE ROW LEVEL SECURITY` reforzado | admin/prod write, admin/prod/aux/viewer read | Tabla operativa crítica |
| public.locks | Igual que `plans` | Sí (RBAC en 037) | `ENABLE ROW LEVEL SECURITY` reforzado | admin/prod write, admin/prod/aux/viewer read | Bloqueos de planificación |
| public.task_templates | Igual | Sí (admin_all en 037) | `ENABLE ROW LEVEL SECURITY` reforzado | admin full | Catálogo de configuración global |
| public.plan_summaries | N/A (vista) | N/A (vista) | `ALTER VIEW ... security_invoker = true` | hereda RBAC de tablas base | Reducir exposición por contexto de vista |
| public.zone_resource_defaults | Sin RLS/policies explícitas en migración original 014 | No | ENABLE + read all roles + admin all | read: admin/prod/aux/viewer; write: admin | Defaults de configuración por zona |
| public.plan_zone_resource_assignments | Sin RLS/policies explícitas en 014 | No | ENABLE + read all roles + write admin/production | read: admin/prod/aux/viewer; write: admin/prod | Snapshot operativo por plan |
| public.resources | Dependía de policy legacy de lectura amplia | Parcial (legacy read authenticated) | ENABLE + RBAC explícito read/all + admin all | read: admin/prod/aux/viewer; write: admin | Catálogo global |
| public.resource_availability | Dependía de policy legacy | Parcial | ENABLE + read all roles + write admin/production | read: admin/prod/aux/viewer; write: admin/prod | Disponibilidad operativa por plan |
| public.zones | Dependía de policy legacy | Parcial | ENABLE + read all roles + admin all | read: admin/prod/aux/viewer; write: admin | Configuración estructural |
| public.resource_item_components | Sin RLS/policies en 018 | No | ENABLE + read all roles + admin all | read: admin/prod/aux/viewer; write: admin | Catálogo de recursos compuestos |

## Notas sobre vistas SECURITY DEFINER

- `public.plan_summaries` se creó como vista agregada; en este lote se fuerza `security_invoker = true` para evitar comportamientos de ejecución con privilegios elevados y alinear acceso con RLS de tablas base.
- Si en algún entorno concreto la opción no estuviera disponible por versión/configuración, la acción recomendada es mantener la vista sin exponerla directamente por PostgREST y documentar excepción temporal.

## Validación

- `npm run check`
- `npm run test:engine`

Ambos comandos ejecutados en este lote.

## Auditoría de uso real en código (resumen)

- Frontend consume datos vía API Express (`/api/...`), no con consultas SQL directas desde cliente.
- Backend usa `supabaseAdmin` (service role) para operaciones operativas y de configuración; esto bypassa RLS y evita ruptura funcional al activar RLS, mientras protege exposiciones directas en PostgREST.
- Se revisaron rutas activas sobre tablas afectadas en `server/routes.ts`.
