const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { checkExpiryAndNotify, checkEscalations } = require('../scheduler');

const router = express.Router();

function formatNotification(n) {
  return {
    id: n.id,
    customerId: n.customer_id,
    extinguisherId: n.extinguisher_id,
    userId: n.user_id,
    type: n.type,
    title: n.title,
    message: n.message,
    isRead: n.is_read,
    emailSent: n.email_sent,
    emailSentAt: n.email_sent_at,
    daysUntilExpiry: n.days_until_expiry,
    escalationStage: n.escalation_stage,
    createdAt: n.created_at,
  };
}

// GET / - Get notifications for current user
router.get('/', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const unreadOnly = req.query.unread === 'true';
  const type = req.query.type || '';

  let where = `WHERE n.user_id = $1`;
  const params = [req.user.id];

  if (unreadOnly) { where += ` AND n.is_read = false`; }
  if (type) { params.push(type); where += ` AND n.type = $${params.length}`; }

  const countRes = await db.query(`SELECT COUNT(*) FROM notifications n ${where}`, params);
  const total = parseInt(countRes.rows[0].count);

  const unreadCount = await db.query(
    `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`,
    [req.user.id]
  );

  params.push(limit, offset);
  const result = await db.query(
    `SELECT n.* FROM notifications n ${where}
     ORDER BY n.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    success: true,
    data: result.rows.map(formatNotification),
    unreadCount: parseInt(unreadCount.rows[0].count),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// PATCH /:id/read - Mark single notification as read
router.patch('/:id/read', authenticate, async (req, res) => {
  const result = await db.query(
    `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.user.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }
  res.json({ success: true, message: 'Marked as read', data: formatNotification(result.rows[0]) });
});

// PATCH /read-all - Mark all as read
router.patch('/read-all', authenticate, async (req, res) => {
  await db.query(
    `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
    [req.user.id]
  );
  res.json({ success: true, message: 'All notifications marked as read' });
});

// GET /escalations - List escalations (admin/safety_officer)
router.get('/escalations', authenticate, authorize('admin', 'safety_officer'), async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const status = req.query.status || '';

  let where = 'WHERE 1=1';
  const params = [];
  if (status) { params.push(status); where += ` AND esc.status = $${params.length}`; }

  const countRes = await db.query(`SELECT COUNT(*) FROM escalations esc ${where}`, params);
  const total = parseInt(countRes.rows[0].count);

  params.push(limit, offset);
  const result = await db.query(
    `SELECT esc.*, e.extinguisher_code, e.serial_number, e.location,
            c.full_name AS customer_name, c.organization_name
     FROM escalations esc
     JOIN extinguishers e ON e.id = esc.extinguisher_id
     JOIN customers c ON c.id = esc.customer_id
     ${where}
     ORDER BY esc.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    success: true,
    data: result.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// PATCH /escalations/:id/resolve
router.patch('/escalations/:id/resolve', authenticate, authorize('admin', 'safety_officer'), async (req, res) => {
  const { notes } = req.body;
  const result = await db.query(
    `UPDATE escalations SET status = 'resolved', resolved_at = NOW(), resolved_by = $1, notes = COALESCE($2, notes)
     WHERE id = $3 RETURNING *`,
    [req.user.id, notes || null, req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Escalation not found' });
  }
  res.json({ success: true, message: 'Escalation resolved', data: result.rows[0] });
});

// POST /trigger-check - Manually trigger expiry check (admin only)
router.post('/trigger-check', authenticate, authorize('admin'), async (req, res) => {
  res.json({ success: true, message: 'Expiry check triggered. Processing in background.' });
  setImmediate(async () => {
    try {
      await checkExpiryAndNotify();
      await checkEscalations();
    } catch (err) {
      console.error('Manual trigger error:', err.message);
    }
  });
});

module.exports = router;
