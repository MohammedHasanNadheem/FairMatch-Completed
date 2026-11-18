import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "./database";
import type { TokenClaims } from "./identity";

type NotificationRow = RowDataPacket & {
  id: string;
  title: string;
  body: string;
  category: "application" | "approval" | "organisation" | "system";
  entity_type: string | null;
  entity_id: string | null;
  read_at: Date | null;
  created_at: Date;
};

export async function createNotification(input: {
  userId: string;
  title: string;
  body: string;
  category?: "application" | "approval" | "organisation" | "system";
  entityType?: string;
  entityId?: string;
}) {
  try {
    await database().execute(
      `INSERT INTO notifications (id, user_id, title, body, category, entity_type, entity_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.userId,
        input.title.slice(0, 180),
        input.body.slice(0, 500),
        input.category ?? "system",
        input.entityType ?? null,
        input.entityId ?? null,
      ],
    );
  } catch {
    // Notification persistence should never block primary workflow mutations if migration 003 is pending.
  }
}

export async function listNotifications(actor: TokenClaims) {
  const [rows] = await database().execute<NotificationRow[]>(
    `SELECT id, title, body, category, entity_type, entity_id, read_at, created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 30`,
    [actor.sub],
  );
  const items = rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  }));
  return {
    items,
    unreadCount: items.filter((item) => !item.readAt).length,
  };
}

export async function markNotificationsRead(actor: TokenClaims, notificationId?: string) {
  if (notificationId) {
    await database().execute<ResultSetHeader>(
      "UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ? AND read_at IS NULL",
      [notificationId, actor.sub],
    );
  } else {
    await database().execute<ResultSetHeader>(
      "UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL",
      [actor.sub],
    );
  }
  return listNotifications(actor);
}
