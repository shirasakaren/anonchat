import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Clock, TimerOff } from "lucide-react";
import type { ConversationRetentionDto, RetentionRequestInput } from "@anonchat/shared";

const DISAPPEARING_OPTIONS: { label: string; seconds: number }[] = [
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
  { label: "90 days", seconds: 7_776_000 },
];

interface Props {
  retention: ConversationRetentionDto;
  /** Whose side is rendering this - the logout wording depends on it. */
  who: "USER" | "ADMIN";
  onChange: (patch: RetentionRequestInput) => Promise<void>;
}

/**
 * WhatsApp-style disappearing messages, available to both sides of a
 * conversation: the setting is conversation-wide, so a visitor's choice
 * applies to the admin's side too and either participant can change it.
 * A single dropdown keeps the choice to Off / 24 hours / 7 days / 90 days.
 *
 * Desktop renders it as the familiar popover under the trigger; mobile
 * renders the same panel as a centered popup (same pattern as the share-
 * diagnostics dialog) so it can never run off the edge of the screen.
 */
export function RetentionPopover({ retention, who, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setChoicesOpen(false);
      return;
    }
    function handlePointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (choicesOpen) setChoicesOpen(false);
        else setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, choicesOpen]);

  const active = retention.disappearing.enabled;

  async function apply(patch: RetentionRequestInput) {
    setBusy(true);
    try {
      await onChange(patch);
    } finally {
      setBusy(false);
    }
  }

  const visitorWord = who === "USER" ? "you" : "the visitor";
  const selectedLabel = retention.disappearing.enabled
    ? (DISAPPEARING_OPTIONS.find((option) => option.seconds === retention.disappearing.seconds)?.label ?? "…")
    : "Off";

  function pickDisappearing(value: "off" | number) {
    setChoicesOpen(false);
    if (value === "off") void apply({ disappearingEnabled: false, disappearingSeconds: null });
    else void apply({ disappearingEnabled: true, disappearingSeconds: value });
  }

  return (
    <div ref={wrapperRef} className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Disappearing messages"
        aria-label="Disappearing messages"
        className={clsx(
          "rounded-lg p-2 hover:bg-[var(--surface-muted)]",
          active ? "text-[var(--link-fg)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
        )}
      >
        {active ? <Clock size={18} aria-hidden /> : <TimerOff size={18} aria-hidden />}
      </button>

      {open && (
        <div
          // On mobile this is a fixed, centered popup with a dimmed
          // backdrop (matching the share-diagnostics dialog); from the md
          // breakpoint the same tree becomes an ordinary anchored popover.
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 md:static md:inset-auto md:z-auto md:block md:bg-transparent md:p-0"
          onMouseDown={() => setOpen(false)}
          role="presentation"
        >
          <section
            role="dialog"
            aria-label="Disappearing messages settings"
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xl md:absolute md:right-0 md:top-full md:mt-2 md:w-80"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Disappearing messages
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              New messages from either side vanish after the chosen time. Only messages sent after this is enabled
              expire.
            </p>
            {/* Custom dropdown instead of a native <select>: on some desktop
                browsers the native popup's own events escape the panel's
                click handling and dismiss it, so opening the choices closed
                the whole popover. A controlled list has no native popup to
                leak events. */}
            <button
              type="button"
              disabled={busy}
              aria-haspopup="listbox"
              aria-expanded={choicesOpen}
              aria-label="Disappearing messages timer"
              onClick={() => setChoicesOpen((value) => !value)}
              className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border-strong)] px-2.5 py-2 text-sm text-[var(--text)] disabled:opacity-50"
            >
              <span>{selectedLabel}</span>
              <ChevronDown
                size={16}
                aria-hidden
                className={`shrink-0 transition-transform ${choicesOpen ? "rotate-180" : ""}`}
              />
            </button>
            {choicesOpen && (
              <ul
                role="listbox"
                aria-label="Disappearing messages timer choices"
                className="mt-1 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] py-1 shadow-lg"
              >
                <DropdownChoice
                  label="Off"
                  selected={!retention.disappearing.enabled}
                  onClick={() => pickDisappearing("off")}
                />
                {DISAPPEARING_OPTIONS.map((option) => (
                  <DropdownChoice
                    key={option.seconds}
                    label={option.label}
                    selected={retention.disappearing.enabled && retention.disappearing.seconds === option.seconds}
                    onClick={() => pickDisappearing(option.seconds)}
                  />
                ))}
              </ul>
            )}
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
          </section>
        </div>
      )}
    </div>
  );
}

function DropdownChoice({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onClick}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-muted)]"
      >
        <span className={selected ? "font-semibold" : ""}>{label}</span>
        {selected && <Check size={14} aria-hidden className="text-[var(--link-fg)]" />}
      </button>
    </li>
  );
}
