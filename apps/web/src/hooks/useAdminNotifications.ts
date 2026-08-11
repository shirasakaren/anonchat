import { useCallback, useEffect, useRef } from "react";

const SOUND_PREF_KEY = "termine.admin.soundEnabled";

export function useAdminNotifications() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
    );
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
