import { Capacitor } from "@capacitor/core";
import { createFullDatabaseSnapshot, restoreFullDatabaseSnapshot, type DatabaseBackupPayload } from "./backupUtils";

const DRIVE_APP_DATA_FOLDER = "appDataFolder";
const BACKUP_FILENAME = "pennywise-database-backup.json";
export const GOOGLE_AUTH_SCOPE = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email";
export const OAUTH_REDIRECT_URI = "https://penny-wise-one-liard.vercel.app/oauth/callback";

export interface GoogleDriveFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Returns the effective Google OAuth Client ID, checking:
 * 1. Explicit custom Client ID passed from settings
 * 2. Pre-configured build environment variable VITE_GOOGLE_CLIENT_ID
 */
export function getGoogleClientId(customClientId?: string): string {
  return (
    customClientId?.trim() ||
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string)?.trim() ||
    ""
  );
}

/**
 * Checks whether a Google OAuth Client ID is available (either via env or custom input).
 */
export function isGoogleConfigured(customClientId?: string): boolean {
  return !!getGoogleClientId(customClientId);
}

/**
 * Clears the active in-memory session.
 */
export function clearGoogleDriveSession(): void {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
  try {
    sessionStorage.removeItem("google_drive_access_token");
    sessionStorage.removeItem("google_drive_token_expires");
    localStorage.removeItem("google_pkce_verifier");
    localStorage.removeItem("google_pkce_client_id");
  } catch {
    // ignore
  }
}

/**
 * Helper to generate cryptographically random URL-safe string for PKCE.
 */
function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((x) => chars[x % chars.length])
    .join("");
}

/**
 * Generates SHA-256 hash for PKCE challenge.
 */
async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest("SHA-256", data);
}

/**
 * Base64-URL encoder for array buffer.
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Starts standard OAuth 2.0 PKCE flow in the Android system browser / Custom Tab.
 */
export async function startNativeGoogleOAuth(clientId?: string): Promise<void> {
  const resolvedClientId = getGoogleClientId(clientId);
  if (!resolvedClientId) {
    throw new Error("Google OAuth Client ID is not configured. Please provide a Client ID in settings.");
  }

  const verifier = generateRandomString(64);
  const challengeBuffer = await sha256(verifier);
  const challenge = base64UrlEncode(challengeBuffer);

  try {
    localStorage.setItem("google_pkce_verifier", verifier);
    localStorage.setItem("google_pkce_client_id", resolvedClientId);
  } catch {
    // ignore storage errors
  }

  const params = new URLSearchParams({
    client_id: resolvedClientId,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_AUTH_SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    access_type: "offline",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  window.open(authUrl, "_system");
}

/**
 * Handles the OAuth authorization code exchange with Google after redirect back to the app.
 */
export async function handleOAuthCallback(code: string): Promise<{ accessToken: string; email?: string }> {
  const verifier = localStorage.getItem("google_pkce_verifier");
  const clientId = localStorage.getItem("google_pkce_client_id") || getGoogleClientId();

  if (!verifier) {
    throw new Error("Missing PKCE verifier. Please try connecting your Google Account again.");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: OAUTH_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${errText}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  cachedAccessToken = accessToken;
  tokenExpiresAt = Date.now() + (Number(tokenData.expires_in) || 3600) * 1000;

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
    // ignore
  }

  try {
    localStorage.removeItem("google_pkce_verifier");
  } catch {
    // ignore
  }

  return { accessToken, email };
}

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
 * Request OAuth Access Token from user.
 * On Native Android: Uses Native Browser / Custom Tab OAuth with PKCE.
 * On Web/PWA: Uses Google Identity Services (GIS) token client.
 */
export async function requestGoogleAccessToken(customClientId?: string): Promise<{ accessToken: string; email?: string }> {
  // If we already have a valid unexpired token, reuse it
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return { accessToken: cachedAccessToken };
  }

  const clientId = getGoogleClientId(customClientId);
  if (!clientId) {
    throw new Error(
      "Google OAuth Client ID is not configured. Please add VITE_GOOGLE_CLIENT_ID to your environment or enter a Client ID in settings."
    );
  }

  // Native Android Handler
  if (Capacitor.isNativePlatform()) {
    await startNativeGoogleOAuth(clientId);
    return new Promise((_, reject) => {
      // Flow continues in system browser; user is redirected back to app
      reject(new Error("Please complete sign-in in your browser window."));
    });
  }

  // Web / PWA Handler
  await loadGoogleIdentityScript();

  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error("Google Identity Services is unavailable. Please check your network connection.");
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
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
