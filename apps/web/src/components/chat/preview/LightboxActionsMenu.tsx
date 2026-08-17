import { useEffect, useState } from "react";
import { EllipsisVertical, Pencil, Reply, SmilePlus, Trash2, X } from "lucide-react";
import { EmojiPicker } from "../emoji/EmojiPicker.js";

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
}

/**
 * The ⋯ button in a full-screen viewer's header, next to the close X. A
 * tap on an image/video opens ONLY the viewer - reply/react/edit/delete
 * live here instead of leaking the bubble's tap-to-select behavior into
 * preview mode. The menu is anchored inside the header (the viewer is
 * fixed-position fullscreen, so a plain absolute dropdown below the
 * button always has room and never needs flipping).
 */
export function LightboxActionsMenu({ actions, onCloseViewer }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  function run(action: () => void) {
    setMenuOpen(false);
    setPickerOpen(false);
    action();
  }

  // Clicking anywhere else in the viewer (the image, the empty area) closes
  // the menu without touching the viewer - the backdrop's own close
  // behavior still decides whether the viewer itself stays open.
  useEffect(() => {
    if (!menuOpen) return;
    function handleDown(e: MouseEvent) {
      const target = e.target as Element | null;
      if (target?.closest("[data-lightbox-menu]")) return;
      setMenuOpen(false);
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
          className="absolute right-0 top-full z-10 mt-1 w-60 overflow-hidden rounded-xl border border-white/15 bg-[var(--surface-raised)] py-1 text-[var(--text)] shadow-2xl"
        >
          {pickerOpen ? (
            <div className="mx-auto w-full">
              <EmojiPicker
                embedded
                onClose={() => setPickerOpen(false)}
                onSelect={(emoji) => run(() => { actions.onReact(emoji); onCloseViewer(); })}
              />
            </div>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => setPickerOpen(true)}
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
