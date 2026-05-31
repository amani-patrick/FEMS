const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  firstName: Joi.string().min(2).max(100).required().messages({
    'string.min': 'First name must be at least 2 characters',
    'any.required': 'First name is required',
  }),
  lastName: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Last name must be at least 2 characters',
    'any.required': 'Last name is required',
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must contain uppercase, lowercase, number and special character',
      'any.required': 'Password is required',
    }),
  role: Joi.string().valid('admin', 'parking_tenant').default('parking_tenant'),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
  }),
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details.map(d => d.message),
    });
  }

  const { firstName, lastName, email, password, role } = value;

  // Check if email exists
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ success: false, message: 'Email already registered' });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const result = await db.query(
    `INSERT INTO users (first_name, last_name, email, password, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, first_name, last_name, email, role, created_at`,
    [firstName, lastName, email.toLowerCase(), hashedPassword, role]
  );

  const user = result.rows[0];
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, firstName: user.first_name, lastName: user.last_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email, role: user.role },
      token,
    },
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details.map(d => d.message),
    });
  }

  const { email, password } = value;
  const result = await db.query(
    'SELECT * FROM users WHERE email = $1 AND is_active = true',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const user = result.rows[0];
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, firstName: user.first_name, lastName: user.last_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email, role: user.role },
      token,
    },
  });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const result = await db.query(
    'SELECT id, first_name, last_name, email, role, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  const user = result.rows[0];
  res.json({
    success: true,
    data: { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email, role: user.role, createdAt: user.created_at },
  });
});

// GET /api/auth/users - Admin only
router.get('/users', authenticate, authorize('admin'), async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  const countRes = await db.query(
    `SELECT COUNT(*) FROM users WHERE (first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1)`,
    [`%${search}%`]
  );
  const total = parseInt(countRes.rows[0].count);

  const result = await db.query(
    `SELECT id, first_name, last_name, email, role, is_active, created_at
     FROM users
     WHERE (first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1)
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [`%${search}%`, limit, offset]
  );

  res.json({
    success: true,
    data: result.rows.map(u => ({ id: u.id, firstName: u.first_name, lastName: u.last_name, email: u.email, role: u.role, isActive: u.is_active, createdAt: u.created_at })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// PATCH /api/auth/users/:id/toggle - Admin toggle user status
router.patch('/users/:id/toggle', authenticate, authorize('admin'), async (req, res) => {
  const result = await db.query(
    'UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, is_active',
    [req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  res.json({ success: true, message: `User ${result.rows[0].is_active ? 'activated' : 'deactivated'}`, data: result.rows[0] });
});

module.exports = router;
