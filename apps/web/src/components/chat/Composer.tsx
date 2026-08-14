import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import clsx from "clsx";
import { X, Paperclip, Smile, File as FileIcon, Eye } from "lucide-react";
import {
  expandEmojiShortcuts,
  findActiveShortcodeQuery,
  matchCompletedShortcode,
  searchShortcodes,
  type ShortcodeMatch,
} from "./emojiShortcuts.js";
import { getCaretCoordinates } from "./caretCoordinates.js";
import { EmojiShortcutOverlay } from "./EmojiShortcutOverlay.js";
import { EmojiPicker } from "./emoji/EmojiPicker.js";
import { justCompletedFreshCodeFence } from "./codeFenceDetection.js";
import { CodeBlockModal } from "./CodeBlockModal.js";
import { ExpandableProse } from "./ExpandableProse.js";
import { renderMessageMarkdown } from "./markdown.js";

/** How many shortcode matches to offer - the overlay scrolls horizontally
 *  (see EmojiShortcutOverlay), so there's no reason to cap this as
 *  tightly as an in-flow dropdown would need to. */
const SHORTCODE_SUGGESTION_LIMIT = 30;
/** Gap between the text cursor's line and the overlay floating above it. */
const OVERLAY_GAP_PX = 8;
/** Matches EmojiShortcutOverlay's own max-w-[min(90vw,20rem)] - used only
 *  to keep the overlay's left edge from being positioned so far right it'd
 *  run off the viewport, not to size the overlay itself. */
const OVERLAY_MAX_WIDTH_PX = 320;

function computeOverlayPosition(el: HTMLTextAreaElement, cursor: number): { top: number; left: number } {
  const rect = el.getBoundingClientRect();
  const caret = getCaretCoordinates(el, cursor);
  const rawLeft = rect.left + caret.left;
  const left = Math.min(Math.max(rawLeft, 8), window.innerWidth - OVERLAY_MAX_WIDTH_PX - 8);
  return { top: rect.top + caret.top - OVERLAY_GAP_PX, left };
}

export interface PendingFile {
  file: File;
  previewUrl: string | null;
}

interface Props {
  maxLength: number;
  maxAttachments: number;
  disabled: boolean;
  disabledReason?: string;
  replyPreview?: string;
  onCancelReply?: () => void;
  editingPreview?: string;
  onCancelEdit?: () => void;
  onSend: (text: string, files: File[]) => void;
  onTypingChange?: (isTyping: boolean) => void;
  initialText?: string;
}

