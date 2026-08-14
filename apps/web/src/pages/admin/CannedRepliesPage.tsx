import { useEffect, useState } from "react";
import type { CannedReplyDto } from "@anonchat/shared";
import { createCannedReply, deleteCannedReply, listCannedReplies, updateCannedReply } from "../../api/admin.js";
import { ApiError } from "../../api/client.js";
import { FullScreenLoader } from "../../components/common/Loader.js";

/** Titles double as the "/name" typed in the composer to trigger a
 *  template, so they can't contain spaces - auto-format as the admin types
 *  (spaces/other punctuation -> dashes) rather than only rejecting on
 *  submit, matching CannedReplyTitleSchema on the server. */
function sanitizeTitle(value: string): string {
  return value.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "");
}

export default function CannedRepliesPage() {
  const [replies, setReplies] = useState<CannedReplyDto[] | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    listCannedReplies().then(setReplies);
  }

  useEffect(() => {
    load();
  }, []);

  if (!replies) return <FullScreenLoader />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await updateCannedReply(editingId, title, body);
      } else {
        await createCannedReply(title, body);
      }
      setTitle("");
      setBody("");
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that template.");
    }
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-6 text-xl font-semibold">Canned replies</h1>

        <form onSubmit={handleSubmit} className="mb-6 space-y-3 rounded-xl border border-[var(--border)] p-4">
          <div>
            <div className="flex items-center rounded-lg border border-[var(--border-strong)]">
              <span className="pl-3 text-sm text-[var(--text-muted)]" aria-hidden>
                /
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(sanitizeTitle(e.target.value))}
                placeholder="template-name"
                required
                maxLength={40}
                className="w-full bg-transparent py-2 pl-1 pr-3 text-sm outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Type <code>/{title || "template-name"}</code> in the composer to use this template.
            </p>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Reply text (markdown supported)"
            required
            rows={3}
            className="w-full rounded-lg border border-[var(--border-strong)] bg-transparent px-3 py-2 text-sm"
          />
          {error && <p className="text-sm text-[var(--danger-fg)]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[var(--btn-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]"
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

        {replies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">
            <p>No canned replies yet.</p>
            <p className="mt-1">Add one above to reuse it while replying to conversations.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {replies.map((reply) => (
              <div key={reply.id} className="rounded-xl border border-[var(--border)] p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{reply.title}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{reply.body}</p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => startEdit(reply)}
                      className="text-[var(--link-fg)] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(reply.id)}
                      className="text-[var(--danger-fg)] hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
