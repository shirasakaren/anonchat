import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { X, Paperclip, Smile, File as FileIcon } from "lucide-react";
import type { CannedReplyDto } from "@anonchat/shared";
import {
  expandEmojiShortcuts,
  findActiveShortcodeQuery,
  matchCompletedShortcode,
  searchShortcodes,
  type ShortcodeMatch,
} from "./emojiShortcuts.js";
import { findActiveSlashQuery, searchCannedReplies } from "./cannedReplySlash.js";
import { EmojiShortcutOverlay } from "./EmojiShortcutOverlay.js";
import { CannedReplySlashOverlay } from "./CannedReplySlashOverlay.js";
import { EmojiPicker } from "./emoji/EmojiPicker.js";

const SHORTCODE_SUGGESTION_LIMIT = 30;
const OVERLAY_GAP_PX = 8;
const OVERLAY_MAX_WIDTH_PX = 320;

interface ActiveShortcode {
  from: number;
  query: string;
}

function editorOverlayPosition(editor: Editor): { top: number; left: number } {
  const caret = editor.view.coordsAtPos(editor.state.selection.from);
  return {
    top: caret.top - OVERLAY_GAP_PX,
    left: Math.min(Math.max(caret.left, 8), window.innerWidth - OVERLAY_MAX_WIDTH_PX - 8),
  };
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
  draftId?: string;
  draftText?: string;
  onDraftChange?: (text: string) => void;
  cannedReplies?: CannedReplyDto[];
}

