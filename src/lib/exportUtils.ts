import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";

export interface ExportFileOptions {
  content: string;
  filename: string;
  mimeType: string;
  dialogTitle?: string;
}

export interface ExportResult {
  success: boolean;
  method?: "shared" | "downloaded";
  cancelled?: boolean;
  error?: string;
  path?: string;
}

/**
 * Universal file export handler:
 * - Native Mobile App (Capacitor Android / iOS):
 *   Directly saves the file to the user's public Documents directory using Filesystem,
 *   so it downloads directly without triggering the OS share sheet.
 * - Web / PWA (Desktop & Mobile Browser):
 *   Directly downloads the file to the user's Downloads folder via a Blob URL.
 */
export async function exportFile(options: ExportFileOptions): Promise<ExportResult> {
  const { content, filename, mimeType } = options;

  try {
    // 1. Native Mobile App (Android / iOS via Capacitor): Direct file save
    if (Capacitor.isNativePlatform()) {
      try {
        const permStatus = await Filesystem.checkPermissions();
        if (permStatus.publicStorage !== "granted") {
          await Filesystem.requestPermissions();
        }
      } catch {
        // Permissions check is optional on modern scoped storage (Android 11+)
      }

      let fileResult;
      try {
        fileResult = await Filesystem.writeFile({
          path: filename,
          data: content,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });
      } catch (docErr) {
        console.warn("Saving to Documents failed, falling back to External storage:", docErr);
        fileResult = await Filesystem.writeFile({
          path: filename,
          data: content,
          directory: Directory.External,
          encoding: Encoding.UTF8,
          recursive: true,
        });
      }

      return {
        success: true,
        method: "downloaded",
        path: fileResult.uri,
      };
    }

    // 2. Web / PWA: Direct file download to Downloads folder
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    }, 2000);

    return { success: true, method: "downloaded" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown export error";
    console.error("Failed to export file:", err);
    return { success: false, error: message };
  }
}
