import { useEffect, useRef, useState } from "react";
import CodeBlock from "@tiptap/extension-code-block";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Check, Copy } from "lucide-react";
import { copyText } from "../chat/codeBlockActions.js";
import { languageLabel } from "../chat/codeLanguages.js";

function EditableCodeBlock({ node }: ReactNodeViewProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const language = typeof node.attrs.language === "string" ? node.attrs.language : "plaintext";

  useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  async function handleCopy() {
    if (!(await copyText(node.textContent))) return;
    setCopied(true);
    clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <NodeViewWrapper className="rich-editor-code-block">
      <div className="rich-editor-code-header" contentEditable={false}>
        <span>{languageLabel(language)}</span>
        <button
          type="button"
          className="rich-editor-code-copy"
          aria-label={`Copy ${languageLabel(language)} code`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void handleCopy()}
        >
          {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export const CodeBlockWithCopy = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(EditableCodeBlock);
  },
});
