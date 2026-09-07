import type { AppSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { supabase } from "./supabase";

let cachedSettings: AppSettings | null = null;

export async function loadSettings(): Promise<AppSettings> {
  if (cachedSettings) return cachedSettings;

  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .eq("key", "app_settings")
    .maybeSingle();

  if (data?.value) {
    cachedSettings = { ...DEFAULT_SETTINGS, ...(data.value as Partial<AppSettings>) };
  } else {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  return cachedSettings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await supabase
    .from("app_settings")
    .upsert({ key: "app_settings", value: settings as unknown as Record<string, unknown> });
  cachedSettings = settings;
}

export function getCachedSettings(): AppSettings {
  return cachedSettings ?? DEFAULT_SETTINGS;
}

export function clearSettingsCache(): void {
  cachedSettings = null;
}
