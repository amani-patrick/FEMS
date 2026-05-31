const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const entrySchema = Joi.object({
  plateNumber: Joi.string()
    .uppercase()
    .min(2)
    .max(20)
    .pattern(/^[A-Z0-9\s\-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Plate number must contain only letters, numbers, spaces or hyphens',
      'any.required': 'Plate number is required',
    }),
  parkingCode: Joi.string().alphanum().uppercase().required().messages({
    'any.required': 'Parking code is required',
  }),
});

function generateTicketNumber() {
  const now = new Date();
  const datePart = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `TKT-${datePart}-${rand}`;
}

function calculateCharge(entryDatetime, exitDatetime, feePerHour) {
  const durationMs = new Date(exitDatetime) - new Date(entryDatetime);
  if (durationMs < 0) return { error: 'Exit time cannot be before entry time' };
  const durationHours = durationMs / (1000 * 60 * 60);
  const charge = parseFloat((durationHours * feePerHour).toFixed(2));
  return {
    durationMs,
    durationHours: parseFloat(durationHours.toFixed(4)),
    durationMinutes: Math.ceil(durationMs / (1000 * 60)),
    chargedAmount: charge,
  };
}

// POST /api/entries - Register car entry
router.post('/', authenticate, async (req, res) => {
  const { error, value } = entrySchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details.map(d => d.message),
    });
  }

  const { plateNumber, parkingCode } = value;

  // Check parking exists and has space
  const parkingRes = await db.query(
    'SELECT * FROM parkings WHERE code = $1 AND is_active = true',
    [parkingCode]
  );
  if (parkingRes.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Parking not found' });
  }

  const parking = parkingRes.rows[0];
  if (parking.available_spaces <= 0) {
    return res.status(400).json({ success: false, message: 'Parking is full. No available spaces.' });
  }

  // Check if car is already parked ANYWHERE (same plate, status=parked)
  const alreadyParked = await db.query(
    `SELECT id FROM car_entries 
     WHERE plate_number = $1 AND status = 'parked'`,
    [plateNumber]
  );
  if (alreadyParked.rows.length > 0) {
    return res.status(409).json({
      success: false,
      message: `Vehicle ${plateNumber} is already parked and has not exited yet.`,
    });
  }

  const ticketNumber = generateTicketNumber();
  const entryDatetime = new Date();

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const entryRes = await client.query(
      `INSERT INTO car_entries (plate_number, parking_code, entry_datetime, ticket_number, attendant_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [plateNumber, parkingCode, entryDatetime, ticketNumber, req.user.id]
    );

    await client.query(
      'UPDATE parkings SET available_spaces = available_spaces - 1 WHERE code = $1',
      [parkingCode]
    );

    await client.query('COMMIT');

    const entry = entryRes.rows[0];
    const ticket = {
      ticketNumber: entry.ticket_number,
      plateNumber: entry.plate_number,
      parkingCode: entry.parking_code,
      parkingName: parking.name,
      parkingLocation: parking.location,
      feePerHour: parseFloat(parking.fee_per_hour),
      entryDatetime: entry.entry_datetime,
      attendantId: entry.attendant_id,
      issuedAt: new Date().toISOString(),
    };

    res.status(201).json({
      success: true,
      message: 'Car entry registered successfully',
      data: {
        entry: {
          id: entry.id,
          plateNumber: entry.plate_number,
          parkingCode: entry.parking_code,
          entryDatetime: entry.entry_datetime,
          exitDatetime: entry.exit_datetime,
          chargedAmount: parseFloat(entry.charged_amount),
          ticketNumber: entry.ticket_number,
          status: entry.status,
        },
        ticket,
        remainingSpaces: parking.available_spaces - 1,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503' && err.constraint === 'car_entries_attendant_id_fkey') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid attendant ID. The user record may have been deleted. Please log in again.' 
      });
    }
    console.error('Entry Service Error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/entries/:id/exit - Register car exit
router.patch('/:id/exit', authenticate, async (req, res) => {
  const exitDatetime = req.body.exitDatetime ? new Date(req.body.exitDatetime) : new Date();

  // Validate exit datetime is not in the future
  if (exitDatetime > new Date()) {
    return res.status(400).json({ success: false, message: 'Exit datetime cannot be in the future' });
  }

  const entryRes = await db.query(
    `SELECT ce.*, p.fee_per_hour, p.name as parking_name, p.location as parking_location
     FROM car_entries ce
     JOIN parkings p ON p.code = ce.parking_code
     WHERE ce.id = $1`,
    [req.params.id]
  );

  if (entryRes.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Car entry not found' });
  }

  const entry = entryRes.rows[0];
  if (entry.status === 'exited') {
    return res.status(400).json({ success: false, message: 'Car has already exited' });
  }

  // Authorization check: Only admin or the attendant who parked the car can mark it as exited
  if (req.user.role !== 'admin' && req.user.id !== entry.attendant_id) {
    return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to mark this car as exited' });
  }

  // Validate exit is after entry
  if (exitDatetime <= new Date(entry.entry_datetime)) {
    return res.status(400).json({
      success: false,
      message: 'Exit time must be after entry time',
      entryTime: entry.entry_datetime,
    });
  }

  const chargeCalc = calculateCharge(entry.entry_datetime, exitDatetime, entry.fee_per_hour);
  if (chargeCalc.error) {
    return res.status(400).json({ success: false, message: chargeCalc.error });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const updated = await client.query(
      `UPDATE car_entries SET exit_datetime = $1, charged_amount = $2, status = 'exited'
       WHERE id = $3 RETURNING *`,
      [exitDatetime, chargeCalc.chargedAmount, req.params.id]
    );

    await client.query(
      'UPDATE parkings SET available_spaces = available_spaces + 1 WHERE code = $1',
      [entry.parking_code]
    );

    await client.query('COMMIT');

    const hours = Math.floor(chargeCalc.durationMinutes / 60);
    const minutes = chargeCalc.durationMinutes % 60;

    const bill = {
      ticketNumber: entry.ticket_number,
      plateNumber: entry.plate_number,
      parkingCode: entry.parking_code,
      parkingName: entry.parking_name,
      parkingLocation: entry.parking_location,
      entryDatetime: entry.entry_datetime,
      exitDatetime,
      duration: `${hours}h ${minutes}m`,
      durationHours: chargeCalc.durationHours,
      feePerHour: parseFloat(entry.fee_per_hour),
      totalCharged: chargeCalc.chargedAmount,
      currency: 'RWF',
      generatedAt: new Date().toISOString(),
    };

    res.json({
      success: true,
      message: 'Car exit registered successfully',
      data: {
        entry: updated.rows[0],
        bill,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/entries - List all entries
router.get('/', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const status = req.query.status || '';
  const parkingCode = req.query.parkingCode || '';

  let whereClause = 'WHERE (ce.plate_number ILIKE $1 OR ce.parking_code ILIKE $1 OR ce.ticket_number ILIKE $1)';
  const params = [`%${search}%`];

  if (req.user.role !== 'admin') {
    params.push(req.user.id);
    whereClause += ` AND ce.attendant_id = $${params.length}`;
  }

  if (status) {
    params.push(status);
    whereClause += ` AND ce.status = $${params.length}`;
  }
  if (parkingCode) {
    params.push(parkingCode.toUpperCase());
    whereClause += ` AND ce.parking_code = $${params.length}`;
  }

  const countRes = await db.query(
    `SELECT COUNT(*) FROM car_entries ce ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0].count);

  params.push(limit, offset);
  const result = await db.query(
    `SELECT ce.*, p.name as parking_name, p.fee_per_hour
     FROM car_entries ce
     JOIN parkings p ON p.code = ce.parking_code
     ${whereClause}
     ORDER BY ce.entry_datetime DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({
    success: true,
    data: result.rows.map(formatEntry),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /api/entries/:id - Get single entry
router.get('/:id', authenticate, async (req, res) => {
  const result = await db.query(
    `SELECT ce.*, p.name as parking_name, p.fee_per_hour, p.location as parking_location
     FROM car_entries ce JOIN parkings p ON p.code = ce.parking_code
     WHERE ce.id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Entry not found' });
  }

  const entry = result.rows[0];
  if (req.user.role !== 'admin' && req.user.id !== entry.attendant_id) {
    return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to view this entry' });
  }

  res.json({ success: true, data: formatEntry(entry) });
});

function formatEntry(e) {
  return {
    id: e.id,
    plateNumber: e.plate_number,
    parkingCode: e.parking_code,
    parkingName: e.parking_name,
    entryDatetime: e.entry_datetime,
    exitDatetime: e.exit_datetime,
    chargedAmount: parseFloat(e.charged_amount),
    ticketNumber: e.ticket_number,
    status: e.status,
    attendantId: e.attendant_id,
    createdAt: e.created_at,
  };
}

module.exports = router;
