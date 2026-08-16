import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Clock, TimerOff } from "lucide-react";
import type { ConversationRetentionDto, RetentionRequestInput } from "@anonchat/shared";

const DISAPPEARING_OPTIONS: { label: string; seconds: number }[] = [
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
  { label: "90 days", seconds: 7_776_000 },
];

interface Props {
  retention: ConversationRetentionDto;
  /** Whose side is rendering this - the logout/disconnect wording depends
   *  on it, since the triggers act on the visitor's session. */
  who: "USER" | "ADMIN";
  onChange: (patch: RetentionRequestInput) => Promise<void>;
}

/**
 * WhatsApp-style message retention controls, available to both sides of a
 * conversation: disappearing messages with a timeline (optionally also on
 * logout) and automatic chat deletion (on disconnect / after both read /
 * after N days). Every control applies immediately - the icon turns accent
 * colored whenever any retention is active.
 */
export function RetentionPopover({ retention, who, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [daysDraft, setDaysDraft] = useState(String(retention.autoDelete.days ?? 7));
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDaysDraft(String(retention.autoDelete.days ?? 7));
  }, [retention.autoDelete.days]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const active = retention.disappearing.enabled || retention.autoDelete.mode !== "OFF";

  async function apply(patch: RetentionRequestInput) {
    setBusy(true);
    try {
      await onChange(patch);
    } finally {
      setBusy(false);
    }
  }

  const visitorWord = who === "USER" ? "you" : "the visitor";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Disappearing messages and auto-delete"
        aria-label="Disappearing messages and auto-delete"
        className={clsx(
          "rounded-lg p-2 hover:bg-[var(--surface-muted)]",
          active ? "text-[var(--link-fg)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
        )}
      >
        {active ? <Clock size={18} aria-hidden /> : <TimerOff size={18} aria-hidden />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Message retention settings"
          className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xl"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Disappearing messages
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            New messages vanish after the chosen time. Only messages sent after this is enabled expire.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply({ disappearingEnabled: false, disappearingSeconds: null })}
              className={clsx(
                "rounded-full px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                !retention.disappearing.enabled
                  ? "bg-[var(--btn-bg)] font-semibold text-[var(--btn-fg)]"
                  : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              Off
            </button>
            {DISAPPEARING_OPTIONS.map((option) => (
              <button
                key={option.seconds}
                type="button"
                disabled={busy}
                onClick={() =>
                  void apply({ disappearingEnabled: true, disappearingSeconds: option.seconds })
                }
                className={clsx(
                  "rounded-full px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                  retention.disappearing.enabled && retention.disappearing.seconds === option.seconds
                    ? "bg-[var(--btn-bg)] font-semibold text-[var(--btn-fg)]"
                    : "bg-[var(--surface-muted)] text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              disabled={busy}
              checked={retention.disappearing.onLogout}
              onChange={(event) => void apply({ disappearingOnLogout: event.target.checked })}
              className="mt-0.5"
            />
            <span>Also delete the whole conversation when {visitorWord} log{who === "USER" ? "" : "s"} out</span>
          </label>

          <div className="my-3 h-px bg-[var(--border)]" role="separator" />

          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Auto-delete chat</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Automatically delete the chat history under one of these conditions.
          </p>
          <div className="mt-2 flex flex-col gap-1">
            <RetentionOption
              label="Off"
              active={retention.autoDelete.mode === "OFF"}
              disabled={busy}
              onClick={() => void apply({ autoDeleteMode: "OFF" })}
            />
            <RetentionOption
              label={who === "USER" ? "When I disconnect" : "When the visitor disconnects"}
              active={retention.autoDelete.mode === "DISCONNECT"}
              disabled={busy}
              onClick={() => void apply({ autoDeleteMode: "DISCONNECT" })}
            />
            <RetentionOption
              label="After both sides have read"
              active={retention.autoDelete.mode === "BOTH_READ"}
              disabled={busy}
              onClick={() => void apply({ autoDeleteMode: "BOTH_READ" })}
            />
            <div className="flex items-center gap-2">
              <RetentionOption
                label="After"
                active={retention.autoDelete.mode === "AFTER_DAYS"}
                disabled={busy}
                onClick={() => {
                  const days = Math.max(1, Math.min(365, Number(daysDraft) || 7));
                  void apply({ autoDeleteMode: "AFTER_DAYS", autoDeleteDays: days });
                }}
              />
              <input
                type="number"
                min={1}
                max={365}
                value={daysDraft}
                disabled={busy}
                onChange={(event) => setDaysDraft(event.target.value)}
                onBlur={() => {
                  if (retention.autoDelete.mode === "AFTER_DAYS") {
                    const days = Math.max(1, Math.min(365, Number(daysDraft) || 7));
                    void apply({ autoDeleteDays: days });
                  }
                }}
                aria-label="Number of days before auto-delete"
                className="w-16 rounded-md border border-[var(--border-strong)] bg-transparent px-2 py-1 text-xs"
              />
              <span className="text-xs text-[var(--text-muted)]">days</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RetentionOption({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors disabled:opacity-50",
        active ? "bg-[var(--btn-bg)] font-semibold text-[var(--btn-fg)]" : "hover:bg-[var(--surface-muted)]",
      )}
    >
      {label}
    </button>
  );
}
