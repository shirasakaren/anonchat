import { differenceInCalendarDays, format } from "date-fns";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * WhatsApp/Slack-style date separator label: "Today"/"Yesterday" for the
 * last two calendar days, the weekday name for days 2-6 back, and a
 * calendar date (with year only if it isn't this year) at 7+ days back.
 * Weekday names stop at day 6 deliberately - day 7 back shares its weekday
 * name with today, which would be ambiguous.
 */
export function formatDateSeparator(date: Date, now: Date = new Date()): string {
  const daysBack = differenceInCalendarDays(now, date);
  if (daysBack <= 0) return "Today";
  if (daysBack === 1) return "Yesterday";
  if (daysBack <= 6) return WEEKDAY_NAMES[date.getDay()] ?? format(date, "EEEE");
  const sameYear = date.getFullYear() === now.getFullYear();
  return format(date, sameYear ? "MMMM d" : "MMMM d, yyyy");
}

export interface DateSeparatorItem {
  kind: "separator";
  key: string;
  label: string;
}

export interface MessageItem<M> {
  kind: "message";
  key: string;
  message: M;
}

export type ThreadItem<M> = DateSeparatorItem | MessageItem<M>;

/** Interleaves a date-separator item before the first message of every new
 *  local calendar day in an already-chronologically-sorted message list. */
export function withDateSeparators<M extends { id: string; createdAt: string }>(
  messages: M[],
  now: Date = new Date(),
): ThreadItem<M>[] {
  const items: ThreadItem<M>[] = [];
  let lastDayKey: string | null = null;
  for (const message of messages) {
    const date = new Date(message.createdAt);
    const dayKey = format(date, "yyyy-MM-dd");
    if (dayKey !== lastDayKey) {
      items.push({ kind: "separator", key: `sep-${dayKey}`, label: formatDateSeparator(date, now) });
      lastDayKey = dayKey;
    }
    items.push({ kind: "message", key: message.id, message });
  }
  return items;
}
