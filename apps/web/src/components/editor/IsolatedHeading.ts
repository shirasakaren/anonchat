import { Extension, type Editor } from "@tiptap/core";
import { splitBlock as pmSplitBlock } from "@tiptap/pm/commands";

/**
 * Block editors keep each line's formatting isolated, like Notion:
 * - Enter inside a heading ends the heading; the caret lands in a plain
 *   paragraph, so the next `# ` / `## ` starts a fresh heading.
 * - Enter inside a paragraph starts a clean plain-text line - marks (bold,
 *   italic, …) do not drag into the new line.
 * - Code blocks keep their own multiline Enter rules; lists and blockquotes
 *   keep their StarterKit Enter rules.
 *
 * ProseMirror's splitBlock is used instead of Tiptap's: Tiptap's version
 * inserts a default block AND forks an empty copy of the split block, which
 * leaves a redundant empty paragraph behind every split.
 */
function splitBlockClean(editor: Editor): boolean {
  let handled = false;
  pmSplitBlock(editor.state, (tr) => {
    handled = true;
    editor.view.dispatch(tr);
  });
  return handled;
}

/** Collapses the redundant empty paragraph that splitBlock leaves next to
 *  the caret (it inserts a default block AND forks a copy of the split
 *  block). $from.nodeBefore/nodeAfter resolve against the caret's block
 *  itself at top level, so the doc's children are inspected directly. */
function dropRedundantEmptyBlock(editor: Editor): void {
  const { $from } = editor.state.selection;
  if ($from.depth !== 1) return;
  const doc = editor.state.doc;
  const blockIndex = $from.index(0);
  const next = doc.maybeChild(blockIndex + 1);
  const previous = doc.maybeChild(blockIndex - 1);

  if (next?.type.name === "paragraph" && next.content.size === 0) {
    if (!editor.chain().joinForward().run()) {
      const start = $from.after();
      editor.chain().deleteRange({ from: start, to: start + next.nodeSize }).run();
    }
  } else if (previous?.type.name === "paragraph" && previous.content.size === 0) {
    editor.commands.joinBackward();
  }
}

export function exitHeadingToParagraph(editor: Editor): boolean {
  if (!editor.isActive("heading")) return false;
  if (!splitBlockClean(editor)) return false;
  editor.commands.setParagraph();
  dropRedundantEmptyBlock(editor);
  editor.commands.unsetAllMarks();
  return true;
}

export function enterCleanLine(editor: Editor): boolean {
  if (!splitBlockClean(editor)) return false;
  editor.commands.unsetAllMarks();
  return true;
}

export const IsolatedHeading = Extension.create({
  name: "isolatedHeading",
  priority: 1_000,

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (this.editor.isActive("heading")) return exitHeadingToParagraph(this.editor);
        // Code blocks handle Enter through their own rules.
        if (this.editor.isActive("codeBlock")) return false;
        // Lists and blockquotes keep StarterKit's Enter behavior.
        if (this.editor.isActive("bulletList") || this.editor.isActive("orderedList")) return false;
        if (this.editor.isActive("blockquote")) return false;
        return enterCleanLine(this.editor);
      },
    };
  },
});
