import { useMemo, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { EMOJI_CATEGORIES, EMOJI_LIST, type EmojiEntry } from "./emojiData.js";

/** One representative emoji per category, used as its tab icon instead of a
 *  generic pictogram set - keeps this picker's only visual assets the
 *  dataset itself, nothing hand-drawn to keep in sync with it. */
const CATEGORY_TAB_ICON: Record<string, string> = {};
for (const entry of EMOJI_LIST) {
  if (!(entry.category in CATEGORY_TAB_ICON)) CATEGORY_TAB_ICON[entry.category] = entry.emoji;
}

const SEARCH_RESULT_LIMIT = 200;

interface Props {
  onSelect: (emoji: string) => void;
  /** Optional: closes on Escape when provided - the two call sites
   *  (Composer's own button, the reaction overlay's "more") each already
   *  dismiss on outside click themselves, this just adds the keyboard path. */
  onClose?: () => void;
  /** Rendered inside the composer's Emoji/GIFs tabbed panel: the parent
   *  owns the frame, this keeps only the inner chrome. */
  embedded?: boolean;
}

/**
 * A ground-up emoji picker (not emoji-picker-react, which this replaces)
 * over the full dataset in emojiData.ts - every emoji it lists is
 * selectable here, nothing trimmed for size. Styled entirely with this
 * app's own CSS custom properties (--surface-raised, --border, --text,
 * ...) so it automatically matches whichever of the 25 themes is active,
 * unlike emoji-picker-react's own binary light/dark Theme prop which had
 * no way to track a themed accent palette.
 */
export function EmojiPicker({ onSelect, onClose, embedded = false }: Props) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0]!.id);

  const query = search.trim().toLowerCase();

  const results: EmojiEntry[] = useMemo(() => {
    if (!query) return EMOJI_LIST.filter((e) => e.category === activeCategory);
    const matches: EmojiEntry[] = [];
    for (const entry of EMOJI_LIST) {
      if (matches.length >= SEARCH_RESULT_LIMIT) break;
      if (entry.name.toLowerCase().includes(query) || entry.slug.includes(query)) matches.push(entry);
    }
    return matches;
  }, [query, activeCategory]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") onClose?.();
  }

  return (
    <div
      onKeyDown={handleKeyDown}
      className={
        embedded
          ? "flex h-[380px] w-full flex-col overflow-hidden"
          : "flex h-[380px] w-[300px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-lg"
      }
    >
      <div className="border-b border-[var(--border)] p-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2 py-1.5">
          <Search size={14} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
          {/* Deliberately not auto-focused: on a phone, focusing the search
              box would pop the virtual keyboard the moment the panel opens,
              which is the opposite of what opening the emoji picker is for.
              Tapping the box focuses it (and opens the keyboard) on demand. */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emoji"
            aria-label="Search emoji"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {!query && (
        <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[var(--border)] px-1.5 py-1.5">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              title={cat.label}
              aria-label={cat.label}
              aria-current={activeCategory === cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 rounded-lg p-1.5 text-lg leading-none hover:bg-[var(--surface-muted)] ${
                activeCategory === cat.id ? "bg-[var(--selected-bg)]" : ""
              }`}
            >
              {CATEGORY_TAB_ICON[cat.id]}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1.5">
        {results.length === 0 ? (
          <p className="p-4 text-center text-sm text-[var(--text-muted)]">No emoji found.</p>
        ) : (
          <div className="grid grid-cols-7 gap-0.5">
            {results.map((entry) => (
              <button
                key={entry.slug}
                type="button"
                title={entry.name}
                aria-label={entry.name}
                onClick={() => onSelect(entry.emoji)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-xl leading-none hover:bg-[var(--surface-muted)]"
              >
                {entry.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
