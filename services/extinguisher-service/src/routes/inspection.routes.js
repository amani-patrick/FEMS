const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(str) {
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const inspectionSchema = Joi.object({
  extinguisherId: Joi.string().uuid().required()
    .messages({ 'string.guid': 'Extinguisher ID must be a valid UUID' }),

  inspectorName: Joi.string()
    .pattern(/^[A-Za-zÀ-ÖØ-öø-ÿ\s'\-\.]{2,200}$/)
    .required()
    .messages({ 'string.pattern.base': 'Inspector name must contain only letters, spaces, hyphens or apostrophes' }),

  inspectionDate: Joi.string().isoDate().required(),

  findings: Joi.string().min(5).max(2000).optional().allow('', null)
    .messages({ 'string.min': 'Findings must be at least 5 characters if provided' }),

  status: Joi.string().valid('Passed', 'Requires Service', 'Failed').required()
    .messages({ 'any.only': 'Status must be one of: Passed, Requires Service, Failed' }),

  nextInspectionDate: Joi.string().isoDate().optional().allow('', null),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// POST / — Record inspection
router.post('/', authenticate, async (req, res) => {
  const { error, value } = inspectionSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details.map(d => d.message),
    });
  }

  const { extinguisherId, inspectorName, inspectionDate, findings, status, nextInspectionDate } = value;

  // ── Business date rules ──────────────────────────────────────────────────
  const dateErrors = [];
  const now = today();
  const inspDate = parseDate(inspectionDate);

  // Inspection date cannot be in the future
  if (inspDate && inspDate > now) {
    dateErrors.push('Inspection date cannot be in the future');
  }

  // Next inspection date must be strictly after inspection date
  if (nextInspectionDate) {
    const nextDate = parseDate(nextInspectionDate);
    if (nextDate && inspDate && nextDate <= inspDate) {
      dateErrors.push('Next inspection date must be after the inspection date');
    }
    if (nextDate && nextDate <= now) {
      dateErrors.push('Next inspection date must be a future date');
    }
  }

  if (dateErrors.length > 0) {
    return res.status(400).json({ success: false, message: 'Date validation failed', errors: dateErrors });
  }

  // ── Extinguisher exists ──────────────────────────────────────────────────
  const extCheck = await db.query(
    'SELECT id, expiry_date, manufacture_date FROM extinguishers WHERE id = $1',
    [extinguisherId]
  );
  if (extCheck.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Extinguisher not found' });
  }

  const ext = extCheck.rows[0];

  // Inspection date must be after manufacture date
  const mfgDate = parseDate(ext.manufacture_date);
  if (mfgDate && inspDate && inspDate < mfgDate) {
    return res.status(400).json({
      success: false,
      message: 'Inspection date cannot be before the extinguisher manufacture date',
    });
  }

  // Next inspection must be before expiry
  if (nextInspectionDate && ext.expiry_date) {
    const nextDate = parseDate(nextInspectionDate);
    const expDate = parseDate(ext.expiry_date);
    if (nextDate && expDate && nextDate >= expDate) {
      return res.status(400).json({
        success: false,
        message: 'Next inspection date must be before the extinguisher expiry date',
      });
    }
  }

  // ── Insert ───────────────────────────────────────────────────────────────
  const result = await db.query(
    `INSERT INTO inspections
       (extinguisher_id, inspector_id, inspector_name, inspection_date, findings, status, next_inspection_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [extinguisherId, req.user.id, inspectorName, inspectionDate,
      findings || null, status, nextInspectionDate || null, req.user.id]
  );

  // Update extinguisher last/next inspection dates and status
  const newExtStatus = status === 'Failed'
    ? 'pending_inspection'
    : status === 'Requires Service'
      ? 'pending_inspection'
      : 'active';

  await db.query(
    `UPDATE extinguishers SET
       last_inspection_date = $1,
       next_inspection_date = COALESCE($2, next_inspection_date),
       status = $3
     WHERE id = $4`,
    [inspectionDate, nextInspectionDate || null, newExtStatus, extinguisherId]
  );

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, new_values)
     VALUES ($1,$2,'CREATE_INSPECTION','inspection',$3,$4)`,
    [req.user.id, req.user.email, result.rows[0].id,
      JSON.stringify({ extinguisherId, status, inspectionDate })]
  );

  res.status(201).json({
    success: true,
    message: 'Inspection recorded successfully',
    data: formatInspection(result.rows[0]),
  });
});

// GET / — List inspections
router.get('/', authenticate, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const offset = (page - 1) * limit;
  const extinguisherId = req.query.extinguisherId || '';
  const status = req.query.status || '';

  const validStatuses = ['Passed', 'Requires Service', 'Failed'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  let where = 'WHERE 1=1';
  const params = [];

  if (extinguisherId) {
    if (!/^[0-9a-f-]{36}$/i.test(extinguisherId)) {
      return res.status(400).json({ success: false, message: 'Invalid extinguisher ID format' });
    }
    params.push(extinguisherId);
    where += ` AND i.extinguisher_id = $${params.length}`;
  }
  if (status) { params.push(status); where += ` AND i.status = $${params.length}`; }

  const countRes = await db.query(`SELECT COUNT(*) FROM inspections i ${where}`, params);
  const total = parseInt(countRes.rows[0].count);

  params.push(limit, offset);
  const result = await db.query(
    `SELECT i.*, e.extinguisher_code
     FROM inspections i
     JOIN extinguishers e ON e.id = i.extinguisher_id
     ${where}
     ORDER BY i.inspection_date DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    success: true,
    data: result.rows.map(formatInspection),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /:id
router.get('/:id', authenticate, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid inspection ID format' });
  }

  const result = await db.query(
    `SELECT i.*, e.extinguisher_code
     FROM inspections i JOIN extinguishers e ON e.id = i.extinguisher_id
     WHERE i.id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Inspection not found' });
  }
  res.json({ success: true, data: formatInspection(result.rows[0]) });
});

function formatInspection(i) {
  return {
    id: i.id,
    extinguisherId: i.extinguisher_id,
    extinguisherCode: i.extinguisher_code,
    inspectorId: i.inspector_id,
    inspectorName: i.inspector_name,
    inspectionDate: i.inspection_date,
    findings: i.findings,
    status: i.status,
    nextInspectionDate: i.next_inspection_date,
    createdAt: i.created_at,
  };
}

module.exports = router;
