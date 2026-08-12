export function FullScreenLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-screen items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}

export function FullScreenError({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-screen items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-lg font-semibold">Something went wrong</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-[var(--btn-bg)] px-4 py-2 text-sm font-medium text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
