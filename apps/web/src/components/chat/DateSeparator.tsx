export function DateSeparator({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={label} className="flex items-center justify-center py-1">
      <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-[11px] font-medium text-[var(--text-muted)]">
        {label}
      </span>
    </div>
  );
}
