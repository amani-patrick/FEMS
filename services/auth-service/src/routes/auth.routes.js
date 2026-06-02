const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { sendEmail } = require('../mailer');

const router = express.Router();

const ROLES = ['admin', 'technician', 'inspector', 'safety_officer'];

// ── Validation schemas ────────────────────────────────────────────────────────

const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'\-]{2,100}$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_\-#])[A-Za-z\d@$!%*?&_\-#]{8,64}$/;

const registerSchema = Joi.object({
  firstName: Joi.string().pattern(nameRegex).min(2).max(100).required()
    .messages({ 'string.pattern.base': 'First name must contain only letters, spaces, hyphens or apostrophes' }),
  lastName: Joi.string().pattern(nameRegex).min(2).max(100).required()
    .messages({ 'string.pattern.base': 'Last name must contain only letters, spaces, hyphens or apostrophes' }),
  email: Joi.string().email({ tlds: { allow: false } }).max(255).required(),
  password: Joi.string().pattern(passwordRegex).required()
    .messages({ 'string.pattern.base': 'Password must be 8–64 chars with uppercase, lowercase, number and special character (@$!%*?&_-#)' }),
  role: Joi.string().valid(...ROLES).default('technician'),
});

const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().required(),
});

const forgotSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
});

const verifyOtpSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  otp: Joi.string().length(6).pattern(/^\d{6}$/).required()
    .messages({ 'string.pattern.base': 'OTP must be exactly 6 digits' }),
  newPassword: Joi.string().pattern(passwordRegex).required()
    .messages({ 'string.pattern.base': 'Password must be 8–64 chars with uppercase, lowercase, number and special character' }),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().pattern(passwordRegex).required()
    .messages({ 'string.pattern.base': 'Password must be 8–64 chars with uppercase, lowercase, number and special character' }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, firstName: user.first_name, lastName: user.last_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

function formatUser(u) {
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    role: u.role,
    isActive: u.is_active,
    createdAt: u.created_at,
  };
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildOtpEmail(firstName, otp) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f172a;color:#f1f5f9;border-radius:12px;overflow:hidden;">
    <div style="background:#22d3ee;padding:20px;text-align:center;">
      <h1 style="margin:0;color:#0a0f1e;font-size:20px;">🧯 FEMCS — Password Reset</h1>
    </div>
    <div style="padding:30px;">
      <p>Hi <strong>${firstName}</strong>,</p>
      <p>You requested a password reset. Use the OTP below. It expires in <strong>10 minutes</strong>.</p>
      <div style="background:#1e293b;border-radius:10px;padding:24px;text-align:center;margin:24px 0;">
        <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#22d3ee;">${otp}</span>
      </div>
      <p style="color:#94a3b8;font-size:12px;">If you did not request this, ignore this email. Your password will not change.</p>
    </div>
  </div>`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /register
router.post('/register', async (req, res) => {
  const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map(d => d.message) });
  }

  const { firstName, lastName, email, password, role } = value;

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ success: false, message: 'Email already registered' });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const result = await db.query(
    `INSERT INTO users (first_name, last_name, email, password, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, first_name, last_name, email, role, is_active, created_at`,
    [firstName, lastName, email.toLowerCase(), hashedPassword, role]
  );

  const user = result.rows[0];
  const token = signToken(user);

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id)
     VALUES ($1,$2,'REGISTER','user',$1)`,
    [user.id, user.email]
  );

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: { user: formatUser(user), token },
  });
});

