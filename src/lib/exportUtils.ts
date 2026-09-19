import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

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
}

/**
 * Universal file export handler:
 * - Native Mobile App (Capacitor Android / iOS):
 *   Writes file to the app's cache directory via Filesystem and opens the native OS share sheet.
 * - Web / PWA (Desktop & Mobile Browser):
 *   Directly downloads the file to the user's Downloads folder via a Blob URL.
 */
export async function exportFile(options: ExportFileOptions): Promise<ExportResult> {
  const { content, filename, mimeType, dialogTitle = "Export File" } = options;

  try {
    // 1. Native Mobile App (Android / iOS via Capacitor)
    if (Capacitor.isNativePlatform()) {
      const fileResult = await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      try {
        await Share.share({
          title: filename,
          url: fileResult.uri,
          dialogTitle,
        });
        return { success: true, method: "shared" };
      } catch (shareErr) {
        const err = shareErr as Error;
        // User dismissed or cancelled the share dialog
        if (err?.name === "AbortError" || /cancel|dismiss/i.test(err?.message || "")) {
          return { success: false, cancelled: true };
        }
        throw shareErr;
      }
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
