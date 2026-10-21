import { z } from 'zod';

// The same persisted keys used by authz, user_roles and the existing user editor.
export const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  roleKey: z.enum(['admin', 'production', 'aux', 'viewer']),
}).strict();
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export function userAccessStatus(user: { invited_at?: string | null; email_confirmed_at?: string | null; banned_until?: string | null }) {
  if (user.banned_until && Date.parse(user.banned_until) > Date.now()) return 'blocked' as const;
  if (user.email_confirmed_at) return 'email_confirmed' as const;
  if (user.invited_at) return 'invitation_pending' as const;
  return 'email_unconfirmed' as const;
}
export const userAccessLabels = {
  blocked: 'Acceso bloqueado',
  email_confirmed: 'Email confirmado',
  invitation_pending: 'Invitación pendiente',
  email_unconfirmed: 'Email sin confirmar',
};
