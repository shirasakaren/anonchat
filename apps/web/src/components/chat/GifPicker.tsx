import { useCallback, useEffect, useRef, useState } from "react";
import type { GifResultDto } from "@anonchat/shared";
import { searchGifs } from "../../api/gifs.js";

interface Props {
  providers: { giphy: boolean; klipy: boolean };
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
  /** Rendered inside the composer's Emoji/GIFs tabbed panel: the parent
   *  owns the frame, this keeps only the inner chrome. */
  embedded?: boolean;
}

type Provider = "giphy" | "klipy";

interface PickerState {
  mode: "trending" | "search";
  query: string;
  results: GifResultDto[];
  error: string | null;
  loading: boolean;
}

const EMPTY_STATE: PickerState = {
  mode: "trending",
  query: "",
  results: [],
  error: null,
  loading: false,
};

/**
 * Theme-consistent GIF picker for the composer, backed by the server-side
 * GIPHY/KLIPY proxy (api/gifs.ts) - provider API keys never reach the
 * browser. When both providers are configured the picker aggregates them
 * into one grid (the server queries both and interleaves results, and the
 * search box searches both at once); with a single provider it shows just
 * that one. Selecting a GIF inserts its URL into the message text, where
 * the existing GifEmbed pipeline renders it inline.
 */
export function GifPicker({ providers, onSelect, onClose, embedded = false }: Props) {
  const enabledProviders: Provider[] = [
    ...(providers.giphy ? (["giphy"] as Provider[]) : []),
    ...(providers.klipy ? (["klipy"] as Provider[]) : []),
  ];
  const aggregate = enabledProviders.length > 1;
  const providerForQuery: "giphy" | "klipy" | "all" = aggregate ? "all" : (enabledProviders[0] ?? "giphy");
  const [state, setState] = useState<PickerState>(EMPTY_STATE);
  const [searchDraft, setSearchDraft] = useState("");
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (next: Pick<PickerState, "mode" | "query">) => {
      const requestId = ++requestIdRef.current;
      setState((prev) => ({ ...prev, ...next, loading: true, error: null, results: [] }));
      try {
        const response = await searchGifs({
          provider: providerForQuery,
          mode: next.mode,
          q: next.mode === "search" ? next.query : undefined,
          limit: 24,
        });
        if (requestId !== requestIdRef.current) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          results: response.results,
          error: response.error ?? null,
        }));
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : "The GIF search failed.",
        }));
      }
    },
    [providerForQuery],
  );

  // Load trending on mount. Deliberately not auto-focusing the search box:
  // on a phone that would pop the virtual keyboard the moment the picker
  // opens, which is exactly what the emoji/GIFs panel is there to avoid.
  useEffect(() => {
    void load({ mode: "trending", query: "" });
  }, [load]);

  if (enabledProviders.length === 0) {
    return (
      <div
        className={
          embedded ? "p-4" : "absolute bottom-full left-0 z-30 mb-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-xl"
        }
      >
        <p className="text-sm font-semibold">GIFs are not configured</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          The site owner can add a GIPHY or KLIPY API key in System settings to enable the GIF picker.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 rounded-lg bg-[var(--btn-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
        >
          Close
        </button>
      </div>
    );
  }

  function submitSearch() {
    const query = searchDraft.trim();
    if (!query) return;
    void load({ mode: "search", query });
  }

  const attribution = aggregate
    ? "Powered by GIPHY + KLIPY"
    : `Powered by ${providerForQuery.toUpperCase()}`;

  return (
    <div
      role="dialog"
      aria-label="GIF picker"
      className={
        embedded
          ? "flex w-full flex-col p-3"
          : "absolute bottom-full left-0 z-30 mb-2 flex w-80 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 shadow-xl"
      }
    >
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch();
        }}
      >
        <input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder={aggregate ? "Search GIFs…" : `Search ${providerForQuery.toUpperCase()} GIFs…`}
          aria-label={aggregate ? "Search GIFs" : `Search ${providerForQuery.toUpperCase()} GIFs`}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border-strong)] bg-transparent px-2.5 py-1.5 text-xs"
        />
        <button
          type="submit"
          disabled={!searchDraft.trim()}
          className="rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface-muted)] disabled:opacity-40"
        >
          Search
        </button>
      </form>

      <div className="mt-2 max-h-64 overflow-y-auto">
        {state.loading ? (
          <p className="p-4 text-center text-xs text-[var(--text-muted)]">Loading GIFs…</p>
        ) : state.error ? (
          <p className="p-4 text-center text-xs text-[var(--danger-fg)]" role="alert">
            {state.error}
          </p>
        ) : state.results.length === 0 ? (
          <p className="p-4 text-center text-xs text-[var(--text-muted)]">
            {state.mode === "search" ? "No GIFs found for that search." : "No GIFs available right now."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {state.results.map((gif) => (
              <button
                key={`${providerForQuery}-${gif.id}`}
                type="button"
                onClick={() => onSelect(gif.gifUrl)}
                title="Insert GIF"
                className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--border)] hover:border-[var(--border-strong)]"
              >
                <img
                  src={gif.previewUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-[10px] text-[var(--text-muted)]">
        {attribution} - GIFs insert as a link and render inline when sent.
      </p>
    </div>
  );
}
