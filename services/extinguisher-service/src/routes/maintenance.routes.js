const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];

// Company/technician name: letters, numbers, spaces, common punctuation
const COMPANY_REGEX = /^[A-Za-z0-9À-ÖØ-öø-ÿ\s'\-\.,&()]{2,200}$/;
const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'\-\.]{2,200}$/;

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(str) {
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

const maintenanceSchema = Joi.object({
  extinguisherId: Joi.string().uuid().required()
    .messages({ 'string.guid': 'Extinguisher ID must be a valid UUID' }),

  serviceDate: Joi.string().isoDate().required(),

  serviceCompany: Joi.string().pattern(COMPANY_REGEX).required()
    .messages({ 'string.pattern.base': 'Service company name contains invalid characters' }),

  technicianName: Joi.string().pattern(NAME_REGEX).required()
    .messages({ 'string.pattern.base': 'Technician name must contain only letters, spaces, hyphens or apostrophes' }),

  nextServiceDate: Joi.string().isoDate().optional().allow('', null),

  cost: Joi.number().min(0).max(100000000).precision(2).default(0)
    .messages({ 'number.max': 'Cost cannot exceed 100,000,000' }),

  description: Joi.string().min(5).max(2000).optional().allow('', null)
    .messages({ 'string.min': 'Description must be at least 5 characters if provided' }),

  status: Joi.string().valid(...STATUSES).default('completed')
    .messages({ 'any.only': `Status must be one of: ${STATUSES.join(', ')}` }),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// POST / — Create maintenance record
router.post('/', authenticate, async (req, res) => {
  const { error, value } = maintenanceSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details.map(d => d.message),
    });
  }

  const { extinguisherId, serviceDate, serviceCompany, technicianName,
    nextServiceDate, cost, description, status } = value;

  // ── Date rules ───────────────────────────────────────────────────────────
  const dateErrors = [];
  const now = today();
  const svcDate = parseDate(serviceDate);

  // For completed/in_progress: service date must be past or today
  if (['completed', 'in_progress'].includes(status) && svcDate && svcDate > now) {
    dateErrors.push('Service date cannot be in the future for completed or in-progress records');
  }

  // For scheduled: service date must be today or future
  if (status === 'scheduled' && svcDate && svcDate < now) {
    dateErrors.push('Scheduled service date must be today or in the future');
  }

  // Next service date must be after service date
  if (nextServiceDate) {
    const nextDate = parseDate(nextServiceDate);
    if (nextDate && svcDate && nextDate <= svcDate) {
      dateErrors.push('Next service date must be after the service date');
    }
    if (nextDate && nextDate <= now) {
      dateErrors.push('Next service date must be a future date');
    }
  }

  if (dateErrors.length > 0) {
    return res.status(400).json({ success: false, message: 'Date validation failed', errors: dateErrors });
  }

  // ── Extinguisher exists ──────────────────────────────────────────────────
  const extCheck = await db.query(
    'SELECT id, manufacture_date FROM extinguishers WHERE id = $1',
    [extinguisherId]
  );
  if (extCheck.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Extinguisher not found' });
  }

  // Service date must be after manufacture date
  const mfgDate = parseDate(extCheck.rows[0].manufacture_date);
  if (mfgDate && svcDate && svcDate < mfgDate) {
    return res.status(400).json({
      success: false,
      message: 'Service date cannot be before the extinguisher manufacture date',
    });
  }

  const result = await db.query(
    `INSERT INTO maintenance
       (extinguisher_id, service_date, service_company, technician_name, next_service_date, cost, description, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [extinguisherId, serviceDate, serviceCompany, technicianName,
      nextServiceDate || null, cost, description || null, status, req.user.id]
  );

  if (status === 'completed') {
    await db.query(`UPDATE extinguishers SET status = 'serviced' WHERE id = $1`, [extinguisherId]);
  }

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, new_values)
     VALUES ($1,$2,'CREATE_MAINTENANCE','maintenance',$3,$4)`,
    [req.user.id, req.user.email, result.rows[0].id,
      JSON.stringify({ extinguisherId, serviceDate, status })]
  );

  res.status(201).json({
    success: true,
    message: 'Maintenance record created',
    data: formatMaintenance(result.rows[0]),
  });
});

// GET / — List maintenance records
router.get('/', authenticate, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const offset = (page - 1) * limit;
  const extinguisherId = req.query.extinguisherId || '';
  const status = req.query.status || '';

  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${STATUSES.join(', ')}` });
  }

  let where = 'WHERE 1=1';
  const params = [];

  if (extinguisherId) {
    if (!/^[0-9a-f-]{36}$/i.test(extinguisherId)) {
      return res.status(400).json({ success: false, message: 'Invalid extinguisher ID format' });
    }
    params.push(extinguisherId);
    where += ` AND m.extinguisher_id = $${params.length}`;
  }
  if (status) { params.push(status); where += ` AND m.status = $${params.length}`; }

  const countRes = await db.query(`SELECT COUNT(*) FROM maintenance m ${where}`, params);
  const total = parseInt(countRes.rows[0].count);

  params.push(limit, offset);
  const result = await db.query(
    `SELECT m.*, e.extinguisher_code
     FROM maintenance m
     JOIN extinguishers e ON e.id = m.extinguisher_id
     ${where}
     ORDER BY m.service_date DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    success: true,
    data: result.rows.map(formatMaintenance),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /:id
router.get('/:id', authenticate, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid maintenance ID format' });
  }

  const result = await db.query(
    `SELECT m.*, e.extinguisher_code
     FROM maintenance m JOIN extinguishers e ON e.id = m.extinguisher_id
     WHERE m.id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Maintenance record not found' });
  }
  res.json({ success: true, data: formatMaintenance(result.rows[0]) });
});

// PATCH /:id/status
router.patch('/:id/status', authenticate, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid maintenance ID format' });
  }

  const { status } = req.body;
  if (!status || !STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `Status must be one of: ${STATUSES.join(', ')}` });
  }

  const existing = await db.query('SELECT * FROM maintenance WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Maintenance record not found' });
  }

  // Cannot reopen a cancelled record
  if (existing.rows[0].status === 'cancelled' && status !== 'cancelled') {
    return res.status(400).json({ success: false, message: 'Cannot change status of a cancelled maintenance record' });
  }

  const result = await db.query(
    `UPDATE maintenance SET status = $1 WHERE id = $2 RETURNING *`,
    [status, req.params.id]
  );

  if (status === 'completed') {
    await db.query(`UPDATE extinguishers SET status = 'serviced' WHERE id = $1`, [result.rows[0].extinguisher_id]);
  }

  res.json({ success: true, message: 'Status updated', data: formatMaintenance(result.rows[0]) });
});

function formatMaintenance(m) {
  return {
    id: m.id,
    extinguisherId: m.extinguisher_id,
    extinguisherCode: m.extinguisher_code,
    serviceDate: m.service_date,
    serviceCompany: m.service_company,
    technicianName: m.technician_name,
    nextServiceDate: m.next_service_date,
    cost: parseFloat(m.cost),
    description: m.description,
    status: m.status,
    createdAt: m.created_at,
  };
}

module.exports = router;
