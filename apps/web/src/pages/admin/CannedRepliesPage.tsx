import { useEffect, useState } from "react";
import type { CannedReplyDto } from "@anonchat/shared";
import { createCannedReply, deleteCannedReply, listCannedReplies, updateCannedReply } from "../../api/admin.js";
import { FullScreenLoader } from "../../components/common/Loader.js";

export default function CannedRepliesPage() {
  const [replies, setReplies] = useState<CannedReplyDto[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  function load() {
    listCannedReplies().then(setReplies);
  }

  useEffect(() => {
    load();
  }, []);

  if (!replies) return <FullScreenLoader />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      await updateCannedReply(editingId, title, body);
    } else {
      await createCannedReply(title, body);
    }
    setTitle("");
    setBody("");
    setEditingId(null);
    load();
  }

  function startEdit(reply: CannedReplyDto) {
    setEditingId(reply.id);
    setTitle(reply.title);
    setBody(reply.body);
  }

  async function handleDelete(id: string) {
    await deleteCannedReply(id);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl overflow-y-auto p-6">
      <h1 className="mb-6 text-xl font-semibold">Canned replies</h1>

      <form onSubmit={handleSubmit} className="mb-6 space-y-3 rounded-xl border border-[var(--border)] p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
          className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Reply text"
          required
          rows={3}
          className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-[var(--btn-bg)] px-4 py-2 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
          >
            {editingId ? "Update" : "Add"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setTitle("");
                setBody("");
              }}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="space-y-2">
        {replies.map((reply) => (
          <div key={reply.id} className="rounded-xl border border-[var(--border)] p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{reply.title}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{reply.body}</p>
              </div>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => startEdit(reply)} className="text-[var(--color-accent-600)]">
                  Edit
                </button>
                <button type="button" onClick={() => handleDelete(reply.id)} className="text-red-500">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
