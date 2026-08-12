import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ConversationList } from "./ConversationList.js";
import { ConversationView } from "./ConversationView.js";

export default function Inbox() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const [refreshToken, setRefreshToken] = useState(0);

  const bump = useCallback(() => setRefreshToken((n) => n + 1), []);

  return (
    <div className="flex h-full">
      <div className={conversationId ? "hidden md:block" : "block w-full md:w-auto"}>
        <ConversationList
          selectedId={conversationId ?? null}
          onSelect={(id) => navigate(`/admin/c/${id}`)}
          refreshToken={refreshToken}
        />
      </div>
      <div className={conversationId ? "block w-full" : "hidden md:block md:flex-1"}>
        {conversationId ? (
          <div className="flex h-full flex-col">
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="flex items-center gap-1 border-b border-[var(--border)] px-4 py-2 text-left text-xs text-[var(--color-accent-600)] md:hidden"
            >
              <ArrowLeft size={13} aria-hidden />
              Back to conversations
            </button>
            <div className="flex-1 overflow-hidden">
              <ConversationView conversationId={conversationId} onChanged={bump} />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            Select a conversation to view it here.
          </div>
        )}
      </div>
    </div>
  );
}
