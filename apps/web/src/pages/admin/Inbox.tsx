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
      {/* min-w-0 is load-bearing: as a flex item of the row above, this pane
          otherwise defaults to a min-width based on its content's intrinsic
          size - an unbroken long reply preview (URL, filename) then refuses
          to shrink and grows the whole row past the viewport instead of
          truncating, pushing the composer's Send button off-screen with no
          scrollbar to reach it (the ancestor <main> in DashboardLayout clips
          overflow-x, so it's invisible, not just scrolled away). */}
      <div className={conversationId ? "min-w-0 block w-full" : "hidden md:block md:flex-1"}>
        {conversationId ? (
          <div className="flex h-full flex-col">
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="flex items-center gap-1 border-b border-[var(--border)] px-4 py-2 text-left text-xs text-[var(--link-fg)] hover:underline md:hidden"
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