// POST /login
router.post('/login', async (req, res) => {
  const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map(d => d.message) });
  }

  const { email, password } = value;
  const result = await db.query(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const user = result.rows[0];

  if (!user.is_active) {
    return res.status(403).json({ success: false, message: 'Account is deactivated. Contact an administrator.' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }sendEmail

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, ip_address)
     VALUES ($1,$2,'LOGIN','user',$3)`,
    [user.id, user.email, req.ip]
  );

  const token = signToken(user);
  res.json({
    success: true,
    message: 'Login successful',
    data: { user: formatUser(user), token },
  });
});

// GET /me
router.get('/me', authenticate, async (req, res) => {
  const result = await db.query(
    'SELECT id, first_name, last_name, email, role, is_active, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  res.json({ success: true, data: formatUser(result.rows[0]) });
});

// POST /forgot-password — send OTP
router.post('/forgot-password', async (req, res) => {
  const { error, value } = forgotSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, message: 'Valid email is required' });
  }

  const { email } = value;
  const result = await db.query(
    'SELECT id, first_name, is_active FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  // Always return success to prevent email enumeration
  if (result.rows.length === 0 || !result.rows[0].is_active) {
    return res.json({ success: true, message: 'If that email exists, an OTP has been sent.' });
  }

  const user = result.rows[0];
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Invalidate any existing OTPs for this email
  await db.query(
    `UPDATE otps SET is_used = true WHERE email = $1 AND purpose = 'password_reset' AND is_used = false`,
    [email.toLowerCase()]
  );

  await db.query(
    `INSERT INTO otps (user_id, email, code, purpose, expires_at)
     VALUES ($1, $2, $3, 'password_reset', $4)`,
    [user.id, email.toLowerCase(), otp, expiresAt]
  );

  let emailSent = false;
  try {
    await sendEmail({
      to: email,
      subject: '[FEMCS] Your Password Reset OTP',
      html: buildOtpEmail(user.first_name, otp),
    });
    emailSent = true;
  } catch (err) {
    console.error('OTP email failed:', err.message);
  }

  // In development, return OTP in response for testing
  const devData = process.env.NODE_ENV === 'development' ? { otp } : {};

  res.json({
    success: true,
    message: 'If that email exists, an OTP has been sent.',
    emailSent,
    ...devData,
  });
});

// POST /reset-password — verify OTP and set new password
router.post('/reset-password', async (req, res) => {
  const { error, value } = verifyOtpSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map(d => d.message) });
  }

  const { email, otp, newPassword } = value;

  const otpResult = await db.query(
    `SELECT * FROM otps
     WHERE email = $1 AND code = $2 AND purpose = 'password_reset'
       AND is_used = false AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase(), otp]
  );

  if (otpResult.rows.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
  }

  const otpRow = otpResult.rows[0];
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, otpRow.user_id]);
  await db.query('UPDATE otps SET is_used = true WHERE id = $1', [otpRow.id]);

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, ip_address)
     VALUES ($1,$2,'PASSWORD_RESET','user',$3)`,
    [otpRow.user_id, email.toLowerCase(), req.ip]
  );

  res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
});

// POST /change-password — authenticated user changes own password
router.post('/change-password', authenticate, async (req, res) => {
  const { error, value } = changePasswordSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: error.details.map(d => d.message) });
  }

  const { currentPassword, newPassword } = value;

  const result = await db.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const valid = await bcrypt.compare(currentPassword, result.rows[0].password);
  if (!valid) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ success: false, message: 'New password must be different from current password' });
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user.id]);

  await db.query(
    `INSERT INTO audit_logs (user_id, user_email, action, entity_type, ip_address)
     VALUES ($1,$2,'CHANGE_PASSWORD','user',$3)`,
    [req.user.id, req.user.email, req.ip]
  );

  res.json({ success: true, message: 'Password changed successfully' });
});

// GET /users — Admin only
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
    data: result.rows.map(formatUser),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// PATCH /users/:id/toggle — Admin only
router.patch('/users/:id/toggle', authenticate, authorize('admin'), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
  }
  const result = await db.query(
    'UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, first_name, last_name, email, role, is_active',
    [req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  const user = result.rows[0];
  res.json({ success: true, message: `User ${user.is_active ? 'activated' : 'deactivated'}`, data: formatUser(user) });
});

// PATCH /users/:id/role — Admin only
router.patch('/users/:id/role', authenticate, authorize('admin'), async (req, res) => {
  const { role } = req.body;
  if (!ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: `Role must be one of: ${ROLES.join(', ')}` });
  }
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot change your own role' });
  }
  const result = await db.query(
    'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, first_name, last_name, email, role, is_active',
    [role, req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  res.json({ success: true, message: 'Role updated', data: formatUser(result.rows[0]) });
});

module.exports = router;