export function Composer({
  maxLength,
  maxAttachments,
  disabled,
  disabledReason,
  replyPreview,
  onCancelReply,
  editingPreview,
  onCancelEdit,
  onSend,
  onTypingChange,
  initialText,
}: Props) {
  const [text, setText] = useState(initialText ?? "");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [shortcodeQuery, setShortcodeQuery] = useState<{ start: number; query: string } | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [overlayPos, setOverlayPos] = useState<{ top: number; left: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [codeModal, setCodeModal] = useState<{ fenceStart: number; fenceEnd: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerWrapperRef = useRef<HTMLDivElement>(null);

  const suggestions = shortcodeQuery ? searchShortcodes(shortcodeQuery.query, SHORTCODE_SUGGESTION_LIMIT) : [];

  // Gated on showPreview, not just memoized on text - marked + DOMPurify +
  // highlight.js runs its full pipeline here, and that cost should only
  // land on every keystroke while the preview panel is actually visible,
  // not silently on every keystroke regardless (which a plain
  // useMemo(() => renderMessageMarkdown(text), [text]) would still do).
  const previewHtml = useMemo(() => (showPreview ? renderMessageMarkdown(text) : null), [showPreview, text]);

  useEffect(() => {
    if (initialText !== undefined) {
      setText(initialText);
      textareaRef.current?.focus();
    }
  }, [initialText]);

  // Close the emoji picker on an outside click - it has no built-in
  // dismiss-on-blur behavior of its own.
  useEffect(() => {
    if (!showEmoji) return;
    function handlePointerDown(e: MouseEvent) {
      if (pickerWrapperRef.current && !pickerWrapperRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showEmoji]);

  function updateText(value: string) {
    setText(value);
    onTypingChange?.(value.length > 0);
  }

  /** Inserts at the cursor (falling back to the end on the off chance the
   *  textarea ref isn't attached yet) rather than always appending - used
   *  by the emoji picker button, matching how the :shortcode: overlay
   *  already inserts via applySuggestion below. */
  function insertAtCursor(insert: string) {
    const el = textareaRef.current;
    if (!el) {
      updateText(text + insert);
      return;
    }
    const cursor = el.selectionStart ?? text.length;
    const newValue = text.slice(0, cursor) + insert + text.slice(el.selectionEnd ?? cursor);
    const newCursor = cursor + insert.length;
    updateText(newValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
    });
  }

  /** Re-derives the in-progress ":partial" shortcode (if any) from the
   *  textarea's current value and cursor position - called after every text
   *  change and every cursor move, since moving the cursor away from a
   *  half-typed shortcode should close the suggestion list too. Also
   *  recomputes the overlay's anchor position, since the cursor (and so
   *  where the overlay needs to float above) moves along with it. */
  function syncShortcodeQuery(el: HTMLTextAreaElement) {
    const cursor = el.selectionStart ?? el.value.length;
    const active = findActiveShortcodeQuery(el.value.slice(0, cursor));
    setShortcodeQuery(active);
    setSelectedSuggestion(0);
    setOverlayPos(active ? computeOverlayPosition(el, cursor) : null);
  }

  function handleTextChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const cursor = el.selectionStart ?? el.value.length;
    const completed = matchCompletedShortcode(el.value.slice(0, cursor));
    if (completed) {
      // The closing ":" was just typed on a known shortcode - convert it to
      // the real emoji immediately instead of waiting for send.
      const newValue = el.value.slice(0, completed.start) + completed.emoji + el.value.slice(completed.end);
      const newCursor = completed.start + completed.emoji.length;
      updateText(newValue);
      setShortcodeQuery(null);
      requestAnimationFrame(() => el.setSelectionRange(newCursor, newCursor));
      return;
    }
    if (justCompletedFreshCodeFence(el.value, cursor)) {
      // Open the Teams-style code modal instead of leaving a bare ``` in
      // the draft - the fence's own position is recorded so the inserted
      // block can replace exactly those three characters, not re-scan the
      // text for them (the same "```" can legitimately appear more than
      // once).
      updateText(el.value);
      setShortcodeQuery(null);
      setCodeModal({ fenceStart: cursor - 3, fenceEnd: cursor });
      return;
    }
    updateText(el.value);
    syncShortcodeQuery(el);
  }

  function handleCodeInsert(code: string, language: string) {
    if (!codeModal) return;
    const fence = "```" + language + "\n" + code.replace(/\n+$/, "") + "\n```\n";
    const newValue = text.slice(0, codeModal.fenceStart) + fence + text.slice(codeModal.fenceEnd);
    const newCursor = codeModal.fenceStart + fence.length;
    updateText(newValue);
    setCodeModal(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    });
  }

  function applySuggestion(match: ShortcodeMatch) {
    const el = textareaRef.current;
    if (!el || !shortcodeQuery) return;
    const cursor = el.selectionStart ?? text.length;
    const newValue = text.slice(0, shortcodeQuery.start) + match.emoji + text.slice(cursor);
    const newCursor = shortcodeQuery.start + match.emoji.length;
    updateText(newValue);
    setShortcodeQuery(null);
    el.focus();
    requestAnimationFrame(() => el.setSelectionRange(newCursor, newCursor));
  }

  function addFiles(newFiles: File[]) {
    setFiles((prev) => {
      const combined = [
        ...prev,
        ...newFiles.map((file) => ({
          file,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        })),
      ];
      return combined.slice(0, maxAttachments);
    });
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleSend() {
    const expanded = expandEmojiShortcuts(text).trim();
    if (!expanded && files.length === 0) return;
    onSend(
      expanded,
      files.map((f) => f.file),
    );
    setText("");
    setFiles([]);
    setShowPreview(false);
    onTypingChange?.(false);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Left/Right (not Up/Down) - the overlay is a single horizontally-
    // scrolling strip (see EmojiShortcutOverlay), matching WhatsApp's own
    // shortcut picker. This fully takes over the arrow keys while a
    // shortcode is in progress, the same way Enter/Tab already do below -
    // moving the text cursor away from a half-typed ":code" implicitly
    // abandons it anyway (syncShortcodeQuery closes the overlay on the
    // resulting selection-change event).
    if (shortcodeQuery && suggestions.length > 0) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedSuggestion((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedSuggestion((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const picked = suggestions[selectedSuggestion];
        if (picked) applySuggestion(picked);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShortcodeQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items).filter((i) => i.kind === "file");
    if (items.length === 0) return;
    const pasted = items.map((i) => i.getAsFile()).filter((f): f is File => f !== null);
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  }

  function handleFilePick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  const overLimit = text.length > maxLength;

  return (
    <div
      className="border-t border-[var(--border)] bg-[var(--surface-raised)] p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {disabled && disabledReason && (
        <p className="mb-2 rounded-md bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-fg)]">
          {disabledReason}
        </p>
      )}

      {(replyPreview || editingPreview) && (
        <div className="mb-2 flex items-center justify-between rounded-md bg-[var(--surface-muted)] px-3 py-1.5 text-xs">
          <span className="truncate">
            {editingPreview ? `Editing: ${editingPreview}` : `Replying to: ${replyPreview}`}
          </span>
          <button
            type="button"
            onClick={editingPreview ? onCancelEdit : onCancelReply}
            aria-label={editingPreview ? "Cancel edit" : "Cancel reply"}
            className="ml-2 shrink-0 rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-raised)]"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              {f.previewUrl ? (
                <img src={f.previewUrl} alt={f.file.name} className="h-16 w-16 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[var(--border)] text-xs">
                  <FileIcon size={20} className="text-[var(--text-muted)]" aria-hidden />
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.file.name}`}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-black"
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {shortcodeQuery && suggestions.length > 0 && overlayPos && (
        <EmojiShortcutOverlay
          matches={suggestions}
          selectedIndex={selectedSuggestion}
          top={overlayPos.top}
          left={overlayPos.left}
          onSelect={applySuggestion}
        />
      )}

      <div className="mb-1.5 flex gap-1 text-xs font-medium">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={showPreview}
          onClick={() => setShowPreview((v) => !v)}
          className={clsx(
            "flex items-center gap-1 rounded-md px-2 py-1",
            showPreview
              ? "bg-[var(--surface-muted)] text-[var(--text)]"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          <Eye size={12} aria-hidden />
          Live preview
        </button>
      </div>

      <div className="flex items-end gap-2">
        <input id="attachment-input" type="file" multiple className="hidden" onChange={handleFilePick} />
        <label
          htmlFor="attachment-input"
          className="cursor-pointer rounded-lg p-2 hover:bg-[var(--surface-muted)]"
          title="Attach file"
        >
          <Paperclip size={18} aria-hidden />
        </label>

        <div ref={pickerWrapperRef} className="relative">
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className="rounded-lg p-2 hover:bg-[var(--surface-muted)]"
            title="Emoji"
            aria-label="Open emoji picker"
          >
            <Smile size={18} aria-hidden />
          </button>
          {showEmoji && (
            <div className="absolute bottom-full left-0 mb-2 z-10">
              <EmojiPicker
                onClose={() => setShowEmoji(false)}
                onSelect={(emoji) => {
                  insertAtCursor(emoji);
                  setShowEmoji(false);
                }}
              />
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onSelect={(e) => syncShortcodeQuery(e.currentTarget)}
          onClick={(e) => syncShortcodeQuery(e.currentTarget)}
          placeholder="Type a message… (Enter to send, Shift+Enter for a new line)"
          rows={1}
          disabled={disabled}
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm disabled:opacity-50"
          style={{ height: "auto" }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
          }}
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || overLimit || (!text.trim() && files.length === 0)}
          className="rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-40"
        >
          Send
        </button>
      </div>

      {/* Still-editable textarea above stays live - this panel just mirrors
          its rendered markdown underneath, updating on every keystroke
          (previewHtml is gated on showPreview - see its own comment) rather
          than replacing the input the way the old Write/Preview tab swap
          did, which made it impossible to see formatting while typing. */}
      {showPreview && (
        <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
          {text.trim() ? (
            <ExpandableProse html={previewHtml!} clamp={false} />
          ) : (
            <p className="text-[var(--text-muted)]">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <div className="mt-1 text-right text-xs text-[var(--text-muted)]">
        {overLimit && <span className="text-[var(--danger-fg)]">Message is too long. </span>}
        {text.length}/{maxLength}
      </div>

      {codeModal && <CodeBlockModal onInsert={handleCodeInsert} onClose={() => setCodeModal(null)} />}
    </div>
  );
}
