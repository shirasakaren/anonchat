import { useCallback, useEffect, useRef } from "react";

const SOUND_PREF_KEY = "anonchat.admin.soundEnabled";
const NOTIFICATION_SOUND_BASE64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/** The server's CSP only allows `media-src 'self' blob:` (no `data:`), so a
 *  data: URL playing directly gets silently blocked. Decode it to a Blob and
 *  use an object URL instead - that's already permitted. */
function base64WavToBlobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

export function useAdminNotifications() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const url = base64WavToBlobUrl(NOTIFICATION_SOUND_BASE64);
    audioRef.current = new Audio(url);
    return () => URL.revokeObjectURL(url);
  }, []);

  const isSoundEnabled = useCallback(() => localStorage.getItem(SOUND_PREF_KEY) !== "false", []);
  const setSoundEnabled = useCallback((enabled: boolean) => localStorage.setItem(SOUND_PREF_KEY, String(enabled)), []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return "unsupported" as const;
    if (Notification.permission === "granted" || Notification.permission === "denied") return Notification.permission;
    return Notification.requestPermission();
  }, []);

  const notify = useCallback(
    (title: string, body: string) => {
      // Sound plays regardless of tab focus (it's the point of a notification
      // sound); the desktop Notification popup only fires when the tab isn't
      // focused, since showing one while the admin is looking at it is noise.
      if (isSoundEnabled()) {
        audioRef.current?.play().catch(() => {});
      }
      if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
        new Notification(title, { body, icon: "/icon.svg" });
      }
    },
    [isSoundEnabled],
  );

  return { notify, requestPermission, isSoundEnabled, setSoundEnabled };
}
