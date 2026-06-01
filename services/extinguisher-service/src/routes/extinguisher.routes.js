const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { sendEmail, buildRegistrationEmail } = require('../mailer');

const router = express.Router();

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPES = ['CO2', 'Dry Powder', 'Foam', 'Water'];
const STATUSES = ['active', 'expired', 'serviced', 'decommissioned', 'pending_inspection'];

// Serial number: alphanumeric, hyphens, underscores, 3–100 chars
const SERIAL_REGEX = /^[A-Za-z0-9\-_\/]{3,100}$/;

// Location: printable chars, min 5
const LOCATION_REGEX = /^[\w\s\-\.,#\/()]{5,300}$/;

// ── Date validation helpers ───────────────────────────────────────────────────

function parseDate(str) {
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function validateExtinguisherDates({ manufactureDate, purchaseDate, expiryDate, lastInspectionDate, nextInspectionDate }) {
  const errors = [];
  const mfg = parseDate(manufactureDate);
  const pur = parseDate(purchaseDate);
  const exp = parseDate(expiryDate);
  const now = today();

  // Manufacture date must be in the past
  if (mfg && mfg >= now) {
    errors.push('Manufacture date must be in the past');
  }

  // Purchase date must be on or after manufacture date
  if (mfg && pur && pur < mfg) {
    errors.push('Purchase date cannot be before manufacture date');
  }

  // Purchase date must not be in the future
  if (pur && pur > now) {
    errors.push('Purchase date cannot be in the future');
  }

  // Expiry date must be after purchase date
  if (pur && exp && exp <= pur) {
    errors.push('Expiry date must be after purchase date');
  }

  // Expiry date must be after manufacture date
  if (mfg && exp && exp <= mfg) {
    errors.push('Expiry date must be after manufacture date');
  }

  // Last inspection date must be in the past or today
  if (lastInspectionDate) {
    const li = parseDate(lastInspectionDate);
    if (li && li > now) {
      errors.push('Last inspection date cannot be in the future');
    }
    // Last inspection must be after manufacture date
    if (li && mfg && li < mfg) {
      errors.push('Last inspection date cannot be before manufacture date');
    }
  }

  // Next inspection date must be in the future
  if (nextInspectionDate) {
    const ni = parseDate(nextInspectionDate);
    if (ni && ni <= now) {
      errors.push('Next inspection date must be a future date');
    }
    // Next inspection must be before expiry
    if (ni && exp && ni >= exp) {
      errors.push('Next inspection date must be before expiry date');
    }
  }

  return errors;
}

// ── Joi schemas ───────────────────────────────────────────────────────────────

const extinguisherSchema = Joi.object({
  serialNumber: Joi.string().pattern(SERIAL_REGEX).required()
    .messages({ 'string.pattern.base': 'Serial number must be 3–100 alphanumeric characters (hyphens/underscores allowed)' }),

  type: Joi.string().valid(...TYPES).required()
    .messages({ 'any.only': `Type must be one of: ${TYPES.join(', ')}` }),

  capacityLiters: Joi.number().positive().max(1000).precision(2).required()
    .messages({
      'number.positive': 'Capacity must be a positive number',
      'number.max': 'Capacity cannot exceed 1000 liters',
    }),

  manufactureDate: Joi.string().isoDate().required(),
  purchaseDate: Joi.string().isoDate().required(),
  expiryDate: Joi.string().isoDate().required(),
  lastInspectionDate: Joi.string().isoDate().optional().allow('', null),
  nextInspectionDate: Joi.string().isoDate().optional().allow('', null),

  location: Joi.string().pattern(LOCATION_REGEX).required()
    .messages({ 'string.pattern.base': 'Location must be at least 5 characters with valid characters' }),

  customerId: Joi.string().uuid().required()
    .messages({ 'string.guid': 'Customer ID must be a valid UUID' }),

  notes: Joi.string().max(1000).optional().allow('', null),
});

const updateSchema = Joi.object({
  serialNumber: Joi.string().pattern(SERIAL_REGEX)
    .messages({ 'string.pattern.base': 'Serial number must be 3–100 alphanumeric characters' }),
  type: Joi.string().valid(...TYPES),
  capacityLiters: Joi.number().positive().max(1000).precision(2),
  manufactureDate: Joi.string().isoDate(),
  purchaseDate: Joi.string().isoDate(),
  expiryDate: Joi.string().isoDate(),
  lastInspectionDate: Joi.string().isoDate().allow('', null),
  nextInspectionDate: Joi.string().isoDate().allow('', null),
  location: Joi.string().pattern(LOCATION_REGEX)
    .messages({ 'string.pattern.base': 'Location must be at least 5 characters' }),
  status: Joi.string().valid(...STATUSES),
  notes: Joi.string().max(1000).allow('', null),
}).min(1).messages({ 'object.min': 'At least one field must be provided for update' });

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateCode() {
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `EXT-${rand}`;
}

function computeComplianceStatus(expiryDate) {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const daysToExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  if (daysToExpiry < 0) return 'non_compliant';
  if (daysToExpiry <= 30) return 'critical';
  if (daysToExpiry <= 90) return 'warning';
  return 'compliant';
}

function formatExt(e) {
  return {
    id: e.id,
    extinguisherCode: e.extinguisher_code,
    serialNumber: e.serial_number,
    type: e.type,
    capacityLiters: parseFloat(e.capacity_liters),
    manufactureDate: e.manufacture_date,
    purchaseDate: e.purchase_date,
    expiryDate: e.expiry_date,
    lastInspectionDate: e.last_inspection_date,
    nextInspectionDate: e.next_inspection_date,
    location: e.location,
    customerId: e.customer_id,
    customerName: e.customer_name,
    customerOrg: e.customer_org,
    customerEmail: e.customer_email,
    status: e.status,
    complianceStatus: e.compliance_status,
    notes: e.notes,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST / — Register extinguisher
router.post('/', authenticate, async (req, res) => {
  // Step 1: Joi schema validation
  const { error, value } = extinguisherSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details.map(d => d.message),
    });
  }

  // Step 2: Business date logic validation
  const dateErrors = validateExtinguisherDates(value);
  if (dateErrors.length > 0) {
    return res.status(400).json({ success: false, message: 'Date validation failed', errors: dateErrors });
  }

  const { serialNumber, type, capacityLiters, manufactureDate, purchaseDate, expiryDate,
    lastInspectionDate, nextInspectionDate, location, customerId, notes } = value;

  // Step 3: Customer exists check
  const custCheck = await db.query(
    'SELECT id, full_name, email, organization_name FROM customers WHERE id = $1',
    [customerId]
  );
  if (custCheck.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Customer not found' });
  }
  const customer = custCheck.rows[0];

  // Step 4: Serial number uniqueness
  const serialCheck = await db.query('SELECT id FROM extinguishers WHERE serial_number = $1', [serialNumber]);
  if (serialCheck.rows.length > 0) {
    return res.status(409).json({ success: false, message: 'An extinguisher with this serial number is already registered' });
  }

  // Step 5: Generate unique code
  let extCode;
  for (let i = 0; i < 5; i++) {
    extCode = generateCode();
    const check = await db.query('SELECT id FROM extinguishers WHERE extinguisher_code = $1', [extCode]);
    if (check.rows.length === 0) break;
  }

  const complianceStatus = computeComplianceStatus(expiryDate);

  const result = await db.query(
    `INSERT INTO extinguishers
       (extinguisher_code, serial_number, type, capacity_liters, manufacture_date, purchase_date,
        expiry_date, last_inspection_date, next_inspection_date, location, customer_id,
        compliance_status, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [extCode, serialNumber, type, capacityLiters, manufactureDate, purchaseDate, expiryDate,
      lastInspectionDate || null, nextInspectionDate || null, location, customerId,
      complianceStatus, notes || null, req.user.id]
  );

  const ext = result.rows[0];

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, new_values)
     VALUES ($1,$2,'CREATE_EXTINGUISHER','extinguisher',$3,$4)`,
    [req.user.id, req.user.email, ext.id, JSON.stringify({ serialNumber, type, location, customerId })]
  );

  // Step 6: Send registration confirmation email to customer
  let emailSent = false;
  let emailError = null;

  if (customer.email) {
    try {
      const daysToExpiry = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
      await sendEmail({
        to: customer.email,
        subject: `[FEMCS] Fire Extinguisher Registered — ${extCode}`,
        html: buildRegistrationEmail({
          customerName: customer.full_name,
          extCode,
          serialNumber,
          type,
          capacityLiters,
          location,
          purchaseDate,
          expiryDate,
          daysToExpiry,
          complianceStatus,
        }),
      });
      emailSent = true;
    } catch (err) {
      emailError = err.message;
      console.error('Registration email failed:', err.message);
    }
  }

  res.status(201).json({
    success: true,
    message: 'Extinguisher registered successfully',
    data: formatExt({ ...ext, customer_name: customer.full_name, customer_org: customer.organization_name, customer_email: customer.email }),
    notification: {
      emailSent,
      emailRecipient: customer.email || null,
      emailError: emailError || null,
      reason: !customer.email ? 'Customer has no email address on file' : null,
    },
  });
});

// GET / — List extinguishers
router.get('/', authenticate, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const status = req.query.status || '';
  const type = req.query.type || '';
  const customerId = req.query.customerId || '';
  const compliance = req.query.compliance || '';

  // Validate enum filters
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${STATUSES.join(', ')}` });
  }
  if (type && !TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: `Invalid type. Must be one of: ${TYPES.join(', ')}` });
  }

  let where = `WHERE (e.extinguisher_code ILIKE $1 OR e.serial_number ILIKE $1 OR e.location ILIKE $1 OR c.full_name ILIKE $1)`;
  const params = [`%${search}%`];

  if (status) { params.push(status); where += ` AND e.status = $${params.length}`; }
  if (type) { params.push(type); where += ` AND e.type = $${params.length}`; }
  if (customerId) { params.push(customerId); where += ` AND e.customer_id = $${params.length}`; }
  if (compliance) { params.push(compliance); where += ` AND e.compliance_status = $${params.length}`; }

  const countRes = await db.query(
    `SELECT COUNT(*) FROM extinguishers e JOIN customers c ON c.id = e.customer_id ${where}`,
    params
  );
  const total = parseInt(countRes.rows[0].count);

  params.push(limit, offset);
  const result = await db.query(
    `SELECT e.*, c.full_name AS customer_name, c.organization_name AS customer_org, c.email AS customer_email
     FROM extinguishers e
     JOIN customers c ON c.id = e.customer_id
     ${where}
     ORDER BY e.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    success: true,
    data: result.rows.map(formatExt),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /stats — Inventory dashboard
router.get('/stats', authenticate, async (req, res) => {
  const [stats, byType, byCustomer] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'expired' OR expiry_date < NOW()) AS expired,
        COUNT(*) FILTER (WHERE status = 'serviced') AS serviced,
        COUNT(*) FILTER (WHERE status = 'pending_inspection') AS pending_inspection,
        COUNT(*) FILTER (WHERE compliance_status = 'non_compliant') AS non_compliant,
        COUNT(*) FILTER (WHERE compliance_status = 'critical') AS critical,
        COUNT(*) FILTER (WHERE compliance_status = 'warning') AS warning,
        COUNT(*) FILTER (WHERE expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days') AS expiring_30d,
        COUNT(*) FILTER (WHERE expiry_date BETWEEN NOW() AND NOW() + INTERVAL '90 days') AS expiring_90d
      FROM extinguishers
    `),
    db.query(`SELECT type, COUNT(*) AS count FROM extinguishers GROUP BY type ORDER BY count DESC`),
    db.query(`
      SELECT c.full_name, c.organization_name, COUNT(e.id) AS count
      FROM customers c
      LEFT JOIN extinguishers e ON e.customer_id = c.id
      GROUP BY c.id, c.full_name, c.organization_name
      ORDER BY count DESC LIMIT 10
    `),
  ]);

  res.json({
    success: true,
    data: { summary: stats.rows[0], byType: byType.rows, topCustomers: byCustomer.rows },
  });
});

// GET /:id — Get single extinguisher
router.get('/:id', authenticate, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid extinguisher ID format' });
  }

  const result = await db.query(
    `SELECT e.*, c.full_name AS customer_name, c.organization_name AS customer_org, c.email AS customer_email
     FROM extinguishers e
     JOIN customers c ON c.id = e.customer_id
     WHERE e.id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Extinguisher not found' });
  }
  res.json({ success: true, data: formatExt(result.rows[0]) });
});

// PUT /:id — Update extinguisher
router.put('/:id', authenticate, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid extinguisher ID format' });
  }

  const { error, value } = updateSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map(d => d.message) });
  }

  const existing = await db.query('SELECT * FROM extinguishers WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Extinguisher not found' });
  }
  const old = existing.rows[0];

  // Merge with existing for date validation
  const merged = {
    manufactureDate: value.manufactureDate || old.manufacture_date,
    purchaseDate: value.purchaseDate || old.purchase_date,
    expiryDate: value.expiryDate || old.expiry_date,
    lastInspectionDate: value.lastInspectionDate !== undefined ? value.lastInspectionDate : old.last_inspection_date,
    nextInspectionDate: value.nextInspectionDate !== undefined ? value.nextInspectionDate : old.next_inspection_date,
  };

  const dateErrors = validateExtinguisherDates(merged);
  if (dateErrors.length > 0) {
    return res.status(400).json({ success: false, message: 'Date validation failed', errors: dateErrors });
  }

  // Check serial uniqueness if changing
  if (value.serialNumber && value.serialNumber !== old.serial_number) {
    const serialCheck = await db.query(
      'SELECT id FROM extinguishers WHERE serial_number = $1 AND id != $2',
      [value.serialNumber, req.params.id]
    );
    if (serialCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Serial number already in use by another extinguisher' });
    }
  }

  const newExpiry = value.expiryDate || old.expiry_date;
  const complianceStatus = computeComplianceStatus(newExpiry);

  const result = await db.query(
    `UPDATE extinguishers SET
       serial_number = COALESCE($1, serial_number),
       type = COALESCE($2, type),
       capacity_liters = COALESCE($3, capacity_liters),
       manufacture_date = COALESCE($4, manufacture_date),
       purchase_date = COALESCE($5, purchase_date),
       expiry_date = COALESCE($6, expiry_date),
       last_inspection_date = COALESCE($7, last_inspection_date),
       next_inspection_date = COALESCE($8, next_inspection_date),
       location = COALESCE($9, location),
       status = COALESCE($10, status),
       compliance_status = $11,
       notes = COALESCE($12, notes)
     WHERE id = $13 RETURNING *`,
    [value.serialNumber, value.type, value.capacityLiters, value.manufactureDate,
      value.purchaseDate, value.expiryDate, value.lastInspectionDate, value.nextInspectionDate,
      value.location, value.status, complianceStatus, value.notes, req.params.id]
  );

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, old_values, new_values)
     VALUES ($1,$2,'UPDATE_EXTINGUISHER','extinguisher',$3,$4,$5)`,
    [req.user.id, req.user.email, req.params.id, JSON.stringify(old), JSON.stringify(value)]
  );

  res.json({ success: true, message: 'Extinguisher updated successfully', data: formatExt(result.rows[0]) });
});

// DELETE /:id — Admin only
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid extinguisher ID format' });
  }

  const existing = await db.query('SELECT * FROM extinguishers WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Extinguisher not found' });
  }

  await db.query('DELETE FROM extinguishers WHERE id = $1', [req.params.id]);

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, old_values)
     VALUES ($1,$2,'DELETE_EXTINGUISHER','extinguisher',$3,$4)`,
    [req.user.id, req.user.email, req.params.id, JSON.stringify(existing.rows[0])]
  );

  res.json({ success: true, message: 'Extinguisher removed successfully' });
});

module.exports = router;
