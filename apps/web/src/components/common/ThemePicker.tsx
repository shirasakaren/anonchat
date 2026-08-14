import clsx from "clsx";
import { Check } from "lucide-react";
import { type ThemeMeta, themesByVariant } from "../../themes/index.js";

interface ThemePickerProps {
  /** The currently selected theme id. */
  value: string;
  /** Called when the user picks a theme. */
  onChange: (id: string) => void;
}

/**
 * A theme preview card. `data-theme` is set directly on this card (rather
 * than relying on the page's active theme), so every card renders its own
 * theme's actual colors - themes.css's `[data-theme="x"]` selectors match
 * any element carrying the attribute, not just the document root, so the
 * whole subtree below resolves that theme's CSS variables regardless of
 * what theme the rest of the page is in.
 */
function ThemeCard({ theme, active, onClick }: { theme: ThemeMeta; active: boolean; onClick: () => void }) {
  // Variant is already communicated by the Dark/Light group heading, so
  // repeating it in longer card names adds noise and causes wrapping.
  const displayName = theme.name.replace(/\s+(Dark|Light)$/u, "");

  return (
    <button
      type="button"
      data-theme={theme.id}
      onClick={onClick}
      aria-pressed={active}
      title={theme.name}
      className={clsx(
        "group relative grid aspect-square w-full grid-rows-[3fr_1.75fr_1.25fr] overflow-hidden rounded-2xl border-2 text-left transition",
        active ? "border-[var(--color-accent-500)]" : "border-[var(--border)] hover:border-[var(--color-accent-300)]",
      )}
    >
      {/* Top 3/6 - gradient color preview built from this theme's own palette. */}
      <div
        aria-hidden
        style={{
          background:
            "linear-gradient(135deg, var(--surface) 0%, var(--color-accent-500) 55%, var(--bubble-user) 100%)",
        }}
      />

      {/* Middle 1.75/6 - theme name, anchored bottom-left. */}
      <div
        className="flex min-w-0 items-end justify-start px-3 pb-1"
        style={{ background: "var(--surface-raised)", color: "var(--text)" }}
      >
        <span
          className={clsx(
            "block min-w-0 max-w-full truncate whitespace-nowrap font-semibold leading-none",
            displayName.length > 10 ? "text-xs" : "text-sm",
          )}
        >
          {displayName}
        </span>
      </div>

      {/* Bottom 1.25/6 - solid color swatches, anchored bottom-left. */}
      <div className="flex items-end justify-start gap-1.5 px-3 pb-3" style={{ background: "var(--surface-raised)" }}>
        <span
          className="h-3.5 w-3.5 rounded-full border border-[var(--border)]"
          style={{ background: "var(--color-accent-500)" }}
        />
        <span
          className="h-3.5 w-3.5 rounded-full border border-[var(--border)]"
          style={{ background: "var(--bubble-user)" }}
        />
        <span
          className="h-3.5 w-3.5 rounded-full border border-[var(--border)]"
          style={{ background: "var(--surface-muted)" }}
        />
      </div>

      {active && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--btn-bg)] text-[var(--btn-fg)]">
          <Check size={12} strokeWidth={3} aria-hidden />
        </span>
      )}
    </button>
  );
}

/** A theme-picker grid grouped by dark / light, with large per-card previews. */
export function ThemePicker({ value, onChange }: ThemePickerProps) {
  const groups = themesByVariant();

  return (
    <div className="space-y-6">
      {(["dark", "light"] as const).map((variant) => (
        <div key={variant}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {variant === "dark" ? "Dark themes" : "Light themes"}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {groups[variant].map((t) => (
              <ThemeCard key={t.id} theme={t} active={value === t.id} onClick={() => onChange(t.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
