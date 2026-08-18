import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import clsx from "clsx";

/** Every toast declares what kind of news it is - the tone drives the icon,
 *  the accent color, and the ARIA role. Defaulting to "error" used to make
 *  every notification show the red exclamation mark, even plain success
 *  confirmations. */
export type ToastTone = "info" | "success" | "warning" | "error" | "loading";

interface ToastInput {
  title: string;
  message?: string;
  tone?: ToastTone;
}

interface ToastItem extends ToastInput {
  id: number;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  loading: Loader2,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const toast = { ...input, id, tone: input.tone ?? "info" };
      setToasts((current) => [...current.slice(-2), toast]);
      window.setTimeout(() => dismiss(id), 6500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-3 z-[80] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:w-[min(24rem,calc(100vw-2rem))]"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const Icon = TONE_ICONS[toast.tone];
          const isNegative = toast.tone === "error" || toast.tone === "warning";
          return (
            <div
              key={toast.id}
              role={isNegative ? "alert" : "status"}
              className={clsx(
                "pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-[var(--surface-raised)] p-3 text-[var(--text)] shadow-xl",
                toast.tone === "error" && "border-[var(--danger-fg)]",
                toast.tone === "warning" && "border-[var(--warning-fg)]",
                toast.tone === "success" && "border-[var(--link-fg)]",
                (toast.tone === "info" || toast.tone === "loading") && "border-[var(--border-strong)]",
              )}
            >
              <Icon
                size={18}
                className={clsx(
                  "mt-0.5 shrink-0",
                  toast.tone === "error" && "text-[var(--danger-fg)]",
                  toast.tone === "warning" && "text-[var(--warning-fg)]",
                  toast.tone === "success" && "text-[var(--link-fg)]",
                  (toast.tone === "info" || toast.tone === "loading") && "text-[var(--text-muted)]",
                  toast.tone === "loading" && "animate-spin",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.message && (
                  <p className="mt-0.5 break-words text-xs text-[var(--text-muted)]">{toast.message}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
