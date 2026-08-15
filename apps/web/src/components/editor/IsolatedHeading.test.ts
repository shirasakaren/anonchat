// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { enterCleanLine, exitHeadingToParagraph, IsolatedHeading } from "./IsolatedHeading.js";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function headingEditor(position: number) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  editor = new Editor({
    element,
    extensions: [StarterKit, IsolatedHeading],
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", marks: [{ type: "bold" }], text: "Title" }],
        },
      ],
    },
  });
  editor.commands.setTextSelection(position);
  return editor;
}

describe("isolated headings", () => {
  it("starts a clean paragraph after a heading", () => {
    const activeEditor = headingEditor(6);

    expect(exitHeadingToParagraph(activeEditor)).toBe(true);
    expect(activeEditor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", marks: [{ type: "bold" }], text: "Title" }],
        },
        { type: "paragraph" },
      ],
    });
    expect(activeEditor.isActive("heading")).toBe(false);
    expect(activeEditor.isActive("bold")).toBe(false);
  });

  it("turns the trailing line into a paragraph when splitting a heading", () => {
    const activeEditor = headingEditor(3);

    expect(exitHeadingToParagraph(activeEditor)).toBe(true);
    expect(activeEditor.getJSON().content?.map((node) => node.type)).toEqual(["heading", "paragraph"]);
    expect(activeEditor.isActive("heading")).toBe(false);
  });

  it("leaves one clean paragraph between a heading and the next block", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const activeEditor = new Editor({
      element,
      extensions: [StarterKit, IsolatedHeading],
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
          { type: "paragraph", content: [{ type: "text", text: "next" }] },
        ],
      },
    });
    editor = activeEditor;
    activeEditor.commands.setTextSelection(6);

    expect(exitHeadingToParagraph(activeEditor)).toBe(true);
    expect(activeEditor.getJSON().content?.map((node) => node.type)).toEqual(["heading", "paragraph", "paragraph"]);
    expect(activeEditor.state.doc.textContent).toBe("Titlenext");
  });
});

describe("clean paragraph lines", () => {
  it("starts a fresh unmarked line after Enter at the end of a paragraph", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const activeEditor = new Editor({
      element,
      extensions: [StarterKit, IsolatedHeading],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", marks: [{ type: "bold" }], text: "bold text" }],
          },
        ],
      },
    });
    editor = activeEditor;
    activeEditor.commands.setTextSelection(10); // end of "bold text"

    expect(enterCleanLine(activeEditor)).toBe(true);
    expect(activeEditor.getJSON()).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "bold text" }] },
        { type: "paragraph" },
      ],
    });
    expect(activeEditor.isActive("bold")).toBe(false);

    // New text typed on the fresh line stays unmarked.
    activeEditor.commands.insertContentAt(activeEditor.state.selection.from, activeEditor.schema.text("plain"));
    const marks = activeEditor.state.doc.content.content[1].content.firstChild?.marks ?? [];
    expect(marks).toHaveLength(0);
  });
});
