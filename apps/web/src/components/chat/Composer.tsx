import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import EmojiPicker from "emoji-picker-react";
import { X, Paperclip, Smile, File as FileIcon } from "lucide-react";
import { expandEmojiShortcuts } from "./emojiShortcuts.js";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialText !== undefined) {
      setText(initialText);
      textareaRef.current?.focus();
    }
  }, [initialText]);

  function updateText(value: string) {
    setText(value);
    onTypingChange?.(value.length > 0);
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
    onTypingChange?.(false);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
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
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white"
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input id="attachment-input" type="file" multiple className="hidden" onChange={handleFilePick} />
        <label
          htmlFor="attachment-input"
          className="cursor-pointer rounded-lg p-2 hover:bg-[var(--surface-muted)]"
          title="Attach file"
        >
          <Paperclip size={18} aria-hidden />
        </label>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className="rounded-lg p-2 hover:bg-[var(--surface-muted)]"
            title="Emoji"
          >
            <Smile size={18} aria-hidden />
          </button>
          {showEmoji && (
            <div className="absolute bottom-full left-0 mb-2 z-10">
              <EmojiPicker
                onEmojiClick={(emojiData) => {
                  setText((prev) => prev + emojiData.emoji);
                  setShowEmoji(false);
                }}
              />
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => updateText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
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
      <div className="mt-1 text-right text-xs text-[var(--text-muted)]">
        {overLimit && <span className="text-[var(--danger-fg)]">Message is too long. </span>}
        {text.length}/{maxLength}
      </div>
    </div>
  );
}
