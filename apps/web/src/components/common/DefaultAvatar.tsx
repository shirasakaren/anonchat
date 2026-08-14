/**
 * Fallback shown wherever the site owner hasn't uploaded/imported a real
 * avatar - a plain initial on the theme's own accent color (same tokens as
 * the primary button), so it always matches the active theme instead of
 * showing nothing. There's only ever one site owner identity here (unlike
 * Slack/Discord's per-teammate color hashing), so a single themed color is
 * enough - no need to hash a color per name.
 */
export function DefaultAvatar({ name, className }: { name: string; className?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--btn-bg)] font-semibold text-[var(--btn-fg)] ${className ?? ""}`}
      aria-hidden
    >
      {initial}
    </div>
  );
}
