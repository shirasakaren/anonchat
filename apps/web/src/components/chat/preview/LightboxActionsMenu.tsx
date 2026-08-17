import { useEffect, useState } from "react";
import { EllipsisVertical, Pencil, Reply, SmilePlus, Trash2, X } from "lucide-react";
import { EmojiPicker } from "../emoji/EmojiPicker.js";
import { QUICK_REACTIONS } from "../quickReactions.js";

export interface ViewerActions {
  canEdit: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string | null) => void;
}

interface Props {
  actions: ViewerActions;
  /** Closes the viewer itself (called after an action fires). */
  onCloseViewer: () => void;
  /** Lets the viewer keep its backdrop/image interactions inert while the
   *  menu (or the emoji picker inside it) is open - an outside tap must
   *  close only the menu, never zoom the image or close the whole
   *  viewer by accident. */
  onMenuOpenChange?: (open: boolean) => void;
}

/**
 * The ⋯ button in a full-screen viewer's header, next to the close X. A
 * tap on an image/video opens ONLY the viewer - reply/react/edit/delete
 * live here instead of leaking the bubble's tap-to-select behavior into
 * preview mode. The menu is anchored inside the header (the viewer is
 * fixed-position fullscreen, so a plain absolute dropdown below the
 * button always has room and never needs flipping).
 */
export function LightboxActionsMenu({ actions, onCloseViewer, onMenuOpenChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    onMenuOpenChange?.(menuOpen);
  }, [menuOpen, onMenuOpenChange]);

  function run(action: () => void) {
    setMenuOpen(false);
    setReactOpen(false);
    setPickerOpen(false);
    action();
  }

  function pickEmoji(emoji: string) {
    run(() => {
      actions.onReact(emoji);
      onCloseViewer();
    });
  }

  // Clicking anywhere else in the viewer (the image, the empty area) closes
  // the menu and the emoji window - but never the viewer itself; the
  // backdrop's own close behavior (suppressed via onMenuOpenChange while
  // the menu is open) still decides whether the viewer stays open.
  useEffect(() => {
    if (!menuOpen) return;
    function handleDown(e: MouseEvent) {
      const target = e.target as Element | null;
      if (target?.closest("[data-lightbox-menu]")) return;
      setMenuOpen(false);
      setReactOpen(false);
      setPickerOpen(false);
    }
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [menuOpen]);

  return (
    <div className="relative" data-lightbox-menu>
      <button
        type="button"
        aria-label="Message options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => {
          setMenuOpen((prev) => !prev);
          setReactOpen(false);
          setPickerOpen(false);
        }}
        className="rounded-lg p-2 text-white hover:bg-white/10"
      >
        <EllipsisVertical size={18} aria-hidden />
      </button>

      {menuOpen && (
        <div
          role="menu"
          aria-label="Message actions"
          className="absolute right-0 top-full z-10 mt-1 w-64 overflow-hidden rounded-xl border border-white/15 bg-[var(--surface-raised)] py-1 text-[var(--text)] shadow-2xl"
        >
          {pickerOpen ? (
            <div className="mx-auto w-full">
              <EmojiPicker
                embedded
                onClose={() => setPickerOpen(false)}
                onSelect={(emoji) => pickEmoji(emoji)}
              />
            </div>
          ) : reactOpen ? (
            // Same curated strip as the bubble's reaction bar: the five
            // quick emoji plus a "more" button for the full picker.
            <div className="flex items-center justify-between gap-1 p-2">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React ${emoji}`}
                  onClick={() => pickEmoji(emoji)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none hover:bg-[var(--surface-muted)]"
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                aria-label="More reactions"
                onClick={() => setPickerOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <SmilePlus size={18} aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => setReactOpen(true)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)]"
              >
                <SmilePlus size={15} aria-hidden className="shrink-0 opacity-80" />
                React
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => run(() => { actions.onReply(); onCloseViewer(); })}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)]"
              >
                <Reply size={15} aria-hidden className="shrink-0 opacity-80" />
                Reply
              </button>
              {actions.canEdit && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => run(() => { actions.onEdit(); onCloseViewer(); })}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)]"
                >
                  <Pencil size={15} aria-hidden className="shrink-0 opacity-80" />
                  Edit
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => run(() => { actions.onDelete(); onCloseViewer(); })}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--danger-fg)] hover:bg-[var(--surface-muted)]"
              >
                <Trash2 size={15} aria-hidden className="shrink-0 opacity-80" />
                Delete
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X size={15} aria-hidden className="shrink-0 opacity-80" />
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
