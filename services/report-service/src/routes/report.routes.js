const express = require('express');
const { Parser } = require('json2csv');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

function sendCsv(res, data, filename) {
  if (!data.length) {
    return res.status(404).json({ success: false, message: 'No data found for this report' });
  }
  const parser = new Parser({ fields: Object.keys(data[0]) });
  const csv = parser.parse(data);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

function sendJson(res, data, meta = {}) {
  res.json({ success: true, data, ...meta });
}

// GET /expired - Expired extinguishers report
router.get('/expired', authenticate, async (req, res) => {
  const format = req.query.format || 'json';
  const result = await db.query(`
    SELECT e.extinguisher_code, e.serial_number, e.type, e.capacity_liters,
           e.location, e.expiry_date, e.status, e.compliance_status,
           c.full_name AS customer_name, c.organization_name, c.phone, c.email,
           EXTRACT(DAY FROM (NOW() - e.expiry_date::timestamp))::int AS days_overdue
    FROM extinguishers e
    JOIN customers c ON c.id = e.customer_id
    WHERE e.expiry_date < NOW() OR e.status = 'expired'
    ORDER BY e.expiry_date ASC
  `);

  if (format === 'csv') return sendCsv(res, result.rows, 'expired-extinguishers.csv');
  sendJson(res, result.rows, { total: result.rows.length });
});

// GET /expiring-soon - Expiring within N days
router.get('/expiring-soon', authenticate, async (req, res) => {
  const days = parseInt(req.query.days) || 90;
  const format = req.query.format || 'json';

  const result = await db.query(`
    SELECT e.extinguisher_code, e.serial_number, e.type, e.capacity_liters,
           e.location, e.expiry_date, e.compliance_status,
           c.full_name AS customer_name, c.organization_name, c.phone, c.email,
           EXTRACT(DAY FROM (e.expiry_date::timestamp - NOW()))::int AS days_remaining
    FROM extinguishers e
    JOIN customers c ON c.id = e.customer_id
    WHERE e.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '${days} days'
      AND e.status NOT IN ('decommissioned', 'expired')
    ORDER BY e.expiry_date ASC
  `);

  if (format === 'csv') return sendCsv(res, result.rows, `expiring-within-${days}-days.csv`);
  sendJson(res, result.rows, { total: result.rows.length, daysWindow: days });
});

// GET /customers - Customer report
router.get('/customers', authenticate, async (req, res) => {
  const format = req.query.format || 'json';
  const result = await db.query(`
    SELECT c.customer_code, c.full_name, c.national_id, c.phone, c.email,
           c.organization_name, c.address, c.is_active,
           COUNT(e.id) AS total_extinguishers,
           COUNT(e.id) FILTER (WHERE e.status = 'active') AS active,
           COUNT(e.id) FILTER (WHERE e.status = 'expired' OR e.expiry_date < NOW()) AS expired,
           COUNT(e.id) FILTER (WHERE e.compliance_status = 'non_compliant') AS non_compliant,
           c.created_at
    FROM customers c
    LEFT JOIN extinguishers e ON e.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.full_name ASC
  `);

  if (format === 'csv') return sendCsv(res, result.rows, 'customers-report.csv');
  sendJson(res, result.rows, { total: result.rows.length });
});

// GET /inspections - Inspection report
router.get('/inspections', authenticate, async (req, res) => {
  const format = req.query.format || 'json';
  const from = req.query.from || '';
  const to = req.query.to || '';

  let where = 'WHERE 1=1';
  const params = [];
  if (from) { params.push(from); where += ` AND i.inspection_date >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND i.inspection_date <= $${params.length}`; }

  const result = await db.query(`
    SELECT i.inspection_date, i.inspector_name, i.status, i.findings, i.next_inspection_date,
           e.extinguisher_code, e.serial_number, e.type, e.location,
           c.full_name AS customer_name, c.organization_name
    FROM inspections i
    JOIN extinguishers e ON e.id = i.extinguisher_id
    JOIN customers c ON c.id = e.customer_id
    ${where}
    ORDER BY i.inspection_date DESC
  `, params);

  if (format === 'csv') return sendCsv(res, result.rows, 'inspections-report.csv');
  sendJson(res, result.rows, { total: result.rows.length });
});

// GET /maintenance - Maintenance report
router.get('/maintenance', authenticate, async (req, res) => {
  const format = req.query.format || 'json';
  const from = req.query.from || '';
  const to = req.query.to || '';

  let where = 'WHERE 1=1';
  const params = [];
  if (from) { params.push(from); where += ` AND m.service_date >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND m.service_date <= $${params.length}`; }

  const result = await db.query(`
    SELECT m.service_date, m.service_company, m.technician_name, m.status,
           m.cost, m.next_service_date, m.description,
           e.extinguisher_code, e.serial_number, e.type, e.location,
           c.full_name AS customer_name, c.organization_name
    FROM maintenance m
    JOIN extinguishers e ON e.id = m.extinguisher_id
    JOIN customers c ON c.id = e.customer_id
    ${where}
    ORDER BY m.service_date DESC
  `, params);

  if (format === 'csv') return sendCsv(res, result.rows, 'maintenance-report.csv');
  sendJson(res, result.rows, { total: result.rows.length });
});

// GET /compliance - Compliance report
router.get('/compliance', authenticate, async (req, res) => {
  const format = req.query.format || 'json';
  const result = await db.query(`
    SELECT e.extinguisher_code, e.serial_number, e.type, e.location,
           e.expiry_date, e.last_inspection_date, e.next_inspection_date,
           e.status, e.compliance_status,
           c.full_name AS customer_name, c.organization_name, c.phone, c.email,
           EXTRACT(DAY FROM (e.expiry_date::timestamp - NOW()))::int AS days_to_expiry,
           COALESCE(MAX(esc.stage), 0) AS escalation_stage
    FROM extinguishers e
    JOIN customers c ON c.id = e.customer_id
    LEFT JOIN escalations esc ON esc.extinguisher_id = e.id AND esc.status = 'open'
    GROUP BY e.id, c.id
    ORDER BY e.compliance_status DESC, e.expiry_date ASC
  `);

  if (format === 'csv') return sendCsv(res, result.rows, 'compliance-report.csv');
  sendJson(res, result.rows, { total: result.rows.length });
});

// GET /audit - Audit trail
router.get('/audit', authenticate, authorize('admin'), async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const action = req.query.action || '';
  const entityType = req.query.entityType || '';

  let where = 'WHERE 1=1';
  const params = [];
  if (action) { params.push(`%${action}%`); where += ` AND al.action ILIKE $${params.length}`; }
  if (entityType) { params.push(entityType); where += ` AND al.entity_type = $${params.length}`; }

  const countRes = await db.query(`SELECT COUNT(*) FROM audit_logs al ${where}`, params);
  const total = parseInt(countRes.rows[0].count);

  params.push(limit, offset);
  const result = await db.query(`
    SELECT al.*, u.first_name, u.last_name
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ${where}
    ORDER BY al.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

  res.json({
    success: true,
    data: result.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /summary - Dashboard summary
router.get('/summary', authenticate, async (req, res) => {
  const [extStats, custStats, inspStats, maintStats] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'expired' OR expiry_date < NOW()) AS expired,
        COUNT(*) FILTER (WHERE status = 'serviced') AS serviced,
        COUNT(*) FILTER (WHERE compliance_status = 'non_compliant') AS non_compliant,
        COUNT(*) FILTER (WHERE compliance_status = 'critical') AS critical,
        COUNT(*) FILTER (WHERE compliance_status = 'warning') AS warning,
        COUNT(*) FILTER (WHERE expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days') AS expiring_30d,
        COUNT(*) FILTER (WHERE expiry_date BETWEEN NOW() AND NOW() + INTERVAL '90 days') AS expiring_90d
      FROM extinguishers
    `),
    db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active FROM customers`),
    db.query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'Passed') AS passed,
             COUNT(*) FILTER (WHERE status = 'Failed') AS failed,
             COUNT(*) FILTER (WHERE status = 'Requires Service') AS requires_service
      FROM inspections WHERE inspection_date >= NOW() - INTERVAL '30 days'
    `),
    db.query(`
      SELECT COUNT(*) AS total, COALESCE(SUM(cost), 0) AS total_cost
      FROM maintenance WHERE service_date >= NOW() - INTERVAL '30 days'
    `),
  ]);

  res.json({
    success: true,
    data: {
      extinguishers: extStats.rows[0],
      customers: custStats.rows[0],
      inspections_last30d: inspStats.rows[0],
      maintenance_last30d: maintStats.rows[0],
    },
  });
});

module.exports = router;