/**
 * A single WYSIWYG message surface. StarterKit's input rules turn familiar
 * Markdown prefixes into editable formatting in place (`# ` -> heading,
 * `> ` -> quote, list markers -> lists), while the Markdown extension
 * serializes the document back to text before draft persistence/encryption.
 */
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
  draftId,
  draftText,
  onDraftChange,
  cannedReplies,
}: Props) {
  const [markdown, setMarkdown] = useState(initialText ?? draftText ?? "");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [shortcodeQuery, setShortcodeQuery] = useState<ActiveShortcode | null>(null);
  const [slashQuery, setSlashQuery] = useState<{ query: string } | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [overlayPos, setOverlayPos] = useState<{ top: number; left: number } | null>(null);
  const pickerWrapperRef = useRef<HTMLDivElement>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  const onTypingChangeRef = useRef(onTypingChange);
  const transformingRef = useRef(false);
  const previousInitialTextRef = useRef(initialText);
  const initialTextRef = useRef(initialText);
  const draftTextRef = useRef(draftText ?? "");
  const filesRef = useRef(files);
  const cannedRepliesRef = useRef(cannedReplies);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
    onTypingChangeRef.current = onTypingChange;
    draftTextRef.current = draftText ?? "";
    initialTextRef.current = initialText;
    cannedRepliesRef.current = cannedReplies;
  }, [cannedReplies, draftText, initialText, onDraftChange, onTypingChange]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const syncQueries = useCallback((activeEditor: Editor) => {
    const { $from, from } = activeEditor.state.selection;
    const textBeforeCaret = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
    const activeShortcode = findActiveShortcodeQuery(textBeforeCaret);
    const documentBeforeCaret = activeEditor.state.doc.textBetween(0, from, "\n", "\ufffc");
    const activeSlash = cannedRepliesRef.current?.length ? findActiveSlashQuery(documentBeforeCaret) : null;

    setShortcodeQuery(
      activeShortcode
        ? { from: from - (textBeforeCaret.length - activeShortcode.start), query: activeShortcode.query }
        : null,
    );
    setSlashQuery(activeSlash);
    setOverlayPos(activeShortcode || activeSlash ? editorOverlayPosition(activeEditor) : null);
  }, []);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          link: { openOnClick: false, autolink: true },
          codeBlock: { enableTabIndentation: true, tabSize: 2 },
        }),
        Markdown,
        Placeholder.configure({ placeholder: "Type a message…" }),
      ],
      content: initialText ?? draftText ?? "",
      contentType: "markdown",
      editable: !disabled,
      editorProps: {
        attributes: {
          class: "composer-editor-content",
          "aria-label": "Message",
          role: "textbox",
          "aria-multiline": "true",
        },
      },
      onUpdate: ({ editor: activeEditor }) => {
        const next = activeEditor.getMarkdown();
        setMarkdown(next);
        if (initialTextRef.current === undefined) onDraftChangeRef.current?.(next);
        onTypingChangeRef.current?.(next.length > 0);

        const { $from, from } = activeEditor.state.selection;
        const textBeforeCaret = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
        if (
          !transformingRef.current &&
          $from.parent.type.name === "paragraph" &&
          $from.parent.textContent === "```" &&
          textBeforeCaret === "```"
        ) {
          transformingRef.current = true;
          activeEditor
            .chain()
            .focus()
            .deleteRange({ from: from - 3, to: from })
            .setCodeBlock()
            .run();
          transformingRef.current = false;
          syncQueries(activeEditor);
          return;
        }
        const completed = matchCompletedShortcode(textBeforeCaret);
        if (completed && !transformingRef.current) {
          transformingRef.current = true;
          activeEditor.commands.insertContentAt(
            { from: from - (textBeforeCaret.length - completed.start), to: from },
            completed.emoji,
          );
          transformingRef.current = false;
          return;
        }

        syncQueries(activeEditor);
      },
      onSelectionUpdate: ({ editor: activeEditor }) => syncQueries(activeEditor),
    },
    [draftId],
  );

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  // Editing a message temporarily replaces the current draft. When editing
  // ends, restore the draft captured by the parent. Deliberately do not
  // react to every draftText prop change: a delayed draft write resolving
  // after Send was what made already-sent text reappear in the composer.
  useEffect(() => {
    if (!editor) return;
    const wasEditing = previousInitialTextRef.current !== undefined;
    const isEditing = initialText !== undefined;
    previousInitialTextRef.current = initialText;
    if (!isEditing && !wasEditing) return;
    const next = initialText ?? draftTextRef.current;
    editor.commands.setContent(next, { contentType: "markdown", emitUpdate: false });
    setMarkdown(next);
    editor.commands.focus("end");
  }, [editor, initialText]);

  useEffect(() => {
    if (!showEmoji) return;
    function handlePointerDown(e: MouseEvent) {
      if (pickerWrapperRef.current && !pickerWrapperRef.current.contains(e.target as Node)) setShowEmoji(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showEmoji]);

  useEffect(
    () => () => {
      for (const pending of filesRef.current) if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    },
    [],
  );

  const suggestions = useMemo(
    () => (shortcodeQuery ? searchShortcodes(shortcodeQuery.query, SHORTCODE_SUGGESTION_LIMIT) : []),
    [shortcodeQuery],
  );
  const templateSuggestions = useMemo(
    () => (slashQuery && cannedReplies?.length ? searchCannedReplies(cannedReplies, slashQuery.query) : []),
    [cannedReplies, slashQuery],
  );

  useEffect(() => setSelectedSuggestion(0), [shortcodeQuery?.query, slashQuery?.query]);

  function insertAtCursor(content: string) {
    editor?.chain().focus().insertContent(content).run();
  }

  function applySuggestion(match: ShortcodeMatch) {
    if (!editor || !shortcodeQuery) return;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: shortcodeQuery.from, to: editor.state.selection.from }, match.emoji)
      .run();
    setShortcodeQuery(null);
  }

  function applyTemplate(reply: CannedReplyDto) {
    if (!editor) return;
    // Slash commands only activate at the start of the document. Replacing
    // the command with parsed Markdown gives an immediately editable rich
    // document instead of exposing the template's Markdown source.
    editor.commands.setContent(reply.body, { contentType: "markdown" });
    editor.commands.focus("end");
    setSlashQuery(null);
  }

  function addFiles(newFiles: File[]) {
    setFiles((prev) => {
      const available = Math.max(0, maxAttachments - prev.length);
      const additions = newFiles.slice(0, available).map((file) => ({
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      }));
      return [...prev, ...additions];
    });

    // The native file chooser moves focus away from the editor. Restore the
    // existing Tiptap selection after React has rendered the attachment
    // chips so the person can keep typing without another click. The same
    // behavior also makes drag/drop and pasted files consistently return to
    // the message field.
    requestAnimationFrame(() => editor?.commands.focus());
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleSend() {
    if (!editor) return;
    const expanded = expandEmojiShortcuts(editor.getMarkdown()).trim();
    if ((!expanded && files.length === 0) || expanded.length > maxLength) return;
    const sentFiles = files.map((pending) => pending.file);
    onSend(expanded, sentFiles);

    // Clear both sources synchronously. This cancels the pending encrypted
    // draft save before the network response can race a stale draft prop
    // back into this editor (also covers canned replies).
    onDraftChangeRef.current?.("");
    editor.commands.clearContent(true);
    setMarkdown("");
    for (const pending of files) if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    setFiles([]);
    setShortcodeQuery(null);
    setSlashQuery(null);
    onTypingChangeRef.current?.(false);
    editor.commands.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing) return;
    if (slashQuery && templateSuggestions.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const direction = e.key === "ArrowDown" ? 1 : -1;
        setSelectedSuggestion((i) => (i + direction + templateSuggestions.length) % templateSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const picked = templateSuggestions[selectedSuggestion];
        if (picked) applyTemplate(picked);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashQuery(null);
        return;
      }
    }
    if (shortcodeQuery && suggestions.length > 0) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const direction = e.key === "ArrowRight" ? 1 : -1;
        setSelectedSuggestion((i) => (i + direction + suggestions.length) % suggestions.length);
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
    if (e.key === "Enter" && editor?.isActive("heading")) {
      e.preventDefault();
      editor.chain().focus().enter().setParagraph().run();
      return;
    }
    if (e.key === "Enter" && editor?.isActive("codeBlock")) {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        handleSend();
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    const pasted = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (pasted.length === 0) return;
    e.preventDefault();
    addFiles(pasted);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    if (e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  }

  function handleFilePick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  const overLimit = markdown.length > maxLength;
  const empty = markdown.trim().length === 0 && files.length === 0;

  return (
    <div
      className="border-t border-[var(--border)] bg-[var(--surface-raised)] p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onPasteCapture={handlePaste}
      onKeyDownCapture={handleKeyDown}
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
          {files.map((pending, index) => (
            <div key={`${pending.file.name}-${index}`} className="relative">
              {pending.previewUrl ? (
                <img src={pending.previewUrl} alt={pending.file.name} className="h-16 w-16 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[var(--border)]">
                  <FileIcon size={20} className="text-[var(--text-muted)]" aria-hidden />
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(index)}
                aria-label={`Remove ${pending.file.name}`}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
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
      {slashQuery && templateSuggestions.length > 0 && overlayPos && (
        <CannedReplySlashOverlay
          matches={templateSuggestions}
          selectedIndex={selectedSuggestion}
          top={overlayPos.top}
          left={overlayPos.left}
          onSelect={applyTemplate}
        />
      )}

      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 items-end rounded-xl border border-[var(--border-strong)] bg-transparent px-1.5 focus-within:border-[var(--color-accent-500)]">
          <input
            id={`attachment-input-${draftId ?? "message"}`}
            type="file"
            multiple
            className="hidden"
            onChange={handleFilePick}
          />
          <label
            htmlFor={`attachment-input-${draftId ?? "message"}`}
            className="mb-1 cursor-pointer rounded-lg p-2 hover:bg-[var(--surface-muted)]"
            title="Attach file"
          >
            <Paperclip size={18} aria-hidden />
          </label>

          <div ref={pickerWrapperRef} className="relative mb-1">
            <button
              type="button"
              onClick={() => setShowEmoji((value) => !value)}
              className="rounded-lg p-2 hover:bg-[var(--surface-muted)]"
              title="Emoji"
              aria-label="Open emoji picker"
              aria-expanded={showEmoji}
            >
              <Smile size={18} aria-hidden />
            </button>
            {showEmoji && (
              <div className="absolute bottom-full left-0 z-30 mb-2">
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

          <EditorContent editor={editor} className="min-w-0 flex-1" />
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || overLimit || empty}
          className="h-11 shrink-0 rounded-xl bg-[var(--btn-bg)] px-4 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] disabled:opacity-40"
        >
          Send
        </button>
      </div>

      {overLimit && (
        <p className="mt-1.5 text-right text-xs text-[var(--danger-fg)]" role="alert">
          Message is too long. Shorten it before sending.
        </p>
      )}
    </div>
  );
}
