const CLIENT_ID_KEY = "netpnl_client_id";
let memoryId = "";

/**
 * Returns a persistent anonymous client ID for visitors who haven't logged in.
 * Enables guests to react with emojis, untoggle their reactions, etc.
 * Completely safe against SSR, blocked localStorage, or private browsing modes.
 */
export function getClientId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    let id = window.localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 10);
      id = `anon_${timestamp}_${random}`;
      try {
        window.localStorage.setItem(CLIENT_ID_KEY, id);
      } catch {
        // Ignore quota/storage write errors
      }
    }
    return id;
  } catch {
    // If localStorage access is denied or throws a SecurityError
    if (!memoryId) {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 10);
      memoryId = `anon_${timestamp}_${random}`;
    }
    return memoryId;
  }
}
