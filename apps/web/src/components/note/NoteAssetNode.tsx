import { createContext, useContext, useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Download, File, LoaderCircle, Trash2 } from "lucide-react";

export type LoadNoteAsset = (assetId: string, mimetype: string) => Promise<string>;
export const NoteAssetLoaderContext = createContext<LoadNoteAsset | null>(null);

function NoteAssetView({ node, deleteNode }: NodeViewProps) {
  const loadAsset = useContext(NoteAssetLoaderContext);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { assetId, filename, mimetype } = node.attrs as { assetId: string; filename: string; mimetype: string };

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setUrl(null);
    if (!loadAsset || !/^[A-Za-z0-9_-]{1,64}$/.test(assetId)) {
      setFailed(true);
      return;
    }
    void loadAsset(assetId, mimetype)
      .then((next) => {
        if (cancelled) URL.revokeObjectURL(next);
        else setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, loadAsset, mimetype]);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return (
    <NodeViewWrapper className="note-asset" data-drag-handle>
      <div className="group relative rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2">
        <button
          type="button"
          onClick={deleteNode}
          contentEditable={false}
          aria-label={`Remove ${filename}`}
          className="absolute top-2 right-2 z-10 rounded-md bg-black/65 p-1.5 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 size={14} aria-hidden />
        </button>
        {!url && !failed && (
          <div className="flex h-24 items-center justify-center text-xs text-[var(--text-muted)]">
            <LoaderCircle size={16} className="mr-2 animate-spin" aria-hidden /> Decrypting media…
          </div>
        )}
        {failed && <p className="p-3 text-xs text-[var(--danger-fg)]">This media could not be decrypted.</p>}
        {url && mimetype.startsWith("image/") && (
          <img src={url} alt={filename} className="max-h-96 w-auto rounded-lg" />
        )}
        {url && mimetype.startsWith("video/") && <video src={url} controls className="max-h-96 w-full rounded-lg" />}
        {url && mimetype.startsWith("audio/") && <audio src={url} controls className="w-full" />}
        {url && !/^(image|video|audio)\//.test(mimetype) && (
          <a
            href={url}
            download={filename}
            className="flex items-center gap-2 rounded-lg p-3 text-sm hover:bg-[var(--surface-raised)]"
          >
            <File size={18} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{filename}</span>
            <Download size={16} aria-hidden />
          </a>
        )}
        <p className="mt-1 truncate px-1 text-[11px] text-[var(--text-muted)]">{filename}</p>
      </div>
    </NodeViewWrapper>
  );
}

export const NoteAssetNode = Node.create({
  name: "noteAsset",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      assetId: { default: null },
      filename: { default: "Attachment" },
      mimetype: { default: "application/octet-stream" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-note-asset]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const assetId = typeof HTMLAttributes.assetId === "string" ? HTMLAttributes.assetId : "";
    return ["div", mergeAttributes(HTMLAttributes, { "data-note-asset": assetId })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(NoteAssetView);
  },
});
