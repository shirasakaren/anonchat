/** Human-readable phrasing for audit log action codes - the raw codes
 *  ("conversation.deleted.permanent") are precise but not something an
 *  admin should have to parse. Falls back to the raw code for anything
 *  not yet listed here rather than hiding it. */
const LABELS: Record<string, string> = {
  "admin.login": "Signed in",
  "admin.onboarded": "Completed initial setup",
  "admin.session.revoked": "Revoked a session",
  "admin.totp.enabled": "Enabled two-factor authentication",
  "admin.totp.disabled": "Disabled two-factor authentication",
  "conversation.archived": "Archived a conversation",
  "conversation.unarchived": "Unarchived a conversation",
  "conversation.blocked": "Blocked a conversation",
  "conversation.unblocked": "Unblocked a conversation",
  "conversation.deleted.soft": "Moved a conversation to trash",
  "conversation.deleted.permanent": "Permanently deleted a conversation",
  "conversation.restored": "Restored a conversation from trash",
  "conversation.alias_updated": "Updated a conversation alias",
  "conversation.muted": "Muted a conversation",
  "conversation.unmuted": "Unmuted a conversation",
  "message.edited": "Edited a message",
  "message.deleted": "Deleted a message",
  "message.reaction.set": "Reacted to a message",
  "message.reaction.cleared": "Removed a reaction",
  "settings.updated": "Updated site settings",
  "settings.avatar_updated": "Updated the site avatar",
};

export function describeAuditAction(action: string): string {
  return LABELS[action] ?? action;
}
