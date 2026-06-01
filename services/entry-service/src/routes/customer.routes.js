const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ── Regex patterns ────────────────────────────────────────────────────────────

// Rwanda National ID: 16 digits
const RWANDA_NID_REGEX = /^\d{16}$/;

// Phone: Rwanda (+250) or generic international, 10–15 digits
const PHONE_REGEX = /^(\+?250|0)?[0-9]{9,12}$/;

// Name: letters, spaces, hyphens, apostrophes only
const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'\-\.]{2,200}$/;

// Organization: letters, numbers, spaces, common punctuation
const ORG_REGEX = /^[A-Za-z0-9À-ÖØ-öø-ÿ\s'\-\.,&()]{2,200}$/;

// ── Schemas ───────────────────────────────────────────────────────────────────

const customerSchema = Joi.object({
  fullName: Joi.string().pattern(NAME_REGEX).min(2).max(200).required()
    .messages({ 'string.pattern.base': 'Full name must contain only letters, spaces, hyphens or apostrophes' }),

  nationalId: Joi.string().pattern(RWANDA_NID_REGEX).optional().allow('', null)
    .messages({ 'string.pattern.base': 'National ID must be exactly 16 digits (Rwanda NID format)' }),

  phone: Joi.string().pattern(PHONE_REGEX).required()
    .messages({ 'string.pattern.base': 'Phone must be a valid Rwanda number (e.g. 0788000000 or +250788000000)' }),

  email: Joi.string().email({ tlds: { allow: false } }).max(255).optional().allow('', null),

  address: Joi.string().min(5).max(500).optional().allow('', null)
    .messages({ 'string.min': 'Address must be at least 5 characters' }),

  organizationName: Joi.string().pattern(ORG_REGEX).max(200).optional().allow('', null)
    .messages({ 'string.pattern.base': 'Organization name contains invalid characters' }),
});

const updateSchema = Joi.object({
  fullName: Joi.string().pattern(NAME_REGEX).min(2).max(200)
    .messages({ 'string.pattern.base': 'Full name must contain only letters, spaces, hyphens or apostrophes' }),

  nationalId: Joi.string().pattern(RWANDA_NID_REGEX).allow('', null)
    .messages({ 'string.pattern.base': 'National ID must be exactly 16 digits' }),

  phone: Joi.string().pattern(PHONE_REGEX)
    .messages({ 'string.pattern.base': 'Phone must be a valid Rwanda number' }),

  email: Joi.string().email({ tlds: { allow: false } }).max(255).allow('', null),

  address: Joi.string().min(5).max(500).allow('', null),

  organizationName: Joi.string().pattern(ORG_REGEX).max(200).allow('', null)
    .messages({ 'string.pattern.base': 'Organization name contains invalid characters' }),
}).min(1).messages({ 'object.min': 'At least one field must be provided for update' });

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateCustomerCode() {
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `CUST-${rand}`;
}

function normalizePhone(phone) {
  // Normalize to +250XXXXXXXXX format
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('250')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+250${digits.slice(1)}`;
  return phone;
}

function formatCustomer(c) {
  return {
    id: c.id,
    customerCode: c.customer_code,
    fullName: c.full_name,
    nationalId: c.national_id,
    phone: c.phone,
    email: c.email,
    address: c.address,
    organizationName: c.organization_name,
    isActive: c.is_active,
    extinguisherCount: c.extinguisher_count !== undefined ? parseInt(c.extinguisher_count) : undefined,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST / — Create customer
router.post('/', authenticate, async (req, res) => {
  const { error, value } = customerSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details.map(d => d.message),
    });
  }

  const { fullName, nationalId, phone, email, address, organizationName } = value;

  // Check National ID uniqueness
  if (nationalId) {
    const existing = await db.query('SELECT id FROM customers WHERE national_id = $1', [nationalId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A customer with this National ID already exists' });
    }
  }

  // Check email uniqueness
  if (email) {
    const existing = await db.query('SELECT id FROM customers WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A customer with this email already exists' });
    }
  }

  const normalizedPhone = normalizePhone(phone);

  // Generate unique customer code
  let customerCode;
  for (let i = 0; i < 5; i++) {
    customerCode = generateCustomerCode();
    const check = await db.query('SELECT id FROM customers WHERE customer_code = $1', [customerCode]);
    if (check.rows.length === 0) break;
  }

  const result = await db.query(
    `INSERT INTO customers (customer_code, full_name, national_id, phone, email, address, organization_name, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [customerCode, fullName, nationalId || null, normalizedPhone,
      email ? email.toLowerCase() : null, address || null, organizationName || null, req.user.id]
  );

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, new_values)
     VALUES ($1,$2,'CREATE_CUSTOMER','customer',$3,$4)`,
    [req.user.id, req.user.email, result.rows[0].id, JSON.stringify({ fullName, phone: normalizedPhone, email })]
  );

  res.status(201).json({
    success: true,
    message: 'Customer created successfully',
    data: formatCustomer(result.rows[0]),
  });
});

// GET / — List customers
router.get('/', authenticate, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();

  const countRes = await db.query(
    `SELECT COUNT(*) FROM customers
     WHERE (full_name ILIKE $1 OR customer_code ILIKE $1 OR phone ILIKE $1
            OR organization_name ILIKE $1 OR email ILIKE $1 OR national_id ILIKE $1)`,
    [`%${search}%`]
  );
  const total = parseInt(countRes.rows[0].count);

  const result = await db.query(
    `SELECT c.*, COUNT(e.id) AS extinguisher_count
     FROM customers c
     LEFT JOIN extinguishers e ON e.customer_id = c.id
     WHERE (c.full_name ILIKE $1 OR c.customer_code ILIKE $1 OR c.phone ILIKE $1
            OR c.organization_name ILIKE $1 OR c.email ILIKE $1 OR c.national_id ILIKE $1)
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [`%${search}%`, limit, offset]
  );

  res.json({
    success: true,
    data: result.rows.map(formatCustomer),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /:id — Get single customer
router.get('/:id', authenticate, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid customer ID format' });
  }

  const result = await db.query(
    `SELECT c.*, COUNT(e.id) AS extinguisher_count
     FROM customers c
     LEFT JOIN extinguishers e ON e.customer_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Customer not found' });
  }
  res.json({ success: true, data: formatCustomer(result.rows[0]) });
});

// PUT /:id — Update customer
router.put('/:id', authenticate, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid customer ID format' });
  }

  const { error, value } = updateSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details.map(d => d.message),
    });
  }

  const existing = await db.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Customer not found' });
  }

  const old = existing.rows[0];
  const { fullName, nationalId, phone, email, address, organizationName } = value;

  // Check NID uniqueness if changing
  if (nationalId && nationalId !== old.national_id) {
    const nidCheck = await db.query(
      'SELECT id FROM customers WHERE national_id = $1 AND id != $2',
      [nationalId, req.params.id]
    );
    if (nidCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A customer with this National ID already exists' });
    }
  }

  // Check email uniqueness if changing
  if (email && email.toLowerCase() !== old.email) {
    const emailCheck = await db.query(
      'SELECT id FROM customers WHERE email = $1 AND id != $2',
      [email.toLowerCase(), req.params.id]
    );
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A customer with this email already exists' });
    }
  }

  const normalizedPhone = phone ? normalizePhone(phone) : undefined;

  const result = await db.query(
    `UPDATE customers SET
       full_name = COALESCE($1, full_name),
       national_id = COALESCE($2, national_id),
       phone = COALESCE($3, phone),
       email = COALESCE($4, email),
       address = COALESCE($5, address),
       organization_name = COALESCE($6, organization_name)
     WHERE id = $7 RETURNING *`,
    [fullName, nationalId, normalizedPhone, email ? email.toLowerCase() : undefined,
      address, organizationName, req.params.id]
  );

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, old_values, new_values)
     VALUES ($1,$2,'UPDATE_CUSTOMER','customer',$3,$4,$5)`,
    [req.user.id, req.user.email, req.params.id, JSON.stringify(old), JSON.stringify(value)]
  );

  res.json({ success: true, message: 'Customer updated successfully', data: formatCustomer(result.rows[0]) });
});

// DELETE /:id — Admin only
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid customer ID format' });
  }

  const existing = await db.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Customer not found' });
  }

  // Check if customer has extinguishers
  const extCount = await db.query(
    'SELECT COUNT(*) FROM extinguishers WHERE customer_id = $1',
    [req.params.id]
  );
  if (parseInt(extCount.rows[0].count) > 0) {
    return res.status(409).json({
      success: false,
      message: `Cannot delete customer with ${extCount.rows[0].count} registered extinguisher(s). Remove extinguishers first or deactivate the customer instead.`,
    });
  }

  await db.query('DELETE FROM customers WHERE id = $1', [req.params.id]);

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, old_values)
     VALUES ($1,$2,'DELETE_CUSTOMER','customer',$3,$4)`,
    [req.user.id, req.user.email, req.params.id, JSON.stringify(existing.rows[0])]
  );

  res.json({ success: true, message: 'Customer deleted successfully' });
});

module.exports = router;
