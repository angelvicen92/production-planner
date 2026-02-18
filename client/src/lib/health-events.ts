export type ApiHealthSnapshot = {
  status: "ok" | "error" | "aborted";
  durationMs: number;
  at: number;
  message?: string;
};

let lastApiHealth: ApiHealthSnapshot | null = null;
const listeners = new Set<(snapshot: ApiHealthSnapshot) => void>();

export function publishApiHealth(snapshot: ApiHealthSnapshot) {
  lastApiHealth = snapshot;
  listeners.forEach((listener) => listener(snapshot));
}

export function getLastApiHealth() {
  return lastApiHealth;
}

export function subscribeApiHealth(listener: (snapshot: ApiHealthSnapshot) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type RecoveryHandler = () => Promise<void>;

let recoveryHandler: RecoveryHandler | null = null;

export function registerRecoveryHandler(handler: RecoveryHandler | null) {
  recoveryHandler = handler;
}

export async function triggerGlobalRecovery() {
  if (!recoveryHandler) return;
  await recoveryHandler();
}
