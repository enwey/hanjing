// Called inside the binding transaction, with the changed user's lock held.
// Only direct children's second-level edges change, never deeper descendants.
export async function syncDirectChildrenSecondLevel(conn, userId, parentUserId) {
  const [children] = await conn.execute(
    'SELECT child_user_id FROM distribution_relationships WHERE parent_user_id = ? AND level = 1 ORDER BY child_user_id FOR UPDATE',
    [userId]);
  for (const child of children) {
    await conn.execute(
      `INSERT INTO distribution_relationships (parent_user_id, child_user_id, level) VALUES (?, ?, 2)
       ON DUPLICATE KEY UPDATE parent_user_id = VALUES(parent_user_id)`,
      [parentUserId, child.child_user_id]);
  }
}
