import { useEffect, useState } from "react";

function computeFocused(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * True only while this tab is both the visible tab AND the OS-focused
 * window - not merely open in some background tab or an unfocused
 * browser window. Read receipts gate on this: a chat sitting open in a
 * background tab must not silently mark the other party's messages
 * "read" the moment they arrive, since nobody is actually looking at them.
 */
export function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(computeFocused);

  useEffect(() => {
    const update = () => setFocused(computeFocused());
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return focused;
}
