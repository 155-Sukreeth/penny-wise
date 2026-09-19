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
 * Universal file export handler for Capacitor Android / iOS and Web / PWA.
 * - On Native platforms: writes to cache and invokes the native OS share sheet (allowing saving to Files, Drive, etc.)
 * - On Web: uses Web Share API if supported, falling back to browser Blob download.
 */
export async function exportFile(options: ExportFileOptions): Promise<ExportResult> {
  const { content, filename, mimeType, dialogTitle = "Export File" } = options;

  try {
    // 1. Native Mobile Platform (Android / iOS via Capacitor)
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
        // Check if user dismissed or cancelled the share dialog
        if (err?.name === "AbortError" || /cancel|dismiss/i.test(err?.message || "")) {
          return { success: false, cancelled: true };
        }
        throw shareErr;
      }
    }

    // 2. Web / PWA - Try Web Share API if file sharing is supported
    if (typeof navigator !== "undefined" && typeof navigator.canShare === "function") {
      try {
        const blob = new Blob([content], { type: mimeType });
        const file = new File([blob], filename, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: filename,
          });
          return { success: true, method: "shared" };
        }
      } catch (webShareErr) {
        const err = webShareErr as Error;
        if (err?.name === "AbortError" || /cancel|dismiss/i.test(err?.message || "")) {
          return { success: false, cancelled: true };
        }
        // Fallback to desktop browser download if web share fails unexpectedly
      }
    }

    // 3. Web / PWA - Fallback to standard browser Blob download
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
