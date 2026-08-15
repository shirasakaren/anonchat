// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CodeBlock from "@tiptap/extension-code-block";
import { Markdown } from "@tiptap/markdown";
import type { Mark } from "@tiptap/pm/model";
import { afterEach, describe, expect, it } from "vitest";
import { exitHeadingToParagraph, IsolatedHeading } from "./IsolatedHeading.js";

/**
 * Types one character the way a browser keystroke does: ProseMirror's
 * `handleTextInput` prop (where Tiptap input rules live) sees the char
 * first; when no rule consumes it, it is inserted as plain text.
 */
function typeChar(editor: Editor, char: string) {
  const view = editor.view;
  const { from, to } = view.state.selection;
  const handled = view.someProp("handleTextInput", (f) => f(view, from, to, char));
  if (!handled) editor.chain().focus().insertContentAt({ from, to }, editor.schema.text(char)).run();
}

function typeText(editor: Editor, text: string) {
  for (const char of text) typeChar(editor, char);
}

/**
 * Presses Enter the way the Composer + IsolatedHeading handle it in the
 * app: light paragraphs send (and clear the editor), headings exit to a
 * paragraph, code blocks keep their multiline newline, and lists/quotes
 * keep StarterKit's rules (jsdom has no contenteditable editing, so only
 * the commands the handlers map to are run).
 */
function typeEnter(editor: Editor) {
  if (editor.isActive("heading")) {
    exitHeadingToParagraph(editor);
  } else if (editor.isActive("codeBlock")) {
    const { from, to } = editor.state.selection;
    editor.chain().focus().insertContentAt({ from, to }, editor.schema.text("\n")).run();
  } else if (!editor.isActive("bulletList") && !editor.isActive("orderedList") && !editor.isActive("blockquote")) {
    // Composer sends on Enter from light text; handleSend clears the editor.
    editor.commands.clearContent(true);
  }
}

/** Mirrors the Composer/note/canned-reply extension stack. */
function composerLikeEditor() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true, markdownLinks: true },
        codeBlock: false,
      }),
      CodeBlock.configure({ enableTabIndentation: true, tabSize: 2 }),
      IsolatedHeading,
      Markdown,
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
}

function marksIn(editor: Editor, markName: string): Mark[] {
  const found: Mark[] = [];
  editor.state.doc.descendants((node) => {
    if (!node.isText) return;
    for (const mark of node.marks) if (mark.type.name === markName) found.push(mark);
  });
  return found;
}

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("composer markdown typing flow", () => {
  it("keeps # / ## input rules working on the line after a heading", () => {
    editor = composerLikeEditor();

    typeText(editor, "# ");
    expect(editor.isActive("heading", { level: 1 })).toBe(true);

    typeText(editor, "Title");

    // Enter ends the heading and starts a plain paragraph.
    typeEnter(editor);
    expect(editor.isActive("heading")).toBe(false);
    expect(editor.isActive("paragraph")).toBe(true);

    // The same rule that worked on line 1 must work again on the new line.
    typeText(editor, "# ");
    expect(editor.isActive("heading", { level: 1 })).toBe(true);
    typeText(editor, "Second");
    typeEnter(editor);

    typeText(editor, "## ");
    expect(editor.isActive("heading", { level: 2 })).toBe(true);
    typeText(editor, "Level two");
    typeEnter(editor);

    typeText(editor, "### ");
    expect(editor.isActive("heading", { level: 3 })).toBe(true);
    typeText(editor, "Level three");
    typeEnter(editor);

    typeText(editor, "#### ");
    expect(editor.isActive("heading", { level: 4 })).toBe(true);

    const markdown = editor.getMarkdown();
    expect(markdown).toContain("# Title");
    expect(markdown).toContain("# Second");
    expect(markdown).toContain("## Level two");
    expect(markdown).toContain("### Level three");
  });

  it("keeps mark input rules working after a heading split", () => {
    editor = composerLikeEditor();

    typeText(editor, "# ");
    typeText(editor, "Title");
    typeEnter(editor);

    typeText(editor, "**bold** ");
    expect(marksIn(editor, "bold")).toHaveLength(1);
    expect(editor.state.doc.textContent).toContain("bold");

    typeText(editor, "*italic* ");
    expect(marksIn(editor, "italic")).toHaveLength(1);

    typeText(editor, "~~gone~~ ");
    expect(marksIn(editor, "strike")).toHaveLength(1);

    typeText(editor, "[site](https://example.com) ");
    expect(marksIn(editor, "link")).toHaveLength(1);

    // Headings still work after all the inline formatting.
    typeEnter(editor);
    typeText(editor, "## ");
    expect(editor.isActive("heading", { level: 2 })).toBe(true);
  });

  it("splits a heading into a paragraph without leaking marks", () => {
    editor = composerLikeEditor();

    typeText(editor, "# ");
    typeText(editor, "**Bold**");
    expect(marksIn(editor, "bold")).toHaveLength(1);

    typeEnter(editor);
    expect(editor.isActive("heading")).toBe(false);
    expect(editor.isActive("paragraph")).toBe(true);
    expect(editor.isActive("bold")).toBe(false);

    const types = editor.state.doc.content.content.map((node) => node.type.name);
    expect(types).toEqual(["heading", "paragraph"]);
  });

  it("keeps Enter creating new lines inside a code block", () => {
    editor = composerLikeEditor();

    // ``` typed at the end of a paragraph becomes a code block (the
    // Composer's onUpdate transform; simulated here with toggleCodeBlock).
    typeText(editor, "```");
    editor.chain().focus().deleteRange({ from: 1, to: 4 }).setCodeBlock().run();

    typeText(editor, "line one");
    typeEnter(editor);
    expect(editor.isActive("codeBlock")).toBe(true);

    typeText(editor, "line two");
    typeEnter(editor);
    expect(editor.isActive("codeBlock")).toBe(true);

    expect(editor.getMarkdown()).toContain("line one\nline two");
  });
});
