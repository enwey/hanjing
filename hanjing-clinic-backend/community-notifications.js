import { transaction, query } from './db.js';
import { notifyBusiness, writeNotification } from './notification-center.js';
import { logAdminAction } from './helpers.js';

export async function initCommunityNotifications(q) {
  for (const [table, additions] of Object.entries({
    community_reports: { result_text: 'VARCHAR(1000) NULL', handled_by: 'BIGINT UNSIGNED NULL', handled_at: 'DATETIME NULL' },
    community_posts: { reject_reason: 'VARCHAR(500) NULL' }
  })) {
    const columns = await q(`SHOW COLUMNS FROM ${table}`);
    for (const [name, definition] of Object.entries(additions)) {
      if (!columns.some(column => column.Field === name)) await q(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
  await q(`CREATE TABLE IF NOT EXISTS notification_like_actors (
    recipient_id BIGINT UNSIGNED NOT NULL, target_key VARCHAR(100) NOT NULL, event_day DATE NOT NULL,
    actor_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY(recipient_id,target_key,event_day,actor_id),
    FOREIGN KEY(recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
}

export async function recordCommunityLike(conn, { userId, actorId, postId, commentId, title }) {
  if (!userId || Number(userId) === Number(actorId)) return;
  const target = commentId ? `comment:${commentId}` : `post:${postId}`;
  // Lock the recipient to serialize concurrent likes across one aggregation group.
  await conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
  const [[day]] = await conn.execute("SELECT DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+08:00'),'%Y-%m-%d') day");
  const [inserted] = await conn.execute('INSERT IGNORE INTO notification_like_actors(recipient_id,target_key,event_day,actor_id) VALUES(?,?,?,?)', [userId,target,day.day,actorId]);
  if (!inserted.affectedRows) return;
  const [[count]] = await conn.execute('SELECT COUNT(*) total FROM notification_like_actors WHERE recipient_id=? AND target_key=? AND event_day=?', [userId,target,day.day]);
  await writeNotification(conn, { userId, type:'community', title:commentId?'评论收到点赞':'帖子收到点赞',
    content:`今天已有 ${count.total} 人点赞了你${commentId?'在《'+title+'》中的评论':'的帖子《'+title+'》'}。`,
    businessType:'post',businessId:postId,event:'like_aggregate',onceKey:`${target}:${day.day}`,replaceExisting:true,
    metadata:{ ...(commentId?{commentId:String(commentId)}:{}), count:Number(count.total) }
  });
}

// Reports are public-content moderation, governed by the existing content:audit permission.
export function installCommunityReportRoutes(app, authenticateToken) {
  app.get('/api/admin/content/reports', authenticateToken, async (req, res) => {
    const status = req.query.status || 'pending';
    if (!['pending', 'resolved', 'dismissed', 'all'].includes(status)) return res.status(400).json({ code: 400, message: '举报状态无效' });
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const where = status === 'all' ? '1=1' : 'r.status=?';
    const params = status === 'all' ? [] : [status];
    const rows = await query(`SELECT r.id,r.post_id,r.reason,r.status,r.result_text,r.created_at,r.handled_at,p.title
      FROM community_reports r JOIN community_posts p ON p.id=r.post_id WHERE ${where}
      ORDER BY r.id DESC LIMIT ${Math.floor(limit)} OFFSET ${Math.floor((page - 1) * limit)}`, params);
    const [count] = await query(`SELECT COUNT(*) total FROM community_reports r WHERE ${where}`, params);
    res.json({ code: 200, data: { list: rows, total: Number(count.total) } });
  });
  app.put('/api/admin/content/reports/:id', authenticateToken, async (req, res) => {
    const { status, result_text: resultText } = req.body;
    const result = typeof resultText === 'string' ? resultText.trim() : '';
    if (!['resolved', 'dismissed'].includes(status) || !result || result.length > 1000) return res.status(400).json({ code: 400, message: '请选择处理结果并填写处理说明（最多1000字）' });
    try {
      await transaction(async conn => {
        const [[report]] = await conn.execute('SELECT * FROM community_reports WHERE id=? FOR UPDATE', [req.params.id]);
        if (!report) throw Object.assign(new Error('举报不存在'), { statusCode: 404 });
        if (report.status === status && report.result_text === result) return;
        await conn.execute('UPDATE community_reports SET status=?,result_text=?,handled_by=?,handled_at=NOW() WHERE id=?', [status, result, req.user.id, report.id]);
        await notifyBusiness(conn, 'report', report.id, 'processed', { revision: `${status}:${result}` });
      });
      await logAdminAction(req.user.id, 'resolve_community_report', 'community_report', req.params.id, { status, result_text: result });
      res.json({ code: 200, message: '处理结果已通知举报人' });
    } catch (error) { res.status(error.statusCode || 500).json({ code: error.statusCode || 500, message: error.statusCode ? error.message : '处理失败，请重试' }); }
  });
}
