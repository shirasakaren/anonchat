import clsx from "clsx";
import { THEMES, type ThemeMeta, themesByVariant } from "../../themes/index.js";

interface ThemePickerProps {
  /** The currently selected theme id. */
  value: string;
  /** Called when the user picks a theme. */
  onChange: (id: string) => void;
}

/** Compact theme card — shown in the grid. */
function ThemeCard({ theme, active, onClick }: { theme: ThemeMeta; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group relative flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm transition",
        active
          ? "border-[var(--color-accent-500)] bg-[var(--color-accent-50)]"
          : "border-[var(--border)] hover:border-[var(--color-accent-300)]",
      )}
    >
      {/* Swatch — three circles showing the theme's color palette */}
      <div className="flex gap-1">
        <div
          className="h-3 w-3 rounded-full border border-[var(--border)]"
          style={{ background: "var(--surface-muted)" }}
        />
        <div
          className="h-3 w-3 rounded-full border border-[var(--border)]"
          style={{ background: "var(--color-accent-600)" }}
        />
        <div
          className="h-3 w-3 rounded-full border border-[var(--border)]"
          style={{ background: "var(--bubble-user)" }}
        />
      </div>
      <span className="text-xs font-medium">{theme.name}</span>
      {active && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent-500)] text-[10px] text-white">
          ✓
        </span>
      )}
    </button>
  );
}

/** A theme-picker grid grouped by dark / light. */
export function ThemePicker({ value, onChange }: ThemePickerProps) {
  const groups = themesByVariant();

  return (
    <div className="space-y-5">
      {(["dark", "light"] as const).map((variant) => (
        <div key={variant}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {variant === "dark" ? "Dark themes" : "Light themes"}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {groups[variant].map((t) => (
              <ThemeCard key={t.id} theme={t} active={value === t.id} onClick={() => onChange(t.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
