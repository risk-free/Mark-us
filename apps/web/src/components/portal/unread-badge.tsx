/**
 * Unread-notification badge for the portal nav (P2.6). Pure renderer: the
 * count comes from the server-fetched `unreadCount`; zero renders nothing.
 */
export function UnreadBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span role="status" aria-label={label.replace("{count}", String(count))}>
      {count}
    </span>
  );
}
