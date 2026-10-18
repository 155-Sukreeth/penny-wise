import { createFullDatabaseSnapshot, restoreFullDatabaseSnapshot, type DatabaseBackupPayload } from "./backupUtils";

const DRIVE_APP_DATA_FOLDER = "appDataFolder";
const BACKUP_FILENAME = "pennywise-database-backup.json";
const GOOGLE_AUTH_SCOPE = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email";

export interface GoogleDriveFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Loads the Google Identity Services (GIS) library dynamically if not present.
 */
export async function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") return;
  if ((window as any).google?.accounts?.oauth2) return;

  return new Promise((resolve, reject) => {
    const existing = document.getElementById("google-gis-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services")));
      return;
    }

    const script = document.createElement("script");
    script.id = "google-gis-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services script. Check your internet connection."));
    document.head.appendChild(script);
  });
}

/**
 * Request OAuth Access Token from user via Google Identity Services.
 */
export async function requestGoogleAccessToken(clientId: string): Promise<{ accessToken: string; email?: string }> {
  if (!clientId || !clientId.trim()) {
    throw new Error("Google OAuth Client ID is required. Please provide a valid Client ID in settings.");
  }

  await loadGoogleIdentityScript();

  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error("Google Identity Services is unavailable. Please check your network connection.");
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: GOOGLE_AUTH_SCOPE,
        callback: async (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }

          const accessToken = response.access_token;
          cachedAccessToken = accessToken;
          tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;

          // Fetch user profile email if available
          let email: string | undefined;
          try {
            const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (userInfoRes.ok) {
              const userInfo = await userInfoRes.json();
              email = userInfo.email;
            }
          } catch {
            // ignore email fetch failure
          }

          resolve({ accessToken, email });
        },
      });

      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Finds the latest backup file in Google Drive AppData folder.
 */
export async function findDriveBackupFile(accessToken: string): Promise<GoogleDriveFileInfo | null> {
  const query = encodeURIComponent(`name = '${BACKUP_FILENAME}' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?spaces=${DRIVE_APP_DATA_FOLDER}&q=${query}&fields=files(id,name,modifiedTime,size)`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to query Google Drive: ${res.statusText} (${errBody})`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0] as GoogleDriveFileInfo;
  }
  return null;
}

/**
 * Uploads or updates the database backup snapshot in Google Drive AppData folder.
 */
export async function uploadBackupToGoogleDrive(accessToken: string): Promise<{ fileId: string; modifiedTime: string }> {
  const snapshot = await createFullDatabaseSnapshot();
  const fileContent = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([fileContent], { type: "application/json" });

  const existingFile = await findDriveBackupFile(accessToken);

  if (existingFile) {
    // Update existing file via PATCH
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
    const res = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: blob,
    });

    if (!res.ok) {
      throw new Error(`Failed to update backup file on Google Drive: ${res.statusText}`);
    }

    const updated = await res.json();
    return {
      fileId: existingFile.id,
      modifiedTime: updated.modifiedTime || new Date().toISOString(),
    };
  } else {
    // Create new file via multipart upload in appDataFolder
    const metadata = {
      name: BACKUP_FILENAME,
      parents: [DRIVE_APP_DATA_FOLDER],
      mimeType: "application/json",
    };

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", blob);

    const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to create backup on Google Drive: ${res.statusText} (${errText})`);
    }

    const created = await res.json();
    return {
      fileId: created.id,
      modifiedTime: created.modifiedTime || new Date().toISOString(),
    };
  }
}

/**
 * Downloads and restores the latest database backup snapshot from Google Drive.
 */
export async function restoreBackupFromGoogleDrive(accessToken: string): Promise<{ restoredCount: number; modifiedTime: string }> {
  const existingFile = await findDriveBackupFile(accessToken);
  if (!existingFile) {
    throw new Error("No existing PennyWise backup found in your Google Drive.");
  }

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`;
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to download backup from Google Drive: ${res.statusText}`);
  }

  const backupData: DatabaseBackupPayload = await res.json();
  const { restoredCount } = await restoreFullDatabaseSnapshot(backupData);

  return {
    restoredCount,
    modifiedTime: existingFile.modifiedTime,
  };
}
