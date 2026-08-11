export const AnonymousUserStatus = {
  ACTIVE: "ACTIVE",
  BLOCKED: "BLOCKED",
  DELETED: "DELETED",
} as const;
export type AnonymousUserStatus = (typeof AnonymousUserStatus)[keyof typeof AnonymousUserStatus];

export const ConversationStatus = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
  BLOCKED: "BLOCKED",
} as const;
export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];

export const SenderType = {
  USER: "USER",
  ADMIN: "ADMIN",
} as const;
export type SenderType = (typeof SenderType)[keyof typeof SenderType];

export const SessionKind = {
  ANONYMOUS: "ANONYMOUS",
  ADMIN: "ADMIN",
} as const;
export type SessionKind = (typeof SessionKind)[keyof typeof SessionKind];
