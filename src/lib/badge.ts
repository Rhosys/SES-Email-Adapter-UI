/**
 * Formats a notification/count badge. Caps at "99+" and appends "+" when the
 * store only knows there are "at least N" items (paginated, more not yet loaded).
 */
export function formatBadgeCount(count: number, hasMore: boolean): string {
  if (count > 99) return '99+'
  return hasMore ? `${count}+` : `${count}`
}
