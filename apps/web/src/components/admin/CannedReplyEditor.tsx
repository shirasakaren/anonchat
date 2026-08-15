import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { Bold, Code2, Heading1, Heading2, Italic, List, ListOrdered, Quote, Strikethrough } from "lucide-react";
import { CodeBlockWithCopy } from "../editor/CodeBlockWithCopy.js";
import { IsolatedHeading } from "../editor/IsolatedHeading.js";

interface Props {
  value: string;
  onChange: (value: string) => void;
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

export function CannedReplyEditor({ value, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  const appliedValueRef = useRef(value);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, markdownLinks: true }, codeBlock: false }),
      CodeBlockWithCopy.configure({ enableTabIndentation: true, tabSize: 2 }),
      IsolatedHeading,
      Markdown,
      Placeholder.configure({ placeholder: "Write the reply…" }),
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "canned-reply-editor-content",
        "aria-label": "Reply text",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      const next = activeEditor.getMarkdown();
      appliedValueRef.current = next;
      onChangeRef.current(next);
    },
  });

  useEffect(() => {
    if (!editor || value === appliedValueRef.current) return;
    appliedValueRef.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-strong)] focus-within:border-[var(--color-accent-500)]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] p-1.5 text-[var(--text-muted)]">
        <ToolButton
          label="Heading 1"
          active={editor?.isActive("heading", { level: 1 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={16} aria-hidden />
        </ToolButton>
        <ToolButton
          label="Heading 2"
          active={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={16} aria-hidden />
        </ToolButton>
        <ToolButton
          label="Bold"
          active={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold size={16} aria-hidden />
        </ToolButton>
        <ToolButton
          label="Italic"
          active={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} aria-hidden />
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          active={editor?.isActive("strike")}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={16} aria-hidden />
        </ToolButton>
        <ToolButton
          label="Bullet list"
          active={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={16} aria-hidden />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          active={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} aria-hidden />
        </ToolButton>
        <ToolButton
          label="Quote"
          active={editor?.isActive("blockquote")}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={16} aria-hidden />
        </ToolButton>
        <ToolButton
          label="Code block"
          active={editor?.isActive("codeBlock")}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 size={16} aria-hidden />
        </ToolButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
