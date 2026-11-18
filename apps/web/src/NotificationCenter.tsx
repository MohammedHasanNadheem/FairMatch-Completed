import { useEffect, useState } from "react";
import { listNotifications, markNotificationsRead, type NotificationItem } from "./lib/api";

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listNotifications();
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // Keep UI resilient when notifications table is not yet migrated
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function markRead(id?: string) {
    try {
      const data = await markNotificationsRead(id);
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // Ignore transient errors
    }
  }

  return (
    <div className="notification-center">
      <button
        className="notification-toggle"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void refresh();
        }}
        aria-label="Updates"
      >
        Updates {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-panel" aria-label="Notifications">
          <header>
            <strong>Updates</strong>
            <div>
              {unreadCount > 0 && (
                <button type="button" onClick={() => markRead()}>Mark all read</button>
              )}
              <button type="button" onClick={() => setOpen(false)}>Close</button>
            </div>
          </header>
          {loading && !items.length ? (
            <p>Loading updates…</p>
          ) : items.length ? (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id} className={item.readAt ? "read" : "unread"}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                    <small>{new Date(item.createdAt).toLocaleString()}</small>
                  </div>
                  {!item.readAt && (
                    <button type="button" onClick={() => markRead(item.id)}>Read</button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>You have no new notifications. Status updates on applications and approvals will appear here.</p>
          )}
        </section>
      )}
    </div>
  );
}
