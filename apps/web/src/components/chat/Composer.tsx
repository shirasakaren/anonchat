import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import clsx from "clsx";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { X, Paperclip, Smile, File as FileIcon } from "lucide-react";
import {
  expandEmojiShortcuts,
  findActiveShortcodeQuery,
  matchCompletedShortcode,
  searchShortcodes,
  type ShortcodeMatch,
} from "./emojiShortcuts.js";
import { justCompletedFreshCodeFence } from "./codeFenceDetection.js";
import { CodeBlockModal } from "./CodeBlockModal.js";
import { ExpandableProse } from "./ExpandableProse.js";
import { renderMessageMarkdown } from "./markdown.js";
import { useTheme } from "../../context/ThemeContext.js";

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
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [codeModal, setCodeModal] = useState<{ fenceStart: number; fenceEnd: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerWrapperRef = useRef<HTMLDivElement>(null);
  const { meta } = useTheme();

  const suggestions = shortcodeQuery ? searchShortcodes(shortcodeQuery.query) : [];

  useEffect(() => {
    if (initialText !== undefined) {
      setText(initialText);
      setMode("write");
      textareaRef.current?.focus();
    }
  }, [initialText]);

  /** Preview mode has no textarea to edit or autocomplete into - closing
   *  both here means neither can linger open with stale state when the
   *  user switches away from Write. Switching back to Write restores focus
   *  so typing can resume immediately. */
  function switchMode(next: "write" | "preview") {
    setMode(next);
    if (next === "preview") {
      setShortcodeQuery(null);
      setShowEmoji(false);
    } else {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

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

  /** Re-derives the in-progress ":partial" shortcode (if any) from the
   *  textarea's current value and cursor position - called after every text
   *  change and every cursor move, since moving the cursor away from a
   *  half-typed shortcode should close the suggestion list too. */
  function syncShortcodeQuery(el: HTMLTextAreaElement) {
    const cursor = el.selectionStart ?? el.value.length;
    const active = findActiveShortcodeQuery(el.value.slice(0, cursor));
    setShortcodeQuery(active);
    setSelectedSuggestion(0);
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
    setMode("write");
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
    setMode("write");
    onTypingChange?.(false);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (shortcodeQuery && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestion((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
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
        <p className="mb-2 rounded-md bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-fg)]">{disabledReason}</p>
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

      {shortcodeQuery && suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="Emoji suggestions"
          className="mb-2 flex flex-wrap gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-2"
        >
          {suggestions.map((match, i) => (
            <button
              key={match.code}
              type="button"
              role="option"
              aria-selected={i === selectedSuggestion}
              onMouseDown={(e) => {
                // mousedown fires before the textarea blur, so it beats the
                // suggestion-dismiss-on-cursor-move path and can't race it.
                e.preventDefault();
                applySuggestion(match);
              }}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-[var(--surface-muted)] ${
                i === selectedSuggestion ? "border-[var(--border-strong)]" : "border-transparent"
              }`}
            >
              <span>{match.emoji}</span>
              <span className="text-xs text-[var(--text-muted)]">:{match.code}:</span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-1.5 flex gap-1 text-xs font-medium">
        <button
          type="button"
          disabled={disabled}
          onClick={() => switchMode("write")}
          className={clsx(
            "rounded-md px-2 py-1",
            mode === "write"
              ? "bg-[var(--surface-muted)] text-[var(--text)]"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          Write
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => switchMode("preview")}
          className={clsx(
            "rounded-md px-2 py-1",
            mode === "preview"
              ? "bg-[var(--surface-muted)] text-[var(--text)]"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          Preview
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
              {/* EmojiStyle.NATIVE renders system emoji glyphs instead of the
                  library's default CDN-hosted Apple sprite images - those
                  requests get blocked by this app's img-src 'self' CSP,
                  which left the picker an empty grid of broken images. */}
              <EmojiPicker
                emojiStyle={EmojiStyle.NATIVE}
                theme={meta.variant === "dark" ? Theme.DARK : Theme.LIGHT}
                width={300}
                height={380}
                searchPlaceholder="Search emoji"
                previewConfig={{ showPreview: true }}
                onEmojiClick={(emojiData) => {
                  setText((prev) => prev + emojiData.emoji);
                  setShowEmoji(false);
                  // Switch back to Write so the inserted emoji is actually
                  // visible - clicking this while in Preview would otherwise
                  // silently edit text the user can't currently see.
                  switchMode("write");
                }}
              />
            </div>
          )}
        </div>

        {mode === "write" ? (
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
        ) : (
          // Read-only render of exactly what Send will encrypt and ship -
          // never a separate draft, just a view toggle on the same `text`
          // state. clamp={false}: this box already scrolls at a fixed
          // height itself, so ExpandableProse's own "See more" clamp (meant
          // for an already-sent bubble) would just be a second, redundant
          // scroll boundary here.
          <div className="max-h-32 min-h-[2.5rem] flex-1 overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm">
            {text.trim() ? (
              <ExpandableProse html={renderMessageMarkdown(text)} clamp={false} />
            ) : (
              <p className="text-[var(--text-muted)]">Nothing to preview yet.</p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || overLimit || (!text.trim() && files.length === 0)}
          className="rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <div className="mt-1 text-right text-xs text-[var(--text-muted)]">
        {overLimit && <span className="text-[var(--danger-fg)]">Message is too long. </span>}
        {text.length}/{maxLength}
      </div>

      {codeModal && <CodeBlockModal onInsert={handleCodeInsert} onClose={() => setCodeModal(null)} />}
    </div>
  );
}
