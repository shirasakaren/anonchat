/**
 * True only at the exact moment a user finishes typing a fresh OPENING
 * ``` fence at the cursor - not on every keystroke that happens to contain
 * backticks (which would fight someone editing an existing block), not on
 * a fence that CLOSES an already-open block, and not on 4+ backticks.
 * A code fence must start a line, per standard markdown, so this also
 * requires the ``` to be preceded by a newline or the start of the text.
 */
export function justCompletedFreshCodeFence(value: string, cursor: number): boolean {
  const before = value.slice(0, cursor);
  if (!before.endsWith("```")) return false;

  const beforeFence = before.slice(0, -3);
  if (beforeFence.length > 0 && !beforeFence.endsWith("\n")) return false;
  if (beforeFence.endsWith("`")) return false;

  const priorFenceCount = (beforeFence.match(/```/g) ?? []).length;
  return priorFenceCount % 2 === 0;
}
