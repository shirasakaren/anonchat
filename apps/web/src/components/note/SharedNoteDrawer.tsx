import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Paperclip,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  X,
} from "lucide-react";
import { decryptBlob, encryptBlob, XCHACHA_NONCE_BYTES } from "@anonchat/crypto";
import type { ConversationNoteDto } from "@anonchat/shared";
import {
  adminNoteAssetUrl,
  deleteAdminNoteAsset,
  getAdminNote,
  saveAdminNote,
  uploadAdminNoteAsset,
} from "../../api/admin.js";
import { deleteNoteAsset, getNote, noteAssetUrl, saveNote, uploadNoteAsset } from "../../api/conversation.js";
import {
  decryptNoteDocument,
  encryptAttachmentMeta,
  encryptNoteDocument,
  toBlobPart,
} from "../../crypto/conversationCrypto.js";
import { NoteAssetLoaderContext, NoteAssetNode } from "./NoteAssetNode.js";
import { CodeBlockWithCopy } from "../editor/CodeBlockWithCopy.js";
import { IsolatedHeading } from "../editor/IsolatedHeading.js";

const EMPTY_DOCUMENT: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

interface Props {
  role: "ADMIN" | "USER";
  conversationId: string;
  conversationKey: Uint8Array;
  maxAssetSizeMb: number;
  incomingNote: ConversationNoteDto | null;
  readOnly?: boolean;
  onClose: () => void;
}

type SaveStatus = "loading" | "saved" | "unsaved" | "saving" | "error";

function assetIds(document: JSONContent): Set<string> {
  const ids = new Set<string>();
  const visit = (node: JSONContent) => {
    if (node.type === "noteAsset" && typeof node.attrs?.assetId === "string") ids.add(node.attrs.assetId);
    node.content?.forEach(visit);
  };
  visit(document);
  return ids;
}

function ToolButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md p-1.5 ${active ? "bg-[var(--btn-bg)] text-[var(--btn-fg)]" : "hover:bg-[var(--surface-muted)]"}`}
    >
      {children}
    </button>
  );
}

export default function SharedNoteDrawer({
  role,
  conversationId,
  conversationKey,
  maxAssetSizeMb,
  incomingNote,
  readOnly = false,
  onClose,
}: Props) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remotePending, setRemotePending] = useState<ConversationNoteDto | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestDocumentRef = useRef<JSONContent>(EMPTY_DOCUMENT);
  const lastAppliedAtRef = useRef<string>("");
  const savedAssetIdsRef = useRef<Set<string>>(new Set());
  const saveSequenceRef = useRef(0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeLatestRef = useRef<() => void>(() => {});

  const persist = useCallback(
    async (document: JSONContent): Promise<boolean> => {
      const sequence = ++saveSequenceRef.current;
      setSaveStatus("saving");
      try {
        const encrypted = encryptNoteDocument(conversationKey, document);
        const saved = role === "ADMIN" ? await saveAdminNote(conversationId, encrypted) : await saveNote(encrypted);
        const nextIds = assetIds(document);
        const removed = [...savedAssetIdsRef.current].filter((id) => !nextIds.has(id));
        await Promise.allSettled(
          removed.map((id) => (role === "ADMIN" ? deleteAdminNoteAsset(conversationId, id) : deleteNoteAsset(id))),
        );
        savedAssetIdsRef.current = nextIds;
        lastAppliedAtRef.current = saved.updatedAt;
        if (sequence === saveSequenceRef.current) setSaveStatus("saved");
        return true;
      } catch {
        if (sequence === saveSequenceRef.current) setSaveStatus("error");
        return false;
      }
    },
    [conversationId, conversationKey, role],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ link: { openOnClick: false, autolink: true, markdownLinks: true }, codeBlock: false }),
        CodeBlockWithCopy.configure({ enableTabIndentation: true, tabSize: 2 }),
        IsolatedHeading,
        Placeholder.configure({ placeholder: "Write anything…" }),
        NoteAssetNode,
      ],
      content: EMPTY_DOCUMENT,
      editorProps: { attributes: { class: "note-editor-content" } },
      editable: !readOnly,
      onUpdate: ({ editor: activeEditor }) => {
        const document = activeEditor.getJSON();
        latestDocumentRef.current = document;
        setSaveStatus("unsaved");
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => void persist(document), 800);
      },
    },
    [conversationId, conversationKey, persist, readOnly, role],
  );

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    setSaveStatus("loading");
    const load = role === "ADMIN" ? getAdminNote(conversationId) : getNote();
    void load
      .then(({ note }) => {
        if (cancelled) return;
        const decrypted = note ? decryptNoteDocument(conversationKey, note.content) : EMPTY_DOCUMENT;
        const document = decrypted && typeof decrypted === "object" ? (decrypted as JSONContent) : EMPTY_DOCUMENT;
        editor.commands.setContent(document, { emitUpdate: false });
        latestDocumentRef.current = document;
        savedAssetIdsRef.current = assetIds(document);
        lastAppliedAtRef.current = note?.updatedAt ?? "";
        setSaveStatus("saved");
      })
      .catch(() => {
        if (!cancelled) {
          setError("The note could not be loaded.");
          setSaveStatus("error");
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(saveTimerRef.current);
    };
  }, [conversationId, conversationKey, editor, role]);

  useEffect(() => {
    if (!incomingNote || !editor) return;
    if (incomingNote.updatedAt <= lastAppliedAtRef.current) {
      setRemotePending((pending) => (pending?.updatedAt === incomingNote.updatedAt ? null : pending));
      return;
    }
    if (saveStatus === "unsaved" || saveStatus === "saving") {
      setRemotePending(incomingNote);
      return;
    }
    const decrypted = decryptNoteDocument(conversationKey, incomingNote.content);
    if (!decrypted || typeof decrypted !== "object") return;
    const document = decrypted as JSONContent;
    editor.commands.setContent(document, { emitUpdate: false });
    latestDocumentRef.current = document;
    savedAssetIdsRef.current = assetIds(document);
    lastAppliedAtRef.current = incomingNote.updatedAt;
  }, [conversationKey, editor, incomingNote, saveStatus]);

  const loadAsset = useCallback(
    async (assetId: string, mimetype: string) => {
      const url = role === "ADMIN" ? adminNoteAssetUrl(conversationId, assetId) : noteAssetUrl(assetId);
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("asset download failed");
      const encrypted = new Uint8Array(await response.arrayBuffer());
      if (encrypted.byteLength < XCHACHA_NONCE_BYTES) {
        throw new Error("the stored file for this media is empty or damaged");
      }
      const plaintext = toBlobPart(decryptBlob(conversationKey, encrypted));
      return URL.createObjectURL(new Blob([plaintext], { type: mimetype }));
    },
    [conversationId, conversationKey, role],
  );

  async function addFiles(files: FileList | null) {
    if (!files || !editor) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > maxAssetSizeMb * 1024 * 1024)
          throw new Error(`${file.name} is larger than ${maxAssetSizeMb} MB.`);
        const plaintext = new Uint8Array(await file.arrayBuffer());
        const encryptedBlob = new Blob([toBlobPart(encryptBlob(conversationKey, plaintext))]);
        const meta = encryptAttachmentMeta(conversationKey, {
          filename: file.name,
          mimetype: file.type || "application/octet-stream",
          size: file.size,
        });
        const asset =
          role === "ADMIN"
            ? await uploadAdminNoteAsset(conversationId, meta, encryptedBlob)
            : await uploadNoteAsset(meta, encryptedBlob);
        editor
          .chain()
          .focus()
          .insertContent({
            type: "noteAsset",
            attrs: { assetId: asset.id, filename: file.name, mimetype: file.type || "application/octet-stream" },
          })
          .run();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The media could not be added.");
    } finally {
      setUploading(false);
    }
  }

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link URL", previous ?? "https://");
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  }

  async function closeSafely() {
    clearTimeout(saveTimerRef.current);
    if (saveStatus === "unsaved" || saveStatus === "saving" || saveStatus === "error") {
      const saved = await persist(latestDocumentRef.current);
      if (!saved) {
        setError("The note is still open because its latest changes could not be saved.");
        return;
      }
    }
    onClose();
  }

  closeLatestRef.current = () => void closeSafely();

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLatestRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  function applyRemote() {
    if (!remotePending || !editor) return;
    const decrypted = decryptNoteDocument(conversationKey, remotePending.content);
    if (!decrypted || typeof decrypted !== "object") return;
    const document = decrypted as JSONContent;
    editor.commands.setContent(document, { emitUpdate: false });
    latestDocumentRef.current = document;
    savedAssetIdsRef.current = assetIds(document);
    lastAppliedAtRef.current = remotePending.updatedAt;
    setRemotePending(null);
    setSaveStatus("saved");
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/35" onMouseDown={() => void closeSafely()} role="presentation">
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shared-note-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="ml-auto flex h-full w-full max-w-2xl flex-col border-l border-[var(--border)] bg-[var(--surface-raised)] shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h2 id="shared-note-title" className="text-sm font-semibold">
              Private conversation note
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              One shared note. Only you and the other participant can decrypt it.
              {readOnly ? " This conversation is blocked, so the note is read-only." : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] ${saveStatus === "error" ? "text-[var(--danger-fg)]" : "text-[var(--text-muted)]"}`}
            >
              {saveStatus === "loading"
                ? "Loading…"
                : saveStatus === "saving"
                  ? "Saving…"
                  : saveStatus === "unsaved"
                    ? "Unsaved"
                    : saveStatus === "error"
                      ? "Save failed"
                      : "Saved"}
            </span>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => void closeSafely()}
              aria-label="Close note"
              className="rounded-lg p-1.5 hover:bg-[var(--surface-muted)]"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </header>

        {remotePending && (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-xs">
            <span>The other participant saved a newer version while you were editing.</span>
            <button type="button" onClick={applyRemote} className="font-semibold underline">
              Load theirs
            </button>
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] p-2 text-[var(--text-muted)]">
            <ToolButton
              label="Heading 1"
              active={editor?.isActive("heading", { level: 1 })}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              <Heading1 size={17} />
            </ToolButton>
            <ToolButton
              label="Heading 2"
              active={editor?.isActive("heading", { level: 2 })}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 size={17} />
            </ToolButton>
            <ToolButton
              label="Bold"
              active={editor?.isActive("bold")}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold size={17} />
            </ToolButton>
            <ToolButton
              label="Italic"
              active={editor?.isActive("italic")}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic size={17} />
            </ToolButton>
            <ToolButton
              label="Strikethrough"
              active={editor?.isActive("strike")}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
            >
              <Strikethrough size={17} />
            </ToolButton>
            <ToolButton
              label="Bullet list"
              active={editor?.isActive("bulletList")}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List size={17} />
            </ToolButton>
            <ToolButton
              label="Numbered list"
              active={editor?.isActive("orderedList")}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={17} />
            </ToolButton>
            <ToolButton
              label="Quote"
              active={editor?.isActive("blockquote")}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            >
              <Quote size={17} />
            </ToolButton>
            <ToolButton
              label="Code block"
              active={editor?.isActive("codeBlock")}
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            >
              <Code2 size={17} />
            </ToolButton>
            <ToolButton label="Link" active={editor?.isActive("link")} onClick={setLink}>
              <LinkIcon size={17} />
            </ToolButton>
            <label
              title="Add image, video, audio, or file"
              className={`cursor-pointer rounded-md p-1.5 hover:bg-[var(--surface-muted)] ${uploading ? "pointer-events-none opacity-50" : ""}`}
            >
              <Paperclip size={17} aria-hidden />
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
            <ToolButton label="Undo" onClick={() => editor?.chain().focus().undo().run()}>
              <Undo2 size={17} />
            </ToolButton>
            <ToolButton label="Redo" onClick={() => editor?.chain().focus().redo().run()}>
              <Redo2 size={17} />
            </ToolButton>
          </div>
        )}

        {error && <p className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--danger-fg)]">{error}</p>}
        <NoteAssetLoaderContext.Provider value={loadAsset}>
          <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto" />
        </NoteAssetLoaderContext.Provider>
      </div>
    </div>
  );
}
