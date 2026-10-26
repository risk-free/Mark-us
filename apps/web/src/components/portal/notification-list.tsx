"use client";

import { useState } from "react";

import { apiClient, type NotificationItem } from "@/lib/portal-api";

export interface NotificationListLabels {
  empty: string;
  markRead: string;
  read: string;
}

/**
 * Notification list with idempotent mark-read (P2.6). The mutation carries the
 * `x-csrf-token` double-submit header (attached by `apiClient`); state is
 * optimistic local state seeded from the server-rendered props.
 */
export function NotificationList({
  notifications,
  labels,
}: {
  notifications: NotificationItem[];
  labels: NotificationListLabels;
}) {
  const [items, setItems] = useState(notifications);

  async function markRead(notificationId: string): Promise<void> {
    const result = await apiClient(`/notifications/${notificationId}/read`, {
      method: "POST",
    });
    if (!result.ok && result.status !== 204) return;
    setItems((current) =>
      current.map((item) =>
        item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    );
  }

  if (items.length === 0) return <p>{labels.empty}</p>;

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong>
          {item.body === null ? null : <p>{item.body}</p>}
          {item.readAt === null ? (
            <button type="button" onClick={() => void markRead(item.id)}>
              {labels.markRead}
            </button>
          ) : (
            <span>{labels.read}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
