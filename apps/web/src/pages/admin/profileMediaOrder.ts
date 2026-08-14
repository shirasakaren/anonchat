export function mediaOrdersEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function moveMediaOrder(order: string[], sourceId: string, targetId: string): string[] {
  if (sourceId === targetId) return order;
  const sourceIndex = order.indexOf(sourceId);
  const targetIndex = order.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return order;

  const next = [...order];
  const [moved] = next.splice(sourceIndex, 1);
  if (!moved) return order;
  next.splice(targetIndex, 0, moved);
  return next;
}

/** Keeps the admin's local drag order for surviving items while accepting
 * newly uploaded items and removing media deleted on the server. */
export function reconcileMediaOrder(draft: string[], serverOrder: string[]): string[] {
  const available = new Set(serverOrder);
  const retained = draft.filter((id) => available.has(id));
  const retainedSet = new Set(retained);
  return [...retained, ...serverOrder.filter((id) => !retainedSet.has(id))];
}
