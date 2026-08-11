export function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-1 text-xs text-[var(--text-muted)]">
      <span className="flex gap-0.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
      </span>
      {label}
    </div>
  );
}
