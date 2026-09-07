import type { AppSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { db, ensureInitialized } from "./db";

let cachedSettings: AppSettings | null = null;

export async function loadSettings(): Promise<AppSettings> {
  if (cachedSettings) return cachedSettings;

  await ensureInitialized();
  const setting = await db.app_settings.get("app_settings");

  if (setting?.value) {
    cachedSettings = { ...DEFAULT_SETTINGS, ...setting.value };
  } else {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  return cachedSettings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await ensureInitialized();
  await db.app_settings.put({
    key: "app_settings",
    value: settings,
    updated_at: new Date().toISOString(),
  });
  cachedSettings = settings;
}

export function getCachedSettings(): AppSettings {
  return cachedSettings ?? DEFAULT_SETTINGS;
}

export function clearSettingsCache(): void {
  cachedSettings = null;
}
