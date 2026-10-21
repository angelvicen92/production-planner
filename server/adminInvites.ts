import type { Express } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { inviteUserSchema, userAccessStatus } from '../shared/adminInvites';

export function registerAdminInviteRoutes(app: Express, db: SupabaseClient) {
  // Authentication and the ADMIN boundary run in createApiAuthorization first.
  app.post('/api/admin/users/invite', async (req, res) => {
    const parsed = inviteUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: 'INVALID_INVITATION', message: 'Introduce un email válido y un rol autorizado.' });
    const { email, roleKey } = parsed.data;
    let userId: string | undefined;
    let roleReady = false;
    let invitationRequested = false;
    const deliveryUnconfirmed = () => res.status(502).json({ code: 'INVITATION_DELIVERY_UNCONFIRMED', userId, message: 'La cuenta y el rol están preparados, pero no se pudo confirmar el envío de la invitación. Revisa su estado en Usuarios antes de actuar; no vuelvas a crearla.' });
    try {
      const role = await db.from('roles').select('id').eq('key', roleKey).single();
      if (role.error || !role.data?.id) throw new Error('Role unavailable');

      // Atomic duplicate check by Auth. No upsert, invitation or role change on an
      // existing account. A crash before role persistence leaves a banned user.
      const created = await db.auth.admin.createUser({ email, email_confirm: false, ban_duration: '876000h' });
      if (created.error) {
        if (created.error.code === 'email_exists' || created.error.code === 'user_already_exists') {
          return res.status(409).json({ code: 'USER_ALREADY_EXISTS', message: 'Ya existe una cuenta con este email. Revisa su estado y permisos en Usuarios.' });
        }
        throw new Error('Auth create failed');
      }
      userId = created.data.user?.id;
      if (!userId) throw new Error('Auth create returned no user');
      const saved = await db.from('user_roles').insert({ user_id: userId, role_id: role.data.id });
      if (saved.error) throw new Error('Role persistence failed');
      roleReady = true;
      const enabled = await db.auth.admin.updateUserById(userId, { ban_duration: 'none' });
      if (enabled.error) throw new Error('Auth enable failed');

      // Supabase's configured Site URL / redirect allowlist remains authoritative.
      // The SPA handles invite callbacks on any landing route. No client redirect.
      invitationRequested = true;
      const invited = await db.auth.admin.inviteUserByEmail(email);
      if (invited.error || invited.data.user?.id !== userId) {
        return deliveryUnconfirmed();
      }
      const status = userAccessStatus(invited.data.user);
      if (status !== 'invitation_pending' || !invited.data.user.invited_at) {
        return res.status(502).json({ code: 'INVITATION_STATE_UNCONFIRMED', userId, message: 'No se pudo confirmar el estado pendiente de la invitación. Revisa la cuenta en Usuarios.' });
      }
      return res.status(201).json({ userId, email, roleKey, status });
    } catch {
      if (invitationRequested) return deliveryUnconfirmed();
      // Only the new account owned by this request may be cleaned up. Before a
      // role exists it has never been unbanned, even if cleanup itself fails.
      if (userId && !roleReady) {
        try {
          const cleanup = await db.auth.admin.deleteUser(userId);
          if (cleanup.error) throw cleanup.error;
        } catch {
          return res.status(502).json({ code: 'INVITATION_CLEANUP_REQUIRED', userId, message: 'No se preparó la invitación. La cuenta permanece bloqueada y requiere revisión administrativa en Usuarios.' });
        }
      }
      return res.status(502).json({ code: 'INVITATION_PREPARATION_FAILED', ...(userId && roleReady ? { userId } : {}), message: userId && roleReady
        ? 'El rol está guardado, pero no se pudo confirmar la habilitación. No se solicitó el envío. Revisa la cuenta en Usuarios.'
        : 'No se pudo preparar la invitación. No se ha solicitado el envío. Actualiza Usuarios antes de reintentar.' });
    }
  });
}
