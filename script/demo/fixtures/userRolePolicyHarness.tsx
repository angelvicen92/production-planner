// Browser-only contract probe. HTTP/Auth are intercepted by userRolePolicy.browser.mjs.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../../../client/src/hooks/use-auth';
import { useUserRole, useControlRoomRole } from '../../../client/src/hooks/use-user-role';
import { queryClient } from '../../../client/src/lib/queryClient';
import { apiRequest } from '../../../client/src/lib/api';
import { AssistedAutopilot, type AutopilotApi } from '../../../shared/assistedAutopilot';

function ControlProbe() {
  const role = useControlRoomRole();
  Object.assign(window, { controlRole: { refetch: role.refetch } });
  return <output id="control-policy" data-role={role.role ?? ''} data-status={role.isError ? 'error' : 'confirmed'} />;
}

function Probe() {
  const role = useUserRole();
  const auth = useAuth();
  const [showControl, setShowControl] = useState(false);
  const authorized = useRef(false);
  authorized.current = role.role === 'production' || role.role === 'admin';
  const controller = new AssistedAutopilot(1, {} as AutopilotApi, {
    authorized: () => authorized.current, hasPendingAlerts: () => false, onProgress: () => {},
  });
  Object.assign(window, { rolePolicy: {
    refetch: role.refetch,
    signOut: auth.signOut,
    signIn: auth.signInWithPassword,
    showControl: () => setShowControl(true),
    cache: () => queryClient.getQueriesData({ queryKey: ['/api/me/role'] }),
    // Exercise the controller's real before/after authority guards around HTTP.
    accept: () => Reflect.get(controller, 'call').call(controller, () => apiRequest('POST', '/api/test/accept-stage', {})),
  } });
  return <><output id="policy" data-actor={auth.user?.id ?? ''} data-role={role.role ?? ''}
    data-error={role.error?.name ?? ''} data-status={role.isError ? 'error' : role.isLoading ? 'loading' : 'confirmed'} />{showControl && <ControlProbe />}</>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
