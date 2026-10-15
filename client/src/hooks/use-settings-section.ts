import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/use-auth";
import { settingsSectionKey, settingsSectionChanged, readSettingsSection, writeSettingsSection, clearSettingsSectionMemory, type SettingsSection } from "@/lib/settings-section-preferences";

export function useSettingsSection(section: SettingsSection): [boolean, (open: boolean) => void] {
  const { user } = useAuth();
  const key = user?.id ? settingsSectionKey(user.id, section) : null;
  const subscribe = useCallback((notify: () => void) => {
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        if (key) clearSettingsSectionMemory(key);
        notify();
      }
    };
    window.addEventListener("storage", storage);
    window.addEventListener(settingsSectionChanged, notify);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener(settingsSectionChanged, notify);
    };
  }, [key]);
  const snapshot = useCallback(() => key ? readSettingsSection(key) : true, [key]);
  const open = useSyncExternalStore(subscribe, snapshot, () => true);
  const setOpen = useCallback((value: boolean) => { if (key) writeSettingsSection(key, value); }, [key]);
  return [open, setOpen];
}
